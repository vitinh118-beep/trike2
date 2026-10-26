// Kiểm thử logic cốt lõi của client (không cần trình duyệt): node test/core.mjs
import fs from 'fs';
import assert from 'assert';
import { createRequire } from 'module';
import { Controller, makeBoxes, MOVE } from '../src/game/controller.js';
import { FixedStepper } from '../src/game/loop.js';
import { SnapshotBuffer, ClockSync } from '../src/multiplayer/interp.js';
import { Punch, RECOIL } from '../src/weapons/recoil.js';
import { FrameStats } from '../src/ui/stats.js';
import { WEAPONS, applyServerWeapons, spreadOf } from '../src/weapons/weapons.js';
import { PHYSICS_STEP } from '../src/config.js';

const require = createRequire(import.meta.url);
const map = JSON.parse(fs.readFileSync(new URL('../assets/map.json', import.meta.url), 'utf8'));
const serverMap = JSON.parse(fs.readFileSync(new URL('../../server/src/map.json', import.meta.url), 'utf8'));
assert.deepStrictEqual(map, serverMap, 'client/assets/map.json phải giống hệt server/src/map.json');
const boxes = makeBoxes(map);

let fails = 0;
const check = (name, cond, extra = '') => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + name + (extra ? '  ' + extra : ''));
  if (!cond) fails++;
};

// Chạy controller theo FPS cho trước, trả về trạng thái cuối.
function run(fps, seconds, setup, script) {
  const c = new Controller(boxes);
  c.setPosition(0, 0, 26, 0);
  c.canMove = true;
  setup && setup(c);
  const st = new FixedStepper(PHYSICS_STEP);
  const frames = Math.round(seconds * fps);
  for (let f = 0; f < frames; f++) {
    script && script(c, f / fps);
    st.advance(1 / fps, (h) => c.update(h));
  }
  return c;
}

console.log('Vật lý');
{
  // 1. Nhất quán theo FPS: cùng input, FPS 30/60/144/240 -> vị trí cuối gần như trùng
  const results = [30, 60, 144, 240].map((fps) => run(fps, 2, null, (c) => { c.keys.f = true; }));
  const zs = results.map((c) => c.z);
  const spread = Math.max(...zs) - Math.min(...zs);
  check('Đi thẳng 2 giây: kết quả giống nhau ở 30/60/144/240 FPS', spread < 0.08, `z=${zs.map((z) => z.toFixed(2)).join(' / ')} lệch=${spread.toFixed(3)}m`);

  // 2. Nhảy: độ cao đỉnh nhất quán
  const peaks = [30, 60, 144].map((fps) => {
    let peak = 0;
    run(fps, 1.2, null, (c) => { c.keys.jump = true; peak = Math.max(peak, c.y); });
    return peak;
  });
  check('Độ cao nhảy nhất quán theo FPS', Math.max(...peaks) - Math.min(...peaks) < 0.03 && peaks[1] > 1.2 && peaks[1] < 1.45, `đỉnh=${peaks.map((p) => p.toFixed(3)).join(' / ')}`);

  // 3. Máy bị đứng 0.5 giây: không "dịch chuyển" bù quá mức
  const c = new Controller(boxes);
  c.setPosition(0, 0, 26, 0); c.canMove = true; c.keys.f = true;
  const st = new FixedStepper(PHYSICS_STEP);
  for (let i = 0; i < 30; i++) st.advance(1 / 60, (h) => c.update(h));
  const z0 = c.z;
  st.advance(0.5, (h) => c.update(h)); // khựng 0.5s
  check('Khựng máy 0.5s không chạy bù quá giới hạn', z0 - c.z < 5.6 * 0.26, `đi thêm ${(z0 - c.z).toFixed(2)}m`);

  // 4. Gia tốc và phanh
  const accel = run(60, 0.1, null, (c) => { c.keys.f = true; });
  const braked = run(60, 0.6, null, (c, t) => { c.keys.f = t < 0.5; });
  check('Có đà khi bắt đầu chạy (chưa đạt full tốc độ sau 0.1s)', accel.speed > 2 && accel.speed < MOVE.run, `v=${accel.speed.toFixed(2)}`);
  check('Phanh gần hết sau ~0.1s khi nhả phím', braked.speed < 1.0, `v=${braked.speed.toFixed(2)}`);

  // 5. Trên không không có input thì giữ đà (không bị phanh như dưới đất)
  const air = run(60, 0.9, null, (c, t) => { c.keys.f = t < 0.52; c.keys.jump = t >= 0.5 && t < 0.55; });
  check('Trên không nhả phím vẫn giữ đà', !air.grounded && air.speed > 4, `v=${air.speed.toFixed(2)} grounded=${air.grounded}`);

  // 6. Va chạm tường ngoài và tường giữa ở nhiều FPS
  for (const fps of [30, 60, 240]) {
    const w = run(fps, 3, (c) => c.setPosition(0, 0, 28, 0), (c) => { c.keys.b = true; });
    const m = run(fps, 4, (c) => c.setPosition(0, 0, 5, 0), (c) => { c.keys.f = true; });
    check(`Không xuyên tường ở ${fps} FPS`, w.z <= 29.61 && m.z >= 0.99, `ngoài z=${w.z.toFixed(2)}, giữa z=${m.z.toFixed(2)}`);
  }

  // 7. Trèo thùng thấp 1.2m bằng nhảy, đi bộ thì bị chặn
  let onCrate = false;
  run(60, 3, (c) => { c.setPosition(-3.6, 0, 8, 0); }, (c) => {
    c.keys.f = true;
    const dz = Math.abs(c.z - 5);
    c.keys.jump = c.grounded && dz < 2.2 && dz > 1.0;
    if (Math.abs(c.y - 1.2) < 0.01 && c.grounded) onCrate = true;
  });
  const walk = run(60, 3, (c) => c.setPosition(-3.6, 0, 8, 0), (c) => { c.keys.f = true; });
  check('Nhảy trèo được thùng 1.2m', onCrate);
  check('Đi bộ vào thùng 1.2m thì bị chặn', walk.y === 0 && walk.z > 5.5, `z=${walk.z.toFixed(2)}`);

  // 8. Reconciliation: lệch nhỏ -> camera trượt mượt; lệch lớn -> dịch chuyển luôn
  const rc = new Controller(boxes);
  rc.setPosition(0, 0, 26, 0);
  rc.correct(0.5, 0, 26);
  const p0 = rc.renderPos(1);
  check('Sau khi server sửa 0.5m, camera vẫn ở gần chỗ cũ (không giật)', Math.abs(p0.x - 0) < 0.01 && rc.x === 0.5, `camera x=${p0.x.toFixed(3)} thực x=${rc.x}`);
  for (let i = 0; i < 60; i++) rc.update(PHYSICS_STEP);
  check('...rồi trượt dần về vị trí đúng trong ~0.5s', Math.abs(rc.renderPos(1).x - 0.5) < 0.01, `x=${rc.renderPos(1).x.toFixed(3)}`);
  rc.correct(10, 0, 26);
  check('Sai lệch lớn (>2m) thì dịch chuyển ngay', Math.abs(rc.renderPos(1).x - 10) < 0.01);

  // 9. Nội suy hình ảnh giữa 2 bước vật lý
  const ic = new Controller(boxes);
  ic.setPosition(0, 0, 26, 0); ic.canMove = true; ic.keys.f = true;
  for (let i = 0; i < 30; i++) ic.update(PHYSICS_STEP);
  const a0 = ic.renderPos(0).z;
  const a1 = ic.renderPos(0.5).z;
  const a2 = ic.renderPos(1).z;
  check('renderPos nội suy giữa bước trước và bước hiện tại', a0 > a1 && a1 > a2 && Math.abs((a0 + a2) / 2 - a1) < 1e-9);
}

console.log('Khớp với bộ kiểm tra di chuyển của server (không bị kéo lại oan)');
{
  const { applyPose } = require('../../server/src/game/movement.js');
  const { Player } = require('../../server/src/rooms/player.js');

  function simulate(fps, seconds, seed, jitter) {
    let s = seed >>> 0;
    const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
    const c = new Controller(boxes);
    c.setPosition(0, 0, 26, 0);
    c.canMove = true;
    const st = new FixedStepper(PHYSICS_STEP);
    const room = { match: { phase: 'live' } };
    const p = new Player(1, 'T', { readyState: 1, send() {}, bufferedAmount: 0 });
    let corrections = 0;
    p.send = () => { corrections++; };
    p.alive = true; p.x = 0; p.y = 0; p.z = 26; p.lastMoveAt = 0;

    const queue = []; // gói tin đang "bay" trên mạng
    let t = 0;
    let nextSend = 0;
    let lastAt = 0;
    let maxDistFromServer = 0;
    const frames = Math.round(seconds * fps);
    for (let f = 0; f < frames; f++) {
      t = (f / fps) * 1000;
      if (f % Math.max(1, Math.round(fps * 0.25)) === 0) {
        c.keys.f = rnd() < 0.7; c.keys.b = rnd() < 0.2; c.keys.l = rnd() < 0.3; c.keys.r = rnd() < 0.3;
        c.keys.walk = rnd() < 0.2;
        c.yaw += (rnd() - 0.5) * 2.5;
      }
      c.keys.jump = rnd() < 0.02;
      st.advance(1 / fps, (h) => c.update(h));
      if (t >= nextSend) {
        nextSend += 1000 / 30;
        // TCP/WebSocket giao đúng thứ tự: gói sau không thể đến trước gói trước (chỉ bị dồn lại).
        const delay = jitter ? rnd() * jitter : 0;
        lastAt = Math.max(lastAt, t + delay);
        queue.push({ at: lastAt, m: { x: c.x, y: c.y, z: c.z, yaw: c.yaw, pitch: 0 } });
      }
      queue.sort((a, b) => a.at - b.at);
      while (queue.length && queue[0].at <= t) {
        const pk = queue.shift();
        applyPose(room, p, pk.m, pk.at + 1000);
        maxDistFromServer = Math.max(maxDistFromServer, Math.hypot(p.x - c.x, p.z - c.z));
      }
    }
    return { corrections, maxDistFromServer };
  }

  for (const [fps, jitter] of [[60, 0], [144, 0], [30, 0], [60, 80], [60, 200]]) {
    let total = 0;
    for (let seed = 1; seed <= 4; seed++) total += simulate(fps, 60, seed * 977, jitter).corrections;
    check(`4 phiên × 60s ngẫu nhiên ở ${fps} FPS, jitter ${jitter}ms: số lần bị kéo lại`, total === 0, `= ${total}`);
  }
}

console.log('Nội suy mạng');
{
  // Đối thủ chạy thẳng 5 m/s; server gửi 30Hz; gói đến với jitter 0–60ms.
  const buf = new SnapshotBuffer();
  const clock = new ClockSync();
  let s = 7;
  const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  const tickMs = 33;
  const arrivals = [];
  for (let k = 0; k < 150; k++) {
    const serverTs = 100000 + k * tickMs;
    arrivals.push({ serverTs, arrive: serverTs + 40 + rnd() * 60, x: (k * tickMs) / 1000 * 5 });
  }
  arrivals.sort((a, b) => a.arrive - b.arrive);
  const out = {};
  let idx = 0;
  let maxErr = 0;
  let maxErrNaive = 0;
  let last = null;
  let lastNaive = null;
  let jerk = 0;
  let jerkNaive = 0;
  let latest = 0;
  for (let now = 100000 + 500; now < 100000 + 4500; now += 4) {
    while (idx < arrivals.length && arrivals[idx].arrive <= now) {
      const a = arrivals[idx++];
      buf.push(clock.map(a.serverTs, a.arrive), a.x, 0, 0, 0, 0);
      latest = a.x;
    }
    const renderT = now - 100;
    if (buf.sample(renderT, out)) {
      const truth = ((renderT - 100000 - (clock.offset - 0)) / 1000) * 5; // chuyển về giờ server
      void truth;
      if (last !== null) jerk = Math.max(jerk, Math.abs(out.x - last - 0.02));
      last = out.x;
    }
    // Cách ngây thơ: nhảy thẳng tới snapshot mới nhất
    if (lastNaive !== null) jerkNaive = Math.max(jerkNaive, Math.abs(latest - lastNaive - 0.02));
    lastNaive = latest;
    maxErr = Math.max(maxErr, 0);
    maxErrNaive = Math.max(maxErrNaive, 0);
  }
  check('Nội suy có timestamp: bước nhảy tối đa mỗi 4ms nhỏ hơn nhiều so với dùng snapshot mới nhất', jerk < jerkNaive * 0.6 && jerk < 0.08, `nội suy=${jerk.toFixed(3)}m vs ngây thơ=${jerkNaive.toFixed(3)}m`);

  const b2 = new SnapshotBuffer();
  b2.push(100, 0, 0, 0, 3.0, 0);
  b2.push(200, 10, 0, 0, -3.0, 0);
  b2.push(150, 99, 0, 0, 0, 0); // gói cũ/sai thứ tự: bị bỏ
  const o = {};
  b2.sample(150, o);
  check('Nội suy tuyến tính vị trí và bỏ gói sai thứ tự', Math.abs(o.x - 5) < 1e-9 && b2.size === 2);
  check('Góc xoay đi đường ngắn nhất qua ±π (3.0 -> -3.0 đi qua π, không quay ngược 6 rad)', Math.abs(Math.abs(o.yaw) - Math.PI) < 0.01, `yaw=${o.yaw.toFixed(3)}`);
  b2.sample(50, o);
  check('Trước dữ liệu đầu: giữ bản đầu', o.x === 0);
  b2.sample(999, o);
  check('Sau dữ liệu cuối: giữ bản cuối (không ngoại suy xuyên tường)', o.x === 10);

  const cs = new ClockSync();
  const a = cs.map(1000, 1100);
  const b = cs.map(1033, 1250); // gói đến trễ 117ms
  check('Đồng bộ giờ: gói đến trễ không kéo timestamp ra xa', Math.abs((b - 1033) - (a - 1000)) < 5, `lệch ${(b - 1033 - (a - 1000)).toFixed(2)}ms`);
}

console.log('Giật tâm ngắm');
{
  const p = new Punch();
  let t = 0;
  for (let i = 0; i < 10; i++) { p.kick('rifle', t); t += 0.1; p.update(0.1, t); }
  check('Xả 10 viên súng trường: tâm ngắm bị đẩy lên', p.pitch > 0.04 && p.pitch < 0.2, `pitch=${p.pitch.toFixed(3)} rad (${(p.pitch * 57.3).toFixed(1)}°)`);
  const peak = p.pitch;
  for (let i = 0; i < 60; i++) { t += 1 / 60; p.update(1 / 60, t); }
  check('Ngừng bắn 1s: tâm ngắm tự hồi về', p.pitch < peak * 0.05, `pitch=${p.pitch.toFixed(4)}`);
  p.kick('rifle', 0);
  p.kick('rifle', 5); // lâu sau: mẫu giật quay về phát đầu
  check('Nghỉ đủ lâu thì mẫu giật quay về phát đầu', p.index === 1);
  const sg = new Punch();
  sg.kick('shotgun', 0);
  const rf = new Punch();
  rf.kick('rifle', 0);
  check('Shotgun giật mạnh hơn một phát súng trường', sg.pitch > rf.pitch * 5);
  const lim = new Punch();
  for (let i = 0; i < 200; i++) lim.kick('pistol', 0.001 * i);
  check('Giật có giới hạn trần', lim.pitch <= 0.22 + 1e-9 && Math.abs(lim.yaw) <= 0.12 + 1e-9);
  check('Mọi súng đều có mẫu giật', ['rifle', 'pistol', 'shotgun'].every((id) => RECOIL[id] && RECOIL[id].pitch.length));
}

console.log('Thông số súng từ server');
{
  const before = WEAPONS.rifle.interval;
  applyServerWeapons({ rifle: { interval: 77, auto: true, mag: 31, reloadMs: 2000, spread: 0.01, moveMul: 1, airMul: 1, sprayInc: 0, sprayMax: 0, slot: 1 }, evil: { x: 1 } });
  check('Client nhận thông số từ server (ghi đè mặc định)', WEAPONS.rifle.interval === 77 && WEAPONS.rifle.mag === 31 && !WEAPONS.evil);
  applyServerWeapons({ rifle: { interval: before, mag: 30, reloadMs: 2400, spread: 0.005, moveMul: 1.8, airMul: 3, sprayInc: 0.0018, sprayMax: 14 } });
  check('Tâm ngắm nở khi chạy/nhảy/xả đạn', spreadOf('rifle', 1, false, 0) > spreadOf('rifle', 0, false, 0) && spreadOf('rifle', 0, true, 0) > spreadOf('rifle', 1, false, 0) && spreadOf('rifle', 0, false, 14) > spreadOf('rifle', 0, false, 0));
  // Khớp công thức với server
  const sv = require('../../server/src/combat/weapons.js');
  const same = ['rifle', 'pistol', 'shotgun'].every((id) => {
    const a = spreadOf(id, 0.7, true, 3);
    const b = sv.computeSpread(sv.WEAPONS[id], 0.7, true, 3);
    return Math.abs(a - b) < 1e-9;
  });
  check('Công thức tản đạn client = server (với bảng mặc định)', same);
}

console.log('Thống kê khung hình');
{
  const fs2 = new FrameStats(300);
  for (let i = 0; i < 300; i++) fs2.push(i % 100 === 0 ? 50 : 8.33); // 3 khung giật 50ms
  check('FPS trung bình và 1% low phản ánh giật', Math.abs(fs2.avgFps() - 1000 / ((297 * 8.33 + 150) / 300)) < 0.5 && fs2.low1Fps() < 25, `avg=${fs2.avgFps().toFixed(1)} 1%low=${fs2.low1Fps().toFixed(1)}`);
}

console.log('Hướng bề mặt vết đạn');
{
  const { faceNormalAt } = await import('../src/gfx/impact.js');
  const bx = [{ minX: 0, maxX: 2, minY: 0, maxY: 2, minZ: 0, maxZ: 2 }];
  const eq = (a, b) => a && a.every((v, i) => v === b[i]);
  check('Trúng mặt +X', eq(faceNormalAt(bx, [2, 1, 1]), [1, 0, 0]));
  check('Trúng mặt -Z', eq(faceNormalAt(bx, [1, 1, 0]), [0, 0, -1]));
  check('Trúng đỉnh hộp', eq(faceNormalAt(bx, [1, 2, 1]), [0, 1, 0]));
  check('Trúng sàn', eq(faceNormalAt(bx, [9, 0.01, 9]), [0, 1, 0]));
  check('Giữa không trung -> null', faceNormalAt(bx, [9, 5, 9]) === null);
}

console.log(fails ? `\nCORE: ${fails} LỖI` : '\nCORE OK');
process.exit(fails ? 1 : 0);
