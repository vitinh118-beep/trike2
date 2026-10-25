'use strict';
// Kiểm thử nhanh toàn bộ luồng: tạo phòng -> vào phòng -> bắt đầu -> bắn hạ -> vòng mới -> vào lại sau mất kết nối.
process.env.HACHIHI_FREEZE_MS = '300';
process.env.HACHIHI_ROUND_END_MS = '600';
process.env.HACHIHI_ROUNDS_TO_WIN = '3';

const assert = require('assert');
const WebSocket = require('ws');
const { start } = require('../server');

const app = start(0);
const guard = setTimeout(() => { console.error('TIMEOUT: kiểm thử quá lâu'); process.exit(1); }, 25000);

function connect(port) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const msgs = [];
  const waiters = [];
  ws.on('message', (d) => {
    const m = JSON.parse(d.toString());
    msgs.push(m);
    for (const w of [...waiters]) {
      if (w.pred(m)) {
        waiters.splice(waiters.indexOf(w), 1);
        w.resolve(m);
      }
    }
  });
  return {
    ws, msgs,
    open: new Promise((r) => ws.on('open', r)),
    send: (o) => ws.send(JSON.stringify(o)),
    mark: () => msgs.length,
    wait(pred, from = 0, ms = 4000) {
      const found = msgs.slice(from).find(pred);
      if (found) return Promise.resolve(found);
      return new Promise((resolve, reject) => {
        const w = { pred, resolve };
        waiters.push(w);
        setTimeout(() => reject(new Error('Hết thời gian chờ tin nhắn')), ms);
      });
    },
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (name) => console.log('  ✓', name);

(async () => {
  await new Promise((r) => app.server.once('listening', r));
  const port = app.server.address().port;

  // 1. Tạo phòng + vào phòng
  const A = connect(port);
  const B = connect(port);
  await Promise.all([A.open, B.open]);

  A.send({ t: 'create', name: 'Alice' });
  const joinedA = await A.wait((m) => m.t === 'joined');
  assert.ok(/^\d{4}$/.test(joinedA.pin));
  ok('Tạo phòng, nhận mã PIN ' + joinedA.pin);

  B.send({ t: 'join', name: 'Bob', pin: '0000' });
  const bad = await B.wait((m) => m.t === 'err');
  assert.ok(bad.msg);
  ok('PIN sai bị từ chối');

  B.send({ t: 'join', name: 'Bob', pin: joinedA.pin });
  const joinedB = await B.wait((m) => m.t === 'joined');
  const info = await A.wait((m) => m.t === 'room' && m.players.length === 2);
  const teams = info.players.map((p) => p.team).sort().join('');
  assert.strictEqual(teams, 'AB');
  ok('Hai người được chia vào hai đội khác nhau');

  // 2. Người không phải chủ phòng không bắt đầu được
  let mk = B.mark();
  B.send({ t: 'start' });
  await B.wait((m) => m.t === 'err', mk);
  ok('Chỉ chủ phòng được bắt đầu');

  // 3. Bắt đầu trận
  A.send({ t: 'start' });
  await A.wait((m) => m.t === 'spawn');
  await B.wait((m) => m.t === 'spawn');
  await A.wait((m) => m.t === 'round' && m.phase === 'live');
  ok('Trận bắt đầu: spawn -> freeze -> live');

  // 4. Chống teleport
  mk = B.mark();
  B.send({ t: 'move', x: 25, y: 0, z: 0, yaw: 0, pitch: 0 });
  await B.wait((m) => m.t === 'correct', mk);
  ok('Server từ chối dịch chuyển tức thời');

  // 5. Bắn hạ trong khu spawn trống
  const room = app.manager.get(joinedA.pin);
  const pa = room.players.get(joinedA.id);
  const pb = room.players.get(joinedB.id);
  pa.x = 0; pa.y = 0; pa.z = 26; pa.speed = 0;
  pb.x = 0; pb.y = 0; pb.z = 23; pb.speed = 0;
  pb.hp = 100; pb.alive = true;
  pa.history.length = 0; pb.history.length = 0; // đặt vị trí bằng tay nên bỏ lịch sử cũ (bù trễ)
  const pitch = Math.atan2(1.0 - 1.6, 3);

  mk = A.mark();
  for (let i = 0; i < 4; i++) {
    A.send({ t: 'shoot', x: 0, y: 0, z: 26, yaw: 0, pitch });
    await sleep(125);
  }
  const kill = await A.wait((m) => m.t === 'kill', mk);
  assert.strictEqual(kill.k, joinedA.id);
  assert.strictEqual(kill.v, joinedB.id);
  const roundEnd = await A.wait((m) => m.t === 'round' && m.phase === 'roundEnd', mk);
  assert.strictEqual(roundEnd.winner, pa.team);
  assert.strictEqual(roundEnd.scoreA + roundEnd.scoreB, 1);
  ok('Bắn trúng, hạ đối thủ, kết thúc vòng, cộng điểm');

  const self = [...A.msgs.slice(mk)].reverse().find((m) => m.t === 'self');
  assert.strictEqual(self.ammo.rifle[0], 26);
  ok('Đạn giảm đúng (30 -> 26)');

  // 6. Tường chắn đạn: bắn xuyên tường ngoài bản đồ không trúng ai
  // (kiểm tra bằng tia trực tiếp)
  const { rayBoxes } = require('../src/game/map');
  assert.ok(rayBoxes([0, 1.6, 26], [0, 0, -1], 100) < 100);
  ok('Tia bắn bị vật cản chặn lại');

  // 7. Vòng mới tự bắt đầu
  mk = A.mark();
  const r2 = await A.wait((m) => m.t === 'round' && m.phase === 'freeze' && m.round === 2, mk);
  assert.strictEqual(r2.round, 2);
  ok('Vòng 2 tự bắt đầu');

  // 8. Mất kết nối và vào lại bằng token
  B.ws.close();
  await sleep(150);
  const B2 = connect(port);
  await B2.open;
  B2.send({ t: 'rejoin', pin: joinedA.pin, token: joinedB.token });
  const again = await B2.wait((m) => m.t === 'joined');
  assert.strictEqual(again.id, joinedB.id);
  ok('Vào lại phòng sau khi mất kết nối');

  // 9. Spam không làm sập server
  for (let i = 0; i < 500; i++) A.send({ t: 'ping', ts: i });
  A.send({ t: 'ping', ts: 'x' });
  await sleep(200);
  ok('Server chịu được spam tin nhắn');

  console.log('\nSMOKE OK');
  clearTimeout(guard);
  app.stop();
  process.exit(0);
})().catch((e) => {
  console.error('\nSMOKE FAIL:', e);
  process.exit(1);
});
