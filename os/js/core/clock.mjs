// 時計とタイマーの計算: 時間の表示、タイマーとストップウォッチの状態、針の角度、ラップの CSV。
// 時間はいつも「始めた時刻」と「今の時刻」の差で数える（窓が裏にあって処理が間引かれても遅れない）。
// 画面には触らない純粋な関数だけを置く（テストは tests/os-clock.test.mjs）。

const pad = (n) => String(n).padStart(2, '0');

// ミリ秒を「分:秒」にする。1時間以上は「時:分:秒」。cs で百分の一秒（切り捨て）も付ける
export function fmt(ms, { cs = false } = {}) {
  ms = Math.max(0, Math.floor(ms));
  const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const base = h ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
  return cs ? `${base}.${pad(Math.floor((ms % 1000) / 10))}` : base;
}
// 残り時間は秒を切り上げて見せる（0.4 秒残っているときに 00:00 と出さない）
export const fmtLeft = (ms) => fmt(Math.ceil(Math.max(0, ms) / 1000) * 1000);

export const MAX_TIMER = (99 * 60 + 59) * 1000;
export function duration(min, sec) {
  const n = (x) => { const v = parseInt(x, 10); return Number.isFinite(v) && v > 0 ? v : 0; };
  return Math.min(MAX_TIMER, (n(min) * 60 + n(sec)) * 1000);
}

/* ---------- タイマー ---------- */
export const timer = (dur) => ({ dur, left: dur, endAt: null, running: false });
export const timerLeft = (t, now) => (t.running ? Math.max(0, t.endAt - now) : t.left);
export const timerStart = (t, now) => (t.running || t.left <= 0 ? t : { ...t, running: true, endAt: now + t.left });
export const timerPause = (t, now) => (t.running ? { ...t, running: false, left: timerLeft(t, now), endAt: null } : t);
export const timerDone = (t, now) => t.running && now >= t.endAt;
export const timerReset = (t) => timer(t.dur);

/* ---------- ストップウォッチ ---------- */
export const stopwatch = () => ({ acc: 0, since: null, running: false, laps: [] });
export const swElapsed = (s, now) => s.acc + (s.running ? now - s.since : 0);
export const swStart = (s, now) => (s.running ? s : { ...s, running: true, since: now });
export const swStop = (s, now) => (s.running ? { ...s, running: false, acc: swElapsed(s, now), since: null } : s);
export const swReset = () => stopwatch();
export function swLap(s, now) {
  const total = swElapsed(s, now), prev = s.laps.length ? s.laps[s.laps.length - 1].total : 0;
  return { ...s, laps: [...s.laps, { n: s.laps.length + 1, lap: total - prev, total }] };
}
export const lapsToCsv = (laps) => '番号,ラップ,経過\n' + laps.map((l) => `${l.n},${fmt(l.lap, { cs: true })},${fmt(l.total, { cs: true })}`).join('\n') + '\n';

/* ---------- アナログの針 ---------- */
// 12時の向きを 0 として、時計回りの角度（ラジアン）。秒針と分針は止まらずに進む
export function hands(d) {
  const sec = d.getSeconds() + d.getMilliseconds() / 1000, min = d.getMinutes() + sec / 60, hr = (d.getHours() % 12) + min / 60;
  const TAU = Math.PI * 2;
  return { s: (sec / 60) * TAU, m: (min / 60) * TAU, h: (hr / 12) * TAU };
}
