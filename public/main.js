const BASE = "/watch-party/";
const PATH = window.location.pathname;
const ROOM_MATCH = PATH.match(/^\/watch-party\/r\/([A-Za-z0-9_-]+)\/?$/);
const ROOM_ID = ROOM_MATCH ? ROOM_MATCH[1] : null;

const lobbyEl = document.getElementById("lobby");
const roomEl = document.getElementById("room");
const adminDashEl = document.getElementById("admin-dashboard");
const passwordModalEl = document.getElementById("password-modal");
const lobbyError = document.getElementById("lobby-error");

function safeGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
}
function sessGet(key) {
  try { return sessionStorage.getItem(key); } catch { return null; }
}
function sessSet(key, value) {
  try { sessionStorage.setItem(key, value); } catch { /* ignore */ }
}
function sessDel(key) {
  try { sessionStorage.removeItem(key); } catch { /* ignore */ }
}

function showLobbyError(msg) {
  if (lobbyError) { lobbyError.textContent = msg; lobbyError.hidden = false; }
}
function clearLobbyError() {
  if (lobbyError) { lobbyError.textContent = ""; lobbyError.hidden = true; }
}
function persistName(name) {
  if (name && name.trim()) safeSet("wp-name", name.trim().slice(0, 40));
}
function getClientId() {
  let cid = safeGet("wp-client-id");
  if (!cid) {
    cid = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
    safeSet("wp-client-id", cid);
  }
  return cid;
}
function extractRoomId(raw) {
  const m = raw.match(/\/r\/([A-Za-z0-9_-]+)/);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]+$/.test(raw)) return raw;
  return null;
}

function resizeImage(file, maxSz, cb) {
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      let w = img.width, h = img.height;
      if (w > maxSz || h > maxSz) {
        if (w > h) { h = Math.round(h * maxSz / w); w = maxSz; }
        else { w = Math.round(w * maxSz / h); h = maxSz; }
      }
      c.width = w; c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      cb(c.toDataURL("image/png"));
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

const EMOJI_CATS = [
  { name: "Smileys", icon: "\u{1F60A}", items: ["\u{1F600}","\u{1F603}","\u{1F604}","\u{1F601}","\u{1F602}","\u{1F923}","\u{1F605}","\u{1F606}","\u{1F60D}","\u{1F970}","\u{1F618}","\u{1F60E}","\u{1F929}","\u{1F607}","\u{1F917}","\u{1F914}","\u{1F60F}","\u{1F612}","\u{1F622}","\u{1F62D}","\u{1F624}","\u{1F92C}","\u{1F92F}","\u{1F631}","\u{1F973}","\u{1F634}","\u{1F92E}","\u{1F911}","\u{1F608}","\u{1F480}"] },
  { name: "Gestures", icon: "\u{1F44B}", items: ["\u{1F44D}","\u{1F44E}","\u{1F44F}","\u{1F64C}","\u{1F91D}","\u270C\uFE0F","\u{1F91E}","\u{1F91F}","\u{1F918}","\u{1F44A}","\u270A","\u{1F4AA}","\u{1F64F}","\u{1F44B}","\u{1FAF6}"] },
  { name: "Hearts", icon: "\u2764\uFE0F", items: ["\u2764\uFE0F","\u{1F9E1}","\u{1F49B}","\u{1F49A}","\u{1F499}","\u{1F49C}","\u{1F5A4}","\u{1F90D}","\u{1F494}","\u2764\uFE0F\u200D\u{1F525}","\u{1F495}","\u{1F49E}","\u{1F493}","\u{1F497}","\u{1F496}","\u{1F498}"] },
  { name: "Animals", icon: "\u{1F431}", items: ["\u{1F436}","\u{1F431}","\u{1F42D}","\u{1F439}","\u{1F430}","\u{1F98A}","\u{1F43B}","\u{1F43C}","\u{1F428}","\u{1F42F}","\u{1F981}","\u{1F42E}","\u{1F437}","\u{1F438}","\u{1F435}","\u{1F414}","\u{1F984}","\u{1F41D}","\u{1F98B}","\u{1F419}"] },
  { name: "Food", icon: "\u{1F355}", items: ["\u{1F355}","\u{1F354}","\u{1F35F}","\u{1F32E}","\u{1F37F}","\u{1F9C1}","\u{1F370}","\u{1F369}","\u{1F36B}","\u2615","\u{1F37A}","\u{1F964}","\u{1F377}","\u{1F942}","\u{1F35C}","\u{1F363}"] },
  { name: "Fun", icon: "\u{1F3AE}", items: ["\u26BD","\u{1F3C0}","\u{1F3AE}","\u{1F3AC}","\u{1F3B5}","\u{1F3A4}","\u{1F3B8}","\u{1F3AF}","\u{1F3B2}","\u{1F3C6}","\u{1F3AA}","\u{1F3AD}","\u{1F3A8}","\u{1F3BB}","\u{1F3B9}","\u{1F3B7}"] },
  { name: "Things", icon: "\u{1F4A1}", items: ["\u{1F4A1}","\u{1F525}","\u2B50","\u2728","\u{1F4AB}","\u{1F308}","\u2600\uFE0F","\u{1F319}","\u{1F48E}","\u{1F381}","\u{1F389}","\u{1F38A}","\u{1F697}","\u2708\uFE0F","\u{1F680}","\u{1F4AF}"] },
];

const STICKER_BASE = "/watch-party/stickers/";
const BUILTIN_STICKERS = [
  { id: "lol", label: "LOL" },
  { id: "fire", label: "Fire" },
  { id: "love", label: "Love" },
  { id: "thumbsup", label: "Thumbs Up" },
  { id: "clap", label: "Clap" },
  { id: "cry", label: "Cry" },
  { id: "mind-blown", label: "Mind Blown" },
  { id: "party", label: "Party" },
  { id: "cool", label: "Cool" },
  { id: "angry", label: "Angry" },
  { id: "scared", label: "Scared" },
  { id: "thinking", label: "Thinking" },
  { id: "heart-eyes", label: "Heart Eyes" },
  { id: "skull", label: "Dead" },
  { id: "rocket", label: "Rocket" },
  { id: "hundred", label: "100" },
  { id: "wave", label: "Wave" },
  { id: "pray", label: "Pray" },
  { id: "star-eyes", label: "Star Eyes" },
  { id: "muscle", label: "Strong" },
];

function getCustomStickers() {
  const raw = safeGet("wp-stickers");
  try { return raw ? JSON.parse(raw) : []; } catch { return []; }
}
function saveCustomStickers(arr) {
  safeSet("wp-stickers", JSON.stringify(arr));
}

const TOAST_ICONS = {
  info: "\u2139\uFE0F",
  success: "\u2705",
  warning: "\u26A0\uFE0F",
  error: "\u274C",
};

function showToast(message, type = "info", duration = 4000) {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;

  const icon = document.createElement("span");
  icon.className = "toast-icon";
  icon.textContent = TOAST_ICONS[type] || TOAST_ICONS.info;
  toast.appendChild(icon);

  const body = document.createElement("span");
  body.className = "toast-body";
  body.textContent = message;
  toast.appendChild(body);

  const close = document.createElement("button");
  close.className = "toast-close";
  close.textContent = "\u00D7";
  close.addEventListener("click", () => dismissToast(toast));
  toast.appendChild(close);

  const progress = document.createElement("div");
  progress.className = "toast-progress";
  progress.style.animationDuration = `${duration}ms`;
  toast.appendChild(progress);

  container.appendChild(toast);

  const timer = setTimeout(() => dismissToast(toast), duration);
  toast._timer = timer;

  const maxToasts = 5;
  const overflow = container.children.length - maxToasts;
  for (let i = 0; i < overflow; i++) {
    const old = container.children[0];
    if (old && old._timer) clearTimeout(old._timer);
    if (old && old.parentNode) old.parentNode.removeChild(old);
  }
}

function dismissToast(toast) {
  if (!toast || !toast.parentNode) return;
  if (toast._timer) clearTimeout(toast._timer);
  toast.classList.add("toast-out");
  toast.addEventListener("animationend", () => {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
  }, { once: true });
}

let isSuperAdmin = false;
const myName = safeGet("wp-name") || "Guest";

const socket = io({ path: `${BASE}socket.io` });

function showView(name) {
  lobbyEl.hidden = name !== "lobby";
  roomEl.hidden = name !== "room";
  adminDashEl.hidden = name !== "admin-dashboard";
  const adminLoginEl = document.getElementById("admin-login");
  if (adminLoginEl) adminLoginEl.hidden = name !== "admin-login";
  const pendingEl = document.getElementById("pending-screen");
  if (pendingEl) pendingEl.hidden = name !== "pending-screen";
}

function detectSourceType(url) {
  if (typeof url !== "string") return null;
  const clean = url.toLowerCase().split("?")[0].split("#")[0];
  if (clean.endsWith(".m3u8") || clean.endsWith(".m3u")) return "hls";
  if (clean.endsWith(".mpd")) return "dash";
  if (/\.(mp4|webm|ogg|mov|m4v|mkv|ts|f4v|3gp|avi|wmv|flv)$/i.test(clean)) return "mp4";
  // URL patterns that indicate HLS/DASH even without extension
  if (/\/manifest\.m3u8/i.test(url) || /format=m3u8/i.test(url)) return "hls";
  if (/\/manifest\.mpd/i.test(url) || /format=mpd/i.test(url)) return "dash";
  return null;
}

function enterRoom(roomId) {
  window.location.href = `${BASE}r/${roomId}`;
}

function getRoleName(role) {
  switch (role) {
    case "superadmin": return "Super Admin";
    case "host": return "Host";
    case "admin": return "Admin";
    case "muted": return "Muted";
    default: return "Member";
  }
}

function getRoleIcon(role) {
  switch (role) {
    case "superadmin": return "\u2B50";
    case "host": return "\u{1F451}";
    case "admin": return "\u{1F6E1}\uFE0F";
    case "muted": return "\u{1F507}";
    default: return "";
  }
}

socket.on("admin-login-result", ({ success, token }) => {
  if (success) {
    isSuperAdmin = true;
    if (token) sessSet("wp-admin-token", token);
    if (!ROOM_ID) {
      showView("admin-dashboard");
      startAdminDashboard();
    }
  } else {
    if (!ROOM_ID) {
      const adminError = document.getElementById("admin-error");
      if (adminError) {
        adminError.textContent = "Invalid credentials.";
        adminError.hidden = false;
      }
    } else {
      showToast("Invalid admin credentials.", "error");
    }
  }
});

socket.on("admin-session-revoked", ({ reason }) => {
  isSuperAdmin = false;
  sessDel("wp-admin-token");
  showToast(reason || "Super Admin session ended — logged in from another session", "warning");
  if (document.getElementById("admin-dashboard") && !document.getElementById("admin-dashboard").hidden) {
    showView("lobby");
  }
  renderUserList();
});

socket.on("kicked", ({ reason }) => {
  alert(reason);
  window.location.href = BASE;
});

socket.on("connect", () => {
  const adminToken = sessGet("wp-admin-token");
  if (adminToken) {
    socket.emit("admin-token-login", { token: adminToken });
  }
});

if (!ROOM_ID) {
  showView("lobby");
  initLobby();
} else {
  showView("room");
  initRoom(ROOM_ID);
}

function initLobby() {
  const nameInput = document.getElementById("lobby-name");
  nameInput.value = safeGet("wp-name") || "";
  const createBtn = document.getElementById("create-room-btn");

  createBtn.addEventListener("click", async () => {
    clearLobbyError();
    persistName(nameInput.value);
    createBtn.disabled = true;
    createBtn.textContent = "Creating\u2026";
    try {
      const pw = document.getElementById("create-room-password").value.trim();
      const res = await fetch(`${BASE}api/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pw ? { password: pw } : {}),
      });
      if (!res.ok) {
        showLobbyError("Could not create room. Please try again.");
        return;
      }
      const { id, token } = await res.json();
      if (token) sessSet("wp-room-token-" + id, token);
      enterRoom(id);
    } catch (err) {
      console.error("create-room failed", err);
      showLobbyError("Network error \u2014 could not create room.");
    } finally {
      createBtn.disabled = false;
      createBtn.textContent = "Create new room";
    }
  });

  document.getElementById("join-form").addEventListener("submit", (e) => {
    e.preventDefault();
    clearLobbyError();
    persistName(nameInput.value);
    const raw = document.getElementById("join-room-id").value.trim();
    if (!raw) return;
    const id = extractRoomId(raw);
    if (!id) {
      showLobbyError("That doesn't look like a valid room ID or URL.");
      return;
    }
    enterRoom(id);
  });

  const openAdminBtn = document.getElementById("open-admin-btn");
  if (openAdminBtn) {
    openAdminBtn.addEventListener("click", () => {
      showView("admin-login");
      const u = document.getElementById("admin-username");
      if (u) u.focus();
    });
  }
  const adminBackBtn = document.getElementById("admin-back-btn");
  if (adminBackBtn) {
    adminBackBtn.addEventListener("click", () => showView("lobby"));
  }
  const adminLoginBtn = document.getElementById("admin-login-btn");
  const adminError = document.getElementById("admin-error");
  adminLoginBtn.addEventListener("click", () => {
    const username = document.getElementById("admin-username").value.trim();
    const password = document.getElementById("admin-password").value;
    if (!username || !password) {
      adminError.textContent = "Enter both username and password.";
      adminError.hidden = false;
      return;
    }
    adminError.hidden = true;
    socket.emit("admin-login", { username, password });
  });
  const adminPwInput = document.getElementById("admin-password");
  if (adminPwInput) {
    adminPwInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") adminLoginBtn.click();
    });
  }
}

let adminRefreshInterval = null;

socket.on("admin-rooms", ({ rooms }) => {
  renderAdminRooms(rooms);
});

function startAdminDashboard() {
  socket.emit("admin-list-rooms");
  socket.emit("admin-global-history");
  if (adminRefreshInterval) clearInterval(adminRefreshInterval);
  adminRefreshInterval = setInterval(() => {
    if (!adminDashEl.hidden) {
      socket.emit("admin-list-rooms");
      socket.emit("admin-global-history");
    }
  }, 5000);

  document.getElementById("admin-refresh-btn").onclick = () => {
    socket.emit("admin-list-rooms");
    socket.emit("admin-global-history");
  };
  document.getElementById("admin-logout-btn").onclick = () => {
    sessDel("wp-admin-token");
    isSuperAdmin = false;
    if (adminRefreshInterval) clearInterval(adminRefreshInterval);
    showView("lobby");
  };
}

function renderAdminHistory(historyList) {
  const container = document.getElementById("admin-global-history");
  if (!container) return;
  container.innerHTML = "";
  if (!historyList || historyList.length === 0) {
    container.innerHTML = '<p class="hint">No history yet.</p>';
    return;
  }
  historyList.forEach(item => {
    const d = document.createElement("div");
    d.className = "history-item";
    d.style.padding = "8px";
    d.style.borderBottom = "1px solid var(--border)";
    d.innerHTML = `
      <div style="font-size: 11px; color: var(--text-muted);">${new Date(item.timestamp).toLocaleString()} - Room: ${item.roomId}</div>
      <div style="font-size: 13px; color: var(--primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.url}</div>
      <div style="font-size: 12px;">Played by: ${item.playedByName || 'Unknown'}</div>
    `;
    container.appendChild(d);
  });
}

socket.on("admin-global-history-result", ({ history }) => {
  renderAdminHistory(history);
});

function renderAdminRooms(roomsList) {
  const container = document.getElementById("admin-room-list");
  container.innerHTML = "";
  if (!roomsList || roomsList.length === 0) {
    container.innerHTML = '<p class="hint">No active rooms.</p>';
    return;
  }
  roomsList.forEach((room) => {
    const card = document.createElement("div");
    card.className = "admin-room-card";

    const info = document.createElement("div");
    info.className = "admin-room-info";
    const idDiv = document.createElement("div");
    idDiv.className = "admin-room-id";
    idDiv.textContent = room.id;
    const metaDiv = document.createElement("div");
    metaDiv.className = "admin-room-meta";
    let meta = `${room.participantCount} user${room.participantCount !== 1 ? "s" : ""}`;
    if (room.hasPassword) meta += " \u2022 \u{1F512}";
    if (room.hostName) meta += ` \u2022 Host: ${room.hostName}`;
    metaDiv.textContent = meta;
    info.appendChild(idDiv);
    info.appendChild(metaDiv);
    card.appendChild(info);

    const actions = document.createElement("div");
    actions.className = "admin-room-actions";
    const joinBtn = document.createElement("button");
    joinBtn.className = "btn btn-primary btn-sm";
    joinBtn.textContent = "Join";
    joinBtn.addEventListener("click", () => enterRoom(room.id));
    const delBtn = document.createElement("button");
    delBtn.className = "btn btn-danger btn-sm";
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", () => {
      socket.emit("admin-delete-room", { roomId: room.id });
      setTimeout(() => socket.emit("admin-list-rooms"), 300);
    });
    actions.appendChild(joinBtn);
    actions.appendChild(delBtn);
    card.appendChild(actions);
    container.appendChild(card);
  });
}

function initRoom(roomId) {
  document.getElementById("room-id-display").textContent = roomId;

  let myId = null;
  let myRole = "member";
  let roomHostId = null;
  let hostSocketId = null;
  let hostStreamKind = null;
  let participantList = [];
  let voteList = [];
  let queueList = [];
  let suggestionsList = [];
  let roomHistoryList = [];
  let pendingList = [];
  let requireApproval = false;
  let lastPassword = null;

  let playerKind = null;
  const mp4El = document.getElementById("mp4-player");
  const rtcEl = document.getElementById("rtc-player");
  let ytPlayer = null;
  let ytSeekPollId = null;
  let suppress = false;
  const SEEK_THRESHOLD = 1.5;

  let localStream = null;
  let isHosting = false;
  let hostKind = null;
  let fileStreamVideo = null;
  let fileStreamUrl = null;
  const peers = new Map();
  const ICE_SERVERS = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];

  window.onYouTubeIframeAPIReady = () => {};

  function flashStatus(text, type = "info") {
    showToast(text, type);
  }

  const connDot = document.getElementById("conn-dot");
  function updateConnStatus(connected) {
    if (connDot) {
      connDot.classList.toggle("disconnected", !connected);
      connDot.setAttribute("aria-label", connected ? "Connected" : "Disconnected");
    }
  }
  socket.on("connect", () => updateConnStatus(true));
  socket.on("disconnect", () => updateConnStatus(false));
  updateConnStatus(socket.connected);

  function canIControl() {
    return myRole === "host" || myRole === "admin" || myRole === "superadmin";
  }
  function canIModerate() {
    return canIControl();
  }

  function updatePlayerControls() {
    const ctrl = canIControl();
    const mp4 = document.getElementById("mp4-player");
    mp4.controls = ctrl;
    mp4.style.pointerEvents = ctrl ? "" : "none";
    const overlay = document.getElementById("player-overlay");
    if (overlay) overlay.hidden = ctrl;
    const ytContainer = document.getElementById("yt-player");
    if (ytContainer) {
      const iframe = ytContainer.tagName === "IFRAME" ? ytContainer : ytContainer.querySelector("iframe");
      if (iframe) iframe.style.pointerEvents = ctrl ? "" : "none";
    }
  }

  function updateRoleUI() {
    const badgeEl = document.getElementById("my-role-badge");
    const icon = getRoleIcon(myRole);
    badgeEl.className = `role-badge role-${myRole}`;
    badgeEl.textContent = icon ? `${icon} ${getRoleName(myRole)}` : getRoleName(myRole);

    const sourceBar = document.getElementById("source-bar");
    const viewerBar = document.getElementById("viewer-bar");
    sourceBar.hidden = !canIControl();
    viewerBar.hidden = canIControl();

    const pwBtn = document.getElementById("room-pw-btn");
    if (pwBtn) pwBtn.hidden = !(myRole === "host" || myRole === "admin" || isSuperAdmin);

    const settingsBtn = document.getElementById("room-settings-btn");
    if (settingsBtn) settingsBtn.hidden = !(myRole === "host" || myRole === "admin" || isSuperAdmin);

    const pendingTabBtn = document.querySelector('.panel-tab[data-tab="pending"]');
    if (pendingTabBtn) pendingTabBtn.hidden = !(myRole === "host" || myRole === "admin" || isSuperAdmin);

    const playTopBtn = document.getElementById("play-top-btn");
    if (playTopBtn) playTopBtn.hidden = !canIControl() || voteList.length === 0;

    const chatForm = document.getElementById("chat-form");
    const mutedNotice = document.getElementById("muted-notice");
    const suggestForm = document.getElementById("suggest-form");
    const suggestMuted = document.getElementById("suggest-muted");
    if (myRole === "muted") {
      chatForm.hidden = true;
      mutedNotice.hidden = false;
      suggestForm.hidden = true;
      suggestMuted.hidden = false;
    } else {
      chatForm.hidden = false;
      mutedNotice.hidden = true;
      suggestForm.hidden = false;
      suggestMuted.hidden = true;
    }

    updatePlayerControls();
  }

  function renderUserList() {
    const container = document.getElementById("user-list");
    container.innerHTML = "";
    document.getElementById("user-count").textContent = String(participantList.length);

    participantList.forEach((p) => {
      const item = document.createElement("div");
      item.className = "user-item";

      const nameSpan = document.createElement("span");
      nameSpan.className = "user-name" + (p.id === myId ? " user-you" : "");
      nameSpan.textContent = p.name + (p.id === myId ? " (you)" : "");
      item.appendChild(nameSpan);

      const badge = document.createElement("span");
      badge.className = `role-badge role-${p.role}`;
      const icon = getRoleIcon(p.role);
      badge.textContent = icon ? `${icon} ${getRoleName(p.role)}` : getRoleName(p.role);
      item.appendChild(badge);

      if (p.id === hostSocketId) {
        const live = document.createElement("span");
        live.className = "live-badge";
        live.title = "Currently streaming to the room";
        live.innerHTML = '<span class="live-dot"></span>LIVE';
        item.appendChild(live);
      }

      if (p.id !== myId) {
        const actions = document.createElement("div");
        actions.className = "user-actions";
        let hasActions = false;

        const canModTarget = canIModerate() && p.role !== "superadmin" &&
          !(p.role === "host" && !isSuperAdmin) &&
          !(p.role === "admin" && !isSuperAdmin && myRole !== "host");

        if (canModTarget) {
          if (p.role === "muted") {
            const btn = document.createElement("button");
            btn.className = "btn btn-sm";
            btn.textContent = "Unmute";
            btn.addEventListener("click", () => socket.emit("unmute-user", { targetId: p.id }));
            actions.appendChild(btn);
          } else {
            const btn = document.createElement("button");
            btn.className = "btn btn-sm";
            btn.textContent = "Mute";
            btn.addEventListener("click", () => socket.emit("mute-user", { targetId: p.id }));
            actions.appendChild(btn);
          }
          const kickBtn = document.createElement("button");
          kickBtn.className = "btn btn-sm btn-danger";
          kickBtn.textContent = "Kick";
          kickBtn.addEventListener("click", () => socket.emit("kick-user", { targetId: p.id }));
          actions.appendChild(kickBtn);
          const banBtn = document.createElement("button");
          banBtn.className = "btn btn-sm btn-danger";
          banBtn.textContent = "Ban";
          banBtn.addEventListener("click", () => socket.emit("ban-user", { targetId: p.id }));
          actions.appendChild(banBtn);
          hasActions = true;
        }

        if ((myRole === "host" || isSuperAdmin) && p.role !== "superadmin" && p.role !== "host") {
          if (p.role === "admin") {
            const btn = document.createElement("button");
            btn.className = "btn btn-sm";
            btn.textContent = "Remove Admin";
            btn.addEventListener("click", () => socket.emit("remove-admin", { targetId: p.id }));
            actions.appendChild(btn);
          } else if (p.role !== "muted") {
            const btn = document.createElement("button");
            btn.className = "btn btn-sm btn-primary";
            btn.textContent = "Make Admin";
            btn.addEventListener("click", () => socket.emit("assign-admin", { targetId: p.id }));
            actions.appendChild(btn);
          }
          hasActions = true;
        }

        if (isSuperAdmin && p.role === "host") {
          const removeHostBtn = document.createElement("button");
          removeHostBtn.className = "btn btn-sm btn-danger";
          removeHostBtn.textContent = "Remove Host";
          removeHostBtn.addEventListener("click", () => {
            if (confirm(`Remove ${p.name} as Host? They will become a normal member.`)) {
              socket.emit("remove-host", { targetId: p.id });
            }
          });
          actions.appendChild(removeHostBtn);
          hasActions = true;
        }

        if ((myRole === "host" || isSuperAdmin) && p.role !== "superadmin") {
          const transferBtn = document.createElement("button");
          transferBtn.className = "btn btn-sm btn-transfer";
          transferBtn.textContent = "Transfer Host";
          transferBtn.addEventListener("click", () => {
            if (confirm(`Transfer Host role to ${p.name}? You will become an Admin.`)) {
              socket.emit("transfer-host", { targetId: p.id });
            }
          });
          actions.appendChild(transferBtn);
          hasActions = true;
        }

        if (hasActions) item.appendChild(actions);
      }

      container.appendChild(item);
    });
  }

  function renderVoteList() {
    const container = document.getElementById("vote-list");
    container.innerHTML = "";
    document.getElementById("vote-count").textContent = String(voteList.length);

    const playTopBtn = document.getElementById("play-top-btn");
    if (playTopBtn) playTopBtn.hidden = !canIControl() || voteList.length === 0;

    if (voteList.length === 0) {
      container.innerHTML = '<div class="vote-empty">No suggestions yet. Suggest a video below.</div>';
      return;
    }

    const sorted = [...voteList].sort((a, b) => (b.voteCount || 0) - (a.voteCount || 0));
    const topCount = sorted[0]?.voteCount || 0;

    sorted.forEach((v, idx) => {
      const card = document.createElement("div");
      card.className = "vote-card" + (idx === 0 && topCount > 0 ? " vote-top" : "");

      if (idx === 0 && topCount > 0) {
        const badge = document.createElement("span");
        badge.className = "top-badge";
        badge.textContent = "🔥 Top";
        card.appendChild(badge);
      }

      const urlDiv = document.createElement("div");
      urlDiv.className = "vote-url";
      urlDiv.textContent = v.url;
      card.appendChild(urlDiv);

      const metaDiv = document.createElement("div");
      metaDiv.className = "vote-meta";
      metaDiv.textContent = `Suggested by ${v.suggestedByName}`;
      card.appendChild(metaDiv);

      const actionsDiv = document.createElement("div");
      actionsDiv.className = "vote-actions";

      const countSpan = document.createElement("span");
      countSpan.className = "vote-count";
      countSpan.textContent = `${v.voteCount} vote${v.voteCount !== 1 ? "s" : ""}`;
      actionsDiv.appendChild(countSpan);

      const hasVoted = v.voters && v.voters.includes(myId);
      const voteBtn = document.createElement("button");
      voteBtn.className = `btn btn-sm${hasVoted ? " btn-primary" : ""}`;
      voteBtn.textContent = hasVoted ? "Voted" : "Vote";
      voteBtn.addEventListener("click", () => socket.emit("vote-video", { voteId: v.id }));
      actionsDiv.appendChild(voteBtn);

      if (canIControl()) {
        const approveBtn = document.createElement("button");
        approveBtn.className = "btn btn-sm btn-primary";
        approveBtn.textContent = "Approve";
        approveBtn.addEventListener("click", () => socket.emit("approve-video", { voteId: v.id }));
        actionsDiv.appendChild(approveBtn);

        const rejectBtn = document.createElement("button");
        rejectBtn.className = "btn btn-sm btn-danger";
        rejectBtn.textContent = "Reject";
        rejectBtn.addEventListener("click", () => socket.emit("reject-video", { voteId: v.id }));
        actionsDiv.appendChild(rejectBtn);
      }

      card.appendChild(actionsDiv);
      container.appendChild(card);
    });
  }

  function renderPendingList() {
    const container = document.getElementById("pending-list");
    if (!container) return;
    container.innerHTML = "";
    const countEl = document.getElementById("pending-count");
    if (countEl) countEl.textContent = String(pendingList.length);

    const tabBtn = document.querySelector('.panel-tab[data-tab="pending"]');
    if (tabBtn) tabBtn.classList.toggle("has-alert", pendingList.length > 0);

    if (pendingList.length === 0) {
      container.innerHTML = '<div class="vote-empty">No one is waiting.</div>';
      return;
    }
    pendingList.forEach((p) => {
      const card = document.createElement("div");
      card.className = "pending-item";
      const name = document.createElement("div");
      name.className = "pending-name";
      name.textContent = p.name;
      card.appendChild(name);
      const actions = document.createElement("div");
      actions.className = "pending-actions";
      const ok = document.createElement("button");
      ok.className = "btn btn-sm btn-primary";
      ok.textContent = "Approve";
      ok.addEventListener("click", () => socket.emit("approve-join", { targetId: p.id }));
      const no = document.createElement("button");
      no.className = "btn btn-sm btn-danger";
      no.textContent = "Deny";
      no.addEventListener("click", () => socket.emit("deny-join", { targetId: p.id }));
      actions.appendChild(ok);
      actions.appendChild(no);
      card.appendChild(actions);
      container.appendChild(card);
    });
  }

  const panelTabs = document.querySelectorAll(".panel-tab");
  const tabContents = {
    chat: document.getElementById("tab-chat"),
    users: document.getElementById("tab-users"),
    votes: document.getElementById("tab-votes"),
    pending: document.getElementById("tab-pending"),
  };
  panelTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.tab;
      panelTabs.forEach((t) => t.classList.toggle("active", t.dataset.tab === target));
      Object.entries(tabContents).forEach(([key, el]) => {
        el.classList.toggle("active-tab", key === target);
        el.hidden = key !== target;
      });
    });
  });

  const toggleChatBtn = document.getElementById("toggle-chat-btn");
  const closeChatBtn = document.getElementById("close-chat-btn");
  toggleChatBtn.addEventListener("click", () => {
    document.body.classList.toggle("chat-open");
    if (document.body.classList.contains("chat-open")) {
      clearChatBadge();
      document.getElementById("chat-input").focus();
    }
  });
  closeChatBtn.addEventListener("click", () => {
    document.body.classList.remove("chat-open");
  });

  document.getElementById("copy-link-btn").addEventListener("click", async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      flashStatus("Room link copied.", "success");
    } catch {
      flashStatus(`Copy failed. Share this URL: ${url}`, "warning");
    }
  });

  document.getElementById("back-lobby-btn").addEventListener("click", () => {
    window.location.href = BASE;
  });

  const pwBtn = document.getElementById("room-pw-btn");
  const pwModal = document.getElementById("room-pw-modal");
  const pwInput = document.getElementById("room-pw-input");
  const pwStatus = document.getElementById("room-pw-status");
  const pwToggle = document.getElementById("room-pw-toggle");
  const pwSave = document.getElementById("room-pw-save");
  const pwClear = document.getElementById("room-pw-clear");
  const pwCancel = document.getElementById("room-pw-cancel");

  function openPwModal() {
    pwInput.value = "";
    pwInput.type = "password";
    pwStatus.textContent = "Loading current password…";
    pwModal.hidden = false;
    socket.emit("get-room-password");
  }
  function closePwModal() { pwModal.hidden = true; }

  if (pwBtn) pwBtn.addEventListener("click", openPwModal);
  if (pwCancel) pwCancel.addEventListener("click", closePwModal);
  if (pwToggle) pwToggle.addEventListener("click", () => {
    pwInput.type = pwInput.type === "password" ? "text" : "password";
  });
  if (pwSave) pwSave.addEventListener("click", () => {
    socket.emit("set-room-password", { password: pwInput.value });
  });
  if (pwClear) pwClear.addEventListener("click", () => {
    pwInput.value = "";
    socket.emit("set-room-password", { password: "" });
  });

  socket.on("room-password-info", ({ hasPassword, password }) => {
    if (hasPassword) {
      pwInput.value = password || "";
      pwStatus.textContent = "Current password is set. Edit and Save to change, or Remove to make the room open.";
    } else {
      pwInput.value = "";
      pwStatus.textContent = "This room is currently open (no password).";
    }
  });
  socket.on("password-updated", ({ hasPassword, password }) => {
    if (hasPassword) {
      pwInput.value = password || pwInput.value;
      pwStatus.textContent = "Password updated.";
      showToast("Room password updated.", "success");
    } else {
      pwInput.value = "";
      pwStatus.textContent = "Room is now open (no password).";
      showToast("Room password removed.", "success");
    }
  });

  socket.on("connect", () => {
    const roomToken = sessGet("wp-room-token-" + roomId);
    const storedHostKey = sessGet("wp-host-key-" + roomId);
    socket.emit("join", {
      roomId,
      name: myName,
      token: roomToken || undefined,
      password: lastPassword || undefined,
      hostKey: storedHostKey || undefined,
      clientId: getClientId(),
    });
  });

  socket.on("state", (state) => {
    passwordModalEl.hidden = true;
    myId = state.youId;
    hostSocketId = state.hostSocketId;
    hostStreamKind = state.hostStreamKind;
    roomHostId = state.roomHostId;
    participantList = state.participants || [];
    voteList = state.votes || [];
    pendingList = state.pending || [];
    requireApproval = !!state.requireApproval;
    showView("room");

    if (state.hostKey) sessSet("wp-host-key-" + roomId, state.hostKey);

    if (state.isSuperAdmin) isSuperAdmin = true;
    myRole = state.myRole || "member";
    if (isSuperAdmin && myRole === "member") myRole = "superadmin";

    updateRoleUI();
    renderUserList();
    renderVoteList();
    renderPendingList();
    const at = document.getElementById("approval-toggle");
    if (at) at.checked = requireApproval;

    if (hostSocketId && hostSocketId !== myId) {
      showToast(`Connecting to host's ${hostStreamKind} share\u2026`, "info");
      mountRtc();
      requestStreamFromHost(hostSocketId);
    } else if (state.source) {
      if (state.sourcePage) currentSourcePage = state.sourcePage;
      loadSource(state.source, state.sourceType, state.currentTime, state.isPlaying);
    }

    if (state.voipPeers && state.voipPeers.length > 0) {
      state.voipPeers.forEach((pid) => {
        if (pid !== myId) {
          activeSpeakers.add(pid);
          createVoipOffer(pid);
        }
      });
    }
  });

  socket.on("approval-pending", () => {
    showView("pending-screen");
    const r = document.getElementById("pending-room-id");
    if (r) r.textContent = `Room: ${roomId}`;
  });

  socket.on("approval-denied", () => {
    showView("lobby");
    alert("Your request to join was denied by the host.");
    window.location.href = BASE;
  });

  socket.on("pending-updated", ({ pending }) => {
    pendingList = pending || [];
    renderPendingList();
  });

  socket.on("approval-mode-updated", ({ requireApproval: req }) => {
    requireApproval = !!req;
    const at = document.getElementById("approval-toggle");
    if (at) at.checked = requireApproval;
  });

  document.getElementById("pending-cancel-btn")?.addEventListener("click", () => {
    socket.emit("leave-room");
    window.location.href = BASE;
  });

  document.getElementById("room-settings-btn")?.addEventListener("click", () => {
    const m = document.getElementById("room-settings-modal");
    const at = document.getElementById("approval-toggle");
    if (at) at.checked = requireApproval;
    if (m) m.hidden = false;
  });
  document.getElementById("room-settings-close")?.addEventListener("click", () => {
    const m = document.getElementById("room-settings-modal");
    if (m) m.hidden = true;
  });
  document.getElementById("approval-toggle")?.addEventListener("change", (e) => {
    socket.emit("set-room-approval", { enabled: !!e.target.checked });
  });

  document.getElementById("play-top-btn")?.addEventListener("click", () => {
    if (!canIControl() || voteList.length === 0) return;
    socket.emit("play-top-suggestion");
  });

  socket.on("join-error", ({ reason }) => {
    if (reason === "password-required") {
      passwordModalEl.hidden = false;
      const pwError = document.getElementById("password-error");
      if (lastPassword) {
        pwError.textContent = "Wrong password. Try again.";
        pwError.hidden = false;
      }
    } else if (reason === "banned") {
      alert("You are banned from this room.");
      window.location.href = BASE;
    }
  });

  document.getElementById("password-submit").addEventListener("click", () => {
    const pw = document.getElementById("password-input").value;
    if (!pw) return;
    lastPassword = pw;
    const storedHostKey = sessGet("wp-host-key-" + roomId);
    socket.emit("join", { roomId, name: myName, password: pw, hostKey: storedHostKey || undefined, clientId: getClientId() });
  });
  document.getElementById("password-cancel").addEventListener("click", () => {
    passwordModalEl.hidden = true;
    window.location.href = BASE;
  });
  document.getElementById("password-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      document.getElementById("password-submit").click();
    }
  });

  socket.on("room-update", ({ roomHostId: newHostId, participants, votes, queue, suggestions, history }) => {
    roomHostId = newHostId;
    participantList = participants || [];
    voteList = votes || [];
    queueList = queue || [];
    suggestionsList = suggestions || [];
    roomHistoryList = history || [];

    const me = participantList.find((p) => p.id === myId);
    if (me) {
      myRole = me.role;
      if (isSuperAdmin) myRole = "superadmin";
    }

    updateRoleUI();
    renderUserList();
    renderVoteList();
    renderQueueAndSuggestions();
  });

  socket.on("votes-updated", ({ votes }) => {
    voteList = votes || [];
    renderVoteList();
  });

  socket.on("source-changed", ({ source, sourceType, sourcePage }) => {
    if (sourcePage) currentSourcePage = sourcePage;
    loadSource(source, sourceType, 0, false);
  });

  socket.on("play", ({ time }) => {
    if (hostSocketId) return;
    suppress = true;
    applySeek(time);
    applyPlay();
    setTimeout(() => (suppress = false), 250);
  });
  socket.on("pause", ({ time }) => {
    if (hostSocketId) return;
    suppress = true;
    applySeek(time);
    applyPause();
    setTimeout(() => (suppress = false), 250);
  });
  socket.on("seek", ({ time }) => {
    if (hostSocketId) return;
    suppress = true;
    applySeek(time);
    setTimeout(() => (suppress = false), 250);
  });

  const chatMessagesEl = document.getElementById("chat-messages");
  document.getElementById("chat-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = document.getElementById("chat-input");
    const text = input.value;
    if (!text.trim()) return;
    socket.emit("chat", { text });
    input.value = "";
  });

  socket.on("chat", (msg) => {
    appendMessage(msg, msg.from === myId);
    if (msg.from !== myId && !document.body.classList.contains("chat-open") && window.innerWidth <= 720) {
      bumpChatBadge();
    }
  });

  socket.on("chat-blocked", () => {
    flashStatus("You are muted and cannot send messages.", "error");
  });

  socket.on("system-message", ({ text }) => {
    appendSystemMessage(text);
  });

  socket.on("user-joined", ({ id, name }) => {
    appendSystemMessage(`${name} joined`);
    if (id && id !== myId && voipActive) {
      createVoipOffer(id);
    }
  });
  socket.on("user-left", ({ id }) => {
    appendSystemMessage("Someone left");
    if (id) {
      activeSpeakers.delete(id);
      const pc = voipPeers.get(id);
      if (pc) { try { pc.close(); } catch {} }
      voipPeers.delete(id);
      const a = voipAudios.get(id);
      if (a) { try { a.pause(); a.srcObject = null; } catch {} }
      voipAudios.delete(id);
    }
  });

  const emojiPickerEl = document.getElementById("emoji-picker");
  const emojiTabsEl = document.getElementById("emoji-tabs");
  const emojiGridEl = document.getElementById("emoji-grid");
  const emojiBtnEl = document.getElementById("emoji-btn");
  const stickerPickerEl = document.getElementById("sticker-picker");
  const stickerTabsEl = document.getElementById("sticker-tabs");
  const stickerGridEl = document.getElementById("sticker-grid");
  const stickerBtnEl = document.getElementById("sticker-btn");

  let activeEmojiCat = 0;
  EMOJI_CATS.forEach((cat, i) => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "picker-tab" + (i === 0 ? " active" : "");
    tab.textContent = cat.icon;
    tab.title = cat.name;
    tab.addEventListener("click", () => {
      activeEmojiCat = i;
      emojiTabsEl.querySelectorAll(".picker-tab").forEach((t, j) => t.classList.toggle("active", j === i));
      renderEmojiGrid(i);
    });
    emojiTabsEl.appendChild(tab);
  });

  function renderEmojiGrid(catIdx) {
    emojiGridEl.innerHTML = "";
    EMOJI_CATS[catIdx].items.forEach((em) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "emoji-cell";
      btn.textContent = em;
      btn.addEventListener("click", () => {
        const inp = document.getElementById("chat-input");
        const s = inp.selectionStart || inp.value.length;
        const e = inp.selectionEnd || inp.value.length;
        inp.value = inp.value.slice(0, s) + em + inp.value.slice(e);
        inp.focus();
        inp.selectionStart = inp.selectionEnd = s + em.length;
      });
      emojiGridEl.appendChild(btn);
    });
  }
  renderEmojiGrid(0);

  emojiBtnEl.addEventListener("click", (ev) => {
    ev.stopPropagation();
    const showing = !emojiPickerEl.hidden;
    emojiPickerEl.hidden = true;
    stickerPickerEl.hidden = true;
    if (!showing) emojiPickerEl.hidden = false;
  });

  let activeStickerTab = "builtin";
  function buildStickerTabs() {
    stickerTabsEl.innerHTML = "";
    ["builtin", "custom"].forEach((key) => {
      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = "picker-tab picker-tab-text" + (key === activeStickerTab ? " active" : "");
      tab.textContent = key === "builtin" ? "Stickers" : "My Stickers";
      tab.addEventListener("click", () => {
        activeStickerTab = key;
        stickerTabsEl.querySelectorAll(".picker-tab").forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        renderStickerGrid();
      });
      stickerTabsEl.appendChild(tab);
    });
  }
  buildStickerTabs();

  function renderStickerGrid() {
    stickerGridEl.innerHTML = "";
    if (activeStickerTab === "builtin") {
      BUILTIN_STICKERS.forEach((s) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "sticker-cell";
        const img = document.createElement("img");
        img.src = STICKER_BASE + s.id + ".svg";
        img.alt = s.label;
        btn.appendChild(img);
        btn.title = s.label;
        btn.addEventListener("click", () => {
          socket.emit("chat", { type: "sticker", stickerUrl: STICKER_BASE + s.id + ".svg" });
          stickerPickerEl.hidden = true;
        });
        stickerGridEl.appendChild(btn);
      });
    } else {
      const customs = getCustomStickers();
      customs.forEach((dataUrl, idx) => {
        const cell = document.createElement("div");
        cell.className = "sticker-cell sticker-cell-custom";
        const img = document.createElement("img");
        img.src = dataUrl;
        img.alt = "Custom sticker";
        cell.appendChild(img);
        const del = document.createElement("button");
        del.type = "button";
        del.className = "sticker-delete";
        del.textContent = "\u00D7";
        del.addEventListener("click", (ev) => {
          ev.stopPropagation();
          const arr = getCustomStickers();
          arr.splice(idx, 1);
          saveCustomStickers(arr);
          renderStickerGrid();
        });
        cell.appendChild(del);
        cell.addEventListener("click", () => {
          socket.emit("chat", { type: "sticker", stickerUrl: dataUrl });
          stickerPickerEl.hidden = true;
        });
        stickerGridEl.appendChild(cell);
      });
      const uploadCell = document.createElement("label");
      uploadCell.className = "sticker-upload-cell";
      uploadCell.textContent = "+";
      const fi = document.createElement("input");
      fi.type = "file";
      fi.accept = "image/*";
      fi.style.cssText = "position:absolute;inset:0;opacity:0;cursor:pointer;";
      fi.addEventListener("change", (ev) => {
        const f = ev.target.files && ev.target.files[0];
        if (!f) return;
        resizeImage(f, 128, (du) => {
          const arr = getCustomStickers();
          if (arr.length >= 50) { flashStatus("Maximum 50 custom stickers.", "warning"); return; }
          arr.push(du);
          saveCustomStickers(arr);
          renderStickerGrid();
        });
        fi.value = "";
      });
      uploadCell.appendChild(fi);
      stickerGridEl.appendChild(uploadCell);
    }
  }
  renderStickerGrid();

  stickerBtnEl.addEventListener("click", (ev) => {
    ev.stopPropagation();
    const showing = !stickerPickerEl.hidden;
    emojiPickerEl.hidden = true;
    stickerPickerEl.hidden = true;
    if (!showing) stickerPickerEl.hidden = false;
  });

  document.addEventListener("click", (ev) => {
    if (!emojiPickerEl.hidden && !emojiPickerEl.contains(ev.target) && ev.target !== emojiBtnEl) {
      emojiPickerEl.hidden = true;
    }
    if (!stickerPickerEl.hidden && !stickerPickerEl.contains(ev.target) && ev.target !== stickerBtnEl) {
      stickerPickerEl.hidden = true;
    }
  });

  document.getElementById("suggest-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = document.getElementById("suggest-url");
    const url = input.value.trim();
    if (!url) return;
    socket.emit("suggest-video", { url });
    input.value = "";
  });

  socket.on("webrtc-host-available", ({ hostId, kind }) => {
    hostSocketId = hostId;
    hostStreamKind = kind;
    showToast(`Host is sharing ${kind}. Connecting\u2026`, "info");
    mountRtc();
    requestStreamFromHost(hostId);
  });
  socket.on("webrtc-host-busy", ({ kind }) => {
    flashStatus(`Someone else is already sharing ${kind}. Ask them to stop first.`, "warning");
    stopHostingStream(true);
  });
  socket.on("webrtc-host-stopped", () => {
    hostSocketId = null;
    hostStreamKind = null;
    teardownPeers();
    rtcEl.srcObject = null;
    rtcEl.hidden = true;
    document.getElementById("host-self-overlay").hidden = true;
    showToast("Host stopped sharing.", "info");
  });
  socket.on("webrtc-offer", async ({ from, sdp }) => {
    if (!isHosting || !localStream) return;
    try {
      const pc = createPeer(from, true);
      await pc.setRemoteDescription(sdp);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("webrtc-answer", { to: from, sdp: pc.localDescription });
    } catch (err) {
      console.warn("webrtc-offer handling failed", err);
    }
  });
  socket.on("webrtc-answer", async ({ from, sdp }) => {
    const pc = peers.get(from);
    if (!pc) return;
    try { await pc.setRemoteDescription(sdp); }
    catch (err) { console.warn("webrtc-answer handling failed", err); }
  });
  socket.on("webrtc-ice", async ({ from, candidate }) => {
    const pc = peers.get(from);
    if (!pc || !candidate) return;
    try { await pc.addIceCandidate(candidate); } catch { /* ignore */ }
  });

  const micBtn = document.getElementById("mic-btn");
  const speakerBtn = document.getElementById("speaker-btn");
  let voipActive = false;
  let speakerActive = true;
  let voipStream = null;
  const voipPeers = new Map();
  const voipAudios = new Map();
  const activeSpeakers = new Set();

  if (speakerBtn) {
    speakerBtn.classList.add("active");
    speakerBtn.textContent = "\u{1F50A} Speaker";
    speakerBtn.addEventListener("click", () => {
      speakerActive = !speakerActive;
      if (speakerActive) {
        speakerBtn.classList.add("active");
        speakerBtn.textContent = "\u{1F50A} Speaker";
      } else {
        speakerBtn.classList.remove("active");
        speakerBtn.textContent = "\u{1F507} Muted";
      }
      for (const audio of voipAudios.values()) {
        audio.muted = !speakerActive;
      }
    });
  }

  micBtn.addEventListener("click", () => {
    if (voipActive) stopVoip();
    else startVoip();
  });

  async function startVoip() {
    try {
      voipStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      voipActive = true;
      micBtn.classList.add("active");
      micBtn.textContent = "\u{1F3A4} On";

      // Add tracks to all existing peer connections (we were listening, now we speak too)
      for (const [pid, pc] of voipPeers.entries()) {
        const senders = pc.getSenders();
        const hasAudio = senders.some(s => s.track && s.track.kind === 'audio');
        if (!hasAudio && voipStream) {
          voipStream.getTracks().forEach((track) => pc.addTrack(track, voipStream));
          createVoipOffer(pid);
        }
      }

      // Initiate connections to other participants we don't have a peer connection with yet
      participantList.forEach((p) => {
        if (p.id && p.id !== myId && !voipPeers.has(p.id)) {
          createVoipOffer(p.id);
        }
      });

      socket.emit("voip-join");
    } catch (err) {
      flashStatus("Could not access microphone: " + (err.message || err), "error");
    }
  }

  function stopVoip() {
    if (voipStream) {
      voipStream.getTracks().forEach((t) => t.stop());
      voipStream = null;
    }
    voipActive = false;
    micBtn.classList.remove("active");
    micBtn.textContent = "\u{1F3A4} Mic";

    // Close connections to peers who are not active speakers.
    // Keep connections to active speakers, but remove our tracks.
    for (const [pid, pc] of voipPeers.entries()) {
      if (!activeSpeakers.has(pid)) {
        try { pc.close(); } catch {}
        voipPeers.delete(pid);
        const a = voipAudios.get(pid);
        if (a) { try { a.pause(); a.srcObject = null; } catch {} }
        voipAudios.delete(pid);
      } else {
        const senders = pc.getSenders();
        senders.forEach(sender => {
          if (sender.track) {
            try { pc.removeTrack(sender); } catch {}
          }
        });
        createVoipOffer(pid);
      }
    }
    socket.emit("voip-leave");
  }

  socket.on("voip-peers", ({ peers: peerIds }) => {
    for (const pid of peerIds) {
      if (pid !== myId) {
        activeSpeakers.add(pid);
        createVoipOffer(pid);
      }
    }
  });

  socket.on("voip-peer-joined", ({ id }) => {
    flashStatus("A user joined voice chat.", "info");
    if (id && id !== myId) {
      activeSpeakers.add(id);
      createVoipOffer(id);
    }
  });

  socket.on("voip-peer-left", ({ id }) => {
    if (id && id !== myId) {
      activeSpeakers.delete(id);
      if (!voipActive) {
        const pc = voipPeers.get(id);
        if (pc) { try { pc.close(); } catch {} }
        voipPeers.delete(id);
        const a = voipAudios.get(id);
        if (a) { try { a.pause(); a.srcObject = null; } catch {} }
        voipAudios.delete(id);
      }
    }
  });

  socket.on("voip-offer", async ({ from, sdp }) => {
    try {
      const pc = createVoipPeer(from);
      await pc.setRemoteDescription(sdp);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("voip-answer", { to: from, sdp: pc.localDescription });
    } catch (err) {
      console.warn("voip-offer handling failed", err);
    }
  });

  socket.on("voip-answer", async ({ from, sdp }) => {
    const pc = voipPeers.get(from);
    if (!pc) return;
    try { await pc.setRemoteDescription(sdp); }
    catch (err) { console.warn("voip-answer handling failed", err); }
  });

  socket.on("voip-ice", async ({ from, candidate }) => {
    const pc = voipPeers.get(from);
    if (!pc || !candidate) return;
    try { await pc.addIceCandidate(candidate); } catch {}
  });

  function createVoipPeer(peerId) {
    let pc = voipPeers.get(peerId);
    if (!pc) {
      pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      voipPeers.set(peerId, pc);
      pc.onicecandidate = (e) => {
        if (e.candidate) socket.emit("voip-ice", { to: peerId, candidate: e.candidate });
      };
      pc.onconnectionstatechange = () => {
        if (["failed", "closed", "disconnected"].includes(pc.connectionState)) {
          try { pc.close(); } catch {}
          voipPeers.delete(peerId);
          const a = voipAudios.get(peerId);
          if (a) { try { a.pause(); a.srcObject = null; } catch {} }
          voipAudios.delete(peerId);
        }
      };
      pc.ontrack = (e) => {
        let audio = voipAudios.get(peerId);
        if (!audio) {
          audio = new Audio();
          audio.autoplay = true;
          voipAudios.set(peerId, audio);
        }
        audio.srcObject = e.streams[0];
        audio.muted = !speakerActive;
        audio.play().catch(() => {});
      };
    }

    if (voipStream) {
      const senders = pc.getSenders();
      const hasAudio = senders.some(s => s.track && s.track.kind === 'audio');
      if (!hasAudio) {
        voipStream.getTracks().forEach((track) => pc.addTrack(track, voipStream));
      }
    }

    return pc;
  }

  async function createVoipOffer(peerId) {
    if (myId <= peerId) return; // Prevent WebRTC glare by only allowing the peer with the greater socket ID to offer
    try {
      const pc = createVoipPeer(peerId);
      const offer = await pc.createOffer({ offerToReceiveAudio: true });
      await pc.setLocalDescription(offer);
      socket.emit("voip-offer", { to: peerId, sdp: pc.localDescription });
    } catch (err) {
      console.warn("createVoipOffer failed", err);
    }
  }

  socket.on("disconnect", () => {
    if (voipStream) {
      voipStream.getTracks().forEach((t) => t.stop());
      voipStream = null;
    }
    voipActive = false;
    micBtn.classList.remove("active");
    micBtn.textContent = "\u{1F3A4} Mic";
    for (const pc of voipPeers.values()) { try { pc.close(); } catch {} }
    voipPeers.clear();
    for (const a of voipAudios.values()) { try { a.pause(); a.srcObject = null; } catch {} }
    voipAudios.clear();
    activeSpeakers.clear();
  });

  document.getElementById("source-form").addEventListener("submit", (e) => {
    e.preventDefault();
    if (hostSocketId) {
      flashStatus("Stop the active screen/file share before loading a URL.", "warning");
      return;
    }
    let url = document.getElementById("source-url").value.trim();
    if (!url) return;
    // Auto-fix missing protocol so users can paste bare domains
    if (!/^https?:\/\//i.test(url) && /\.\w{2,}/.test(url)) {
      url = "https://" + url;
      document.getElementById("source-url").value = url;
    }
  const yt = parseYouTube(url);
    if (yt) {
      socket.emit("set-source", { source: yt, sourceType: "youtube" });
      return;
    }
    const detected = detectSourceType(url);
    if (detected) {
      socket.emit("set-source", { source: url, sourceType: detected });
    } else if (/^https?:\/\//i.test(url)) {
      const btn = document.getElementById("extract-btn");
      if (btn) btn.click();
    } else {
      flashStatus("Please paste a video URL (YouTube, .mp4, .m3u8, .mpd, etc.).", "warning");
    }
  });

  // --- YT Quality button: uses YouTube IFrame API quality picker (no yt-dlp) ---
  const ytQualityBtn = document.getElementById("yt-quality-btn");
  if (ytQualityBtn) {
    ytQualityBtn.addEventListener("click", () => {
      if (hostSocketId) {
        flashStatus("Stop the active screen/file share before changing quality.", "warning");
        return;
      }
      let url = document.getElementById("source-url").value.trim();
      if (!url) {
        flashStatus("Paste a YouTube URL first.", "warning");
        return;
      }
      if (!/^https?:\/\//i.test(url)) url = "https://" + url;

      const videoId = parseYouTube(url);
      if (!videoId) {
        flashStatus("This doesn't look like a YouTube URL. Use Load for non-YouTube videos.", "warning");
        return;
      }

      // If YT player is already loaded with this video, show quality picker directly
      if (ytPlayer && playerKind === "youtube" && ytPlayer.getAvailableQualityLevels) {
        showYtQualityPicker(ytPlayer);
        return;
      }

      // Otherwise, load the video first, then show quality picker after it's ready
      socket.emit("set-source", { source: videoId, sourceType: "youtube" });
      flashStatus("Loading YouTube video — quality picker will appear shortly…", "info");

      // Wait for the player to become ready, then show picker
      const waitForPlayer = setInterval(() => {
        if (ytPlayer && ytPlayer.getAvailableQualityLevels) {
          const levels = ytPlayer.getAvailableQualityLevels();
          if (levels && levels.length > 0) {
            clearInterval(waitForPlayer);
            showYtQualityPicker(ytPlayer);
          }
        }
      }, 500);
      // Timeout after 10 seconds
      setTimeout(() => {
        clearInterval(waitForPlayer);
      }, 10000);
    });
  }

  const YT_QUALITY_LABELS = {
    "highres": "4320p (8K)",
    "hd2160": "2160p (4K)",
    "hd1440": "1440p (2K)",
    "hd1080": "1080p (Full HD)",
    "hd720": "720p (HD)",
    "large": "480p",
    "medium": "360p",
    "small": "240p",
    "tiny": "144p",
    "auto": "Auto",
  };

  function showYtQualityPicker(player) {
    const levels = player.getAvailableQualityLevels();
    if (!levels || levels.length === 0) {
      flashStatus("YouTube hasn't provided quality options yet. Try again in a moment.", "warning");
      return;
    }

    const currentQuality = player.getPlaybackQuality();

    // Use the paste-source modal for the quality picker UI
    const pasteModal = document.getElementById("paste-source-modal");
    const scannerResults = document.getElementById("scanner-results");
    const scannerStreamList = document.getElementById("scanner-stream-list");
    const pasteStatus = document.getElementById("paste-source-status");

    if (pasteModal) pasteModal.hidden = false;
    // Hide scanner tabs since this isn't a scanner operation
    document.getElementById("scanner-tab-url").hidden = true;
    document.getElementById("scanner-tab-html").hidden = true;
    document.querySelectorAll(".scanner-tab").forEach((t) => t.hidden = true);
    document.getElementById("paste-source-submit").hidden = true;

    if (scannerStreamList) {
      scannerStreamList.innerHTML = "";
      levels.forEach((level) => {
        const btn = document.createElement("button");
        btn.className = "btn scanner-stream-btn" + (level === currentQuality ? " btn-primary" : "");
        const label = YT_QUALITY_LABELS[level] || level;
        const badge = level === currentQuality ? "✓ Current" : "▶ YT";
        btn.innerHTML = `<span class="stream-badge stream-badge-hls">${badge}</span> ${label}`;
        btn.addEventListener("click", () => {
          player.setPlaybackQuality(level);
          flashStatus(`YouTube quality set to ${label}`, "success");
          pasteModal.hidden = true;
          // Restore scanner tabs visibility
          document.querySelectorAll(".scanner-tab").forEach((t) => t.hidden = false);
          document.getElementById("paste-source-submit").hidden = false;
        });
        scannerStreamList.appendChild(btn);
      });
    }
    if (scannerResults) scannerResults.hidden = false;
    if (pasteStatus) {
      pasteStatus.textContent = `Choose playback quality for this YouTube video. Current: ${YT_QUALITY_LABELS[currentQuality] || currentQuality}`;
      pasteStatus.className = "extract-status ok";
      pasteStatus.hidden = false;
    }
  }
  // ---------------------------------------------

  const extractBtn = document.getElementById("extract-btn");
  const extractStatus = document.getElementById("extract-status");
  function showExtractStatus(text, kind) {
    if (!extractStatus) return;
    extractStatus.textContent = text;
    extractStatus.className = "extract-status" + (kind ? " " + kind : "");
    extractStatus.hidden = !text;
  }
  if (extractBtn) {
    extractBtn.addEventListener("click", async () => {
      if (hostSocketId) {
        flashStatus("Stop the active screen/file share before extracting a stream.", "warning");
        return;
      }
      let url = document.getElementById("source-url").value.trim();
      if (!url) { showExtractStatus("Paste a webpage URL first.", "warn"); return; }
      if (!/^https?:\/\//i.test(url)) url = "https://" + url;
      document.getElementById("source-url").value = url;
      extractBtn.disabled = true;
      const oldText = extractBtn.textContent;
      extractBtn.textContent = "Extracting…";
      showExtractStatus("Scanning for streams…", "info");
      try {
        // Step 1: Try fetch-scan first (returns ALL streams with qualities)
        const scanRes = await fetch(`${BASE}api/fetch-scan`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
        const scanData = await scanRes.json();

        // YouTube: load via native player
        if (scanData.youtube && scanData.videoId) {
          socket.emit("set-source", { source: scanData.videoId, sourceType: "youtube" });
          showExtractStatus("YouTube video loaded! Use ▶ YT Quality to pick resolution.", "ok");
          setTimeout(() => showExtractStatus("", null), 5000);
          return;
        }

        // Multiple streams found: show quality picker
        if (scanData.streams && scanData.streams.length > 0) {
          showExtractStatus("", null);
          // Open the scanner modal with results
          const pasteModal = document.getElementById("paste-source-modal");
          if (pasteModal) pasteModal.hidden = false;
          renderStreamResults(scanData);
          return;
        }

        // DRM detected
        if (scanData.drm) {
          showExtractStatus("DRM-protected content is not supported (Netflix, Disney+, HBO, Prime, etc.).", "error");
          return;
        }

        // Step 2: Fall back to /api/extract (yt-dlp + browser extractor)
        showExtractStatus("No streams from scan, trying deep extraction…", "info");
        const res = await fetch(`${BASE}api/extract`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
        const data = await res.json();
        if (data.youtube && data.videoId) {
          socket.emit("set-source", { source: data.videoId, sourceType: "youtube" });
          showExtractStatus("YouTube video loaded! Use ▶ YT Quality to pick resolution.", "ok");
          setTimeout(() => showExtractStatus("", null), 5000);
        } else if (data.drm) {
          showExtractStatus("DRM-protected content is not supported (Netflix, Disney+, HBO, Prime, etc.).", "error");
        } else if (data.allStreams && data.allStreams.length > 1) {
          // Multiple streams from extract: show picker
          showExtractStatus("", null);
          const pasteModal = document.getElementById("paste-source-modal");
          if (pasteModal) pasteModal.hidden = false;
          renderStreamResults({
            streams: data.allStreams,
            title: data.title,
            sourcePage: data.sourcePage || url,
          });
        } else if (!res.ok || !data.streamUrl) {
          showExtractStatus(data.error || "Could not extract a playable stream.", "error");
        } else {
          if (data.sourcePage) currentSourcePage = data.sourcePage;
          showExtractStatus(`Loaded ${data.title ? `"${data.title}"` : "stream"}.`, "ok");
          socket.emit("set-source", {
            source: data.streamUrl,
            sourceType: data.type || "mp4",
            sourcePage: data.sourcePage || url,
          });
          setTimeout(() => showExtractStatus("", null), 4000);
        }
      } catch (err) {
        showExtractStatus("Extraction failed: " + (err.message || err), "error");
      } finally {
        extractBtn.disabled = false;
        extractBtn.textContent = oldText;
      }
    });
  }

  // Paste-source flow: user pastes page HTML they got from THEIR browser.
  // Server parses it for a stream URL; bypasses every IP-block scenario.
  const pasteBtn = document.getElementById("paste-source-btn");
  const pasteModal = document.getElementById("paste-source-modal");
  const pasteTa = document.getElementById("paste-source-textarea");
  const pasteStatus = document.getElementById("paste-source-status");
  const pasteSubmit = document.getElementById("paste-source-submit");
  const pasteCancel = document.getElementById("paste-source-cancel");
  const scannerUrlInput = document.getElementById("scanner-url-input");
  const scannerUrlBtn = document.getElementById("scanner-url-btn");
  const scannerResults = document.getElementById("scanner-results");
  const scannerStreamList = document.getElementById("scanner-stream-list");

  let activeScannerTab = "url";

  function showPasteStatus(text, kind) {
    if (!pasteStatus) return;
    pasteStatus.textContent = text;
    pasteStatus.className = "extract-status" + (kind ? " " + kind : "");
    pasteStatus.hidden = !text;
  }

  function closePasteModal() {
    if (pasteModal) pasteModal.hidden = true;
    showPasteStatus("", null);
    if (scannerResults) scannerResults.hidden = true;
    // Restore scanner tabs in case they were hidden by YT Quality picker
    document.querySelectorAll(".scanner-tab").forEach((t) => t.hidden = false);
    const submitBtn = document.getElementById("paste-source-submit");
    if (submitBtn) submitBtn.hidden = false;
  }

  function switchScannerTab(tab) {
    activeScannerTab = tab;
    document.querySelectorAll(".scanner-tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    document.getElementById("scanner-tab-url").hidden = tab !== "url";
    document.getElementById("scanner-tab-html").hidden = tab !== "html";
    pasteSubmit.textContent = tab === "url" ? "Scan URL" : "Find stream";
    if (scannerResults) scannerResults.hidden = true;
    showPasteStatus("", null);
  }

  document.querySelectorAll(".scanner-tab").forEach((btn) => {
    btn.addEventListener("click", () => switchScannerTab(btn.dataset.tab));
  });

  function loadStream(streamUrl, streamType, sourcePage, title, allStreams) {
    if (sourcePage) currentSourcePage = sourcePage;
    socket.emit("set-source", { source: streamUrl, sourceType: streamType || "mp4", sourcePage: sourcePage || null });
    const label = title ? `"${title}"` : "stream";
    showExtractStatus(`Loaded ${label}.`, "ok");
    setTimeout(closePasteModal, 600);
    setTimeout(() => showExtractStatus("", null), 5000);
  }

  // دالة تحويل الثواني لدقائق وثواني
  function formatDuration(seconds) {
    if (!seconds) return "";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function renderStreamResults(data) {
    const streams = data.streams || [];
    if (!streams.length) { showPasteStatus(data.error || "No streams found.", "error"); return; }
    if (scannerStreamList) {
      scannerStreamList.innerHTML = "";
      streams.forEach((s) => {
        const btn = document.createElement("button");
        btn.className = "btn scanner-stream-btn";
        const badge = s.type === "hls" ? "HLS" : s.type === "dash" ? "DASH" : "MP4";
        btn.innerHTML = `<span class="stream-badge stream-badge-${s.type}">${badge}</span> ${s.label || "stream"}`;
        btn.title = s.url;
        btn.addEventListener("click", () => loadStream(s.url, s.type, data.sourcePage, data.title, streams));
        scannerStreamList.appendChild(btn);
      });
    }
    if (scannerResults) scannerResults.hidden = false;

    // تجهيز وقت الفيديو لعرضه
    let durationText = "";
    if (data.duration) {
      durationText = ` ⏱️ (${formatDuration(data.duration)})`;
    }

    showPasteStatus(`Found ${streams.length} stream${streams.length > 1 ? "s" : ""}${data.title ? ` for "${data.title}"${durationText}` : ""}. Click one to load it.`, "ok");
  }

  async function doScanUrl(url) {
    if (!url) { showPasteStatus("Enter a video page URL first.", "warn"); return; }
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    if (scannerUrlInput) scannerUrlInput.value = url;
    scannerUrlBtn && (scannerUrlBtn.disabled = true);
    pasteSubmit.disabled = true;
    showPasteStatus("Fetching page and scanning for streams…", "info");
    if (scannerResults) scannerResults.hidden = true;
    try {
      const res = await fetch(`${BASE}api/fetch-scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();

      // Handle YouTube-specific response — load via native player
      if (data.youtube && data.videoId) {
        socket.emit("set-source", { source: data.videoId, sourceType: "youtube" });
        showPasteStatus("YouTube video loaded! Use the ▶ YT Quality button to choose quality.", "ok");
        setTimeout(closePasteModal, 2000);
        return;
      }

      if (!res.ok || !data.streams || data.streams.length === 0) {
        showPasteStatus(data.error || "No streams found. Try the 'Paste HTML' tab instead.", "error");
      } else {
        renderStreamResults(data);
      }
    } catch (err) {
      showPasteStatus("Request failed: " + (err.message || err), "error");
    } finally {
      scannerUrlBtn && (scannerUrlBtn.disabled = false);
      pasteSubmit.disabled = false;
    }
  }

  async function doScanHtml() {
    const html = (pasteTa?.value || "").trim();
    if (html.length < 20) { showPasteStatus("Paste the page source first.", "warn"); return; }
    pasteSubmit.disabled = true;
    const old = pasteSubmit.textContent;
    pasteSubmit.textContent = "Scanning…";
    showPasteStatus("Scanning for stream URLs…", "info");
    if (scannerResults) scannerResults.hidden = true;
    try {
      const res = await fetch(`${BASE}api/extract-from-html`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html }),
      });
      const data = await res.json();
      if (!res.ok || !data.streams || data.streams.length === 0) {
        showPasteStatus(data.error || "No stream URL found in the pasted source.", "error");
      } else {
        renderStreamResults(data);
      }
    } catch (err) {
      showPasteStatus("Request failed: " + (err.message || err), "error");
    } finally {
      pasteSubmit.disabled = false;
      pasteSubmit.textContent = old;
    }
  }

  if (pasteBtn && pasteModal) {
    pasteBtn.addEventListener("click", () => {
      if (hostSocketId) {
        flashStatus("Stop the active screen/file share before loading a stream.", "warning");
        return;
      }
      if (pasteTa) pasteTa.value = "";
      if (scannerUrlInput) scannerUrlInput.value = "";
      showPasteStatus("", null);
      if (scannerResults) scannerResults.hidden = true;
      switchScannerTab("url");
      pasteModal.hidden = false;
      setTimeout(() => scannerUrlInput?.focus(), 50);
    });
  }

  if (scannerUrlBtn) {
    scannerUrlBtn.addEventListener("click", () => doScanUrl(scannerUrlInput?.value?.trim()));
  }
  if (scannerUrlInput) {
    scannerUrlInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); doScanUrl(scannerUrlInput.value.trim()); } });
  }

  if (pasteCancel) pasteCancel.addEventListener("click", closePasteModal);
  if (pasteModal) {
    pasteModal.addEventListener("click", (e) => { if (e.target === pasteModal) closePasteModal(); });
  }
  if (pasteSubmit) {
    pasteSubmit.addEventListener("click", () => {
      if (activeScannerTab === "url") doScanUrl(scannerUrlInput?.value?.trim());
      else doScanHtml();
    });
  }

  function canCaptureDisplay() {
    if (!window.isSecureContext) return false;
    if (window.top !== window.self) return false;
    return !!(navigator.mediaDevices && typeof navigator.mediaDevices.getDisplayMedia === "function");
  }
  function displayCaptureUnavailableMessage() {
    if (window.top !== window.self) {
      return "Screen/tab share isn't available inside this preview frame. Click the 'open in new tab' icon at the top of the preview to launch the app in its own window, then try again.";
    }
    if (!window.isSecureContext) {
      return "Screen/tab share requires a secure (HTTPS) connection.";
    }
    return "Your browser doesn't support screen or tab sharing. Use a recent desktop Chrome, Edge, or Firefox.";
  }
  document.getElementById("share-screen-btn").addEventListener("click", async () => {
    if (!canCaptureDisplay()) {
      flashStatus(displayCaptureUnavailableMessage(), "error");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      startHostingStream(stream, "screen");
    } catch (err) {
      if (err.name === "NotAllowedError") {
        flashStatus("Screen share was cancelled or permission was denied.", "error");
      } else if (
        err.name === "NotSupportedError" ||
        err.name === "TypeError" ||
        (err.message && err.message.toLowerCase().includes("not a function"))
      ) {
        flashStatus(displayCaptureUnavailableMessage(), "error");
      } else {
        flashStatus(`Could not start screen share: ${err.message || err}`, "error");
      }
    }
  });
  const shareTabBtn = document.getElementById("share-tab-btn");
  if (shareTabBtn) {
    shareTabBtn.addEventListener("click", async () => {
      if (!canCaptureDisplay()) {
        flashStatus(displayCaptureUnavailableMessage(), "error");
        return;
      }
      try {
        // Bias the picker toward a single browser tab + tab audio. These hints
        // are honoured by Chromium-family browsers; harmless on others.
        const constraints = {
          video: { displaySurface: "browser" },
          audio: { suppressLocalAudioPlayback: false },
          selfBrowserSurface: "exclude",
          surfaceSwitching: "include",
          systemAudio: "include",
          preferCurrentTab: false,
        };
        const stream = await navigator.mediaDevices.getDisplayMedia(constraints);
        if (!stream.getAudioTracks().length) {
          flashStatus("Tip: re-share and check \"Share tab audio\" so the room hears the video.", "warning");
        }
        startHostingStream(stream, "tab");
      } catch (err) {
        if (err.name === "NotAllowedError") {
          flashStatus("Tab share was cancelled or permission was denied.", "error");
        } else if (
          err.name === "NotSupportedError" ||
          err.name === "TypeError" ||
          (err.message && err.message.toLowerCase().includes("not a function"))
        ) {
          flashStatus(displayCaptureUnavailableMessage(), "error");
        } else {
          flashStatus(`Could not start tab share: ${err.message || err}`, "error");
        }
      }
    });
  }
  document.getElementById("local-file-input").addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    startHostingFile(file);
    e.target.value = "";
  });
  document.getElementById("stop-share-btn").addEventListener("click", () => stopHostingStream());

  function startHostingStream(stream, kind) {
    stopHostingStream(true);
    localStream = stream;
    isHosting = true;
    hostKind = kind;
    hostSocketId = myId;
    hostStreamKind = kind;
    mountRtc();
    rtcEl.muted = true;
    rtcEl.srcObject = stream;
    rtcEl.play().catch(() => {});
    document.getElementById("host-self-overlay").hidden = false;
    document.getElementById("stop-share-btn").hidden = false;
    socket.emit("webrtc-host-start", { kind });
    stream.getTracks().forEach((t) => t.addEventListener("ended", () => stopHostingStream()));
  }

  function startHostingFile(file) {
    if (fileStreamVideo) cleanupFileStream();
    const fileVideo = document.createElement("video");
    fileStreamUrl = URL.createObjectURL(file);
    fileVideo.src = fileStreamUrl;
    fileVideo.controls = false;
    fileVideo.muted = true;
    fileVideo.loop = false;
    fileVideo.playsInline = true;
    fileStreamVideo = fileVideo;
    fileVideo.addEventListener("loadedmetadata", () => {
      fileVideo.play().catch(() => {});
      const stream = fileVideo.captureStream
        ? fileVideo.captureStream()
        : (fileVideo.mozCaptureStream && fileVideo.mozCaptureStream());
      if (!stream) {
        flashStatus("Your browser does not support local file streaming.", "error");
        cleanupFileStream();
        return;
      }
      startHostingStream(stream, "file");
    });
    fileVideo.addEventListener("error", () => {
      flashStatus("Could not load that file.", "error");
      cleanupFileStream();
    });
  }

  function cleanupFileStream() {
    if (fileStreamVideo) {
      try { fileStreamVideo.pause(); } catch { /* ignore */ }
      fileStreamVideo.removeAttribute("src");
      try { fileStreamVideo.load(); } catch { /* ignore */ }
      fileStreamVideo = null;
    }
    if (fileStreamUrl) {
      try { URL.revokeObjectURL(fileStreamUrl); } catch { /* ignore */ }
      fileStreamUrl = null;
    }
  }

  function stopHostingStream(silent) {
    if (!isHosting && !localStream) return;
    if (localStream) localStream.getTracks().forEach((t) => t.stop());
    localStream = null;
    isHosting = false;
    hostKind = null;
    teardownPeers();
    rtcEl.srcObject = null;
    rtcEl.hidden = true;
    rtcEl.muted = false;
    document.getElementById("host-self-overlay").hidden = true;
    document.getElementById("stop-share-btn").hidden = true;
    cleanupFileStream();
    if (!silent) socket.emit("webrtc-host-stop");
    hostSocketId = null;
    hostStreamKind = null;
  }

  function createPeer(peerId, isHostSide) {
    let pc = peers.get(peerId);
    if (pc) return pc;
    pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peers.set(peerId, pc);
    pc.onicecandidate = (e) => {
      if (e.candidate) socket.emit("webrtc-ice", { to: peerId, candidate: e.candidate });
    };
    pc.onconnectionstatechange = () => {
      if (["failed", "closed", "disconnected"].includes(pc.connectionState)) {
        try { pc.close(); } catch { /* ignore */ }
        peers.delete(peerId);
      }
    };
    if (isHostSide && localStream) {
      localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
    } else {
      pc.ontrack = (e) => {
        rtcEl.srcObject = e.streams[0];
        rtcEl.play().catch(() => {});
      };
    }
    return pc;
  }

  async function requestStreamFromHost(hostId) {
    if (hostId === myId) return;
    try {
      const pc = createPeer(hostId, false);
      const offer = await pc.createOffer({ offerToReceiveVideo: true, offerToReceiveAudio: true });
      await pc.setLocalDescription(offer);
      socket.emit("webrtc-offer", { to: hostId, sdp: pc.localDescription });
    } catch (err) {
      console.warn("requestStreamFromHost failed", err);
      flashStatus("Could not connect to host's stream.", "error");
    }
  }

  function teardownPeers() {
    for (const pc of peers.values()) {
      try { pc.close(); } catch { /* ignore */ }
    }
    peers.clear();
  }

  function loadSource(source, type, time, isPlaying) {
    currentRawSource = source;
    hideAllPlayers();
    document.getElementById("player-empty").hidden = true;
    switch (type) {
      case "youtube": mountYouTube(source, time, isPlaying); break;
      case "hls": mountHls(source, time, isPlaying); break;
      case "dash": mountDash(source, time, isPlaying); break;
      default: mountMp4(source, time, isPlaying); break;
    }
  }

  let hlsInstance = null;
  let dashInstance = null;
  function teardownAdaptive() {
    if (hlsInstance) {
      try { hlsInstance.destroy(); } catch { /* ignore */ }
      hlsInstance = null;
    }
    if (dashInstance) {
      try { dashInstance.reset(); } catch { /* ignore */ }
      dashInstance = null;
    }
  }

  function attachMp4Listeners() {
    mp4El.onplay = () => {
      if (suppress || hostSocketId || !canIControl()) return;
      socket.emit("play", { time: mp4El.currentTime });
    };
    mp4El.onpause = () => {
      if (suppress || hostSocketId || !canIControl()) return;
      if (mp4El.ended) return;
      socket.emit("pause", { time: mp4El.currentTime });
    };
    mp4El.onseeked = () => {
      if (suppress || hostSocketId || !canIControl()) return;
      socket.emit("seek", { time: mp4El.currentTime });
    };
  }

  // Stores the page URL of the last paste-extracted source, used as Referer
  let currentSourcePage = null;
  // Stores the raw (unproxied) source URL for auto-extract fallback
  let currentRawSource = null;

  function hlsProxied(src, refOverride) {
    if (!src) return src;
    try {
      const u = new URL(src);
      if (u.origin === location.origin) return src; // already same-origin
      const ref = refOverride || currentSourcePage || "";
      const refPart = ref ? `&ref=${encodeURIComponent(ref)}` : "";
      return `${BASE}api/hls-proxy?url=${encodeURIComponent(src)}${refPart}`;
    } catch {
      return src; // relative — pass through
    }
  }

  function showIpLockHelp() {
    // Remove any existing banner first
    document.getElementById("ip-lock-banner")?.remove();
    const banner = document.createElement("div");
    banner.id = "ip-lock-banner";
    banner.className = "ip-lock-banner";
    banner.innerHTML = `
      <div class="ip-lock-icon">🔒</div>
      <div class="ip-lock-body">
        <strong>This site uses IP-locked video tokens</strong> — the video can only be fetched by
        your own browser, not our server. The easiest fix:
        <ol class="ip-lock-steps">
          <li>Open the video in a <strong>new browser tab</strong> and start playing it</li>
          <li>Come back here and click <strong>Share browser tab</strong></li>
          <li>Pick that tab in the picker and check <em>Share tab audio</em></li>
        </ol>
        Everyone in the room will see and hear it in sync — same as Teleparty/Netflix Party.
      </div>
      <div class="ip-lock-actions">
        <button class="btn btn-primary ip-lock-share-btn">Share browser tab now</button>
        <button class="btn btn-ghost ip-lock-dismiss">Dismiss</button>
      </div>`;
    // Insert before the extract-status line inside source-bar
    const anchorEl = document.getElementById("extract-status") || document.getElementById("source-bar") || document.body;
    anchorEl.parentNode?.insertBefore(banner, anchorEl) ?? document.body.appendChild(banner);
    banner.querySelector(".ip-lock-share-btn").addEventListener("click", () => {
      banner.remove();
      document.getElementById("share-tab-btn")?.click();
    });
    banner.querySelector(".ip-lock-dismiss").addEventListener("click", () => banner.remove());
  }

  let autoExtractInFlight = false;
  async function autoExtractFallback(failedSrc, errorDetail) {
    // Only attempt if this looks like an extractable URL (not a blob/local file)
    if (!failedSrc || !/^https?:\/\//i.test(failedSrc)) {
      flashStatus("Stream error: " + errorDetail, "error");
      return;
    }
    if (autoExtractInFlight) return; // don't double-trigger
    autoExtractInFlight = true;
    flashStatus("Stream error — trying automatic extraction with headless browser…", "warning");
    try {
      const resp = await fetch(`${BASE}api/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: failedSrc }),
      });
      const data = await resp.json();
      if (data.streamUrl && data.streamUrl !== failedSrc) {
        flashStatus(`Found stream via auto-extract — loading…`, "ok");
        currentSourcePage = data.sourcePage || null;
        socket.emit("set-source", {
          source: data.streamUrl,
          sourceType: data.type || "hls",
          sourcePage: data.sourcePage || null,
        });
      } else if (data.drm) {
        flashStatus("DRM-protected content cannot be played.", "error");
      } else {
        flashStatus(
          (data.error || "Auto-extract failed.") +
            " Try: open video in your browser → use 'Paste source' button.",
          "error",
        );
      }
    } catch (err) {
      flashStatus(
        "Auto-extract failed. Try: open video in your browser → use 'Paste source' button.",
        "error",
      );
    } finally {
      autoExtractInFlight = false;
    }
  }

  function mountHls(src, time, isPlaying) {
    teardownAdaptive();
    hideQualitySelector();
    if (ytSeekPollId) { clearInterval(ytSeekPollId); ytSeekPollId = null; }
    if (ytPlayer) { try { ytPlayer.destroy(); } catch { /* ignore */ } ytPlayer = null; }
    mp4El.hidden = false;
    playerKind = "hls";
    const proxiedSrc = hlsProxied(src);
    if (window.Hls && window.Hls.isSupported()) {
      hlsInstance = new window.Hls({ enableWorker: true, lowLatencyMode: true });
      hlsInstance.loadSource(proxiedSrc);
      hlsInstance.attachMedia(mp4El);
      hlsInstance.on(window.Hls.Events.MANIFEST_PARSED, () => {
        if (time > 0) mp4El.currentTime = Math.max(0, time);
        if (isPlaying) mp4El.play().catch(() => promptAutoplay());
        else mp4El.pause();
        // Populate HLS quality selector
        buildHlsQualityMenu(hlsInstance);
      });
      hlsInstance.on(window.Hls.Events.ERROR, (_e, data) => {
        if (data.fatal) {
          console.warn("HLS fatal error", data);
          if (data.details === "fragLoadError") {
            showIpLockHelp();
          } else {
            autoExtractFallback(src, data.details || "fatal");
          }
        }
      });
    } else if (mp4El.canPlayType("application/vnd.apple.mpegurl")) {
      mp4El.src = proxiedSrc;
      mp4El.addEventListener("loadedmetadata", () => {
        if (time > 0) mp4El.currentTime = Math.max(0, time);
        if (isPlaying) mp4El.play().catch(() => promptAutoplay());
      }, { once: true });
    } else {
      flashStatus("HLS is not supported in this browser.", "error");
      return;
    }
    attachMp4Listeners();
    updatePlayerControls();
  }

  // --- In-player Quality Selector (HLS / DASH) ---
  const qualitySelectorEl = document.getElementById("quality-selector");
  const qualityBtnEl = document.getElementById("quality-btn");
  const qualityMenuEl = document.getElementById("quality-menu");

  function hideQualitySelector() {
    if (qualitySelectorEl) qualitySelectorEl.hidden = true;
    if (qualityMenuEl) qualityMenuEl.hidden = true;
  }

  function buildHlsQualityMenu(hls) {
    if (!hls || !hls.levels || hls.levels.length <= 1) {
      hideQualitySelector();
      return;
    }
    const levels = hls.levels;
    if (qualitySelectorEl) qualitySelectorEl.hidden = false;
    if (qualityBtnEl) qualityBtnEl.textContent = "⚙ Auto";

    function renderMenu() {
      if (!qualityMenuEl) return;
      qualityMenuEl.innerHTML = "";
      const currentLevel = hls.currentLevel;

      // Auto option
      const autoBtn = document.createElement("button");
      autoBtn.className = "quality-menu-item" + (currentLevel === -1 ? " active" : "");
      autoBtn.innerHTML = `<span class="quality-check">${currentLevel === -1 ? "✓" : ""}</span> Auto`;
      autoBtn.addEventListener("click", () => {
        hls.currentLevel = -1;
        if (qualityBtnEl) qualityBtnEl.textContent = "⚙ Auto";
        qualityMenuEl.hidden = true;
      });
      qualityMenuEl.appendChild(autoBtn);

      // Each quality level (sorted by height descending)
      const sorted = levels.map((l, i) => ({ ...l, idx: i }))
        .sort((a, b) => (b.height || 0) - (a.height || 0));
      sorted.forEach((level) => {
        const label = level.height ? `${level.height}p` : `${Math.round((level.bitrate || 0) / 1000)}kbps`;
        const btn = document.createElement("button");
        btn.className = "quality-menu-item" + (currentLevel === level.idx ? " active" : "");
        btn.innerHTML = `<span class="quality-check">${currentLevel === level.idx ? "✓" : ""}</span> ${label}`;
        btn.addEventListener("click", () => {
          hls.currentLevel = level.idx;
          if (qualityBtnEl) qualityBtnEl.textContent = `⚙ ${label}`;
          qualityMenuEl.hidden = true;
        });
        qualityMenuEl.appendChild(btn);
      });
    }

    renderMenu();

    // Update button label when quality auto-switches
    hls.on(window.Hls.Events.LEVEL_SWITCHED, (_e, data) => {
      const lvl = hls.levels[data.level];
      if (hls.currentLevel === -1) {
        const autoLabel = lvl?.height ? `Auto (${lvl.height}p)` : "Auto";
        if (qualityBtnEl) qualityBtnEl.textContent = `⚙ ${autoLabel}`;
      }
      renderMenu();
    });

    if (qualityBtnEl) {
      qualityBtnEl.onclick = (ev) => {
        ev.stopPropagation();
        if (qualityMenuEl) {
          qualityMenuEl.hidden = !qualityMenuEl.hidden;
          if (!qualityMenuEl.hidden) renderMenu();
        }
      };
    }
  }

  // Close quality menu when clicking elsewhere
  document.addEventListener("click", (ev) => {
    if (qualityMenuEl && !qualityMenuEl.hidden &&
        !qualityMenuEl.contains(ev.target) && ev.target !== qualityBtnEl) {
      qualityMenuEl.hidden = true;
    }
  });

  function mountDash(src, time, isPlaying) {
    teardownAdaptive();
    hideQualitySelector();
    if (ytPlayer) { try { ytPlayer.destroy(); } catch { /* ignore */ } ytPlayer = null; }
    mp4El.hidden = false;
    playerKind = "dash";
    if (window.dashjs && window.dashjs.MediaPlayer) {
      dashInstance = window.dashjs.MediaPlayer().create();
      dashInstance.initialize(mp4El, src, !!isPlaying);
      dashInstance.on("streamInitialized", () => {
        if (time > 0) {
          try { dashInstance.seek(Math.max(0, time)); } catch { /* ignore */ }
        }
      });
    } else {
      flashStatus("DASH playback library failed to load.", "error");
      return;
    }
    attachMp4Listeners();
    updatePlayerControls();
  }

  function hideAllPlayers() {
    mp4El.hidden = true;
    rtcEl.hidden = true;
    document.getElementById("yt-player").hidden = true;
  }

  function mountRtc() {
    hideAllPlayers();
    hideQualitySelector();
    document.getElementById("player-empty").hidden = true;
    rtcEl.hidden = false;
    teardownAdaptive();
    resetMp4Element();
    if (ytSeekPollId) { clearInterval(ytSeekPollId); ytSeekPollId = null; }
    if (ytPlayer) { try { ytPlayer.destroy(); } catch { /* ignore */ } ytPlayer = null; }
    document.getElementById("yt-player").hidden = true;
    playerKind = "rtc";
  }

  function mountMp4(src, time, isPlaying) {
    teardownAdaptive();
    hideQualitySelector();
    if (ytPlayer) {
      try { ytPlayer.destroy(); } catch { /* ignore */ }
      ytPlayer = null;
    }
    mp4El.hidden = false;
    playerKind = "mp4";
    if (mp4El.src !== src) mp4El.src = src;
    mp4El.currentTime = Math.max(0, time);
    if (isPlaying) mp4El.play().catch(() => promptAutoplay());
    else mp4El.pause();

    attachMp4Listeners();
    updatePlayerControls();
  }

  function resetMp4Element() {
    try { mp4El.pause(); } catch { /* ignore */ }
    mp4El.onplay = null;
    mp4El.onpause = null;
    mp4El.onseeked = null;
    try { mp4El.removeAttribute("src"); mp4El.load(); } catch { /* ignore */ }
    mp4El.hidden = true;
  }

  function mountYouTube(videoId, time, isPlaying) {
    teardownAdaptive();
    resetMp4Element();
    document.getElementById("yt-player").hidden = false;
    playerKind = "youtube";
    if (ytSeekPollId) { clearInterval(ytSeekPollId); ytSeekPollId = null; }
    let lastObservedTime = time;
    let lastObservedAt = Date.now();
    const create = () => {
      ytPlayer = new YT.Player("yt-player", {
        videoId,
        playerVars: { autoplay: isPlaying ? 1 : 0, modestbranding: 1, rel: 0, playsinline: 1 },
        events: {
          onReady: (e) => {
            if (time > 0) e.target.seekTo(time, true);
            if (isPlaying) e.target.playVideo();
            else e.target.pauseVideo();
            lastObservedTime = time;
            lastObservedAt = Date.now();
          },
          onStateChange: (e) => {
            if (suppress || hostSocketId || !canIControl()) return;
            const t = e.target.getCurrentTime();
            if (e.data === YT.PlayerState.PLAYING) {
              socket.emit("play", { time: t });
              lastObservedTime = t;
              lastObservedAt = Date.now();
            } else if (e.data === YT.PlayerState.PAUSED) {
              const drift = Math.abs(t - lastObservedTime);
              if (drift > SEEK_THRESHOLD) socket.emit("seek", { time: t });
              else socket.emit("pause", { time: t });
              lastObservedTime = t;
              lastObservedAt = Date.now();
            }
          },
        },
      });
      ytSeekPollId = setInterval(() => {
        if (suppress || hostSocketId || !canIControl()) return;
        if (!ytPlayer || !ytPlayer.getCurrentTime || !ytPlayer.getPlayerState) return;
        const state = ytPlayer.getPlayerState();
        if (state !== YT.PlayerState.PLAYING && state !== YT.PlayerState.PAUSED) return;
        const t = ytPlayer.getCurrentTime();
        const now = Date.now();
        const expected = lastObservedTime + (state === YT.PlayerState.PLAYING ? (now - lastObservedAt) / 1000 : 0);
        if (Math.abs(t - expected) > SEEK_THRESHOLD) socket.emit("seek", { time: t });
        lastObservedTime = t;
        lastObservedAt = now;
      }, 750);
    };
    if (window.YT && window.YT.Player) {
      if (ytPlayer) { try { ytPlayer.destroy(); } catch { /* ignore */ } ytPlayer = null; }
      create();
    } else {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { if (typeof prev === "function") prev(); create(); };
    }
    updatePlayerControls();
  }

  function isMediaElPlayer() {
    return playerKind === "mp4" || playerKind === "hls" || playerKind === "dash";
  }
  function applyPlay() {
    if (isMediaElPlayer()) mp4El.play().catch(() => promptAutoplay());
    else if (playerKind === "youtube" && ytPlayer && ytPlayer.playVideo) ytPlayer.playVideo();
  }
  function promptAutoplay() {
    flashStatus("Tap the player to start playback (browser blocked autoplay).", "warning");
  }
  function applyPause() {
    if (isMediaElPlayer()) mp4El.pause();
    else if (playerKind === "youtube" && ytPlayer && ytPlayer.pauseVideo) ytPlayer.pauseVideo();
  }
  function applySeek(time) {
    if (isMediaElPlayer()) {
      if (Math.abs(mp4El.currentTime - time) > SEEK_THRESHOLD) mp4El.currentTime = time;
    } else if (playerKind === "youtube" && ytPlayer && ytPlayer.seekTo) {
      const cur = ytPlayer.getCurrentTime ? ytPlayer.getCurrentTime() : 0;
      if (Math.abs(cur - time) > SEEK_THRESHOLD) ytPlayer.seekTo(time, true);
    }
  }

  function parseYouTube(url) {
    try {
      const u = new URL(url);
      if (u.hostname === "youtu.be") return u.pathname.slice(1) || null;
      if (u.hostname.endsWith("youtube.com")) {
        if (u.pathname === "/watch") return u.searchParams.get("v");
        const m = u.pathname.match(/^\/(embed|shorts|live)\/([A-Za-z0-9_-]+)/);
        if (m) return m[2];
      }
    } catch { /* ignore */ }
    return null;
  }

  function appendMessage(msg, mine) {
    const el = document.createElement("div");
    if (msg.type === "sticker") {
      el.className = "msg msg-sticker" + (mine ? " msg-mine" : "");
      const nm = document.createElement("div");
      nm.className = "msg-name";
      nm.textContent = msg.name;
      el.appendChild(nm);
      if (msg.stickerUrl) {
        const im = document.createElement("img");
        im.className = "msg-sticker-img";
        im.src = msg.stickerUrl;
        im.alt = "Sticker";
        el.appendChild(im);
      }
    } else {
      el.className = "msg" + (mine ? " msg-mine" : "");
      const nm = document.createElement("div");
      nm.className = "msg-name";
      nm.textContent = msg.name;
      const body = document.createElement("div");
      body.className = "msg-text";
      body.textContent = msg.text;
      el.appendChild(nm);
      el.appendChild(body);
    }
    chatMessagesEl.appendChild(el);
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
  }

  function appendSystemMessage(text) {
    const el = document.createElement("div");
    el.className = "msg msg-system";
    el.textContent = text;
    chatMessagesEl.appendChild(el);
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
  }

  let badgeCount = 0;
  const badgeEl = document.getElementById("chat-badge");
  function bumpChatBadge() {
    badgeCount += 1;
    badgeEl.textContent = String(badgeCount);
    badgeEl.hidden = false;
  }
  function clearChatBadge() {
    badgeCount = 0;
    badgeEl.hidden = true;
  }
}

// ===== History (Local Storage) =====
function getLocalHistory() {
  try {
    const val = localStorage.getItem("wp-history");
    return val ? JSON.parse(val) : [];
  } catch { return []; }
}
function addLocalHistory(item) {
  const h = getLocalHistory();
  // Avoid consecutive duplicates
  if (h.length > 0 && h[0].url === item.url) return;
  h.unshift(item);
  if (h.length > 20) h.pop();
  try { localStorage.setItem("wp-history", JSON.stringify(h)); } catch {}
  renderLocalHistory();
}
function renderLocalHistory() {
  const listEl = document.getElementById("history-list");
  if (!listEl) return;
  const h = getLocalHistory();
  listEl.innerHTML = "";
  if (h.length === 0) {
    listEl.innerHTML = '<div style="padding:10px;text-align:center;color:var(--text-muted);font-size:12px;">No history yet.</div>';
    return;
  }
  h.forEach(item => {
    const d = document.createElement("div");
    d.className = "history-dropdown-item";
    d.innerHTML = `<div class="title">${item.url}</div><div class="time">${new Date(item.time).toLocaleDateString()}</div>`;
    d.onclick = () => {
      const srcInput = document.getElementById("source-url");
      if (srcInput) srcInput.value = item.url;
      document.getElementById("history-dropdown").hidden = true;
    };
    listEl.appendChild(d);
  });
}
const histBtn = document.getElementById("history-dropdown-btn");
if (histBtn) {
  histBtn.onclick = (e) => {
    e.preventDefault();
    renderLocalHistory();
    const dropdown = document.getElementById("history-dropdown");
    if (dropdown) dropdown.hidden = !dropdown.hidden;
  };
}

// ===== Queue and Suggestions UI =====
function renderQueueAndSuggestions() {
  const qList = document.getElementById("queue-list");
  const sList = document.getElementById("suggestions-list");
  const sSection = document.getElementById("suggestions-section");
  if (!qList || !sList) return;
  
  // Render Queue
  qList.innerHTML = "";
  if (typeof queueList === "undefined" || queueList.length === 0) {
    qList.innerHTML = '<div class="vote-empty">Queue is empty</div>';
  } else {
    queueList.forEach((q, idx) => {
      const card = document.createElement("div");
      card.className = "vote-card";
      const acts = canIControl() 
        ? `<button class="btn btn-danger" style="padding:2px 6px; font-size:11px;" onclick="window.removeQueue('${q.id}')">Remove</button>`
        : "";
      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <div class="vote-url">${q.title || q.url}</div>
            <div class="vote-meta">Added by ${q.addedByName}</div>
          </div>
          <div class="vote-actions">${acts}</div>
        </div>
      `;
      qList.appendChild(card);
    });
  }

  // Render Suggestions (Admin/Host only usually, but let's show to all if desired, or restrict)
  if (sSection) {
    sSection.hidden = !canIControl();
  }
  sList.innerHTML = "";
  if (typeof suggestionsList === "undefined" || suggestionsList.length === 0) {
    sList.innerHTML = '<div class="vote-empty">No suggestions</div>';
  } else {
    suggestionsList.forEach(s => {
      const card = document.createElement("div");
      card.className = "vote-card";
      const acts = canIControl() 
        ? `<button class="btn btn-primary" style="padding:2px 6px; font-size:11px;" onclick="window.approveQueue('${s.id}')">Approve</button>
           <button class="btn btn-danger" style="padding:2px 6px; font-size:11px;" onclick="window.rejectQueue('${s.id}')">Reject</button>`
        : "";
      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <div class="vote-url">${s.url}</div>
            <div class="vote-meta">Suggested by ${s.addedByName}</div>
          </div>
          <div class="vote-actions">${acts}</div>
        </div>
      `;
      sList.appendChild(card);
    });
  }
}

// Attach these to window so inline onclick works
window.removeQueue = (id) => { if (typeof socket !== "undefined") socket.emit("queue-remove", { id }); };
window.approveQueue = (id) => { if (typeof socket !== "undefined") socket.emit("queue-approve", { id }); };
window.rejectQueue = (id) => { if (typeof socket !== "undefined") socket.emit("queue-reject", { id }); };

// Suggest Form
const sugForm = document.getElementById("suggest-form");
if (sugForm) {
  sugForm.onsubmit = (e) => {
    e.preventDefault();
    const input = document.getElementById("suggest-url");
    if (input && input.value.trim() && typeof socket !== "undefined") {
      socket.emit("queue-suggest", { url: input.value.trim() });
      input.value = "";
      showToast("Suggestion sent for approval", "success");
    }
  };
}

// React to source changes to populate local history
if (typeof socket !== "undefined") {
  socket.on("source-changed", ({ source, sourceType }) => {
    if (source) {
      addLocalHistory({ url: source, type: sourceType, time: Date.now() });
    }
  });

  socket.on("queue-play-item", ({ url }) => {
    // If I'm host, auto-load the URL
    if (canIControl()) {
      const srcInput = document.getElementById("source-url");
      if (srcInput) srcInput.value = url;
      const loadBtn = document.getElementById("extract-btn");
      if (loadBtn) loadBtn.click(); // auto trigger extraction
      else if (document.getElementById("source-form")) document.getElementById("source-form").dispatchEvent(new Event("submit"));
    }
  });

  // Floating Reactions
  socket.on("reaction", ({ emoji, from }) => {
    const canvas = document.getElementById("reaction-canvas");
    if (!canvas) return;
    const el = document.createElement("div");
    el.className = "floating-reaction";
    el.innerHTML = emoji;
    el.style.left = Math.random() * 80 + 10 + "%";
    canvas.appendChild(el);
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 3000);
  });
}

// Wire up reaction buttons
document.querySelectorAll(".reaction-btn").forEach(btn => {
  btn.onclick = () => {
    if (typeof socket !== "undefined") {
      socket.emit("reaction", { emoji: btn.dataset.emoji });
    }
  };
});

// Auto-advance logic (hook into mp4El ended if possible)
const mp4ElRef = document.getElementById("mp4-player");
if (mp4ElRef) {
  mp4ElRef.addEventListener("ended", () => {
    if (canIControl() && typeof socket !== "undefined") {
      socket.emit("queue-next");
    }
  });
}

// Expose a function to see if user is host/admin (since myRole is scoped)
function canIControl() {
  if (typeof isSuperAdmin !== "undefined" && isSuperAdmin) return true;
  // Fallback to checking the UI state of the source bar, which is hidden for viewers
  const viewerBar = document.getElementById("viewer-bar");
  return viewerBar && viewerBar.hidden;
}

// Translations hook
if (window.WP_TRANSLATIONS) {
  let currentLang = localStorage.getItem("wp-lang") || "en";
  
  function applyTranslations() {
    const t = window.WP_TRANSLATIONS[currentLang];
    if (!t) return;
    document.documentElement.lang = currentLang;
    document.documentElement.dir = currentLang === "ar" ? "rtl" : "ltr";
    
    document.querySelectorAll("[data-i18n]").forEach(el => {
      const key = el.getAttribute("data-i18n");
      if (t[key]) {
        if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") el.placeholder = t[key];
        else el.textContent = t[key];
      }
    });
    
    const btn = document.getElementById("lang-toggle-btn");
    if (btn) btn.textContent = currentLang === "ar" ? "🌐 EN" : "🌐 عربي";
  }

  const toggleBtn = document.getElementById("lang-toggle-btn");
  if (toggleBtn) {
    toggleBtn.onclick = () => {
      currentLang = currentLang === "en" ? "ar" : "en";
      localStorage.setItem("wp-lang", currentLang);
      applyTranslations();
    };
  }

  // Initial apply
  applyTranslations();
}
