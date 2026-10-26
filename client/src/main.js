// Điểm vào của client: nối giao diện, mạng, điều khiển, âm thanh và vòng lặp game.
import * as THREE from 'three';
import { DEFAULT_SERVER, SEND_HZ, CONNECT_TIMEOUT_MS, TEAM_NAMES, PHYSICS_STEP } from './config.js';
import { World, MAP_DATA } from './game/world.js';
import { Controller, EYE, makeBoxes } from './game/controller.js';
import { FixedStepper } from './game/loop.js';
import { Net } from './multiplayer/net.js';
import { AudioEngine } from './audio/audio.js';
import { WEAPONS, WEAPON_ORDER, SLOT_TO_ID, applyServerWeapons, spreadOf } from './weapons/weapons.js';
import { ViewModel } from './weapons/viewmodel.js';
import { Punch, RECOIL } from './weapons/recoil.js';
import { FrameStats } from './ui/stats.js';
import { ui } from './ui/ui.js';

// ---------------------------------------------------------------
// Lưu cài đặt cục bộ
// ---------------------------------------------------------------
const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem('hachihi.' + k);
      return v == null ? d : v;
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem('hachihi.' + k, v);
    } catch { /* bỏ qua */ }
  },
};

// ---------------------------------------------------------------
// Đối tượng chính
// ---------------------------------------------------------------
const world = new World(document.getElementById('game'));
const controller = new Controller(makeBoxes(MAP_DATA));
const vm = new ViewModel();
const net = new Net();
const audio = new AudioEngine();
const punch = new Punch(); // giật tâm ngắm
const stepper = new FixedStepper(PHYSICS_STEP);
const frameStats = new FrameStats(300);
world.onResize = (aspect) => vm.resize(aspect);
vm.resize(window.innerWidth / window.innerHeight);
if (world.envTex) vm.setEnv(world.envTex);
const _mz = new THREE.Vector3();
const _ej = new THREE.Vector3();

const blankSelf = () => ({
  hp: 100,
  alive: false,
  weapon: 'rifle',
  reloading: false,
  ammo: { rifle: [30, 90], pistol: [12, 48], shotgun: [6, 24] },
});
const blankRound = () => ({ phase: 'lobby', round: 0, scoreA: 0, scoreB: 0, endAt: 0, winner: null, matchWinner: null, toWin: 8 });

const S = {
  screen: 'menu', // menu | lobby | game
  me: { id: 0, team: null, token: '', pin: '', host: false },
  serverUrl: '',
  room: null,
  roster: new Map(),
  round: blankRound(),
  self: blankSelf(),
  locked: false,
  mouseDown: false,
  fireLatched: false,
  emptyClicked: false,
  nextFireAt: 0,
  lastSend: 0,
  reconnecting: false,
  specIdx: 0,
  camSet: false,
  menuT: 0,
  stepT: 0,
  sens: 1,
  spray: 0, // ước lượng số phát liên tiếp để vẽ tâm ngắm nở ra (server mới là bên quyết định tản đạn thật)
  lastShotMs: 0,
  quality: 'auto',
  alpha: 0, // hệ số nội suy hình ảnh giữa 2 bước vật lý
};
window.__hachihi = { S, net, controller, world }; // tiện gỡ lỗi trong DevTools (F12)

const r3 = (v) => Math.round(v * 1000) / 1000;
// Góc gửi lên server = góc nhìn + giật tâm ngắm, nên đạn bay đúng chỗ tâm ngắm đang chỉ.
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const pose = () => ({
  x: r3(controller.x), y: r3(controller.y), z: r3(controller.z),
  yaw: r3(controller.yaw + punch.yaw), pitch: r3(clamp(controller.pitch + punch.pitch, -1.55, 1.55)),
});

// ---------------------------------------------------------------
// Khởi tạo menu
// ---------------------------------------------------------------
ui.el.nick.value = store.get('nick', '');
// Hai kiểu máy chủ, mỗi kiểu nhớ địa chỉ riêng: Render (online) hoặc 1 IP mạng nội bộ.
const MODES = {
  render: { label: 'Địa chỉ server Render', ph: 'wss://ten-server.onrender.com', def: DEFAULT_SERVER, hint: 'Chủ phòng và người chơi dùng chung địa chỉ này (chơi qua Internet).' },
  lan: { label: 'IP máy làm server', ph: '192.168.1.10', def: '', hint: 'Nhập IP của máy đang chạy server (cổng 8080 tự thêm). Mọi người phải cùng mạng Wi-Fi/LAN.' },
};
S.mode = store.get('mode', 'render') === 'lan' ? 'lan' : 'render';
function applyMode(save) {
  const m = MODES[S.mode];
  ui.el.serverMode.value = S.mode;
  ui.el.serverLabel.textContent = m.label;
  ui.el.serverUrl.placeholder = m.ph;
  ui.el.serverHint.textContent = m.hint;
  ui.el.serverUrl.value = store.get('server_' + S.mode, m.def);
  if (save) store.set('mode', S.mode);
}
applyMode(false);
ui.el.serverMode.addEventListener('change', () => {
  store.set('server_' + S.mode, ui.el.serverUrl.value.trim());
  S.mode = ui.el.serverMode.value === 'lan' ? 'lan' : 'render';
  applyMode(true);
});
ui.el.sens.value = store.get('sens', '1');
S.sens = parseFloat(ui.el.sens.value) || 1;
document.getElementById('sensVal').textContent = S.sens.toFixed(1);
S.quality = store.get('quality', 'auto');
if (!['auto', 'low', 'medium', 'high'].includes(S.quality)) S.quality = 'auto';
ui.el.quality.value = S.quality;
applyQuality();
ui.showScreen('menu');

function applyQuality() {
  // "Tự động" bắt đầu ở mức Vừa rồi tự tăng/giảm độ phân giải theo FPS thực tế.
  world.setQuality(S.quality === 'auto' ? 'medium' : S.quality);
  frameStats.reset();
}
ui.el.quality.addEventListener('change', () => {
  S.quality = ui.el.quality.value;
  store.set('quality', S.quality);
  applyQuality();
});

ui.el.sens.addEventListener('input', () => {
  S.sens = parseFloat(ui.el.sens.value) || 1;
  document.getElementById('sensVal').textContent = S.sens.toFixed(1);
  store.set('sens', String(S.sens));
});

function normalizeUrl(raw) {
  let u = (raw || '').trim();
  if (S.mode === 'lan') {
    if (!u) u = 'localhost';
    u = u.replace(/^(wss?|https?):\/\//i, '').replace(/\/+$/, '');
    if (!/:\d+$/.test(u)) u += ':8080';
    return 'ws://' + u;
  }
  if (!u) return DEFAULT_SERVER;
  u = u.replace(/^https:\/\//i, 'wss://').replace(/^http:\/\//i, 'ws://');
  if (!/^wss?:\/\//i.test(u)) {
    const local = /^(localhost|127\.|192\.168\.|10\.)/i.test(u);
    u = (local ? 'ws://' : 'wss://') + u;
  }
  return u.replace(/\/+$/, '');
}

async function connectThen(message) {
  const nick = ui.el.nick.value.trim();
  if (nick.length < 2) {
    ui.setMenuStatus('Nickname cần ít nhất 2 ký tự.', 'err');
    return;
  }
  if (message.t === 'join' && !/^\d{4}$/.test(ui.el.pin.value.trim())) {
    ui.setMenuStatus('Mã PIN gồm đúng 4 chữ số.', 'err');
    return;
  }
  const url = normalizeUrl(ui.el.serverUrl.value);
  ui.el.serverUrl.value = url;
  store.set('mode', S.mode);
  store.set('server_' + S.mode, url);
  store.set('nick', nick);
  store.set('server', url);
  S.serverUrl = url;
  audio.init();

  ui.setBusy(true);
  ui.setMenuStatus('Đang kết nối tới server...');
  if (!net.open) {
    try {
      await net.connect(url, {
        totalMs: CONNECT_TIMEOUT_MS,
        onTick: ({ elapsed }) => {
          if (elapsed < 4000) return;
          ui.setMenuStatus(
            `Server miễn phí có thể đang ngủ, đang đánh thức... (${Math.round(elapsed / 1000)}s, thường mất 30–60s lần đầu)`
          );
        },
      });
    } catch (e) {
      ui.setBusy(false);
      if (e && e.message === 'cancelled') ui.setMenuStatus('Đã huỷ kết nối.');
      else if (e && e.name === 'SyntaxError') ui.setMenuStatus('Địa chỉ server không hợp lệ.', 'err');
      else ui.setMenuStatus('Không kết nối được server. Kiểm tra địa chỉ và thử lại.', 'err');
      return;
    }
  }
  ui.setMenuStatus('Đã kết nối, đang vào phòng...');
  net.send({ ...message, name: nick });
}

ui.el.btnCreate.addEventListener('click', () => connectThen({ t: 'create' }));
ui.el.btnJoin.addEventListener('click', () => connectThen({ t: 'join', pin: ui.el.pin.value.trim() }));
ui.el.pin.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') ui.el.btnJoin.click();
});
ui.el.pin.addEventListener('input', () => {
  ui.el.pin.value = ui.el.pin.value.replace(/\D/g, '').slice(0, 4);
});
ui.el.btnCancel.addEventListener('click', () => {
  net.cancel();
  ui.setBusy(false);
  ui.setMenuStatus('Đã huỷ kết nối.');
});

// Phòng chờ
ui.el.joinA.addEventListener('click', () => net.send({ t: 'team', team: 'A' }));
ui.el.joinB.addEventListener('click', () => net.send({ t: 'team', team: 'B' }));
ui.el.btnStart.addEventListener('click', () => net.send({ t: 'start' }));
ui.el.btnLeave.addEventListener('click', () => {
  net.send({ t: 'leave' });
  backToMenu('');
});

// ---------------------------------------------------------------
// Chuyển màn hình
// ---------------------------------------------------------------
function enterGame() {
  if (S.screen === 'game') return;
  S.screen = 'game';
  ui.showScreen('game');
  ui.showClickPlay(!S.locked);
  controller.clearKeys();
  S.mouseDown = false;
  world.clearRemotes();
  world.clearEffects();
  ui.setAmmo(S.self);
  ui.setHp(S.self.hp);
}

function leaveGame() {
  if (S.screen !== 'game') return;
  S.screen = 'lobby';
  if (document.pointerLockElement) document.exitPointerLock();
  S.locked = false;
  S.mouseDown = false;
  S.self = blankSelf();
  S.round = blankRound();
  controller.clearKeys();
  world.clearRemotes();
  world.clearEffects();
  ui.hideBanner();
  ui.setSpectate('');
  ui.showScreen('lobby');
  ui.renderLobby(S.room, S.me.id, net.rtt);
  ui.setLobbyMsg('');
}

function backToMenu(msg, kind) {
  net.close();
  S.me = { id: 0, team: null, token: '', pin: '', host: false };
  S.room = null;
  S.roster = new Map();
  S.reconnecting = false;
  S.round = blankRound();
  S.self = blankSelf();
  S.camSet = false;
  if (document.pointerLockElement) document.exitPointerLock();
  S.locked = false;
  S.mouseDown = false;
  controller.clearKeys();
  world.clearRemotes();
  world.clearEffects();
  ui.hideBanner();
  ui.setSpectate('');
  S.screen = 'menu';
  ui.showScreen('menu');
  ui.setBusy(false);
  ui.setMenuStatus(msg || '', kind || '');
}

// ---------------------------------------------------------------
// Tin nhắn từ server
// ---------------------------------------------------------------
net.on('joined', (m) => {
  applyServerWeapons(m.weapons);
  const wasReconnect = S.reconnecting;
  S.reconnecting = false;
  S.me.id = m.id;
  S.me.token = m.token;
  S.me.pin = m.pin;
  ui.setBusy(false);
  ui.setMenuStatus('');
  if (S.screen === 'menu') {
    S.screen = 'lobby';
    ui.showScreen('lobby');
  }
  if (wasReconnect) {
    ui.hideBanner();
    ui.setLobbyMsg('Đã kết nối lại.', 'ok');
  } else {
    ui.setLobbyMsg('');
  }
});

net.on('room', (m) => {
  S.room = m;
  const roster = new Map();
  for (const p of m.players) roster.set(p.id, p);
  S.roster = roster;
  world.setRoster(roster);
  const me = roster.get(S.me.id);
  if (me) S.me.team = me.team;
  S.me.host = m.host === S.me.id;

  if (m.phase === 'lobby') {
    if (S.screen === 'game') leaveGame();
    if (S.screen === 'lobby') ui.renderLobby(m, S.me.id, net.rtt);
    return;
  }
  if (S.screen === 'lobby') enterGame();
  let a = 0;
  let b = 0;
  for (const p of m.players) if (p.alive) (p.team === 'A' ? a++ : b++);
  ui.setAlive(a, b);
  ui.setScore(m.scoreA, m.scoreB);
  if (!ui.el.scoreboard.classList.contains('hidden')) ui.renderScoreboard(m, S.me.id);
});

net.on('spawn', (m) => {
  enterGame();
  controller.setPosition(m.x, m.y, m.z, m.yaw);
  controller.pitch = 0;
  punch.reset();
  S.spray = 0;
  stepper.reset();
  S.camSet = true;
  S.specIdx = 0;
});

net.on('self', (m) => {
  const prev = S.self;
  S.self = { hp: m.hp, alive: !!m.alive, weapon: m.weapon, reloading: !!m.reloading, ammo: m.ammo };
  if (S.self.weapon !== vm.current) vm.setWeapon(S.self.weapon);
  if (S.self.reloading && !prev.reloading && WEAPONS[m.weapon]) audio.reload(WEAPONS[m.weapon].reloadMs);
  vm.setReloading(S.self.reloading);
  ui.setHp(S.self.hp);
  ui.setAmmo(S.self);
  if (prev.alive && !S.self.alive) {
    S.mouseDown = false;
    punch.reset();
    ui.banner('BẠN ĐÃ BỊ HẠ', '', '', 1800);
  }
});

net.on('round', (m) => {
  S.round = {
    phase: m.phase, round: m.round, scoreA: m.scoreA, scoreB: m.scoreB,
    endAt: performance.now() + m.msLeft, winner: m.winner, matchWinner: m.matchWinner, toWin: m.toWin,
  };
  if (m.phase === 'lobby') return;
  enterGame();
  ui.setScore(m.scoreA, m.scoreB);
  ui.setRoundLabel(`VÒNG ${m.round} · THẮNG ${m.toWin}`);
  const cls = (t) => (t === 'A' ? 'red' : t === 'B' ? 'blue' : '');
  switch (m.phase) {
    case 'freeze':
      ui.banner(`VÒNG ${m.round}`, 'Chuẩn bị...', '', Math.max(1500, m.msLeft));
      audio.beep(660, 0.1);
      break;
    case 'live':
      ui.banner('BẮT ĐẦU!', '', '', 1200);
      audio.beep(990, 0.18);
      break;
    case 'roundEnd':
      ui.banner(m.winner ? `${TEAM_NAMES[m.winner]} THẮNG VÒNG` : 'HOÀ VÒNG NÀY', '', cls(m.winner), Math.max(2000, m.msLeft));
      break;
    case 'matchEnd':
      ui.banner(`${TEAM_NAMES[m.matchWinner] || ''} THẮNG TRẬN`, 'Quay về phòng chờ sau giây lát...', cls(m.matchWinner), 0);
      break;
    default:
      break;
  }
});

net.on('snap', (m) => {
  if (S.screen === 'game') world.applySnapshot(m.p, m.ts, performance.now(), S.me.id, S.me.team);
});

net.on('shot', (m) => {
  if (S.screen !== 'game') return;
  const cam = world.camera;
  if (m.id === S.me.id) {
    // Vệt đạn của mình: bắt đầu từ nòng súng cầm trên tay.
    const y = controller.yaw;
    const p = controller.pitch;
    const cp = Math.cos(p);
    const fx = -Math.sin(y) * cp;
    const fy = Math.sin(p);
    const fz = -Math.cos(y) * cp;
    const rx = Math.cos(y);
    const rz = -Math.sin(y);
    const from = [
      controller.x + fx * 0.7 + rx * 0.16,
      controller.y + EYE + fy * 0.7 - 0.14,
      controller.z + fz * 0.7 + rz * 0.16,
    ];
    world.addTracer(from, m.to, 0xffd98a, m.h);
  } else {
    world.addTracer([m.from[0], m.from[1] - 0.25, m.from[2]], m.to, 0xffd98a, m.h);
    world.muzzleFlash([m.from[0], m.from[1] - 0.2, m.from[2]], 0.5);
    audio.shotAt(m.w, m.from[0] - cam.position.x, m.from[2] - cam.position.z, cam.rotation.y);
  }
});

net.on('hit', (m) => {
  ui.hitmarker(m.kill, m.head);
  ui.damagePop(m.dmg, m.head);
  audio.hit(m.kill, m.head);
});

net.on('hurt', (m) => {
  S.self.hp = m.hp;
  ui.setHp(m.hp);
  ui.vignette();
  audio.hurt();
  // Chỉ hướng kẻ bắn: góc của kẻ bắn so với hướng đang nhìn (forward ở yaw=0 là -Z).
  if (typeof m.fx === 'number' && typeof m.fz === 'number') {
    const bearing = Math.atan2(-(m.fx - controller.x), -(m.fz - controller.z));
    ui.damageIndicator(bearing - controller.yaw);
  }
});

net.on('kill', (m) => {
  const k = S.roster.get(m.k);
  const v = S.roster.get(m.v);
  if (k && v) ui.killfeed(k, v, WEAPONS[m.w] ? WEAPONS[m.w].name : '', m.head, S.me.id);
});

net.on('correct', (m) => {
  controller.correct(m.x, m.y, m.z); // làm mượt thay vì giật camera về chỗ cũ
});

net.on('rtt', (rtt) => {
  if (S.screen === 'game') ui.setPing(rtt);
  else if (S.screen === 'lobby') ui.renderLobby(S.room, S.me.id, rtt);
});

net.on('err', (m) => {
  if (m.code === 'norejoin') {
    backToMenu(m.msg, 'err');
    return;
  }
  if (S.screen === 'menu') {
    ui.setBusy(false);
    ui.setMenuStatus(m.msg, 'err');
  } else if (S.screen === 'lobby') {
    ui.setLobbyMsg(m.msg, 'err');
  } else {
    ui.banner(m.msg, '', '', 2000);
  }
});

// Mất kết nối: tự kết nối lại và vào lại phòng bằng token (server giữ chỗ 30 giây).
async function reconnect() {
  if (S.reconnecting) return;
  S.reconnecting = true;
  ui.banner('MẤT KẾT NỐI', 'Đang kết nối lại...', '', 0);
  ui.setLobbyMsg('Mất kết nối — đang kết nối lại...', 'err');
  try {
    await net.connect(S.serverUrl, { totalMs: 30000 });
    net.send({ t: 'rejoin', pin: S.me.pin, token: S.me.token });
  } catch {
    backToMenu('Mất kết nối với server, không thể vào lại phòng.', 'err');
  }
}

net.on('disconnect', () => {
  if (S.me.token) {
    reconnect();
  } else {
    ui.setBusy(false);
    ui.setMenuStatus('Mất kết nối với server.', 'err');
  }
});

// ---------------------------------------------------------------
// Điều khiển: bàn phím, chuột
// ---------------------------------------------------------------
const KEYMAP = {
  KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', ArrowLeft: 'l',
  KeyD: 'r', ArrowRight: 'r', Space: 'jump', ShiftLeft: 'walk', ShiftRight: 'walk',
};

function lockPointer() {
  audio.init();
  try {
    const p = world.canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => {});
  } catch { /* bỏ qua */ }
}

ui.el.clickplay.addEventListener('click', lockPointer);

document.addEventListener('pointerlockchange', () => {
  S.locked = document.pointerLockElement === world.canvas;
  if (S.screen === 'game') ui.showClickPlay(!S.locked);
  if (!S.locked) {
    S.mouseDown = false;
    controller.clearKeys();
  }
});

document.addEventListener('mousemove', (e) => {
  if (S.locked && S.screen === 'game' && S.self.alive) {
    controller.look(e.movementX, e.movementY, 0.0022 * S.sens);
    vm.look(e.movementX, e.movementY);
  }
});

window.addEventListener('mousedown', (e) => {
  if (e.button !== 0 || S.screen !== 'game' || !S.locked) return;
  if (!S.self.alive) {
    S.specIdx++;
    return;
  }
  S.mouseDown = true;
});

window.addEventListener('mouseup', (e) => {
  if (e.button !== 0) return;
  S.mouseDown = false;
  S.fireLatched = false;
  S.emptyClicked = false;
});

window.addEventListener('wheel', (e) => {
  if (!S.locked || S.screen !== 'game' || !S.self.alive) return;
  const i = WEAPON_ORDER.indexOf(S.self.weapon);
  const n = (i + (e.deltaY > 0 ? 1 : -1) + WEAPON_ORDER.length) % WEAPON_ORDER.length;
  selectWeapon(WEAPON_ORDER[n]);
});

window.addEventListener('keydown', (e) => {
  if (S.screen !== 'game') return;
  const k = KEYMAP[e.code];
  if (k) {
    controller.keys[k] = true;
    e.preventDefault();
    return;
  }
  if (e.code === 'Tab') {
    e.preventDefault();
    ui.showScoreboard(true, S.room, S.me.id);
    return;
  }
  if (e.repeat) return;
  if (e.code === 'F3') {
    e.preventDefault();
    ui.toggleStats();
    return;
  }
  if (e.code === 'KeyR') {
    doReload();
  } else if (e.code.startsWith('Digit')) {
    const id = SLOT_TO_ID[e.code.slice(5)];
    if (id) selectWeapon(id);
  }
});

window.addEventListener('keyup', (e) => {
  const k = KEYMAP[e.code];
  if (k) controller.keys[k] = false;
  if (e.code === 'Tab') {
    e.preventDefault();
    ui.showScoreboard(false);
  }
});

window.addEventListener('blur', () => {
  controller.clearKeys();
  S.mouseDown = false;
  ui.showScoreboard(false);
});

document.addEventListener('contextmenu', (e) => e.preventDefault());

function selectWeapon(id) {
  if (!S.self.alive || id === S.self.weapon) return;
  S.self.weapon = id;
  S.self.reloading = false;
  vm.setWeapon(id);
  vm.setReloading(false);
  S.nextFireAt = performance.now() + 250;
  net.send({ t: 'weapon', w: id });
  ui.setAmmo(S.self);
}

function doReload() {
  if (!S.self.alive || S.self.reloading) return;
  const def = WEAPONS[S.self.weapon];
  const a = S.self.ammo[S.self.weapon];
  if (a[0] >= def.mag || a[1] <= 0) return;
  net.send({ t: 'reload' });
}

function tryFire(now) {
  if (!S.mouseDown || !S.locked || !S.self.alive || S.round.phase !== 'live') return;
  if (S.self.reloading || now < S.nextFireAt) return;
  const def = WEAPONS[S.self.weapon];
  if (!def.auto && S.fireLatched) return;
  const a = S.self.ammo[S.self.weapon];
  S.fireLatched = true;
  if (a[0] <= 0) {
    if (!S.emptyClicked) {
      S.emptyClicked = true;
      audio.empty();
      net.send({ t: 'reload' });
    }
    return;
  }
  // Phản hồi tức thì ở client (đạn, âm thanh, giật); server vẫn là bên quyết định trúng/trượt.
  a[0]--;
  S.nextFireAt = now + def.interval;
  net.send({ t: 'shoot', ...pose() }); // gửi TRƯỚC khi áp giật của chính phát này (giật ảnh hưởng phát sau)
  const rc = punch.kick(def.id, now / 1000);
  vm.kick(rc.gunKick);
  {
    world.camera.updateMatrixWorld(true);
    vm.update(0, controller.speed, controller.grounded);
    vm.muzzleWorld(world.camera, _mz);
    world.muzzleFlash([_mz.x, _mz.y, _mz.z], def.id === 'shotgun' ? 1.3 : 1);
    vm.ejectWorld(world.camera, _ej);
    const yw = controller.yaw;
    world.fx.casing([_ej.x, _ej.y, _ej.z], [Math.cos(yw), 0, -Math.sin(yw)], [0, 1, 0]);
  }
  audio.shot(def.id, 0.9, 0);
  ui.setAmmo(S.self);

  // Ước lượng tản đạn để tâm ngắm nở ra giống server: giảm dần khi nghỉ, tăng mỗi phát.
  const idle = S.lastShotMs ? now - S.lastShotMs : 1e9;
  S.spray = Math.max(0, S.spray - idle / (def.interval * 3));
  S.spray = Math.min(S.spray + 1, def.sprayMax);
  S.lastShotMs = now;
}

// ---------------------------------------------------------------
// Tâm ngắm nở ra theo tốc độ, nhảy và xả đạn
// ---------------------------------------------------------------
function updateCrosshair(now) {
  const def = WEAPONS[S.self.weapon];
  const idle = S.lastShotMs ? now - S.lastShotMs : 1e9;
  const spray = Math.min(Math.max(0, S.spray - idle / (def.interval * 3)), def.sprayMax);
  const move = Math.min(controller.speed / 5.6, 1.2);
  const spread = spreadOf(def.id, move, !controller.grounded, spray);
  const pxPerRad = window.innerHeight * 0.651; // với FOV dọc 75°
  ui.setCrosshair(4 + spread * pxPerRad * 0.9);
}

// ---------------------------------------------------------------
// Thống kê FPS/ping (F3) và độ phân giải tự động
// ---------------------------------------------------------------
let statsAt = 0;
let adaptAt = 0;
function updateStats(now) {
  if (ui.statsVisible() && now - statsAt > 400) {
    statsAt = now;
    const info = world.renderer.info;
    ui.setStats(
      `FPS ${frameStats.avgFps().toFixed(0)}  (1% thấp ${frameStats.low1Fps().toFixed(0)})\n` +
      `Khung hình ${frameStats.avgMs().toFixed(1)} ms\n` +
      `Draw ${info.render.calls}  Tam giác ${info.render.triangles}\n` +
      `Ping ${net.rtt} ms  Jitter ${net.jitter.toFixed(1)} ms\n` +
      `Snapshot mỗi ${net.snapGap.toFixed(0)} ms\n` +
      `Đồ họa ${S.quality}  Tỉ lệ ${world.scale.toFixed(2)}`
    );
  }
  // Chế độ Tự động: mỗi ~1.5s xem FPS để tăng/giảm độ phân giải. Bóng đổ giữ nguyên.
  if (S.quality === 'auto' && frameStats.n >= 120 && now - adaptAt > 1500) {
    adaptAt = now;
    const ms = frameStats.avgMs();
    if (ms > 19 && world.scale > 0.61) {
      world.setScale(world.scale - 0.1);
      frameStats.reset();
    } else if (ms < 12 && world.scale < 1.24) {
      world.setScale(world.scale + 0.05); // chỉ tăng lại khi máy dư sức (>80 FPS)
      frameStats.reset();
    }
  }
}

// ---------------------------------------------------------------
// Vòng lặp game
// ---------------------------------------------------------------
function spectate() {
  const list = world.aliveRemotes();
  const mine = list.filter((r) => r.team === S.me.team);
  const pool = mine.length ? mine : list;
  if (pool.length) {
    const rp = pool[S.specIdx % pool.length];
    world.hiddenId = rp.id;
    world.setCamera(rp.group.position.x, rp.group.position.y + EYE, rp.group.position.z, rp.group.rotation.y, rp.pitch);
    ui.setSpectate(`Đang theo dõi: ${rp.name} · nhấp chuột để đổi người`);
  } else {
    world.hiddenId = 0;
    ui.setSpectate('Chờ vòng sau...');
    if (!S.camSet) {
      world.setCamera(0, 14, 30, 0, -0.55); // góc nhìn tổng quan khi chưa có ai để theo dõi
      S.camSet = true;
    }
  }
}

function gameFrame(dt, now) {
  const phase = S.round.phase;
  if (S.self.alive) {
    // Vật lý chạy theo bước cố định (không phụ thuộc FPS), hình ảnh nội suy giữa 2 bước.
    controller.canMove = S.locked && phase !== 'freeze';
    S.alpha = stepper.advance(dt, (h) => controller.update(h));
    punch.update(dt, now / 1000);
    world.hiddenId = 0;
    const rp = controller.renderPos(S.alpha);
    world.setCamera(rp.x, rp.y + EYE, rp.z, controller.yaw + punch.yaw, clamp(controller.pitch + punch.pitch, -1.55, 1.55));

    if (now - S.lastSend >= 1000 / SEND_HZ) {
      S.lastSend = now;
      net.send({ t: 'move', ...pose() });
    }
    tryFire(now);
    vm.update(dt, controller.speed, controller.grounded);
    updateCrosshair(now);

    if (controller.grounded && controller.speed > 3) {
      S.stepT += dt;
      if (S.stepT > 0.4) {
        S.stepT = 0;
        audio.step();
      }
    }
    ui.setSpectate('');
  } else {
    spectate();
  }

  if (phase === 'freeze' || phase === 'live' || phase === 'roundEnd') ui.setTimer(S.round.endAt - now);
  else ui.setTimer(0);
}

// Tiếng bước chân đối thủ, nghe theo hướng nhìn hiện tại của camera.
world.onStep = (x, z) => {
  if (S.screen !== 'game') return;
  const cam = world.camera;
  audio.stepAt(x - cam.position.x, z - cam.position.z, cam.rotation.y);
};

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 0.1);
  frameStats.push(now - last);
  last = now;
  if (S.screen !== 'game') {
    stepper.reset();
    // Menu / phòng chờ: cảnh 3D xoay chậm làm nền (vẽ ~30 FPS cho nhẹ máy).
    if (now - S.menuT >= 33) {
      const md = Math.min((now - S.menuT) / 1000, 0.1);
      S.menuT = now;
      const a = now * 0.00006;
      world.hiddenId = 0;
      world.setCamera(Math.sin(a) * 30, 5.5 + Math.sin(a * 1.7) * 1.2, Math.cos(a) * 36, a, -0.12);
      world.update(md, now);
      world.render(null);
    }
    return;
  }
  gameFrame(dt, now);
  world.update(dt, now);
  world.render(S.self.alive ? vm : null);
  updateStats(now);
}
requestAnimationFrame(frame);
