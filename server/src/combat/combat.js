'use strict';
const C = require('../config');
const { WEAPONS, computeSpread } = require('./weapons');
const { traceRay, dirFromAngles, applySpread } = require('./hitscan');

const r2 = (v) => Math.round(v * 100) / 100;

function startReload(room, p, now) {
  const w = WEAPONS[p.weapon];
  const a = p.ammo[w.id];
  if (!p.alive || p.reloadEnd || a.mag >= w.mag || a.reserve <= 0) return false;
  p.reloadEnd = now + w.reloadMs;
  room.sendSelf(p);
  return true;
}

function finishReload(room, p) {
  const w = WEAPONS[p.weapon];
  const a = p.ammo[w.id];
  const take = Math.min(w.mag - a.mag, a.reserve);
  a.mag += take;
  a.reserve -= take;
  p.reloadEnd = 0;
  room.sendSelf(p);
}

function switchWeapon(room, p, id, now) {
  if (!p.alive || !WEAPONS[id] || id === p.weapon) return;
  p.weapon = id;
  p.reloadEnd = 0;
  p.nextShot = now + 250;
  p.spray = 0;
  room.sendSelf(p);
}

function die(room, killer, victim, w, head, now) {
  victim.alive = false;
  victim.hp = 0;
  victim.reloadEnd = 0;
  victim.deaths++;
  killer.kills++;
  room.broadcast({ t: 'kill', k: killer.id, v: victim.id, w: w.id, head: head ? 1 : 0 });
  room.sendSelf(victim);
  room.sendInfo();
  room.match.checkElimination(now);
}

function applyDamage(room, shooter, victim, dmg, head, w, now) {
  victim.hp = Math.max(0, victim.hp - dmg);
  const killed = victim.hp <= 0;
  shooter.send({ t: 'hit', v: victim.id, dmg, head: head ? 1 : 0, kill: killed ? 1 : 0 });
  victim.send({ t: 'hurt', from: shooter.id, hp: victim.hp, fx: r2(shooter.x), fz: r2(shooter.z) });
  if (killed) die(room, shooter, victim, w, head, now);
  else room.sendSelf(victim);
}

// Thời gian cần "tua ngược" khi kiểm tra trúng: nửa ping của người bắn (đạn đi tới server)
// cộng độ trễ nội suy mà client dùng khi hiển thị đối thủ. Có giới hạn để chống lợi dụng.
function rewindMs(shooter) {
  const ms = shooter.rtt / 2 + C.INTERP_DELAY_MS;
  return Math.max(0, Math.min(C.LAG_COMP_MAX_MS, ms));
}

// Xử lý một phát bắn (hitscan). Server tự tính trúng/trượt và sát thương.
function handleShoot(room, shooter, now, rand = Math.random) {
  if (!shooter.alive || room.match.phase !== 'live') return;
  const w = WEAPONS[shooter.weapon];
  const a = shooter.ammo[w.id];
  if (shooter.reloadEnd) return;
  if (now < shooter.nextShot - 30) return; // bắn quá nhanh so với tốc độ súng
  if (a.mag <= 0) {
    startReload(room, shooter, now);
    return;
  }

  a.mag--;
  shooter.nextShot = Math.max(shooter.nextShot, now - 30) + w.interval;

  // Tản đạn tăng khi bắn liên tiếp và hồi dần khi ngừng bắn.
  const idle = shooter.lastShotAt ? now - shooter.lastShotAt : 1e9;
  shooter.spray = Math.max(0, shooter.spray - idle / (w.interval * 3));
  const sprayNow = Math.min(shooter.spray, w.sprayMax);
  shooter.spray = Math.min(sprayNow + 1, w.sprayMax);
  shooter.lastShotAt = now;

  const moveFactor = Math.min(shooter.speed / 5.6, 1.2);
  const airborne = now < shooter.airUntil;
  const spread = computeSpread(w, moveFactor, airborne, sprayNow);

  const origin = [shooter.x, shooter.y + C.EYE_HEIGHT, shooter.z];
  const baseDir = dirFromAngles(shooter.yaw, shooter.pitch);

  // Vị trí đối thủ tại thời điểm người bắn nhìn thấy họ (bù trễ).
  const tRewind = now - rewindMs(shooter);
  const targets = [];
  for (const p of room.players.values()) {
    if (!p.alive || p.team === shooter.team) continue;
    const pos = p.posAt(tRewind);
    targets.push({ ref: p, x: pos.x, y: pos.y, z: pos.z });
  }

  const damage = new Map();
  let firstEnd = null;
  let firstHit = false;
  for (let i = 0; i < w.pellets; i++) {
    const dir = applySpread(baseDir, spread, rand);
    const r = traceRay(origin, dir, w.range, targets);
    if (i === 0) {
      firstEnd = [origin[0] + dir[0] * r.t, origin[1] + dir[1] * r.t, origin[2] + dir[2] * r.t];
      firstHit = !!r.hit;
    }
    if (r.hit) {
      const rec = damage.get(r.hit.ref) || { dmg: 0, head: false };
      rec.dmg += w.damage * (r.hit.head ? w.headMul : 1);
      rec.head = rec.head || r.hit.head;
      damage.set(r.hit.ref, rec);
    }
  }

  room.broadcast({
    t: 'shot', id: shooter.id, w: w.id,
    from: origin.map(r2), to: firstEnd.map(r2), h: firstHit ? 1 : 0,
  });

  for (const [victim, rec] of damage) {
    if (!victim.alive) continue;
    applyDamage(room, shooter, victim, Math.round(rec.dmg), rec.head, w, now);
  }

  room.sendSelf(shooter);
  if (a.mag === 0 && a.reserve > 0 && shooter.alive) startReload(room, shooter, now);
}

module.exports = { handleShoot, startReload, finishReload, switchWeapon, rewindMs };
