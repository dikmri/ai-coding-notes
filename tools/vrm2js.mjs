// VRM（0.x）の 3D モデルを、図鑑の項目が読み込める JavaScript のデータ（data/<id>.js）に変える道具。ライブラリは使わない。
//
// 使い方（プロジェクトの直下で）:
//   node tools/vrm2js.mjs <入力.vrm> <id> [--tex 1024] [--quality 0.85] [--title 名前] [--terms 利用条件のURL]
//
// 入れるもの: 形（位置・法線・UV・骨の番号と重み・面）、骨の並び、表情（使う分だけ）、揺れものの設定、材質（MToon の値）、
//   画像（基本の色・影の色・輪郭線の太さ。色と透明度を分けた WebP）。凹凸・発光・サムネイルなど、見た目への影響が小さいものは入れない。
// 数は tools/lib/meshpack.mjs で詰め、1つの base64 の文字列にまとめる。戻す計算は、データを使う項目のコードにある。
// 画像の WebP への変換だけは、手元の Chrome（tools/lib/cdp.mjs、音なし）に頼む。

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as M from './lib/meshpack.mjs';
import * as I from './lib/image.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const [input, id] = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
if (!input || !/^[a-z0-9-]+$/.test(id || '')) { console.error('使い方: node tools/vrm2js.mjs <入力.vrm> <id（英小文字・数字・-）> [--tex 1024]'); process.exit(1); }
const TEX = +opt('tex', 1024), Q = +opt('quality', 0.85);

// ---- glTF のバイナリ（GLB）を開く ----
const buf = readFileSync(input);
let g, bin;
for (let off = 12; off < buf.readUInt32LE(8);) {
  const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4), d = buf.subarray(off + 8, off + 8 + len);
  if (type === 0x4E4F534A) g = JSON.parse(d.toString('utf8')); else if (type === 0x004E4942) bin = d;
  off += 8 + len;
}
const vrm = g.extensions?.VRM;
if (!vrm) throw new Error('VRM 0.x の拡張（extensions.VRM）がありません。VRM 1.0 にはまだ対応していません');
const COMP = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
function accessor(i) {
  const a = g.accessors[i], bv = g.bufferViews[a.bufferView], T = COMP[a.componentType], n = SIZE[a.type];
  const start = (bv.byteOffset || 0) + (a.byteOffset || 0), stride = bv.byteStride || n * T.BYTES_PER_ELEMENT;
  const out = new T(a.count * n);
  for (let k = 0; k < a.count; k++) {
    const src = new T(bin.buffer.slice(bin.byteOffset + start + k * stride, bin.byteOffset + start + k * stride + n * T.BYTES_PER_ELEMENT));
    out.set(src, k * n);
  }
  if (a.sparse) throw new Error('疎な（sparse）アクセサーにはまだ対応していません');
  return out;
}

const pk = new M.Pack();
// ---- 骨の並び（すべてのノード）と、肌を骨に結ぶ情報 ----
const parent = new Array(g.nodes.length).fill(-1);
g.nodes.forEach((n, i) => (n.children || []).forEach((c) => (parent[c] = i)));
const nodes = g.nodes.map((n, i) => ({ name: n.name, parent: parent[i], t: n.translation || [0, 0, 0], r: n.rotation || [0, 0, 0, 1], s: n.scale || [1, 1, 1] }));
const skinKey = (s) => s.joints.join(',');
const skins = [], skinOf = new Map();
for (const s of g.skins || []) {
  if (!skinOf.has(skinKey(s))) { skinOf.set(skinKey(s), skins.length); skins.push({ joints: s.joints, ibm: pk.add(accessor(s.inverseBindMatrices)) }); }
}

// ---- 表情: 使う分の差分だけ ----
const groups = vrm.blendShapeMaster.blendShapeGroups;
const usedMorph = new Map();   // "mesh/index" → 新しい番号
const meshes = [];
g.nodes.forEach((node, ni) => {
  if (node.mesh == null) return;
  const m = g.meshes[node.mesh], p0 = m.primitives[0], at = p0.attributes;
  for (const p of m.primitives) if (p.attributes.POSITION !== at.POSITION) throw new Error(`${m.name}: 部分ごとに頂点が分かれた形にはまだ対応していません`);
  const pos = M.quantizePositions(accessor(at.POSITION)), uv = M.quantizeUV(accessor(at.TEXCOORD_0));
  const count = g.accessors[at.POSITION].count;
  const joints = accessor(at.JOINTS_0);
  if (joints.some((j) => j > 255)) throw new Error(`${m.name}: 骨が 256 本を超えています`);
  const mesh = {
    name: m.name, node: ni, skin: node.skin != null ? skinOf.get(skinKey(g.skins[node.skin])) : -1, count,
    pos: { ...pk.add(pos.q), min: pos.min, max: pos.max }, nrm: pk.add(M.octEncode(accessor(at.NORMAL))),
    uv: { ...pk.add(uv.q), min: uv.min, max: uv.max }, jnt: pk.add(Uint8Array.from(joints)), wgt: pk.add(M.packWeights(accessor(at.WEIGHTS_0))),
    prims: m.primitives.map((p) => { const ix = accessor(p.indices); if (count > 65535) throw new Error('頂点が多すぎます'); return { idx: pk.add(Uint16Array.from(ix)), mat: p.material }; }),
    morphs: [],
  };
  for (const gr of groups) for (const b of gr.binds) {
    if (b.mesh !== node.mesh || usedMorph.has(b.mesh + '/' + b.index)) continue;
    const mp = M.packMorph(accessor(p0.targets[b.index].POSITION), 1e-6);
    usedMorph.set(b.mesh + '/' + b.index, { mesh: meshes.length, k: mesh.morphs.length });
    mesh.morphs.push({ name: m.extras?.targetNames?.[b.index] || String(b.index), idx: pk.add(mp.idx), d: pk.add(mp.d), scale: mp.scale });
  }
  meshes.push(mesh);
});
const expressions = groups.map((gr) => ({
  preset: gr.presetName, name: gr.name,
  binds: gr.binds.map((b) => { const u = usedMorph.get(b.mesh + '/' + b.index); return u && { mesh: u.mesh, morph: u.k, weight: b.weight / 100 }; }).filter(Boolean),
}));

// ---- 材質（MToon の値）と、使う画像 ----
const texUse = new Map();   // テクスチャの番号 → 'color'（透明度あり）・'shade'・'gray'
const MODE = ['opaque', 'cutout', 'blend', 'blend'];
const materials = vrm.materialProperties.map((mp) => {
  const f = mp.floatProperties, v = mp.vectorProperties, t = mp.textureProperties;
  if (t._MainTex != null) texUse.set(t._MainTex, 'color');
  if (t._ShadeTexture != null && !texUse.has(t._ShadeTexture)) texUse.set(t._ShadeTexture, 'shade');
  if (t._OutlineWidthTexture != null && !texUse.has(t._OutlineWidthTexture)) texUse.set(t._OutlineWidthTexture, 'gray');
  return {
    name: mp.name, mode: MODE[f._BlendMode | 0], queue: mp.renderQueue, cull: f._CullMode | 0, cutoff: f._Cutoff ?? 0.5,
    color: v._Color, shadeColor: v._ShadeColor, shadeShift: f._ShadeShift, shadeToony: f._ShadeToony,
    rimColor: v._RimColor, rimFresnel: f._RimFresnelPower, rimLift: f._RimLift,
    outlineWidth: (f._OutlineWidthMode | 0) === 1 ? f._OutlineWidth * 0.01 : 0, outlineColor: v._OutlineColor, outlineMix: f._OutlineLightingMix,
    tex: { main: t._MainTex, shade: t._ShadeTexture, outline: t._OutlineWidthTexture },
  };
});

// ---- 画像: 縮めて WebP に（Chrome の canvas で書き出す） ----
const { openBrowser } = await import('file:///' + join(ROOT, 'tools/lib/cdp.mjs').replace(/\\/g, '/'));
const page = await openBrowser({ width: 400, height: 300, profile: join(ROOT, 'runtime/vrm2js-profile') });
const toWebp = async (img, q) => page.evaluate(`(async () => {
  const b = Uint8ClampedArray.from(atob(${JSON.stringify(Buffer.from(img.data).toString('base64'))}), (ch) => ch.charCodeAt(0));
  const c = new OffscreenCanvas(${img.width}, ${img.height}); c.getContext('2d').putImageData(new ImageData(b, ${img.width}, ${img.height}), 0, 0);
  const blob = await c.convertToBlob({ type: 'image/webp', quality: ${q} });
  const u = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode(...u.subarray(i, i + 32768));
  return 'data:image/webp;base64,' + btoa(s);
})()`);
const images = {};
try {
  for (const [ti, use] of texUse) {
    const src = g.textures[ti].source, bv = g.bufferViews[g.images[src].bufferView];
    let img = I.decodePng(Buffer.from(bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength)));
    const size = use === 'gray' ? Math.min(128, img.width) : Math.min(TEX, img.width);
    if (use === 'color') I.bleed(img, 8);
    img = I.downscale(img, size, size);
    if (use === 'color') {
      I.bleed(img, 4);
      const { color, alpha } = I.split(img);
      const hasAlpha = alpha.data.some((x, i) => i % 4 === 0 && x < 255);
      images[ti] = { color: await toWebp(color, Q), alpha: hasAlpha ? await toWebp(alpha, 0.9) : null };
    } else images[ti] = { color: await toWebp(I.split(img).color, use === 'gray' ? 0.9 : Q), alpha: null };
    console.log(`画像 ${ti}（${use}）: ${size}px → ${((images[ti].color.length + (images[ti].alpha?.length || 0)) / 1024) | 0} KB`);
  }
} finally { await page.close(); }

// ---- 揺れもの・人の骨の対応・作者の情報 ----
const sa = vrm.secondaryAnimation;
const springs = sa.boneGroups.map((b) => ({ comment: b.comment, bones: b.bones, center: b.center, stiffness: b.stiffiness, gravityPower: b.gravityPower, gravityDir: [b.gravityDir.x, b.gravityDir.y, b.gravityDir.z], drag: b.dragForce, hitRadius: b.hitRadius, colliderGroups: b.colliderGroups }));
const colliders = sa.colliderGroups.map((c) => ({ node: c.node, colliders: c.colliders.map((k) => ({ offset: [k.offset.x, k.offset.y, k.offset.z], radius: k.radius })) }));
const humanoid = Object.fromEntries(vrm.humanoid.humanBones.map((h) => [h.bone, h.node]));
const meta = { title: opt('title', vrm.meta.title), author: vrm.meta.author, terms: opt('terms', vrm.meta.otherPermissionUrl || ''), version: vrm.meta.version || '' };

const bytes = pk.bytes();
const data = { meta, nodes, skins, meshes, materials, images, expressions, humanoid, springs, colliders, bin: M.toBase64(bytes) };
mkdirSync(join(ROOT, 'data'), { recursive: true });
const out = join(ROOT, 'data', id + '.js');
const head = `/* 3D モデル「${meta.title}」（作者: ${meta.author}）のデータ。図鑑の項目が、開いたときだけ読み込む。
 * 利用条件: ${meta.terms}
 * 元の VRM を tools/vrm2js.mjs で変換した（数は詰めてあり、使う項目のコードで戻す）。このデータの利用条件は元のモデルと同じ。 */\n`;
writeFileSync(out, head + `(window.DEKIRU_DATA ??= {})[${JSON.stringify(id)}] = ${JSON.stringify(data)};\n`);
console.log(`書き出し: data/${id}.js ・ ${(Buffer.byteLength(readFileSync(out)) / 1048576).toFixed(2)} MB（数のデータ ${(bytes.length / 1048576).toFixed(2)} MB）・ 頂点 ${meshes.reduce((a, m) => a + m.count, 0)} ・ 表情の差分 ${meshes.reduce((a, m) => a + m.morphs.length, 0)} 個`);
process.exit(0);
