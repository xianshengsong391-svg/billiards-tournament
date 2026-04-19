/* ===================================================
   大金台球赛事管理系统 - 核心逻辑
   app.js  v1.0
=================================================== */

// ───────────────────────────────────────────
// 1. 数据层（LocalStorage）
// ───────────────────────────────────────────
const DB = {
  get(key, def = null) {
    try { const v = localStorage.getItem('daking_' + key); return v ? JSON.parse(v) : def; } catch { return def; }
  },
  set(key, val) { localStorage.setItem('daking_' + key, JSON.stringify(val)); },
  remove(key)   { localStorage.removeItem('daking_' + key); }
};

// 获取/保存所有赛事
function getEvents()       { return DB.get('events', []); }
function saveEvents(evts)  { DB.set('events', evts); }

// 后端API模式（优先）
async function getEventsAPI() {
  try {
    if (window.api) {
      const events = await window.api.listEvents();
      if (events && events.length > 0) {
        // 同步到本地
        saveEvents(events);
        return events;
      }
    }
  } catch (e) {
    console.log('API获取失败，使用本地数据');
  }
  return getEvents();
}

async function saveEventAPI(eventData) {
  try {
    if (window.api) {
      await window.api.createEvent(eventData);
    }
  } catch (e) {
    console.log('API保存失败');
  }
  // 同时保存本地
  const events = getEvents();
  events.unshift(eventData);
  saveEvents(events);
}
function getSettings()     { return DB.get('settings', { siteUrl: '', adminPwd: '' }); }
function saveSettings_()   { DB.set('settings', getSettings()); }

// 登录状态管理
function isAdminLoggedIn() {
  const settings = getSettings();
  if (!settings.adminPwd) return true; // 未设置密码时免登录
  return sessionStorage.getItem('adminLoggedIn') === 'true';
}

function doLogin() {
  const pwd = document.getElementById('login-password').value.trim();
  const settings = getSettings();
  if (pwd === settings.adminPwd) {
    sessionStorage.setItem('adminLoggedIn', 'true');
    showAdminPanel();
  } else {
    document.getElementById('login-error').textContent = '密码错误，请重试';
  }
}

function doLogout() {
  sessionStorage.removeItem('adminLoggedIn');
  showPage('home');
  showToast('已退出登录');
}

function showAdminPanel() {
  document.getElementById('admin-login-panel').style.display = 'none';
  document.getElementById('admin-content').style.display = 'block';
  refreshAdminSelects();
}

function checkAdminLogin() {
  if (isAdminLoggedIn()) {
    showAdminPanel();
  } else {
    document.getElementById('admin-login-panel').style.display = 'flex';
    document.getElementById('admin-content').style.display = 'none';
  }
}

// 生成唯一ID
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

// 当前管理的赛事ID
let currentEventId = null;
let currentPlayerFilter = 'all';
let scoreEditMatchId = null;

// ───────────────────────────────────────────
// 2. 页面路由
// ───────────────────────────────────────────
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const p = document.getElementById('page-' + name);
  if (p) p.classList.add('active');
  const n = document.getElementById('nav-' + name);
  if (n) n.classList.add('active');

  if (name === 'home')   renderHome();
  if (name === 'events') renderEventsList();
  if (name === 'admin')  checkAdminLogin();
}

function switchAdminTab(tab) {
  document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  const panel = document.getElementById('admin-' + tab);
  const btn   = document.getElementById('tab-' + tab);
  if (panel) panel.classList.add('active');
  if (btn)   btn.classList.add('active');
  if (tab === 'manage')  refreshManageSelect();
  if (tab === 'players') refreshPlayersSelect();
  if (tab === 'settings') loadSettingsUI();
}

// ───────────────────────────────────────────
// 3. 首页渲染
// ───────────────────────────────────────────
function renderHome() {
  const events = getEvents();
  const active = events.filter(e => e.status === 'active');

  // 进行中赛事
  const el = document.getElementById('active-events-list');
  if (active.length === 0) {
    el.innerHTML = '<div class="empty-tip">暂无进行中的赛事，<a onclick="showPage(\'admin\');switchAdminTab(\'create\')">去创建</a></div>';
  } else {
    el.innerHTML = active.map(e => eventCardHTML(e)).join('');
  }

  // 全局统计
  const totalPlayers = events.reduce((s, e) => s + (e.players ? e.players.filter(p => p.status === 'approved').length : 0), 0);
  const totalMatches = events.reduce((s, e) => s + (e.matches ? e.matches.filter(m => m.completed).length : 0), 0);
  document.getElementById('stat-total-events').textContent = events.length;
  document.getElementById('stat-total-players').textContent = totalPlayers;
  document.getElementById('stat-total-matches').textContent = totalMatches;
}

function eventCardHTML(e) {
  const approved = (e.players || []).filter(p => p.status === 'approved').length;
  const totalM   = (e.matches || []).length;
  const doneM    = (e.matches || []).filter(m => m.completed).length;
  const statusMap = { active: ['status-active','进行中'], ended: ['status-ended','已结束'], draft: ['status-draft','草稿'] };
  const [cls, label] = statusMap[e.status] || ['status-draft','草稿'];
  return `
  <div class="event-card fadeIn" onclick="openEventDetail('${e.id}')">
    <div class="event-card-header">
      <div class="event-card-name">${e.name}</div>
      <span class="event-status ${cls}">${label}</span>
    </div>
    <div class="event-card-meta">
      <span class="meta-item">🎱 ${typeLabel(e.type, e.customType)}</span>
      <span class="meta-item">📅 ${e.date || '待定'}</span>
      <span class="meta-item">📍 ${e.location || '待定'}</span>
      <span class="meta-item">💰 报名费 ${e.fee || 0}元</span>
    </div>
    <div class="event-card-stats">
      <div class="event-stat"><div class="event-stat-num">${approved}</div><div class="event-stat-label">报名选手</div></div>
      <div class="event-stat"><div class="event-stat-num">${totalM}</div><div class="event-stat-label">总场次</div></div>
      <div class="event-stat"><div class="event-stat-num">${doneM}</div><div class="event-stat-label">已完赛</div></div>
      <div class="event-stat"><div class="event-stat-num">${totalM - doneM}</div><div class="event-stat-label">待完赛</div></div>
    </div>
  </div>`;
}

function typeLabel(type, custom) {
  const map = {
    '9ball':'9球追分赛','6ball':'6球追分赛','4ball':'4球追分赛',
    '8ball-standard':'中式八球标准赛','8ball-handicap':'中式八球让球赛',
    '8ball-elastic':'弹性让球赛','custom': custom || '自定义'
  };
  return map[type] || type;
}

// ───────────────────────────────────────────
// 4. 赛事列表渲染
// ───────────────────────────────────────────
function renderEventsList() {
  const events = getEvents();
  const el = document.getElementById('events-list');
  if (events.length === 0) {
    el.innerHTML = '<div class="empty-tip">还没有赛事，<a onclick="showPage(\'admin\');switchAdminTab(\'create\')">去创建第一个赛事</a></div>';
    return;
  }
  el.innerHTML = events.map(e => eventCardHTML(e)).join('');
}

// ───────────────────────────────────────────
// 5. 创建赛事
// ───────────────────────────────────────────
function onEventTypeChange() {
  const v = document.getElementById('event-type').value;
  document.getElementById('custom-type-group').style.display = v === 'custom' ? 'block' : 'none';
}

function uploadPayQR(type, input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const previewId = type + '-qr-preview';
    document.getElementById(previewId).innerHTML = `<img src="${e.target.result}" style="max-width:100%;max-height:200px;border-radius:8px">`;
    // 保存到临时全局
    window['_qr_' + type] = e.target.result;
  };
  reader.readAsDataURL(file);
}

function createTournament() {
  console.log('createTournament called');
  const name = document.getElementById('event-name').value.trim();
  if (!name) { showToast('请填写赛事名称'); return; }

  const stores = [...document.querySelectorAll('input[name="event-store"]:checked')].map(i => i.value);
  if (stores.length === 0) { showToast('请至少选择一个参赛门店'); return; }

  // 获取日期，如果没有填写则使用今天
  let dateVal = document.getElementById('event-date').value;
  if (!dateVal) {
    dateVal = new Date().toISOString().split('T')[0];
  }

  const evt = {
    id:          uid(),
    name,
    type:        document.getElementById('event-type').value,
    customType:  document.getElementById('custom-type-name').value.trim(),
    rules:       document.getElementById('event-rules').value.trim(),
    stores,
    bracketType: document.getElementById('event-bracket-type').value,
    fee:         parseFloat(document.getElementById('event-fee').value) || 0,
    date:        dateVal,
    location:    document.getElementById('event-location').value.trim(),
    wechatQR:    window._qr_wechat || '',
    alipayQR:    window._qr_alipay || '',
    status:      'active',
    players:     [],
    matches:     [],
    bracket:     null,
    createdAt:   Date.now()
  };

  // 先保存到本地
  const events = getEvents();
  events.unshift(evt);
  saveEvents(events);
  
  // 同时保存到后端
  saveEventAPI(evt).catch(err => console.error('保存到后端失败:', err));
  
  showToast('赛事创建成功！');

  // 重置表单
  document.getElementById('event-name').value = '';
  document.getElementById('event-rules').value = '';
  document.getElementById('event-fee').value = '';
  document.getElementById('event-date').value = '';
  document.getElementById('event-location').value = '';
  window._qr_wechat = '';
  window._qr_alipay = '';
  document.getElementById('wechat-qr-preview').innerHTML = '<span>📷 点击上传微信收款码</span>';
  document.getElementById('alipay-qr-preview').innerHTML = '<span>📷 点击上传支付宝收款码</span>';

  switchAdminTab('manage');
  refreshManageSelect();
  // 自动选中刚创建的赛事
  document.getElementById('manage-event-select').value = evt.id;
  currentEventId = evt.id;
  loadEventManage();
}

// ───────────────────────────────────────────
// 6. 后台选择赛事下拉刷新
// ───────────────────────────────────────────
function refreshAdminSelects() {
  refreshManageSelect();
  refreshPlayersSelect();
}

function refreshManageSelect() {
  const sel = document.getElementById('manage-event-select');
  const prev = sel.value;
  const events = getEvents();
  sel.innerHTML = '<option value="">-- 请选择赛事 --</option>' +
    events.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
  if (prev) sel.value = prev;
}

function refreshPlayersSelect() {
  const sel = document.getElementById('players-event-select');
  const prev = sel.value;
  const events = getEvents();
  sel.innerHTML = '<option value="">-- 请选择赛事 --</option>' +
    events.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
  if (prev) sel.value = prev;
}

// ───────────────────────────────────────────
// 7. 赛事管理面板
// ───────────────────────────────────────────
function loadEventManage() {
  const id = document.getElementById('manage-event-select').value;
  currentEventId = id;
  const panel = document.getElementById('event-manage-panel');
  if (!id) { panel.style.display = 'none'; return; }
  panel.style.display = 'block';

  const evt = getEventById(id);
  if (!evt) return;

  // 基本信息栏
  document.getElementById('event-info-bar').innerHTML = `
    <div class="info-item"><span class="info-label">赛事：</span><span class="info-val">${evt.name}</span></div>
    <div class="info-item"><span class="info-label">类型：</span><span class="info-val">${typeLabel(evt.type, evt.customType)}</span></div>
    <div class="info-item"><span class="info-label">赛制：</span><span class="info-val">${evt.bracketType === 'double' ? '双败淘汰' : '单败淘汰'}</span></div>
    <div class="info-item"><span class="info-label">报名费：</span><span class="info-val">${evt.fee}元</span></div>
    <div class="info-item">
      <button class="btn-sm btn-outline" onclick="toggleEventStatus('${evt.id}')">
        ${evt.status === 'active' ? '🔴 结束赛事' : '🟢 重开赛事'}
      </button>
      <button class="btn-sm btn-danger" onclick="deleteEvent('${evt.id}')" style="margin-left:6px">🗑 删除</button>
    </div>`;

  // 对阵表状态
  const bs = document.getElementById('bracket-status');
  bs.innerHTML = evt.bracket
    ? `<div class="bracket-status-badge">✅ 对阵表已生成（${evt.bracket.rounds ? evt.bracket.rounds.length : 0}轮）</div>`
    : `<div style="color:var(--text-muted);font-size:13px;margin-bottom:8px">⚠️ 尚未生成对阵表，请先审核报名选手后再生成</div>`;

  // 报名列表
  currentPlayerFilter = 'all';
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('filter-all').classList.add('active');
  renderPlayersList(evt);

  // 比赛场次
  const ms = document.getElementById('matches-section');
  if (evt.matches && evt.matches.length > 0) {
    ms.style.display = 'block';
    renderMatchesList(evt);
  } else {
    ms.style.display = 'none';
  }
}

function getEventById(id) {
  return getEvents().find(e => e.id === id) || null;
}

function updateEvent(updatedEvt) {
  const events = getEvents();
  const idx = events.findIndex(e => e.id === updatedEvt.id);
  if (idx >= 0) { events[idx] = updatedEvt; saveEvents(events); }
}

function toggleEventStatus(id) {
  const events = getEvents();
  const evt = events.find(e => e.id === id);
  if (!evt) return;
  evt.status = evt.status === 'active' ? 'ended' : 'active';
  saveEvents(events);
  loadEventManage();
  showToast('赛事状态已更新');
}

function deleteEvent(id) {
  if (!confirm('确认删除这个赛事？此操作不可恢复！')) return;
  const events = getEvents().filter(e => e.id !== id);
  saveEvents(events);
  currentEventId = null;
  document.getElementById('manage-event-select').value = '';
  document.getElementById('event-manage-panel').style.display = 'none';
  refreshManageSelect();
  showToast('赛事已删除');
}

// ───────────────────────────────────────────
// 8. 选手管理
// ───────────────────────────────────────────
function filterPlayers(f) {
  currentPlayerFilter = f;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('filter-' + f).classList.add('active');
  const evt = getEventById(currentEventId);
  if (evt) renderPlayersList(evt);
}

function renderPlayersList(evt) {
  const list = document.getElementById('players-list');
  let players = evt.players || [];
  if (currentPlayerFilter !== 'all') players = players.filter(p => p.status === currentPlayerFilter);

  if (players.length === 0) {
    list.innerHTML = '<div class="empty-tip">暂无选手</div>';
    return;
  }

  list.innerHTML = players.map(p => {
    const badgeMap = { pending:'badge-pending', approved:'badge-approved', rejected:'badge-rejected' };
    const labelMap = { pending:'待审核', approved:'已通过', rejected:'已拒绝' };
    const bc = badgeMap[p.status] || 'badge-pending';
    const bl = labelMap[p.status] || '待审核';
    return `
    <div class="player-item fadeIn" id="pi-${p.id}">
      <div class="player-avatar">${p.name.slice(0,1)}</div>
      <div class="player-info">
        <div class="player-name">${p.name} <span class="player-status-badge ${bc}">${bl}</span></div>
        <div class="player-meta">📞 ${p.phone || '未填'} · 🏪 ${p.store || '未选'} · ${p.seed ? '🎯 ' + p.seed : ''}</div>
        <div class="player-meta">${p.payNote ? '💬 ' + p.payNote : ''}</div>
      </div>
      <div class="player-actions">
        ${p.status !== 'approved' ? `<button class="action-btn action-approve" onclick="approvePlayer('${p.id}')">✓ 通过</button>` : ''}
        ${p.status !== 'rejected' ? `<button class="action-btn action-reject" onclick="rejectPlayer('${p.id}')">✗ 拒绝</button>` : ''}
        <button class="action-btn action-delete" onclick="deletePlayer('${p.id}')">🗑</button>
      </div>
    </div>`;
  }).join('');
}

function approvePlayer(pid) {
  const events = getEvents();
  const evt = events.find(e => e.id === currentEventId);
  if (!evt) return;
  const p = evt.players.find(p => p.id === pid);
  if (p) p.status = 'approved';
  saveEvents(events);
  renderPlayersList(evt);
  showToast('已通过报名');
}

function rejectPlayer(pid) {
  const events = getEvents();
  const evt = events.find(e => e.id === currentEventId);
  if (!evt) return;
  const p = evt.players.find(p => p.id === pid);
  if (p) p.status = 'rejected';
  saveEvents(events);
  renderPlayersList(evt);
  showToast('已拒绝报名');
}

function deletePlayer(pid) {
  if (!confirm('确认删除该选手？')) return;
  const events = getEvents();
  const evt = events.find(e => e.id === currentEventId);
  if (!evt) return;
  evt.players = evt.players.filter(p => p.id !== pid);
  saveEvents(events);
  renderPlayersList(evt);
  showToast('选手已删除');
}

// 弹出手动添加选手
function showAddPlayerModal() {
  if (!currentEventId) { showToast('请先选择赛事'); return; }
  const evt = getEventById(currentEventId);
  const storeSel = document.getElementById('add-player-store');
  storeSel.innerHTML = (evt.stores || ['韩家墅店','青光店','王庆坨店'])
    .map(s => `<option value="${s}">${s}</option>`).join('');
  document.getElementById('add-player-name').value = '';
  document.getElementById('add-player-phone').value = '';
  document.getElementById('add-player-seed').value = '';
  document.getElementById('modal-add-player').style.display = 'flex';
}

function addPlayerManual() {
  const name = document.getElementById('add-player-name').value.trim();
  if (!name) { showToast('请填写选手姓名'); return; }
  const events = getEvents();
  const evt = events.find(e => e.id === currentEventId);
  if (!evt) return;
  evt.players.push({
    id:      uid(),
    name,
    phone:   document.getElementById('add-player-phone').value.trim(),
    seed:    document.getElementById('add-player-seed').value.trim(),
    store:   document.getElementById('add-player-store').value,
    status:  'approved',
    addedAt: Date.now(),
    source:  'manual'
  });
  saveEvents(events);
  closeModal('modal-add-player');
  renderPlayersList(evt);
  showToast('选手已添加');
}

// ───────────────────────────────────────────
// 9. 报名二维码
// ───────────────────────────────────────────
function showRegisterQR() {
  if (!currentEventId) { showToast('请先选择赛事'); return; }
  const area = document.getElementById('register-qr-area');
  area.style.display = 'block';
  const qcDiv = document.getElementById('register-qrcode');
  qcDiv.innerHTML = '';

  const evt = getEventById(currentEventId);
  if (!evt) { showToast('赛事数据异常'); return; }

  const base = 'https://billiards-tournament.pages.dev';

   
  // 只放核心数据，收款码等大数据不放（避免URL太长）
  // 压缩：用短key
  // 二维码只放赛事ID，数据从API获取
  const url = base.replace(/\/$/, '') + '/register.html?eid=' + currentEventId;

  try {
    new QRCode(qcDiv, {
      text: url,
      width: 200, height: 200,
      colorDark: '#00ff88',
      colorLight: '#050f0a',
      correctLevel: QRCode.CorrectLevel.M
    });
    
    // 显示URL提示
    const urlTip = area.querySelector('.qr-tip');
    if (urlTip) urlTip.textContent = '请让选手扫码报名';
    
    // 保存完整数据到localStorage，供同设备查看
    localStorage.setItem('daking_event_' + evt.id, JSON.stringify({
      wechatQR: evt.wechatQR,
      alipayQR: evt.alipayQR
    }));
    
  } catch(e) {
    qcDiv.innerHTML = `<div style="font-size:12px;color:var(--text-sub);word-break:break-all;padding:10px">二维码生成失败，请刷新重试</div>`;
  }
}

function copyBracketLink() {
  if (!currentEventId) { showToast('请先选择赛事'); return; }
  const settings = getSettings();
  const base = settings.siteUrl || (window.location.origin + window.location.pathname.replace('index.html',''));
  const url = base.replace(/\/$/, '') + '/bracket.html?eid=' + currentEventId;
  copyText(url);
}

function openBracketView() {
  if (!currentEventId) { showToast('请先选择赛事'); return; }
  window.open('bracket.html?eid=' + currentEventId, '_blank');
}

function copyText(text) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => showToast('链接已复制'));
  } else {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta);
    ta.select(); document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('链接已复制');
  }
}

// ───────────────────────────────────────────
// 10. 对阵表生成（单败/双败淘汰）
// ───────────────────────────────────────────
function generateBracket() {
  if (!currentEventId) return;
  const events = getEvents();
  const evt = events.find(e => e.id === currentEventId);
  if (!evt) return;

  const approved = (evt.players || []).filter(p => p.status === 'approved');
  if (approved.length < 2) { showToast('至少需要2名已通过的选手'); return; }

  if (evt.bracket && !confirm('已有对阵表，重新生成会清除现有比赛数据，确认吗？')) return;

  // 随机打乱选手顺序
  const shuffled = [...approved].sort(() => Math.random() - 0.5);

  if (evt.bracketType === 'double') {
    evt.bracket = generateDoubleBracket(shuffled);
  } else {
    evt.bracket = generateSingleBracket(shuffled);
  }

  // 生成比赛场次列表
  evt.matches = flattenBracketMatches(evt.bracket);

  saveEvents(events);
  loadEventManage();
  showToast('对阵表生成成功！');
}

// ── 单败淘汰 ──
function generateSingleBracket(players) {
  const n = players.length;
  // 向上取到2的幂
  let size = 1;
  while (size < n) size *= 2;

  const slots = [...players.map(p => ({ pid: p.id, name: p.name }))];
  while (slots.length < size) slots.push(null); // 补空（轮空）

  const rounds = [];
  let current = slots;

  while (current.length > 1) {
    const round = [];
    for (let i = 0; i < current.length; i += 2) {
      const p1 = current[i], p2 = current[i + 1];
      const mid = uid();
      const match = {
        id: mid, p1, p2,
        score1: null, score2: null,
        completed: false, winner: null,
        handicap1: 0, handicap2: 0
      };
      // 轮空自动判定
      if (!p2) {
        match.score1 = 0; match.score2 = 0;
        match.completed = true; match.winner = p1;
        match.isBye = true;
      }
      if (!p1) {
        match.score1 = 0; match.score2 = 0;
        match.completed = true; match.winner = p2;
        match.isBye = true;
      }
      round.push(match);
    }
    rounds.push(round);
    // 下一轮从胜者中产生
    current = round.map(m => m.winner);
  }

  return { type: 'single', rounds, champion: rounds[rounds.length - 1]?.[0]?.winner || null };
}

// ── 双败淘汰 ──
function generateDoubleBracket(players) {
  // 先生成上半区（胜者组），输家进败者组
  const n = players.length;
  let size = 1;
  while (size < n) size *= 2;

  const slots = [...players.map(p => ({ pid: p.id, name: p.name }))];
  while (slots.length < size) slots.push(null);

  const winnerRounds = [];
  const loserRounds  = [];
  let wCurrent = slots;
  let losers    = [];

  // 胜者组
  while (wCurrent.filter(Boolean).length > 1) {
    const round = []; const roundLosers = [];
    for (let i = 0; i < wCurrent.length; i += 2) {
      const p1 = wCurrent[i], p2 = wCurrent[i + 1];
      const match = {
        id: uid(), p1, p2,
        score1: null, score2: null,
        completed: false, winner: null, loser: null,
        handicap1: 0, handicap2: 0, group: 'winner'
      };
      if (!p2) { match.completed = true; match.winner = p1; match.isBye = true; }
      if (!p1) { match.completed = true; match.winner = p2; match.isBye = true; }
      round.push(match);
      if (!match.isBye) roundLosers.push(null); // 占位，比赛结束后填入
    }
    winnerRounds.push(round);
    losers.push(roundLosers);
    wCurrent = round.map(m => m.winner);
  }

  // 败者组（简化：只生成结构，实际对阵在比赛进行中动态填入）
  // 这里生成基础败者组轮次
  let lSize = Math.floor(size / 2);
  let lSlots = new Array(lSize).fill(null).map(() => ({ pid: null, name: 'TBD' }));
  while (lSlots.filter(s => s && s.pid).length > 1 || lSlots.length > 1) {
    if (lSlots.length <= 1) break;
    const round = [];
    for (let i = 0; i < lSlots.length; i += 2) {
      if (i + 1 >= lSlots.length) break;
      round.push({
        id: uid(), p1: lSlots[i], p2: lSlots[i+1],
        score1: null, score2: null,
        completed: false, winner: null,
        handicap1: 0, handicap2: 0, group: 'loser'
      });
    }
    if (round.length === 0) break;
    loserRounds.push(round);
    lSlots = round.map(() => ({ pid: null, name: 'TBD' }));
    if (lSlots.length <= 1) break;
  }

  // 总决赛
  const final = [{
    id: uid(), p1: { pid: null, name: 'W胜者组冠军' }, p2: { pid: null, name: 'L败者组冠军' },
    score1: null, score2: null, completed: false, winner: null,
    handicap1: 0, handicap2: 0, group: 'final'
  }];

  return {
    type: 'double',
    winnerRounds,
    loserRounds,
    finalRound: final,
    champion: null
  };
}

// 扁平化所有比赛场次
function flattenBracketMatches(bracket) {
  const matches = [];
  if (bracket.type === 'single') {
    bracket.rounds.forEach((round, ri) => {
      round.forEach((m, mi) => {
        matches.push({ ...m, roundIndex: ri, matchIndex: mi, group: 'winner' });
      });
    });
  } else {
    (bracket.winnerRounds || []).forEach((round, ri) => {
      round.forEach((m, mi) => matches.push({ ...m, roundIndex: ri, matchIndex: mi }));
    });
    (bracket.loserRounds || []).forEach((round, ri) => {
      round.forEach((m, mi) => matches.push({ ...m, roundIndex: ri, matchIndex: mi }));
    });
    (bracket.finalRound || []).forEach((m, mi) => matches.push({ ...m, roundIndex: 0, matchIndex: mi }));
  }
  return matches.filter(m => !m.isBye);
}

// ───────────────────────────────────────────
// 11. 比赛场次列表渲染
// ───────────────────────────────────────────
function renderMatchesList(evt) {
  const list = document.getElementById('matches-list');
  const matches = (evt.matches || []).filter(m => !m.isBye);

  if (matches.length === 0) {
    list.innerHTML = '<div class="empty-tip">暂无比赛场次</div>';
    return;
  }

  const groupNames = { winner:'胜者组', loser:'败者组', final:'总决赛' };
  const roundNames = ['第一轮','第二轮','第三轮','第四轮','半决赛','决赛'];

  list.innerHTML = matches.map((m, idx) => {
    const rn = roundNames[m.roundIndex] || `第${m.roundIndex+1}轮`;
    const gn = groupNames[m.group] || '';
    const p1n = m.p1 ? m.p1.name : '待定';
    const p2n = m.p2 ? m.p2.name : '待定';
    const s1 = m.score1 !== null ? m.score1 : '-';
    const s2 = m.score2 !== null ? m.score2 : '-';
    return `
    <div class="match-item ${m.completed ? 'completed' : ''} fadeIn" onclick="openScoreModal('${m.id}')">
      <div class="match-header">${gn} ${rn} · 场次 ${idx+1} ${m.completed ? '✅' : '⏳'}</div>
      <div class="match-players">
        <div class="match-player">
          <div class="match-player-name ${m.winner && m.winner.pid === (m.p1 && m.p1.pid) ? 'match-winner-text' : ''}">${p1n}</div>
          ${m.handicap1 > 0 ? `<div style="font-size:11px;color:var(--text-muted)">让${m.handicap1}球</div>` : ''}
        </div>
        <div class="match-score-area">
          <span class="match-score" style="${m.winner && m.winner.pid === (m.p1 && m.p1.pid) ? 'color:var(--green)' : ''}">${s1}</span>
          <span class="match-vs">:</span>
          <span class="match-score" style="${m.winner && m.winner.pid === (m.p2 && m.p2.pid) ? 'color:var(--green)' : ''}">${s2}</span>
        </div>
        <div class="match-player">
          <div class="match-player-name ${m.winner && m.winner.pid === (m.p2 && m.p2.pid) ? 'match-winner-text' : ''}">${p2n}</div>
          ${m.handicap2 > 0 ? `<div style="font-size:11px;color:var(--text-muted)">让${m.handicap2}球</div>` : ''}
        </div>
      </div>
    </div>`;
  }).join('');
}

// ───────────────────────────────────────────
// 12. 比分录入弹窗
// ───────────────────────────────────────────
function openScoreModal(matchId) {
  const evt = getEventById(currentEventId);
  if (!evt) return;
  const match = (evt.matches || []).find(m => m.id === matchId);
  if (!match) return;
  scoreEditMatchId = matchId;

  const p1n = match.p1 ? match.p1.name : '待定';
  const p2n = match.p2 ? match.p2.name : '待定';

  document.getElementById('score-p1-name').textContent = p1n;
  document.getElementById('score-p2-name').textContent = p2n;
  document.getElementById('handicap-p1-name').textContent = p1n;
  document.getElementById('handicap-p2-name').textContent = p2n;
  document.getElementById('score-p1').value = match.score1 !== null ? match.score1 : 0;
  document.getElementById('score-p2').value = match.score2 !== null ? match.score2 : 0;
  document.getElementById('handicap-p1').value = match.handicap1 || 0;
  document.getElementById('handicap-p2').value = match.handicap2 || 0;

  const groupNames = { winner:'胜者组', loser:'败者组', final:'总决赛' };
  const roundNames = ['第一轮','第二轮','第三轮','第四轮','半决赛','决赛'];
  document.getElementById('score-match-info').textContent =
    `${groupNames[match.group]||''} ${roundNames[match.roundIndex]||''}  ${p1n} vs ${p2n}`;

  document.getElementById('modal-score').style.display = 'flex';
}

function saveScore() {
  const s1 = parseInt(document.getElementById('score-p1').value) || 0;
  const s2 = parseInt(document.getElementById('score-p2').value) || 0;
  const h1 = parseInt(document.getElementById('handicap-p1').value) || 0;
  const h2 = parseInt(document.getElementById('handicap-p2').value) || 0;

  if (s1 === s2) { showToast('比分不能相同，必须有胜负'); return; }

  const events = getEvents();
  const evt = events.find(e => e.id === currentEventId);
  if (!evt) return;

  const match = (evt.matches || []).find(m => m.id === scoreEditMatchId);
  if (!match) return;

  match.score1 = s1;
  match.score2 = s2;
  match.handicap1 = h1;
  match.handicap2 = h2;
  match.completed = true;
  match.winner = s1 > s2 ? match.p1 : match.p2;
  match.loser  = s1 > s2 ? match.p2 : match.p1;

  // 同步更新bracket中的比赛结果
  syncBracketResult(evt, match);

  saveEvents(events);
  closeModal('modal-score');
  renderMatchesList(evt);
  showToast('比分已保存');
}

// 将比赛结果同步到bracket结构，推进下一轮
function syncBracketResult(evt, updatedMatch) {
  if (!evt.bracket) return;
  if (evt.bracket.type === 'single') {
    // 找到这场在哪个round，把胜者填入下一轮
    const rounds = evt.bracket.rounds;
    for (let ri = 0; ri < rounds.length - 1; ri++) {
      const idx = rounds[ri].findIndex(m => m.id === updatedMatch.id);
      if (idx >= 0) {
        rounds[ri][idx] = { ...rounds[ri][idx], ...updatedMatch };
        // 填入下一轮对应位置
        const nextMatchIdx = Math.floor(idx / 2);
        const isP1 = idx % 2 === 0;
        if (rounds[ri + 1] && rounds[ri + 1][nextMatchIdx]) {
          if (isP1) rounds[ri + 1][nextMatchIdx].p1 = updatedMatch.winner;
          else      rounds[ri + 1][nextMatchIdx].p2 = updatedMatch.winner;
          // 同步matches列表中对应下一轮比赛
          const nextId = rounds[ri + 1][nextMatchIdx].id;
          const nm = evt.matches.find(m => m.id === nextId);
          if (nm) {
            if (isP1) nm.p1 = updatedMatch.winner;
            else      nm.p2 = updatedMatch.winner;
          }
        }
        // 更新当前round中这条记录
        const cm = evt.matches.find(m => m.id === updatedMatch.id);
        if (cm) Object.assign(cm, updatedMatch);
        // 最后一轮有冠军
        if (ri === rounds.length - 2) {
          evt.bracket.champion = updatedMatch.winner;
        }
        return;
      }
    }
    // 最后一轮（决赛）
    const lastRound = rounds[rounds.length - 1];
    const idx = lastRound ? lastRound.findIndex(m => m.id === updatedMatch.id) : -1;
    if (idx >= 0) {
      lastRound[idx] = { ...lastRound[idx], ...updatedMatch };
      evt.bracket.champion = updatedMatch.winner;
      const cm = evt.matches.find(m => m.id === updatedMatch.id);
      if (cm) Object.assign(cm, updatedMatch);
    }
  }
}

// ───────────────────────────────────────────
// 13. 赛事详情页
// ───────────────────────────────────────────
function openEventDetail(id) {
  const evt = getEventById(id);
  if (!evt) return;

  document.getElementById('detail-event-name').textContent = evt.name;

  const approved = (evt.players || []).filter(p => p.status === 'approved');
  const totalM   = (evt.matches || []).length;
  const doneM    = (evt.matches || []).filter(m => m.completed).length;

  // 计算选手战绩
  const stats = {};
  approved.forEach(p => { stats[p.id] = { name: p.name, wins: 0, losses: 0 }; });
  (evt.matches || []).filter(m => m.completed && !m.isBye).forEach(m => {
    if (m.winner && stats[m.winner.pid]) stats[m.winner.pid].wins++;
    if (m.loser  && stats[m.loser.pid])  stats[m.loser.pid].losses++;
  });
  const statList = Object.values(stats).sort((a, b) => b.wins - a.wins || a.losses - b.losses);

  const champion = evt.bracket && evt.bracket.champion;

  document.getElementById('event-detail-content').innerHTML = `
  <div class="event-detail-header">
    <div class="event-detail-name">${evt.name}</div>
    <div class="event-detail-meta">
      <span>🎱 ${typeLabel(evt.type, evt.customType)}</span>
      <span>📅 ${evt.date || '待定'}</span>
      <span>📍 ${evt.location || '待定'}</span>
      <span>💰 报名费 ${evt.fee || 0}元</span>
      <span>${evt.bracketType === 'double' ? '双败淘汰' : '单败淘汰'}</span>
    </div>
    ${champion ? `<div style="background:var(--green-dim);border:1px solid var(--green-border);border-radius:8px;padding:10px;margin-bottom:12px;font-size:14px;">🏆 冠军：<strong style="color:var(--green)">${champion.name}</strong></div>` : ''}
    <div class="event-detail-stats">
      <div class="detail-stat"><div class="detail-stat-num">${approved.length}</div><div class="detail-stat-label">报名选手</div></div>
      <div class="detail-stat"><div class="detail-stat-num">${totalM}</div><div class="detail-stat-label">总场次</div></div>
      <div class="detail-stat"><div class="detail-stat-num">${doneM}</div><div class="detail-stat-label">已完赛</div></div>
      <div class="detail-stat"><div class="detail-stat-num">${totalM - doneM}</div><div class="detail-stat-label">待完赛</div></div>
    </div>
    <div class="btn-row">
      <button class="btn btn-primary" onclick="window.open('bracket.html?eid=${evt.id}','_blank')">👁 查看对阵表</button>
      <button class="btn btn-outline" onclick="showPage('admin');switchAdminTab('manage');document.getElementById('manage-event-select').value='${evt.id}';loadEventManage()">⚙️ 管理赛事</button>
    </div>
    ${evt.rules ? `<div style="font-size:13px;color:var(--text-sub);margin-top:10px">📋 ${evt.rules}</div>` : ''}
  </div>

  <div class="manage-section">
    <h4>📊 选手战绩</h4>
    <div class="advancement-list">
      ${statList.length === 0 ? '<div class="empty-tip">暂无比赛数据</div>' :
        statList.map((s, i) => `
        <div class="advancement-item">
          <span class="advancement-rank">${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i+1)+'.'}</span>
          <span class="advancement-name">${s.name}</span>
          <span class="advancement-stats">胜 ${s.wins} 负 ${s.losses}</span>
        </div>`).join('')
      }
    </div>
  </div>`;

  showPage('event-detail');
}

// ───────────────────────────────────────────
// 14. 选手管理面板
// ───────────────────────────────────────────
function loadPlayersPanel() {
  const id = document.getElementById('players-event-select').value;
  const panel = document.getElementById('players-panel');
  if (!id) { panel.innerHTML = ''; return; }
  const evt = getEventById(id);
  if (!evt) return;

  const approved = (evt.players || []).filter(p => p.status === 'approved');
  panel.innerHTML = `
  <div class="manage-section">
    <h4>已通过选手（${approved.length}人）</h4>
    <div style="display:flex;flex-direction:column;gap:6px">
    ${approved.length === 0 ? '<div class="empty-tip">无</div>' :
      approved.map((p, i) => `
      <div class="player-item">
        <div class="player-avatar">${i+1}</div>
        <div class="player-info">
          <div class="player-name">${p.name}</div>
          <div class="player-meta">📞 ${p.phone || '未填'} · 🏪 ${p.store || ''} · ${p.seed || ''}</div>
        </div>
        <div class="player-actions">
          <button class="action-btn action-delete" onclick="deletePlayerFromPanel('${id}','${p.id}')">🗑</button>
        </div>
      </div>`).join('')}
    </div>
  </div>`;
}

function deletePlayerFromPanel(eid, pid) {
  if (!confirm('确认删除该选手？')) return;
  const events = getEvents();
  const evt = events.find(e => e.id === eid);
  if (!evt) return;
  evt.players = evt.players.filter(p => p.id !== pid);
  saveEvents(events);
  loadPlayersPanel();
  showToast('已删除');
}

// ───────────────────────────────────────────
// 15. 系统设置
// ───────────────────────────────────────────
function loadSettingsUI() {
  const s = getSettings();
  document.getElementById('site-url').value = s.siteUrl || '';
  document.getElementById('admin-pwd').value = s.adminPwd || '';
}

function saveSettings() {
  const s = getSettings();
  s.siteUrl  = document.getElementById('site-url').value.trim();
  s.adminPwd = document.getElementById('admin-pwd').value.trim();
  DB.set('settings', s);
  showToast('设置已保存');
}

function clearAllData() {
  if (!confirm('⚠️ 确认清除所有数据？此操作不可恢复！')) return;
  if (!confirm('再次确认：将删除所有赛事、选手、比赛数据！')) return;
  localStorage.clear();
  location.reload();
}

function exportData() {
  const data = {
    events:   getEvents(),
    settings: getSettings(),
    exportAt: new Date().toISOString()
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'daking_billiards_' + new Date().toLocaleDateString('zh') + '.json';
  a.click();
  showToast('数据已导出');
}

function importData() {
  document.getElementById('import-file').click();
}

function doImport(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (data.events) saveEvents(data.events);
      if (data.settings) DB.set('settings', data.settings);
      showToast('数据导入成功');
      renderHome();
      refreshAdminSelects();
    } catch { showToast('导入失败：文件格式错误'); }
  };
  reader.readAsText(file);
}

// ───────────────────────────────────────────
// 16. 工具函数
// ───────────────────────────────────────────
function closeModal(id) {
  document.getElementById(id).style.display = 'none';
}

function showToast(msg, dur = 2500) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.display = 'block';
  setTimeout(() => { t.style.display = 'none'; }, dur);
}

// ───────────────────────────────────────────
// 17. 初始化
// ───────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  console.log('App initialized');
  // 设置今天日期为默认
  const today = new Date().toISOString().split('T')[0];
  const dateInput = document.getElementById('event-date');
  if (dateInput) dateInput.value = today;

  try {
    // 优先从后端加载数据
    await getEventsAPI();
    renderHome();
    refreshAdminSelects();
    console.log('App ready');
  } catch (e) {
    console.error('Init error:', e);
  }
});
