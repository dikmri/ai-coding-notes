// ファイルの拡張子と、開くアプリ・種類の名前の対応
import { extname } from './path.mjs';

export const TYPES = {
  '.txt': ['notepad', 'テキスト文書'], '.md': ['notepad', 'Markdown 文書'], '.log': ['notepad', 'ログ ファイル'],
  '.json': ['notepad', 'JSON データ'], '.csv': ['notepad', 'CSV データ'], '.html': ['notepad', 'HTML 文書'],
  '.lpm': ['modeler', 'ローポリ モデル'], '.obj': ['modeler', 'OBJ モデル'], '.mtl': ['notepad', 'OBJ の色の定義'],
  '.sng': ['synth', 'SID 風の曲'], '.wav': ['viewer', 'WAV 音声'],
  '.png': ['viewer', 'PNG 画像'], '.jpg': ['viewer', 'JPEG 画像'], '.jpeg': ['viewer', 'JPEG 画像'], '.gif': ['viewer', 'GIF 画像'], '.svg': ['viewer', 'SVG 画像'], '.webp': ['viewer', 'WebP 画像'],
};
export const appFor = (name) => (TYPES[extname(name).toLowerCase()] || [null])[0];
export const typeName = (name) => (TYPES[extname(name).toLowerCase()] || [null, (extname(name).slice(1).toUpperCase() || '') + ' ファイル'])[1].trim();
