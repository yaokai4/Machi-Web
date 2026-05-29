const USER_STORAGE_KEY = "machi_user";
const LEGACY_USER_STORAGE_KEY = "kaix_user";

function readStoredUser() {
  const user = localStorage.getItem(USER_STORAGE_KEY) || localStorage.getItem(LEGACY_USER_STORAGE_KEY);
  if (user && !localStorage.getItem(USER_STORAGE_KEY)) {
    localStorage.setItem(USER_STORAGE_KEY, user);
    localStorage.removeItem(LEGACY_USER_STORAGE_KEY);
  }
  return JSON.parse(user || "null");
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
  drawer: false,
  modal: null,
  replyToUserId: null,
  authMode: "login",
  toast: "",
};

const $ = (id) => document.getElementById(id);
const api = async (path, options = {}) => {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "请求失败");
  return data;
};

async function guardAction(action) {
  try {
    await action();
  } catch (error) {
    state.toast = error.message || "操作失败";
    render();
    window.setTimeout(() => {
      state.toast = "";
      render();
    }, 2600);
  }
}

async function load() {
  if (!state.user) return render();
  state.data = await api(`/api/bootstrap?user_id=${state.user.id}`);
  const fresh = state.data.users.find((u) => u.id === state.user.id);
  if (fresh) {
    state.user = fresh;
    writeStoredUser(fresh);
  }
  render();
}

function render() {
  const app = $("app");
  if (!state.user) {
    app.innerHTML = authView();
    bindAuth();
    return;
  }
  app.innerHTML = `
    <div class="shell">
      ${sidebar()}
      <main class="main">${mainView()}</main>
      <aside class="rightbar">${rightbar()}</aside>
    </div>
    ${state.drawer ? drawer() : ""}
    ${state.modal ? modal() : ""}
    ${state.toast ? `<div class="toast">${escapeHtml(state.toast)}</div>` : ""}
  `;
  bindApp();
}

function authView() {
  const register = state.authMode === "register";
  return `
    <div class="auth-wrap">
      <section class="auth-card">
        <div class="auth-top">
          <div class="auth-logo">✦</div>
          <div class="status-pill"><span></span> Web 数据库在线</div>
        </div>
        <h1>Machi</h1>
        <p class="auth-subtitle">${register ? "创建账号，选择国家和城市后进入本地生活社区。" : "欢迎回来。继续查看同国城市里的租房、工作、二手和活动。"}</p>
        <div class="auth-stats">
          <div><strong>国家</strong><span>内容范围</span></div>
          <div><strong>城市</strong><span>本地频道</span></div>
          <div><strong>生活</strong><span>实用信息</span></div>
        </div>
        <div class="tabs">
          <button class="${!register ? "active" : ""}" data-auth-mode="login">登录</button>
          <button class="${register ? "active" : ""}" data-auth-mode="register">注册</button>
        </div>
        <label class="field-wrap"><span>@</span><input id="handle" placeholder="用户名，例如 kaizi"></label>
        ${register ? `<label class="field-wrap"><span>◎</span><input id="displayName" placeholder="显示名称"></label>` : ""}
        <label class="field-wrap"><span>⌕</span><input id="password" type="password" placeholder="密码"></label>
        <button class="primary-btn" id="authSubmit">${register ? "注册并进入" : "登录 Machi"}</button>
        <button class="ghost-btn" id="demo">使用演示账号 kaizi / 123456</button>
        <div class="auth-features">
          <span>租房</span><span>工作</span><span>二手</span><span>活动</span>
        </div>
      </section>
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

function topbar(title) {
  return `<div class="topbar"><button class="account-dot" data-drawer>${initial(state.user.display_name)}</button><h1>${title}</h1><button class="top-action" data-compose>投稿</button></div>`;
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
  const posts = [...state.data.posts].sort((a, b) => b.heat - a.heat);
  return `
    ${topbar("Machi")}
    <section class="hero">
      <div class="hero-kicker">Machi Today</div>
      <h2>今日动态</h2>
      <p>围绕你选择的国家和城市，整理本地生活、租房、工作与活动。</p>
      <div class="metrics">
        <div class="metric"><strong>${state.data.posts.length}</strong><span>帖文</span></div>
        <div class="metric"><strong>${state.data.follows.filter(f => f.follower_id === state.user.id).length}</strong><span>关注</span></div>
        <div class="metric"><strong>${posts[0]?.heat || 0}</strong><span>最高热度</span></div>
      </div>
    </section>
    ${composer()}
    ${posts.map(postCard).join("")}
  `;
}

function composer() {
  return `
    <section class="composer">
      <div class="composer-head"><div class="avatar black">${initial(state.user.display_name)}</div><strong>${state.user.display_name}</strong><span class="muted">@${state.user.handle}</span></div>
      <textarea id="composerText" placeholder="有什么新鲜事？支持 #话题"></textarea>
      <div class="composer-actions"><span class="muted">发布后写入 SQLite 数据库</span><button class="ghost-btn" id="publish">发布</button></div>
    </section>
  `;
}

function postCard(post) {
  return `
    <article class="post" data-open-post="${post.id}">
      <div class="avatar ${post.avatar_color}">${symbol(post.avatar_symbol)}</div>
      <div>
        <div class="post-head">
          <span class="name">${post.display_name}</span>${post.is_verified ? `<span class="verified">✓</span>` : ""}
          <span class="muted">@${post.handle} · ${relative(post.created_at)}</span>
          <span class="muted">热度 ${post.heat}</span>
        </div>
        <div class="post-content">${escapeHtml(post.content)}</div>
        <div class="actions" onclick="event.stopPropagation()">
          <button data-open-post="${post.id}"><span>💬</span>${post.comment_count}</button>
          <button class="${post.reposted ? "active repost" : ""}" data-interact="${post.id}:repost"><span>↻</span>${post.repost_count || 0}</button>
          <button class="${post.liked ? "active like" : ""}" data-interact="${post.id}:like"><span>♥</span>${post.like_count || 0}</button>
          <button class="${post.bookmarked ? "active bookmark" : ""}" data-interact="${post.id}:bookmark"><span>🔖</span></button>
          <span>📈 ${post.view_count}</span>
        </div>
      </div>
    </article>
  `;
}

function exploreView() {
  const ranks = [...state.data.posts].sort((a, b) => b.heat - a.heat).slice(0, 10);
  const topics = topicRanks();
  return `
    ${topbar("探索")}
    <section class="panel"><h3>Machi 城市精选</h3>${ranks.map((p, i) => rankRow(i + 1, p.content, `${p.heat} 热度`, p.id)).join("")}</section>
    <section class="panel"><h3>话题排行榜</h3>${topics.map((t, i) => rankRow(i + 1, t.tag, `${t.heat} 热度 · ${t.count} 条`, null)).join("")}</section>
    <section class="panel"><h3>推荐关注</h3>${state.data.users.filter(u => u.id !== state.user.id).map(userRow).join("")}</section>
  `;
}

function rankRow(rank, title, sub, postId) {
  return `<div class="rank" ${postId ? `data-open-post="${postId}"` : ""}><div class="rank-num">${rank}</div><div><strong>${escapeHtml(title).slice(0, 60)}</strong><div class="muted">${sub}</div></div></div>`;
}

function userRow(user) {
  const following = state.data.follows.some(f => f.follower_id === state.user.id && f.following_id === user.id);
  return `<div class="row user-row"><div class="avatar ${user.avatar_color}">${symbol(user.avatar_symbol)}</div><div data-user="${user.id}" class="row-main"><strong>${user.display_name}${user.is_verified ? " <span class='verified'>✓</span>" : ""}</strong><div class="muted">@${user.handle} · ${user.bio}</div></div><button class="follow-btn ${following ? "following" : ""}" data-follow="${user.id}">${following ? "已关注" : "关注"}</button></div>`;
}

function notificationsView() {
  const mine = new Set(state.data.posts.filter(p => p.author_id === state.user.id).map(p => p.id));
  const likes = state.data.posts.filter(p => mine.has(p.id) && p.like_count > 0);
  const comments = state.data.comments.filter(c => mine.has(c.post_id) && c.author_id !== state.user.id);
  return `
    ${topbar("通知")}
    <section class="panel">
      ${likes.map(p => `<div class="row" data-open-post="${p.id}"><strong>有人点赞了你的帖文</strong><span class="muted">${p.content.slice(0, 32)}</span></div>`).join("")}
      ${comments.map(c => `<div class="row" data-open-post="${c.post_id}"><strong>${userName(c.author_id)} 评论了你</strong><span class="muted">${escapeHtml(c.content)}</span></div>`).join("")}
      ${likes.length + comments.length === 0 ? `<p class="muted">暂无通知</p>` : ""}
    </section>
  `;
}

function messagesView() {
  const peers = conversationPeers();
  return `
    ${topbar("私信")}
    <section class="panel chat-list">
      ${peers.map(peer => `<div class="row"><div data-chat="${peer.id}"><strong>${peer.display_name}</strong><div class="muted">${latestMessage(peer.id)?.content || "开始一段新对话"}</div></div><button data-delete-chat="${peer.id}">删除</button></div>`).join("")}
    </section>
  `;
}

function profileView(user) {
  const posts = state.data.posts.filter(p => p.author_id === user.id);
  return `
    ${topbar(user.id === state.user.id ? "个人资料" : user.display_name)}
    <section class="hero">
      <div class="avatar ${user.avatar_color}" style="width:80px;height:80px;font-size:30px">${symbol(user.avatar_symbol)}</div>
      <h2>${user.display_name} ${user.is_verified ? "✓" : ""}</h2>
      <p>@${user.handle}</p><p>${user.bio || "还没有简介。"}</p>
      <div class="metrics">
        <div class="metric"><strong>${posts.length}</strong><span>投稿</span></div>
        <div class="metric"><strong>${state.data.follows.filter(f => f.following_id === user.id).length}</strong><span>关注者</span></div>
        <div class="metric"><strong>${user.membership_tier}</strong><span>会员</span></div>
      </div>
      ${user.id !== state.user.id ? `<button class="ghost-btn" data-chat="${user.id}">发私信</button><button class="ghost-btn" data-follow="${user.id}">关注/取消</button>` : ""}
    </section>
    ${posts.map(postCard).join("")}
  `;
}

function rightbar() {
  return `<section class="panel"><h3>实时趋势</h3>${topicRanks().slice(0, 5).map((t, i) => rankRow(i + 1, t.tag, `${t.heat} 热度`, null)).join("")}</section>`;
}

function drawer() {
  return `
    <div class="drawer-cover" data-close-drawer></div>
    <aside class="drawer">
      <div class="drawer-card">
        <button class="ghost-btn" data-close-drawer>关闭</button>
        <h2>${state.user.display_name} ${state.user.is_verified ? "✓" : ""}</h2>
        <p class="muted">@${state.user.handle}</p>
        <div class="metrics">
          <div class="metric"><strong>${state.data.posts.filter(p => p.author_id === state.user.id).length}</strong><span>投稿</span></div>
          <div class="metric"><strong>${state.data.posts.filter(p => p.liked).length}</strong><span>喜欢</span></div>
          <div class="metric"><strong>${state.data.posts.filter(p => p.bookmarked).length}</strong><span>书签</span></div>
        </div>
      </div>
      <div class="drawer-card">
        <div class="row" data-settings="account"><strong>账号与密码</strong><span>›</span></div>
        <div class="row" data-settings="member"><strong>会员与认证</strong><span>${state.user.membership_tier}</span></div>
        <div class="row" data-view="profile"><strong>我的主页</strong><span>›</span></div>
        <div class="row" data-library="bookmark"><strong>书签</strong><span>›</span></div>
        <div class="row" data-library="like"><strong>喜欢</strong><span>›</span></div>
      </div>
      <button class="primary-btn" data-logout>退出账号</button>
    </aside>
  `;
}

function modal() {
  if (state.modal.type === "post") return postModal(state.modal.postId);
  if (state.modal.type === "chat") return chatModal(state.modal.peerId);
  if (state.modal.type === "user") return `<div class="modal-cover"><div class="modal"><button class="ghost-btn" data-close-modal>关闭</button>${profileView(userById(state.modal.userId))}</div></div>`;
  if (state.modal.type === "account") return accountModal();
  if (state.modal.type === "member") return memberModal();
  return `<div class="modal-cover"><div class="modal"><button data-close-modal>关闭</button><h2>${state.modal.title}</h2>${state.modal.html}</div></div>`;
}

function accountModal() {
  return `
    <div class="modal-cover"><div class="modal settings-modal">
      <button class="ghost-btn" data-close-modal>关闭</button>
      <h2>账号与密码</h2>
      <p class="muted">这里会直接更新共享数据库里的用户资料。</p>
      <label class="field-wrap"><span>@</span><input id="accountHandle" value="${state.user.handle}" placeholder="用户名"></label>
      <label class="field-wrap"><span>✉</span><input id="accountEmail" value="${state.user.email || ""}" placeholder="邮箱"></label>
      <label class="field-wrap"><span>◎</span><input id="accountName" value="${state.user.display_name}" placeholder="显示名称"></label>
      <label class="field-wrap"><span>⌕</span><input id="accountPassword" type="password" placeholder="新密码，不填则不改"></label>
      <button class="primary-btn" data-save-account>保存账号设置</button>
    </div></div>
  `;
}

function memberModal() {
  const tiers = [
    ["free", "免费", "基础发布、互动、搜索和私信。"],
    ["pro", "Pro", "认证标识、书签管理和更完整的数据面板。"],
    ["creator", "Creator", "创作者工具、认证和服务端迁移准备。"],
  ];
  return `
    <div class="modal-cover"><div class="modal settings-modal">
      <button class="ghost-btn" data-close-modal>关闭</button>
      <h2>会员与认证</h2>
      <p class="muted">会员状态会写入共享数据库；Pro 和 Creator 自动获得认证。</p>
      ${tiers.map(([id, title, desc]) => `<button class="member-plan ${state.user.membership_tier === id ? "selected" : ""}" data-member="${id}"><strong>${title}</strong><span>${desc}</span></button>`).join("")}
    </div></div>
  `;
}

function postModal(postId) {
  const post = state.data.posts.find(p => p.id === postId);
  const comments = state.data.comments.filter(c => c.post_id === postId);
  return `
    <div class="modal-cover"><div class="modal">
      <button class="ghost-btn" data-close-modal>关闭</button>
      ${postCard(post)}
      <h3>评论</h3>
      ${comments.map(c => commentRow(c)).join("") || `<p class="muted">还没有评论</p>`}
      ${state.replyToUserId ? `<p class="muted">回复 @${userById(state.replyToUserId)?.handle || "unknown"} <button data-clear-reply>取消</button></p>` : ""}
      <input class="field" id="commentText" placeholder="${state.replyToUserId ? `回复 @${userById(state.replyToUserId)?.handle || "unknown"}` : "写下你的回复"}">
      <button class="primary-btn" data-comment="${postId}">发送评论</button>
    </div></div>
  `;
}

function commentRow(c) {
  const author = userById(c.author_id);
  const target = c.reply_to_user_id ? userById(c.reply_to_user_id) : null;
  return `<div class="comment"><div class="avatar ${author?.avatar_color || ""}">${initial(author?.display_name || "?")}</div><div><strong>${author?.display_name || "未知用户"}</strong> <span class="muted">@${author?.handle || "unknown"}</span>${target ? `<div class="muted">回复 @${target.handle}</div>` : ""}<p>${escapeHtml(c.content)}</p><button data-reply="${c.author_id}">回复</button> <button class="${c.liked ? "active" : ""}" data-comment-like="${c.id}">♥ ${c.like_count || 0}</button></div></div>`;
}

function chatModal(peerId) {
  const peer = userById(peerId);
  const messages = state.data.messages.filter(m => (m.sender_id === state.user.id && m.receiver_id === peerId) || (m.sender_id === peerId && m.receiver_id === state.user.id));
  return `
    <div class="modal-cover"><div class="modal">
      <button class="ghost-btn" data-close-modal>关闭</button><button class="ghost-btn" data-user="${peerId}">查看资料</button>
      <h2>${peer.display_name}</h2>
      ${messages.map(m => `<div class="bubble ${m.sender_id === state.user.id ? "mine" : ""}">${m.attachment_symbol ? `<div class="image-box">🖼</div>` : ""}${escapeHtml(m.content)}</div>`).join("")}
      <input class="field" id="messageText" placeholder="发送私信">
      <button class="ghost-btn" data-send-image="${peerId}">发送图片</button>
      <button class="primary-btn" data-send-message="${peerId}">发送</button>
    </div></div>
  `;
}

function bindAuth() {
  document.querySelectorAll("[data-auth-mode]").forEach(btn => btn.onclick = () => { state.authMode = btn.dataset.authMode; render(); });
  $("demo").onclick = () => { $("handle").value = "kaizi"; $("password").value = "123456"; state.authMode = "login"; };
  $("authSubmit").onclick = () => guardAction(async () => {
    const body = { handle: $("handle").value, password: $("password").value, display_name: $("displayName")?.value };
    const endpoint = state.authMode === "register" ? "/api/register" : "/api/login";
    const result = await api(endpoint, { method: "POST", body });
    state.user = result.user;
    writeStoredUser(state.user);
    await load();
  });
}

function bindApp() {
  document.querySelectorAll("[data-view]").forEach(el => el.onclick = () => { state.view = el.dataset.view; state.drawer = false; render(); });
  document.querySelectorAll("[data-drawer]").forEach(el => el.onclick = () => { state.drawer = true; render(); });
  document.querySelectorAll("[data-close-drawer]").forEach(el => el.onclick = () => { state.drawer = false; render(); });
  document.querySelectorAll("[data-compose]").forEach(el => el.onclick = () => window.scrollTo({ top: 0, behavior: "smooth" }));
  document.querySelectorAll("[data-open-post]").forEach(el => el.onclick = () => guardAction(async () => { await api(`/api/posts/${el.dataset.openPost}/view`, { method: "POST" }); state.modal = { type: "post", postId: el.dataset.openPost }; await load(); render(); }));
  document.querySelectorAll("[data-interact]").forEach(el => el.onclick = () => guardAction(async () => { const [id, kind] = el.dataset.interact.split(":"); await api(`/api/posts/${id}/interaction`, { method: "POST", body: { user_id: state.user.id, kind } }); await load(); }));
  document.querySelectorAll("[data-follow]").forEach(el => el.onclick = () => guardAction(async () => { await api("/api/follow", { method: "POST", body: { follower_id: state.user.id, following_id: el.dataset.follow } }); await load(); }));
  document.querySelectorAll("[data-user]").forEach(el => el.onclick = () => { state.modal = { type: "user", userId: el.dataset.user }; render(); });
  document.querySelectorAll("[data-chat]").forEach(el => el.onclick = () => { state.modal = { type: "chat", peerId: el.dataset.chat }; render(); });
  document.querySelectorAll("[data-delete-chat]").forEach(el => el.onclick = () => guardAction(async () => { await api(`/api/conversations/${el.dataset.deleteChat}?user_id=${state.user.id}`, { method: "DELETE" }); await load(); }));
  document.querySelectorAll("[data-close-modal]").forEach(el => el.onclick = () => { state.modal = null; state.replyToUserId = null; render(); });
  document.querySelectorAll("[data-settings]").forEach(el => el.onclick = () => { state.drawer = false; state.modal = { type: el.dataset.settings }; render(); });
  document.querySelectorAll("[data-save-account]").forEach(el => el.onclick = () => guardAction(saveAccount));
  document.querySelectorAll("[data-member]").forEach(el => el.onclick = () => guardAction(async () => { await updateUser({ membership_tier: el.dataset.member, is_verified: el.dataset.member !== "free" ? 1 : 0 }); }));
  document.querySelectorAll("[data-reply]").forEach(el => el.onclick = () => { state.replyToUserId = el.dataset.reply; render(); });
  document.querySelectorAll("[data-clear-reply]").forEach(el => el.onclick = () => { state.replyToUserId = null; render(); });
  document.querySelectorAll("[data-comment]").forEach(el => el.onclick = () => guardAction(async () => { await api(`/api/posts/${el.dataset.comment}/comments`, { method: "POST", body: { user_id: state.user.id, content: $("commentText").value, reply_to_user_id: state.replyToUserId } }); state.replyToUserId = null; await load(); state.modal = { type: "post", postId: el.dataset.comment }; render(); }));
  document.querySelectorAll("[data-comment-like]").forEach(el => el.onclick = () => guardAction(async () => { await api(`/api/comments/${el.dataset.commentLike}/like`, { method: "POST", body: { user_id: state.user.id } }); await load(); render(); }));
  document.querySelectorAll("[data-send-message]").forEach(el => el.onclick = () => guardAction(async () => { await api("/api/messages", { method: "POST", body: { sender_id: state.user.id, receiver_id: el.dataset.sendMessage, content: $("messageText").value } }); await load(); state.modal = { type: "chat", peerId: el.dataset.sendMessage }; render(); }));
  document.querySelectorAll("[data-send-image]").forEach(el => el.onclick = () => guardAction(async () => { await api("/api/messages", { method: "POST", body: { sender_id: state.user.id, receiver_id: el.dataset.sendImage, content: "发送了一张图片", attachment_symbol: "photo" } }); await load(); state.modal = { type: "chat", peerId: el.dataset.sendImage }; render(); }));
  const publish = $("publish");
  if (publish) publish.onclick = () => guardAction(async () => { const text = $("composerText").value.trim(); if (!text) return; await api("/api/posts", { method: "POST", body: { user_id: state.user.id, content: text } }); await load(); });
  document.querySelectorAll("[data-library]").forEach(el => el.onclick = () => openLibrary(el.dataset.library));
  document.querySelectorAll("[data-logout]").forEach(el => el.onclick = () => { clearStoredUser(); state.user = null; state.drawer = false; render(); });
}

async function saveAccount() {
  const body = {
    handle: $("accountHandle").value,
    email: $("accountEmail").value,
    display_name: $("accountName").value,
  };
  const password = $("accountPassword").value.trim();
  if (password) body.password = password;
  await updateUser(body);
}

async function updateUser(body) {
  const result = await api(`/api/users/${state.user.id}`, { method: "PATCH", body });
  state.user = result.user;
  writeStoredUser(state.user);
  await load();
  state.modal = null;
  render();
}

function openLibrary(kind) {
  const posts = state.data.posts.filter(p => kind === "like" ? p.liked : p.bookmarked);
  state.modal = { title: kind === "like" ? "喜欢" : "书签", html: posts.map(postCard).join("") || `<p class="muted">暂无内容</p>` };
  render();
}

function topicRanks() {
  const map = new Map();
  state.data.posts.forEach(p => (p.content.match(/#[^\s#]+/g) || []).forEach(tag => {
    const cur = map.get(tag) || { tag, heat: 0, count: 0 };
    cur.heat += p.view_count + (p.like_count || 0) * 160;
    cur.count += 1;
    map.set(tag, cur);
  }));
  return [...map.values()].sort((a, b) => b.heat - a.heat);
}

function conversationPeers() {
  const ids = new Set();
  state.data.messages.forEach(m => {
    if (m.sender_id === state.user.id) ids.add(m.receiver_id);
    if (m.receiver_id === state.user.id) ids.add(m.sender_id);
  });
  state.data.users.filter(u => u.id !== state.user.id).slice(0, 4).forEach(u => ids.add(u.id));
  return [...ids].map(userById).filter(Boolean);
}

function latestMessage(peerId) {
  return state.data.messages.filter(m => (m.sender_id === state.user.id && m.receiver_id === peerId) || (m.sender_id === peerId && m.receiver_id === state.user.id)).at(-1);
}

function userById(id) { return state.data.users.find(u => u.id === id); }
function userName(id) { return userById(id)?.display_name || "有人"; }
function initial(name) { return (name || "?").slice(0, 1).toUpperCase(); }
function symbol(value) { return value === "swift" ? "◆" : initial(value); }
function relative(value) { const diff = (Date.now() - new Date(value).getTime()) / 60000; return diff < 60 ? `${Math.max(1, Math.floor(diff))} 分钟` : `${Math.floor(diff / 60)} 小时`; }
function escapeHtml(value) { return String(value || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c])); }

load();
