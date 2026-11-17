// 色の計算: HEX・rgb()・hsl() の変換、WCAG の見やすさの比（コントラスト比）、いちばん近い ARCADIA-91 の色。
// 文字と色の見本帳とお絵かきが使う。画面には触らない純粋な関数だけを置く（テストは tests/os-colors.test.mjs）。

// ARCADIA-91 の16色（os/css/arcadia.css の --fos-* と同じ色）。role は OS の中での役割
export const ARCADIA = [
  { hex: '#241734', name: '濃い紫', role: '文字と輪郭' },
  { hex: '#6e5d85', name: '藤色の灰', role: '弱い文字' },
  { hex: '#fffdf9', name: '真珠白', role: '作業面' },
  { hex: '#f4eef8', name: '大理石', role: '窓の枠' },
  { hex: '#cbbce0', name: '大理石の影', role: '枠の暗い縁' },
  { hex: '#fff6e3', name: 'クリーム', role: 'ボタンの面' },
  { hex: '#e6d2b5', name: 'クリームの影', role: 'ボタンの下の縁' },
  { hex: '#6bf2e3', name: 'ミント', role: '選択とタイトルの帯' },
  { hex: '#3ba89c', name: '深いミント', role: '押した部品の影' },
  { hex: '#cfaeff', name: 'ラベンダー', role: 'タイトルの帯とスクロール' },
  { hex: '#ff8ec7', name: '夕焼けピンク', role: 'タイトルの帯と閉じるボタン' },
  { hex: '#ff5c97', name: 'ローズ', role: '強い印' },
  { hex: '#ffd37a', name: 'アプリコット', role: '既定のボタン' },
  { hex: '#4b5fe8', name: 'コバルト', role: 'フォーカスの枠' },
  { hex: '#2d1b46', name: '落ち影', role: '窓の影' },
  { hex: '#140c24', name: '夜空', role: 'デスクトップの奥' },
];

export function parseHex(s) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(s).trim());
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
export const toHex = ({ r, g, b }) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

export function rgbToHsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  let h = 0, s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h: Math.round(h) % 360, s: Math.round(s * 100), l: Math.round(l * 100) };
}
export function formats(hex) {
  const c = parseHex(hex);
  if (!c) return null;
  const { h, s, l } = rgbToHsl(c);
  return { hex: toHex(c), rgb: `rgb(${c.r}, ${c.g}, ${c.b})`, hsl: `hsl(${h}, ${s}%, ${l}%)` };
}

// WCAG 2 の相対輝度と見やすさの比（小数2けたに丸める）
const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
export const luminance = ({ r, g, b }) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
export function contrast(a, b) {
  const x = luminance(parseHex(a)), y = luminance(parseHex(b));
  return Math.round(((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)) * 100) / 100;
}
export const grade = (ratio) => (ratio >= 7 ? 'AAA' : ratio >= 4.5 ? 'AA' : ratio >= 3 ? 'AA（大きい文字）' : '不可');

// いちばん近い色（人の目に合わせて緑を重く見る、簡単な重み付きの距離）
export function nearest(hex, palette = ARCADIA) {
  const c = parseHex(hex);
  let best = null, bd = Infinity;
  for (const p of palette) {
    const q = parseHex(p.hex), rm = (c.r + q.r) / 2;
    const d = Math.sqrt((2 + rm / 256) * (c.r - q.r) ** 2 + 4 * (c.g - q.g) ** 2 + (2 + (255 - rm) / 256) * (c.b - q.b) ** 2);
    if (d < bd) { bd = d; best = p; }
  }
  return { ...best, dist: Math.round(bd) };
}
