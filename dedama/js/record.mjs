// 大当り履歴と累計データ（純粋な関数。DOM・localStorage に触らない）。テストは tests/dedama-record.test.mjs。
import { YEN_PER_BALL } from '../sim/sim.mjs';

// ---- 大当り履歴 ----
// 種別は次の状態で決める（通常・確変・ST n・通常・時短 n・RUSH n・LT・突確）。1 回転で決着する状態は回数を書かない
export function hitKind(e) {
  if (e.type === 'reset') return '空振り';
  if (e.tokkaku) return '突確';
  const sp = e.nextSpins;
  if (e.next === 'normal') return '通常';
  if (e.next === 'kakuhen') return '確変';
  if (e.next === 'jitan') return `通常・時短 ${sp}`;
  const base = sp > 1 ? `${e.nextLabel} ${sp}` : e.nextLabel;
  return e.thenSpins ? `${base}・${e.thenLabel} ${e.thenSpins}` : base;
}
// 10R を何回も続けて払い出す当たり（20R 以上で 10 の倍数）は「10R×2」
export const roundsText = (r) => (!r ? '−' : r > 16 && r % 10 === 0 ? `10R×${r / 10}` : `${r}R`);

// 1 行 = 大当り 1 回か、出玉なしの空振り（ST リセット）1 回。回転数は前の行からの数（データカウンターの「スタート」と同じく、時短・ST の回転も数える）
export function hitRows(events) {
  const rows = [];
  let prev = 0, no = 0;
  for (const e of events) {
    if (e.type !== 'hit' && e.type !== 'reset') continue;
    const reset = e.type === 'reset';
    rows.push({
      no: reset ? null : ++no, t: e.t, spins: e.spinsTotal - prev, from: e.fromLabel, kind: hitKind(e),
      rounds: reset ? 0 : e.rounds, tokkaku: !reset && !!e.tokkaku, payout: reset ? 0 : e.payout, chain: e.chain, sa: e.sa,
    });
    prev = e.spinsTotal;
  }
  return rows;
}
// 保存するときは配列に詰める（並びは KEYS）
const KEYS = ['no', 't', 'spins', 'from', 'kind', 'rounds', 'tokkaku', 'payout', 'chain', 'sa'];
export const packRows = (rows) => rows.map((r) => KEYS.map((k) => (k === 't' ? Math.round(r.t) : k === 'tokkaku' ? (r.tokkaku ? 1 : 0) : r[k])));
export const unpackRows = (packed) => (Array.isArray(packed) ? packed : []).map((a) => Object.fromEntries(KEYS.map((k, i) => [k, k === 'tokkaku' ? !!a[i] : a[i]])));

// ---- 期待値 ----
// 通常時 1 回転の価値（円）。台に 12 時間の日で求めた値（dedama/tools/ev.mjs）が無ければ 1,000 円 ÷ ボーダー
export const spinValue = (m) => m.spinValue ?? 1000 / m.border;
// 期待値 = 通常時に回した回数 × 1 回転の価値 − 通常時に使った玉の代金
export const expectedYen = (m, normalSpins, usedBalls) => Math.round(normalSpins * spinValue(m) - usedBalls * YEN_PER_BALL);

// ---- 1 回の来店の記録 ----
export function visitRecord({ machine, rpk, seed, session, day }, at) {
  const st = session.state, stats = session.stats;
  const ns = stats.spins.normal.n;
  return {
    at, day, m: machine.id, rpk, seed,
    yen: st.sa * YEN_PER_BALL, invest: st.invest, back: st.mochi * YEN_PER_BALL,
    spins: st.spinsTotal, ns, hits: st.hitsTotal, first: st.firstHits, maxChain: st.maxChain, maxSa: st.maxSa, minSa: st.minSa,
    ev: expectedYen(machine, ns, stats.normal.net),
    hist: packRows(hitRows(session.events)),
  };
}

// ---- 保存（古い順の配列） ----
export const STORE_KEY = 'dedama.visits.v1';
const VERSION = 1;
// 上限を超えたら古い来店から消す。大当り履歴は新しい keepHist 回分だけ残す（ほかは数字だけ）
export function addVisit(list, rec, { max = 2000, keepHist = 100 } = {}) {
  const all = [...list, rec];
  const kept = all.length > max ? all.slice(all.length - max) : all;
  return kept.map((r, i) => {
    if (i >= kept.length - keepHist || !r.hist) return r;
    const { hist, ...rest } = r;
    return rest;
  });
}
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const validVisit = (r) => !!r && typeof r === 'object' && typeof r.m === 'string' && ['at', 'yen', 'invest', 'back', 'ev', 'spins', 'ns', 'hits', 'first', 'maxChain'].every((k) => num(r[k]));
export function parseStore(text) {
  if (!text) return [];
  let o;
  try { o = JSON.parse(text); } catch { return []; }
  if (!o || o.v !== VERSION || !Array.isArray(o.visits)) return [];
  return o.visits.filter(validVisit);
}
export const serializeStore = (list) => JSON.stringify({ v: VERSION, visits: list });

// ---- 累計 ----
export function totals(list, machines = []) {
  const t = { visits: list.length, wins: 0, losses: 0, draws: 0, invest: 0, back: 0, yen: 0, ev: 0, spins: 0, hits: 0, first: 0, ns: 0, maxChain: 0, best: null, worst: null, running: [0], expected: [0], byMachine: [] };
  const by = new Map();
  for (const r of list) {
    if (r.yen > 0) t.wins++; else if (r.yen < 0) t.losses++; else t.draws++;
    t.invest += r.invest; t.back += r.back; t.yen += r.yen; t.ev += r.ev;
    t.spins += r.spins; t.hits += r.hits; t.first += r.first; t.ns += r.ns;
    t.maxChain = Math.max(t.maxChain, r.maxChain);
    if (!t.best || r.yen > t.best.yen) t.best = r;
    if (!t.worst || r.yen < t.worst.yen) t.worst = r;
    t.running.push(t.yen); t.expected.push(t.ev);
    let b = by.get(r.m);
    if (!b) { b = { id: r.m, visits: 0, wins: 0, yen: 0, ev: 0, hits: 0, first: 0, ns: 0, maxChain: 0 }; by.set(r.m, b); }
    b.visits++; if (r.yen > 0) b.wins++;
    b.yen += r.yen; b.ev += r.ev; b.hits += r.hits; b.first += r.first; b.ns += r.ns;
    b.maxChain = Math.max(b.maxChain, r.maxChain);
  }
  t.avg = t.visits ? t.yen / t.visits : 0;
  t.winRate = t.visits ? t.wins / t.visits : 0;
  t.firstRate = t.first ? t.ns / t.first : null;
  const order = new Map(machines.map((m, i) => [m.id, i]));
  t.byMachine = [...by.values()].sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9));
  return t;
}
