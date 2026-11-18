// 描く: 車を真ん中にして、上から見た峠を描く（画面の上が北）。
// 世界の位置（メートル）を、画面の位置（画素）へ直す: 画素 = (メートル - 車の位置) × SCALE + 画面の真ん中

import { CAR } from './car.js';
import { ROAD_WIDTH } from './course.js';

const SCALE = 6; // 1 メートルを何画素で描くか

export function drawWorld(context, course, car) {
  const { width, height } = context.canvas;
  context.fillStyle = '#3f5a33'; // 草
  context.fillRect(0, 0, width, height);

  context.save();
  context.translate(width / 2, height / 2);
  context.scale(SCALE, SCALE);
  context.translate(-car.x, -car.y);

  // 道: 点をつないだ太い線
  context.lineJoin = 'round';
  context.lineCap = 'round';
  context.strokeStyle = '#6b6560';
  context.lineWidth = ROAD_WIDTH;
  tracePath(context, course);
  context.stroke();
  // 道の真ん中の白い点線
  context.strokeStyle = '#efe6da';
  context.lineWidth = 0.3;
  context.setLineDash([3, 3]);
  tracePath(context, course);
  context.stroke();
  context.setLineDash([]);
  // スタートの線
  const [sx, sy] = course[0];
  context.fillStyle = '#ffffff';
  context.fillRect(sx - ROAD_WIDTH / 2, sy - 0.5, ROAD_WIDTH, 1);

  drawCar(context, car);
  context.restore();
}

// 点の並びを、閉じた線として道筋に入れる
function tracePath(context, course) {
  context.beginPath();
  context.moveTo(course[0][0], course[0][1]);
  for (const [x, y] of course) context.lineTo(x, y);
  context.closePath();
}

// 車: 向きの分だけ回した四角と、前の窓
function drawCar(context, car) {
  context.save();
  context.translate(car.x, car.y);
  context.rotate(car.heading);
  context.fillStyle = '#c8582a';
  context.fillRect(-CAR.WIDTH / 2, -CAR.LENGTH / 2, CAR.WIDTH, CAR.LENGTH);
  context.fillStyle = '#1d1a24';
  context.fillRect(-CAR.WIDTH / 2 + 0.2, -CAR.LENGTH / 2 + 0.6, CAR.WIDTH - 0.4, 0.8);
  context.restore();
}
