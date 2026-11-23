// パッシブのツリーを、手で書いた表（kanenaki/shared/data/tree-table.mjs）と種から作る台本。
// 使い方: node kanenaki/tools/gen-tree.mjs   → kanenaki/shared/data/tree.mjs を書き出す
// 種で決まるもの: 道と枝の小さいマスの修正の選び方、小さいマスの座標の小さなずれ。
// 座標の単位は「ツリーの画面の点」。マスどうしは 40 以上離す（tests/mmo-data-tree.test.mjs が確かめる）。
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as T from '../shared/data/tree-table.mjs';
import { statNames } from '../shared/data/stats.mjs';
import { logLine } from '../shared/schema.mjs';

export const TREE_SEED = 20261121;

const RING_R = 160;                        // 中心の輪の半径
const SPOKE_R = [240, 320, 400, 480, 560]; // 道の 5 マスの半径（3 マス目が目玉）
const GATE_R = 650;                        // 門の半径
const BRANCH_DEG = 38;                     // 左右の枝の開き
const FIRST = 95;                          // 門から枝の 1 マス目まで
const STEP = 75;                           // 枝のマスの間隔
const CLUSTER_R = 62;                      // 目玉を囲む輪の半径
const JITTER = 5;                          // 小さいマスのずれの最大
const CENTER_PATH_R = [250, 340, 430];     // 中心から要への道

// 種から決まる乱数（0 以上 1 未満）
function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rad = (d) => (d * Math.PI) / 180;
const polar = (r, deg) => [r * Math.cos(rad(deg)), r * Math.sin(rad(deg))];

export function buildTree(seed = TREE_SEED) {
  const rand = makeRng(seed);
  const nodes = {};
  const add = (id, x, y, kind, { cls, name, mods, rule, ruleDesc } = {}) => {
    if (nodes[id]) throw new Error(`マスの id が重複: ${id}`);
    const n = { id, x: Math.round(x), y: Math.round(y), kind };
    if (cls) n.cls = cls;
    n.name = name;
    n.mods = mods ?? [];
    if (rule) { n.rule = rule; n.ruleDesc = ruleDesc; }
    n.links = [];
    nodes[id] = n;
    return id;
  };
  const link = (a, b) => { nodes[a].links.push(b); nodes[b].links.push(a); };
  const jit = () => (rand() * 2 - 1) * JITTER;
  const small = (pool) => {
    const mod = pool[Math.floor(rand() * pool.length)];
    return { name: statNames[mod.key], mods: [mod] };
  };

  // 中心: 冒険者の出発点と 12 マスの輪
  add('c0', 0, 0, 'start', { cls: 'adventurer', name: '冒険者の出発点', mods: [] });
  T.ringMods.forEach((mod, k) => {
    const [x, y] = polar(RING_R, -90 + 30 * k);
    add(`r${k}`, x, y, 'small', { name: statNames[mod.key], mods: [mod] });
  });
  for (let k = 0; k < 12; k++) link(`r${k}`, `r${(k + 1) % 12}`);
  T.regions.forEach((_, i) => link('c0', `r${2 * i}`));

  // 目玉を囲む 5 マスの輪。入口は門の側（0 番）、外側の 2 番から先へ続く
  const cluster = (prefix, [cx, cy], dir, cls, notable, from) => {
    const ring = [];
    for (let k = 0; k < 5; k++) {
      const [dx, dy] = polar(CLUSTER_R, dir + 180 + 72 * k);
      ring.push(add(`${prefix}_${k}`, cx + dx, cy + dy, 'small', { cls, name: statNames[notable.small.key], mods: [notable.small] }));
    }
    for (let k = 0; k < 5; k++) link(ring[k], ring[(k + 1) % 5]);
    link(from, ring[0]);
    const n = add(`${prefix}n`, cx, cy, 'notable', { cls, name: notable.name, mods: notable.mods });
    link(n, ring[2]);
    link(n, ring[3]);
    return ring[2];
  };

  // 6 方向: 道、門、3 本の枝、要
  for (const [i, { cls, angle }] of T.regions.entries()) {
    const pool = T.smallPools[cls];
    let prev = `r${2 * i}`;
    SPOKE_R.forEach((r, j) => {
      const [x, y] = polar(r, angle);
      const id = `${cls}_s${j + 1}`;
      if (j === 2) add(id, x, y, 'notable', { cls, ...T.spokeNotables[cls] });
      else add(id, x + jit(), y + jit(), 'small', { cls, ...small(pool) });
      link(prev, id);
      prev = id;
    });
    const [gx, gy] = polar(GATE_R, angle);
    const gate = add(`${cls}_g`, gx, gy, 'gate', { cls, ...T.gates[cls] });
    link(prev, gate);

    const dirs = { L: angle + BRANCH_DEG, M: angle, R: angle - BRANCH_DEG };
    ['L', 'M', 'R'].forEach((b, bi) => {
      const dir = dirs[b];
      const at = (d) => [gx + d * Math.cos(rad(dir)), gy + d * Math.sin(rad(dir))];
      const chain = (tag, start, from) => {
        let p = from;
        for (let j = 0; j < 3; j++) {
          const [x, y] = at(start + STEP * j);
          const id = add(`${cls}_${b}${tag}${j + 1}`, x + jit(), y + jit(), 'small', { cls, ...small(pool) });
          link(p, id);
          p = id;
        }
        return p;
      };
      let p = chain('a', FIRST, gate);
      const c1 = FIRST + STEP * 2 + STEP + CLUSTER_R;
      p = cluster(`${cls}_${b}1`, at(c1), dir, cls, T.regionNotables[cls][bi * 2], p);
      p = chain('b', c1 + CLUSTER_R + STEP, p);
      const c2 = c1 + CLUSTER_R + STEP * 3 + STEP + CLUSTER_R;
      p = cluster(`${cls}_${b}2`, at(c2), dir, cls, T.regionNotables[cls][bi * 2 + 1], p);
      if (b === 'M') {
        for (let j = 1; j <= 2; j++) {
          const [x, y] = at(c2 + CLUSTER_R + STEP * j);
          const id = add(`${cls}_k${j}`, x + jit(), y + jit(), 'small', { cls, ...small(pool) });
          link(p, id);
          p = id;
        }
        const [x, y] = at(c2 + CLUSTER_R + STEP * 3);
        link(p, add(`${cls}_ks`, x, y, 'keystone', { cls, ...T.keystones[cls] }));
      }
    });
  }

  // となりの地域の橋（i の左の枝の 2 マス目 ↔ i+1 の右の枝の 2 マス目）
  T.regions.forEach(({ cls }, i) => {
    const next = T.regions[(i + 1) % T.regions.length].cls;
    const a = nodes[`${cls}_Lb2`], b = nodes[`${next}_Rb2`];
    let p = a.id;
    [0.25, 0.5, 0.75].forEach((t, j) => {
      const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
      const id = `x${i}_${j + 1}`;
      if (j === 1) add(id, x, y, 'notable', { ...T.bridgeNotables[i] });
      else add(id, x + jit(), y + jit(), 'small', small(T.smallPools[j === 0 ? cls : next]));
      link(p, id);
      p = id;
    });
    link(p, b.id);
  });

  // 中心の輪から要への短い道
  for (const P of T.centerPaths) {
    const k = (P.angle + 90) / 30;
    let p = `r${k}`;
    CENTER_PATH_R.forEach((r, j) => {
      const [x, y] = polar(r, P.angle);
      const id = `${P.id}${j + 1}`;
      if (j === 0) add(id, x + jit(), y + jit(), 'small', small(T.smallPools.center));
      else if (j === 1) add(id, x, y, 'notable', P.notable);
      else add(id, x, y, 'keystone', P.keystone);
      link(p, id);
      p = id;
    });
  }

  const starts = { adventurer: 'c0' };
  for (const { cls } of T.regions) starts[cls] = `${cls}_g`;
  return { starts, nodes };
}

// tree.mjs の中身（1 マス 1 行）
export function toModule(tree, seed) {
  const n = Object.keys(tree.nodes).length;
  const out = [
    '// 生成物: node kanenaki/tools/gen-tree.mjs が kanenaki/shared/data/tree-table.mjs と種から作る。手で直さない。',
    `// 種 ${seed}、マス ${n} 個`,
    'export const tree = {',
    `  starts: ${JSON.stringify(tree.starts)},`,
    '  nodes: {',
    ...Object.entries(tree.nodes).map(([id, node]) => `    ${JSON.stringify(id)}: ${JSON.stringify(node)},`),
    '  },',
    '};',
  ];
  return `${out.join('\n')}\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = join(dirname(fileURLToPath(import.meta.url)), '../shared/data/tree.mjs');
  const tree = buildTree(TREE_SEED);
  writeFileSync(out, toModule(tree, TREE_SEED));
  const kinds = {};
  for (const n of Object.values(tree.nodes)) kinds[n.kind] = (kinds[n.kind] ?? 0) + 1;
  console.log(logLine('gen-tree', { seed: TREE_SEED, out }, { nodes: Object.keys(tree.nodes).length, kinds }));
}
