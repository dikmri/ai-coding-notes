// API キーの置き場所: このブラウザの localStorage の fos-ai-secrets。仮想ドライブ（IndexedDB）には置かないので、
// AI のファイルの道具からも、作ったアプリ（出どころのない枠）からも届かない。
// 鍵そのものを読むのは対話の部品（assistant/chat.mjs）だけ。設定の画面には末尾4文字だけを出す。記録には書かない
import { PROVIDERS } from '../core/agent-loop.mjs';

const STORE = 'fos-ai-secrets';
const load = () => { try { const v = JSON.parse(localStorage.getItem(STORE) || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; } };
const save = (v) => localStorage.setItem(STORE, JSON.stringify(v));

export const hasKey = (provider) => !!load()[provider];
export const keyTail = (provider) => String(load()[provider] || '').slice(-4);
export const getKey = (provider) => String(load()[provider] || '');
export function setKey(provider, key) {
  if (!PROVIDERS[provider]) throw new Error('知らない提供元です: ' + provider);
  const v = load(); v[provider] = String(key).trim(); save(v);
}
export function clearKey(provider) { const v = load(); delete v[provider]; save(v); }
// 鍵の形が提供元の鍵らしいか（違えば、登録の前に利用者に確かめる）
export const looksLike = (provider, key) => String(key).trim().startsWith(PROVIDERS[provider]?.keyHint || '');

// 使う AI（提供元とモデル）。鍵ではないので、OS の設定（fos-settings）に置く
export function aiConfig(settings) {
  const provider = PROVIDERS[settings?.aiProvider] ? settings.aiProvider : 'anthropic';
  const model = String(settings?.aiModels?.[provider] || '').trim() || PROVIDERS[provider].models[0];
  return { provider, model, label: PROVIDERS[provider].label, ready: hasKey(provider) };
}
