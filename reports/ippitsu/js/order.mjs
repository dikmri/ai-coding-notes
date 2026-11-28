// 筆を描く順番を決める。依存なし。
// 写真: 長い輪郭 → 中くらいの線 → 短い線 → 斜線（大きな形から細部へ、陰影は最後）
// 線画: 外周（外の白に触れる筆） → 長い線 → 短い線
// 各段の中は、いまのペン先から近い筆を選び、近いほうの端から描く。
import { strokeLength } from './pen.mjs';

export const STAGES = {
  photo: ['長い輪郭', '中くらいの線', '短い線', '斜線'],
  photoBeta: ['長い輪郭', '中くらいの線', '短い線', 'ベタ', '点描'], // ベタ（kind 'fill'）があるとき
  photoManga: ['長い輪郭', '中くらいの線', '短い線', 'ベタ', 'トーン'], // 漫画原稿（トーン = kind 'tone'）
  lineart: ['外周', '長い線', '短い線'],
};

export function orderStrokes(strokes, { mode = 'photo', longLen = 80, midLen = 25, start = { x: 0, y: 0 } } = {}) {
  const hasFill = mode === 'photo' && strokes.some((s) => s.kind === 'fill' || s.kind === 'tone');
  for (const s of strokes) {
    const L = s.length ?? strokeLength(s.points);
    s.length = L;
    if (mode === 'lineart') s.stage = (s.outside ?? 0) > 0.5 && L >= 8 ? 0 : L >= longLen ? 1 : 2;
    else if (s.kind === 'fill') s.stage = 3;
    else if (s.kind === 'tone') s.stage = 4;
    else if (s.kind === 'dot') s.stage = hasFill ? 4 : 3;
    else s.stage = s.kind === 'hatch' ? 3 : L >= longLen ? 0 : L >= midLen ? 1 : 2;
  }
  const out = [];
  let pen = start;
  const nStages = hasFill ? STAGES.photoBeta.length : STAGES[mode].length;
  for (let stage = 0; stage < nStages; stage++) {
    const all = strokes.filter((s) => s.stage === stage);
    // 束（group）を持つ斜線は、段（level）ごとに、束を丸ごと作った順（seq）で描く。束どうしはペン先から近い順
    const grouped = all.filter((s) => s.group !== undefined);
    const rest = all.filter((s) => s.group === undefined);
    if (grouped.length) {
      const levels = [...new Set(grouped.map((s) => s.level ?? 0))].sort((a, b) => a - b);
      for (const lv of levels) {
        const groups = new Map();
        for (const s of grouped) if ((s.level ?? 0) === lv) (groups.get(s.group) ?? groups.set(s.group, []).get(s.group)).push(s);
        const list = [...groups.values()].map((g) => g.sort((a, b) => a.seq - b.seq));
        while (list.length) {
          let bi = 0, bd = Infinity;
          for (let k = 0; k < list.length; k++) {
            const a = list[k][0].points[0];
            const d = (a.x - pen.x) ** 2 + (a.y - pen.y) ** 2;
            if (d < bd) { bd = d; bi = k; }
          }
          const g = list[bi];
          list[bi] = list[list.length - 1];
          list.pop();
          out.push(...g);
          pen = g[g.length - 1].points.at(-1);
        }
      }
    }
    while (rest.length) {
      let bi = 0, bd = Infinity, rev = false;
      for (let k = 0; k < rest.length; k++) {
        const pts = rest[k].points;
        const a = pts[0], b = pts[pts.length - 1];
        const da = (a.x - pen.x) ** 2 + (a.y - pen.y) ** 2;
        if (da < bd) { bd = da; bi = k; rev = false; }
        if (!rest[k].closed) {
          const db = (b.x - pen.x) ** 2 + (b.y - pen.y) ** 2;
          if (db < bd) { bd = db; bi = k; rev = true; }
        }
      }
      const s = rest[bi];
      rest[bi] = rest[rest.length - 1];
      rest.pop();
      if (rev) s.points.reverse();
      out.push(s);
      pen = s.points[s.points.length - 1];
    }
  }
  return out;
}
