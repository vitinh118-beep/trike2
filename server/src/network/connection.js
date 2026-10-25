'use strict';
const C = require('../config');
const { Player } = require('../rooms/player');
const { cleanName, cleanPin } = require('../security/validate');
const { applyPose } = require('../game/movement');
const { handleShoot, startReload, switchWeapon } = require('../combat/combat');
const { WEAPONS } = require('../combat/weapons');

function sendRaw(ws, obj) {
  if (ws.readyState === 1) ws.send(JSON.stringify(obj));
}

function err(ws, msg, code) {
  sendRaw(ws, { t: 'err', msg, code: code || '' });
}

// Tin báo đã vào phòng, kèm bảng thông số súng để client luôn khớp với server.
function joinedMsg(room, p) {
  return {
    t: 'joined', id: p.id, token: p.token, pin: room.pin,
    host: room.hostId === p.id ? 1 : 0, weapons: WEAPONS,
  };
}

function joinOk(conn, room, p) {
  conn.player = p;
  conn.room = room;
  p.send(joinedMsg(room, p));
  room.sendInfo();
}

function dispatch(conn, m, now, mgr) {
  const { ws } = conn;
  const p = conn.player;
  const room = conn.room;

  switch (m.t) {
    case 'ping':
      sendRaw(ws, { t: 'pong', ts: m.ts });
      return;

    case 'create': {
      if (p) return err(ws, 'Bạn đang ở trong một phòng.');
      const name = cleanName(m.name);
      if (!name) return err(ws, 'Nickname cần 2–14 ký tự (chữ, số, khoảng trắng).');
      const r = mgr.createRoom();
      if (!r) return err(ws, 'Server đang đầy phòng, hãy thử lại sau.');
      const np = new Player(mgr.nextId(), name, ws);
      r.addPlayer(np);
      return joinOk(conn, r, np);
    }

    case 'join': {
      if (p) return err(ws, 'Bạn đang ở trong một phòng.');
      const name = cleanName(m.name);
      if (!name) return err(ws, 'Nickname cần 2–14 ký tự (chữ, số, khoảng trắng).');
      const pin = cleanPin(m.pin);
      const r = pin && mgr.get(pin);
      if (!r) return err(ws, 'Không tìm thấy phòng với mã PIN này.');
      if (r.nameTaken(name)) return err(ws, 'Nickname đã có người dùng trong phòng.');
      const np = new Player(mgr.nextId(), name, ws);
      if (!r.addPlayer(np)) return err(ws, 'Phòng đã đầy (tối đa 10 người).');
      return joinOk(conn, r, np);
    }

    case 'rejoin': {
      if (p) return;
      const pin = cleanPin(m.pin);
      const r = pin && mgr.get(pin);
      const found = r && r.findByToken(m.token);
      if (!found) return err(ws, 'Không thể vào lại phòng cũ (server có thể đã khởi động lại).', 'norejoin');
      found.attach(ws);
      conn.player = found;
      conn.room = r;
      found.send(joinedMsg(r, found));
      r.sendInfo();
      if (r.match.running) {
        found.send(r.roundMsg(now));
        r.sendSelf(found);
      }
      return;
    }

    default:
      break;
  }

  if (!p || !room) return;

  switch (m.t) {
    case 'sq': {
      // Trả lời "sp" của server: đo RTT thật (làm mượt để tránh nhảy vọt).
      const rtt = typeof m.ts === 'number' ? now - m.ts : -1;
      if (rtt >= 0 && rtt < 5000) p.rtt = p.rtt * 0.7 + Math.min(rtt, 1000) * 0.3;
      break;
    }

    case 'team':
      if (!room.switchTeam(p, m.team)) err(ws, 'Không thể đổi đội lúc này.');
      break;

    case 'start':
      if (room.hostId !== p.id) return err(ws, 'Chỉ chủ phòng mới bắt đầu được trận.');
      room.match.start(now);
      break;

    case 'move':
      applyPose(room, p, m, now);
      break;

    case 'shoot':
      applyPose(room, p, m, now);
      handleShoot(room, p, now);
      break;

    case 'reload':
      startReload(room, p, now);
      break;

    case 'weapon':
      if (typeof m.w === 'string') switchWeapon(room, p, m.w, now);
      break;

    case 'leave':
      conn.player = null;
      conn.room = null;
      room.removePlayer(p.id, now);
      break;

    default:
      break;
  }
}

function handleConnection(ws, mgr) {
  const conn = { ws, player: null, room: null, count: 0, windowStart: Date.now() };

  ws.on('message', (raw, isBinary) => {
    if (isBinary) return;
    const now = Date.now();
    if (now - conn.windowStart >= 1000) {
      conn.windowStart = now;
      conn.count = 0;
    }
    if (++conn.count > C.MAX_MSG_PER_SEC) return; // chống spam

    let m;
    try {
      m = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!m || typeof m.t !== 'string') return;
    try {
      dispatch(conn, m, now, mgr);
    } catch (e) {
      console.error('[HACHIHI] Lỗi xử lý tin nhắn', m.t, e);
    }
  });

  ws.on('close', () => {
    const p = conn.player;
    const room = conn.room;
    if (!p || !room || p.ws !== ws) return; // đã vào lại bằng kết nối khác
    p.connected = false;
    p.disconnectedAt = Date.now();
    p.alive = false;
    room.sendInfo();
    room.match.checkElimination(Date.now());
  });

  ws.on('error', () => {});
}

module.exports = { handleConnection };
