// 「夕暮れ峠」のコースの点を、直線と曲がりの並びから作る設計用の道具（開発用。講座の中身には入れない。後でコースの工房に置き換える）。
//   node tools/yugure-design-course.mjs
// 2 本の直線の長さを、コースが閉じるように自動で解く。結果を course.json に書き、形の確かめの数値を出す。
import { writeFileSync } from 'node:fs';
import { buildCourse } from '../os/course/yugure/game/sim/course.js';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../os/course/yugure/game/data/courses/yugure-touge.json', import.meta.url));
const deg = (d) => (d * Math.PI) / 180;

// ['S', 長さ] 直線、['A', 半径, 角度（右が正）, 名前] 曲がり。'L1' と 'L2' は長さを自動で解く直線
const plan = [
  ['S', 'L1'],                       // ふもとのホームストレート（北へ）
  ['A', 55, 90, '一の曲がり'],         // 東へ
  ['S', 100],
  ['A', 70, -45, '杉並みの左'],
  ['A', 60, 45, '杉並みの右'],
  ['S', 80],
  ['A', 17, -170, '地蔵の折り返し'],   // 左のヘアピン。北へ折り返して西へ
  ['S', 110],
  ['A', 19, 170, '滝見の折り返し'],   // 右のヘアピン。さらに北へ折り返して東へ
  ['S', 80],
  ['A', 130, 80, '見晴らし'],          // 尾根の速い右。南へ向きを変える
  ['S', 150],
  ['A', 65, -40, 'もみじ坂'],
  ['A', 85, 50, '石垣'],
  ['S', 60],
  ['A', 50, 90, '茶屋前'],             // 西へ
  ['S', 40],
  ['A', 160, -22, '川沿い'],           // 川に沿うゆるい S 字
  ['A', 160, 44, '赤い橋'],
  ['A', 160, -22, '堤'],
  ['S', 'L2'],                        // ふもとの直線（西へ）
  ['A', 60, 90, '最終の曲がり'],       // 北へ。ホームストレートに戻る
];

function trace(plan, l1, l2) {
  let x = 0, z = 0, h = 0; // h は方位（北 0、右回りが正）
  const path = [{ x, z, name: 'スタート' }];
  for (const [kind, a, b, name] of plan) {
    if (kind === 'S') {
      const len = a === 'L1' ? l1 : a === 'L2' ? l2 : a;
      const steps = Math.max(1, Math.ceil(len));
      for (let i = 1; i <= steps; i++) path.push({ x: x + (Math.sin(h) * len * i) / steps, z: z + (Math.cos(h) * len * i) / steps, kind, len });
      x += Math.sin(h) * len; z += Math.cos(h) * len;
    } else {
      const r = a, turn = deg(b), dir = Math.sign(turn);
      // 曲がりの中心は、進む向きの右（右に曲がるとき）か左
      const cx = x + Math.cos(h) * r * dir, cz = z - Math.sin(h) * r * dir;
      const steps = Math.max(2, Math.ceil((Math.abs(turn) * r) / 1));
      for (let i = 1; i <= steps; i++) {
        const hh = h + (turn * i) / steps;
        path.push({ x: cx - Math.cos(hh) * r * dir, z: cz + Math.sin(hh) * r * dir, kind, name });
      }
      h += turn;
      x = path[path.length - 1].x; z = path[path.length - 1].z;
    }
  }
  return { x, z, h, path };
}

// 2 本の直線の長さを、終わりの点が始めの点に戻るように解く（直線の長さに対して位置は一次式なので、2 回の試しから解ける）
const base = trace(plan, 0, 0);
const e1 = trace(plan, 1, 0), e2 = trace(plan, 0, 1);
const a11 = e1.x - base.x, a21 = e1.z - base.z, a12 = e2.x - base.x, a22 = e2.z - base.z;
const det = a11 * a22 - a12 * a21;
const l1 = (-base.x * a22 + base.z * a12) / det;
const l2 = (-base.z * a11 + base.x * a21) / det;
const done = trace(plan, l1, l2);
console.log('直線 L1', l1.toFixed(1), 'm / L2', l2.toFixed(1), 'm / 終わりのずれ', Math.hypot(done.x, done.z).toFixed(3), 'm / 向きの合計', (done.h * 180 / Math.PI).toFixed(1), '°');
if (l1 < 80 || l2 < 60) throw new Error('直線が短すぎる、または負');

// 道のり（設計の始まりから）を、たどった線の各点に書き込む
let dist = 0;
done.path.forEach((p, i) => { if (i) dist += Math.hypot(p.x - done.path[i - 1].x, p.z - done.path[i - 1].z); p.d = dist; });
const endOf = (name) => Math.max(...done.path.filter((p) => p.name === name).map((p) => p.d));
const startOf = (name) => Math.min(...done.path.filter((p) => p.name === name).map((p) => p.d));
const L2_MID = startOf('最終の曲がり') - l2 / 2;
// 高さ: 一の曲がりを出てから登り、滝見の折り返しで 38 m、見晴らしで 44 m。下ってふもとの直線の中ほどで 0 m に戻る
const ease = (t) => t * t * (3 - 2 * t);
const ramp = (d, d0, d1, h0, h1) => h0 + (h1 - h0) * ease(Math.min(1, Math.max(0, (d - d0) / (d1 - d0))));
const heightAt = (d) => {
  if (d < endOf('一の曲がり')) return 0;
  if (d < endOf('滝見の折り返し')) return ramp(d, endOf('一の曲がり'), endOf('滝見の折り返し'), 0, 38);
  if (d < endOf('見晴らし')) return ramp(d, endOf('滝見の折り返し'), endOf('見晴らし'), 38, 44);
  if (d < L2_MID) return ramp(d, endOf('見晴らし'), L2_MID, 44, 0);
  return 0;
};

// 約 45 m ごとに点を取る（曲がりは 16 m ごと）
let pts = [];
let acc = 0;
for (let i = 1; i < done.path.length; i++) {
  const p = done.path[i], q = done.path[i - 1];
  acc += Math.hypot(p.x - q.x, p.z - q.z);
  const spacing = p.kind === 'A' ? 16 : 45;
  if (acc >= spacing) { pts.push(p); acc = 0; }
}
if (Math.hypot(pts.at(-1).x, pts.at(-1).z) < 20) pts.pop();
pts.unshift(done.path[0]);
// スタートの線は、ホームストレートの中ほど（北へ 110 m）に置く。点の並びを、そこから始まるように回す
let k = 0;
pts.forEach((p, i) => { if (Math.hypot(p.x, p.z - 110) < Math.hypot(pts[k].x, pts[k].z - 110)) k = i; });
pts = pts.slice(k).concat(pts.slice(0, k));
const points = pts.map((p) => ({ x: +p.x.toFixed(1), z: +p.z.toFixed(1), height: +heightAt(p.d).toFixed(1), width: 9 }));
// ヘアピンは少し広くする
for (const p of points) {
  const near = done.path.some((q) => /折り返し/.test(q.name || '') && Math.hypot(q.x - p.x, q.z - p.z) < 25);
  if (near) p.width = 10.5;
}

const data = {
  name: '夕暮れ峠',
  description: 'ふもとの古いピットから山を登り、二つの折り返しを抜けて尾根へ。夕日を正面に見て下り、ふもとへ戻る周回のコース。',
  defaultWidth: 9,
  points,
  scenery: { seed: 1118, sunElevationDeg: 6, sunAzimuthDeg: 250, fogDensity: 0.6, forestDensity: 0.7 },
};
writeFileSync(OUT, JSON.stringify(data, null, 2).replace(/\{\n\s+"x": ([^,]+),\n\s+"z": ([^,]+),\n\s+"height": ([^,]+),\n\s+"width": ([^\n]+)\n\s+\}/g, '{ "x": $1, "z": $2, "height": $3, "width": $4 }') + '\n');

// 確かめ
const course = buildCourse(data);
let minClear = Infinity, where = null, maxSlope = 0, minRadius = Infinity;
const S = course.samples;
for (let i = 0; i < S.length; i += 2) {
  for (let j = 0; j < S.length; j += 2) {
    const ds = Math.abs(S[i].s - S[j].s), gap = Math.min(ds, course.length - ds);
    if (gap < 80) continue;
    const d = Math.hypot(S[i].x - S[j].x, S[i].z - S[j].z);
    if (d < minClear) { minClear = d; where = [S[i].s, S[j].s]; }
  }
}
for (let i = 0; i < S.length; i++) {
  const a = S[i], b = S[(i + 1) % S.length], c = S[(i + 5) % S.length];
  maxSlope = Math.max(maxSlope, Math.abs(b.height - a.height) / course.spacing);
  const dh = Math.atan2(Math.sin(c.heading - a.heading), Math.cos(c.heading - a.heading));
  if (Math.abs(dh) > 1e-4) minRadius = Math.min(minRadius, (course.spacing * 5) / Math.abs(dh));
}
console.log(`長さ ${course.length.toFixed(0)} m / 点 ${points.length} 個 / 高低差 ${Math.max(...points.map((p) => p.height)) - Math.min(...points.map((p) => p.height))} m / 最大の勾配 ${(maxSlope * 100).toFixed(1)} % / 最小の半径 ${minRadius.toFixed(1)} m / 離れた区間の最小の間隔 ${minClear.toFixed(1)} m（s=${where?.map((v) => v.toFixed(0))}）`);
console.log('東西', Math.min(...points.map((p) => p.x)).toFixed(0), '〜', Math.max(...points.map((p) => p.x)).toFixed(0), ' 南北', Math.min(...points.map((p) => p.z)).toFixed(0), '〜', Math.max(...points.map((p) => p.z)).toFixed(0));
console.log('最初の点', JSON.stringify(points[0]), 's=0 の向き', (course.samples[0].heading * 180 / Math.PI).toFixed(2), '°');
