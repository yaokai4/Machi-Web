const USER_STORAGE_KEY = "machi_user";
const LEGACY_USER_STORAGE_KEY = "kaix_user";

const FEED_FILTERS = [
  ["all", "全部", ""],
  ["guide", "指南", "guide"],
  ["question", "问答", "question"],
  ["dining", "美食", "dining"],
  ["event", "活动", "event"],
  ["local_info", "本地信息", "local_info"],
];

const SERVICE_FILTERS = ["全部", "餐厅", "生活服务", "景点门票", "翻译手续", "搬家清洁", "认证服务"];

function readStoredUser() {
  const user = localStorage.getItem(USER_STORAGE_KEY) || localStorage.getItem(LEGACY_USER_STORAGE_KEY);
  if (user && !localStorage.getItem(USER_STORAGE_KEY)) {
    localStorage.setItem(USER_STORAGE_KEY, user);
    localStorage.removeItem(LEGACY_USER_STORAGE_KEY);
  }
  try {
    return JSON.parse(user || "null");
  } catch {
    return null;
  }
}

function writeStoredUser(user) {
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
  localStorage.removeItem(LEGACY_USER_STORAGE_KEY);
}

function clearStoredUser() {
  localStorage.removeItem(USER_STORAGE_KEY);
  localStorage.removeItem(LEGACY_USER_STORAGE_KEY);
}

const state = {
  user: readStoredUser(),
  view: "home",
  data: { users: [], posts: [], comments: [], follows: [], messages: [] },
  commentsByPost: {},
  conversations: [],
  businesses: [],
  guide: null,
  drawer: false,
  modal: null,
  replyToUserId: null,
  authMode: "login",
  captcha: { login: null, register: null },
  filters: { feed: "all", service: "全部", q: "" },
  booting: false,
  busy: false,
  toast: "",
};

const $ = (id) => document.getElementById(id);

const api = async (path, options = {}) => {
  const res = await fetch(path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const message = data.message || data.error || data.detail || "请求失败";
    const error = new Error(message);
    error.status = res.status;
    error.code = data.code || "";
    throw error;
  }
  return data;
};

async function guardAction(action) {
  if (state.busy) return;
  state.busy = true;
  try {
    await action();
  } catch (error) {
    showToast(error.message || "操作失败");
  } finally {
    state.busy = false;
    render();
  }
}

function showToast(message) {
  state.toast = message;
  render();
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    state.toast = "";
    render();
  }, 2800);
}

async function load() {
  if (!state.user) {
    await refreshCaptcha(state.authMode);
    render();
    return;
  }
  state.booting = true;
  render();
  try {
    const bootstrap = await api("/api/bootstrap");
    state.user = bootstrap.user || state.user;
    writeStoredUser(state.user);
    setPosts(bootstrap.feed || bootstrap.items || []);
    const city = state.user.city || "tokyo";
    const country = state.user.country || "jp";
    const [businesses, guide, conversations] = await Promise.all([
      api(`/api/businesses/directory?city=${encodeURIComponent(city)}`).catch(() => ({ items: [] })),
      api(`/api/guide/home?country=${encodeURIComponent(country)}`).catch(() => null),
      api("/api/conversations").catch(() => ({ items: [] })),
    ]);
    state.businesses = businesses.items || [];
    state.guide = guide;
    state.conversations = conversations.items || [];
  } catch (error) {
    if (error.status === 401) {
      clearStoredUser();
      state.user = null;
      await refreshCaptcha(state.authMode);
    }
    showToast(error.message || "加载失败");
  } finally {
    state.booting = false;
    render();
  }
}

function setPosts(posts) {
  const normalized = (posts || []).map(normalizePost);
  state.data.posts = normalized;
  const users = new Map();
  if (state.user) users.set(state.user.id, normalizeUser(state.user));
  normalized.forEach((post) => {
    const author = normalizeUser(post.author || {});
    if (author.id) users.set(author.id, author);
  });
  state.data.users = [...users.values()];
}

function replacePost(post) {
  const normalized = normalizePost(post);
  const index = state.data.posts.findIndex((item) => item.id === normalized.id);
  if (index >= 0) state.data.posts.splice(index, 1, normalized);
  else state.data.posts.unshift(normalized);
  setPosts(state.data.posts);
}

function normalizeUser(user) {
  return {
    id: user.id || user.remote_id || "",
    handle: user.handle || user.username || "user",
    display_name: user.display_name || user.displayName || user.handle || "Machi 用户",
    email: user.email || "",
    bio: user.bio || "",
    location: user.location || user.city || "",
    avatar_symbol: user.avatar_symbol || user.avatarSymbol || "person.fill",
    avatar_color: user.avatar_color || user.avatarColor || "indigo",
    membership_tier: user.membership_tier || user.membershipTier || "free",
    is_verified: Boolean(user.is_verified || user.isVerified || user.is_verified_member),
    is_merchant: Boolean(user.is_merchant || user.isMerchant),
    merchant_verified: Boolean(user.merchant_verified || user.merchantVerified),
    follower_count: user.follower_count || user.followerCount || 0,
    following_count: user.following_count || user.followingCount || 0,
    post_count: user.post_count || user.postCount || 0,
  };
}

function normalizePost(post) {
  const author = normalizeUser(post.author || {});
  return {
    ...post,
    id: post.id || post.remote_id,
    author_id: post.author_id || author.id,
    author,
    display_name: author.display_name || post.display_name || "匿名用户",
    handle: author.handle || post.handle || "anonymous",
    avatar_symbol: author.avatar_symbol || post.avatar_symbol || "person.fill",
    avatar_color: author.avatar_color || post.avatar_color || "indigo",
    is_verified: author.is_verified || post.is_verified || false,
    created_at: post.created_at || post.createdAt || new Date().toISOString(),
    heat: post.heat_score ?? post.heatScore ?? post.heat ?? 0,
    view_count: post.view_count ?? post.viewCount ?? 0,
    like_count: post.like_count ?? post.likeCount ?? 0,
    repost_count: post.repost_count ?? post.repostCount ?? 0,
    bookmark_count: post.bookmark_count ?? post.bookmarkCount ?? post.saveCount ?? 0,
    comment_count: post.comment_count ?? post.commentCount ?? 0,
    content_type: post.content_type || post.contentType || "dynamic",
    liked: Boolean(post.liked || post.isLiked),
    bookmarked: Boolean(post.bookmarked || post.saved || post.isSaved),
    reposted: Boolean(post.reposted || post.isReposted),
  };
}

function render() {
  const app = $("app");
  if (!app) return;
  if (!state.user) {
    app.innerHTML = authView();
    bindAuth();
    return;
  }
  app.innerHTML = `
    <div class="shell">
      ${sidebar()}
      <main class="main">${state.booting ? loadingView("正在同步城市数据") : mainView()}</main>
      <aside class="rightbar">${rightbar()}</aside>
    </div>
    ${state.drawer ? drawer() : ""}
    ${state.modal ? modal() : ""}
    ${state.toast ? `<div class="toast">${escapeHtml(state.toast)}</div>` : ""}
  `;
  bindApp();
}

function loadingView(label = "加载中") {
  return `
    <section class="loading-state">
      <div class="spinner"></div>
      <strong>${label}</strong>
      <span>正在准备首页、商家目录和指南内容</span>
      <div class="skeleton-stack"><i></i><i></i><i></i></div>
    </section>
  `;
}

function authView() {
  const register = state.authMode === "register";
  const captcha = state.captcha[state.authMode];
  return `
    <div class="auth-wrap">
      <section class="auth-card">
        <div class="auth-top">
          <div class="auth-logo">M</div>
          <div class="status-pill"><span></span> Web 数据库在线</div>
        </div>
        <h1>Machi</h1>
        <p class="auth-subtitle">${register ? "创建账号后进入同城生活、指南和本地服务。" : "继续管理你的城市动态、指南收藏和商家服务线索。"}</p>
        <div class="auth-stats">
          <div><strong>城市</strong><span>本地频道</span></div>
          <div><strong>商家</strong><span>认证服务</span></div>
          <div><strong>指南</strong><span>资料库</span></div>
        </div>
        <div class="tabs">
          <button class="${!register ? "active" : ""}" data-auth-mode="login">登录</button>
          <button class="${register ? "active" : ""}" data-auth-mode="register">注册</button>
        </div>
        <label class="field-wrap"><span>@</span><input id="handle" autocomplete="username" placeholder="用户名，例如 kaizi"></label>
        ${register ? `<label class="field-wrap"><span>名</span><input id="displayName" placeholder="显示名称"></label>` : ""}
        ${register ? `<label class="field-wrap"><span>邮</span><input id="email" type="email" autocomplete="email" placeholder="邮箱，可选"></label>` : ""}
        <label class="field-wrap"><span>密</span><input id="password" type="password" autocomplete="${register ? "new-password" : "current-password"}" placeholder="密码"></label>
        ${captcha?.enabled ? captchaField(captcha) : ""}
        <button class="primary-btn" id="authSubmit">${state.busy ? "处理中..." : register ? "注册并进入" : "登录 Machi"}</button>
        <button class="ghost-btn" id="demo">填入演示账号 kaizi / 123456</button>
        <div class="auth-features">
          <span>租房</span><span>工作</span><span>二手</span><span>服务</span>
        </div>
      </section>
    </div>
  `;
}

function captchaField(captcha) {
  return `
    <div class="captcha-row">
      <button class="captcha-image" data-refresh-captcha title="刷新验证码"><img src="${captcha.image}" alt="验证码"></button>
      <label class="field-wrap"><span>验</span><input id="captchaCode" autocomplete="off" placeholder="图形验证码"></label>
    </div>
  `;
}

function sidebar() {
  const nav = [
    ["home", "⌂", "首页"],
    ["explore", "⌕", "探索"],
    ["notifications", "●", "通知"],
    ["messages", "✉", "私信"],
    ["profile", "◉", "我的"],
  ];
  return `
    <nav class="sidebar">
      <div class="brand">Machi</div>
      ${nav.map(([id, icon, label]) => `<button class="nav-btn ${state.view === id ? "active" : ""}" data-view="${id}"><span>${icon}</span><span>${label}</span></button>`).join("")}
      <button class="compose-btn" data-compose>投稿</button>
    </nav>
  `;
}

function topbar(title, subtitle = "") {
  return `
    <div class="topbar">
      <button class="account-dot" data-drawer>${initial(state.user.display_name)}</button>
      <div><h1>${title}</h1>${subtitle ? `<p>${subtitle}</p>` : ""}</div>
      <button class="top-action" data-compose>投稿</button>
    </div>
  `;
}

function mainView() {
  switch (state.view) {
    case "explore": return exploreView();
    case "notifications": return notificationsView();
    case "messages": return messagesView();
    case "profile": return profileView(state.user);
    default: return homeView();
  }
}

function homeView() {
  const posts = visiblePosts();
  const hottest = [...state.data.posts].sort((a, b) => b.heat - a.heat)[0];
  return `
    ${topbar("Machi", cityLabel())}
    <section class="hero">
      <div class="hero-kicker">Machi Today</div>
      <h2>今日城市动态</h2>
      <p>同一处查看本地生活、商家服务、指南资料和社区问答。</p>
      <div class="metrics">
        <div class="metric"><strong>${state.data.posts.length}</strong><span>帖文</span></div>
        <div class="metric"><strong>${state.businesses.length}</strong><span>认证商家</span></div>
        <div class="metric"><strong>${hottest?.heat || 0}</strong><span>最高热度</span></div>
      </div>
    </section>
    ${composer()}
    ${feedControls()}
    ${posts.length ? posts.map(postCard).join("") : emptyPanel("还没有匹配内容", "换一个筛选，或发布第一条城市动态。")}
  `;
}

function composer() {
  return `
    <section class="composer">
      <div class="composer-head"><div class="avatar ${state.user.avatar_color || "indigo"}">${initial(state.user.display_name)}</div><strong>${escapeHtml(state.user.display_name)}</strong><span class="muted">@${escapeHtml(state.user.handle)}</span></div>
      <textarea id="composerText" placeholder="发布城市动态、提问、经验或服务提醒"></textarea>
      <div class="composer-actions"><span class="muted">同步到 iOS 与 Web</span><button class="ghost-btn" id="publish">发布</button></div>
    </section>
  `;
}

function feedControls() {
  return `
    <section class="filter-panel">
      <div class="filter-head">
        <strong>筛选内容</strong>
        <label class="search-inline"><span>⌕</span><input id="feedSearch" value="${escapeAttr(state.filters.q)}" placeholder="搜索帖子、商家、指南"></label>
      </div>
      <div class="chip-row">
        ${FEED_FILTERS.map(([id, label]) => `<button class="chip ${state.filters.feed === id ? "active" : ""}" data-feed-filter="${id}">${label}</button>`).join("")}
      </div>
    </section>
  `;
}

function postCard(post) {
  const author = post.author || {};
  const typeLabel = contentTypeLabel(post.content_type);
  const media = (post.media || []).slice(0, 3);
  return `
    <article class="post" data-open-post="${post.id}">
      <div class="avatar ${post.avatar_color}">${symbol(post.avatar_symbol, post.display_name)}</div>
      <div class="post-body">
        <div class="post-head">
          <span class="name">${escapeHtml(post.display_name)}</span>${post.is_verified ? `<span class="verified">✓</span>` : ""}
          <span class="muted">@${escapeHtml(post.handle)} · ${relative(post.created_at)}</span>
          <span class="type-chip">${typeLabel}</span>
        </div>
        <div class="post-content">${escapeHtml(post.content || "转发了一条内容")}</div>
        ${media.length ? `<div class="media-strip">${media.map(mediaThumb).join("")}</div>` : ""}
        <div class="actions" onclick="event.stopPropagation()">
          <button data-open-post="${post.id}"><span>评</span>${post.comment_count}</button>
          <button class="${post.reposted ? "active repost" : ""}" data-interact="${post.id}:repost"><span>转</span>${post.repost_count || 0}</button>
          <button class="${post.liked ? "active like" : ""}" data-interact="${post.id}:like"><span>赞</span>${post.like_count || 0}</button>
          <button class="${post.bookmarked ? "active bookmark" : ""}" data-interact="${post.id}:bookmark"><span>藏</span>${post.bookmark_count || 0}</button>
          <span>热度 ${post.heat}</span>
        </div>
      </div>
    </article>
  `;
}

function mediaThumb(media) {
  const url = media.thumbnailUrl || media.thumbnail_url || media.thumb_url || media.url || media.cdnUrl || "";
  return url ? `<img src="${escapeAttr(url)}" alt="">` : "";
}

function exploreView() {
  const ranks = [...visiblePosts()].sort((a, b) => b.heat - a.heat).slice(0, 8);
  const topics = topicRanks().slice(0, 6);
  return `
    ${topbar("探索", "筛选更靠前，服务和指南不用下拉很久")}
    ${exploreConsole()}
    <section class="panel"><h3>城市精选</h3>${ranks.map((p, i) => rankRow(i + 1, p.content || p.display_name, `${p.heat} 热度 · ${contentTypeLabel(p.content_type)}`, p.id)).join("") || `<p class="muted">暂无精选内容</p>`}</section>
    <section class="panel"><h3>话题排行榜</h3>${topics.map((t, i) => rankRow(i + 1, t.tag, `${t.heat} 热度 · ${t.count} 条`, null)).join("") || `<p class="muted">暂无话题</p>`}</section>
  `;
}

function exploreConsole() {
  return `
    <section class="ops-console">
      <div class="console-card dark">
        <span>服务商家</span>
        <strong>${state.businesses.length}</strong>
        <p>认证商家、生活服务、预约与点评统一展示。</p>
      </div>
      <div class="console-card">
        <span>指南资料</span>
        <strong>${guideCount()}</strong>
        <p>日本生活、学校、企业、资料库入口更靠前。</p>
      </div>
      <div class="console-card">
        <span>今日内容</span>
        <strong>${state.data.posts.length}</strong>
        <p>按城市、类型和关键词快速筛选。</p>
      </div>
    </section>
    <section class="panel service-panel">
      <div class="panel-head">
        <h3>认证服务与商家</h3>
        <div class="chip-row compact">
          ${SERVICE_FILTERS.map((item) => `<button class="chip ${state.filters.service === item ? "active" : ""}" data-service-filter="${item}">${item}</button>`).join("")}
        </div>
      </div>
      <div class="merchant-grid">${filteredBusinesses().map(businessCard).join("") || emptyMini("暂未找到匹配商家", "换个分类或稍后查看")}</div>
    </section>
    <section class="panel guide-panel">
      <h3>Guide 指南</h3>
      <div class="guide-grid">${guideCards().map(guideCard).join("")}</div>
    </section>
  `;
}

function businessCard(business) {
  const categories = business.service_categories || business.serviceCategories || [];
  return `
    <article class="merchant-card">
      <div class="merchant-mark">${initial(business.business_name || business.businessName || "商")}</div>
      <div>
        <strong>${escapeHtml(business.business_name || business.businessName || "认证商家")}</strong>
        <p>${escapeHtml(business.description || business.business_type || business.businessType || "本地服务商家")}</p>
        <div class="merchant-meta"><span>✓ 已认证</span><span>${business.rating_avg || business.ratingAvg || 0} 星</span><span>${business.published_listing_count || business.publishedListingCount || 0} 服务</span></div>
        <div class="tag-row">${categories.slice(0, 3).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
      </div>
    </article>
  `;
}

function guideCards() {
  const guide = state.guide || {};
  const categories = (guide.categories || guide.top_categories || []).slice(0, 3);
  if (categories.length) {
    return categories.map((item) => ({
      title: item.title || item.name || item.key || "生活指南",
      body: item.subtitle || item.description || "整理新到日本、升学、工作和生活手续。",
      stat: item.article_count || item.articleCount || "Guide",
    }));
  }
  return [
    { title: "日本生活指南", body: "手续、租房、就医、银行卡、手机网络。", stat: "入门" },
    { title: "学校与升学", body: "学校库、项目、申请时间线和准备清单。", stat: "资料" },
    { title: "企业与求职", body: "外籍友好企业、面试经验和岗位信息。", stat: "职场" },
  ];
}

function guideCard(item) {
  return `<article class="guide-card"><span>${escapeHtml(item.stat)}</span><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.body)}</p></article>`;
}

function rankRow(rank, title, sub, postId) {
  return `<div class="rank" ${postId ? `data-open-post="${postId}"` : ""}><div class="rank-num">${rank}</div><div><strong>${escapeHtml(title).slice(0, 72)}</strong><div class="muted">${sub}</div></div></div>`;
}

function userRow(user) {
  const normalized = normalizeUser(user);
  return `<div class="row user-row"><div class="avatar ${normalized.avatar_color}">${symbol(normalized.avatar_symbol, normalized.display_name)}</div><div data-user="${normalized.id}" class="row-main"><strong>${escapeHtml(normalized.display_name)}${normalized.is_verified ? " <span class='verified'>✓</span>" : ""}</strong><div class="muted">@${escapeHtml(normalized.handle)} · ${escapeHtml(normalized.bio || normalized.location || "Machi 用户")}</div></div><button class="follow-btn" data-follow="${normalized.id}">关注</button></div>`;
}

function notificationsView() {
  const own = state.data.posts.filter((p) => p.author_id === state.user.id);
  const liked = own.filter((p) => p.like_count > 0);
  return `
    ${topbar("通知", `${liked.length} 条互动提醒`)}
    <section class="panel">
      ${liked.map((p) => `<div class="row" data-open-post="${p.id}"><strong>有人点赞了你的帖文</strong><span class="muted">${escapeHtml((p.content || "").slice(0, 36))}</span></div>`).join("")}
      ${liked.length === 0 ? `<p class="muted">暂无通知</p>` : ""}
    </section>
  `;
}

function messagesView() {
  const conversations = state.conversations || [];
  return `
    ${topbar("私信", `${conversations.length} 个会话`)}
    <section class="panel chat-list">
      ${conversations.map(conversationRow).join("") || `<p class="muted">暂无会话。你可以从用户资料发起私信。</p>`}
    </section>
  `;
}

function conversationRow(conv) {
  const peer = normalizeUser(conv.peer || {});
  const last = conv.last_message || conv.lastMessage || {};
  return `<div class="row"><div data-chat-conversation="${conv.id}"><strong>${escapeHtml(peer.display_name)}</strong><div class="muted">${escapeHtml(last.content || "开始一段新对话")}</div></div><button data-delete-chat="${conv.id}">删除</button></div>`;
}

function profileView(user) {
  const normalized = normalizeUser(user);
  const posts = state.data.posts.filter((p) => p.author_id === normalized.id);
  return `
    ${topbar(normalized.id === state.user.id ? "个人资料" : normalized.display_name)}
    <section class="hero profile-hero">
      <div class="avatar ${normalized.avatar_color}" style="width:80px;height:80px;font-size:30px">${symbol(normalized.avatar_symbol, normalized.display_name)}</div>
      <h2>${escapeHtml(normalized.display_name)} ${normalized.is_verified ? "✓" : ""}</h2>
      <p>@${escapeHtml(normalized.handle)}</p><p>${escapeHtml(normalized.bio || "还没有简介。")}</p>
      <div class="metrics">
        <div class="metric"><strong>${posts.length || normalized.post_count}</strong><span>投稿</span></div>
        <div class="metric"><strong>${normalized.follower_count}</strong><span>关注者</span></div>
        <div class="metric"><strong>${normalized.membership_tier}</strong><span>会员</span></div>
      </div>
      ${normalized.id !== state.user.id ? `<button class="ghost-btn" data-chat="${normalized.id}">发私信</button><button class="ghost-btn" data-follow="${normalized.id}">关注</button>` : ""}
    </section>
    ${posts.map(postCard).join("") || emptyPanel("还没有发布", "完善资料后发布第一条城市动态。")}
  `;
}

function rightbar() {
  return `
    <section class="panel"><h3>实时趋势</h3>${topicRanks().slice(0, 5).map((t, i) => rankRow(i + 1, t.tag, `${t.heat} 热度`, null)).join("") || `<p class="muted">暂无趋势</p>`}</section>
    <section class="panel"><h3>认证服务</h3>${state.businesses.slice(0, 3).map(businessMini).join("") || `<p class="muted">暂无认证商家</p>`}</section>
  `;
}

function businessMini(business) {
  return `<div class="rank"><div class="rank-num">✓</div><div><strong>${escapeHtml(business.business_name || business.businessName || "认证商家")}</strong><div class="muted">${escapeHtml(business.business_type || business.businessType || "本地服务")}</div></div></div>`;
}

function drawer() {
  return `
    <div class="drawer-cover" data-close-drawer></div>
    <aside class="drawer">
      <div class="drawer-card">
        <button class="ghost-btn" data-close-drawer>关闭</button>
        <h2>${escapeHtml(state.user.display_name)} ${state.user.is_verified ? "✓" : ""}</h2>
        <p class="muted">@${escapeHtml(state.user.handle)}</p>
        <div class="metrics">
          <div class="metric"><strong>${state.data.posts.filter((p) => p.author_id === state.user.id).length}</strong><span>投稿</span></div>
          <div class="metric"><strong>${state.data.posts.filter((p) => p.liked).length}</strong><span>喜欢</span></div>
          <div class="metric"><strong>${state.data.posts.filter((p) => p.bookmarked).length}</strong><span>书签</span></div>
        </div>
      </div>
      <div class="drawer-card">
        <div class="row" data-settings="account"><strong>账号资料</strong><span>›</span></div>
        <div class="row" data-settings="member"><strong>会员与认证</strong><span>${escapeHtml(state.user.membership_tier || "free")}</span></div>
        <div class="row" data-view="explore"><strong>服务商家与指南</strong><span>›</span></div>
        <div class="row" data-library="bookmark"><strong>书签</strong><span>›</span></div>
        <div class="row" data-library="like"><strong>喜欢</strong><span>›</span></div>
      </div>
      <button class="primary-btn" data-logout>退出账号</button>
    </aside>
  `;
}

function modal() {
  if (state.modal.type === "post") return postModal(state.modal.postId);
  if (state.modal.type === "chat") return chatModal(state.modal.peerId, state.modal.conversationId);
  if (state.modal.type === "user") return `<div class="modal-cover"><div class="modal"><button class="ghost-btn" data-close-modal>关闭</button>${profileView(userById(state.modal.userId) || {})}</div></div>`;
  if (state.modal.type === "account") return accountModal();
  if (state.modal.type === "member") return memberModal();
  return `<div class="modal-cover"><div class="modal"><button class="ghost-btn" data-close-modal>关闭</button><h2>${state.modal.title}</h2>${state.modal.html}</div></div>`;
}

function accountModal() {
  return `
    <div class="modal-cover"><div class="modal settings-modal">
      <button class="ghost-btn" data-close-modal>关闭</button>
      <h2>账号资料</h2>
      <p class="muted">资料会同步到 iOS 与 Web。</p>
      <label class="field-wrap"><span>@</span><input id="accountHandle" value="${escapeAttr(state.user.handle)}" placeholder="用户名"></label>
      <label class="field-wrap"><span>邮</span><input id="accountEmail" value="${escapeAttr(state.user.email || "")}" placeholder="邮箱"></label>
      <label class="field-wrap"><span>名</span><input id="accountName" value="${escapeAttr(state.user.display_name)}" placeholder="显示名称"></label>
      <button class="primary-btn" data-save-account>保存账号资料</button>
    </div></div>
  `;
}

function memberModal() {
  const tiers = [
    ["free", "免费", "基础发布、互动、搜索和私信。"],
    ["pro", "Pro", "认证标识、收藏管理和更完整的数据面板。"],
    ["creator", "Creator", "创作者工具、认证和服务端迁移准备。"],
  ];
  return `
    <div class="modal-cover"><div class="modal settings-modal">
      <button class="ghost-btn" data-close-modal>关闭</button>
      <h2>会员与认证</h2>
      <p class="muted">真实开通请走支付/会员页；这里保留现有资料查看入口。</p>
      ${tiers.map(([id, title, desc]) => `<button class="member-plan ${state.user.membership_tier === id ? "selected" : ""}" data-member="${id}"><strong>${title}</strong><span>${desc}</span></button>`).join("")}
    </div></div>
  `;
}

function postModal(postId) {
  const post = state.data.posts.find((p) => p.id === postId);
  const comments = state.commentsByPost[postId] || [];
  if (!post) return `<div class="modal-cover"><div class="modal"><button class="ghost-btn" data-close-modal>关闭</button><p class="muted">内容不存在</p></div></div>`;
  return `
    <div class="modal-cover"><div class="modal">
      <button class="ghost-btn" data-close-modal>关闭</button>
      ${postCard(post)}
      <h3>评论</h3>
      ${comments.map(commentRow).join("") || `<p class="muted">还没有评论</p>`}
      ${state.replyToUserId ? `<p class="muted">正在回复 <button data-clear-reply>取消</button></p>` : ""}
      <input class="field" id="commentText" placeholder="写下你的回复">
      <button class="primary-btn" data-comment="${postId}">发送评论</button>
    </div></div>
  `;
}

function commentRow(comment) {
  const author = normalizeUser(comment.author || userById(comment.author_id) || {});
  return `<div class="comment"><div class="avatar ${author.avatar_color}">${symbol(author.avatar_symbol, author.display_name)}</div><div><strong>${escapeHtml(author.display_name)}</strong> <span class="muted">@${escapeHtml(author.handle)}</span><p>${escapeHtml(comment.content)}</p><button data-reply="${author.id}">回复</button> <button class="${comment.liked ? "active" : ""}" data-comment-like="${comment.id}">赞 ${comment.like_count || 0}</button></div></div>`;
}

function chatModal(peerId, conversationId) {
  const conv = state.conversations.find((item) => item.id === conversationId);
  const peer = normalizeUser(userById(peerId) || conv?.peer || {});
  const messages = conv?.messages || [];
  return `
    <div class="modal-cover"><div class="modal">
      <button class="ghost-btn" data-close-modal>关闭</button>
      <h2>${escapeHtml(peer.display_name || "私信")}</h2>
      ${messages.map((m) => `<div class="bubble ${m.sender_id === state.user.id || m.senderId === state.user.id ? "mine" : ""}">${escapeHtml(m.content || "")}</div>`).join("") || `<p class="muted">开始一段新对话</p>`}
      <input class="field" id="messageText" placeholder="发送私信">
      <button class="primary-btn" data-send-message="${conversationId}">发送</button>
    </div></div>
  `;
}

function bindAuth() {
  document.querySelectorAll("[data-auth-mode]").forEach((btn) => {
    btn.onclick = async () => {
      state.authMode = btn.dataset.authMode;
      await refreshCaptcha(state.authMode);
      render();
    };
  });
  document.querySelectorAll("[data-refresh-captcha]").forEach((btn) => {
    btn.onclick = async () => {
      await refreshCaptcha(state.authMode, true);
      render();
    };
  });
  $("demo").onclick = () => {
    $("handle").value = "kaizi";
    $("password").value = "123456";
    state.authMode = "login";
  };
  $("authSubmit").onclick = () => guardAction(authSubmit);
}

async function authSubmit() {
  const mode = state.authMode;
  const body = {
    handle: $("handle").value.trim(),
    password: $("password").value,
  };
  if (mode === "register") {
    body.display_name = $("displayName")?.value.trim() || body.handle;
    body.email = $("email")?.value.trim() || "";
  }
  const captcha = state.captcha[mode];
  if (captcha?.enabled) {
    body.captcha_id = captcha.captcha_id;
    body.captcha_code = $("captchaCode")?.value.trim() || "";
  }
  const endpoint = mode === "register" ? "/api/auth/register" : "/api/auth/login";
  const result = await api(endpoint, { method: "POST", body });
  state.user = result.user;
  writeStoredUser(state.user);
  await load();
}

async function refreshCaptcha(mode = state.authMode, force = false) {
  if (!force && state.captcha[mode]) return;
  try {
    state.captcha[mode] = await api("/api/auth/captcha", { method: "POST", body: { scene: mode } });
  } catch {
    state.captcha[mode] = { enabled: false };
  }
}

function bindApp() {
  document.querySelectorAll("[data-view]").forEach((el) => el.onclick = () => { state.view = el.dataset.view; state.drawer = false; render(); });
  document.querySelectorAll("[data-drawer]").forEach((el) => el.onclick = () => { state.drawer = true; render(); });
  document.querySelectorAll("[data-close-drawer]").forEach((el) => el.onclick = () => { state.drawer = false; render(); });
  document.querySelectorAll("[data-compose]").forEach((el) => el.onclick = () => window.scrollTo({ top: 0, behavior: "smooth" }));
  document.querySelectorAll("[data-open-post]").forEach((el) => el.onclick = () => guardAction(() => openPost(el.dataset.openPost)));
  document.querySelectorAll("[data-interact]").forEach((el) => el.onclick = () => guardAction(() => togglePostInteraction(el.dataset.interact)));
  document.querySelectorAll("[data-follow]").forEach((el) => el.onclick = () => guardAction(() => followUser(el.dataset.follow)));
  document.querySelectorAll("[data-user]").forEach((el) => el.onclick = () => { state.modal = { type: "user", userId: el.dataset.user }; render(); });
  document.querySelectorAll("[data-chat]").forEach((el) => el.onclick = () => guardAction(() => openChat(el.dataset.chat)));
  document.querySelectorAll("[data-chat-conversation]").forEach((el) => el.onclick = () => guardAction(() => openConversation(el.dataset.chatConversation)));
  document.querySelectorAll("[data-delete-chat]").forEach((el) => el.onclick = () => guardAction(() => deleteConversation(el.dataset.deleteChat)));
  document.querySelectorAll("[data-close-modal]").forEach((el) => el.onclick = () => { state.modal = null; state.replyToUserId = null; render(); });
  document.querySelectorAll("[data-settings]").forEach((el) => el.onclick = () => { state.drawer = false; state.modal = { type: el.dataset.settings }; render(); });
  document.querySelectorAll("[data-save-account]").forEach((el) => el.onclick = () => guardAction(saveAccount));
  document.querySelectorAll("[data-member]").forEach((el) => el.onclick = () => showToast("会员开通请使用正式支付入口"));
  document.querySelectorAll("[data-reply]").forEach((el) => el.onclick = () => { state.replyToUserId = el.dataset.reply; render(); });
  document.querySelectorAll("[data-clear-reply]").forEach((el) => el.onclick = () => { state.replyToUserId = null; render(); });
  document.querySelectorAll("[data-comment]").forEach((el) => el.onclick = () => guardAction(() => sendComment(el.dataset.comment)));
  document.querySelectorAll("[data-comment-like]").forEach((el) => el.onclick = () => guardAction(() => api(`/api/comments/${el.dataset.commentLike}/like`, { method: "POST" })));
  document.querySelectorAll("[data-send-message]").forEach((el) => el.onclick = () => guardAction(() => sendMessage(el.dataset.sendMessage)));
  document.querySelectorAll("[data-feed-filter]").forEach((el) => el.onclick = () => { state.filters.feed = el.dataset.feedFilter; render(); });
  document.querySelectorAll("[data-service-filter]").forEach((el) => el.onclick = () => { state.filters.service = el.dataset.serviceFilter; render(); });
  const search = $("feedSearch");
  if (search) search.oninput = () => { state.filters.q = search.value; render(); };
  const publish = $("publish");
  if (publish) publish.onclick = () => guardAction(publishPost);
  document.querySelectorAll("[data-library]").forEach((el) => el.onclick = () => openLibrary(el.dataset.library));
  document.querySelectorAll("[data-logout]").forEach((el) => el.onclick = () => guardAction(logout));
}

async function openPost(postId) {
  await api(`/api/posts/${postId}/view`, { method: "POST" }).catch(() => null);
  const comments = await api(`/api/posts/${postId}/comments`).catch(() => ({ items: [] }));
  state.commentsByPost[postId] = comments.items || [];
  state.modal = { type: "post", postId };
}

async function togglePostInteraction(value) {
  const [id, kind] = value.split(":");
  const post = state.data.posts.find((item) => item.id === id);
  if (!post) return;
  const active = kind === "like" ? post.liked : kind === "bookmark" ? post.bookmarked : post.reposted;
  const endpoint = `/api/posts/${id}/${kind === "bookmark" ? "bookmark" : kind}`;
  const result = await api(endpoint, { method: active ? "DELETE" : "POST" });
  if (result.post) replacePost(result.post);
}

async function followUser(userId) {
  await api(`/api/users/${encodeURIComponent(userId)}/follow`, { method: "POST" });
  showToast("已更新关注状态");
}

async function openChat(peerId) {
  const result = await api("/api/conversations", { method: "POST", body: { peer_id: peerId } });
  const conv = result.conversation;
  state.conversations = [conv, ...state.conversations.filter((item) => item.id !== conv.id)];
  await openConversation(conv.id);
}

async function openConversation(conversationId) {
  const conv = state.conversations.find((item) => item.id === conversationId);
  const messages = await api(`/api/conversations/${conversationId}/messages`).catch(() => ({ items: [] }));
  if (conv) conv.messages = messages.items || [];
  const peerId = conv?.peer?.id || conv?.peer_id || "";
  state.modal = { type: "chat", peerId, conversationId };
}

async function deleteConversation(conversationId) {
  await api(`/api/conversations/${conversationId}`, { method: "DELETE" });
  state.conversations = state.conversations.filter((item) => item.id !== conversationId);
}

async function sendMessage(conversationId) {
  const content = $("messageText")?.value.trim();
  if (!content) return;
  await api(`/api/conversations/${conversationId}/messages`, { method: "POST", body: { content } });
  await openConversation(conversationId);
}

async function sendComment(postId) {
  const content = $("commentText")?.value.trim();
  if (!content) return;
  await api(`/api/posts/${postId}/comments`, { method: "POST", body: { content, reply_to_user_id: state.replyToUserId } });
  state.replyToUserId = null;
  await openPost(postId);
}

async function publishPost() {
  const text = $("composerText")?.value.trim();
  if (!text) return;
  const result = await api("/api/posts", { method: "POST", body: { content: text, content_type: "dynamic" } });
  if (result.post) replacePost(result.post);
  $("composerText").value = "";
}

async function saveAccount() {
  const body = {
    handle: $("accountHandle").value.trim(),
    email: $("accountEmail").value.trim(),
    display_name: $("accountName").value.trim(),
  };
  const result = await api("/api/auth/me", { method: "PATCH", body });
  state.user = result.user;
  writeStoredUser(state.user);
  state.modal = null;
  await load();
}

async function logout() {
  await api("/api/auth/logout", { method: "POST" }).catch(() => null);
  clearStoredUser();
  state.user = null;
  state.drawer = false;
  state.modal = null;
  await refreshCaptcha(state.authMode, true);
}

function openLibrary(kind) {
  const posts = state.data.posts.filter((p) => kind === "like" ? p.liked : p.bookmarked);
  state.modal = { title: kind === "like" ? "喜欢" : "书签", html: posts.map(postCard).join("") || `<p class="muted">暂无内容</p>` };
  render();
}

function visiblePosts() {
  const filter = FEED_FILTERS.find(([id]) => id === state.filters.feed)?.[2] || "";
  const query = state.filters.q.trim().toLowerCase();
  return state.data.posts.filter((post) => {
    if (filter && post.content_type !== filter) return false;
    if (!query) return true;
    const haystack = [post.content, post.display_name, post.handle, post.content_type].join(" ").toLowerCase();
    return haystack.includes(query);
  });
}

function filteredBusinesses() {
  const filter = state.filters.service;
  const query = state.filters.q.trim().toLowerCase();
  return state.businesses.filter((business) => {
    const categories = business.service_categories || business.serviceCategories || [];
    const categoryMatch = filter === "全部" || categories.includes(filter) || business.business_type === filter || business.businessType === filter;
    if (!categoryMatch) return false;
    if (!query) return true;
    return [business.business_name, business.businessName, business.description, business.business_type, business.businessType, categories.join(" ")].join(" ").toLowerCase().includes(query);
  });
}

function topicRanks() {
  const map = new Map();
  state.data.posts.forEach((p) => (p.content || "").match(/#[^\s#]+/g)?.forEach((tag) => {
    const cur = map.get(tag) || { tag, heat: 0, count: 0 };
    cur.heat += p.view_count + (p.like_count || 0) * 160 + (p.comment_count || 0) * 90;
    cur.count += 1;
    map.set(tag, cur);
  }));
  return [...map.values()].sort((a, b) => b.heat - a.heat);
}

function guideCount() {
  const guide = state.guide || {};
  return (guide.categories || []).length || (guide.articles || []).length || (guide.products || []).length || "Guide";
}

function cityLabel() {
  return [state.user.country, state.user.province, state.user.city].filter(Boolean).join(" / ") || "同城生活广场";
}

function contentTypeLabel(type) {
  return ({
    dynamic: "动态",
    guide: "指南",
    question: "问答",
    dining: "美食",
    event: "活动",
    local_info: "本地",
    warning: "提醒",
    meetup: "聚会",
  })[type] || "内容";
}

function emptyPanel(title, body) {
  return `<section class="empty-panel"><strong>${title}</strong><span>${body}</span></section>`;
}

function emptyMini(title, body) {
  return `<div class="empty-mini"><strong>${title}</strong><span>${body}</span></div>`;
}

function userById(id) { return state.data.users.find((u) => u.id === id); }
function initial(name) { return (name || "?").slice(0, 1).toUpperCase(); }
function symbol(value, fallback = "?") {
  if (!value || value.includes(".")) return initial(fallback);
  return initial(value);
}
function relative(value) {
  const diff = (Date.now() - new Date(value).getTime()) / 60000;
  if (!Number.isFinite(diff)) return "刚刚";
  if (diff < 60) return `${Math.max(1, Math.floor(diff))} 分钟`;
  if (diff < 1440) return `${Math.floor(diff / 60)} 小时`;
  return `${Math.floor(diff / 1440)} 天`;
}
function escapeHtml(value) { return String(value || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c])); }
function escapeAttr(value) { return escapeHtml(value).replace(/`/g, "&#096;"); }

load();
