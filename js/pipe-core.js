/* パイプ工房の中核: 「部品 引数 | 部品 引数 | …」を解析して順に実行する。
 * DOM に依存しないので Node でもテストできる。ブラウザでは window.DekiruPipeCore。 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DekiruPipeCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  // 引用符の外にある | と ｜ で段を区切る
  function splitStages(src) {
    const parts = [];
    let cur = '', q = null;
    for (const ch of String(src)) {
      if (q) { cur += ch; if (ch === q) q = null; continue; }
      if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
      if (ch === '|' || ch === '｜') { parts.push(cur); cur = ''; continue; }
      cur += ch;
    }
    parts.push(cur);
    return parts;
  }

  function tokenize(seg) {
    const out = [];
    const re = /"([^"]*)"?|'([^']*)'?|(\S+)/g;
    let m;
    const s = seg.replace(/　/g, ' ');
    while ((m = re.exec(s))) {
      if (m[1] !== undefined) out.push({ v: m[1], q: true });
      else if (m[2] !== undefined) out.push({ v: m[2], q: true });
      else out.push({ v: m[3], q: false });
    }
    return out;
  }

  function parsePipe(src) {
    const stages = [];
    for (const seg of splitStages(src)) {
      const toks = tokenize(seg);
      if (!toks.length) continue;
      const args = toks.slice(1).map((a) => {
        if (a.q) return a.v;
        const n = a.v.normalize('NFKC');
        return /^-?\d+(\.\d+)?$/.test(n) ? Number(n) : a.v;
      });
      stages.push({ name: toks[0].v.normalize('NFKC').toLowerCase(), args, raw: seg.trim() });
    }
    return stages;
  }

  function typeOf(v) {
    if (v === undefined || v === null) return 'none';
    if (typeof v === 'string') return 'text';
    if (typeof v === 'number') return 'num';
    if (Array.isArray(v)) return 'list';
    if (typeof v === 'object' && 'width' in v && 'height' in v && v.data) return 'image';
    if (typeof v === 'object' && typeof v.html === 'string') return 'html';
    return 'json';
  }

  function coerce(v, type) {
    const t = typeOf(v);
    switch (type) {
      case 'text':
        if (t === 'text') return v;
        if (t === 'num') return String(v);
        if (t === 'list') return v.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join('\n');
        if (t === 'image') throw new Error('画像は文字にできません（ascii を挟むと文字になります）');
        if (t === 'html') return v.html;
        return JSON.stringify(v, null, 2);
      case 'list':
        if (t === 'list') return v;
        if (t === 'text') return v.split(/\r?\n/).filter((s) => s.trim() !== '');
        if (t === 'num') return [v];
        if (t === 'json') return Object.entries(v);
        throw new Error('ここには並び（list）が必要です');
      case 'num': {
        if (t === 'num') return v;
        if (t === 'list') return v.length;
        if (t === 'text') {
          const n = parseFloat(v);
          if (Number.isNaN(n)) throw new Error(`「${v.slice(0, 20)}」は数に変換できません`);
          return n;
        }
        throw new Error('ここには数（num）が必要です');
      }
      case 'image':
        if (t === 'image') return v;
        throw new Error('ここには画像が必要です（camera・gradient・textimg などから始めます）');
      case 'json':
        if (t === 'text') { try { return JSON.parse(v); } catch { return v; } }
        return v;
      default:
        return v;
    }
  }

  function dist(a, b) {
    const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      let prev = dp[0];
      dp[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const tmp = dp[j];
        dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
        prev = tmp;
      }
    }
    return dp[b.length];
  }
  function unknownMessage(name, units) {
    let best = null, bd = 3;
    for (const k of Object.keys(units)) {
      const d = dist(name, k);
      if (d < bd) { bd = d; best = k; }
    }
    return `「${name}」という部品はありません。` + (best ? `もしかして ${best}？` : '部品辞典から探せます。');
  }

  async function execute(stages, units, ctx = {}) {
    const res = [];
    let value;
    for (let i = 0; i < stages.length; i++) {
      const st = stages[i];
      const u = units[st.name];
      const t0 = now();
      if (!u) { res.push({ ...st, error: unknownMessage(st.name, units), ms: 0 }); break; }
      try {
        let input = value;
        if (u.in === 'none') input = undefined;
        else if (u.in) {
          const optional = u.in.endsWith('?');
          const ty = u.in.replace('?', '');
          if (input === undefined) {
            if (!optional) throw new Error(`${st.name} の前に、材料を出す部品が必要です`);
          } else input = coerce(input, ty);
        }
        const out = await u.fn(input, st.args, ctx, i);
        value = out;
        res.push({ ...st, value: out, type: typeOf(out), ms: now() - t0 });
      } catch (e) {
        res.push({ ...st, error: (e && e.message) || String(e), ms: now() - t0 });
        break;
      }
    }
    return res;
  }

  return { parsePipe, splitStages, typeOf, coerce, execute, unknownMessage };
});
