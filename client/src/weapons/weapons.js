// Thông số vũ khí phía client.
// Nguồn sự thật nằm ở server (server/src/combat/weapons.js). Khi vào phòng, server gửi bảng này
// và applyServerWeapons() ghi đè bản mặc định bên dưới, nên chỉ cần sửa ở server.
// Bản mặc định chỉ để hiển thị trước khi vào phòng.

export const WEAPONS = {
  rifle: { id: 'rifle', slot: 1, name: 'SÚNG TRƯỜNG', interval: 100, auto: true, mag: 30, reloadMs: 2400, spread: 0.005, moveMul: 1.8, airMul: 3, sprayInc: 0.0018, sprayMax: 14 },
  pistol: { id: 'pistol', slot: 2, name: 'SÚNG LỤC', interval: 180, auto: false, mag: 12, reloadMs: 1700, spread: 0.004, moveMul: 2.2, airMul: 3.5, sprayInc: 0.004, sprayMax: 4 },
  shotgun: { id: 'shotgun', slot: 3, name: 'SHOTGUN', interval: 850, auto: false, mag: 6, reloadMs: 2600, spread: 0.05, moveMul: 0.3, airMul: 0.5, sprayInc: 0, sprayMax: 0 },
};

export const WEAPON_ORDER = ['rifle', 'pistol', 'shotgun'];
export const SLOT_TO_ID = { 1: 'rifle', 2: 'pistol', 3: 'shotgun' };

// Giữ nguyên tên hiển thị, lấy mọi thông số khác từ server.
export function applyServerWeapons(table) {
  if (!table || typeof table !== 'object') return;
  for (const id of WEAPON_ORDER) {
    const s = table[id];
    if (!s) continue;
    for (const key of ['interval', 'auto', 'mag', 'reloadMs', 'spread', 'moveMul', 'airMul', 'sprayInc', 'sprayMax', 'slot']) {
      if (s[key] !== undefined) WEAPONS[id][key] = s[key];
    }
  }
}

// Độ tản đạn hiện tại (radian): cùng công thức với server, dùng để vẽ tâm ngắm nở ra.
export function spreadOf(id, moveFactor, airborne, spray) {
  const w = WEAPONS[id];
  return w.spread * (1 + w.moveMul * moveFactor + (airborne ? w.airMul : 0)) + w.sprayInc * spray;
}
