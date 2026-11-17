// ファイルの拡張子と、開くアプリ・種類の名前の対応
import { extname } from './path.mjs';

export const TYPES = {
  '.txt': ['notepad', 'テキスト文書'], '.md': ['notepad', 'Markdown 文書'], '.log': ['notepad', 'ログ ファイル'],
  '.json': ['notepad', 'JSON データ'], '.csv': ['notepad', 'CSV データ'], '.html': ['notepad', 'HTML 文書'],
  '.lpm': ['modeler', 'ローポリ モデル'], '.obj': ['modeler', 'OBJ モデル'], '.mtl': ['notepad', 'OBJ の色の定義'],
  '.sng': ['synth', 'SID 風の曲'], '.wav': ['player', 'WAV 音声'], '.mp3': ['player', 'MP3 音声'], '.ogg': ['player', 'Ogg 音声'], '.oga': ['player', 'Ogg 音声'], '.opus': ['player', 'Opus 音声'],
  '.m4a': ['player', 'M4A 音声'], '.aac': ['player', 'AAC 音声'], '.flac': ['player', 'FLAC 音声'], '.weba': ['player', 'WebM 音声'], '.m3u': ['player', '再生の一覧'],
  '.png': ['viewer', 'PNG 画像'], '.jpg': ['viewer', 'JPEG 画像'], '.jpeg': ['viewer', 'JPEG 画像'], '.gif': ['viewer', 'GIF 画像'], '.svg': ['viewer', 'SVG 画像'], '.webp': ['viewer', 'WebP 画像'],
};
export const appFor = (name) => (TYPES[extname(name).toLowerCase()] || [null])[0];
export const typeName = (name) => (TYPES[extname(name).toLowerCase()] || [null, (extname(name).slice(1).toUpperCase() || '') + ' ファイル'])[1].trim();
