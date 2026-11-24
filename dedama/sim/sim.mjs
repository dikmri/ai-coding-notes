// 出玉の計算（純粋な関数。画面・時計・乱数の外の物に触らない）。仕様は MyWiki dedama-graph.md §2。
// 使い方: const s = createSession({ machine: 'crab', seed: 1 }); s.advanceTo(ゲーム内の秒); s.state / s.samples / s.events を読む。
// 時間はゲーム内の秒（0 = 10:00、12 時間 = 43,200 秒で閉店）。出来事を時刻順に 1 つずつ進める（離散事象のシミュレーション）。
import { machineById } from './machines.mjs';

export const GAME_HOURS = 12;
export const YEN_PER_BALL = 4;
export const BALLS_PER_1000 = 250;
export const SHOOT_SEC = 0.6;          // 毎分 100 発
export const RETURN_RATE = 0.35;       // 打ち出しのうちヘソ・一般入賞で戻る割合（平均）
export const HOLD_MAX = 4;
export const T = {
  hazure: [10, 10, 7, 4, 4],           // 通常時のはずれ。変動を始めた後に残る保留の数で決まる
  reach: 25, reachRate: 1 / 15, hit: 45,
  den: 3, denHit: 20,                  // 電サポ中
  open: 6, round: 8, end: 10,          // 大当たり
};

// ---- 乱数（sfc32、種は splitmix32 で広げる） ----
export function makeRng(seed) {
  let s = seed >>> 0;
  const split = () => { s = (s + 0x9e3779b9) >>> 0; let z = s; z = Math.imul(z ^ (z >>> 16), 0x85ebca6b); z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35); return (z ^ (z >>> 16)) >>> 0; };
  let a = split(), b = split(), c = split(), d = split();
  return () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    const t = (a + b) | 0; a = b ^ (b >>> 9); b = (c + (c << 3)) | 0; c = (c << 21) | (c >>> 11); d = (d + 1) | 0;
    const r = (t + d) | 0; c = (c + r) | 0;
    return (r >>> 0) / 4294967296;
  };
}
// 1 回成功するまでの試行回数（成功の確率 p）
const geometric = (rng, p) => 1 + Math.floor(Math.log(1 - rng()) / Math.log(1 - p));

export const MODE_LABEL = { normal: '通常', kakuhen: '確変', st: 'ST', jitan: '時短', rush: 'RUSH' };
// 状態の決まり: mode（normal・kakuhen・st・jitan・rush）に加えて、次を持てる
//   p     … 1 回転の当たり確率の分母（無ければ mode ごとの台の確率）
//   table … 当たったときの振り分けの表の名前（無ければ通常時は heso、電サポ中は den）
//   key   … 記録（stats）の名前（無ければ mode）。label … 画面の表示名（無ければ MODE_LABEL）
export const modeKey = (md) => md.key ?? md.mode;
export const modeLabel = (md) => md.label ?? MODE_LABEL[md.mode];
const NORMAL_MODE = { mode: 'normal' };

export function createSession({ machine, seed = 1, hours = GAME_HOURS, rpk = null } = {}) {
  const m = typeof machine === 'string' ? machineById(machine) : machine;
  if (!m) throw new Error(`台がありません: ${machine}`);
  const rng = makeRng(seed);
  const endT = hours * 3600;
  const perRound = m.count * (m.perBall - 1);
  const rpkUsed = rpk ?? m.rpk;
  const entryP = ((1 - RETURN_RATE) * rpkUsed) / BALLS_PER_1000;

  const blank = () => ({ n: 0, hits: 0 });
  const stats = {
    // 状態の key ごと。台に無い状態は 0 のまま（使った key は後から足す）
    spins: { normal: blank(), kakuhen: blank(), st: blank(), jitan: blank(), rush: blank() },
    episodes: { kakuhen: { n: 0, hit: 0 }, st: { n: 0, hit: 0 }, jitan: { n: 0, hit: 0 }, rush: { n: 0, hit: 0 } },
    // 振り分けの表の名前ごと（出玉のある大当たりだけ。ST リセットは数えない）
    hits: { heso: { n: 0, payout: 0 }, den: { n: 0, payout: 0 } },
    resets: 0,
    normal: { entries: 0, net: 0, time: 0 },
  };
  const state = {
    t: 0, sa: 0, mochi: 0, invest: 0, mode: 'normal', modeKey: 'normal', modeLabel: MODE_LABEL.normal, modeLeft: 0, hold: 0, chain: 0, maxChain: 0,
    spinsTotal: 0, spinsSinceHit: 0, hitsTotal: 0, firstHits: 0, maxSa: 0, minSa: 0, inBonus: false, bonusRoundsLeft: 0, bonusRounds: 0,
  };
  const events = [];
  const samples = [[0, 0, 0]];
  let cur = NORMAL_MODE;    // 今の状態（mode と、確率・表・名前の決まり）
  let then = null;          // 今の電サポを使い切った後に続く状態
  let spin = null;          // { end, hit, from, spinAt }
  let entry = null;         // { at, L }
  let bonus = null;         // { nextAt, phase, left, perRound, next }
  let shootClosed = false;  // 閉店までに届かない玉は打たない（一度決めたら打ち直さない）

  const S = {
    machine: m, seed, rpk: rpkUsed, endT, stats, state, events, samples, done: false,
    advanceTo,
  };

  function pushSample() {
    const last = samples[samples.length - 1];
    if (last[0] === state.t && last[2] === state.chain) { last[1] = state.sa; return; }
    samples.push([state.t, state.sa, state.chain]);
  }
  function addBalls(delta) {
    state.sa += delta;
    state.mochi += delta;
    while (state.mochi < 0) { state.mochi += BALLS_PER_1000; state.invest += 1000; events.push({ type: 'cash', t: state.t, invest: state.invest }); }
    if (state.sa > state.maxSa) state.maxSa = state.sa;
    if (state.sa < state.minSa) state.minSa = state.sa;
  }

  function setMode(next) {
    cur = next;
    state.mode = next.mode; state.modeKey = modeKey(next); state.modeLabel = modeLabel(next);
  }
  function enterMode(next) {
    setMode(next);
    then = next.then || null;
    if (next.mode === 'normal') {
      state.modeLeft = 0;
      if (state.chain) events.push({ type: 'modeEnd', t: state.t, sa: state.sa, mode: 'bonus', result: 'out', chain: state.chain });
      state.chain = 0;
    } else {
      state.modeLeft = next.mode === 'kakuhen' ? Infinity : next.spins;
    }
  }
  function endEpisode(result) {
    if (state.mode === 'normal') return;
    const ep = (stats.episodes[state.modeKey] ??= { n: 0, hit: 0 });
    ep.n++;
    if (result === 'hit') ep.hit++;
  }

  function maybeShoot() {
    if (entry || bonus || shootClosed || state.mode !== 'normal' || state.hold >= HOLD_MAX || state.t >= endT) return;
    const L = geometric(rng, entryP);
    entry = { at: state.t + L * SHOOT_SEC, L };
  }
  function maybeSpin() {
    if (spin || bonus || state.t >= endT) return;
    const mode = state.mode;
    if (mode === 'normal') { if (state.hold === 0) return; state.hold--; }
    else if (state.hold > 0) state.hold--; // 電サポ中は残っているヘソの保留から回す
    let p;
    if (cur.p) p = 1 / cur.p;
    else if (mode === 'normal' || mode === 'jitan') p = 1 / m.normal;
    else if (mode === 'rush') p = 1 / m.normal + 1 / m.koatari;
    else p = 1 / m.high;
    const hit = rng() < p;
    let dur;
    if (mode === 'normal') dur = hit ? T.hit : rng() < T.reachRate ? T.reach : T.hazure[state.hold];
    else {
      dur = hit ? T.denHit : T.den;
      // 右打ち: 電チューの払い出し 1 個、打ち出しは平均 2.5 発、ときどき一般入賞 10 個 → 1 回転で平均 0.5 個減る
      addBalls(1 - geometric(rng, 0.4) + (rng() < 0.1 ? 10 : 0));
      pushSample();
    }
    if (mode !== 'normal' && mode !== 'kakuhen') state.modeLeft--;
    const sp = (stats.spins[state.modeKey] ??= blank());
    sp.n++;
    if (hit) sp.hits++;
    state.spinsTotal++;
    state.spinsSinceHit++;
    spin = { end: state.t + dur, hit, from: mode, fromKey: state.modeKey, table: cur.table ?? (mode === 'normal' ? 'heso' : 'den'), spinAt: state.t };
  }

  function onEntry() {
    const { L } = entry;
    entry = null;
    let R = 0;
    const q = RETURN_RATE / 10;
    for (let i = 0; i < L; i++) if (rng() < q) R += 10;
    addBalls(R - L);
    stats.normal.entries++;
    stats.normal.net += L - R;
    state.hold++;
    pushSample();
  }

  function onSpinEnd() {
    const s = spin;
    spin = null;
    if (s.hit) {
      const route = s.from === 'normal' ? 'heso' : 'den';
      if (s.from !== 'normal') endEpisode('hit');
      const table = m[s.table];
      let u = rng() * table.reduce((a, [w]) => a + w, 0);
      let pick = table[table.length - 1];
      for (const row of table) { if (u < row[0]) { pick = row; break; } u -= row[0]; }
      const [, rounds, next] = pick;
      if (rounds === 0 && !m.tokkaku && s.from !== 'normal') {
        // ST リセット（出玉なし）: 大当たりにも連チャンにも数えず、次の状態を最初の回数から始める
        stats.resets++;
        events.push({ type: 'reset', t: state.t, spinAt: s.spinAt, from: s.from, fromKey: s.fromKey, chain: state.chain, next: next.mode, nextKey: modeKey(next), nextLabel: modeLabel(next), label: modeLabel(next), spins: next.spins ?? null });
        enterMode(next);
        pushSample();
        return;
      }
      const tk = rounds === 0 ? m.tokkaku : null;
      const nRounds = tk ? tk.rounds : rounds, pr = tk ? tk.perRound : perRound;
      state.chain = s.from === 'normal' ? 1 : state.chain + 1;
      if (state.chain > state.maxChain) state.maxChain = state.chain;
      if (s.from === 'normal') state.firstHits++;
      state.hitsTotal++;
      state.spinsSinceHit = 0;
      const hs = (stats.hits[s.table] ??= { n: 0, payout: 0 });
      hs.n++;
      hs.payout += nRounds * pr;
      events.push({ type: 'hit', t: state.t, sa: state.sa, spinAt: s.spinAt, from: s.from, fromKey: s.fromKey, route, table: s.table, chain: state.chain, rounds: nRounds, tokkaku: !!tk, payout: nRounds * pr, next: next.mode, nextKey: modeKey(next), nextLabel: modeLabel(next) });
      entry = null; // 大当たり中はヘソを狙わない
      bonus = { nextAt: state.t + T.open, phase: 'open', left: nRounds, perRound: pr, next };
      state.inBonus = true; state.bonusRounds = nRounds; state.bonusRoundsLeft = nRounds;
      pushSample();
      return;
    }
    // はずれ: 回数を使い切ったら次の状態へ
    if ((state.mode === 'st' || state.mode === 'jitan' || state.mode === 'rush') && state.modeLeft <= 0) {
      endEpisode('out');
      if (then) {
        const nx = then;
        events.push({ type: 'modeEnd', t: state.t, mode: state.mode, key: state.modeKey, label: state.modeLabel, result: 'next', to: nx.mode, toKey: modeKey(nx), toLabel: modeLabel(nx) });
        enterMode(nx);
      } else {
        events.push({ type: 'modeEnd', t: state.t, sa: state.sa, mode: state.mode, key: state.modeKey, label: state.modeLabel, result: 'out', chain: state.chain });
        setMode(NORMAL_MODE); state.modeLeft = 0; state.chain = 0; then = null;
        pushSample();
      }
    }
  }

  function onBonus() {
    const b = bonus;
    if (b.phase === 'open') { b.phase = b.left > 0 ? 'round' : 'end'; b.nextAt += b.left > 0 ? T.round : T.end; return; }
    if (b.phase === 'round') {
      addBalls(b.perRound);
      b.left--; state.bonusRoundsLeft = b.left;
      pushSample();
      if (b.left > 0) b.nextAt += T.round; else { b.phase = 'end'; b.nextAt += T.end; }
      return;
    }
    // エンディングが終わった
    bonus = null;
    state.inBonus = false;
    events.push({ type: 'bonusEnd', t: state.t, next: b.next.mode, nextKey: modeKey(b.next), nextLabel: modeLabel(b.next), spins: b.next.spins ?? null, chain: state.chain });
    enterMode(b.next);
    pushSample();
  }

  function advanceTo(target) {
    for (;;) {
      if (S.done) return S;
      maybeSpin();
      maybeShoot();
      if (entry && entry.at >= endT) { entry = null; shootClosed = true; } // 閉店後に届く玉は打たない
      let tNext = Infinity, kind = null;
      if (spin && spin.end < tNext) { tNext = spin.end; kind = 'spin'; }
      if (entry && entry.at < tNext) { tNext = entry.at; kind = 'entry'; }
      if (bonus && bonus.nextAt < tNext) { tNext = bonus.nextAt; kind = 'bonus'; }
      if (kind === null) {
        // 何も起きない: 閉店後なら終わり。閉店前でここに来るのは、電サポ以外で保留も打ち出しも無いとき（起きない）
        const to = Math.max(state.t, endT);
        if (to > target) { advanceClock(target); return S; }
        advanceClock(to);
        S.done = true;
        events.push({ type: 'close', t: state.t });
        pushSample();
        return S;
      }
      if (tNext > target) { advanceClock(target); return S; }
      advanceClock(tNext);
      if (kind === 'spin') onSpinEnd();
      else if (kind === 'entry') onEntry();
      else onBonus();
    }
  }
  function advanceClock(to) {
    if (!(to > state.t)) return;
    if (state.mode === 'normal' && !bonus) stats.normal.time += Math.min(to, endT) - Math.min(state.t, endT);
    state.t = to;
  }

  return S;
}
