'use strict';
// Kiểm thử chiến đấu ở mức module + một ca tích hợp qua WebSocket: hitbox đầu/thân, tản đạn,
// bù trễ (lag compensation), chống bay/nhảy giả, chống bắn xuyên tường.
process.env.HACHIHI_FREEZE_MS = '250';
process.env.HACHIHI_ROUNDS_TO_WIN = '5';

const assert = require('assert');
const WebSocket = require('ws');
const { start } = require('../server');
const { hitTarget, traceRay, dirFromAngles, applySpread } = require('../src/combat/hitscan');
const { computeSpread, WEAPONS } = require('../src/combat/weapons');
const { applyPose } = require('../src/game/movement');
const { rewindMs } = require('../src/combat/combat');
const { Player } = require('../src/rooms/player');

const ok = (s) => console.log('  ✓', s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- 1. Hitbox đầu / thân ----------
{
  const tg = { x: 0, y: 0, z: 0 };
  const shoot = (h) => hitTarget([0, h, 10], [0, 0, -1], tg);
  assert.strictEqual(shoot(1.62).head, true, 'ngang đầu phải là headshot');
  assert.strictEqual(shoot(1.75).head, true);
  assert.strictEqual(shoot(1.0).head, false, 'ngang ngực là thân');
  assert.strictEqual(shoot(0.3).head, false, 'chân vẫn trúng');
  assert.strictEqual(shoot(1.95), null, 'bay qua đầu thì trượt');
  assert.strictEqual(hitTarget([0.6, 1.0, 10], [0, 0, -1], tg), null, 'lệch sang bên thì trượt');
  ok('Hitbox: đầu (hình cầu) và thân (hình trụ) tách riêng, trượt đúng');
}

// ---------- 2. Tường chắn đạn ----------
{
  // Bức tường giữa bản đồ (0,1.5,0) 10x3x1.2: đứng sau tường bắn xuyên sang đối thủ phía bên kia.
  const dir = [0, 0, -1];
  const r = traceRay([0, 1.6, 6], dir, 100, [{ ref: 'victim', x: 0, y: 0, z: -4 }]);
  // Tường cao 3m nên chắn ở độ cao 1.6
  assert.strictEqual(r.hit, null, 'tường chắn đạn');
  const r2 = traceRay([0, 1.6, 6], dir, 100, [{ ref: 'victim', x: 14, y: 0, z: -4 }]);
  assert.strictEqual(r2.hit, null);
  const r3 = traceRay([20, 1.6, 6], dir, 100, [{ ref: 'victim', x: 20, y: 0, z: -4 }]);
  assert.ok(r3.hit && r3.hit.ref === 'victim', 'đường trống thì trúng');
  ok('Đạn bị tường chặn; đường trống thì trúng');
}

// ---------- 3. Tản đạn theo trạng thái ----------
{
  const w = WEAPONS.rifle;
  const stand = computeSpread(w, 0, false, 0);
  const walk = computeSpread(w, 0.5, false, 0);
  const run = computeSpread(w, 1, false, 0);
  const air = computeSpread(w, 0, true, 0);
  const spray = computeSpread(w, 0, false, w.sprayMax);
  assert.ok(stand < walk && walk < run, 'chạy tản hơn đi bộ, đi bộ tản hơn đứng yên');
  assert.ok(air > run, 'nhảy tản nhất');
  assert.ok(spray > stand * 2, 'xả đạn liên tục làm tản rõ rệt');
  // Thống kê: tản lớn hơn thì lệch tâm trung bình lớn hơn
  const dev = (s) => {
    let sum = 0;
    for (let i = 0; i < 4000; i++) {
      const d = applySpread([0, 0, -1], s);
      sum += Math.acos(Math.min(1, -d[2]));
    }
    return sum / 4000;
  };
  assert.ok(dev(run) > dev(stand) * 1.5);
  ok(`Tản đạn súng trường: đứng ${stand.toFixed(4)} < đi ${walk.toFixed(4)} < chạy ${run.toFixed(4)} < nhảy ${air.toFixed(4)} rad`);
}

// ---------- 4. Kiểm tra di chuyển dọc (chống bay) ----------
{
  const room = { match: { phase: 'live' } };
  const mk = () => {
    const p = new Player(1, 'T', { readyState: 1, send() {}, bufferedAmount: 0 });
    p.alive = true; p.x = 0; p.y = 0; p.z = 26; p.lastMoveAt = 1000;
    return p;
  };
  const move = (p, m, now) => applyPose(room, p, { x: p.x, y: p.y, z: p.z, yaw: 0, pitch: 0, ...m }, now);

  // Nhảy hợp lệ: vận tốc 7.6 m/s, gửi 30Hz -> mỗi gói ~0.25 m lên rồi xuống
  let p = mk();
  let t = 1000;
  let y = 0;
  let vy = 7.6;
  let bad = 0;
  for (let i = 0; i < 40; i++) {
    t += 33;
    vy -= 22 * 0.033;
    y = Math.max(0, y + vy * 0.033);
    if (!move(p, { y }, t)) bad++;
    if (y === 0) break;
  }
  assert.strictEqual(bad, 0, 'một cú nhảy bình thường không được bị từ chối');
  // Bay: tăng đều 3 m/s theo phương thẳng đứng
  p = mk();
  t = 1000;
  let rejected = 0;
  for (let i = 1; i <= 30; i++) {
    t += 33;
    if (!move(p, { y: Math.min(3.9, i * 0.3) }, t)) rejected++;
  }
  assert.ok(rejected > 5, 'bay lên đều phải bị từ chối');
  assert.ok(p.y < 3, 'bay giả không lên quá cao (y=' + p.y.toFixed(2) + ')');
  // Teleport dọc
  p = mk();
  assert.strictEqual(move(p, { y: 3.5 }, 1033), false);
  ok('Nhảy thật không bị chặn; bay giả và teleport dọc bị từ chối');
}

(async () => {
  const app = start(0);
  await new Promise((r) => app.server.once('listening', r));
  const port = app.server.address().port;
  const guard = setTimeout(() => { console.error('TIMEOUT'); process.exit(1); }, 25000);

  const conn = () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const msgs = [];
    ws.on('message', (d) => msgs.push(JSON.parse(d.toString())));
    return {
      ws, msgs,
      open: new Promise((r) => ws.on('open', r)),
      send: (o) => ws.send(JSON.stringify(o)),
      async wait(pred, from = 0, ms = 4000) {
        const t0 = Date.now();
        while (Date.now() - t0 < ms) {
          const f = msgs.slice(from).find(pred);
          if (f) return f;
          await sleep(10);
        }
        throw new Error('hết thời gian chờ');
      },
    };
  };
  const A = conn();
  const B = conn();
  await Promise.all([A.open, B.open]);
  A.send({ t: 'create', name: 'Alice' });
  const ja = await A.wait((m) => m.t === 'joined');
  assert.ok(ja.weapons && ja.weapons.rifle && ja.weapons.rifle.interval === 100, 'server gửi bảng súng cho client');
  ok('Server gửi bảng thông số súng khi vào phòng');
  B.send({ t: 'join', name: 'Bob', pin: ja.pin });
  const jb = await B.wait((m) => m.t === 'joined');
  A.send({ t: 'start' });
  await A.wait((m) => m.t === 'round' && m.phase === 'live');

  // Server tự đo RTT
  await A.wait((m) => m.t === 'sp');
  const sp = A.msgs.find((m) => m.t === 'sp');
  A.send({ t: 'sq', ts: sp.ts });
  await sleep(100);
  const room = app.manager.get(ja.pin);
  const pa = room.players.get(ja.id);
  const pb = room.players.get(jb.id);
  assert.ok(pa.rtt > 0 && pa.rtt < 200, 'rtt đo ở server: ' + pa.rtt);
  ok('Server tự đo RTT bằng sp/sq (' + Math.round(pa.rtt) + ' ms), không tin số từ client');

  // Snapshot có timestamp
  const snap = A.msgs.find((m) => m.t === 'snap');
  assert.ok(snap && typeof snap.ts === 'number');
  ok('Snapshot có timestamp server để client nội suy');

  // ---------- Bù trễ ----------
  // Alice (đội A) ở (0,0,26) nhìn về phía -Z; Bob đang ở x=+5 NHƯNG 160ms trước ở x=-1.5, z=20.
  const aim = (tx, tz, ty = 1.0) => {
    const dx = tx - 0;
    const dz = tz - 26;
    return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(ty - 1.6, Math.hypot(dx, dz)) };
  };
  const setup = (rtt) => {
    pa.x = 0; pa.y = 0; pa.z = 26; pa.speed = 0; pa.rtt = rtt; pa.spray = 0; pa.lastShotAt = 0;
    pa.nextShot = 0; pa.reloadEnd = 0; pa.ammo.rifle = { mag: 30, reserve: 90 };
    pb.hp = 100; pb.alive = true;
    const now = Date.now();
    pb.history.length = 0;
    // Bob đi từ x=-3 (cách 300ms) -> x=0 (cách 100ms) theo đường thẳng; hiện đang ở x=6
    pb.history.push({ t: now - 300, x: -3, y: 0, z: 20 }, { t: now - 100, x: 0, y: 0, z: 20 });
    pb.x = 6; pb.y = 0; pb.z = 20;
  };

  // rtt 120 -> tua ngược 60 + 100 = 160ms -> Bob ở x = -3 + 3*(140/200) = -0.9
  assert.strictEqual(Math.round(rewindMs({ rtt: 120 })), 160);
  setup(120);
  let target = aim(-0.9, 20);
  let mk = B.msgs.length;
  const ak = A.msgs.length;
  A.send({ t: 'shoot', x: 0, y: 0, z: 26, yaw: target.yaw, pitch: target.pitch });
  await A.wait((m) => m.t === 'hit', ak);
  ok('Bù trễ: ngắm vào chỗ Bob đứng 160ms trước thì trúng dù Bob đã chạy đi xa');

  // Đối chứng: cùng cú ngắm nhưng ping 0 -> chỉ tua 100ms -> Bob ở x=0, lệch 0.9m nên phải trượt.
  setup(0);
  const hpBefore = pb.hp;
  A.send({ t: 'shoot', x: 0, y: 0, z: 26, yaw: target.yaw, pitch: target.pitch });
  await sleep(250);
  assert.strictEqual(pb.hp, hpBefore, 'không có bù trễ đủ lớn thì phải trượt');
  ok('Đối chứng: cùng cú ngắm với ping 0 thì trượt (chứng tỏ chính bù trễ làm nó trúng)');

  // Ping khổng lồ không được tua quá 250ms.
  setup(2000); // ping khổng lồ không được tua quá 250ms
  assert.strictEqual(rewindMs({ rtt: 2000 }), 250);
  pb.history.length = 0;
  const now2 = Date.now();
  pb.history.push({ t: now2 - 900, x: -8, y: 0, z: 20 }, { t: now2 - 600, x: -8, y: 0, z: 20 }, { t: now2 - 300, x: 0, y: 0, z: 20 }, { t: now2 - 50, x: 6, y: 0, z: 20 });
  target = aim(-8, 20); // vị trí cách 900ms: ngoài giới hạn bù trễ
  const before = pb.hp;
  A.send({ t: 'shoot', x: 0, y: 0, z: 26, yaw: target.yaw, pitch: target.pitch });
  await sleep(300);
  assert.strictEqual(pb.hp, before, 'không được bù trễ quá giới hạn 250ms');
  ok('Giới hạn bù trễ 250ms: ping khổng lồ không thể bắn vào quá khứ xa');

  // ---------- Headshot ----------
  setup(0);
  pb.history.length = 0;
  pb.x = 0; pb.z = 20;
  target = aim(0, 20, 1.7);
  const hk = A.msgs.length;
  A.send({ t: 'shoot', x: 0, y: 0, z: 26, yaw: target.yaw, pitch: target.pitch });
  const hit = await A.wait((m) => m.t === 'hit', hk);
  assert.strictEqual(hit.head, 1);
  assert.ok(hit.dmg >= 60, 'headshot súng trường ~67 sát thương, nhận ' + hit.dmg);
  ok('Headshot qua mạng: ' + hit.dmg + ' sát thương');

  // ---------- Bắn xuyên tường ----------
  setup(0);
  pb.history.length = 0;
  // Bob nấp sau thùng/bức tường giữa: ngắm từ (0,0,26) tới (0,0,-4) ngang qua tường giữa (z=0)
  pb.x = 0; pb.z = -4;
  target = aim(0, -4, 1.0);
  pa.z = 26;
  const hp0 = pb.hp;
  const wk = A.msgs.length;
  A.send({ t: 'shoot', x: 0, y: 0, z: 26, yaw: target.yaw, pitch: target.pitch });
  await A.wait((m) => m.t === 'shot', wk);
  await sleep(100);
  assert.strictEqual(pb.hp, hp0, 'không được trúng xuyên tường');
  ok('Bắn xuyên tường không gây sát thương');

  console.log('\nCOMBAT OK');
  clearTimeout(guard);
  app.stop();
  process.exit(0);
})().catch((e) => {
  console.error('\nCOMBAT FAIL:', e);
  process.exit(1);
});
