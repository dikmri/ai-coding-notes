// ドット絵の描画。絵は「色の表 + 1マスずつの並び」のデータ（Gemini が描いたもの）で持ち、最初に使うときに canvas へ描いて取っておく。
// 同じ絵から、白く光る版（攻撃を受けたとき）と、紫の翳りを帯びた版（周回で出る精鋭）も作る。
export const T = 16;

export function makeGfx(data) {
  const sprites = (data && data.sprites) || {};
  const cache = new Map();
  const tint = (hex, kind) => {
    const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    if (kind === 'white') return '#ffffff';
    if (kind === 'elite') return `rgb(${Math.round(r * 0.6 + 163 * 0.4)},${Math.round(g * 0.55 + 59 * 0.45)},${Math.round(b * 0.6 + 108 * 0.4)})`;
    if (kind === 'shadow') return 'rgba(20,19,34,0.45)';
    return hex;
  };
  function build(id, frame, kind) {
    const s = sprites[id];
    if (!s || !s.frames[frame]) return null;
    const c = document.createElement('canvas'); c.width = s.w; c.height = s.h;
    const g = c.getContext('2d'), col = {};
    for (const p of s.palette) col[p.key] = tint(p.color, kind);
    s.frames[frame].forEach((row, y) => { [...row].forEach((ch, x) => { if (ch !== '.' && col[ch]) { g.fillStyle = col[ch]; g.fillRect(x, y, 1, 1); } }); });
    return c;
  }
  // 絵が無いとき（素材がまだ無いとき）の代わり。名前から色を決めた四角
  function placeholder(id, w, h) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    let hsh = 0; for (const ch of id) hsh = (hsh * 31 + ch.charCodeAt(0)) >>> 0;
    g.fillStyle = `hsl(${hsh % 360} 55% 60%)`; g.fillRect(1, 1, w - 2, h - 2);
    g.strokeStyle = '#141322'; g.strokeRect(0.5, 0.5, w - 1, h - 1);
    return c;
  }
  return {
    has: (id, frame) => !!(sprites[id] && (frame == null || sprites[id].frames[frame])),
    size: (id) => (sprites[id] ? [sprites[id].w, sprites[id].h] : null),
    frames: (id) => (sprites[id] ? Object.keys(sprites[id].frames) : []),
    get(id, frame, kind = 'normal', fallback = [16, 16]) {
      const key = id + '/' + frame + '/' + kind;
      if (!cache.has(key)) cache.set(key, build(id, frame, kind) || placeholder(id + frame, ...(sprites[id] ? [sprites[id].w, sprites[id].h] : fallback)));
      return cache.get(key);
    },
  };
}

// タイルの名前 → 絵（シートの名前とコマ）。t はミリ秒（波などの動き）、state は仕掛けの状態
const SHEET = {
  sand_plain: 'tiles-sand', sand_shell: 'tiles-sand', sand_wet: 'tiles-sand', sea_shallow: 'tiles-sand', sea_deep: 'tiles-sand',
  checker_white: 'tiles-marble', checker_black: 'tiles-marble', marble_floor: 'tiles-marble', marble_cracked: 'tiles-marble', marble_stairs: 'tiles-marble',
  marble_wall: 'tiles-marble', pillar: 'tiles-marble', pillar_broken: 'tiles-marble',
  village_path: 'tiles-village', village_grass: 'tiles-village', palm_tree: 'tiles-village', house_wall: 'tiles-village', house_roof: 'tiles-village', wood_pier: 'tiles-village', fountain: 'tiles-village',
  obelisk: 'tiles-dungeon', switch: 'tiles-dungeon', gate: 'tiles-dungeon', chest: 'tiles-dungeon',
};
export function tileFrame(tile, t, state) {
  const sheet = SHEET[tile];
  if (!sheet) return null;
  switch (tile) {
    case 'sea_shallow': return [sheet, 'sea_shallow-' + (Math.floor(t / 480) % 2)];
    case 'sea_deep': return [sheet, 'sea_deep-' + (Math.floor(t / 360) % 3)];
    case 'pillar': return [sheet, 'pillar_base'];
    case 'fountain': return [sheet, 'fountain-' + (Math.floor(t / 240) % 2)];
    case 'obelisk': return [sheet, 'obelisk-' + (Math.floor(t / 400) % 2)];
    case 'switch': return [sheet, state ? 'switch-on' : 'switch-off'];
    case 'gate': return [sheet, state ? 'gate-open' : 'gate-closed'];
    case 'chest': return [sheet, state ? 'chest-open' : 'chest-closed'];
    default: return [sheet, tile];
  }
}
// 床として下に敷く色（タイルの絵が透けるところ）
export const GROUND = {
  sand_plain: '#f2efe4', sand_shell: '#f2efe4', sand_wet: '#c4b099', sea_shallow: '#64d6ca', sea_deep: '#167a85',
  checker_white: '#dce0ed', checker_black: '#232238', marble_floor: '#dce0ed', marble_cracked: '#b5b4cc', marble_stairs: '#dce0ed',
  marble_wall: '#7c789e', pillar: '#dce0ed', pillar_broken: '#dce0ed', village_path: '#dfd3c3', village_grass: '#5bb379', palm_tree: '#5bb379',
  house_wall: '#dce0ed', house_roof: '#bd6e92', wood_pier: '#8c6d53', fountain: '#dce0ed', obelisk: '#dce0ed', switch: '#232238', gate: '#7c789e', chest: '#dce0ed',
};
