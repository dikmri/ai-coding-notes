// 道具を地図に使う: 道を引く、区画を塗る、施設を置く、消す。plan で費用と対象を見積もり、apply で実際に変える
import { idx, inside, BLD } from './city.mjs';
import { ROADS, ZONES, SVC, SVC_BY_ID, POWERLINE, BRIDGE_MULT, BULLDOZE_COST, CLASS_OF, toolKey } from './defs.mjs';
import { isUnlocked, unlockStage, MILESTONES } from './milestones.mjs';

// a から b まで、長い方の向きに先に進む L 字の並び
export function linePath(a, b) {
  const [i1, j1] = b, out = [];
  let [i, j] = a;
  out.push([i, j]);
  const si = Math.sign(i1 - i), sj = Math.sign(j1 - j);
  const stepI = () => { while (i !== i1) { i += si; out.push([i, j]); } };
  const stepJ = () => { while (j !== j1) { j += sj; out.push([i, j]); } };
  if (Math.abs(i1 - a[0]) >= Math.abs(j1 - a[1])) { stepI(); stepJ(); } else { stepJ(); stepI(); }
  return out;
}
export function rectTiles(a, b) {
  const out = [];
  for (let j = Math.min(a[1], b[1]); j <= Math.max(a[1], b[1]); j++) for (let i = Math.min(a[0], b[0]); i <= Math.max(a[0], b[0]); i++) out.push([i, j]);
  return out;
}
// 施設が占めるマス（a が北西の角）
export function footprint(s, key, a) {
  const n = SVC[key].size, out = [];
  for (let dj = 0; dj < n; dj++) for (let di = 0; di < n; di++) out.push([a[0] + di, a[1] + dj]);
  return out;
}
// 施設のマスを1つ渡すと、その施設全体のマスを返す
export function svcTiles(s, k) {
  const a = s.anchor[k];
  if (a < 0 || !s.svc[k]) return [k];
  const n = SVC_BY_ID[s.svc[k]].size, ai = a % s.N, aj = Math.floor(a / s.N), out = [];
  for (let dj = 0; dj < n; dj++) for (let di = 0; di < n; di++) out.push(idx(s.N, ai + di, aj + dj));
  return out;
}

const clearBuilding = (s, k) => { s.bld[k] = 0; s.occ[k] = 0; s.lvl[k] = 0; s.age[k] = 0; s.burn[k] = 0; };
function removeSvc(s, k) {
  for (const t of svcTiles(s, k)) { s.svc[t] = 0; s.anchor[t] = -1; s.age[t] = 0; s.burn[t] = 0; }
}

function lockedReason(s, tool) {
  const key = toolKey(tool);
  if (!key || key === 'inspect' || isUnlocked(s, key)) return null;
  const m = MILESTONES[unlockStage(key)];
  return `人口 ${m.pop.toLocaleString('ja-JP')} 人（${m.title}）で使えるようになります`;
}

// 見積もり: { ok, cost, tiles: [マスの番号], reason }
export function plan(s, tool, a, b = a) {
  const N = s.N, res = { ok: false, cost: 0, tiles: [], reason: '' };
  const locked = lockedReason(s, tool);
  if (locked) { res.reason = locked; return res; }
  const add = (k, c) => { res.tiles.push(k); res.cost += c; };
  if (tool.kind === 'road') {
    const R = ROADS[tool.road];
    for (const [i, j] of linePath(a, b)) {
      if (!inside(N, i, j)) continue;
      const k = idx(N, i, j);
      if (s.svc[k]) { res.reason = '施設の上には道を引けません'; return res; }
      const cur = s.road[k];
      if (cur === tool.road) continue;
      if (cur > tool.road) continue; // 広い道を狭くはしない
      const wet = s.terrain[k] === 1 ? BRIDGE_MULT : 1;
      if (cur) add(k, (R.cost - ROADS[cur].cost) * wet);
      else add(k, R.cost * wet + (s.trees[k] ? 1 : 0) + (s.bld[k] ? BULLDOZE_COST : 0));
    }
    if (!res.tiles.length && !res.reason) res.reason = 'もう道があります';
  } else if (tool.kind === 'power') {
    for (const [i, j] of linePath(a, b)) {
      if (!inside(N, i, j)) continue;
      const k = idx(N, i, j);
      if (s.svc[k] || s.zone[k] || s.pw[k]) continue; // 施設と区画は電気をそのまま伝える
      add(k, POWERLINE.cost * (s.terrain[k] === 1 ? POWERLINE.waterMult : 1));
    }
    if (!res.tiles.length) res.reason = '電線を張る場所がありません';
  } else if (tool.kind === 'zone') {
    for (const [i, j] of rectTiles(a, b)) {
      if (!inside(N, i, j)) continue;
      const k = idx(N, i, j);
      if (s.terrain[k] === 1 || s.road[k] || s.svc[k] || s.zone[k] === tool.zone) continue;
      add(k, 0);
    }
    if (!res.tiles.length) res.reason = '塗れる土地がありません（道・水・施設の上には塗れません）';
  } else if (tool.kind === 'dezone') {
    for (const [i, j] of rectTiles(a, b)) { if (!inside(N, i, j)) continue; const k = idx(N, i, j); if (s.zone[k]) add(k, 0); }
    if (!res.tiles.length) res.reason = '区画がありません';
  } else if (tool.kind === 'district') {
    for (const [i, j] of rectTiles(a, b)) { if (!inside(N, i, j)) continue; const k = idx(N, i, j); if (s.dist[k] !== (tool.d || 0)) add(k, 0); }
    if (!res.tiles.length) res.reason = 'もう塗ってあります';
  } else if (tool.kind === 'svc') {
    const def = SVC[tool.key];
    if (def.unique && s.svc.some((v) => v === def.id)) { res.reason = `${def.name}は1つしか建てられません`; return res; }
    let wet = false;
    for (const [i, j] of footprint(s, tool.key, a)) {
      if (!inside(N, i, j)) { res.reason = '地図の外にはみ出します'; return res; }
      const k = idx(N, i, j);
      if (s.terrain[k] === 1) { res.reason = '水の上には建てられません'; return res; }
      if (s.road[k] || s.svc[k]) { res.reason = '道や施設と重なっています'; return res; }
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (inside(N, i + di, j + dj) && s.terrain[idx(N, i + di, j + dj)] === 1) wet = true;
      add(k, (s.trees[k] ? 1 : 0) + (s.bld[k] ? BULLDOZE_COST : 0));
    }
    if (def.needsWater && !wet) { res.reason = `${def.name}は川や湖のそばに置きます`; res.tiles = []; return res; }
    res.cost += def.cost;
  } else if (tool.kind === 'bulldoze') {
    const seen = new Set();
    for (const [i, j] of rectTiles(a, b)) {
      if (!inside(N, i, j)) continue;
      const k = idx(N, i, j);
      if (seen.has(k)) continue;
      if (s.svc[k]) { for (const t of svcTiles(s, k)) seen.add(t); add(k, BULLDOZE_COST * 2); continue; }
      seen.add(k);
      if (s.road[k] || s.pw[k] || s.bld[k] || s.trees[k] || s.zone[k]) add(k, BULLDOZE_COST);
    }
    if (!res.tiles.length) res.reason = '消すものがありません';
  } else {
    res.reason = 'この道具は地図を変えません';
    return res;
  }
  res.cost = Math.round(res.cost);
  if (res.tiles.length && res.cost > s.funds) { res.reason = `お金が足りません（${res.cost.toLocaleString('ja-JP')} 万円かかります）`; return res; }
  res.ok = res.tiles.length > 0;
  return res;
}

export function apply(s, tool, a, b = a) {
  const p = plan(s, tool, a, b);
  if (!p.ok) return p;
  if (tool.kind === 'road') {
    for (const k of p.tiles) { s.road[k] = tool.road; s.zone[k] = 0; s.trees[k] = 0; clearBuilding(s, k); }
  } else if (tool.kind === 'power') {
    for (const k of p.tiles) { s.pw[k] = 1; s.trees[k] = 0; }
  } else if (tool.kind === 'zone') {
    const cls = CLASS_OF(tool.zone);
    for (const k of p.tiles) {
      // 種類か密度が変わる建物は建て直しになる
      if (s.bld[k] && (CLASS_OF(s.zone[k]) !== cls || s.zone[k] !== tool.zone)) clearBuilding(s, k);
      s.zone[k] = tool.zone; s.pw[k] = 0;
    }
  } else if (tool.kind === 'dezone') {
    for (const k of p.tiles) { s.zone[k] = 0; clearBuilding(s, k); }
  } else if (tool.kind === 'district') {
    for (const k of p.tiles) s.dist[k] = tool.d || 0;
  } else if (tool.kind === 'svc') {
    const def = SVC[tool.key], anchor = idx(s.N, a[0], a[1]);
    for (const k of p.tiles) { s.svc[k] = def.id; s.anchor[k] = anchor; s.zone[k] = 0; s.trees[k] = 0; s.pw[k] = 0; clearBuilding(s, k); }
  } else if (tool.kind === 'bulldoze') {
    for (const k of p.tiles) {
      if (s.svc[k]) { removeSvc(s, k); continue; }
      s.road[k] = 0; s.pw[k] = 0; s.trees[k] = 0; s.zone[k] = 0; clearBuilding(s, k);
    }
  }
  s.funds -= p.cost;
  s.rev = (s.rev || 0) + 1;
  return p;
}
