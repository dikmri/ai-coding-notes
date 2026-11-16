// 音声（-1〜1 の Float32Array をチャンネルの数だけ）を 16 ビット PCM の WAV にする
export function encodeWAV(channels, sampleRate) {
  const nc = channels.length, len = channels[0].length, data = len * nc * 2, b = new Uint8Array(44 + data), dv = new DataView(b.buffer);
  const tag = (o, s) => { for (let i = 0; i < 4; i++) b[o + i] = s.charCodeAt(i); };
  tag(0, 'RIFF'); dv.setUint32(4, 36 + data, true); tag(8, 'WAVE'); tag(12, 'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, nc, true); dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate * nc * 2, true); dv.setUint16(32, nc * 2, true); dv.setUint16(34, 16, true);
  tag(36, 'data'); dv.setUint32(40, data, true);
  let o = 44;
  for (let i = 0; i < len; i++) for (let c = 0; c < nc; c++) { const s = Math.max(-1, Math.min(1, channels[c][i])); dv.setInt16(o, s < 0 ? s * 32768 : s * 32767, true); o += 2; }
  return b;
}
