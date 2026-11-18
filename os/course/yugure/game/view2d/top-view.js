// コースと車を、上から見た 2D の絵で描く（Canvas 2D）。
// 道や木は、ゲームを始めるときに 1 度だけ形（Path2D）を作っておき、毎回それを描く。
// カメラは車を追いかけ、「車の向きを上にする」か「北を上にする」かを選べる。

import { createRandom } from '../core/random.js';
import { locate } from '../sim/course.js';

const COLORS = {
  grass: '#2f4a2b',
  runoff: '#466a3a',
  barrier: '#c9ccd2',
  asphalt: '#3a3c42',
  line: '#f3efe4',
  treeDark: '#1d3320',
  treeLight: '#2f5a33',
};
const BARRIER_GAP_M = 6; // sim/race.js と同じ。道の端からガードレールまで
const EDGE_LINE_M = 0.2; // 道の端の白線の太さ
const CAR_LENGTH_M = 3.7;
const CAR_WIDTH_M = 1.62;

export function createTopView(canvas, course) {
  const context = canvas.getContext('2d');
  const shapes = buildShapes(course);
  let mode = 'follow'; // 'follow'（車の向きが上）か 'north'（北が上）

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(canvas.clientWidth * ratio), height = Math.round(canvas.clientHeight * ratio);
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    return ratio;
  }

  // pose: { x, z, heading, steerAngle, speed, braking }
  function draw(pose) {
    const ratio = resize();
    const { width, height } = canvas;
    const pixelsPerMeter = ratio * Math.max(6, 12 - Math.abs(pose.speed) * 0.15); // 速いほど広く見る（止まると 1 m が 12 画素）
    const rotation = mode === 'follow' ? pose.heading : 0;

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = COLORS.grass;
    context.fillRect(0, 0, width, height);

    // 世界の座標（m）から画面の座標（画素）へ。z は北が上なので、画面では上下を逆にする
    context.translate(width / 2, height * 0.62);
    context.scale(pixelsPerMeter, -pixelsPerMeter);
    context.rotate(rotation);
    context.translate(-pose.x, -pose.z);

    drawWorld(context, shapes);
    drawCar(context, pose);
  }

  return {
    draw,
    toggleMode() { mode = mode === 'follow' ? 'north' : 'follow'; return mode; },
    get mode() { return mode; },
  };
}

/* ---------- 形を作る（1 度だけ） ---------- */

function buildShapes(course) {
  const centerLine = new Path2D();
  const leftBarrier = new Path2D(), rightBarrier = new Path2D();
  course.samples.forEach((p, i) => {
    const method = i === 0 ? 'moveTo' : 'lineTo';
    centerLine[method](p.x, p.z);
    const gap = p.width / 2 + BARRIER_GAP_M;
    leftBarrier[method](p.x - p.rightX * gap, p.z - p.rightZ * gap);
    rightBarrier[method](p.x + p.rightX * gap, p.z + p.rightZ * gap);
  });
  centerLine.closePath(); leftBarrier.closePath(); rightBarrier.closePath();

  const start = course.samples[0];
  const half = start.width / 2;
  const startLine = { x: start.x, z: start.z, rightX: start.rightX, rightZ: start.rightZ, dirX: start.dirX, dirZ: start.dirZ, half };

  return { centerLine, leftBarrier, rightBarrier, width: course.samples[0].width, startLine, trees: placeTrees(course) };
}

// 木を、ガードレールの外にだけ、種の決まった乱数で置く（同じコースなら毎回同じ森になる）
function placeTrees(course) {
  const scenery = course.data.scenery ?? {};
  const random = createRandom(scenery.seed ?? 1);
  const density = scenery.forestDensity ?? 0.6;
  const xs = course.samples.map((p) => p.x), zs = course.samples.map((p) => p.z);
  const margin = 80, step = 7;
  const trees = [];
  for (let x = Math.min(...xs) - margin; x <= Math.max(...xs) + margin; x += step) {
    for (let z = Math.min(...zs) - margin; z <= Math.max(...zs) + margin; z += step) {
      const tx = x + random.range(-3, 3), tz = z + random.range(-3, 3);
      if (random.next() > density) continue;
      const where = locate(course, tx, tz);
      if (Math.abs(where.lateral) < where.width / 2 + BARRIER_GAP_M + 2.5) continue;
      trees.push({ x: tx, z: tz, radius: random.range(2.2, 4.2) });
    }
  }
  return trees;
}

/* ---------- 描く ---------- */

function drawWorld(context, shapes) {
  const roadWidth = shapes.width;
  context.lineJoin = 'round';
  context.lineCap = 'round';

  context.strokeStyle = COLORS.runoff; // ガードレールまでの草地
  context.lineWidth = roadWidth + BARRIER_GAP_M * 2;
  context.stroke(shapes.centerLine);

  context.lineWidth = 0.4;
  context.strokeStyle = COLORS.barrier; // ガードレール
  context.stroke(shapes.leftBarrier);
  context.stroke(shapes.rightBarrier);

  context.lineWidth = roadWidth + EDGE_LINE_M * 2; // 道の端の白線（白を太く描いてから、アスファルトを細く重ねる）
  context.strokeStyle = COLORS.line;
  context.stroke(shapes.centerLine);

  context.lineWidth = roadWidth - EDGE_LINE_M * 2; // アスファルト
  context.strokeStyle = COLORS.asphalt;
  context.stroke(shapes.centerLine);

  context.lineWidth = 0.18; // 中央の白い破線
  context.setLineDash([4, 6]);
  context.strokeStyle = COLORS.line;
  context.stroke(shapes.centerLine);
  context.setLineDash([]);

  drawStartLine(context, shapes.startLine);

  for (const tree of shapes.trees) { // 木（影の濃い円と、明るい円を重ねる）
    context.fillStyle = COLORS.treeDark;
    context.beginPath(); context.arc(tree.x, tree.z, tree.radius, 0, Math.PI * 2); context.fill();
    context.fillStyle = COLORS.treeLight;
    context.beginPath(); context.arc(tree.x - tree.radius * 0.25, tree.z + tree.radius * 0.25, tree.radius * 0.6, 0, Math.PI * 2); context.fill();
  }
}

// スタートの線（白と黒の市松）
function drawStartLine(context, line) {
  const cells = 9, cell = (line.half * 2) / cells, depth = 2;
  for (let i = 0; i < cells; i++) {
    for (let row = 0; row < depth; row++) {
      context.fillStyle = (i + row) % 2 ? '#111' : '#f4f4f4';
      const across = -line.half + cell * (i + 0.5), along = (row - depth / 2 + 0.5) * cell;
      const cx = line.x + line.rightX * across + line.dirX * along, cz = line.z + line.rightZ * across + line.dirZ * along;
      context.save();
      context.translate(cx, cz);
      context.rotate(-Math.atan2(line.dirX, line.dirZ));
      context.fillRect(-cell / 2, -cell / 2, cell, cell);
      context.restore();
    }
  }
}

// 車を、車の位置と向きに合わせて描く。車の前は +z（画面の上）
function drawCar(context, pose) {
  context.save();
  context.translate(pose.x, pose.z);
  context.rotate(-pose.heading); // 方位は右回りが正、Canvas の回転は（上下を逆にしたので）左回りが正
  const halfL = CAR_LENGTH_M / 2, halfW = CAR_WIDTH_M / 2;

  context.fillStyle = 'rgba(0, 0, 0, 0.35)'; // 影
  context.fillRect(-halfW + 0.15, -halfL - 0.15, CAR_WIDTH_M, CAR_LENGTH_M);

  context.fillStyle = '#16181c'; // タイヤ（前輪はハンドルの角度だけ回す）
  for (const [x, z, steer] of [[-halfW, 1.15, true], [halfW, 1.15, true], [-halfW, -1.2, false], [halfW, -1.2, false]]) {
    context.save();
    context.translate(x * 0.92, z);
    if (steer) context.rotate(-pose.steerAngle);
    context.fillRect(-0.12, -0.3, 0.24, 0.6);
    context.restore();
  }

  context.fillStyle = '#d4552f'; // 車体
  roundRect(context, -halfW, -halfL, CAR_WIDTH_M, CAR_LENGTH_M, 0.35);
  context.fill();
  context.fillStyle = '#2a3a4a'; // 前と後ろのガラス、屋根
  roundRect(context, -halfW + 0.18, 0.25, CAR_WIDTH_M - 0.36, 0.75, 0.15); context.fill();
  roundRect(context, -halfW + 0.2, -1.25, CAR_WIDTH_M - 0.4, 0.45, 0.12); context.fill();
  context.fillStyle = '#c24a28';
  roundRect(context, -halfW + 0.2, -0.75, CAR_WIDTH_M - 0.4, 0.95, 0.12); context.fill();
  context.fillStyle = pose.braking ? '#ff3b2f' : '#7a1c14'; // ブレーキランプ
  context.fillRect(-halfW + 0.1, -halfL, 0.35, 0.12);
  context.fillRect(halfW - 0.45, -halfL, 0.35, 0.12);
  context.fillStyle = '#f6e7b0'; // ライト
  context.fillRect(-halfW + 0.12, halfL - 0.12, 0.35, 0.12);
  context.fillRect(halfW - 0.47, halfL - 0.12, 0.35, 0.12);
  context.restore();
}

function roundRect(context, x, y, w, h, r) {
  context.beginPath();
  context.roundRect(x, y, w, h, r);
}
