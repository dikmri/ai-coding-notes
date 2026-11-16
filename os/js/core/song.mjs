// 曲: { bpm, order: ['A', ...], patterns: { A: [声部0の16ステップ, 声部1, 声部2] } }
// ステップの値: 数（MIDI の音の番号）で鳴らす、-1 で止める、null は前の音を続ける
export const stepSec = (song) => 60 / song.bpm / 4;
export function songEvents(song) {
  const st = stepSec(song), ev = [];
  song.order.forEach((name, pi) => {
    const pat = song.patterns[name];
    if (!pat) return;
    pat.forEach((steps, voice) => steps.forEach((n, k) => {
      const t = (pi * 16 + k) * st;
      if (n === -1) ev.push({ t, voice, type: 'off' });
      else if (typeof n === 'number') ev.push({ t, voice, type: 'on', note: n });
    }));
  });
  return ev.sort((a, b) => a.t - b.t || a.voice - b.voice);
}
export const songLength = (song) => song.order.length * 16 * stepSec(song);
export const emptyPattern = () => [0, 1, 2].map(() => Array(16).fill(null));
