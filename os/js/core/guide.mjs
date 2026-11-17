// ガイドの台本: AI なしでもアシスタントが案内を再生できる、手順の並び（JSON）。形の確かめと、進め方。
// 台本の形: { id, title, app?, summary?, steps: [{ id, say, emotion?, target?, action?, waitFor? }] }
//  - target: { guideId } / { ref } / { selector } / { app } のどれか1つ（指さす相手）
//  - action: { tool, args }（core/agent.mjs の道具と同じ）
//  - waitFor: 'next'（吹き出しの「次へ」）/ 'target'（利用者が相手を押すまで）/ ミリ秒の数
// 第7弾の講座とアプリごとの入門は、この形の台本を書き足して作る。文は Gemini が清書する。
import { toolNames } from './agent.mjs';

export const EMOTIONS = ['idle_1', 'idle_2', 'blink', 'walk_1', 'walk_2', 'walk_3', 'fly_1', 'point_right', 'point_up', 'press_1', 'press_2', 'type_1', 'type_2', 'talk_1', 'talk_2', 'think_1', 'think_2', 'happy_1', 'apologize_1', 'ask_confirm'];
const TARGET_KEYS = ['guideId', 'ref', 'selector', 'app'];

export function validateScript(sc) {
  const err = [];
  if (!sc || typeof sc !== 'object') return ['台本がありません'];
  if (!sc.id) err.push('id がありません');
  if (!sc.title) err.push('title がありません');
  if (!Array.isArray(sc.steps) || !sc.steps.length) { err.push('steps がありません'); return err; }
  const tools = toolNames();
  sc.steps.forEach((st, i) => {
    const at = st.id || `${i + 1} 番目`;
    if (!st.id) err.push(`${at}: id がありません`);
    if (typeof st.say !== 'string' && !st.action) err.push(`${at}: say か action がいります`);
    if (st.waitFor !== undefined && !['next', 'target'].includes(st.waitFor) && !(typeof st.waitFor === 'number' && st.waitFor >= 0)) err.push(`${at}: waitFor は next・target・ミリ秒の数のどれかです`);
    if (st.target !== undefined) {
      const keys = Object.keys(st.target || {}).filter((k) => TARGET_KEYS.includes(k) && typeof st.target[k] === 'string');
      if (keys.length !== 1) err.push(`${at}: target は guideId・ref・selector・app のどれか1つです`);
    }
    if (st.waitFor === 'target' && !st.target) err.push(`${at}: waitFor が target のときは target がいります`);
    if (st.emotion !== undefined && !EMOTIONS.includes(st.emotion)) err.push(`${at}: emotion が知らない値です（${st.emotion}）`);
    if (st.action !== undefined && (!st.action || !tools.includes(st.action.tool) || (st.action.args && typeof st.action.args !== 'object'))) err.push(`${at}: action の tool が知らない道具です`);
  });
  return err;
}

// 進め方（状態は { i, done }）
export const start = () => ({ i: 0, done: false });
export const current = (sc, r) => (r.done ? null : sc.steps[r.i] ?? null);
export const next = (sc, r) => (r.i + 1 >= sc.steps.length ? { i: sc.steps.length, done: true } : { i: r.i + 1, done: false });
export const back = (sc, r) => ({ i: Math.max(0, Math.min(r.i, sc.steps.length) - (r.done ? 1 : r.i > 0 ? 1 : 0)), done: false });
export const progress = (sc, r) => `${Math.min(r.i + 1, sc.steps.length)} / ${sc.steps.length}`;
