'use strict';

// Bảng thông số vũ khí. Server là nguồn sự thật và gửi bảng này cho client khi vào phòng,
// nên chỉ cần sửa ở đây, client tự cập nhật theo.
//
// spread   : độ tản đạn cơ bản (radian) khi đứng yên, ngắm chuẩn
// moveMul  : tản thêm theo tốc độ chạy (chạy hết tốc độ = +moveMul × spread)
// airMul   : tản thêm khi đang nhảy/rơi
// sprayInc : tản thêm cho mỗi phát bắn liên tiếp (tối đa sprayMax phát)
// recoil   : độ giật tâm ngắm do client áp dụng (xem client/src/weapons/recoil.js)
const WEAPONS = {
  rifle: {
    id: 'rifle', slot: 1, damage: 27, headMul: 2.5, interval: 100, auto: true,
    mag: 30, reserve: 90, reloadMs: 2400, pellets: 1, range: 120,
    spread: 0.005, moveMul: 1.8, airMul: 3, sprayInc: 0.0018, sprayMax: 14,
  },
  pistol: {
    id: 'pistol', slot: 2, damage: 24, headMul: 2.5, interval: 180, auto: false,
    mag: 12, reserve: 48, reloadMs: 1700, pellets: 1, range: 100,
    spread: 0.004, moveMul: 2.2, airMul: 3.5, sprayInc: 0.004, sprayMax: 4,
  },
  shotgun: {
    id: 'shotgun', slot: 3, damage: 11, headMul: 1.5, interval: 850, auto: false,
    mag: 6, reserve: 24, reloadMs: 2600, pellets: 8, range: 40,
    spread: 0.05, moveMul: 0.3, airMul: 0.5, sprayInc: 0, sprayMax: 0,
  },
};

function freshAmmo() {
  const a = {};
  for (const w of Object.values(WEAPONS)) a[w.id] = { mag: w.mag, reserve: w.reserve };
  return a;
}

// Độ tản đạn hiện tại: dùng cho cả server (tính tia bắn) và có thể tái sử dụng khi kiểm thử.
function computeSpread(w, moveFactor, airborne, spray) {
  return w.spread * (1 + w.moveMul * moveFactor + (airborne ? w.airMul : 0)) + w.sprayInc * spray;
}

module.exports = { WEAPONS, freshAmmo, computeSpread };
