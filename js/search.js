/* 出来る！ 検索エンジン（ライブラリなし）
 * - 表記ゆれ: 全角/半角, カタカナ/ひらがな, ローマ字入力
 * - 演算子: tag: cat: api: code: lv: is:  -除外  "完全一致"  a|b(OR)
 * - あいまい: 飛び飛び一致, タイプミス許容(編集距離), 同義語
 * - 文章検索: Intl.Segmenter で単語に分けて探し直す
 * ブラウザでは window.DekiruSearch、Node では module.exports になる。 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DekiruSearch = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ---------- 正規化 ---------- */
  function kataToHira(s) {
    return s.replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
  }
  function normalize(s) {
    return kataToHira(String(s ?? '').normalize('NFKC').toLowerCase()).replace(/\s+/g, ' ').trim();
  }

  /* ---------- ローマ字 → ひらがな ---------- */
  const R = {};
  const base = {
    a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お',
    ka: 'か', ki: 'き', ku: 'く', ke: 'け', ko: 'こ', ga: 'が', gi: 'ぎ', gu: 'ぐ', ge: 'げ', go: 'ご',
    sa: 'さ', si: 'し', shi: 'し', su: 'す', se: 'せ', so: 'そ', za: 'ざ', zi: 'じ', ji: 'じ', zu: 'ず', ze: 'ぜ', zo: 'ぞ',
    ta: 'た', ti: 'ち', chi: 'ち', tu: 'つ', tsu: 'つ', te: 'て', to: 'と', da: 'だ', di: 'ぢ', du: 'づ', de: 'で', do: 'ど',
    na: 'な', ni: 'に', nu: 'ぬ', ne: 'ね', no: 'の', ha: 'は', hi: 'ひ', hu: 'ふ', fu: 'ふ', he: 'へ', ho: 'ほ',
    ba: 'ば', bi: 'び', bu: 'ぶ', be: 'べ', bo: 'ぼ', pa: 'ぱ', pi: 'ぴ', pu: 'ぷ', pe: 'ぺ', po: 'ぽ',
    ma: 'ま', mi: 'み', mu: 'む', me: 'め', mo: 'も', ya: 'や', yu: 'ゆ', yo: 'よ',
    ra: 'ら', ri: 'り', ru: 'る', re: 'れ', ro: 'ろ', wa: 'わ', wo: 'を',
    fa: 'ふぁ', fi: 'ふぃ', fe: 'ふぇ', fo: 'ふぉ', she: 'しぇ', je: 'じぇ', che: 'ちぇ',
    thi: 'てぃ', dhi: 'でぃ', thu: 'てゅ', dhu: 'でゅ', tsa: 'つぁ', wi: 'うぃ', we: 'うぇ',
    va: 'ゔぁ', vi: 'ゔぃ', vu: 'ゔ', ve: 'ゔぇ', vo: 'ゔぉ',
    xa: 'ぁ', xi: 'ぃ', xu: 'ぅ', xe: 'ぇ', xo: 'ぉ', la: 'ぁ', li: 'ぃ', lu: 'ぅ', le: 'ぇ', lo: 'ぉ',
    xya: 'ゃ', xyu: 'ゅ', xyo: 'ょ', lya: 'ゃ', lyu: 'ゅ', lyo: 'ょ',
    xtu: 'っ', ltu: 'っ', xtsu: 'っ', ltsu: 'っ', xwa: 'ゎ', lwa: 'ゎ', '-': 'ー',
  };
  Object.assign(R, base);
  // 拗音（きゃ・しゃ…）をまとめて作る
  const yoon = { ky: 'き', gy: 'ぎ', sy: 'し', sh: 'し', zy: 'じ', jy: 'じ', j: 'じ', ty: 'ち', cy: 'ち', ch: 'ち', dy: 'ぢ', ny: 'に', hy: 'ひ', by: 'び', py: 'ぴ', my: 'み', ry: 'り' };
  for (const [k, v] of Object.entries(yoon)) {
    R[k + 'a'] = v + 'ゃ'; R[k + 'u'] = v + 'ゅ'; R[k + 'o'] = v + 'ょ';
  }
  R.ji = 'じ'; R.chi = 'ち'; R.shi = 'し';
  const VOWEL_Y = 'aiueoy';

  function romajiToHira(input) {
    const s = String(input).toLowerCase();
    let out = '';
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      const n1 = s[i + 1];
      if (c === 'n') {
        if (n1 === undefined) { out += 'ん'; i++; continue; }
        if (n1 === "'") { out += 'ん'; i += 2; continue; }
        if (n1 === 'n') {
          const n2 = s[i + 2];
          out += 'ん';
          i += n2 && VOWEL_Y.includes(n2) ? 1 : 2;
          continue;
        }
        if (!VOWEL_Y.includes(n1)) { out += 'ん'; i++; continue; }
      }
      // 促音: 同じ子音が続く / tch
      if (/[bcdfghjklmpqrstvwxyz]/.test(c) && (n1 === c || (c === 't' && n1 === 'c' && s[i + 2] === 'h'))) {
        out += 'っ'; i++; continue;
      }
      let hit = false;
      for (let len = 4; len >= 1; len--) {
        const part = s.slice(i, i + len);
        if (part.length === len && R[part]) { out += R[part]; i += len; hit = true; break; }
      }
      if (!hit) { out += c; i++; }
    }
    return out;
  }

  // 検索語としてのローマ字 → ひらがな候補（入力途中の子音や末尾の n を考慮）
  function romajiQueryToKana(q) {
    if (!/^[a-z'-]+$/.test(q)) return [];
    const h = romajiToHira(q);
    const out = new Set();
    const stripped = h.replace(/[a-z']+$/, '');
    if (stripped && !/[a-z]/.test(stripped)) out.add(stripped);
    if (out.size && /[^n]n$/.test(q) && stripped.endsWith('ん') && stripped.length > 1) out.add(stripped.slice(0, -1));
    return [...out];
  }

  /* ---------- 同義語 ---------- */
  const SYN_GROUPS = [
    ['グラフ', 'chart', 'チャート', '図表', '可視化', 'ぐらふ'],
    ['音', 'おと', 'サウンド', 'sound', 'audio', 'オーディオ', '鳴らす', '鳴らし', '鳴る', '効果音', 'web audio'],
    ['アニメーション', 'アニメ', 'animation', '動き', '動く', 'モーション', 'うごき'],
    ['画像', 'image', '写真', 'ピクセル', 'pixel', 'がぞう'],
    ['ゲーム', 'game', '遊び', '遊ぶ', 'げーむ'],
    ['3d', '立体', '3次元', '三次元', 'りったい'],
    ['文字', 'テキスト', 'text', 'フォント', 'タイポグラフィ', 'もじ'],
    ['ぼかし', 'blur', 'ブラー', 'ぼかす'],
    ['光', '発光', 'グロー', 'glow', 'ネオン', 'ひかり', '光る'],
    ['カメラ', 'webcam', 'camera', 'ウェブカメラ'],
    ['マイク', 'mic', 'microphone', '録音'],
    ['時計', 'clock', '時刻', 'とけい'],
    ['タイマー', 'timer', 'ストップウォッチ'],
    ['色', 'カラー', 'color', '配色', 'いろ'],
    ['粒子', 'パーティクル', 'particle', 'りゅうし'],
    ['物理', 'physics', '重力', '衝突', 'ぶつり'],
    ['保存', 'ダウンロード', 'download', '書き出し', 'ほぞん'],
    ['入力', 'フォーム', 'form', 'input'],
    ['並べ替え', 'ソート', 'sort', '並び替え'],
    ['検索', 'search', '探す', '絞り込み', 'フィルタ'],
    ['ドラッグ', 'drag', 'ドロップ', 'ドラッグ&ドロップ'],
    ['スクロール', 'scroll'],
    ['レイアウト', 'layout', '配置', 'グリッド', 'grid'],
    ['暗号', '暗号化', 'ハッシュ', 'crypto'],
    ['キーボード', 'keyboard', 'キー'],
    ['マウス', 'mouse', 'ポインター', 'pointer', 'カーソル'],
    ['スマホ', 'モバイル', 'タッチ', 'touch', 'スマートフォン'],
    ['ランダム', '乱数', 'random', 'でたらめ'],
    ['数学', 'math', '計算', 'すうがく'],
    ['フラクタル', 'fractal'],
    ['影', 'シャドウ', 'shadow', 'かげ'],
    ['グラデーション', 'gradient'],
    ['モーダル', 'ダイアログ', 'dialog', 'modal', 'ポップアップ'],
    ['通知', 'notification', 'トースト', 'toast'],
    ['縦書き', 'vertical', 'writing-mode', 'たてがき'],
    ['和風', '和', '日本', 'japanese', 'わふう'],
    ['お絵かき', '描く', 'ペイント', 'paint', 'draw', '絵', 'おえかき'],
    ['読み上げ', 'しゃべる', '音声合成', 'speech', '喋る'],
    ['音声認識', '文字起こし', 'speech recognition'],
    ['3dcg', 'webgl', 'シェーダー', 'shader', 'glsl'],
    ['回転', 'rotate', '回る', 'くるくる'],
    ['桜', 'さくら', 'sakura', '花びら'],
    ['雪', 'ゆき', 'snow'],
    ['炎', '火', 'fire', 'ほのお'],
    ['水', '波', 'water', 'wave', '波紋'],
    ['星', 'star', 'ほし', '星空'],
    ['ボタン', 'button'],
    ['表', 'テーブル', 'table', '一覧'],
    ['メニュー', 'menu', 'ナビゲーション'],
    ['コピー', 'clipboard', 'クリップボード'],
    ['日付', 'date', 'カレンダー', 'calendar', '和暦'],
    ['ファイル', 'file', 'ファイル読み込み'],
    ['動画', 'video', '映像', 'ビデオ'],
    ['迷路', 'maze', 'めいろ'],
    ['パズル', 'puzzle'],
    ['線', 'ライン', 'line', '線画'],
    ['円', '丸', 'circle', 'まる'],
    ['きれい', '綺麗', '美しい', 'うつくしい', 'かっこいい', 'すごい'],
    // 英語で打たれたときのための対応
    ['花火', 'はなび', 'fireworks', 'firework'],
    ['マンデルブロ', 'mandelbrot'],
    ['ジュリア', 'julia'],
    ['フーリエ', 'fourier'],
    ['数独', 'すうどく', 'sudoku'],
    ['リバーシ', 'reversi', 'othello'],
    ['地雷探し', 'minesweeper', 'mines'],
    ['タイピング', 'typing'],
    ['グリッチ', 'glitch'],
    ['ピアノ', 'piano', 'keyboard instrument'],
    ['ツールチップ', 'tooltip'],
    ['タブ', 'tabs', 'tab'],
    ['アコーディオン', 'accordion'],
    ['カルーセル', 'carousel', 'slider'],
    ['やること', 'todo', 'タスク'],
    ['メモ', 'memo', 'note', 'notes'],
    ['エディタ', 'editor', '編集'],
    ['WebAssembly', 'wasm'],
    ['ヘビ', 'snake'],
    ['ブロック崩し', 'breakout', 'brick'],
    ['迷路', 'labyrinth'],
    ['布', 'cloth'],
    ['群れ', 'boids', 'flock'],
    ['煙', 'smoke'],
    ['雨', 'rain'],
    ['時計', 'watch'],
    ['電卓', 'calculator', '計算機'],
    ['録音', 'recorder', 'record'],
    ['ルーレット', 'roulette', 'wheel'],
    ['パスワード', 'password'],
    ['正規表現', 'regex', 'regexp'],
    ['差分', 'diff'],
    ['圧縮', 'compress', 'gzip'],
    ['ハート', 'heart'],
    ['ローディング', 'loading', 'spinner', '読み込み中'],
  ];
  const SYN = new Map();
  for (const g of SYN_GROUPS) {
    const n = [...new Set(g.map(normalize))];
    for (const w of n) {
      const set = SYN.get(w) || new Set();
      for (const x of n) if (x !== w) set.add(x);
      SYN.set(w, set);
    }
  }

  const STOP = new Set(['を', 'に', 'が', 'は', 'で', 'と', 'の', 'へ', 'も', 'や', 'から', 'まで', 'より', 'たい', 'したい', 'する', 'して', 'させ', 'させる', 'させたい', 'られる', 'れる', 'ます', 'です', 'いい', 'ような', 'よう', 'みたい', 'な', 'だ', 'ある', 'いる', 'こと', 'もの', 'やり', 'やりたい', 'つくり', 'つくる', '作り', '作る', '作りたい', 'たく', 'ない', '方法', 'やり方', 'ほしい', '欲しい', 'できる', '出来る', 'どう', 'どうやって', 'かんたん', '簡単', 'なに', '何', 'ため', 'それ', 'これ', 'あれ', 'みる', '見る', 'てみる', 'てみたい', 'し', 'た', 'て', 'い', 'う', 'した', 'しょう', 'なく', 'たら', 'れば', 'られ', 'せる', 'ほしい', 'たく', 'いる', 'ある', 'くれ', 'ください']);

  /* ---------- 文字列距離・あいまい一致 ---------- */
  function osa(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    const m = a.length, n = b.length;
    let prev2 = null, prev = Array.from({ length: n + 1 }, (_, j) => j), cur;
    for (let i = 1; i <= m; i++) {
      cur = [i];
      let rowMin = i;
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
        cur[j] = v;
        if (v < rowMin) rowMin = v;
      }
      if (rowMin > max) return max + 1;
      prev2 = prev; prev = cur;
    }
    return prev[n];
  }
  // 飛び飛び一致（例: まんぶろ → まんでるぶろ…）。広がりすぎた一致は捨てる
  function subseq(needle, hay) {
    let j = 0, start = -1;
    for (let i = 0; i < hay.length && j < needle.length; i++) {
      if (hay[i] === needle[j]) { if (start < 0) start = i; j++; if (j === needle.length) return (i - start + 1) < needle.length * 2; }
    }
    return false;
  }

  /* ---------- 索引 ---------- */
  function createIndex(entries, opts = {}) {
    const catLabel = opts.catLabel || (() => '');
    const items = entries.map((e, i) => {
      const tags = (e.tags || []).map(normalize);
      const words = new Set();
      for (const t of [...tags, normalize(e.t)]) for (const w of t.split(/[^a-z0-9]+/)) if (w.length >= 4) words.add(w);
      return {
        e, i,
        t: normalize(e.t), y: normalize(e.y), tags,
        d: normalize((e.d || '') + ' ' + (e.p || '')),
        cat: e.c, catL: normalize(catLabel(e.c)),
        api: (e.apis || []).map(normalize),
        code: normalize(e.code || ''),
        lv: e.lv, words: [...words],
      };
    });
    return { items };
  }

  /* ---------- 検索語の解析 ---------- */
  const FIELDS = { tag: 'tag', cat: 'cat', api: 'api', code: 'code', lv: 'lv', level: 'lv', is: 'is' };
  function parseQuery(q) {
    const s = String(q ?? '').normalize('NFKC');
    const re = /(-)?(?:([a-z]+):)?(?:"([^"]*)"?|(\S+))/gi;
    const out = [];
    let m;
    while ((m = re.exec(s))) {
      if (!m[0]) { re.lastIndex++; continue; }
      let field = m[2] ? FIELDS[m[2].toLowerCase()] : null;
      let body = m[3] !== undefined ? m[3] : m[4];
      // 未知のフィールド名は語の一部として扱う
      if (m[2] && !field) body = m[2] + ':' + body;
      const phrase = m[3] !== undefined;
      const alts = (phrase ? [body] : body.split('|')).map(normalize).filter(Boolean);
      if (!alts.length) continue;
      out.push({ field: field || null, neg: !!m[1], phrase, alts });
    }
    return out;
  }

  /* ---------- 採点 ---------- */
  function variantsOf(alt) {
    const v = [{ s: alt, w: 1 }];
    for (const k of romajiQueryToKana(alt)) if (k !== alt) v.push({ s: k, w: 0.95 });
    const base = v.map((x) => x.s);
    for (const b of base) {
      const syn = SYN.get(b);
      if (syn) for (const x of syn) v.push({ s: x, w: 0.7 });
    }
    return v;
  }
  function pos(hay, s, w) {
    const i = hay.indexOf(s);
    if (i < 0) return 0;
    return w * (hay === s ? 3 : i === 0 ? 2 : 1);
  }
  function scoreString(it, s, strict, noCat) {
    let sc = pos(it.t, s, 10) + pos(it.y, s, 8);
    for (const t of it.tags) sc += t === s ? 8 : t.includes(s) ? 4 : 0;
    if (!noCat && it.catL.includes(s)) sc += 3;
    if (it.d.includes(s)) sc += 3;
    for (const a of it.api) if (a.includes(s)) { sc += 3; break; }
    if (!strict && s.length >= 3 && it.code.includes(s)) sc += 1;
    if (sc || strict) return sc;
    if (s.length >= 3 && (subseq(s, it.t) || subseq(s, it.y))) sc += 2;
    if (/^[a-z]{4,}$/.test(s)) {
      const max = s.length >= 7 ? 2 : 1;
      for (const w of it.words) if (osa(s, w, max) <= max) { sc += 3; break; }
    }
    return sc;
  }
  function scoreField(it, term, alt, opts) {
    switch (term.field) {
      case 'tag': return it.tags.some((t) => t === alt || t.startsWith(alt)) ? 5 : 0;
      case 'cat': return it.cat === alt || it.catL.includes(alt) ? 5 : 0;
      case 'api': return it.api.some((x) => x.includes(alt)) ? 5 : 0;
      case 'code': return it.code.includes(alt) ? 5 : 0;
      case 'lv': return String(it.lv) === alt ? 5 : 0;
      case 'is': return opts.is && opts.is(alt, it.e) ? 5 : 0;
      default: return 0;
    }
  }
  function scoreTerm(it, term, opts) {
    let best = 0, sum = 0, hits = 0;
    for (const alt of term.alts) {
      let sc;
      if (term.field) sc = scoreField(it, term, alt, opts);
      else if (term.phrase || term.neg) sc = scoreString(it, alt, true, term.neg);
      else sc = Math.max(...variantsOf(alt).map((v) => v.w * scoreString(it, v.s, false)));
      best = Math.max(best, sc);
      sum += sc;
      if (sc > 0) hits++;
    }
    // 文章から取り出した言葉は、当たった言葉の数を掛けて「多くの言葉に当たる項目」を上にする
    return term.nl ? sum * hits : best;
  }
  function run(index, terms, opts) {
    const res = [];
    outer: for (const it of index.items) {
      let total = 0;
      for (const t of terms) {
        const sc = scoreTerm(it, t, opts);
        if (t.neg) { if (sc > 0) continue outer; }
        else if (sc <= 0) continue outer;
        else total += sc;
      }
      res.push({ entry: it.e, score: total, i: it.i });
    }
    res.sort((a, b) => b.score - a.score || a.i - b.i);
    return res.map(({ entry, score }) => ({ entry, score }));
  }

  /* ---------- 文章 → 単語 ---------- */
  let segmenter = null;
  function segment(text) {
    if (typeof Intl === 'undefined' || !Intl.Segmenter) return [];
    segmenter = segmenter || new Intl.Segmenter('ja', { granularity: 'word' });
    const out = [];
    for (const s of segmenter.segment(text)) if (s.isWordLike) out.push(s.segment);
    return out;
  }
  function looksLikeSentence(a) {
    if (a.length < 3) return false;
    if (/[一-鿿]/.test(a) && /[぀-ゟ]/.test(a)) return true;
    return /を|したい|たい$|ほしい|には/.test(a) && a.length >= 5;
  }
  function rewriteNatural(terms, query) {
    let changed = false;
    // ひらがなに直してから分けると「カメラ」が「かめ」「ら」に割れるので、元の表記のまま分ける
    const raw = String(query ?? '').normalize('NFKC').trim().split(/\s+/);
    const out = terms.map((t, i) => {
      if (t.field || t.neg || t.phrase || t.alts.length !== 1 || !looksLikeSentence(t.alts[0])) return t;
      const src = raw.length === terms.length ? raw[i] : t.alts[0];
      const words = segment(src).map(normalize)
        .filter((w) => !STOP.has(w) && !/^[぀-ゟ]$/.test(w));
      if (!words.length) return t;
      changed = true;
      return { field: null, neg: false, phrase: false, alts: [...new Set(words)], nl: true };
    });
    if (!changed) return null;
    return { terms: out, text: out.map((t) => t.alts.join(' | ')).join(' ・ ') };
  }

  /* ---------- 提案（もしかして） ---------- */
  function suggestFor(index, terms) {
    const q = terms.filter((t) => !t.neg && !t.field).map((t) => t.alts[0]).join('');
    if (!q) return null;
    let best = null, bestScore = Infinity;
    for (const it of index.items) {
      const cands = [[it.t, it.e.t], [it.y, it.e.t], ...it.tags.map((t, k) => [t, it.e.tags[k]])];
      for (const [norm, disp] of cands) {
        const max = Math.max(1, Math.floor(Math.max(norm.length, q.length) * 0.4));
        const d = osa(q, norm, max);
        if (d <= max) {
          const r = d / Math.max(norm.length, q.length);
          if (r < bestScore) { bestScore = r; best = disp; }
        }
      }
    }
    return best;
  }

  function search(index, query, opts = {}) {
    const terms = parseQuery(query);
    if (!terms.length) return { items: index.items.map((it) => ({ entry: it.e, score: 0 })), rewritten: null, suggest: null, terms };
    let items = run(index, terms, opts);
    let rewritten = null, suggest = null, used = terms;
    if (!items.length) {
      const nl = rewriteNatural(terms, query);
      if (nl) { items = run(index, nl.terms, opts); rewritten = nl.text; used = nl.terms; }
    }
    if (!items.length) suggest = suggestFor(index, terms);
    return { items, rewritten, suggest, terms: used };
  }

  /* ---------- 強調表示の位置 ---------- */
  function needlesOf(terms) {
    const out = new Set();
    for (const t of terms || []) {
      if (t.neg || (t.field && t.field !== 'tag')) continue;
      for (const a of t.alts) { out.add(a); for (const k of romajiQueryToKana(a)) out.add(k); }
    }
    return [...out].filter((s) => s.length > 0);
  }
  function findRanges(text, needles) {
    let norm = '';
    const map = [];
    for (let i = 0; i < text.length; i++) {
      const n = kataToHira(text[i].normalize('NFKC').toLowerCase());
      for (let k = 0; k < n.length; k++) map.push(i);
      norm += n;
    }
    const ranges = [];
    for (const nd of needles) {
      if (!nd) continue;
      let from = 0, at;
      while ((at = norm.indexOf(nd, from)) >= 0) {
        ranges.push([map[at], map[at + nd.length - 1] + 1]);
        from = at + nd.length;
      }
    }
    ranges.sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const r of ranges) {
      const last = merged[merged.length - 1];
      if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
      else merged.push(r.slice());
    }
    return merged;
  }

  return { normalize, kataToHira, romajiToHira, romajiQueryToKana, parseQuery, createIndex, search, findRanges, needlesOf, segment, SYN_GROUPS };
});
