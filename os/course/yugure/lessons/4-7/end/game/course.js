// 峠のコース（画面に関係しない、ただの計算）。
// コースは点の並びで書き、点と点を直線でつないだ道とする（最後の点は最初の点へつながる）。
// 位置はメートル。画面の上が北で、y は下が正。

export const ROAD_WIDTH = 12; // 道の幅（メートル）

export const COURSE = [
  [0, 0], [0, -90], [5, -140], [25, -170], [55, -175], [75, -155], [70, -125], [90, -90],
  [120, -80], [145, -95], [150, -130], [140, -175], [150, -220], [190, -250], [240, -245],
  [275, -215], [285, -160], [270, -100], [240, -50], [200, -10], [150, 20], [90, 35], [40, 30], [10, 15],
];

// 点 (px, py) から、線分 a-b までのいちばん近い距離と、線分の上の位置（0 は a、1 は b）
export function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  let t = lengthSquared > 0 ? ((px - ax) * dx + (py - ay) * dy) / lengthSquared : 0;
  t = Math.min(Math.max(t, 0), 1);
  const cx = ax + dx * t, cy = ay + dy * t;
  return { distance: Math.hypot(px - cx, py - cy), t };
}

// コースの中で、点にいちばん近い所。index は線分の番号（index 番目の点から次の点へ）
export function nearestOnCourse(course, x, y) {
  let best = { index: 0, distance: Infinity, t: 0 };
  for (let i = 0; i < course.length; i++) {
    const [ax, ay] = course[i];
    const [bx, by] = course[(i + 1) % course.length];
    const hit = distanceToSegment(x, y, ax, ay, bx, by);
    if (hit.distance < best.distance) best = { index: i, distance: hit.distance, t: hit.t };
  }
  return best;
}

// 道の上にいるか（道の真ん中の線から、道の幅の半分より近いか）
export function isOnRoad(course, x, y) {
  return nearestOnCourse(course, x, y).distance <= ROAD_WIDTH / 2;
}

// 進み具合: 線分の番号 + 線分の上の位置（0 から点の数まで、1 周で点の数だけ増える）
export function progressOf(course, x, y) {
  const hit = nearestOnCourse(course, x, y);
  return hit.index + hit.t;
}

// 1 周の長さ（メートル）
export function courseLength(course) {
  let total = 0;
  for (let i = 0; i < course.length; i++) {
    const [ax, ay] = course[i];
    const [bx, by] = course[(i + 1) % course.length];
    total += Math.hypot(bx - ax, by - ay);
  }
  return total;
}
