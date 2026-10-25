'use strict';

// Đọc số từ biến môi trường, nếu không có thì dùng giá trị mặc định.
const num = (env, def) => {
  const v = Number(process.env[env]);
  return Number.isFinite(v) && v > 0 ? v : def;
};

module.exports = {
  PORT: num('PORT', 8080),
  TICK_MS: num('HACHIHI_TICK_MS', 33), // ~30 lần/giây

  MAX_ROOMS: 40,
  MAX_CONNECTIONS: 200,
  MAX_PER_TEAM: 5,
  MAX_MSG_PER_SEC: 200,

  ROUNDS_TO_WIN: num('HACHIHI_ROUNDS_TO_WIN', 8),
  FREEZE_MS: num('HACHIHI_FREEZE_MS', 4000),
  ROUND_MS: num('HACHIHI_ROUND_MS', 120000),
  ROUND_END_MS: num('HACHIHI_ROUND_END_MS', 5000),
  MATCH_END_MS: num('HACHIHI_MATCH_END_MS', 10000),
  RECONNECT_GRACE_MS: num('HACHIHI_GRACE_MS', 30000),

  EYE_HEIGHT: 1.6,
  PLAYER_HEIGHT: 1.8,
  PLAYER_RADIUS: 0.4, // dùng cho va chạm với tường

  // Hitbox khi bị bắn: thân là hình trụ, đầu là hình cầu riêng.
  BODY_RADIUS: 0.36,
  BODY_HEIGHT: 1.48,
  HEAD_CENTER: 1.62,
  HEAD_RADIUS: 0.2,

  MAX_HP: 100,

  // Kiểm tra di chuyển
  MAX_SPEED: 7.5, // m/s ngang, ngân sách tối đa server cho phép (chạy thật là 5.6)
  MAX_Y: 4,
  BOUNDS: 29.6,
  RISE_RATE: 9, // m/s: tốc độ tối đa được tích luỹ cho việc leo/nhảy (nhảy thật ~7.6)
  RISE_CAP: 1.5,
  RISE_MAX: 2.6, // tổng độ cao tối đa được leo thêm khi chưa chạm mặt đỡ (nhảy 1.31 + vài bậc hỗ trợ)
  FALL_RATE: 40, // m/s: rơi tối đa (rơi thật tối đa ~40)
  FALL_CAP: 3,

  // Bù trễ
  HISTORY_MS: 1000,
  LAG_COMP_MAX_MS: 250,
  INTERP_DELAY_MS: 100, // phải bằng độ trễ nội suy ở client (client/src/config.js)
  PING_EVERY_MS: 1000,
};
