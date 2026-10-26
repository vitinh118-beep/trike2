// Tính hướng pháp tuyến bề mặt tại điểm đạn trúng, để đặt vết đạn và tia lửa đúng hướng. Không phụ thuộc Three.js.

// boxes: danh sách AABB { minX,maxX,minY,maxY,minZ,maxZ } (cùng dạng makeBoxes). p: [x,y,z].
// Trả về [nx,ny,nz] hoặc null nếu điểm không nằm trên bề mặt nào.
export function faceNormalAt(boxes, p, eps = 0.06) {
  if (p[1] < eps && p[1] > -eps) return [0, 1, 0];
  let best = null;
  let bestD = eps;
  for (const b of boxes) {
    if (p[0] < b.minX - eps || p[0] > b.maxX + eps || p[1] < b.minY - eps || p[1] > b.maxY + eps || p[2] < b.minZ - eps || p[2] > b.maxZ + eps) continue;
    const c = [
      [Math.abs(p[0] - b.minX), [-1, 0, 0]], [Math.abs(p[0] - b.maxX), [1, 0, 0]],
      [Math.abs(p[1] - b.minY), [0, -1, 0]], [Math.abs(p[1] - b.maxY), [0, 1, 0]],
      [Math.abs(p[2] - b.minZ), [0, 0, -1]], [Math.abs(p[2] - b.maxZ), [0, 0, 1]],
    ];
    for (const [d, n] of c) {
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
  }
  return best;
}
