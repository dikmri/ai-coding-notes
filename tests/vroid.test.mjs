// 3D のキャラの項目（3d-vroid-toon）の core（データを戻す計算・骨の行列）と、変換したデータ（data/vroid-b.js）のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import * as M from '../tools/lib/meshpack.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sb = { console }; sb.window = sb; vm.createContext(sb);
vm.runInContext(readFileSync(join(ROOT, 'js/registry.js'), 'utf8'), sb);
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
for (const [, f] of html.matchAll(/<script src="(entries\/[^"]+)"/g)) vm.runInContext(readFileSync(join(ROOT, f), 'utf8'), sb, { filename: f });
const e = sb.dekiru.entries.find((x) => x.id === '3d-vroid-toon');
const ctx = vm.createContext({});
vm.runInContext(sb.dekiru.src(e.core) + '\n;globalThis.__x = { view, dequant, octDecode, morphInto, worldMatrices, mul, qaxis };', ctx);
const C = ctx.__x;

test('項目の戻し方は、変換の道具の詰め方とちょうど逆になる（位置・UV・法線）', () => {
  const p = Float32Array.from({ length: 300 }, () => Math.random() * 3 - 1);
  const q = M.quantizePositions(p);
  assert.deepEqual([...C.dequant(q.q, q.min, q.max, 3)], [...M.dequantizePositions(q.q, q.min, q.max)]);
  const uv = Float32Array.from({ length: 200 }, () => Math.random());
  const u = M.quantizeUV(uv);
  assert.deepEqual([...C.dequant(u.q, u.min, u.max, 2)], [...M.dequantizeUV(u.q, u.min, u.max)]);
  const n = Float32Array.from({ length: 300 }, () => Math.random() * 2 - 1);
  const enc = M.octEncode(n);
  assert.deepEqual([...C.octDecode(enc)], [...M.octDecode(enc)]);
});

test('表情: 元の位置に、差分を重みの分だけ足す（重み 0 の差分は足さない）', () => {
  const base = Float32Array.from([0, 0, 0, 1, 1, 1]);
  const m = { idx: Uint16Array.from([1]), d: Int16Array.from([100, -200, 0]), scale: 0.01 };
  const out = C.morphInto(new Float32Array(6), base, [{ ...m, w: 0.5 }, { ...m, w: 0 }]);
  assert.deepEqual([...out].map((v) => +v.toFixed(5)), [0, 0, 0, 1.5, 0, 1]);
});

const D = (() => { const s = { window: {} }; s.window = s; vm.createContext(s); vm.runInContext(readFileSync(join(ROOT, 'data/vroid-b.js'), 'utf8'), s); return s.DEKIRU_DATA['vroid-b']; })();
const bytes = new Uint8Array(Buffer.from(D.bin, 'base64'));

test('変換したデータ: 動かしていない姿勢では、どの骨も「世界の行列 × 結び付けの逆行列」が単位行列になる', () => {
  const world = C.worldMatrices(D.nodes, new Map()), ibm = C.view(bytes, D.skins[0].ibm);
  D.skins[0].joints.forEach((n, j) => {
    const m = C.mul(world[n], ibm.subarray(j * 16, j * 16 + 16));
    for (let i = 0; i < 16; i++) assert.ok(Math.abs(m[i] - (i % 5 === 0 ? 1 : 0)) < 1e-3, `${D.nodes[n].name}[${i}] = ${m[i]}`);
  });
});

test('変換したデータ: まばたきと口の形（あいうえお）の表情が、実在する差分を指している', () => {
  for (const preset of ['blink', 'a', 'i', 'u', 'e', 'o']) {
    const ex = D.expressions.find((x) => x.preset === preset);
    assert.ok(ex && ex.binds.length, preset);
    for (const b of ex.binds) assert.ok(D.meshes[b.mesh]?.morphs[b.morph], `${preset}: ${b.mesh}/${b.morph}`);
  }
});

test('変換したデータ: 面の番号は頂点の数を超えず、骨の番号は骨の数を超えない', () => {
  for (const m of D.meshes) {
    for (const p of m.prims) assert.ok(C.view(bytes, p.idx).every((i) => i < m.count), m.name);
    assert.ok(C.view(bytes, m.jnt).every((j) => j < D.skins[m.skin].joints.length), m.name);
  }
});
