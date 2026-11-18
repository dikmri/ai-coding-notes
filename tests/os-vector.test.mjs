// 図形エディタの計算（core/vector.mjs）のテスト。
// 図形のデータの形、外接の四角（回転を含む）、当たり判定、つまみでの大きさの変更、回転、方眼、整列と等間隔、
// 重なりの順、まとめる、path の d、ペンの点、SVG の書き出しと読み込み（消毒）、元に戻す。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as V from '../os/js/core/vector.mjs';

const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;
const nearBox = (b, x, y, w, h, e = 1e-6) => near(b.x, x, e) && near(b.y, y, e) && near(b.w, w, e) && near(b.h, h, e);
const rect = (x, y, w, h, extra = {}) => V.makeShape('rect', { x, y, w, h, ...extra });
const strip = (list) => list.map(({ id, children, ...s }) => (children ? { ...s, children: strip(children) } : s));

test('データの形: 新しい紙と図形。図形には id と既定の性質が付く', () => {
  const doc = V.newDoc();
  assert.equal(doc.width, 800); assert.equal(doc.height, 600); assert.equal(doc.background, '#ffffff'); assert.deepEqual(doc.shapes, []);
  const r = rect(10, 20, 30, 40);
  assert.equal(r.type, 'rect'); assert.ok(r.id);
  assert.equal(r.fill, '#ff8ec7'); assert.equal(r.stroke, '#241734'); assert.equal(r.sw, 2); assert.equal(r.opacity, 1); assert.equal(r.rot, 0);
  assert.notEqual(rect(0, 0, 1, 1).id, r.id);
  // 名前は種類ごとの番号。まとめの中の図形も数える
  const g = V.makeShape('g', { children: [V.makeShape('rect', { name: '四角 4' })] });
  assert.equal(V.nextName([rect(0, 0, 1, 1, { name: '四角 1' }), g], 'rect'), '四角 5');
  assert.equal(V.nextName([], 'ellipse'), 'だ円 1');
});

test('行列: かける・当てる・逆・回転・分解', () => {
  const r = V.rotation(90, 10, 10);
  const [x, y] = V.apply(r, 20, 10);
  assert.ok(near(x, 10) && near(y, 20), `${x},${y}`);
  const m = V.mul(V.translate(5, 7), V.scale(2, 3));
  assert.deepEqual(V.apply(m, 1, 1), [7, 10]);
  const back = V.apply(V.invert(m), 7, 10);
  assert.ok(near(back[0], 1) && near(back[1], 1));
  const d = V.decompose(V.mul(V.rotation(30), V.scale(2, 3)));
  assert.ok(near(d.rot, 30) && near(d.sx, 2) && near(d.sy, 3) && near(d.skew, 0), JSON.stringify(d));
});

test('transform の文字を読む: translate・rotate（中心つき）・scale・matrix・並び。読めない物は null', () => {
  assert.deepEqual(V.parseTransform('translate(10 20)'), [1, 0, 0, 1, 10, 20]);
  const r = V.parseTransform('rotate(90, 10, 10)');
  const p = V.apply(r, 20, 10);
  assert.ok(near(p[0], 10) && near(p[1], 20));
  assert.deepEqual(V.parseTransform('scale(2)'), [2, 0, 0, 2, 0, 0]);
  assert.deepEqual(V.parseTransform('matrix(1,0,0,1,3,4) translate(1,1)'), [1, 0, 0, 1, 4, 5]);
  assert.equal(V.parseTransform('url(#x)'), null);
  assert.deepEqual(V.parseTransform(''), V.I);
});

test('外接の四角: 四角・だ円・直線・折れ線・文字・まとめ。回した四角とだ円を含む', () => {
  assert.ok(nearBox(V.bbox(rect(10, 20, 30, 40)), 10, 20, 30, 40));
  // 中心 (25,40) で 90° 回すと、幅と高さが入れ替わる
  assert.ok(nearBox(V.bbox(rect(10, 20, 30, 40, { rot: 90 })), 5, 25, 40, 30), JSON.stringify(V.bbox(rect(10, 20, 30, 40, { rot: 90 }))));
  // 45° の正方形 10×10 は、対角線の長さの四角になる
  const b45 = V.bbox(rect(0, 0, 10, 10, { rot: 45 })), dg = Math.SQRT2 * 10;
  assert.ok(nearBox(b45, 5 - dg / 2, 5 - dg / 2, dg, dg), JSON.stringify(b45));
  const e = V.makeShape('ellipse', { cx: 50, cy: 50, rx: 20, ry: 10, rot: 90 });
  assert.ok(nearBox(V.bbox(e), 40, 30, 20, 40), JSON.stringify(V.bbox(e)));
  assert.ok(nearBox(V.bbox(V.makeShape('line', { x1: 30, y1: 5, x2: 10, y2: 25 })), 10, 5, 20, 20));
  assert.ok(nearBox(V.bbox(V.makeShape('polygon', { points: [[0, 0], [10, 5], [3, 20]] })), 0, 0, 10, 20));
  const t = V.makeShape('text', { x: 10, y: 50, text: 'AB', size: 20 });
  const tb = V.bbox(t, () => 30);
  assert.ok(nearBox(tb, 10, 50 - 0.9 * 20, 30, 1.15 * 20), JSON.stringify(tb));
  const g = V.makeShape('g', { children: [rect(0, 0, 10, 10), rect(20, 30, 10, 10)] });
  assert.ok(nearBox(V.bbox(g), 0, 0, 30, 40));
});

test('外接の四角: ベジェ曲線は制御点ではなく曲線の一番外まで', () => {
  // (0,0) から (100,0) へ、制御点 (0,-100) (100,-100)。一番上は y = -75
  const p = V.makeShape('path', { segs: [{ c: 'M', x: 0, y: 0 }, { c: 'C', x1: 0, y1: -100, x2: 100, y2: -100, x: 100, y: 0 }] });
  const b = V.bbox(p);
  assert.ok(nearBox(b, 0, -75, 100, 75, 1e-6), JSON.stringify(b));
});

test('当たり判定: 塗った四角は中、塗らない四角は線の近くだけ。回した四角は回した形で', () => {
  const r = rect(0, 0, 100, 50);
  assert.ok(V.hitShape(r, 50, 25, 0));
  assert.ok(!V.hitShape(r, 150, 25, 0));
  const hollow = rect(0, 0, 100, 50, { fill: 'none', sw: 4 });
  assert.ok(!V.hitShape(hollow, 50, 25, 1));
  assert.ok(V.hitShape(hollow, 1, 25, 0));
  assert.ok(V.hitShape(hollow, 101.5, 25, 0), '線の太さの半分の外まで当たる');
  const rr = rect(0, 0, 100, 10, { rot: 90 }); // 中心 (50,5)、縦長になる
  assert.ok(V.hitShape(rr, 50, 40, 0));
  assert.ok(!V.hitShape(rr, 90, 5, 0));
});

test('当たり判定: 直線は太さを含む。だ円・多角形・文字・閉じた path', () => {
  const l = V.makeShape('line', { x1: 0, y1: 0, x2: 100, y2: 0, sw: 10 });
  assert.ok(V.hitShape(l, 50, 4.9, 0));
  assert.ok(!V.hitShape(l, 50, 6, 0));
  assert.ok(V.hitShape(l, 50, 6, 1.5), '許す幅を足すと当たる');
  const e = V.makeShape('ellipse', { cx: 0, cy: 0, rx: 50, ry: 20 });
  assert.ok(V.hitShape(e, 40, 0, 0) && !V.hitShape(e, 40, 18, 0));
  const tri = V.makeShape('polygon', { points: [[0, 0], [100, 0], [0, 100]] });
  assert.ok(V.hitShape(tri, 10, 10, 0) && !V.hitShape(tri, 80, 80, 0));
  const t = V.makeShape('text', { x: 0, y: 20, text: 'あ', size: 20 });
  assert.ok(V.hitShape(t, 10, 10, 0, () => 20) && !V.hitShape(t, 30, 10, 0, () => 20));
  const p = V.makeShape('path', { segs: V.parsePathD('M0 0 L100 0 L100 100 Z') });
  assert.ok(V.hitShape(p, 90, 10, 0) && !V.hitShape(p, 10, 90, 0));
});

test('選ぶ: 一番上の図形を返す。隠した図形と固定した図形は選ばない。囲んで選ぶのは全体が入る物だけ', () => {
  const list = [rect(0, 0, 100, 100), rect(50, 50, 100, 100), rect(60, 60, 10, 10, { hidden: true }), rect(70, 70, 10, 10, { locked: true })];
  assert.equal(V.pick(list, 75, 75, 0), 1);
  assert.equal(V.pick(list, 10, 10, 0), 0);
  assert.equal(V.pick(list, 500, 500, 0), -1);
  assert.deepEqual(V.inMarquee(list, { x: -10, y: -10, w: 120, h: 120 }), [0]);
  assert.deepEqual(V.inMarquee(list, { x: 120, y: -10, w: 10, h: 10 }), []);
});

test('つまみで大きさの変更: 反対の辺は動かない。Shift で縦横の比を保つ。小さくても 1 より小さくならない', () => {
  const b = { x: 10, y: 10, w: 100, h: 50 };
  assert.deepEqual(V.resizeBox(b, 'se', 20, 10), { x: 10, y: 10, w: 120, h: 60 });
  assert.deepEqual(V.resizeBox(b, 'nw', 20, 10), { x: 30, y: 20, w: 80, h: 40 });
  assert.deepEqual(V.resizeBox(b, 'e', 50, 999), { x: 10, y: 10, w: 150, h: 50 });
  assert.deepEqual(V.resizeBox(b, 'n', 999, -10), { x: 10, y: 0, w: 100, h: 60 });
  const k = V.resizeBox(b, 'se', 100, 0, { keepRatio: true });
  assert.ok(near(k.w / k.h, 2) && near(k.w, 200), JSON.stringify(k));
  const s = V.resizeBox(b, 'e', -500, 0);
  assert.ok(s.w >= 1 && s.x === 10, JSON.stringify(s));
});

test('大きさの変更を図形に当てる: 四角・直線・まとめは箱に合わせて伸びる', () => {
  const from = { x: 0, y: 0, w: 100, h: 100 }, to = { x: 10, y: 20, w: 200, h: 50 };
  const A = V.boxMap(from, to);
  assert.ok(nearBox(V.bbox(V.mapShape(rect(0, 0, 100, 100), A)), 10, 20, 200, 50));
  const l = V.mapShape(V.makeShape('line', { x1: 0, y1: 0, x2: 100, y2: 100 }), A);
  assert.deepEqual([l.x1, l.y1, l.x2, l.y2], [10, 20, 210, 70]);
  const g = V.mapShape(V.makeShape('g', { children: [rect(0, 0, 50, 50), rect(50, 50, 50, 50)] }), A);
  assert.ok(nearBox(V.bbox(g), 10, 20, 200, 50));
  // 回した四角を1つだけ選んで、自分の向きのまま伸ばす。反対の角は動かない
  const r = rect(0, 0, 100, 50, { rot: 30 });
  const fixed = V.apply(V.shapeMatrix(r), 0, 0); // 左上（se のつまみの反対）
  const r2 = V.resizeLocal(r, { x: 0, y: 0, w: 160, h: 80 });
  const fixed2 = V.apply(V.shapeMatrix(r2), r2.x, r2.y);
  assert.ok(near(r2.w, 160) && near(r2.h, 80) && near(r2.rot, 30));
  assert.ok(near(fixed[0], fixed2[0]) && near(fixed[1], fixed2[1]), `${fixed} → ${fixed2}`);
});

test('回す: 四角は rot が増え、中心が回る。点の図形は点そのものを回す', () => {
  const r = V.rotateShape(rect(0, 0, 20, 20), 90, 0, 0); // 中心 (10,10) が (-10,10) へ
  assert.equal(r.rot, 90);
  const c = V.center(r);
  assert.ok(near(c[0], -10) && near(c[1], 10), JSON.stringify(c));
  const l = V.rotateShape(V.makeShape('line', { x1: 0, y1: 0, x2: 10, y2: 0 }), 90, 0, 0);
  assert.ok(near(l.x2, 0) && near(l.y2, 10) && l.rot === 0);
  const g = V.rotateShape(V.makeShape('g', { children: [rect(0, 0, 20, 20)] }), 180, 0, 0);
  assert.ok(nearBox(V.bbox(g), -20, -20, 20, 20), JSON.stringify(V.bbox(g)));
  // 回転の角度は -180〜180 にそろえる
  assert.equal(V.rotateShape(rect(0, 0, 1, 1, { rot: 170 }), 20, 0.5, 0.5).rot, -170);
});

test('反転: 中心の線で左右・上下を写す。回した四角は向きも反対になる', () => {
  const f = V.flipShape(rect(0, 0, 20, 10, { rot: 30 }), 'h', 50, 0);
  assert.ok(nearBox(V.localBox(f), 80, 0, 20, 10), JSON.stringify(V.localBox(f)));
  assert.equal(f.rot, -30);
  const l = V.flipShape(V.makeShape('line', { x1: 0, y1: 0, x2: 10, y2: 5 }), 'v', 0, 10);
  assert.deepEqual([l.x1, l.y1, l.x2, l.y2], [0, 20, 10, 15]);
  const g = V.flipShape(V.makeShape('g', { children: [rect(0, 0, 10, 10)] }), 'h', 0, 0);
  assert.ok(nearBox(V.bbox(g), -10, 0, 10, 10));
});

test('方眼に合わせる: 値と、動かす量（箱の左上が方眼に乗る）', () => {
  assert.equal(V.snap(13, 10), 10); assert.equal(V.snap(15, 10), 20); assert.equal(V.snap(-6, 10), -10);
  assert.deepEqual(V.snapDelta({ x: 3, y: 7, w: 10, h: 10 }, 11, 0, 10), [7, 3]);
});

test('整列: 選んだ物の外接の四角に合わせる。1つだけなら紙に合わせる', () => {
  const a = rect(0, 0, 10, 10), b = rect(50, 30, 20, 20), c = rect(20, 80, 40, 10);
  const ids = [a.id, b.id, c.id];
  const left = V.align([a, b, c], ids, 'left');
  assert.deepEqual(left.map((s) => V.bbox(s).x), [0, 0, 0]);
  const right = V.align([a, b, c], ids, 'right');
  assert.deepEqual(right.map((s) => V.bbox(s).x + V.bbox(s).w), [70, 70, 70]);
  const mid = V.align([a, b, c], ids, 'vcenter');
  assert.deepEqual(mid.map((s) => V.bbox(s).y + V.bbox(s).h / 2), [45, 45, 45]);
  const page = V.align([a, b], [b.id], 'hcenter', { x: 0, y: 0, w: 800, h: 600 });
  assert.equal(V.bbox(page[1]).x, 390); assert.equal(page[0], a, '選んでいない図形はそのまま');
});

test('等間隔: 両端は動かさず、間の隙間を同じにする。2つ以下は何もしない', () => {
  const a = rect(0, 0, 10, 10), b = rect(15, 0, 30, 10), c = rect(90, 0, 10, 10);
  const out = V.distribute([c, a, b], [a.id, b.id, c.id], 'h');
  const bx = out.map((s) => V.bbox(s)).sort((p, q) => p.x - q.x);
  assert.deepEqual(bx.map((q) => q.x), [0, 35, 90]);
  assert.equal(bx[1].x - (bx[0].x + bx[0].w), bx[2].x - (bx[1].x + bx[1].w));
  const two = [a, c];
  assert.deepEqual(V.distribute(two, [a.id, c.id], 'h'), two);
});

test('重なりの順: 最前面・前へ・後ろへ・最背面。選んだ物どうしの順は保つ', () => {
  const s = ['a', 'b', 'c', 'd'].map((n) => ({ ...rect(0, 0, 1, 1), id: n }));
  const ids = (l) => l.map((x) => x.id).join('');
  assert.equal(ids(V.reorder(s, ['a', 'b'], 'top')), 'cdab');
  assert.equal(ids(V.reorder(s, ['c', 'd'], 'bottom')), 'cdab');
  assert.equal(ids(V.reorder(s, ['b'], 'up')), 'acbd');
  assert.equal(ids(V.reorder(s, ['d'], 'up')), 'abcd');
  assert.equal(ids(V.reorder(s, ['c'], 'down')), 'acbd');
  assert.equal(ids(V.reorder(s, ['a'], 'down')), 'abcd');
});

test('まとめると解く: 一番上の選んだ物の位置にまとめが入り、解くと元の並びに戻る', () => {
  const s = ['a', 'b', 'c', 'd'].map((n) => ({ ...rect(0, 0, 1, 1), id: n }));
  const { shapes, group } = V.groupShapes(s, ['a', 'c'], 'まとめ 1');
  assert.deepEqual(shapes.map((x) => x.id), ['b', group.id, 'd']);
  assert.deepEqual(group.children.map((x) => x.id), ['a', 'c']);
  const un = V.ungroupShapes(shapes, group.id);
  assert.deepEqual(un.shapes.map((x) => x.id), ['b', 'a', 'c', 'd']);
  assert.deepEqual(un.ids, ['a', 'c']);
  // まとめの不透明度は、解くと中の図形に掛ける
  const g = V.makeShape('g', { opacity: 0.5, children: [rect(0, 0, 1, 1, { opacity: 0.5 })] });
  assert.equal(V.ungroupShapes([g], g.id).shapes[0].opacity, 0.25);
});

test('複製: 新しい id になり、少しずれる。まとめの中も新しい id', () => {
  const g = V.makeShape('g', { children: [rect(0, 0, 10, 10)] });
  const c = V.cloneShape(g, 10, 10);
  assert.notEqual(c.id, g.id); assert.notEqual(c.children[0].id, g.children[0].id);
  assert.ok(nearBox(V.bbox(c), 10, 10, 10, 10));
});

test('path の d: 組み立てと読み取り。相対・H・V・S・Q・A も絶対の M L C Z にそろえる', () => {
  const segs = [{ c: 'M', x: 0, y: 0 }, { c: 'L', x: 10, y: 0 }, { c: 'C', x1: 10, y1: 5, x2: 5, y2: 10, x: 0, y: 10 }, { c: 'Z' }];
  assert.equal(V.pathD(segs), 'M0 0 L10 0 C10 5 5 10 0 10 Z');
  assert.deepEqual(V.parsePathD('M0 0 L10 0 C10 5 5 10 0 10 Z'), segs);
  assert.deepEqual(V.parsePathD('m10 10 h5 v5 l-5 0 z'), [{ c: 'M', x: 10, y: 10 }, { c: 'L', x: 15, y: 10 }, { c: 'L', x: 15, y: 15 }, { c: 'L', x: 10, y: 15 }, { c: 'Z' }]);
  // M の後ろに続く数は L として読む
  assert.deepEqual(V.parsePathD('M0,0 10,10'), [{ c: 'M', x: 0, y: 0 }, { c: 'L', x: 10, y: 10 }]);
  const q = V.parsePathD('M0 0 Q 10 10 20 0');
  assert.equal(q[1].c, 'C'); assert.ok(near(q[1].x1, 20 / 3) && near(q[1].y1, 20 / 3) && near(q[1].x, 20));
  const sm = V.parsePathD('M0 0 C 0 10 10 10 10 0 S 20 -10 20 0');
  assert.ok(near(sm[2].x1, 10) && near(sm[2].y1, -10), '前の制御点を折り返す');
  const arc = V.parsePathD('M0 0 A 10 10 0 0 1 20 0');
  assert.ok(arc.length >= 2 && arc.slice(1).every((s) => s.c === 'C'));
  const last = arc[arc.length - 1];
  assert.ok(near(last.x, 20) && near(last.y, 0));
  assert.ok(near(V.bbox(V.makeShape('path', { segs: arc })).y, -10, 0.05), '半円の一番上が y=-10 の近く');
  assert.deepEqual(V.parsePathD('M 0 0 L 1e1 -.5'), [{ c: 'M', x: 0, y: 0 }, { c: 'L', x: 10, y: -0.5 }]);
  assert.deepEqual(V.parsePathD('foo'), []);
});

test('ペンの点から path を作る: 角は直線、取っ手のある点は曲線。閉じると Z', () => {
  const corner = V.penSegs([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], false);
  assert.deepEqual(corner.map((s) => s.c), ['M', 'L', 'L']);
  const curve = V.penSegs([{ x: 0, y: 0, hx: 0, hy: -10 }, { x: 20, y: 0, hx: 0, hy: 10 }], true);
  assert.deepEqual(curve.map((s) => s.c), ['M', 'C', 'C', 'Z']);
  // 出ていく取っ手は点＋(hx,hy)、入ってくる取っ手はその反対側
  assert.deepEqual([curve[1].x1, curve[1].y1, curve[1].x2, curve[1].y2], [0, -10, 20, -10]);
});

test('色を読む: #rgb・#rrggbb・rgb()・名前・none。url() や currentColor は読まない', () => {
  assert.equal(V.parseColor('#F0a'), '#ff00aa');
  assert.equal(V.parseColor('#12345678'), '#123456');
  assert.equal(V.parseColor('rgb(255, 0, 10)'), '#ff000a');
  assert.equal(V.parseColor('Red'), '#ff0000');
  assert.equal(V.parseColor('none'), 'none');
  assert.equal(V.parseColor('url(http://example.com/x)'), null);
  assert.equal(V.parseColor('currentColor'), null);
  assert.equal(V.parseColor('expression(alert(1))'), null);
});

test('SVG の書き出し: 紙の色、名前、隠す・固定、回転、文字のエスケープ', () => {
  const doc = V.newDoc({ width: 400, height: 300 });
  doc.shapes = [rect(10, 10, 50, 40, { rot: 30, name: '屋根 "A"' }), V.makeShape('text', { x: 5, y: 50, text: 'a<b>&"c"', size: 24, hidden: true, locked: true })];
  const svg = V.toSVG(doc);
  assert.match(svg, /^<\?xml version="1.0" encoding="UTF-8"\?>\n<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="400" height="300" viewBox="0 0 400 300"/);
  assert.match(svg, /<rect x="0" y="0" width="400" height="300" fill="#ffffff" data-fos-paper="1"\/>/);
  assert.match(svg, /transform="rotate\(30 35 30\)"/);
  assert.match(svg, /data-fos-name="屋根 &quot;A&quot;"/);
  assert.match(svg, />a&lt;b&gt;&amp;"c"<\/text>/);
  assert.match(svg, /display="none"/); assert.match(svg, /data-fos-locked="1"/);
  assert.doesNotMatch(svg, /NaN|undefined/);
});

test('SVG の書き出しと読み込みで同じ図形に戻る（全部の種類とまとめ）', () => {
  const doc = V.newDoc({ width: 640, height: 480, background: 'none' });
  doc.shapes = [
    rect(10, 20, 100, 50, { rx: 8, rot: 33.5, name: '四角 1', fill: '#6bf2e3', stroke: 'none', sw: 0, opacity: 0.5 }),
    V.makeShape('ellipse', { cx: 300, cy: 200, rx: 60, ry: 30, rot: -20, name: 'だ円 1' }),
    V.makeShape('line', { x1: 0, y1: 0, x2: 100, y2: 40, name: '直線 1', fill: 'none', sw: 6 }),
    V.makeShape('polyline', { points: [[0, 0], [10, 20], [30, 5]], name: '折れ線 1', fill: 'none' }),
    V.makeShape('polygon', { points: [[100, 100], [150, 120], [120, 160]], name: '多角形 1', hidden: true }),
    V.makeShape('path', { segs: V.parsePathD('M10 10 C20 0 40 0 50 10 L50 50 Z'), name: 'パス 1', locked: true }),
    V.makeShape('text', { x: 40, y: 400, text: 'こんにちは <世界>', size: 36, font: V.FONTS[1].css, rot: 15, name: '文字 1' }),
    V.makeShape('g', { name: 'まとめ 1', opacity: 0.8, children: [rect(500, 300, 20, 20, { name: '四角 2' }), V.makeShape('ellipse', { cx: 560, cy: 310, rx: 10, ry: 10, name: 'だ円 2' })] }),
  ];
  const svg = V.toSVG(doc);
  const { doc: back, dropped } = V.parseSVG(svg);
  assert.deepEqual(dropped, []);
  assert.equal(back.width, 640); assert.equal(back.height, 480); assert.equal(back.background, 'none');
  assert.deepEqual(strip(back.shapes), strip(doc.shapes));
  // もう一度書き出すと同じ文字になる
  assert.equal(V.toSVG(back), svg);
});

test('SVG の読み込み: 消毒。script・on〜の属性・外への参照・foreignObject・image・use・a は落とす', () => {
  const evil = `<?xml version="1.0"?>
<!DOCTYPE svg [ <!ENTITY boom "BOOM"> ]>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="200" height="100" onload="alert(1)">
  <script>alert('x')</script>
  <script type="module"><![CDATA[ fetch('http://example.com') ]]></script>
  <rect x="10" y="10" width="50" height="40" fill="red" onclick="alert(2)" style="stroke:url(http://example.com/a.svg#p);stroke-width:3" href="http://example.com"/>
  <image href="http://example.com/x.png" x="0" y="0" width="10" height="10"/>
  <use xlink:href="#r"/>
  <foreignObject width="10" height="10"><iframe src="http://example.com"></iframe></foreignObject>
  <a href="javascript:alert(3)"><circle cx="5" cy="5" r="5"/></a>
  <style>rect { fill: url(http://example.com/x) }</style>
  <text x="0" y="90" onmouseover="alert(4)">&boom;&lt;ok&gt;</text>
  <circle cx="150" cy="50" r="20" fill="url(#grad)" />
</svg>`;
  const { doc, dropped } = V.parseSVG(evil);
  assert.equal(doc.width, 200);
  assert.deepEqual(doc.shapes.map((s) => s.type), ['rect', 'text', 'ellipse']);
  const [r, t, c] = doc.shapes;
  assert.equal(r.fill, '#ff0000'); assert.equal(r.stroke, 'none', 'url() の線は読まない'); assert.equal(r.sw, 3);
  assert.equal(t.text, '&boom;<ok>', '自分で定義した実体は展開しない');
  assert.equal(c.fill, '#000000', '読めない塗りは SVG の既定の黒');
  for (const name of ['script', 'image', 'use', 'foreignObject', 'a', 'style']) assert.ok(dropped.includes(name), name);
  const out = V.toSVG(doc);
  assert.doesNotMatch(out, /script|onload|onclick|onmouseover|example\.com|javascript|href|foreignObject|iframe/i);
});

test('SVG の読み込み: 親の性質を受け継ぎ、g の transform を中の図形に移す。viewBox の原点をずらす', () => {
  const src = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="100 100 300 200" width="600" height="400">
    <g fill="#00ff00" stroke="blue" stroke-width="4" transform="translate(10 20)">
      <rect x="100" y="100" width="10" height="10"/>
      <g transform="rotate(90 105 105)"><rect x="100" y="100" width="20" height="10" style="fill:#123456"/></g>
      <path d="M100 100 L110 100" fill="none"/>
    </g>
    <circle cx="200" cy="200" r="5" transform="scale(2)"/>
    <text x="100" y="150" font-size="20px">A<tspan>B</tspan></text>
  </svg>`;
  const { doc } = V.parseSVG(src);
  assert.equal(doc.width, 300); assert.equal(doc.height, 200);
  const [g, circle, text] = doc.shapes;
  assert.equal(g.type, 'g');
  const [r1, inner, p] = g.children;
  assert.deepEqual([r1.x, r1.y, r1.fill, r1.stroke, r1.sw], [10, 20, '#00ff00', '#0000ff', 4]);
  assert.equal(inner.type, 'g');
  const r2 = inner.children[0];
  assert.equal(r2.fill, '#123456'); assert.ok(near(r2.rot, 90));
  assert.ok(nearBox(V.bbox(r2), 10, 20, 10, 20, 1e-6), JSON.stringify(V.bbox(r2)));
  assert.deepEqual(p.segs, [{ c: 'M', x: 10, y: 20 }, { c: 'L', x: 20, y: 20 }]);
  assert.equal(circle.type, 'ellipse');
  assert.deepEqual([circle.cx, circle.cy, circle.rx, circle.ry], [300, 300, 10, 10]);
  assert.equal(text.text, 'AB'); assert.equal(text.size, 20); assert.deepEqual([text.x, text.y], [0, 50]);
});

test('SVG の読み込み: SVG でない物や大きすぎる物は、分かる言葉で断る', () => {
  assert.throws(() => V.parseSVG('<html><body></body></html>'), /SVG/);
  assert.throws(() => V.parseSVG('hello'), /SVG/);
  assert.throws(() => V.parseSVG('<svg>' + '<g>'.repeat(300) + '</g>'.repeat(300) + '</svg>'), /深/);
});

test('元に戻す・やり直し: 新しい操作でやり直しの列は消える。上限を超えた古い物は捨てる', () => {
  const h = new V.History(3);
  assert.equal(h.undo('x'), null);
  h.push('a'); h.push('b');
  assert.equal(h.undo('c'), 'b');
  assert.equal(h.undo('b'), 'a');
  assert.equal(h.redo('a'), 'b');
  h.push('z');
  assert.equal(h.redo('q'), null);
  for (const s of ['1', '2', '3', '4']) h.push(s);
  assert.equal(h.undo('5'), '4'); assert.equal(h.undo('4'), '3'); assert.equal(h.undo('3'), '2'); assert.equal(h.undo('2'), null);
});
