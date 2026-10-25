# HACHIHI Counter-Strike (MVP) — phiên bản 0.2

> **Có gì mới ở 0.2 (độ mượt, di chuyển, cảm giác bắn):**
> - **Vật lý bước cố định 120 Hz**: chạy y hệt nhau ở 30, 60, 144 hay 240 FPS; hình ảnh nội suy giữa các bước nên không giật.
> - **Gia tốc và phanh riêng** cho mặt đất / trên không (nhả phím dừng trong ~0,1 giây, đang nhảy thì giữ đà).
> - **Server sửa vị trí mượt**: sai lệch nhỏ thì camera trượt về dần thay vì giật.
> - **Giật tâm ngắm thật** (phải kéo chuột xuống bù) theo từng loại súng, tâm ngắm nở ra khi chạy, nhảy, xả đạn; đạn tản theo cùng trạng thái đó.
> - **Hitbox đầu (hình cầu) và thân (hình trụ) tách riêng**; số sát thương nổi, hitmarker vàng khi bắn đầu, vòng cung đỏ chỉ hướng người bắn mình, tiếng bước chân đối thủ.
> - **Nội suy snapshot có timestamp** (30 Hz) nên đối thủ di chuyển liền mạch dù mạng giật.
> - **Bù trễ (lag compensation)**: server tua vị trí đối thủ về lúc bạn thật sự thấy họ (nửa ping + 100 ms, tối đa 250 ms). Server tự đo ping, không tin số client gửi.
> - Chống bay/nhảy giả ở trục dọc; thông số súng do server gửi cho client (sửa một nơi).
> - **Menu Đồ họa** Thấp / Vừa / Cao / Tự động (tự chỉnh độ phân giải theo FPS) và bảng **F3** (FPS, 1% thấp, ms, draw calls, ping, jitter).

FPS 3D lấy cảm hứng từ Counter-Strike, 5 đấu 5, chơi qua mạng.

- **Client**: Three.js đóng gói bằng Electron thành ứng dụng Windows (bản đồ, súng, âm thanh nằm sẵn trong bộ cài).
- **Server**: Node.js + WebSocket, chạy miễn phí trên Render.com. Server là bên quyết định bắn trúng, sát thương, hồi sinh, điểm số.
- **Chi phí**: 0 đồng. Render Free sẽ "ngủ" khi không có người dùng, lần đầu vào phải chờ khoảng 30–60 giây (game có thông báo cho người chơi).

```
hachihi-counter-strike/
├── client/                  Game 3D (Electron)
│   ├── src/
│   │   ├── main.js          Điểm vào, nối mọi thứ lại
│   │   ├── config.js        ĐỊA CHỈ SERVER mặc định, tần suất gửi dữ liệu
│   │   ├── game/            Thế giới 3D, điều khiển nhân vật (bước cố định), va chạm
│   │   ├── weapons/         Súng, giật tâm ngắm (recoil), súng cầm tay (viewmodel)
│   │   ├── multiplayer/     WebSocket, tự thử lại khi server ngủ, nội suy snapshot
│   │   ├── ui/              Menu, phòng chờ, HUD, bảng điểm
│   │   └── audio/           Âm thanh tổng hợp (không cần file)
│   ├── assets/map.json      Bản đồ (bản sao của server/src/map.json)
│   ├── electron/main.js     Cửa sổ Electron
│   └── index.html, style.css
├── server/                  Game server (chạy trên Render)
│   ├── server.js
│   ├── src/{rooms,game,combat,network,security}
│   └── test/smoke.js        Kiểm thử tự động
├── render.yaml              Cấu hình deploy Render
├── run-local.bat            Chạy server + game trên Windows chỉ bằng 1 cú nhấp đúp
├── run-second-client.bat    Mở thêm 1 cửa sổ game để thử 2 người trên cùng máy
└── build-installer.bat      Đóng gói bộ cài .exe
```

---

## 1. Chạy thử trên máy Windows

Cần cài **Node.js 18 trở lên** (bản LTS tại https://nodejs.org).

**Cách nhanh nhất:** nhấp đúp `run-local.bat`.
Lần đầu sẽ tự cài thư viện (tải Electron mất vài phút), sau đó mở một cửa sổ server và một cửa sổ game.

**Hoặc chạy bằng tay**, mở 2 cửa sổ terminal:

```bat
cd server
npm install
npm start
```

```bat
cd client
npm install
npm start
```

### Thử nhiều người trên cùng một máy

1. Cửa sổ game thứ nhất: nhập nickname, nhấn **Tạo phòng**, ghi lại mã PIN 4 số.
2. Nhấp đúp `run-second-client.bat` để mở cửa sổ game thứ hai, nhập nickname khác, nhập PIN, nhấn **Vào phòng**.
3. Ở cửa sổ đầu (chủ phòng) nhấn **Bắt đầu trận**.

Địa chỉ server mặc định là `ws://localhost:8080`, nên không cần sửa gì khi chạy local.
Có thể bắt đầu trận chỉ với 1 người để thử di chuyển và bắn (vòng chỉ kết thúc khi hết giờ vì chưa có đối thủ).

### Thử ngay trên trình duyệt (không cần Electron)

```bat
cd client
npm install
npm run web
```

Mở http://localhost:5173 trong Chrome hoặc Edge.

### Điều khiển

| Phím | Tác dụng |
|---|---|
| W A S D | Di chuyển |
| Chuột | Ngắm; chuột trái: bắn |
| Space | Nhảy (trèo được thùng cao 1,2 m) |
| Shift | Đi chậm |
| R | Thay đạn |
| 1 / 2 / 3 hoặc lăn chuột | Súng trường / Súng lục / Shotgun |
| Tab (giữ) | Bảng điểm |
| Esc | Nhả chuột (nhấp lại để vào trận tiếp) |
| F3 | Bật/tắt bảng FPS, ping, jitter |
| F11 / F12 | Toàn màn hình / công cụ gỡ lỗi (bản Electron) |

Mẹo bắn: súng trường giật lên theo mẫu, nhấp từng loạt ngắn 3–5 viên sẽ chính xác hơn xả liên tục. Đứng yên hoặc đi chậm (Shift) thì đạn chụm nhất; nhảy là tản nhất.

Luật trận: mỗi vòng có 4 giây chuẩn bị (đứng yên), tối đa 120 giây đánh. Hạ hết đối thủ thì thắng vòng; hết giờ thì đội còn nhiều người sống hơn thắng. Đội nào thắng 8 vòng trước thì thắng trận, sau đó cả phòng quay về phòng chờ.

---

## 2. Đưa lên GitHub

```bat
cd hachihi-counter-strike
git init
git add .
git commit -m "HACHIHI Counter-Strike MVP"
git branch -M main
git remote add origin https://github.com/<tên-của-anh>/hachihi-counter-strike.git
git push -u origin main
```

File `.gitignore` đã loại `node_modules`, `client/dist`, `client/release`.

---

## 3. Deploy server lên Render (miễn phí)

1. Vào https://render.com, đăng nhập bằng GitHub.
2. **New +** → **Blueprint** → chọn repo `hachihi-counter-strike`. Render đọc `render.yaml` và tự tạo dịch vụ `hachihi-cs-server` (gói Free, khu vực Singapore).
   - Nếu không dùng Blueprint: **New +** → **Web Service**, chọn repo, đặt *Root Directory* = `server`, *Build Command* = `npm install`, *Start Command* = `npm start`, *Instance Type* = Free.
3. Đợi build xong. Mở `https://<tên-dịch-vụ>.onrender.com/health` — thấy `{"ok":true,...}` là server đã chạy.
4. Địa chỉ WebSocket của game chính là địa chỉ đó nhưng thay `https://` bằng `wss://`:
   `wss://<tên-dịch-vụ>.onrender.com`

Mỗi lần `git push` lên `main`, Render tự deploy lại (`autoDeploy: true`).

> **Lưu ý Render Free:** dịch vụ ngủ sau một thời gian không có lưu lượng, và lần đầu có người vào sẽ mất khoảng 30–60 giây để thức dậy. Client đã tự thử kết nối lại và hiển thị "đang đánh thức server". Không nên dùng ping giả để ép server luôn thức. Trạng thái trận đang nằm trong RAM nên nếu server khởi động lại thì phòng cũ mất; người chơi sẽ được đưa về menu kèm thông báo.

---

## 4. Đóng gói bộ cài Windows (.exe)

1. Mở `client/src/config.js`, đổi dòng:
   ```js
   export const DEFAULT_SERVER = 'wss://<tên-dịch-vụ>.onrender.com';
   ```
2. Nhấp đúp `build-installer.bat` (hoặc `cd client && npm install && npm run dist`).
3. Bộ cài nằm ở `client/release/` (file `HACHIHI Counter-Strike Setup x.y.z.exe`). Gửi file này cho người chơi.

Người chơi vẫn có thể gõ địa chỉ server khác ngay trong menu; địa chỉ được lưu lại cho lần sau.
Muốn có icon riêng: đặt `icon.ico` (256×256) vào `client/build/` rồi build lại.

Windows SmartScreen có thể cảnh báo vì bộ cài chưa được ký số. Chọn *More info* → *Run anyway*. Muốn hết cảnh báo cần mua chứng chỉ ký mã.

**Cập nhật phiên bản:** tăng `version` trong `client/package.json`, build lại và phát hành bộ cài mới. Tự cập nhật (electron-updater) là việc của Bản 5.

---

## 5. Kiểm thử tự động

```bat
cd server
npm test
cd ..\client
npm test
```

- **Server** (`server/test`): luồng phòng/vòng đấu qua WebSocket (`smoke.js`); hitbox đầu/thân, tường chắn đạn, tản đạn theo trạng thái, **bù trễ có đối chứng**, giới hạn 250 ms, chống bay và teleport dọc, server tự đo RTT (`combat.js`).
- **Client** (`client/test/core.mjs`): vật lý giống nhau ở 30/60/144/240 FPS, va chạm, trèo thùng, reconciliation mượt, **mô phỏng 20 phút di chuyển ngẫu nhiên qua bộ kiểm tra thật của server với jitter mạng tới 200 ms mà không bị kéo lại oan lần nào**, nội suy snapshot, giật tâm ngắm, thông số súng khớp server.

## 6. Cách server chống gian lận (và giới hạn hiện tại)

Đã có:
- Sát thương, đạn, thay đạn, tốc độ bắn do **server** tính. Client chỉ gửi "tôi bắn theo hướng này".
- Tia bắn tính ở server, bị tường chặn, phân biệt bắn đầu/thân, shotgun có nhiều viên.
- Vị trí gửi lên bị kiểm tra: không quá tốc độ cho phép (ngân sách di chuyển), không nằm trong tường, không ra ngoài bản đồ; sai thì bị kéo về vị trí cũ.
- Giới hạn tin nhắn mỗi giây, giới hạn kích thước gói, kiểm tra kiểu dữ liệu và độ dài nickname.
- Đóng băng đầu vòng được server cưỡng chế.

Đã bù trễ có giới hạn: vị trí đối thủ được tua tối đa 250 ms theo ping do **server** đo, đạn vẫn bị tường chặn như thường.

Chưa có (để các bản sau):
- Di chuyển vẫn là client gửi vị trí, server kiểm tra (chưa phải server mô phỏng toàn bộ). Người chơi gian lận khéo trong giới hạn tốc độ/độ cao vẫn có thể lách; chuyển sang server-authoritative là bước lớn tiếp theo.
- Chưa có tài khoản, lịch sử trận, bảng xếp hạng (sẽ cần D1 hoặc Supabase).
- Chưa có bot, bản đồ thứ hai.

---

## 7. Tuỳ chỉnh nhanh

| Muốn đổi | Sửa ở đâu |
|---|---|
| Sát thương, băng đạn, tốc độ bắn, độ tản đạn | `server/src/combat/weapons.js` (client tự nhận bảng này khi vào phòng, chỉ cần sửa ở server) |
| Độ giật tâm ngắm từng súng | `client/src/weapons/recoil.js` (mảng `pitch` = lực giật lên mỗi phát, `yaw` = lệch ngang) |
| Cảm giác chạy/nhảy/phanh | `MOVE` trong `client/src/game/controller.js` (nếu đổi tốc độ chạy nhớ giữ `MAX_SPEED` ở server lớn hơn) |
| Hitbox đầu/thân | `BODY_*`, `HEAD_*` trong `server/src/config.js` |
| Độ trễ nội suy đối thủ | `INTERP_DELAY_MS` ở **cả hai** `client/src/config.js` và `server/src/config.js` (phải bằng nhau) |
| Thời gian vòng, số vòng thắng, chỗ giữ phòng khi rớt mạng | `server/src/config.js` (hoặc biến môi trường `HACHIHI_ROUND_MS`, `HACHIHI_ROUNDS_TO_WIN`, ...) |
| Bản đồ (thùng, tường, điểm xuất phát) | `server/src/map.json`, rồi **sao chép sang** `client/assets/map.json` |
| Địa chỉ server mặc định | `client/src/config.js` |
| Số người mỗi đội | `MAX_PER_TEAM` trong `server/src/config.js` và các chỗ ghi "/5" trong `client/src/ui/ui.js` |

Mỗi khối trong `map.json` gồm tâm `p: [x, y, z]`, kích thước `s: [rộng, cao, sâu]` và màu `c`. Server và client dùng chung dữ liệu này cho va chạm nên hai file phải giống hệt nhau.

---

## 8. Xử lý sự cố

| Triệu chứng | Cách xử lý |
|---|---|
| "Không kết nối được server" khi chạy local | Cửa sổ server đã chạy chưa (phải thấy `Server lắng nghe cổng 8080`)? Địa chỉ trong menu phải là `ws://localhost:8080`. |
| Kết nối Render rất lâu lần đầu | Bình thường với gói Free (30–60 giây). Chờ hết bộ đếm; nếu vẫn lỗi, mở `/health` bằng trình duyệt để xem server đã lên chưa. |
| Màn hình đen / FPS thấp | Cập nhật driver card đồ họa. Chọn Đồ họa **Thấp** hoặc **Tự động** ở menu, nhấn **F3** xem FPS và "1% thấp" (số này mới phản ánh độ giật). |
| Không nhìn xoay được bằng chuột | Nhấp vào màn hình "Nhấp chuột để vào trận" để khoá con trỏ. |
| Muốn xem lỗi chi tiết | Nhấn F12 trong game (Electron) để mở console. |
