// ============================================================
//  CẤU HÌNH CLIENT
//  Khi đã deploy server lên Render, đổi DEFAULT_SERVER thành
//  địa chỉ của anh, ví dụ: 'wss://hachihi-cs-server.onrender.com'
//  (Người chơi cũng có thể nhập lại ngay trong màn hình menu.)
// ============================================================
export const DEFAULT_SERVER = 'ws://localhost:8080';

// Tần suất gửi vị trí lên server (lần/giây).
export const SEND_HZ = 30;

// Thời gian tối đa chờ server "thức dậy" (Render Free có thể ngủ).
export const CONNECT_TIMEOUT_MS = 90000;

// Vật lý chạy theo bước cố định, không phụ thuộc FPS.
export const PHYSICS_STEP = 1 / 120;

// Hiển thị đối thủ chậm hơn thực tế chừng này để chuyển động mượt dù mạng giật.
// PHẢI bằng INTERP_DELAY_MS ở server/src/config.js (server dùng nó để bù trễ khi tính trúng).
export const INTERP_DELAY_MS = 100;

export const TEAM_NAMES = { A: 'ĐỘI ĐỎ', B: 'ĐỘI XANH' };
export const TEAM_COLORS = { A: '#e8534a', B: '#4a90e8' };
