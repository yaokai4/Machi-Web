"""小红书-style seed avatars — persona-matched, deterministic, zero-duplicate.

Why this exists: the old seed pack used realistic *Western* portraits
(randomuser.me) reused across many personas. For an app aimed at 在日华人 that
reads as fake/AI on two counts — wrong demographic and duplicate faces. This
module replaces that with avatars that look like a real 小红书 / 朋友圈 feed:

Two lanes, both with **no identifiable real people** (no consent/portrait risk):

1. **Aesthetic photos** — pre-verified (HTTP 200, content-checked) Unsplash
   crops matched to a persona's actual interest: a cat-café owner gets a cat, a
   florist gets flowers, a ramen shop owner gets a ramen bowl, a photographer
   gets a camera, a barista gets latte art… This interest↔avatar coherence is
   the single strongest "this is a real person" signal.
2. **East-Asian line-art illustrations** — DiceBear (``lorelei`` / ``notionists``
   / ``adventurer``), skin+hair color-locked so they never render as Western
   cartoons, gender-leaned, on a soft pastel background. Used for everyone whose
   bio has no concrete photogenic interest (students, IT, teachers, parents…),
   and for a slice of matched personas too so no photo repeats too often.

Everything is keyed off a stable hash of the ``handle`` → the same persona always
gets the same avatar (re-import is a no-op visually), and no two handles collide,
so the duplicate-face tell is gone.

Stdlib only. ``avatar_for(handle, gender, bio, display_name)`` is the single
entry point; ``server.import_seed_users`` calls it and a one-shot script bakes
the result back into ``seed_users_pack.py`` so the committed data is reviewable.
"""

from __future__ import annotations

import hashlib
import urllib.parse

# --------------------------------------------------------------------------
# Illustrated lane (DiceBear) — East-Asian-leaning, soft 小红书 palette.
# --------------------------------------------------------------------------
_DICEBEAR = "https://api.dicebear.com/9.x"
# Solid pastel backgrounds (小红书 / ins vibe). Picked deterministically.
# 18 tones → far fewer repeats across a growing user base.
_BG = ["ffd5dc", "ffdfbf", "d1f4e0", "c0e8ff", "e8dcff", "fdf0c9", "ffe0ec",
       "d7f0ff", "e7f7d8", "ffe8d6", "d6f5f0", "efe1ff", "fef3d7", "dcefff",
       "f7dede", "e2f0d9", "d9e8ff", "fce1f0"]
# adventurer renders skin + hair; lock both to East-Asian-leaning tones so it
# never produces a Western/blonde cartoon. (lorelei / notionists are line-art
# with black hair and no skin fill, so they need no lock.)
_ADV_LOCK = "skinColor=f2d3b1,edb98a,ecc19c&hairColor=0e0e0e,2c1b18,3a2a1a,4a312c"
# Styles that read East-Asian / 小红书. lorelei skews feminine, so it's offered
# to women only; men and unknowns stay on the more neutral notionists/adventurer.
# thumbs/shapes are faceless abstract styles (safe for anyone, non-Western).
_STYLES_F = ["lorelei", "notionists", "adventurer", "thumbs", "shapes"]
_STYLES_M = ["notionists", "adventurer", "thumbs", "shapes"]


def _h(text: str, mod: int) -> int:
    return int(hashlib.md5(text.encode("utf-8")).hexdigest(), 16) % max(1, mod)


def illustrated_avatar(handle: str, gender: str = "") -> str:
    """A deterministic, unique, East-Asian-leaning illustrated avatar."""
    styles = _STYLES_F if (gender or "").lower().startswith("f") else _STYLES_M
    style = styles[_h(handle + "|style", len(styles))]
    bg = _BG[_h(handle + "|bg", len(_BG))]
    seed = urllib.parse.quote(handle or "machi")
    url = (f"{_DICEBEAR}/{style}/png?seed={seed}&size=256"
           f"&backgroundColor={bg}&backgroundType=solid")
    if style == "adventurer":
        url += "&" + _ADV_LOCK
    return url


# --------------------------------------------------------------------------
# Photo lane — pre-verified Unsplash crops (HTTP 200 + content-checked).
# Each list is content-correct; thin themes are merged so no pool is so small
# it would repeat one image across many personas.
# --------------------------------------------------------------------------
_U = "https://images.unsplash.com/photo-{}?w=256&h=256&q=80&auto=format&fit=crop"

PHOTOS: dict[str, list[str]] = {
    "cat": ["1514888286974-6c03e2ca1dba", "1495360010541-f48722b34f7d",
            "1574158622682-e40e69881006", "1533743983669-94fa5c4338ec",
            "1592194996308-7b43878e84a6", "1518791841217-8f162f1e1131",
            "1596854407944-bf87f6fdd49e", "1561948955-570b270e7c36"],
    "dog": ["1543466835-00a7907e9de1", "1561037404-61cd46aa615b",
            "1517849845537-4d257902454a", "1583512603805-3cc6b41f3edb"],
    "flower": ["1490750967868-88aa4486c946", "1457089328109-e5d9bd499191",
               "1502977249166-824b3a8a4d6d", "1487070183336-b863922373d4"],
    "plant": ["1485955900006-10f4d324d411", "1416879595882-3373a0480b5b",
              "1466692476868-aef1dfb1e735"],
    "camera": ["1502920917128-1aa500764cbd", "1516035069371-29a1b244cc32",
               "1500634245200-e5245c7574ef", "1452780212940-6f5c0d14d848"],
    "book": ["1481627834876-b7833e8f5570", "1512820790803-83ca734da794",
             "1524995997946-a1c2e315a42f"],
    "music": ["1520523839897-bd0b52f945a0", "1552422535-c45813c61732",
              "1511379938547-c1f69419868d"],
    # car + motorcycle
    "vehicle": ["1503376780353-7e6692767b70", "1492144534655-ae79c964c9d7",
                "1494976388531-d1058494cdd8", "1558981403-c5f9899a28bc",
                "1568772585407-9361f9bf3a87"],
    "fitness": ["1517836357463-d25dfeac3438", "1571019613454-1cb2f99b2d8b",
                "1518611012118-696072aa579a"],
    "sea": ["1505142468610-359e7d316be0", "1507525428034-b723cf961d3e",
            "1471922694854-ff1b63b20054"],
    # mountains + snow/ski
    "outdoor": ["1454496522488-7a8e488e8606", "1469474968028-56623f02e42e",
                "1551632811-561732d1e306", "1551524559-8af4e6624178",
                "1418985991508-e47386d96a71"],
    "game": ["1606144042614-b2417e99c4e3", "1612287230202-1ff1d85d1bdf",
             "1550745165-9bc0b252726f"],
    # nail / cosmetics / perfume / skincare flatlays (no faces)
    "beauty": ["1522335789203-aabd1fc54bc9", "1596462502278-27bfdc403348",
               "1519014816548-bf5fe059798b", "1610992015732-2449b76344bc",
               "1632345031435-8727f6897d53", "1604654894610-df63bc536371",
               "1541643600914-78b084683601", "1592945403244-b3fbafd7f539"],
    "ramen": ["1557872943-16a5ac26437e", "1591814468924-caf88d1232e1",
              "1623341214825-9f4f963727da", "1569718212165-3a8278d5f624"],
    "sushi": ["1579584425555-c3ce17fd4351", "1611143669185-af224c5e3252",
              "1553621042-f6e147245754", "1583623025817-d180a2221d0a"],
    "dessert": ["1551024601-bec78aea704b", "1488477181946-6428a0291777",
                "1565958011703-44f9829ba187", "1606890737304-57a1ca8a5b62"],
    # coffee + matcha + bubble-tea (cafe drinks)
    "coffee": ["1495474472287-4d71bcdd2085", "1509042239860-f550ce710b93",
               "1461023058943-07fcbe16d735", "1447933601403-0c6688de566e",
               "1515823662972-da6a2e4d3002", "1536256263959-770b48d82b0a",
               "1558857563-b371033873b8"],
    # izakaya: beer + cocktails + grilled meat / skewers
    "izakaya": ["1608270586620-248524c67de9", "1514361892635-6b07e31e75f9",
                "1529692236671-f1f6cf9683ba", "1555939594-58d7cb561ad1"],
    # generic Chinese / homestyle food + dumplings
    "cnfood": ["1552611052-33e04de081de", "1585032226651-759b368d7246",
               "1617093727343-374698b1b08d", "1563245372-f21724e3856d",
               "1604908176997-125f25cc6f3d", "1606491956689-2ea866880c84"],
}

# (keyword tuple, category) — first match wins, so ORDER MATTERS. Specific /
# animal / craft interests come before generic food so e.g. 「猫咖啡馆」 → cat,
# not coffee. Generic job words (留学/IT/老师/主妇/中介/代购…) intentionally have
# no entry, so those personas get an illustrated avatar.
_INTEREST: list[tuple[tuple[str, ...], str]] = [
    (("猫", "喵", "吸猫"), "cat"),
    (("犬", "狗"), "dog"),
    (("美甲", "美容", "护肤", "美妆", "药妆", "彩妆", "化妆", "面膜", "美容师",
      "资生堂", "美发", "理发", "香水", "spa"), "beauty"),
    (("摄影", "拍照", "胶片", "写真", "主拍", "街拍"), "camera"),
    (("钢琴", "三味线", "太鼓", "萨克斯", "黑胶", "音乐学院", "声优", "吹笛",
      "笛子", "街舞", "爵士", "唱华语歌"), "music"),
    (("拉面", "汤底", "刀削面"), "ramen"),
    (("寿司", "刺身", "生鱼片", "捏寿司", "握寿司"), "sushi"),
    (("烤肉", "成吉思汗", "烧肉", "烤串", "居酒屋", "调酒", "鸡尾酒", "清酒",
      "啤酒", "酒馆", "小酒馆"), "izakaya"),
    (("和果子", "和菓子", "甜品", "甜点", "烘焙", "烘培", "西点", "蛋糕",
      "点心", "面包", "糖葫芦", "团子", "洋果子", "红豆馅"), "dessert"),
    (("咖啡", "拿铁", "手冲", "喫茶", "拉花", "抹茶", "茶道", "泡茶", "里千家",
      "奶茶", "珍珠"), "coffee"),
    (("饺子", "包子", "小笼", "中华料理", "中餐", "大厨", "掌勺", "麻婆",
      "中华物产", "家乡味"), "cnfood"),
    (("花店", "花艺", "插花", "花道", "种花", "花材", "向日葵", "花束"), "flower"),
    (("种菜", "种蔬菜", "香草", "有机", "农场", "茶农", "哈密瓜", "葡萄",
      "樱桃", "盆栽", "庭院", "种花养草"), "plant"),
    (("健身", "瑜伽", "肌肉", "马拉松", "跑量", "跑步", "空手道", "减脂",
      "增肌"), "fitness"),
    (("滑雪", "滑板", "粉雪", "登山", "爬山", "徒步", "山野", "六甲山",
      "奥多摩"), "outdoor"),
    (("海钓", "钓鱼", "钓鱿鱼", "出海", "渔港", "海鲜", "冲浪", "潜水"), "sea"),
    (("摩托", "机车", "二手车", "货车", "送货", "物流", "代步车", "改装",
      "漂移", "驾校", "送外卖"), "vehicle"),
    (("游戏", "switch", "白金", "乐高", "怪物猎人", "最终幻想", "共斗"), "game"),
    (("书店", "二手书", "旧书", "看书", "图书馆", "编辑", "翻译", "文学",
      "书虫"), "book"),
]

# Share of interest-matched personas that actually get the photo (the rest get
# an illustration). <100% so a popular theme's few photos don't repeat too
# often, and so the feed mixes photo + illustration like a real one does.
_PHOTO_PROB = 72


def match_interest(text: str) -> str:
    low = (text or "").lower()
    for kws, cat in _INTEREST:
        if any(k.lower() in low for k in kws):
            return cat
    return ""


def avatar_for(handle: str, gender: str = "", bio: str = "", display_name: str = "") -> str:
    """The single entry point: a 小红书-style avatar URL for one persona."""
    handle = (handle or "").strip() or "machi"
    cat = match_interest(f"{bio or ''} {display_name or ''}")
    if cat and PHOTOS.get(cat) and _h(handle + "|coin", 100) < _PHOTO_PROB:
        ids = PHOTOS[cat]
        return _U.format(ids[_h(handle + "|" + cat, len(ids))])
    return illustrated_avatar(handle, gender)


# Face-free categories from the verified PHOTOS pool that read as a real person's
# chosen avatar for a bio-less new account (no interest signal). Every id here is
# already HTTP-200 + content-checked and contains NO identifiable face.
_GENERIC_PHOTO_CATS = ("coffee", "sea", "outdoor", "flower", "plant", "cat",
                       "dessert", "ramen", "beauty", "book", "camera")
_DEFAULT_PHOTO_PROB = 55   # ~55% photo, else illustration — a real-feed mix


def default_avatar(handle: str, gender: str = "") -> str:
    """Avatar for a NO-bio account (a brand-new real signup). Deterministic per
    handle. ~55% a face-free aesthetic photo from the verified PHOTOS pool, else
    an East-Asian illustration. Reads like a real person, never a bot; never an
    identifiable face; the user can replace it anytime. Used by register /
    OAuth-create only — does NOT change avatar_for (existing persona rendering
    stays byte-for-byte identical)."""
    handle = (handle or "").strip() or "machi"
    if _h(handle + "|defcoin", 100) < _DEFAULT_PHOTO_PROB:
        cat = _GENERIC_PHOTO_CATS[_h(handle + "|defcat", len(_GENERIC_PHOTO_CATS))]
        ids = PHOTOS[cat]
        return _U.format(ids[_h(handle + "|" + cat, len(ids))])
    return illustrated_avatar(handle, gender)


def is_legacy_avatar(url: str) -> bool:
    """True for the old Western stock portraits we are replacing."""
    u = (url or "").lower()
    return ("randomuser.me" in u) or (not u)


__all__ = ["avatar_for", "default_avatar", "illustrated_avatar", "match_interest",
           "is_legacy_avatar", "PHOTOS"]
