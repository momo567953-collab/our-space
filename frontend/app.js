/**
 * Our Space - 情侣共享空间前端
 * 注册/登录 + 退出 + 宠物美化 + 心愿清单 + 日历提醒
 */

// ===== Server URL Configuration =====
// When served from the same server (localhost:3000 or Render), use same origin
// When on static cloud deploy (CloudStudio), use a configured remote server URL
let SERVER_URL = '';  // empty = same origin (auto-detected)

// Check for server URL configuration:
// 1. URL parameter: ?server=https://our-space.onrender.com
// 2. localStorage: our_space_server
// 3. Auto: same origin (when backend serves frontend)
(function detectServerUrl() {
  const urlParam = new URLSearchParams(window.location.search).get('server');
  if (urlParam) {
    SERVER_URL = urlParam;
    localStorage.setItem('our_space_server', urlParam);
    return;
  }
  const saved = localStorage.getItem('our_space_server');
  if (saved) {
    SERVER_URL = saved;
    return;
  }
  // Default: same origin (empty string means same origin for Socket.io)
  SERVER_URL = '';
})();

let socket = null;
let socketAvailable = false;
let myName = '';
let partnerName = '';
let inviteCode = '';
let roomKey = '';
let soloMode = false;
let petState = { hunger: 80, happy: 70, energy: 60 };
let petMood = 'waiting';
let calMonth = new Date().getMonth();
let calYear = new Date().getFullYear();
let myMood = 50;
let partnerMood = 50;

// ===================== Utilities =====================
function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }

function showScreen(id) { $$('.screen').forEach(s => s.classList.remove('active')); $(`#${id}`).classList.add('active'); }
function showTab(id) {
  $$('.tab-content').forEach(t => t.classList.remove('active'));
  $$('.tab').forEach(t => t.classList.remove('active'));
  $(`#${id}`).classList.add('active');
  $(`.tab[data-tab="${id.replace('tab-', '')}"]`).classList.add('active');
}
function msg(el, text, type) { el.textContent = text; el.className = 'msg-area ' + type; }
function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}
function daysSince(dateStr) { const d = new Date(dateStr); const now = new Date(); const diff = Math.floor((now - d) / (1000*60*60*24)); return diff >= 0 ? diff : -diff; }
function formatDate(dateStr) { const d = new Date(dateStr); return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`; }
function getRoomKey(n1, n2) { return [n1, n2].sort().join('__'); }
function escHtml(str) { if (!str) return ''; const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

// ===================== Background Hearts =====================
function createBgHearts() {
  const container = $('#bg-hearts');
  if (!container) return;
  const colors = ['#f43f5e', '#ec4899', '#f472b6', '#fb7185', '#f9a8d4', '#c084fc'];
  const heartSVG = `<svg viewBox="0 0 24 24" width="SIZE" height="SIZE"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.28-3.4 6.36-8.55 11.54L12 21.35z" fill="COLOR" opacity="OP"/></svg>`;
  for (let i = 0; i < 18; i++) {
    const heart = document.createElement('div');
    heart.className = 'bg-heart';
    const size = 10 + Math.random() * 18;
    const color = colors[Math.floor(Math.random() * colors.length)];
    const opacity = 0.3 + Math.random() * 0.4;
    heart.innerHTML = heartSVG.replace(/SIZE/g, size).replace('COLOR', color).replace('OP', opacity);
    heart.style.left = Math.random() * 100 + '%';
    heart.style.animationDuration = (10 + Math.random() * 15) + 's';
    heart.style.animationDelay = Math.random() * 15 + 's';
    container.appendChild(heart);
  }
}

// ===================== Heart Photo Layout =====================
function heartCurve(t, scale, ox, oy) {
  const x = 16 * Math.pow(Math.sin(t), 3);
  const y = -(13*Math.cos(t) - 5*Math.cos(2*t) - 2*Math.cos(3*t) - Math.cos(4*t));
  return { x: ox + x * scale, y: oy + y * scale };
}
function layoutPhotosInHeart() {
  const container = $('#heart-container');
  if (!container) return;
  const photos = container.querySelectorAll('.photo-heart-item');
  if (photos.length === 0) return;
  const emptyMsg = $('#photo-empty-msg');
  if (emptyMsg) emptyMsg.style.display = 'none';
  const cW = container.offsetWidth || 420;
  const cH = container.offsetHeight || 380;
  const scale = cW / 38;
  const ox = cW / 2, oy = cH / 2 - 10;
  const n = photos.length;
  const sizes = [56,62,68,73,78,58,64,70,76,82,55,66,72,60,74,80];
  const sizes = [56,62,68,73,78,58,64,70,76,82,55,66,72,60,74,80];
  if (n <= 14) {
    const step = (2*Math.PI) / n;
    for (let i = 0; i < n; i++) {
      const pos = heartCurve(step * i, scale, ox, oy);
      const sz = sizes[i % sizes.length];
      const jt = i % 2 ? -4 : 4;
      photos[i].style.width = sz + 'px'; photos[i].style.height = sz + 'px';
      photos[i].style.left = (pos.x + jt - sz/2) + 'px';
      photos[i].style.top = (pos.y + jt - sz/2) + 'px';
      photos[i].style.transform = `rotate(${(i*19)%14-7}deg)`;
    }
  } else {
    for (let i = 0; i < n; i++) {
      const t = i * (2*Math.PI) / Math.min(n, 16);
      const r = i < 16 ? 1.0 : 0.2 + Math.random() * 0.6;
      const pos = heartCurve(t, scale * r, ox, oy);
      const sz = sizes[i % sizes.length];
      if (i >= 16) { pos.x += (Math.random()-0.5)*20; pos.y += (Math.random()-0.5)*20; }
      photos[i].style.width = sz + 'px'; photos[i].style.height = sz + 'px';
      photos[i].style.left = (pos.x - sz/2) + 'px';
      photos[i].style.top = (pos.y - sz/2) + 'px';
      photos[i].style.transform = `rotate(${(i*19)%14-7}deg)`;
    }
  }
}

// ===================== Local Storage =====================
function localRoomKey() { return 'our_space_room_' + (roomKey || getRoomKey(myName, partnerName || '(等待TA)')); }
function getLocalRoomData() {
  try { return JSON.parse(localStorage.getItem(localRoomKey())) || { milestones: [], notes: [], photos: [], petState: { hunger:80, happy:70, energy:60 }, wishes: [], events: [], moods: [] }; } catch(e) { return { milestones: [], notes: [], photos: [], petState: { hunger:80, happy:70, energy:60 }, wishes: [], events: [], moods: [] }; }
}
function saveLocalRoomData(data) { try { localStorage.setItem(localRoomKey(), JSON.stringify(data)); } catch(e) { console.warn('localStorage full'); } }

// ===================== Auth (Register/Login) =====================
function getAccountStore() {
  try { return JSON.parse(localStorage.getItem('our_space_accounts')) || {}; } catch(e) { return {}; }
}
function saveAccountStore(store) { localStorage.setItem('our_space_accounts', JSON.stringify(store)); }

function hashPassword(pass) {
  // Simple hash for prototype — not real crypto, but better than plaintext
  let hash = 0;
  for (let i = 0; i < pass.length; i++) {
    hash = ((hash << 5) - hash + pass.charCodeAt(i)) | 0;
  }
  return 'h_' + Math.abs(hash).toString(36);
}

function bindAuthEvents() {
  // Tab switching
  $('#tab-login').addEventListener('click', () => {
    $('#tab-login').classList.add('active');
    $('#tab-register').classList.remove('active');
    $('#form-login').classList.add('active');
    $('#form-register').classList.remove('active');
  });
  $('#tab-register').addEventListener('click', () => {
    $('#tab-register').classList.add('active');
    $('#tab-login').classList.remove('active');
    $('#form-register').classList.add('active');
    $('#form-login').classList.remove('active');
  });

  // Login
  $('#btn-login').addEventListener('click', () => {
    const name = $('#login-name').value.trim();
    const pass = $('#login-pass').value;
    if (!name) { msg($('#login-msg'), '请输入昵称', 'err'); return; }
    if (!pass) { msg($('#login-msg'), '请输入密码', 'err'); return; }

    const accounts = getAccountStore();
    if (!accounts[name]) { msg($('#login-msg'), '该昵称未注册', 'err'); return; }
    if (accounts[name].passHash !== hashPassword(pass)) { msg($('#login-msg'), '密码错误', 'err'); return; }

    myName = name;
    inviteCode = accounts[name].inviteCode || randomCode();
    localStorage.setItem('our_space_user', name);
    localStorage.setItem('our_space_invite', inviteCode);
    localStorage.setItem('our_space_auth', hashPassword(pass));

    msg($('#login-msg'), '登录成功！', 'ok');
    setTimeout(() => proceedAfterAuth(), 500);
  });

  // Register
  $('#btn-register').addEventListener('click', () => {
    const name = $('#reg-name').value.trim();
    const pass = $('#reg-pass').value;
    const pass2 = $('#reg-pass2').value;
    if (!name || name.length < 2 || name.length > 12) { msg($('#register-msg'), '昵称需要2-12个字', 'err'); return; }
    if (!pass || pass.length < 4) { msg($('#register-msg'), '密码至少4位', 'err'); return; }
    if (pass !== pass2) { msg($('#register-msg'), '两次密码不一致', 'err'); return; }

    const accounts = getAccountStore();
    if (accounts[name]) { msg($('#register-msg'), '该昵称已被注册', 'err'); return; }

    inviteCode = randomCode();
    accounts[name] = { passHash: hashPassword(pass), inviteCode };
    saveAccountStore(accounts);

    myName = name;
    localStorage.setItem('our_space_user', name);
    localStorage.setItem('our_space_invite', inviteCode);
    localStorage.setItem('our_space_auth', hashPassword(pass));

    msg($('#register-msg'), '注册成功！', 'ok');
    setTimeout(() => proceedAfterAuth(), 500);
  });

  // Enter key shortcuts
  $('#login-pass').addEventListener('keydown', e => { if (e.key === 'Enter') $('#btn-login').click(); });
  $('#reg-pass2').addEventListener('keydown', e => { if (e.key === 'Enter') $('#btn-register').click(); });
}

function proceedAfterAuth() {
  const savedPartner = localStorage.getItem('our_space_partner');
  const savedSolo = localStorage.getItem('our_space_solo');

  if (savedSolo === 'true') {
    soloMode = true;
    partnerName = '(等待TA)';
    roomKey = getRoomKey(myName, partnerName);
    loadFromLocal();
    enterMainScreen();
    tryConnectSocket();
  } else if (savedPartner && savedPartner !== '(等待TA)') {
    partnerName = savedPartner;
    roomKey = getRoomKey(myName, partnerName);
    loadFromLocal();
    enterMainScreen();
    tryConnectSocket();
  } else {
    showScreen('pair-screen');
    $('#my-invite-code').textContent = inviteCode;
    updateShareUrl();
    tryConnectSocket();

    const urlInvite = new URLSearchParams(window.location.search).get('invite');
    if (urlInvite) {
      setTimeout(() => {
        $('#input-partner-code').value = urlInvite;
        setTimeout(() => $('#btn-pair').click(), 800);
      }, 300);
    }
  }
}

// ===================== Logout =====================
function bindLogoutEvents() {
  $('#btn-logout').addEventListener('click', () => {
    $('#modal-logout').classList.add('active');
  });
  $('#btn-cancel-logout').addEventListener('click', () => {
    $('#modal-logout').classList.remove('active');
  });
  $('#btn-confirm-logout').addEventListener('click', () => {
    // Clear session data but keep accounts
    localStorage.removeItem('our_space_user');
    localStorage.removeItem('our_space_partner');
    localStorage.removeItem('our_space_invite');
    localStorage.removeItem('our_space_solo');
    localStorage.removeItem('our_space_auth');

    // Disconnect socket
    if (socket) socket.disconnect();
    socket = null;
    socketAvailable = false;

    // Reset state
    myName = ''; partnerName = ''; inviteCode = ''; roomKey = ''; soloMode = false;
    petState = { hunger: 80, happy: 70, energy: 60 };
    petMood = 'waiting';

    $('#modal-logout').classList.remove('active');
    showScreen('login-screen');

    // Clear input fields
    $('#login-name').value = '';
    $('#login-pass').value = '';
    $('#reg-name').value = '';
    $('#reg-pass').value = '';
    $('#reg-pass2').value = '';

    // Switch to login tab
    $('#tab-login').click();
  });
}

// ===================== Solo & Pair =====================
function enterSoloMode() {
  soloMode = true; partnerName = '(等待TA)';
  localStorage.setItem('our_space_solo', 'true');
  localStorage.setItem('our_space_partner', partnerName);
  roomKey = getRoomKey(myName, partnerName);
  enterMainScreen();
}
function exitSoloMode(newPartner) {
  soloMode = false; partnerName = newPartner;
  localStorage.removeItem('our_space_solo');
  localStorage.setItem('our_space_partner', partnerName);
  roomKey = getRoomKey(myName, partnerName);
  const soloKey = 'our_space_room_' + getRoomKey(myName, '(等待TA)');
  const soloData = JSON.parse(localStorage.getItem(soloKey) || 'null');
  if (soloData && (soloData.milestones.length || soloData.notes.length || soloData.photos.length)) {
    const newKey = 'our_space_room_' + roomKey;
    const existing = JSON.parse(localStorage.getItem(newKey) || 'null');
    if (!existing) localStorage.setItem(newKey, JSON.stringify(soloData));
    localStorage.removeItem(soloKey);
  }
  $('#partner-names').textContent = `${myName} & ${partnerName}`;
  $('#solo-banner').style.display = 'none';
  $('#mode-badge').textContent = '\u{1F512} 端到端加密';
  if (socketAvailable && socket) socket.emit('join-room', { name: myName, partnerName });
}

function bindPairEvents() {
  $('#btn-solo').addEventListener('click', enterSoloMode);
  $('#btn-go-pair').addEventListener('click', () => {
    showScreen('pair-screen');
    if (inviteCode) { $('#my-invite-code').textContent = inviteCode; updateShareUrl(); }
  });

  // Toggle server config panel
  $('#btn-toggle-server').addEventListener('click', () => {
    const panel = $('#server-config');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    if (SERVER_URL) $('#input-server-url').value = SERVER_URL;
  });

  // Set server URL
  $('#btn-set-server').addEventListener('click', () => {
    const url = $('#input-server-url').value.trim().replace(/\/+$/, '');
    if (!url) { msg($('#server-msg'), '请输入服务器地址', 'err'); return; }
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      msg($('#server-msg'), '地址需要以 http:// 或 https:// 开头', 'err'); return;
    }
    SERVER_URL = url;
    localStorage.setItem('our_space_server', url);
    msg($('#server-msg'), '服务器地址已保存，重新连接中...', 'ok');
    updateShareUrl();
    // Reconnect socket with new URL
    if (socket) socket.disconnect();
    socketAvailable = false;
    tryConnectSocket();
    setTimeout(() => {
      if (socketAvailable) msg($('#server-msg'), '连接成功!', 'ok');
      else msg($('#server-msg'), '连接失败，请检查地址', 'err');
    }, 6000);
  });

  $('#btn-copy-code').addEventListener('click', () => {
    const code = $('#my-invite-code').textContent;
    navigator.clipboard.writeText(code).then(() => msg($('#pair-msg'), '邀请码已复制', 'ok')).catch(() => { fallbackCopy(code); msg($('#pair-msg'), '邀请码已复制', 'ok'); });
  });
  $('#btn-copy-link').addEventListener('click', () => {
    const url = $('#share-url').textContent;
    navigator.clipboard.writeText(url).then(() => msg($('#pair-msg'), '链接已复制！', 'ok')).catch(() => { fallbackCopy(url); msg($('#pair-msg'), '链接已复制！', 'ok'); });
  });

  $('#btn-pair').addEventListener('click', () => {
    const code = $('#input-partner-code').value.trim().toUpperCase();
    if (!code) { msg($('#pair-msg'), '请输入对方邀请码', 'err'); return; }
    if (code === inviteCode) { msg($('#pair-msg'), '不能输入自己的邀请码', 'err'); return; }
    if (socketAvailable && socket) {
      socket.emit('pair-request', { code, name: myName });
      msg($('#pair-msg'), '正在连接...', 'info');
    } else {
      msg($('#pair-msg'), '当前为离线模式，无法在线配对。请先用"先自己试试"体验。', 'err');
    }
  });
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
}

function updateShareUrl() {
  let baseUrl = window.location.origin + window.location.pathname;
  const params = new URLSearchParams();
  params.set('invite', inviteCode);
  // If we know the server URL and it's different from current origin, include it
  if (SERVER_URL && SERVER_URL !== window.location.origin) {
    params.set('server', SERVER_URL);
  }
  $('#share-url').textContent = baseUrl + '?' + params.toString();
}

// ===================== Socket =====================
function tryConnectSocket() {
  if (window.__noSocketIO || typeof io === 'undefined') { socketAvailable = false; return; }
  try {
    // Connect to SERVER_URL (empty = same origin, or a remote server like https://our-space.onrender.com)
    const connectUrl = SERVER_URL || undefined;
    socket = io(connectUrl, {
      timeout: 5000,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
      transports: ['websocket', 'polling']
    });
    socket.on('connect', () => {
      socketAvailable = true;
      socket.emit('register', { name: myName, inviteCode });
      if (!soloMode && partnerName && partnerName !== '(等待TA)') socket.emit('join-room', { name: myName, partnerName });
    });
    socket.on('pair-info', (data) => {
      if (data.paired && data.partnerName) {
        if (soloMode) exitSoloMode(data.partnerName);
        else { partnerName = data.partnerName; localStorage.setItem('our_space_partner', partnerName); roomKey = getRoomKey(myName, partnerName); loadFromLocal(); enterMainScreen(); }
      } else if (data.inviteCode) { inviteCode = data.inviteCode; localStorage.setItem('our_space_invite', inviteCode); $('#my-invite-code').textContent = inviteCode; }
    });
    socket.on('pair-success', (data) => {
      if (soloMode) exitSoloMode(data.partnerName);
      else { partnerName = data.partnerName; localStorage.setItem('our_space_partner', partnerName); roomKey = getRoomKey(myName, partnerName); }
      msg($('#pair-msg'), '配对成功！', 'ok');
      setTimeout(() => { loadFromLocal(); enterMainScreen(); }, 500);
    });
    socket.on('paired-by', (data) => {
      if (soloMode) exitSoloMode(data.partnerName);
      else { partnerName = data.partnerName; localStorage.setItem('our_space_partner', partnerName); roomKey = getRoomKey(myName, partnerName); }
      loadFromLocal(); enterMainScreen();
    });
    socket.on('pair-error', (data) => msg($('#pair-msg'), data.msg, 'err'));
    socket.on('photo-new', (data) => { addPhotoToHeart(data); layoutPhotosInHeart(); savePhotoLocal(data); });
    socket.on('photo-delete', (data) => {
      removePhotoLocal(data.id);
      const el = document.querySelector(`.photo-heart-item[data-id="${data.id}"]`);
      if (el) el.remove();
      layoutPhotosInHeart();
      checkAlbumEmpty();
    });
    socket.on('note-new', (data) => { addNoteCard(data); saveNoteLocal(data); });
    socket.on('milestone-new', (data) => { addMilestoneCard(data); saveMilestoneLocal(data); });
    socket.on('milestone-delete', (data) => { const el = document.querySelector(`.milestone-card[data-id="${data.id}"]`); if (el) el.remove(); checkTimelineEmpty(); removeMilestoneLocal(data.id); });
    socket.on('note-delete', (data) => { const el = document.querySelector(`.note-card[data-id="${data.id}"]`); if (el) el.remove(); checkNoteEmpty(); removeNoteLocal(data.id); });
    socket.on('pet-action', (data) => { petState = data.state; updatePetUI(); addPetLog(data.log, false); savePetLocal(); });
    socket.on('pet-sync', (data) => { petState = data.state; updatePetUI(); savePetLocal(); });
    socket.on('wish-new', (data) => { addWishCard(data); saveWishLocal(data); });
    socket.on('wish-toggle', (data) => { const el = document.querySelector(`.wish-card[data-id="${data.id}"]`); if (el) { el.classList.toggle('done', data.done); el.querySelector('.wish-check').textContent = data.done ? '✓' : ''; } saveWishToggleLocal(data.id, data.done); });
    socket.on('wish-delete', (data) => { const el = document.querySelector(`.wish-card[data-id="${data.id}"]`); if (el) el.remove(); checkWishEmpty(); removeWishLocal(data.id); });
    socket.on('event-new', (data) => { addEventCard(data); saveEventLocal(data); renderCalendar(); });
    socket.on('event-delete', (data) => { const el = document.querySelector(`.event-card[data-id="${data.id}"]`); if (el) el.remove(); checkEventEmpty(); removeEventLocal(data.id); renderCalendar(); });
    socket.on('mood-update', (data) => {
      if (data.by === myName) return; // ignore own echo
      updatePartnerMoodDisplay(data.value, true);
      const level = getMoodLevel(data.value);
      const entry = { id: uid(), value: data.value, level: level.label, emoji: level.emoji, colorIdx: level.colorIdx, by: data.by, time: new Date().toLocaleString('zh-CN') };
      addMoodHistory(entry);
      saveMoodLocal(entry);
    });
    // ===== Data Sync Protocol (client-to-client, no server storage) =====
    socket.on('sync-request', () => {
      const data = getLocalRoomData();
      socket.emit('sync-data', data);
    });
    socket.on('sync-data', (incoming) => {
      mergeRemoteData(incoming);
    });
    // Legacy: server room-data (kept for backward compat, but no longer primary data source)
    socket.on('room-data', (data) => {
      if (!data) return;
      // Merge instead of overwrite — localStorage is the source of truth
      mergeRemoteData(data);
    });
    socket.on('connect_error', () => {
      socketAvailable = false;
      console.warn('Socket.io connection failed. Working in offline/local mode.');
    });
    socket.on('reconnect_failed', () => {
      socketAvailable = false;
    });
  } catch(e) { socketAvailable = false; }
}

// ===================== Local Data Helpers =====================
function saveMilestoneLocal(ms) { const data = getLocalRoomData(); if (!data.milestones.find(m => m.id === ms.id)) { data.milestones.push(ms); saveLocalRoomData(data); } }
function removeMilestoneLocal(id) { const data = getLocalRoomData(); data.milestones = data.milestones.filter(m => m.id !== id); saveLocalRoomData(data); }
function savePhotoLocal(photo) { const data = getLocalRoomData(); if (!data.photos.find(p => p.id === photo.id)) { data.photos.push(photo); saveLocalRoomData(data); } }
function removePhotoLocal(id) { const data = getLocalRoomData(); data.photos = data.photos.filter(p => p.id !== id); saveLocalRoomData(data); }
function checkAlbumEmpty() {
  const photos = document.querySelectorAll('.photo-heart-item');
  const emptyMsg = $('#photo-empty-msg');
  if (emptyMsg) emptyMsg.style.display = photos.length === 0 ? 'block' : 'none';
}
function removePhotoLocal(id) { const data = getLocalRoomData(); data.photos = data.photos.filter(p => p.id !== id); saveLocalRoomData(data); }
function saveNoteLocal(note) { const data = getLocalRoomData(); if (!data.notes.find(n => n.id === note.id)) { data.notes.push(note); saveLocalRoomData(data); } }
function removeNoteLocal(id) { const data = getLocalRoomData(); data.notes = data.notes.filter(n => n.id !== id); saveLocalRoomData(data); }
function saveWishLocal(w) { const data = getLocalRoomData(); if (!data.wishes.find(x => x.id === w.id)) { data.wishes.push(w); saveLocalRoomData(data); } }
function removeWishLocal(id) { const data = getLocalRoomData(); data.wishes = data.wishes.filter(x => x.id !== id); saveLocalRoomData(data); }
function saveWishToggleLocal(id, done) { const data = getLocalRoomData(); const w = data.wishes.find(x => x.id === id); if (w) { w.done = done; saveLocalRoomData(data); } }
function saveEventLocal(e) { const data = getLocalRoomData(); if (!data.events.find(x => x.id === e.id)) { data.events.push(e); saveLocalRoomData(data); } }
function removeEventLocal(id) { const data = getLocalRoomData(); data.events = data.events.filter(x => x.id !== id); saveLocalRoomData(data); }
function savePetLocal() { const data = getLocalRoomData(); data.petState = {...petState}; saveLocalRoomData(data); }

// Merge remote data (from partner's localStorage) with ours — union by ID
function mergeRemoteData(incoming) {
  if (!incoming) return;
  const local = getLocalRoomData();
  let changed = false;

  // Merge milestones (by id)
  if (incoming.milestones && incoming.milestones.length) {
    const ids = new Set(local.milestones.map(m => m.id));
    incoming.milestones.forEach(m => { if (!ids.has(m.id)) { local.milestones.push(m); addMilestoneCard(m); changed = true; } });
  }
  // Merge notes (by id)
  if (incoming.notes && incoming.notes.length) {
    const ids = new Set(local.notes.map(n => n.id));
    incoming.notes.forEach(n => { if (!ids.has(n.id)) { local.notes.push(n); addNoteCard(n); changed = true; } });
  }
  // Merge photos (by id)
  if (incoming.photos && incoming.photos.length) {
    const ids = new Set(local.photos.map(p => p.id));
    incoming.photos.forEach(p => { if (!ids.has(p.id)) { local.photos.push(p); addPhotoToHeart(p); changed = true; } });
    if (changed) { setTimeout(layoutPhotosInHeart, 100); checkTimelineEmpty(); checkNoteEmpty(); }
  }
  // Merge wishes (by id)
  if (incoming.wishes && incoming.wishes.length) {
    const ids = new Set(local.wishes.map(w => w.id));
    incoming.wishes.forEach(w => { if (!ids.has(w.id)) { local.wishes.push(w); addWishCard(w); changed = true; } });
  }
  // Merge events (by id)
  if (incoming.events && incoming.events.length) {
    const ids = new Set(local.events.map(e => e.id));
    incoming.events.forEach(e => { if (!ids.has(e.id)) { local.events.push(e); addEventCard(e); changed = true; } });
  }
  // Merge moods (by id)
  if (incoming.moods && incoming.moods.length) {
    const ids = new Set(local.moods.map(m => m.id));
    incoming.moods.forEach(m => { if (!ids.has(m.id)) { local.moods.unshift(m); addMoodHistory(m); changed = true; } });
    if (local.moods.length > 50) local.moods = local.moods.slice(0, 50);
  }
  // Pet state: prefer the one with higher overall stats
  if (incoming.petState) {
    const incAvg = (incoming.petState.hunger + incoming.petState.happy + incoming.petState.energy) / 3;
    const locAvg = (local.petState.hunger + local.petState.happy + local.petState.energy) / 3;
    if (incAvg > locAvg) { local.petState = incoming.petState; petState = incoming.petState; updatePetUI(); changed = true; }
  }

  if (changed) {
    saveLocalRoomData(local);
    renderCalendar();
  }

  // Restore moods
  const myMoodEntry = local.moods && local.moods.find(m => m.by === myName);
  if (myMoodEntry) { myMood = myMoodEntry.value; updateMyMoodDisplay(myMood, false); }
  const partnerMoodEntry = local.moods && local.moods.find(m => m.by !== myName);
  if (partnerMoodEntry) { partnerMood = partnerMoodEntry.value; updatePartnerMoodDisplay(partnerMood, false); }
}

// ===================== Init =====================
function init() {
  bindAllEvents();
  createBgHearts();

  // Check if already logged in
  const savedName = localStorage.getItem('our_space_user');
  const savedAuth = localStorage.getItem('our_space_auth');
  if (savedName && savedAuth) {
    const accounts = getAccountStore();
    if (accounts[savedName] && accounts[savedName].passHash === savedAuth) {
      myName = savedName;
      inviteCode = localStorage.getItem('our_space_invite') || accounts[savedName].inviteCode || randomCode();
      proceedAfterAuth();
      return;
    }
  }
  // Not logged in — show login screen
  showScreen('login-screen');
}

function loadFromLocal() {
  const data = getLocalRoomData();
  if (data.milestones && data.milestones.length) { const empty = document.querySelector('#timeline-list .empty-state'); if (empty) empty.remove(); data.milestones.forEach(ms => addMilestoneCard(ms)); } else { checkTimelineEmpty(); }
  if (data.photos && data.photos.length) { const empty = $('#photo-empty-msg'); if (empty) empty.style.display = 'none'; data.photos.forEach(p => addPhotoToHeart(p)); setTimeout(layoutPhotosInHeart, 100); }
  if (data.notes && data.notes.length) { const empty = document.querySelector('#note-list .empty-state'); if (empty) empty.remove(); data.notes.forEach(n => addNoteCard(n)); } else { checkNoteEmpty(); }
  if (data.wishes && data.wishes.length) { data.wishes.forEach(w => addWishCard(w)); } else { checkWishEmpty(); }
  if (data.events && data.events.length) { data.events.forEach(e => addEventCard(e)); } else { checkEventEmpty(); }
  if (data.petState) { petState = data.petState; updatePetUI(); }
  if (data.moods && data.moods.length) { data.moods.slice(0, 50).forEach(m => addMoodHistory(m)); }
  renderCalendar();
  // Restore moods from data
  const myMoodEntry = data.moods && data.moods.find(m => m.by === myName);
  if (myMoodEntry) { myMood = myMoodEntry.value; updateMyMoodDisplay(myMood, false); }
  const partnerMoodEntry = data.moods && data.moods.find(m => m.by !== myName);
  if (partnerMoodEntry) { partnerMood = partnerMoodEntry.value; updatePartnerMoodDisplay(partnerMood, false); }
  $('#mood-name-me').textContent = myName;
  $('#mood-name-partner').textContent = partnerName || 'TA';
}

function bindAllEvents() {
  bindAuthEvents();
  bindLogoutEvents();
  bindPairEvents();
  bindTabEvents();
  bindTimelineEvents();
  bindAlbumEvents();
  bindNoteEvents();
  bindPetEvents();
  bindWishEvents();
  bindCalendarEvents();
  bindMoodEvents();
  bindModalEvents();
  bindExportImport();
}

// ===================== Main Screen =====================
function enterMainScreen() {
  showScreen('main-screen');
  $('#partner-names').textContent = `${myName} & ${partnerName}`;
  if (soloMode) {
    $('#solo-banner').style.display = 'flex';
    $('#mode-badge').textContent = '体验模式';
    $('#mode-badge').className = 'mode-badge solo';
    $('#data-bar').style.display = 'none';
  } else {
    $('#solo-banner').style.display = 'none';
    $('#mode-badge').textContent = '\u{1F512} 端到端加密';
    $('#mode-badge').className = 'mode-badge';
    $('#data-bar').style.display = 'flex';
  }
  if (socketAvailable && socket && !soloMode && partnerName !== '(等待TA)') {
    socket.emit('join-room', { name: myName, partnerName });
    // Request sync from partner after joining room
    setTimeout(() => socket.emit('sync-request', {}), 1000);
  }
  renderCalendar();
}

// ===================== Tabs =====================
function bindTabEvents() {
  $$('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      showTab('tab-' + tab.dataset.tab);
      if (tab.dataset.tab === 'album') setTimeout(layoutPhotosInHeart, 50);
      if (tab.dataset.tab === 'calendar') renderCalendar();
    });
  });
}

// ===================== Timeline =====================
function bindTimelineEvents() {
  $('#btn-add-milestone').addEventListener('click', () => $('#modal-milestone').classList.add('active'));
  $('#btn-save-ms').addEventListener('click', () => {
    const title = $('#ms-title').value.trim();
    const date = $('#ms-date').value;
    if (!title || !date) return;
    const ms = { id: uid(), title, date, by: myName };
    addMilestoneCard(ms); saveMilestoneLocal(ms);
    if (socketAvailable && socket) socket.emit('milestone-add', ms);
    $('#modal-milestone').classList.remove('active');
    $('#ms-title').value = ''; $('#ms-date').value = '';
    checkTimelineEmpty();
  });
  $('#btn-cancel-ms').addEventListener('click', () => $('#modal-milestone').classList.remove('active'));
}

function addMilestoneCard(ms) {
  const empty = document.querySelector('#timeline-list .empty-state'); if (empty) empty.remove();
  if (document.querySelector(`.milestone-card[data-id="${ms.id}"]`)) return;
  const card = document.createElement('div');
  card.className = 'milestone-card'; card.dataset.id = ms.id;
  card.innerHTML = `<div class="ms-dot"></div><div class="ms-info"><div class="ms-title">${escHtml(ms.title)}</div><div class="ms-date">${formatDate(ms.date)}</div></div><div class="ms-days">${daysSince(ms.date)} 天</div><button class="ms-delete" title="删除">&times;</button>`;
  card.querySelector('.ms-delete').addEventListener('click', () => {
    card.remove(); removeMilestoneLocal(ms.id); checkTimelineEmpty();
    if (socketAvailable && socket) socket.emit('milestone-remove', { id: ms.id });
  });
  $('#timeline-list').appendChild(card);
}

function checkTimelineEmpty() {
  if (!$('#timeline-list .milestone-card')) $('#timeline-list').innerHTML = `<div class="empty-state"><p>还没有记录哦</p><p class="hint">点击右上角添加你们的第一个纪念日</p></div>`;
}

// ===================== Album =====================
function bindAlbumEvents() {
  $('#photo-upload').addEventListener('change', (e) => {
    Array.from(e.target.files).forEach(file => uploadPhoto(file));
    e.target.value = '';
  });
}
function uploadPhoto(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const data = { id: uid(), src: e.target.result, by: myName, time: new Date().toLocaleString('zh-CN') };
    addPhotoToHeart(data); layoutPhotosInHeart(); savePhotoLocal(data);
    // Send base64 directly to partner (server just relays, no file storage)
    if (socketAvailable && socket) socket.emit('photo-upload', data);
  };
  reader.readAsDataURL(file);
}
function addPhotoToHeart(data) {
  const emptyMsg = $('#photo-empty-msg'); if (emptyMsg) emptyMsg.style.display = 'none';
  if (document.querySelector(`.photo-heart-item[data-id="${data.id}"]`)) return;
  const src = data.src || '';
  if (!src) return;
  const card = document.createElement('div');
  card.className = 'photo-heart-item'; card.dataset.id = data.id;
  card.innerHTML = `<img src="${src}" alt="photo" loading="lazy"><div class="photo-who">${escHtml(data.by || '')}</div><button class="photo-del-btn" title="删除照片">×</button>`;
  card.addEventListener('click', (e) => {
    if (e.target.classList.contains('photo-del-btn')) return;
    $('#photo-view-img').src = src; $('#photo-info').textContent = `${data.by || ''} · ${data.time || ''}`; $('#modal-photo').classList.add('active');
  });
  // Delete handler
  card.querySelector('.photo-del-btn').addEventListener('click', (ev) => {
    ev.stopPropagation();
    if (!confirm('确定删除这张照片？')) return;
    removePhotoLocal(data.id);
    card.remove();
    if (socketAvailable && socket) socket.emit('photo-delete', { id: data.id });
    layoutPhotosInHeart();
    checkAlbumEmpty();
  });
  $('#heart-container').appendChild(card);
}

// ===================== Notes =====================
function bindNoteEvents() {
  $('#btn-send-note').addEventListener('click', () => {
    const text = $('#note-input').value.trim();
    if (!text) return;
    const color = $('#note-color').value;
    const note = { id: uid(), text, color, by: myName, time: new Date().toLocaleString('zh-CN') };
    addNoteCard(note); saveNoteLocal(note);
    if (socketAvailable && socket) socket.emit('note-add', note);
    $('#note-input').value = ''; checkNoteEmpty();
  });
  $('#note-input').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#btn-send-note').click(); } });
}
function addNoteCard(note) {
  const empty = document.querySelector('#note-list .empty-state'); if (empty) empty.remove();
  if (document.querySelector(`.note-card[data-id="${note.id}"]`)) return;
  const card = document.createElement('div');
  card.className = 'note-card'; card.dataset.id = note.id; card.style.background = note.color;
  card.innerHTML = `<button class="note-delete" title="删除">&times;</button><div class="note-text">${escHtml(note.text)}</div><div class="note-meta">${escHtml(note.by)} · ${note.time}</div>`;
  card.querySelector('.note-delete').addEventListener('click', () => {
    card.remove(); removeNoteLocal(note.id); checkNoteEmpty();
    if (socketAvailable && socket) socket.emit('note-remove', { id: note.id });
  });
  $('#note-list').prepend(card);
}
function checkNoteEmpty() {
  if (!$('#note-list .note-card')) $('#note-list').innerHTML = `<div class="empty-state"><p>还没有留言</p><p class="hint">给 TA 写一段暖心的话吧</p></div>`;
}

// ===================== Pet (Enhanced Dog) =====================
function bindPetEvents() {
  $$('.pet-btn').forEach(btn => btn.addEventListener('click', () => handlePetAction(btn.dataset.action)));
  setInterval(() => {
    petState.hunger = Math.max(0, petState.hunger - 1);
    petState.happy = Math.max(0, petState.happy - 1);
    petState.energy = Math.min(100, petState.energy + 0.5);
    updatePetUI(); updatePetMood(); savePetLocal();
  }, 30000);
}

function handlePetAction(action) {
  const logs = {
    feed: [`小汪吃得好满足~`, `${myName}喂了小汪好吃的`, `吧唧吧唧，真好吃!`, `小汪摇着尾巴吃光了`],
    play: [`小汪玩得好开心!`, `${myName}和小汪一起玩耍`, `嘻嘻嘻，再来一次!`, `小汪开心得蹦蹦跳跳`],
    sleep: [`小汪打了个小呼噜~`, `小汪进入了梦乡...`, `zzZ... 呼噜噜...`, `小汪蜷成一团睡着了`],
    pet: [`小汪蹭了蹭你的手`, `${myName}摸了摸小汪的头`, `咕噜咕噜... 小汪好满足`, `小汪眯着眼享受你的抚摸`],
    bark: [`小汪汪汪叫了两声!`, `汪汪! 小汪在跟你打招呼`, `小汪兴奋地叫了起来`, `汪~汪汪! 小汪好有活力`],
    cuddle: [`小汪撒娇地蹭了蹭你`, `${myName}被小汪撒娇了`, `小汪用小脑袋蹭你的腿`, `呜~ 小汪想要更多陪伴`],
    bath: [`小汪洗得干干净净!`, `${myName}给小汪洗了个澡`, `哗啦啦~ 小汪好清爽`, `小汪甩甩毛，好舒服`],
    walk: [`小汪出门散步啦!`, `${myName}带小汪出去走走`, `小汪跑跑跳跳，好开心`, `外面的世界好有趣~`]
  };
  const moodTexts = {
    feed: '吃得好满足呀~', play: '开心得蹦蹦跳!', sleep: '呼噜噜睡着了...',
    pet: '眯着眼很享受~', bark: '汪汪汪!', cuddle: '撒娇蹭蹭你~',
    bath: '洗得香香的!', walk: '散步真开心~'
  };
  const effects = {
    feed: '\u{1F356}', play: '\u{1F3B2}', sleep: '', pet: '\u{2764}',
    bark: '\u{1F44B}', cuddle: '\u{1F618}', bath: '\u{1F4A6}', walk: '\u{1F33F}'
  };

  switch(action) {
    case 'feed': petState.hunger = Math.min(100, petState.hunger + 20); petState.happy = Math.min(100, petState.happy + 5); break;
    case 'play': petState.happy = Math.min(100, petState.happy + 20); petState.energy = Math.max(0, petState.energy - 15); petState.hunger = Math.max(0, petState.hunger - 5); break;
    case 'sleep': petState.energy = Math.min(100, petState.energy + 30); petState.happy = Math.max(0, petState.happy - 5); break;
    case 'pet': petState.happy = Math.min(100, petState.happy + 10); petState.energy = Math.max(0, petState.energy - 3); break;
    case 'bark': petState.happy = Math.min(100, petState.happy + 5); petState.energy = Math.max(0, petState.energy - 5); break;
    case 'cuddle': petState.happy = Math.min(100, petState.happy + 15); petState.hunger = Math.max(0, petState.hunger - 3); break;
    case 'bath': petState.happy = Math.min(100, petState.happy + 8); petState.hunger = Math.max(0, petState.hunger - 2); break;
    case 'walk': petState.happy = Math.min(100, petState.happy + 15); petState.energy = Math.max(0, petState.energy - 10); petState.hunger = Math.max(0, petState.hunger - 5); break;
  }

  const logArr = logs[action] || ['...'];
  const logText = logArr[Math.floor(Math.random() * logArr.length)];
  petMood = action;
  updatePetMood(moodTexts[action]);
  savePetLocal();
  if (socketAvailable && socket) socket.emit('pet-action', { action, state: petState, log: logText, by: myName });
  updatePetUI();
  addPetLog(logText, true);
  animateDog(action);
  if (effects[action]) showDogEffect(effects[action], 0, -60);

  // Show blush for happy/cuddle actions
  if (action === 'cuddle' || action === 'pet') {
    const bl = $('#dog-blush-l'), br = $('#dog-blush-r');
    if (bl) bl.classList.add('show');
    if (br) br.classList.add('show');
    setTimeout(() => { if (bl) bl.classList.remove('show'); if (br) br.classList.remove('show'); }, 3000);
  }

  setTimeout(() => { petMood = 'waiting'; updatePetMood(); }, 3000);
}

function updatePetUI() {
  if (!$('#stat-hunger')) return;
  $('#stat-hunger').style.width = petState.hunger + '%';
  $('#stat-happy').style.width = petState.happy + '%';
  $('#stat-energy').style.width = petState.energy + '%';
  $('#val-hunger').textContent = Math.round(petState.hunger);
  $('#val-happy').textContent = Math.round(petState.happy);
  $('#val-energy').textContent = Math.round(petState.energy);
  updateDogExpression();
}

function updatePetMood(customText) {
  const moodEl = $('#pet-mood-text'); if (!moodEl) return;
  if (customText) { moodEl.textContent = customText; return; }
  const avg = (petState.hunger + petState.happy + petState.energy) / 3;
  if (petMood === 'sleeping' || petMood === 'sleep') moodEl.textContent = '呼噜噜睡着了...';
  else if (avg > 70) moodEl.textContent = '小汪很开心，摇着尾巴~';
  else if (avg > 40) moodEl.textContent = '小汪在等你来玩~';
  else if (avg > 20) moodEl.textContent = '小汪有点不开心了...';
  else moodEl.textContent = '小汪好饿好累...快来照顾它!';
}

function updateDogExpression() {
  const eyeL = $('#dog-eye-l'), eyeR = $('#dog-eye-r');
  const mouthShape = $('#mouth-shape'), tongue = $('#dog-tongue');
  const tail = $('#dog-tail'), zzz = $('#dog-zzz');
  if (!eyeL || !mouthShape) return;

  // Reset
  eyeL.className = 'dog-eye left'; eyeR.className = 'dog-eye right';
  tongue.style.display = 'none'; zzz.className = 'dog-zzz';

  const avg = (petState.hunger + petState.happy + petState.energy) / 3;

  if (petMood === 'sleeping' || petMood === 'sleep') {
    eyeL.className = 'dog-eye left sleeping'; eyeR.className = 'dog-eye right sleeping';
    mouthShape.className = 'dog-mouth-smile'; zzz.className = 'dog-zzz show';
    tail.style.animation = 'tailIdle 2s ease-in-out infinite'; return;
  }
  if (petMood === 'feed' || petMood === 'eating') {
    mouthShape.className = 'dog-mouth-open'; tongue.style.display = 'block';
    tail.style.animation = 'tailWagSlow 0.8s ease-in-out infinite'; return;
  }
  if (petMood === 'play' || petMood === 'playing') {
    eyeL.className = 'dog-eye left happy-squint'; eyeR.className = 'dog-eye right happy-squint';
    mouthShape.className = 'dog-mouth-smile'; tongue.style.display = 'block';
    tail.style.animation = 'tailWagFast 0.3s ease-in-out infinite'; return;
  }
  if (petMood === 'bark') {
    mouthShape.className = 'dog-mouth-open'; tongue.style.display = 'block';
    tail.style.animation = 'tailWagFast 0.3s ease-in-out infinite'; return;
  }
  if (petMood === 'cuddle') {
    eyeL.className = 'dog-eye left happy-squint'; eyeR.className = 'dog-eye right happy-squint';
    mouthShape.className = 'dog-mouth-smile';
    tail.style.animation = 'tailWagSlow 0.6s ease-in-out infinite'; return;
  }
  if (petMood === 'pet' || petMood === 'petting') {
    eyeL.className = 'dog-eye left happy-squint'; eyeR.className = 'dog-eye right happy-squint';
    mouthShape.className = 'dog-mouth-smile';
    tail.style.animation = 'tailWagSlow 0.8s ease-in-out infinite'; return;
  }
  if (petMood === 'bath') {
    mouthShape.className = 'dog-mouth-open'; tongue.style.display = 'none';
    tail.style.animation = 'tailWagSlow 0.6s ease-in-out infinite'; return;
  }
  if (petMood === 'walk') {
    eyeL.className = 'dog-eye left happy-squint'; eyeR.className = 'dog-eye right happy-squint';
    mouthShape.className = 'dog-mouth-smile'; tongue.style.display = 'block';
    tail.style.animation = 'tailWagFast 0.4s ease-in-out infinite'; return;
  }

  // Default mood
  if (avg > 70) { mouthShape.className = 'dog-mouth-smile'; tail.style.animation = 'tailWagSlow 1s ease-in-out infinite'; }
  else if (avg > 40) { mouthShape.className = 'dog-mouth-neutral'; tail.style.animation = 'tailIdle 1.5s ease-in-out infinite'; }
  else if (avg > 20) { mouthShape.className = 'dog-mouth-sad'; tail.style.animation = 'tailIdle 2s ease-in-out infinite'; }
  else { mouthShape.className = 'dog-mouth-sad'; tail.style.animation = 'none'; tail.style.transform = 'rotate(-30deg)'; }
}

function animateDog(action) {
  const el = $('#dog-body'); if (!el) return;
  el.classList.remove('anim-eating', 'anim-playing', 'anim-sleeping', 'anim-petting', 'anim-barking', 'anim-bathing', 'anim-walking');
  switch(action) {
    case 'feed': el.classList.add('anim-eating'); setTimeout(() => el.classList.remove('anim-eating'), 1200); break;
    case 'play': el.classList.add('anim-playing'); setTimeout(() => el.classList.remove('anim-playing'), 1200); break;
    case 'sleep':
      el.classList.add('anim-sleeping'); petMood = 'sleeping'; updateDogExpression(); updatePetMood('呼噜噜睡着了...');
      setTimeout(() => { el.classList.remove('anim-sleeping'); petMood = 'waiting'; updateDogExpression(); updatePetMood(); }, 5000);
      break;
    case 'pet': el.classList.add('anim-petting'); setTimeout(() => el.classList.remove('anim-petting'), 1000); break;
    case 'bark': el.classList.add('anim-barking'); setTimeout(() => el.classList.remove('anim-barking'), 800); break;
    case 'cuddle': el.classList.add('anim-petting'); setTimeout(() => el.classList.remove('anim-petting'), 1000); break;
    case 'bath': el.classList.add('anim-bathing'); setTimeout(() => el.classList.remove('anim-bathing'), 1000); break;
    case 'walk': el.classList.add('anim-walking'); setTimeout(() => el.classList.remove('anim-walking'), 1200); break;
  }
}

function showDogEffect(emoji, ox, oy) {
  const dogBody = $('#dog-body'); if (!dogBody) return;
  const effect = document.createElement('div');
  effect.className = 'dog-action-effect'; effect.textContent = emoji;
  effect.style.fontSize = '1.5rem'; effect.style.left = (50 + ox) + 'px'; effect.style.top = oy + 'px';
  dogBody.appendChild(effect);
  setTimeout(() => effect.remove(), 700);
}

function addPetLog(text, isMine) {
  const log = $('#pet-log'); if (!log) return;
  const entry = document.createElement('p');
  entry.className = 'log-entry'; entry.textContent = text;
  log.prepend(entry);
  while (log.children.length > 20) log.lastChild.remove();
}

// ===================== Wish List =====================
const wishCatLabels = { travel: '旅行', food: '美食', movie: '电影', gift: '礼物', daily: '日常', dream: '梦想' };

function bindWishEvents() {
  $('#btn-add-wish').addEventListener('click', () => $('#modal-wish').classList.add('active'));
  $('#btn-save-wish').addEventListener('click', () => {
    const title = $('#wish-title').value.trim();
    const cat = $('#wish-cat').value;
    if (!title) return;
    const wish = { id: uid(), title, cat, by: myName, done: false, time: new Date().toLocaleString('zh-CN') };
    addWishCard(wish); saveWishLocal(wish);
    if (socketAvailable && socket) socket.emit('wish-add', wish);
    $('#modal-wish').classList.remove('active');
    $('#wish-title').value = ''; checkWishEmpty();
  });
  $('#btn-cancel-wish').addEventListener('click', () => $('#modal-wish').classList.remove('active'));
}

function addWishCard(w) {
  const empty = document.querySelector('#wish-list .empty-state'); if (empty) empty.remove();
  if (document.querySelector(`.wish-card[data-id="${w.id}"]`)) return;
  const card = document.createElement('div');
  card.className = 'wish-card' + (w.done ? ' done' : '');
  card.dataset.id = w.id;
  card.innerHTML = `
    <button class="wish-check">${w.done ? '✓' : ''}</button>
    <div class="wish-body">
      <div class="wish-title">${escHtml(w.title)}</div>
      <div class="wish-meta">${escHtml(w.by)} · ${w.time} · <span class="wish-cat ${w.cat}">${wishCatLabels[w.cat] || w.cat}</span></div>
    </div>
    <button class="wish-delete" title="删除">&times;</button>`;
  card.querySelector('.wish-check').addEventListener('click', () => {
    const newDone = !card.classList.contains('done');
    card.classList.toggle('done', newDone);
    card.querySelector('.wish-check').textContent = newDone ? '✓' : '';
    saveWishToggleLocal(w.id, newDone);
    if (socketAvailable && socket) socket.emit('wish-toggle', { id: w.id, done: newDone });
  });
  card.querySelector('.wish-delete').addEventListener('click', () => {
    card.remove(); removeWishLocal(w.id); checkWishEmpty();
    if (socketAvailable && socket) socket.emit('wish-delete', { id: w.id });
  });
  $('#wish-list').appendChild(card);
}

function checkWishEmpty() {
  if (!$('#wish-list .wish-card')) $('#wish-list').innerHTML = `<div class="empty-state"><p>还没有心愿</p><p class="hint">写下你们想一起做的事吧</p></div>`;
}

// ===================== Calendar & Events =====================
const eventTypeLabels = { birthday: '生日', anniversary: '纪念日', date: '约会', reminder: '提醒' };

function bindCalendarEvents() {
  $('#btn-add-event').addEventListener('click', () => $('#modal-event').classList.add('active'));
  $('#btn-save-event').addEventListener('click', () => {
    const title = $('#event-title').value.trim();
    const date = $('#event-date').value;
    const type = $('#event-type').value;
    if (!title || !date) return;
    const event = { id: uid(), title, date, type, by: myName };
    addEventCard(event); saveEventLocal(event); renderCalendar();
    if (socketAvailable && socket) socket.emit('event-add', event);
    $('#modal-event').classList.remove('active');
    $('#event-title').value = ''; $('#event-date').value = ''; checkEventEmpty();
  });
  $('#btn-cancel-event').addEventListener('click', () => $('#modal-event').classList.remove('active'));
  $('#btn-cal-prev').addEventListener('click', () => { calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; } renderCalendar(); });
  $('#btn-cal-next').addEventListener('click', () => { calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; } renderCalendar(); });
}

function addEventCard(e) {
  const empty = document.querySelector('#event-list .empty-state'); if (empty) empty.remove();
  if (document.querySelector(`.event-card[data-id="${e.id}"]`)) return;
  const d = new Date(e.date);
  const daysLeft = Math.ceil((d - new Date()) / (1000*60*60*24));
  const card = document.createElement('div');
  card.className = 'event-card'; card.dataset.id = e.id;
  card.innerHTML = `
    <span class="event-type-badge ${e.type}">${eventTypeLabels[e.type] || e.type}</span>
    <div class="event-body"><div class="event-title">${escHtml(e.title)}</div><div class="event-date">${formatDate(e.date)}</div></div>
    <div class="event-days">${daysLeft > 0 ? daysLeft + '天后' : daysLeft === 0 ? '今天!' : Math.abs(daysLeft) + '天前'}</div>
    <button class="event-delete" title="删除">&times;</button>`;
  card.querySelector('.event-delete').addEventListener('click', () => {
    card.remove(); removeEventLocal(e.id); checkEventEmpty(); renderCalendar();
    if (socketAvailable && socket) socket.emit('event-delete', { id: e.id });
  });
  $('#event-list').appendChild(card);
}

function checkEventEmpty() {
  if (!$('#event-list .event-card')) $('#event-list').innerHTML = `<div class="empty-state"><p>没有提醒事项</p><p class="hint">添加你们的纪念日、生日、重要约会</p></div>`;
}

function renderCalendar() {
  const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
  const titleEl = $('#cal-month-title');
  if (titleEl) titleEl.textContent = `${calYear}年 ${monthNames[calMonth]}`;

  const grid = $('#calendar-grid');
  if (!grid) return;
  grid.innerHTML = '';

  // Header cells
  const days = ['日', '一', '二', '三', '四', '五', '六'];
  days.forEach(d => { const cell = document.createElement('div'); cell.className = 'cal-header-cell'; cell.textContent = d; grid.appendChild(cell); });

  const data = getLocalRoomData();
  const eventDates = new Set((data.events || []).map(e => e.date));

  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

  // Previous month days
  const prevDays = new Date(calYear, calMonth, 0).getDate();
  for (let i = firstDay - 1; i >= 0; i--) {
    const cell = document.createElement('div');
    cell.className = 'cal-cell other-month'; cell.textContent = prevDays - i;
    grid.appendChild(cell);
  }

  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const cell = document.createElement('div');
    cell.className = 'cal-cell';
    if (dateStr === todayStr) cell.classList.add('today');
    if (eventDates.has(dateStr)) cell.classList.add('has-event');
    cell.textContent = d;
    grid.appendChild(cell);
  }

  // Next month days
  const totalCells = firstDay + daysInMonth;
  const remaining = (7 - totalCells % 7) % 7;
  for (let d = 1; d <= remaining; d++) {
    const cell = document.createElement('div');
    cell.className = 'cal-cell other-month'; cell.textContent = d;
    grid.appendChild(cell);
  }
}

// ===================== Mood =====================
const moodLevels = [
  { min: 0, max: 16, label: '非常不好', emoji: '\u{1F62D}', colorIdx: 0 },
  { min: 17, max: 33, label: '不好', emoji: '\u{1F614}', colorIdx: 1 },
  { min: 34, max: 50, label: '一般', emoji: '\u{1F610}', colorIdx: 2 },
  { min: 51, max: 66, label: '良好', emoji: '\u{1F642}', colorIdx: 3 },
  { min: 67, max: 83, label: '好', emoji: '\u{1F60A}', colorIdx: 4 },
  { min: 84, max: 100, label: '非常好', emoji: '\u{1F970}', colorIdx: 5 }
];

function getMoodLevel(val) {
  const v = Math.max(0, Math.min(100, Math.round(val)));
  return moodLevels.find(l => v >= l.min && v <= l.max) || moodLevels[2];
}

function bindMoodEvents() {
  const slider = $('#mood-slider-me');
  const numInput = $('#mood-number-me');
  if (!slider || !numInput) return;

  slider.addEventListener('input', () => {
    const v = parseInt(slider.value);
    numInput.value = v;
    previewMyMood(v);
  });
  numInput.addEventListener('input', () => {
    let v = parseInt(numInput.value);
    if (isNaN(v)) v = 50;
    v = Math.max(0, Math.min(100, v));
    slider.value = v;
    previewMyMood(v);
  });

  $('#btn-mood-submit').addEventListener('click', () => {
    let v = parseInt(numInput.value);
    if (isNaN(v)) v = 50;
    v = Math.max(0, Math.min(100, v));
    myMood = v;
    const level = getMoodLevel(v);
    const moodEntry = { id: uid(), value: v, level: level.label, emoji: level.emoji, colorIdx: level.colorIdx, by: myName, time: new Date().toLocaleString('zh-CN') };

    updateMyMoodDisplay(v, true);
    addMoodHistory(moodEntry);
    saveMoodLocal(moodEntry);
    if (socketAvailable && socket) socket.emit('mood-update', { value: v, by: myName });
  });

  // Init display
  $('#mood-name-me').textContent = myName || '我';
  $('#mood-name-partner').textContent = partnerName || 'TA';
  previewMyMood(myMood);
}

function previewMyMood(v) {
  const level = getMoodLevel(v);
  const emojiEl = $('#mood-emoji-me');
  const levelEl = $('#mood-level-me');
  const valueEl = $('#mood-value-me');
  const barEl = $('#mood-bar-me');
  if (emojiEl) emojiEl.textContent = level.emoji;
  if (levelEl) { levelEl.textContent = level.label; levelEl.className = 'mood-level-text mood-color-' + level.colorIdx; }
  if (valueEl) { valueEl.textContent = v; valueEl.className = 'mood-value mood-color-' + level.colorIdx; }
  if (barEl) barEl.style.width = (100 - v) + '%';
}

function updateMyMoodDisplay(v, animate) {
  const level = getMoodLevel(v);
  const emojiEl = $('#mood-emoji-me');
  const levelEl = $('#mood-level-me');
  const valueEl = $('#mood-value-me');
  const barEl = $('#mood-bar-me');
  if (emojiEl) { emojiEl.textContent = level.emoji; if (animate) { emojiEl.classList.remove('bounce'); void emojiEl.offsetWidth; emojiEl.classList.add('bounce'); } }
  if (levelEl) { levelEl.textContent = level.label; levelEl.className = 'mood-level-text mood-color-' + level.colorIdx; }
  if (valueEl) { valueEl.textContent = v; valueEl.className = 'mood-value mood-color-' + level.colorIdx; }
  if (barEl) barEl.style.width = (100 - v) + '%';
  if ($('#mood-slider-me')) $('#mood-slider-me').value = v;
  if ($('#mood-number-me')) $('#mood-number-me').value = v;
}

function updatePartnerMoodDisplay(v, animate) {
  partnerMood = v;
  const level = getMoodLevel(v);
  const emojiEl = $('#mood-emoji-partner');
  const levelEl = $('#mood-level-partner');
  const valueEl = $('#mood-value-partner');
  const barEl = $('#mood-bar-partner');
  if (emojiEl) { emojiEl.textContent = level.emoji; if (animate) { emojiEl.classList.remove('bounce'); void emojiEl.offsetWidth; emojiEl.classList.add('bounce'); } }
  if (levelEl) { levelEl.textContent = level.label; levelEl.className = 'mood-level-text mood-color-' + level.colorIdx; }
  if (valueEl) { valueEl.textContent = v; valueEl.className = 'mood-value mood-color-' + level.colorIdx; }
  if (barEl) barEl.style.width = (100 - v) + '%';
}

function addMoodHistory(entry) {
  const empty = document.querySelector('#mood-history-list .empty-state'); if (empty) empty.remove();
  if (document.querySelector(`.mood-history-item[data-id="${entry.id}"]`)) return;
  const item = document.createElement('div');
  item.className = 'mood-history-item'; item.dataset.id = entry.id;
  item.innerHTML = `<span class="mood-h-emoji">${entry.emoji}</span><span class="mood-h-level mood-color-${entry.colorIdx}">${escHtml(entry.level)}</span><span class="mood-h-value">${entry.value}</span><span class="mood-h-who">${escHtml(entry.by)}</span><span class="mood-h-time">${entry.time}</span>`;
  $('#mood-history-list').prepend(item);
  // Keep max 50 items
  const list = $('#mood-history-list');
  while (list.children.length > 50) list.lastChild.remove();
}

function saveMoodLocal(entry) {
  const data = getLocalRoomData();
  if (!data.moods) data.moods = [];
  data.moods.unshift(entry);
  if (data.moods.length > 50) data.moods = data.moods.slice(0, 50);
  saveLocalRoomData(data);
}

// ===================== Modals =====================
// ===================== Export/Import Backup =====================
function bindExportImport() {
  $('#btn-export-data').addEventListener('click', () => {
    const data = getLocalRoomData();
    const accounts = localStorage.getItem('our_space_accounts') || '{}';
    const auth = localStorage.getItem('our_space_auth') || '';
    const exportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      user: myName,
      partner: partnerName,
      inviteCode: inviteCode,
      roomData: data,
      accounts: JSON.parse(accounts),
      auth: auth
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `our-space-backup-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    alert('备份文件已下载！\n\n换设备后在这里点"导入恢复"即可恢复所有数据。');
  });

  $('#btn-import-data').addEventListener('click', () => {
    $('#import-file-input').click();
  });

  $('#import-file-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const importData = JSON.parse(ev.target.result);
        if (!importData.version || !importData.roomData) {
          alert('无效的备份文件格式');
          return;
        }
        // Restore pairing info
        if (importData.inviteCode) {
          inviteCode = importData.inviteCode;
          localStorage.setItem('our_space_invite', importData.inviteCode);
        }
        if (importData.accounts) {
          localStorage.setItem('our_space_accounts', JSON.stringify(importData.accounts));
        }
        if (importData.auth) {
          localStorage.setItem('our_space_auth', importData.auth);
        }
        // Merge room data (not overwrite — keep existing + add new)
        mergeRemoteData(importData.roomData);
        alert('数据恢复成功！\n\n已合并备份中的内容到当前空间。');
      } catch(err) {
        alert('文件解析失败，请确认选择了正确的备份文件');
      }
    };
    reader.readAsText(file);
  });
}

function bindModalEvents() {
  $('#btn-close-photo').addEventListener('click', () => $('#modal-photo').classList.remove('active'));
  $$('.modal').forEach(modal => { modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('active'); }); });
}

// ===================== Start =====================
document.addEventListener('DOMContentLoaded', init);
window.addEventListener('resize', () => { if ($('#tab-album').classList.contains('active')) layoutPhotosInHeart(); });