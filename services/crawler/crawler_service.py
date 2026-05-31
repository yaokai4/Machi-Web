from __future__ import annotations

import email.utils
import hashlib
import html
import ipaddress
import os
import re
import socket
import time
import urllib.error
import urllib.request
import urllib.robotparser
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
from typing import Any
from urllib.parse import urljoin, urlparse


USER_AGENT = (
    os.environ.get("NEWS_CRAWLER_USER_AGENT")
    or os.environ.get("KAIX_NEWS_DESK_USER_AGENT")
    or "MachiBot/1.0 (+https://machicity.com)"
)
DEFAULT_TIMEOUT_MS = int(os.environ.get("NEWS_CRAWLER_DEFAULT_TIMEOUT_MS") or "15000")
DEFAULT_MAX_ITEMS = int(os.environ.get("NEWS_CRAWLER_DEFAULT_MAX_ITEMS") or "30")
RESPECT_ROBOTS = (os.environ.get("NEWS_CRAWLER_RESPECT_ROBOTS") or "true").lower() != "false"
MAX_RESPONSE_BYTES = 512_000


class CrawlerError(Exception):
    def __init__(self, message: str, code: str = "crawler_error", status: str = "failed") -> None:
        super().__init__(message)
        self.code = code
        self.status = status


class CrawlerSkipped(CrawlerError):
    def __init__(self, message: str, code: str = "skipped") -> None:
        super().__init__(message, code=code, status="skipped")


@dataclass
class CrawlItem:
    title: str
    summary: str
    url: str
    published_at: str | None = None
    external_id: str = ""
    raw_metadata: dict[str, Any] = field(default_factory=dict)
    hash_key: str = ""


@dataclass
class CrawlResult:
    source_id: str
    source_name: str
    status: str
    items: list[CrawlItem]
    fetched_count: int = 0
    error_count: int = 0
    error_message: str = ""
    skipped_reason: str = ""
    robots_status: str = ""
    http_status: int | None = None
    parser_status: str = ""
    source_url: str = ""
    duration_ms: int = 0


@dataclass
class FetchResponse:
    text: str
    http_status: int | None
    robots_status: str


def clean_text(raw: Any, cap: int) -> str:
    text = html.unescape(str(raw or ""))
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:cap]


def parse_date(raw: str | None) -> str | None:
    text = (raw or "").strip()
    if not text:
        return None
    try:
        parsed = email.utils.parsedate_to_datetime(text)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc).isoformat()
    except Exception:
        pass
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc).isoformat()
    except Exception:
        return None


def parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except Exception:
        return None


def normalize_allowed_domain(source: dict[str, Any]) -> str:
    explicit = str(source.get("allowed_domain") or "").strip().lower()
    if explicit:
        return explicit.replace("https://", "").replace("http://", "").strip("/").split("/")[0]
    for key in ("source_url", "homepage_url"):
        parsed = urlparse(str(source.get(key) or ""))
        if parsed.netloc:
            return parsed.netloc.lower()
    return ""


def _domain_allowed(url: str, allowed_domain: str) -> bool:
    if not allowed_domain:
        return True
    parsed = urlparse(url)
    host = parsed.netloc.lower()
    return host == allowed_domain or host.endswith(f".{allowed_domain}")


def _hash_item(source_id: str, url: str, title: str, published_at: str | None) -> str:
    raw = f"{source_id}|{url or ''}|{title or ''}|{published_at or ''}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _is_public_host(host: str) -> bool:
    """SSRF guard: True only if `host` resolves entirely to public IPs.
    Blocks loopback / private / link-local (incl. cloud metadata
    169.254.169.254) / reserved / multicast addresses. Best-effort: there's
    a residual DNS-rebinding TOCTOU window, but this stops the obvious
    internal-address fetches."""
    host = (host or "").strip().strip("[]")
    if not host:
        return False
    try:
        infos = socket.getaddrinfo(host, None)
    except OSError:
        return False
    if not infos:
        return False
    for info in infos:
        ip = str(info[4][0]).split("%", 1)[0]  # drop IPv6 scope id
        try:
            addr = ipaddress.ip_address(ip)
        except ValueError:
            return False
        if (addr.is_private or addr.is_loopback or addr.is_link_local
                or addr.is_reserved or addr.is_multicast or addr.is_unspecified):
            return False
    return True


class _GuardedRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Re-validate every redirect hop so an allowed-domain URL can't 30x
    us into an internal/private address (SSRF via redirect)."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):  # type: ignore[override]
        parsed = urlparse(newurl)
        if parsed.scheme not in ("http", "https"):
            raise CrawlerError(f"blocked non-http redirect: {newurl}", "blocked_redirect")
        if not _is_public_host(parsed.hostname or ""):
            raise CrawlerError(f"blocked redirect to non-public host: {newurl}", "blocked_redirect")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def _opener() -> urllib.request.OpenerDirector:
    return urllib.request.build_opener(_GuardedRedirectHandler())


def _robots_can_fetch(target_url: str, timeout: float) -> tuple[bool, str]:
    if not RESPECT_ROBOTS:
        return True, ""
    parsed = urlparse(target_url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        return False, "invalid_url"
    robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
    parser = urllib.robotparser.RobotFileParser()
    try:
        req = urllib.request.Request(robots_url, headers={"User-Agent": USER_AGENT})
        with _opener().open(req, timeout=min(timeout, 5.0)) as resp:
            body = resp.read(200_000).decode("utf-8", "ignore").splitlines()
        parser.parse(body)
        if not parser.can_fetch(USER_AGENT, target_url):
            return False, "robots_disallowed"
    except Exception:
        return True, ""
    return True, ""


def _fetch_public_text(url: str, timeout_ms: int, retries: int = 2) -> FetchResponse:
    timeout = max(1.0, timeout_ms / 1000)
    if not _is_public_host(urlparse(url).hostname or ""):
        raise CrawlerError(f"refusing to fetch non-public/internal host: {url}", "blocked_host")
    allowed, reason = _robots_can_fetch(url, timeout)
    if not allowed:
        raise CrawlerSkipped(f"robots.txt disallows {url}", reason)
    robots_status = reason or "allowed"
    last_error = ""
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": USER_AGENT,
                "Accept": "application/rss+xml, application/atom+xml, text/xml, text/html;q=0.8, */*;q=0.5",
            })
            with _opener().open(req, timeout=timeout) as resp:
                status = getattr(resp, "status", None) or getattr(resp, "code", None)
                raw = resp.read(MAX_RESPONSE_BYTES + 1)
            if len(raw) > MAX_RESPONSE_BYTES:
                raw = raw[:MAX_RESPONSE_BYTES]
            return FetchResponse(text=raw.decode("utf-8", "ignore"), http_status=int(status or 0) or None, robots_status=robots_status)
        except OSError as exc:
            # OSError covers urllib URLError/HTTPError, socket.timeout (which
            # is NOT a TimeoutError on Python 3.9), ssl.SSLError and connection
            # resets — all retryable. (A blocked-redirect CrawlerError is not
            # an OSError, so it propagates immediately instead of retrying.)
            last_error = str(exc)
        if attempt < retries:
            time.sleep(0.35 * (attempt + 1))
    raise CrawlerError(f"source fetch failed: {last_error}", "source_fetch_failed")


def _local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1].lower()


def _child_text(node: ET.Element, names: set[str]) -> str:
    for child in list(node):
        if _local_name(child.tag) in names:
            return "".join(child.itertext()).strip()
    return ""


def _atom_link(node: ET.Element, base_url: str) -> str:
    for child in list(node):
        if _local_name(child.tag) != "link":
            continue
        rel = (child.attrib.get("rel") or "alternate").lower()
        href = child.attrib.get("href") or child.text or ""
        if href and rel in ("alternate", ""):
            return urljoin(base_url, href.strip())
    return ""


def parse_rss_items(xml_text: str, source_url: str, allowed_domain: str, max_items: int, source_id: str) -> list[CrawlItem]:
    try:
        root = ET.fromstring(xml_text.encode("utf-8"))
    except ET.ParseError as exc:
        raise CrawlerError(f"invalid feed XML: {exc}", "invalid_feed_xml")
    nodes = [node for node in root.iter() if _local_name(node.tag) in ("item", "entry")]
    items: list[CrawlItem] = []
    for node in nodes[:max_items]:
        try:
            is_atom = _local_name(node.tag) == "entry"
            title = clean_text(_child_text(node, {"title"}), 300)
            if not title:
                continue
            link = _atom_link(node, source_url) if is_atom else _child_text(node, {"link"})
            guid = clean_text(_child_text(node, {"guid", "id"}), 300)
            original_url = urljoin(source_url, (link or guid or source_url).strip())
            if not _domain_allowed(original_url, allowed_domain):
                continue
            summary = clean_text(_child_text(node, {"description", "summary", "subtitle"}), 500)
            published_at = parse_date(_child_text(node, {"pubdate", "published", "updated", "date"}))
            items.append(CrawlItem(
                title=title,
                summary=summary,
                url=original_url,
                published_at=published_at,
                external_id=guid or clean_text(link, 300),
                raw_metadata={"kind": "rss_item", "guid": guid},
                hash_key=_hash_item(source_id, original_url, title, published_at),
            ))
        except Exception:
            continue
    return items


class _MetadataParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.in_title = False
        self.title_parts: list[str] = []
        self.meta: dict[str, str] = {}
        self.canonical = ""

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr = {k.lower(): (v or "") for k, v in attrs}
        if tag.lower() == "title":
            self.in_title = True
        elif tag.lower() == "meta":
            key = (attr.get("property") or attr.get("name") or "").lower()
            content = attr.get("content") or ""
            if key and content:
                self.meta[key] = content
        elif tag.lower() == "link" and "canonical" in (attr.get("rel") or "").lower():
            self.canonical = attr.get("href") or self.canonical

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "title":
            self.in_title = False

    def handle_data(self, data: str) -> None:
        if self.in_title:
            self.title_parts.append(data)


def parse_webpage_metadata(html_text: str, source_url: str, allowed_domain: str, source_id: str) -> list[CrawlItem]:
    parser = _MetadataParser()
    parser.feed(html_text[:MAX_RESPONSE_BYTES])
    title = clean_text(parser.meta.get("og:title") or " ".join(parser.title_parts), 300)
    if not title:
        return []
    canonical = urljoin(source_url, parser.canonical or source_url)
    if not _domain_allowed(canonical, allowed_domain):
        raise CrawlerSkipped(f"canonical URL is outside allowed domain: {canonical}", "domain_disallowed")
    summary = clean_text(parser.meta.get("og:description") or parser.meta.get("description") or "", 500)
    published_at = parse_date(
        parser.meta.get("article:published_time")
        or parser.meta.get("published_time")
        or parser.meta.get("date")
        or parser.meta.get("dc.date")
    )
    metadata = {
        "kind": "webpage_metadata",
        "canonical": canonical,
        "meta_keys": sorted(parser.meta.keys())[:24],
    }
    return [CrawlItem(
        title=title,
        summary=summary,
        url=canonical,
        published_at=published_at,
        external_id=canonical,
        raw_metadata=metadata,
        hash_key=_hash_item(source_id, canonical, title, published_at),
    )]


@dataclass
class _HtmlNode:
    tag: str
    attrs: dict[str, str]
    parent: "_HtmlNode | None" = None
    children: list["_HtmlNode"] = field(default_factory=list)
    text_parts: list[str] = field(default_factory=list)

    def text(self) -> str:
        parts = list(self.text_parts)
        for child in self.children:
            parts.append(child.text())
        return clean_text(" ".join(parts), 1000)


class _TreeParser(HTMLParser):
    VOID_TAGS = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}

    def __init__(self) -> None:
        super().__init__()
        self.root = _HtmlNode("document", {})
        self.stack: list[_HtmlNode] = [self.root]

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        node = _HtmlNode(tag.lower(), {k.lower(): (v or "") for k, v in attrs}, self.stack[-1])
        self.stack[-1].children.append(node)
        if tag.lower() not in self.VOID_TAGS:
            self.stack.append(node)

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        for idx in range(len(self.stack) - 1, 0, -1):
            if self.stack[idx].tag == tag:
                del self.stack[idx:]
                break

    def handle_data(self, data: str) -> None:
        if data.strip():
            self.stack[-1].text_parts.append(data)


def _selector_token_match(node: _HtmlNode, token: str) -> bool:
    token = token.strip()
    if not token or token == "*":
        return True
    attr_name = attr_value = ""
    if "[" in token and token.endswith("]"):
        token, attr = token.split("[", 1)
        attr = attr[:-1]
        if "=" in attr:
            attr_name, attr_value = attr.split("=", 1)
            attr_value = attr_value.strip("'\"")
        else:
            attr_name = attr
    tag = ""
    ident = ""
    classes: list[str] = []
    buf = ""
    mode = "tag"
    for ch in token:
        if ch == "#":
            if mode == "tag":
                tag = buf
            elif mode == "class":
                classes.append(buf)
            buf = ""
            mode = "id"
        elif ch == ".":
            if mode == "tag":
                tag = buf
            elif mode == "id":
                ident = buf
            elif mode == "class":
                classes.append(buf)
            buf = ""
            mode = "class"
        else:
            buf += ch
    if mode == "tag":
        tag = buf
    elif mode == "id":
        ident = buf
    elif mode == "class":
        classes.append(buf)
    if tag and tag.lower() != node.tag:
        return False
    if ident and node.attrs.get("id") != ident:
        return False
    class_set = set((node.attrs.get("class") or "").split())
    if any(cls and cls not in class_set for cls in classes):
        return False
    if attr_name:
        actual = node.attrs.get(attr_name.lower())
        if actual is None:
            return False
        if attr_value and actual != attr_value:
            return False
    return True


def _iter_nodes(node: _HtmlNode) -> list[_HtmlNode]:
    out: list[_HtmlNode] = []
    for child in node.children:
        out.append(child)
        out.extend(_iter_nodes(child))
    return out


def _select_nodes(root: _HtmlNode, selector: str) -> list[_HtmlNode]:
    tokens = [tok for tok in re.split(r"\s+", selector.strip()) if tok]
    if not tokens:
        return []
    current = [root]
    for token in tokens:
        next_nodes: list[_HtmlNode] = []
        for node in current:
            for candidate in _iter_nodes(node):
                if _selector_token_match(candidate, token):
                    next_nodes.append(candidate)
        current = next_nodes
    return current


def _first_selected_text(root: _HtmlNode, selector: str, fallback: _HtmlNode | None = None) -> str:
    nodes = _select_nodes(root, selector) if selector else []
    if nodes:
        return nodes[0].text()
    return fallback.text() if fallback else ""


def _first_selected_url(root: _HtmlNode, selector: str, source_url: str, fallback: _HtmlNode | None = None) -> str:
    nodes = _select_nodes(root, selector) if selector else []
    if not nodes and fallback:
        if fallback.tag == "a":
            nodes = [fallback]
        else:
            nodes = _select_nodes(fallback, "a")
    if not nodes:
        return ""
    node = nodes[0]
    href = node.attrs.get("href") or node.attrs.get("data-href") or ""
    return urljoin(source_url, href.strip()) if href else ""


def parse_html_list_items(html_text: str, source_url: str, allowed_domain: str, max_items: int, source_id: str, selectors: dict[str, str]) -> list[CrawlItem]:
    item_selector = (selectors.get("item_selector") or selectors.get("list_selector") or "").strip()
    title_selector = (selectors.get("title_selector") or "").strip()
    link_selector = (selectors.get("link_selector") or title_selector or "a").strip()
    if not item_selector or not title_selector:
        raise CrawlerError("html_list requires item_selector/list_selector and title_selector", "selector_required")
    parser = _TreeParser()
    parser.feed(html_text[:MAX_RESPONSE_BYTES])
    item_nodes = _select_nodes(parser.root, item_selector)
    if not item_nodes:
        raise CrawlerError(f"html_list selector matched no items: {item_selector}", "selector_no_items", status="partial_success")
    items: list[CrawlItem] = []
    for node in item_nodes[:max_items]:
        title = clean_text(_first_selected_text(node, title_selector, node), 300)
        if not title:
            continue
        original_url = _first_selected_url(node, link_selector, source_url, node) or source_url
        if not _domain_allowed(original_url, allowed_domain):
            continue
        summary = clean_text(_first_selected_text(node, selectors.get("summary_selector") or "", None), 500)
        published_at = parse_date(_first_selected_text(node, selectors.get("date_selector") or "", None))
        items.append(CrawlItem(
            title=title,
            summary=summary,
            url=original_url,
            published_at=published_at,
            external_id=original_url,
            raw_metadata={"kind": "html_list_item", "selectors": selectors},
            hash_key=_hash_item(source_id, original_url, title, published_at),
        ))
    if not items:
        raise CrawlerError("html_list parsed zero usable items", "selector_no_usable_items", status="partial_success")
    return items


def crawl_source(source: dict[str, Any], *, force: bool = False) -> CrawlResult:
    started = time.monotonic()
    source_id = str(source.get("id") or "")
    source_name = str(source.get("name") or "")
    source_type = str(source.get("source_type") or "manual").strip().lower()
    strategy = str(source.get("crawl_strategy") or source_type or "manual").strip().lower()
    source_url = str(source.get("source_url") or "").strip()
    allowed_domain = normalize_allowed_domain(source)
    timeout_ms = int(source.get("request_timeout_ms") or DEFAULT_TIMEOUT_MS)
    max_items = max(1, min(int(source.get("max_items_per_run") or DEFAULT_MAX_ITEMS), 50))

    if not force:
        last = parse_iso(source.get("last_fetched_at"))
        interval = max(30, int(source.get("crawl_interval_minutes") or 120))
        if last and datetime.now(timezone.utc) - last < timedelta(minutes=interval):
            raise CrawlerSkipped("crawl interval has not elapsed", "crawl_interval")

    if source_type == "manual" or strategy == "manual":
        return CrawlResult(source_id=source_id, source_name=source_name, status="skipped", items=[], skipped_reason="manual_source", source_url=source_url, duration_ms=int((time.monotonic() - started) * 1000))
    if not source_url:
        raise CrawlerError("source_url is required", "missing_source_url")
    parsed = urlparse(source_url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise CrawlerError("source_url must be a public http(s) URL", "invalid_source_url")
    if not _domain_allowed(source_url, allowed_domain):
        raise CrawlerError("source_url is outside allowed_domain", "domain_disallowed")

    fetch = _fetch_public_text(source_url, timeout_ms=timeout_ms)
    parser_status = ""
    if source_type == "rss" or strategy == "rss":
        items = parse_rss_items(fetch.text, source_url, allowed_domain, max_items, source_id)
        parser_status = "rss_ok" if items else "rss_zero_items"
    elif source_type == "html_list" or strategy == "html_list":
        items = parse_html_list_items(fetch.text, source_url, allowed_domain, max_items, source_id, {
            "list_selector": str(source.get("list_selector") or ""),
            "item_selector": str(source.get("item_selector") or ""),
            "title_selector": str(source.get("title_selector") or ""),
            "link_selector": str(source.get("link_selector") or ""),
            "summary_selector": str(source.get("summary_selector") or ""),
            "date_selector": str(source.get("date_selector") or ""),
        })
        parser_status = "html_list_ok" if items else "html_list_zero_items"
    else:
        items = parse_webpage_metadata(fetch.text, source_url, allowed_domain, source_id)
        parser_status = "metadata_ok" if items else "metadata_zero_items"
    status = "success" if items else "partial_success"
    return CrawlResult(
        source_id=source_id,
        source_name=source_name,
        status=status,
        items=items,
        fetched_count=len(items),
        robots_status=fetch.robots_status,
        http_status=fetch.http_status,
        parser_status=parser_status,
        source_url=source_url,
        duration_ms=int((time.monotonic() - started) * 1000),
    )
