// 楽譜のデータ（Gemini が作曲したもの）を読む。1小節 = 16 ステップ（16分音符）
// 音符は「音:長さ」を空白で区切る。和音は +、休みは R。ドラムは K S H O T を音名の代わりに使う
const STEP = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export function noteToMidi(name) {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(String(name).trim());
  if (!m) return null;
  return 12 * (+m[3] + 1) + STEP[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}
const DRUMS = new Set(['K', 'S', 'H', 'O', 'T']);

export function parseNotes(text, { drums = false } = {}) {
  const events = [], errors = [];
  let step = 0;
  for (const tok of String(text).trim().split(/\s+/).filter(Boolean)) {
    const m = /^(.+):(\d+)$/.exec(tok);
    if (!m) { errors.push('読めない音符: ' + tok); continue; }
    const len = +m[2];
    if (len <= 0) { errors.push('長さが 0: ' + tok); continue; }
    if (m[1] !== 'R') {
      const parts = m[1].split('+');
      const notes = drums ? parts.filter((p) => DRUMS.has(p)) : parts.map(noteToMidi);
      if (!drums && notes.some((n) => n == null)) errors.push('読めない音名: ' + tok);
      const ok = notes.filter((n) => n != null);
      if (ok.length) events.push({ step, len, notes: ok });
    }
    step += len;
  }
  return { events, total: step, errors };
}

// チャンネルの長さを曲の長さ（steps）にそろえる。足りなければ休みで埋め、長すぎれば切る
export function fitChannel(parsed, steps) {
  const events = [];
  for (const e of parsed.events) {
    if (e.step >= steps) break;
    events.push(e.step + e.len > steps ? { ...e, len: steps - e.step } : e);
  }
  return { events, total: steps, errors: parsed.errors };
}
