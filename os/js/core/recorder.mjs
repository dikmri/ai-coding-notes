// 音声レコーダーの計算: 録音の切れ端をつなぐ、音の大きさ（いちばん大きい振れ幅）と色、波形の縮め方、長さ、保存の名前、許可の誤りの文。
// 画面にも音にも触らない純粋な関数だけを置く（テストは tests/os-recorder.test.mjs）。WAV にするのは core/wav.mjs の encodeWAV。

export function joinChunks(chunks) {
  const n = chunks.reduce((s, c) => s + c.length, 0), out = new Float32Array(n);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}
export function peak(d) { let m = 0; for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > m) m = v; } return m; }
// 音の大きさの色: ふつう（ミント）・大きめ（アプリコット）・音割れに近い（夕焼けピンク）
export const levelKind = (p) => (p >= 0.95 ? 'clip' : p >= 0.6 ? 'loud' : 'ok');
// 波形: n 個の区間に分け、それぞれの最小と最大
export function waveBins(d, n) {
  const out = [], size = d.length / n;
  for (let i = 0; i < n; i++) {
    // 標本が区間より少ないときは、少なくとも1つの標本を受け持つ（同じ標本を引き延ばす）
    const a = Math.floor(i * size), b = Math.min(d.length, Math.max(a + 1, Math.floor((i + 1) * size)));
    if (a >= d.length) { out.push([0, 0]); continue; }
    let lo = Infinity, hi = -Infinity;
    for (let k = a; k < b; k++) { if (d[k] < lo) lo = d[k]; if (d[k] > hi) hi = d[k]; }
    out.push([lo, hi]);
  }
  return out;
}
export const seconds = (samples, rate) => (rate ? samples / rate : 0);
const pad = (n) => String(n).padStart(2, '0');
export const defaultName = (d) => `録音 ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}.wav`;
// マイクを使えなかったときの、何が起きたかとどうすればよいかの文
export function errorText(e) {
  switch (e?.name) {
    case 'NotAllowedError': case 'SecurityError':
      return 'マイクを使う許可がありません。アドレスバーの左のしるしを押して「マイク」を「許可」にし、もう一度「録音」を押してください。';
    case 'NotFoundError': case 'OverconstrainedError':
      return 'マイクが見つかりません。マイクをつなぐか、「入力」で別の機器を選んでから、もう一度「録音」を押してください。';
    case 'NotReadableError': case 'AbortError':
      return 'マイクを開けませんでした。ほかのアプリがマイクを使っていないか確かめて、もう一度「録音」を押してください。';
    default:
      return `録音を始められませんでした（${e?.message || e?.name || '理由は分かりません'}）。ページを読み込み直してから、もう一度試してください。`;
  }
}
