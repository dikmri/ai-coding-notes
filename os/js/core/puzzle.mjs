// パズル「プリズム回廊」の計算: 盤面の読み取り、光の道、交わり、解く計算、全10面。画面には触らない（テストは tests/os-puzzle.test.mjs）。
//
// 規則
// - 光源（> v < ^）は白い光をまっすぐ出す。床（.）と海（~）は素通り。柱（O）・盤の外・光源で止まる。
// - 鏡（1 = /、2 = \）はどの色の光も 90 度曲げる。押すと / と \ が入れ替わる。
// - 分光プリズム（N 上・E 右・S 下・P 左向き）は、向いている側（正面）から入った白い光だけを、
//   進む向きの左へミント、右へピンクに分ける。正面以外から入った光や、白以外の光はそこで止まる。押すと時計回りに 90 度回る。
// - 床か海の同じマスを、ミントとピンクが縦と横に通ると、そのマスから先は両方ともアプリコットになる。
// - 水晶（W 白・M ミント・K ピンク・A アプリコット）は光を止める。届いた光がすべて水晶の色なら満たされる。
//   盤の水晶をすべて同時に満たせば解ける。
// 鏡とプリズムは押す順番に関係なく、最後の向きだけで光の道が決まる。だから、すべての向きの組み合わせを調べれば解ける。

const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0]; // 向き: 0 上、1 右、2 下、3 左
const SOURCES = { '^': 0, '>': 1, v: 2, '<': 3 };
const PRISMS = { N: 0, E: 1, S: 2, P: 3 };
const CRYSTALS = { W: 'white', M: 'mint', K: 'pink', A: 'apricot' };
export const COLORS = ['white', 'mint', 'pink', 'apricot'];
// 鏡で曲がった先の向き。/ : 上→右、右→上、下→左、左→下。\ : 上→左、左→上、下→右、右→下
const SLASH = [1, 0, 3, 2], BACK = [3, 2, 1, 0];

export function parse(rows) {
  const h = rows.length, w = Math.max(...rows.map((r) => r.length));
  const cells = [], pieces = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = rows[y][x] ?? '.';
    cells.push(c);
    if (c === '1' || c === '2') pieces.push({ x, y, kind: 'mirror', init: c === '1' ? 0 : 1 });
    else if (c in PRISMS) pieces.push({ x, y, kind: 'prism', init: PRISMS[c] });
  }
  const at = new Map(pieces.map((p, i) => [p.y * w + p.x, i]));
  const crystals = [];
  cells.forEach((c, i) => { if (c in CRYSTALS) crystals.push({ x: i % w, y: Math.floor(i / w), color: CRYSTALS[c] }); });
  return { w, h, cells, pieces, at, crystals };
}
export const initState = (b) => b.pieces.map((p) => p.init);
export const states = (p) => (p.kind === 'mirror' ? 2 : 4);
// i 番目の部品を1回押した向き（鏡は入れ替え、プリズムは時計回り）
export function turn(b, state, i) { const s = state.slice(); s[i] = (s[i] + 1) % states(b.pieces[i]); return s; }
// 部品を from から to の向きにするのに要る手数
const dist = (p, from, to) => (to - from + states(p)) % states(p);

// 同じマスを、ミントとピンクが縦と横に通ったマス（"x,y"）
export function mixCells(passes) {
  const by = new Map();
  for (const p of passes) {
    if (p.color !== 'mint' && p.color !== 'pink') continue;
    const k = `${p.x},${p.y}`;
    if (!by.has(k)) by.set(k, new Set());
    by.get(k).add(p.color + ':' + p.axis);
  }
  const out = new Set();
  for (const [k, s] of by) if ((s.has('mint:h') && s.has('pink:v')) || (s.has('mint:v') && s.has('pink:h'))) out.add(k);
  return out;
}

// 交わるマスを決めたうえで、光を1回たどる
function run(b, state, mixes) {
  const { w, h, cells } = b;
  const segs = [], passes = [], hits = new Map(), seen = new Set();
  const queue = [];
  cells.forEach((c, i) => { if (c in SOURCES) queue.push({ x: i % w, y: Math.floor(i / w), d: SOURCES[c], color: 'white' }); });
  // 光は1マスずつ進む。segs は「マスの中心からの線」で、len は 1（次のマスの中心まで）か 0.5（マスの縁で止まる）
  while (queue.length) {
    let { x, y, d, color } = queue.shift();
    for (let guard = 0; guard < 400; guard++) {
      const nx = x + DX[d], ny = y + DY[d];
      const key = `${nx},${ny},${d},${color}`;
      if (seen.has(key)) break;
      seen.add(key);
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) { segs.push({ x, y, d, color, len: 0.5 }); break; }
      const c = cells[ny * w + nx];
      const pi = b.at.get(ny * w + nx), prismOff = pi !== undefined && b.pieces[pi].kind === 'prism' && (color !== 'white' || d !== (state[pi] + 2) % 4);
      if (c === 'O' || c in SOURCES || prismOff) { segs.push({ x, y, d, color, len: 0.5 }); break; } // 縁で止まる
      if (c in CRYSTALS) {
        segs.push({ x, y, d, color, len: 1 });
        const k = ny * w + nx;
        if (!hits.has(k)) hits.set(k, new Set());
        hits.get(k).add(color);
        break;
      }
      segs.push({ x, y, d, color, len: 1 });
      x = nx; y = ny;
      if (c === '.' || c === '~') {
        passes.push({ x, y, axis: d % 2 ? 'h' : 'v', color });
        if (mixes.has(`${x},${y}`) && (color === 'mint' || color === 'pink')) color = 'apricot';
        continue;
      }
      if (b.pieces[pi].kind === 'mirror') { d = state[pi] === 0 ? SLASH[d] : BACK[d]; continue; }
      // プリズム（正面から入った白い光だけがここまで来る。正面から入る光は、向いている向きの反対へ進んでいる）
      queue.push({ x, y, d: (d + 1) % 4, color: 'pink' });
      d = (d + 3) % 4; color = 'mint';
    }
  }
  return { segs, passes, hits };
}

// 光の道と、水晶の満たされ方。交わるマスが変わらなくなるまで、たどり直す
export function trace(b, state) {
  let mixes = new Set(), r;
  for (let i = 0; i < 8; i++) {
    r = run(b, state, mixes);
    const next = mixCells(r.passes);
    if (next.size === mixes.size && [...next].every((k) => mixes.has(k))) break;
    mixes = next;
  }
  const hits = b.crystals.map((c) => {
    const colors = r.hits.get(c.y * b.w + c.x) || new Set();
    return { ...c, colors, full: colors.size > 0 && [...colors].every((k) => k === c.color) };
  });
  return { segs: r.segs, mixes, hits, lit: hits.filter((h) => h.full).length, won: hits.length > 0 && hits.every((h) => h.full) };
}

// すべての解き方（向きの組み合わせ）を、from からの手数とともに数え上げる
function* winners(b, from) {
  const n = b.pieces.length, s = new Array(n).fill(0);
  const total = b.pieces.reduce((t, p) => t * states(p), 1);
  for (let k = 0; k < total; k++) {
    let r = k;
    for (let i = 0; i < n; i++) { const m = states(b.pieces[i]); s[i] = r % m; r = Math.floor(r / m); }
    if (trace(b, s).won) yield { moves: s.reduce((t, o, i) => t + dist(b.pieces[i], from[i], o), 0), state: s.slice() };
  }
}
// いちばん少ない手数の解き方。from を省くと最初の向きから。解けなければ null
export function solve(b, from = initState(b)) {
  let best = null;
  for (const s of winners(b, from)) if (!best || s.moves < best.moves) best = s;
  return best;
}
// ヒント: 今の向きからいちばん近い解き方で、まだ合っていない部品の番号。もう解けているか解けないなら -1
export function hintPiece(b, state) {
  const s = solve(b, state);
  if (!s || s.moves === 0) return -1;
  return s.state.findIndex((o, i) => o !== state[i]);
}

// 全10面。題名と流れは Gemini の企画書から。盤は解く計算で確かめて作り直した（どの面も解き方は1通り）。
// par は解く計算で確かめた、いちばん少ない手数
export const LEVELS = [
  { title: '最初の反射', par: 1, hint: '鏡を押すと、/ と \\ が入れ替わります。白い光を下へ曲げて、海の向こうの白い水晶へ届けましょう。', map: ['.....', '.>..1', '....~', '....W', '.....'] },
  { title: '柱の回り道', par: 2, hint: '柱は光を通しません。3枚の鏡で柱の下を回り、右上の水晶へ届けましょう。1枚は、もう正しい向きです。', map: ['......', '.>1O.W', '......', '..1..1', '......'] },
  { title: '分光のはじまり', par: 2, hint: 'プリズムは、向いている側から入った白い光だけを分けます。光源のある左へ向けましょう。', map: ['..M..', '.....', '>.E..', '.....', '..K..'] },
  { title: '左右の入れ替え', par: 3, hint: '下へ進む光がプリズムで分かれると、画面の右へミント、左へピンクが出ます。プリズムを、光の来る上へ向けましょう。', map: ['..v...', '......', 'K.S..1', '......', '.....M'] },
  { title: '海を渡る二色', par: 3, hint: '鏡で光を上のプリズムへ送りましょう。下から入った光は、左へミント、右へピンクに分かれます。', map: ['.......', 'M~~N~~K', '>..2...', '.......', '...O...'] },
  { title: '夕陽の共鳴', par: 3, hint: 'ミントとピンクが同じマスを縦と横に通ると、その先は両方アプリコットになります。2本の光を右下で十字に交わらせましょう。', map: ['..2.2.', '......', '>.S...', '......', '..1..A', '....A.'] },
  { title: '双子のプリズム', par: 4, hint: '左右の光源から、それぞれのプリズムへ光を入れます。下の鏡は、下へ出た光を隅の水晶へ送ります。', map: ['..M...K..', '.........', '>.S...N.<', '.........', 'K.2...1.M'] },
  { title: '潮騒の交差点', par: 4, hint: '中央のプリズムで分けた光を、左の列と下の行へ送り、左下の海で十字に交わらせましょう。', map: ['...v...', '.......', '.2.S.1.', '.~...~.', '.~...~.', 'O~~~~1.', '.A.....'] },
  { title: '三色の神殿', par: 5, hint: '左のプリズムでミントとピンクを分けます。右下の光源の白い光は、2枚の鏡で白の水晶へ送りましょう。', map: ['M.1......', '.........', '>.S...2.W', '......~..', 'K.2...~..', '.........', '......1.<'] },
  { title: 'アルカディアの祭壇', par: 6, hint: '上のプリズムのピンクを下へまっすぐ送り、右のプリズムから出るミントと、左下で十字に交わらせましょう。', map: ['..M......', '>.E...2.K', '.........', '....O....', '......P.<', 'O.....2..', '..A......'] },
];
