// 峠のコース（画面に関係しない、ただの計算）。
// コースは点の並びで書き、点と点を直線でつないだ道とする（最後の点は最初の点へつながる）。
// 位置はメートル。画面の上が北で、y は下が正。

export const ROAD_WIDTH = 12; // 道の幅（メートル）

export const COURSE = [
  [0, 0], [0, -90], [5, -140], [25, -170], [55, -175], [75, -155], [70, -125], [90, -90],
  [120, -80], [145, -95], [150, -130], [140, -175], [150, -220], [190, -250], [240, -245],
  [275, -215], [285, -160], [270, -100], [240, -50], [200, -10], [150, 20], [90, 35], [40, 30], [10, 15],
];

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
