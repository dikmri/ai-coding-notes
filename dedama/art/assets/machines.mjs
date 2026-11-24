// パチンコ台 10 種（60×104 × 10）。共通の筐体に、台ごとの枠の色・上の飾り・液晶の絵。題材はすべてオリジナル。
const THEMES = [
  { id: 'dynamite', main: 'org1', dark: 'org0', light: 'org2', board: 'gold3', crest: 'red2' },
  { id: 'hamster', main: 'pnk1', dark: 'pur1', light: 'white', board: 'pale2', crest: 'gold2' },
  { id: 'train', main: 'blu1', dark: 'blu0', light: 'blu2', board: 'pale1', crest: 'gold2' },
  { id: 'crab', main: 'pur1', dark: 'pur0', light: 'pur2', board: 'pale0', crest: 'red2' },
  { id: 'daibutsu', main: 'gold1', dark: 'gold0', light: 'gold2', board: 'brn3', crest: 'pur1' },
  { id: 'hanabi', main: 'red1', dark: 'red0', light: 'red2', board: 'brn3', crest: 'gold2' },
  // 2026-11-24 に足した 4 台
  { id: 'sushi', main: 'grn1', dark: 'grn0', light: 'grn2', board: 'brn3', crest: 'red2' },
  { id: 'laundry', main: 'sky0', dark: 'blu0', light: 'sky2', board: 'night1', crest: 'blu4' },
  { id: 'yokozuna', main: 'brn1', dark: 'brn0', light: 'brn2', board: 'brn3', crest: 'pur1' },
  { id: 'maneki', main: 'red2', dark: 'red0', light: 'red3', board: 'gold3', crest: 'gold2' },
];

function cabinet(d, t) {
  // 外枠
  d.rect(2, 2, 56, 102, t.dark).rect(3, 3, 54, 100, t.main);
  d.line(3, 3, 3, 102, t.light).line(4, 3, 56, 3, t.light);
  // 盤面（ガラスの奥の板）と外のレール
  d.oval(5, 15, 50, 60, 'gray1').oval(6, 16, 48, 58, t.board);
  d.oval(6, 16, 48, 58, 'gold1', false).oval(8, 18, 44, 54, 'gold0', false);
  // 釘（左右に互い違い）
  for (let y = 24; y < 70; y += 4) for (let x = 10; x < 51; x += 4) {
    const xx = x + ((y / 4) % 2 ? 2 : 0);
    const inBoard = ((xx - 30) / 22) ** 2 + ((y - 45) / 27) ** 2 < 1;
    const inLcd = xx > 14 && xx < 46 && y > 24 && y < 54;
    if (inBoard && !inLcd) d.px(xx, y, 'gray0');
  }
  // 液晶の枠（台ごとの絵は lcd() が描く）
  d.rect(14, 24, 32, 28, 'gray0').rect(15, 25, 30, 26, 'ink');
  // ヘソ（始動口）・電チュー・アタッカー
  d.rect(28, 56, 5, 3, 'gold1').px(30, 57, 'ink');
  d.rect(42, 58, 5, 3, 'blu2').px(44, 59, 'ink');
  d.rect(22, 64, 16, 4, 'gray2').line(23, 65, 36, 65, 'red2');
  // ガラスの光り
  d.line(9, 30, 15, 22, 'white').line(10, 33, 13, 29, 'white');
  // 下の皿・ハンドル
  d.rect(4, 76, 52, 12, 'gray3').rect(4, 76, 52, 2, 'white').rect(6, 80, 38, 6, 'gray2');
  for (let i = 0; i < 9; i++) d.px(8 + i * 4, 82, 'white').px(9 + i * 4, 83, 'gray1');
  d.rect(4, 89, 52, 13, t.dark).rect(6, 92, 34, 8, 'gray1').rect(7, 93, 32, 6, 'shade1');
  d.oval(44, 88, 11, 11, 'gray0').oval(45, 89, 9, 9, 'shade0').oval(47, 91, 5, 5, 'red2').px(48, 92, 'red3');
}

function crest(d, t, i) {
  d.rect(5, 4, 50, 11, t.dark);
  // 上の電飾
  for (let x = 6; x < 55; x += 3) d.px(x, 5, (x / 3) % 2 ? 'gold2' : 'white');
  const c = t.crest;
  if (t.id === 'dynamite') { // 導火線つきの赤い筒が 3 本
    for (const x of [18, 27, 36]) d.rect(x, 6, 6, 8, c).line(x, 6, x, 13, 'red3').line(x + 3, 6, x + 5, 3, 'gold1').px(x + 5, 2, 'white').px(x + 6, 2, 'gold2');
  } else if (t.id === 'hamster') { // 丸い耳
    d.oval(12, 4, 12, 11, 'brn2').oval(15, 6, 6, 6, 'pnk0').oval(36, 4, 12, 11, 'brn2').oval(39, 6, 6, 6, 'pnk0');
  } else if (t.id === 'train') { // 前照灯と金の帯
    d.rect(8, 8, 44, 3, c).oval(24, 5, 12, 9, 'gold3').oval(27, 7, 6, 5, 'white');
  } else if (t.id === 'crab') { // 振り上げたはさみ
    d.poly([[8, 14], [12, 5], [18, 5], [16, 9], [20, 9], [16, 14]], c).poly([[52, 14], [48, 5], [42, 5], [44, 9], [40, 9], [44, 14]], c);
    d.rect(25, 7, 10, 5, 'ink').rect(23, 11, 14, 2, 'ink').px(30, 9, 'white');
  } else if (t.id === 'daibutsu') { // 後光
    d.oval(18, 2, 24, 16, 'gold2', false).oval(21, 4, 18, 13, 'gold3', false).oval(25, 6, 10, 9, c);
  } else if (t.id === 'hanabi') { // 花火
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; d.line(30, 9, 30 + Math.cos(a) * 6, 9 + Math.sin(a) * 5, k % 2 ? 'gold2' : 'pnk0'); }
    d.px(30, 9, 'white');
  } else if (t.id === 'sushi') { // レーンを流れる皿
    d.rect(6, 11, 48, 3, 'gray2').line(6, 11, 53, 11, 'gray3');
    [['red2', 'red3'], ['gold2', 'org2'], ['blu2', 'pnk1'], ['red2', 'gold3']].forEach(([rim, fish], k) => {
      const x = 9 + k * 11;
      d.oval(x, 8, 9, 5, 'white').oval(x, 8, 9, 5, rim, false).rect(x + 2, 8, 5, 2, 'white').rect(x + 2, 7, 5, 1, fish);
    });
  } else if (t.id === 'laundry') { // 泡
    for (const [x, y, r] of [[9, 6, 6], [17, 8, 4], [24, 5, 7], [33, 7, 5], [40, 5, 6], [48, 8, 4]]) d.oval(x, y, r, r, c, false).px(x + 1, y + 1, 'white');
  } else if (t.id === 'yokozuna') { // 土俵の吊り屋根と四隅の房
    d.poly([[8, 11], [30, 4], [52, 11]], c).line(8, 11, 52, 11, 'gold2').line(14, 9, 46, 9, 'pur2');
    d.rect(8, 11, 3, 3, 'grn2').rect(49, 11, 3, 3, 'white').rect(20, 11, 3, 3, 'red2').rect(37, 11, 3, 3, 'blu2');
  } else if (t.id === 'maneki') { // 小判が 4 枚
    for (const x of [9, 20, 31, 42]) d.oval(x, 5, 9, 8, c).oval(x + 1, 6, 7, 6, 'gold3', false).line(x + 3, 8, x + 5, 8, 'gold0').line(x + 3, 10, x + 5, 10, 'gold0');
  }
}

function lcd(d, t) {
  const X = 15, Y = 25; // 30×26
  const R = (x, y, w, h, c) => d.rect(X + x, Y + y, w, h, c);
  if (t.id === 'dynamite') {
    R(0, 0, 30, 26, 'org1'); R(0, 0, 30, 10, 'org2');
    for (let x = 0; x < 30; x += 4) { R(x, 10, 2, 3, 'red2'); R(x + 2, 10, 2, 3, 'white'); } // 商店街の日よけ
    R(0, 13, 30, 9, 'brn1'); R(3, 15, 5, 7, 'gold3'); R(22, 15, 5, 7, 'gold3');
    R(11, 12, 8, 12, 'red2'); R(11, 12, 2, 12, 'red3'); R(11, 14, 8, 1, 'gold1');
    d.line(X + 15, Y + 12, X + 18, Y + 6, 'gold1').px(X + 19, Y + 5, 'white').px(X + 20, Y + 4, 'gold2').px(X + 18, Y + 4, 'gold2').px(X + 20, Y + 6, 'gold2');
    R(0, 22, 30, 4, 'shade2');
  } else if (t.id === 'hamster') {
    R(0, 0, 30, 26, 'pnk1');
    for (let k = 0; k < 6; k++) d.px(X + 3 + k * 5, Y + 3 + (k % 2) * 2, 'white');
    d.oval(X + 5, Y + 4, 20, 19, 'brn2').oval(X + 7, Y + 10, 16, 13, 'brn3').oval(X + 4, Y + 3, 6, 6, 'brn2').oval(X + 20, Y + 3, 6, 6, 'brn2');
    d.oval(X + 5, Y + 4, 3, 3, 'pnk0').oval(X + 22, Y + 4, 3, 3, 'pnk0');
    R(10, 11, 3, 4, 'ink'); R(17, 11, 3, 4, 'ink'); d.px(X + 10, Y + 11, 'white').px(X + 17, Y + 11, 'white');
    R(7, 15, 3, 2, 'pnk0'); R(20, 15, 3, 2, 'pnk0'); R(14, 16, 2, 1, 'pnk0'); d.px(X + 14, Y + 18, 'ink').px(X + 15, Y + 18, 'ink');
  } else if (t.id === 'train') {
    R(0, 0, 30, 26, 'night0');
    for (const [x, y] of [[3, 2], [12, 4], [25, 3], [20, 7], [6, 8]]) d.px(X + x, Y + y, 'white');
    d.oval(X + 22, Y + 1, 6, 6, 'gold3');
    R(7, 7, 16, 16, 'blu2'); R(7, 7, 16, 2, 'blu3'); R(9, 10, 12, 5, 'blu0'); R(10, 11, 4, 2, 'blu3');
    R(8, 17, 3, 2, 'gold3'); R(19, 17, 3, 2, 'gold3'); R(7, 20, 16, 1, 'gold1');
    R(0, 23, 30, 3, 'shade2'); d.line(X + 9, Y + 23, X + 2, Y + 25, 'gray2').line(X + 20, Y + 23, X + 27, Y + 25, 'gray2');
  } else if (t.id === 'crab') {
    R(0, 0, 30, 26, 'pur0');
    for (const [x, y] of [[2, 3], [26, 2], [5, 20], [27, 18], [15, 2]]) d.px(X + x, Y + y, 'white');
    d.oval(X + 7, Y + 11, 16, 11, 'red2').oval(X + 9, Y + 12, 10, 5, 'red3');
    d.poly([[X + 6, Y + 14], [X + 2, Y + 6], [X + 6, Y + 4], [X + 8, Y + 9]], 'red2').poly([[X + 24, Y + 14], [X + 28, Y + 6], [X + 24, Y + 4], [X + 22, Y + 9]], 'red2');
    for (const x of [8, 11, 18, 21]) d.line(X + x, Y + 21, X + x - 2 + (x > 15 ? 4 : 0), Y + 24, 'red1');
    R(11, 7, 8, 4, 'ink'); R(9, 10, 12, 2, 'ink'); d.px(X + 15, Y + 8, 'white');
    d.px(X + 12, Y + 14, 'white').px(X + 18, Y + 14, 'white').px(X + 12, Y + 15, 'ink').px(X + 18, Y + 15, 'ink');
  } else if (t.id === 'daibutsu') {
    R(0, 0, 30, 26, 'pur1');
    d.oval(X + 3, Y + 1, 24, 24, 'gold2', false).oval(X + 5, Y + 3, 20, 20, 'gold3', false);
    d.oval(X + 8, Y + 6, 14, 17, 'gold1').oval(X + 9, Y + 4, 12, 8, 'gold0');
    for (let x = 10; x < 20; x += 2) for (let y = 5; y < 10; y += 2) d.px(X + x, Y + y, 'gold1');
    d.rect(X + 6, Y + 12, 2, 8, 'gold1').rect(X + 22, Y + 12, 2, 8, 'gold1');
    d.line(X + 10, Y + 14, X + 13, Y + 14, 'gold0').line(X + 17, Y + 14, X + 20, Y + 14, 'gold0').px(X + 15, Y + 11, 'red2');
    d.line(X + 13, Y + 19, X + 17, Y + 19, 'gold0');
  } else if (t.id === 'hanabi') {
    R(0, 0, 30, 26, 'night0');
    const burst = (cx, cy, r, c1, c2) => { for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; d.line(X + cx + Math.cos(a) * 2, Y + cy + Math.sin(a) * 2, X + cx + Math.cos(a) * r, Y + cy + Math.sin(a) * r, k % 2 ? c1 : c2); } d.px(X + cx, Y + cy, 'white'); };
    burst(9, 8, 6, 'pnk0', 'gold2'); burst(22, 7, 5, 'blu3', 'grn3');
    // MAX の文字
    d.rows(X + 3, Y + 17, [
      'R...R..RRR..R...R',
      'RR.RR.R...R..R.R.',
      'R.R.R.RRRRR...R..',
      'R...R.R...R..R.R.',
      'R...R.R...R.R...R',
    ], { R: 'gold2' });
    d.line(X + 3, Y + 23, X + 19, Y + 23, 'red2');
  } else if (t.id === 'sushi') { // のれんの下を、にぎりの皿がレーンで流れる
    R(0, 0, 30, 26, 'brn3');
    R(0, 0, 30, 8, 'blu1'); for (let x = 4; x < 30; x += 5) R(x, 0, 1, 8, 'blu0'); R(0, 7, 30, 1, 'blu0');
    d.px(X + 7, Y + 3, 'white').px(X + 17, Y + 3, 'white').px(X + 22, Y + 3, 'white');
    R(0, 18, 30, 5, 'gray2'); R(0, 18, 30, 1, 'gray3'); R(0, 22, 30, 1, 'gray0'); R(0, 23, 30, 3, 'brn1');
    [[0, 'red2', 'red3'], [10, 'gold2', 'org2'], [20, 'blu2', 'pnk1']].forEach(([x, rim, fish]) => {
      d.oval(X + x, Y + 14, 10, 6, 'white').oval(X + x, Y + 14, 10, 6, rim, false);
      R(x + 2, 13, 6, 3, 'white'); R(x + 2, 12, 6, 2, fish); R(x + 4, 12, 1, 2, 'white');
    });
    d.px(X + 25, Y + 10, 'gold2').px(X + 26, Y + 9, 'gold3').px(X + 4, Y + 10, 'gold2');
  } else if (t.id === 'laundry') { // 夜の洗濯機。窓の中で泡と靴下が回る
    R(0, 0, 30, 26, 'night0');
    d.oval(X + 24, Y + 1, 5, 5, 'gold3').px(X + 25, Y + 2, 'gold2');
    d.px(X + 2, Y + 3, 'white').px(X + 3, Y + 15, 'white').px(X + 28, Y + 12, 'white');
    R(6, 4, 18, 21, 'gray3'); R(6, 4, 18, 4, 'gray2'); R(6, 24, 18, 1, 'gray1');
    d.px(X + 8, Y + 5, 'red2').px(X + 10, Y + 5, 'grn2'); R(18, 5, 4, 2, 'ink');
    d.oval(X + 8, Y + 9, 14, 14, 'gray1').oval(X + 9, Y + 10, 12, 12, 'blu2');
    d.oval(X + 11, Y + 13, 7, 6, 'blu3').px(X + 12, Y + 12, 'white').px(X + 17, Y + 17, 'white').px(X + 13, Y + 19, 'blu4');
    R(15, 15, 3, 2, 'red2'); d.px(X + 17, Y + 14, 'red2');
    d.line(X + 10, Y + 12, X + 12, Y + 11, 'white');
  } else if (t.id === 'yokozuna') { // 土俵で四股を踏む横綱
    R(0, 0, 30, 26, 'shade1');
    d.px(X + 4, Y + 4, 'white').px(X + 25, Y + 3, 'white').px(X + 6, Y + 7, 'gray3').px(X + 23, Y + 8, 'gray3');
    d.oval(X + 1, Y + 19, 28, 7, 'brn3').oval(X + 3, Y + 20, 24, 5, 'white', false);
    d.oval(X + 3, Y + 9, 6, 7, 'skin3').oval(X + 21, Y + 9, 6, 7, 'skin3');
    d.oval(X + 7, Y + 8, 16, 14, 'skin3').oval(X + 10, Y + 12, 10, 7, 'skin4');
    d.oval(X + 11, Y + 2, 8, 8, 'skin3'); R(12, 2, 6, 2, 'ink'); R(14, 0, 3, 2, 'ink');
    d.px(X + 13, Y + 5, 'ink').px(X + 16, Y + 5, 'ink').px(X + 14, Y + 7, 'skin1').px(X + 15, Y + 7, 'skin1');
    R(8, 17, 14, 3, 'pur1'); R(14, 17, 2, 5, 'pur1'); R(8, 17, 14, 1, 'pur2');
    R(8, 20, 5, 4, 'skin3'); R(17, 20, 5, 4, 'skin3');
  } else if (t.id === 'maneki') { // 小判を抱えて手を振る招き猫
    R(0, 0, 30, 26, 'red1');
    for (const [x, y] of [[2, 3], [27, 6], [3, 20], [26, 21]]) d.px(X + x, Y + y, 'gold2');
    d.oval(X + 7, Y + 11, 16, 14, 'white');
    d.oval(X + 6, Y + 2, 16, 12, 'white');
    d.poly([[X + 7, Y + 5], [X + 8, Y + 0], [X + 12, Y + 3]], 'white').poly([[X + 21, Y + 5], [X + 20, Y + 0], [X + 16, Y + 3]], 'white');
    d.px(X + 8, Y + 2, 'pnk1').px(X + 20, Y + 2, 'pnk1');
    d.oval(X + 15, Y + 3, 5, 4, 'org1');
    d.oval(X + 22, Y + 1, 5, 6, 'white'); R(22, 5, 3, 6, 'white'); d.px(X + 23, Y + 2, 'pnk1');
    d.px(X + 9, Y + 8, 'ink').px(X + 10, Y + 7, 'ink').px(X + 11, Y + 8, 'ink').px(X + 16, Y + 8, 'ink').px(X + 17, Y + 7, 'ink').px(X + 18, Y + 8, 'ink');
    d.px(X + 14, Y + 10, 'pnk0').px(X + 13, Y + 11, 'ink').px(X + 15, Y + 11, 'ink');
    R(8, 13, 13, 2, 'red2'); d.oval(X + 12, Y + 14, 4, 4, 'gold2');
    d.oval(X + 9, Y + 17, 11, 7, 'gold2').oval(X + 10, Y + 18, 9, 5, 'gold3', false).line(X + 12, Y + 20, X + 17, Y + 20, 'gold0');
  }
}

export function make(d) {
  THEMES.forEach((t, i) => { d.frame(i); cabinet(d, t); crest(d, t, i); lcd(d, t); d.outline('ink', { connectivity: 4 }); });
}
export const asset = { name: 'machines', w: 60, h: 104, frames: THEMES.length, make };
