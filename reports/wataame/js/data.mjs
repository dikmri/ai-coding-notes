// 曲のデータ（score.json と levels.bin）を読み、時刻 t から値を引く道具。
export async function loadData(base) {
  const [score, buf] = await Promise.all([
    fetch(`${base}data/score.json`).then((r) => { if (!r.ok) throw new Error(`score.json ${r.status}`); return r.json(); }),
    fetch(`${base}data/levels.bin`).then((r) => { if (!r.ok) throw new Error(`levels.bin ${r.status}`); return r.arrayBuffer(); }),
  ]);
  return makeData(score, new Uint8Array(buf));
}

export function makeData(score, bytes) {
  const L = score.levels;
  const C = L.channels.length;
  const F = L.frames;
  const ch = Object.fromEntries(L.channels.map((n, i) => [n, i]));
  const bandBase = ch.band0;
  const nBands = L.channels.filter((n) => n.startsWith('band')).length;

  // 1/60 秒ごとの値を、間をつないで読む（0〜1）
  function level(name, t) {
    const c = ch[name];
    const f = Math.max(0, Math.min(F - 1, t * L.fps));
    const i0 = Math.floor(f), i1 = Math.min(F - 1, i0 + 1), a = f - i0;
    return (bytes[i0 * C + c] * (1 - a) + bytes[i1 * C + c] * a) / 255;
  }
  function bands(t, out = new Float32Array(nBands)) {
    const f = Math.max(0, Math.min(F - 1, t * L.fps));
    const i0 = Math.floor(f), i1 = Math.min(F - 1, i0 + 1), a = f - i0;
    for (let b = 0; b < nBands; b++) out[b] = (bytes[i0 * C + bandBase + b] * (1 - a) + bytes[i1 * C + bandBase + b] * a) / 255;
    return out;
  }
  // 曲全体の大まかな音量（進み具合の帯に使う）
  function overview(columns) {
    const out = new Float32Array(columns);
    for (let i = 0; i < columns; i++) {
      const a = Math.floor((i / columns) * F), b = Math.max(a + 1, Math.floor(((i + 1) / columns) * F));
      let s = 0;
      for (let f = a; f < b; f++) s += (bytes[f * C + ch.L] + bytes[f * C + ch.R]) / 510;
      out[i] = s / (b - a);
    }
    return out;
  }
  const drums = Object.fromEntries(Object.entries(score.drums).map(([k, v]) => [k, v.map(([t, vel]) => ({ t, vel }))]));
  const fxBy = {};
  for (const e of score.fx) (fxBy[e.type] ||= []).push(e);
  return {
    score, level, bands, overview, nBands, drums, fxBy,
    chops: score.notes.chop.filter((n) => !n.h),
    harmony: score.notes.chop.filter((n) => n.h),
    stabs: score.notes.stab,
  };
}

// t 以下の最後の要素の位置（list は t の昇順）
export function lastBefore(list, t, key = 't') {
  let lo = 0, hi = list.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid][key] <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}
// [t0, t1) の範囲の要素
export function between(list, t0, t1, key = 't') {
  const out = [];
  let i = lastBefore(list, t0 - 1e-9, key) + 1;
  for (; i < list.length && list[i][key] < t1; i++) out.push(list[i]);
  return out;
}
export const sectionAt = (score, t) => score.sections.find((s) => t >= s.t0 && t < s.t1) || score.sections[score.sections.length - 1];
export const chordIndexAt = (score, t) => Math.max(0, lastBefore(score.chords, t, 't0'));

export function fmtTime(sec) {
  const s = Math.max(0, Math.floor(sec + 1e-6));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
export function fmtTimeJa(sec) {
  const s = Math.max(0, Math.floor(sec + 1e-6));
  return `${Math.floor(s / 60)}分${s % 60}秒`;
}
