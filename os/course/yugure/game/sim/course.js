// コースのデータ（点の輪）から、走るための形を作る。
//
// データの点は { x, z, height, width }（単位 m）。最後の点の次は最初の点につながる。
// 点と点の間は「求心型の Catmull-Rom 曲線」でなめらかにつなぐ。点の間隔がばらばらでも、輪や尖りができにくい作り方。
// できた形は、同じ間隔（約 2 m）で並べた「サンプル」の配列で持つ。サンプルの s は、スタートからの道のり（m）。

const DEFAULT_SPACING_M = 2;
const POINTS_PER_SEGMENT = 24; // 曲線を長さを測るために細かく刻む数
const SEARCH_WINDOW = 60; // locate で、前回の場所の前後何個のサンプルを探すか

/* ---------- 曲線 ---------- */

const mix = (a, b, t) => a.map((value, i) => value + (b[i] - value) * t);

// 点 a から b への「つなぎの時間」。距離の平方根を使うのが求心型
const nextKnot = (knot, a, b) => knot + Math.sqrt(Math.max(Math.hypot(b[0] - a[0], b[1] - a[1]), 1e-6));

// p1 から p2 までの曲線の上で、u（0〜1）の位置の値。p0 と p3 は前後の点。
// 値は [x, z, height, width] の配列で、4 つとも同じ曲線でなめらかにする
export function catmullRom(p0, p1, p2, p3, u) {
  const t0 = 0;
  const t1 = nextKnot(t0, p0, p1);
  const t2 = nextKnot(t1, p1, p2);
  const t3 = nextKnot(t2, p2, p3);
  const t = t1 + (t2 - t1) * u;
  const a1 = mix(p0, p1, (t - t0) / (t1 - t0));
  const a2 = mix(p1, p2, (t - t1) / (t2 - t1));
  const a3 = mix(p2, p3, (t - t2) / (t3 - t2));
  const b1 = mix(a1, a2, (t - t0) / (t2 - t0));
  const b2 = mix(a2, a3, (t - t1) / (t3 - t1));
  return mix(b1, b2, (t - t1) / (t2 - t1));
}

/* ---------- コースを作る ---------- */

export function buildCourse(data, spacing = DEFAULT_SPACING_M) {
  const defaultWidth = data.defaultWidth ?? 9;
  const points = data.points.map((p) => [p.x, p.z, p.height ?? 0, p.width ?? defaultWidth]);
  const dense = densePolyline(points);
  const { lengths, total } = cumulativeLengths(dense);
  const count = Math.max(8, Math.round(total / spacing));
  const step = total / count;

  const samples = [];
  let segment = 0;
  for (let k = 0; k < count; k++) {
    const s = k * step;
    while (lengths[segment + 1] < s) segment++;
    const a = dense[segment];
    const b = dense[(segment + 1) % dense.length];
    const t = (s - lengths[segment]) / (lengths[segment + 1] - lengths[segment]);
    const [x, z, height, width] = mix(a, b, t);
    samples.push({ s, x, z, height, width });
  }
  for (let k = 0; k < count; k++) {
    const prev = samples[(k - 1 + count) % count];
    const next = samples[(k + 1) % count];
    setDirection(samples[k], next.x - prev.x, next.z - prev.z);
  }
  return { name: data.name ?? '', samples, length: total, spacing: step, data };
}

// 曲線を細かい折れ線にする（最後は最初の点に戻る）
function densePolyline(points) {
  const n = points.length;
  const dense = [];
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n], p1 = points[i], p2 = points[(i + 1) % n], p3 = points[(i + 2) % n];
    for (let j = 0; j < POINTS_PER_SEGMENT; j++) dense.push(catmullRom(p0, p1, p2, p3, j / POINTS_PER_SEGMENT));
  }
  return dense;
}

// 折れ線の各点までの道のり。lengths[i] は点 i まで、最後の lengths[n] は 1 周の長さ
function cumulativeLengths(dense) {
  const lengths = [0];
  for (let i = 0; i < dense.length; i++) {
    const a = dense[i], b = dense[(i + 1) % dense.length];
    lengths.push(lengths[i] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  return { lengths, total: lengths[dense.length] };
}

// 進む向き（dir）と、進む向きから見た右（right）と、方位（heading）を書き込む
function setDirection(sample, dx, dz) {
  const len = Math.hypot(dx, dz) || 1;
  sample.dirX = dx / len;
  sample.dirZ = dz / len;
  sample.rightX = sample.dirZ;
  sample.rightZ = -sample.dirX;
  sample.heading = Math.atan2(sample.dirX, sample.dirZ);
}

/* ---------- コースの上の場所 ---------- */

// 道のりを 0 以上、1 周の長さ未満にそろえる
export const wrapDistance = (course, s) => ((s % course.length) + course.length) % course.length;

// a から b まで、前向きに何 m 先か（-半周〜+半周）
export function distanceAhead(course, a, b) {
  const half = course.length / 2;
  return wrapDistance(course, b - a + half) - half;
}

// 道のり s の場所の、中心の位置・向き・幅・高さ
export function sampleAt(course, s) {
  const { samples, spacing } = course;
  const f = wrapDistance(course, s) / spacing;
  const i = Math.floor(f) % samples.length;
  const a = samples[i], b = samples[(i + 1) % samples.length];
  const t = f - Math.floor(f);
  const result = {
    s: wrapDistance(course, s),
    x: a.x + (b.x - a.x) * t,
    z: a.z + (b.z - a.z) * t,
    height: a.height + (b.height - a.height) * t,
    width: a.width + (b.width - a.width) * t,
  };
  setDirection(result, a.dirX + (b.dirX - a.dirX) * t, a.dirZ + (b.dirZ - a.dirZ) * t);
  return result;
}

// 点 (x, z) がコースのどこにいるか。
// 返す値: s（道のり）、lateral（中心から右へ何 m。左は負）、width、height、index（いちばん近いサンプルの番号）。
// hintIndex に前回の index を渡すと、その近くだけを探すので速い
export function locate(course, x, z, hintIndex = -1) {
  let index = nearestSample(course, x, z, hintIndex);
  const nearDistance = Math.hypot(course.samples[index].x - x, course.samples[index].z - z);
  if (hintIndex >= 0 && nearDistance > course.samples[index].width * 2) index = nearestSample(course, x, z, -1);
  return projectNear(course, index, x, z);
}

function nearestSample(course, x, z, hintIndex) {
  const { samples } = course;
  const n = samples.length;
  const searchAll = hintIndex < 0;
  const first = searchAll ? 0 : hintIndex - SEARCH_WINDOW;
  const last = searchAll ? n - 1 : hintIndex + SEARCH_WINDOW;
  let best = 0, bestDistance = Infinity;
  for (let k = first; k <= last; k++) {
    const i = ((k % n) + n) % n;
    const d = (samples[i].x - x) ** 2 + (samples[i].z - z) ** 2;
    if (d < bestDistance) { bestDistance = d; best = i; }
  }
  return best;
}

// いちばん近いサンプルの前後の線分に、点を垂直に下ろして、正確な道のりと横のずれを求める
function projectNear(course, index, x, z) {
  const { samples } = course;
  const n = samples.length;
  let best = null;
  for (const start of [(index - 1 + n) % n, index]) {
    const a = samples[start], b = samples[(start + 1) % n];
    const ex = b.x - a.x, ez = b.z - a.z;
    const t = Math.min(1, Math.max(0, ((x - a.x) * ex + (z - a.z) * ez) / (ex * ex + ez * ez)));
    const px = a.x + ex * t, pz = a.z + ez * t;
    const d = (x - px) ** 2 + (z - pz) ** 2;
    if (!best || d < best.d) best = { d, start, t };
  }
  const here = sampleAt(course, (best.start + best.t) * course.spacing);
  return {
    index,
    s: here.s,
    lateral: (x - here.x) * here.rightX + (z - here.z) * here.rightZ,
    width: here.width,
    height: here.height,
    heading: here.heading,
  };
}
