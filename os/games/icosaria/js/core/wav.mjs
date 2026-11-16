// 音（チャンネルごとの -1〜1 の並び）を、16ビットの WAV のバイト列にする。Gemini に曲を聞いてもらうときに使う
export function encodeWav(channels, sampleRate) {
  const n = channels[0].length, ch = channels.length, data = n * ch * 2;
  const b = new Uint8Array(44 + data), dv = new DataView(b.buffer);
  const put = (o, s) => { for (let i = 0; i < s.length; i++) b[o + i] = s.charCodeAt(i); };
  put(0, 'RIFF'); dv.setUint32(4, 36 + data, true); put(8, 'WAVE'); put(12, 'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, ch, true); dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate * ch * 2, true); dv.setUint16(32, ch * 2, true); dv.setUint16(34, 16, true);
  put(36, 'data'); dv.setUint32(40, data, true);
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) {
    const v = Math.max(-1, Math.min(1, channels[c][i]));
    dv.setInt16(o, v < 0 ? Math.round(v * 32768) : Math.round(v * 32767), true); o += 2;
  }
  return b;
}
