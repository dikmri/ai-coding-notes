// 台の仕様（MyWiki dedama-graph.md §2）。名前と題材はオリジナル。実在の機種の名前・キャラ・演出はまねない。
// 確率は「1/n」の n。rpk は店の標準の回転率（1,000 円あたり）、border は等価のボーダー（dedama/tools/stats.mjs で 30,000 時間分の試行から）。
// 回転率はどの台もボーダーの約 94%（店が少し勝つ、現実の釘の考え方）。振り分けは [重み, ラウンド数, 次の状態]。ラウンド数 0 は突確（出玉ほぼなし）。
// 次の状態: { mode: 'normal' | 'kakuhen' | 'st' | 'jitan' | 'rush', spins, then }。
//   kakuhen: 高確率で次回まで / st: 高確率で spins 回 / jitan: 通常の確率で spins 回 / rush: 一種二種混合の右打ち spins 回
//   then: spins を使い切った後に続く状態（甘デジの ST → 時短）

const K = (spins) => ({ mode: 'kakuhen' });
const ST = (spins, then) => ({ mode: 'st', spins, then });
const JT = (spins) => ({ mode: 'jitan', spins });
const N = () => ({ mode: 'normal' });
const RUSH = (spins) => ({ mode: 'rush', spins });

export const MACHINES = [
  {
    id: 'dynamite', name: 'P 商店街ダイナマイト', type: 'ミドル・確変ループ',
    spec: ['大当たり 1/319.7 → 確変 1/39.9（次の当たりまで）', '確変 65%（10R 60%・4R 5%）／通常 35% は時短 100 回'],
    blurb: '昔ながらの確変ループ。確変に入れば次の当たりまで続く。通常当たりでも時短 100 回の引き戻しがある。',
    normal: 319.7, high: 39.9, rpk: 15.5, border: 16.3, count: 10, perBall: 14,
    heso: [[60, 10, K()], [5, 4, K()], [35, 10, JT(100)]],
    den: [[60, 10, K()], [5, 4, K()], [35, 10, JT(100)]],
  },
  {
    id: 'hamster', name: 'P あまえんぼハムスター', type: '甘デジ・ST＋時短',
    spec: ['大当たり 1/99.9 → 毎回 ST 8 回（1/9.9）＋時短 22 回', 'ヘソ 3R（約 270 発）／電チュー 10R 30%・5R 70%'],
    blurb: '当たりやすい甘デジ。当たるたびに ST 8 回（1/9.9）と時短 22 回。出玉は少なめでも、よく連チャンする。',
    normal: 99.9, high: 9.9, rpk: 17, border: 18.2, count: 10, perBall: 10,
    heso: [[100, 3, ST(8, JT(22))]],
    den: [[30, 10, ST(8, JT(22))], [70, 5, ST(8, JT(22))]],
  },
  {
    id: 'train', name: 'P 夜行列車ラッシュ', type: 'ライトミドル・ST',
    spec: ['大当たり 1/199.8 → ST 120 回（1/79.9、継続 約 78%）', 'ヘソ ST 50%・時短 50%（3R）／電チュー 10R・5R 半々'],
    blurb: '初当たりの半分が ST 120 回へ。ST 中は 1/79.9 で、当たれば 10R か 5R。外れても時短 100 回が付く。',
    normal: 199.8, high: 79.9, rpk: 17.5, border: 18.8, count: 10, perBall: 13,
    heso: [[50, 3, ST(120)], [50, 3, JT(100)]],
    den: [[50, 10, ST(120)], [50, 5, ST(120)]],
  },
  {
    id: 'crab', name: 'P 宇宙海賊カニ船長', type: 'ミドル・ST',
    spec: ['大当たり 1/319.7 → ST 163 回（1/99.4、継続 約 81%）', 'ヘソ ST 50%・時短 50%（3R）／ST 中は全部 10R 約 1,500 発'],
    blurb: 'ST 163 回を 1/99.4 で回す。ST 中の当たりは全部 10R（約 1,500 発）。入れば大きいが、入るまでが長い。',
    normal: 319.7, high: 99.4, rpk: 17, border: 17.9, count: 10, perBall: 16,
    heso: [[50, 3, ST(163)], [50, 3, JT(100)]],
    den: [[100, 10, ST(163)]],
  },
  {
    id: 'daibutsu', name: 'P 大仏さまオールナイト', type: '一種二種混合',
    spec: ['大当たり 1/319.7 → RUSH 50%（13 回、継続 約 86%）', 'RUSH 中は小当たり 1/7.4 が V へ → 10R 約 1,400 発'],
    blurb: 'RUSH は 13 回（時短 9 回＋残り保留 4 個）。電チューの小当たりが V に入れば大当たり。当たりは全部 10R で、また RUSH。',
    normal: 319.7, koatari: 7.4, rpk: 16.5, border: 17.5, count: 10, perBall: 15,
    heso: [[50, 3, RUSH(13)], [50, 3, N()]],
    den: [[100, 10, RUSH(13)]],
  },
  {
    id: 'hanabi', name: 'CR 昭和大花火 MAX', type: '旧 MAX・確変ループ',
    spec: ['大当たり 1/399.6 → 確変 1/39.9（次の当たりまで）', '確変 16R 45%・突確 15%／通常 16R 40% は時短 100 回'],
    blurb: '重い 1/399.6。確変 16R は約 2,240 発。突確（出玉なしの確変）もある、荒い台。',
    normal: 399.6, high: 39.9, rpk: 15.5, border: 16.4, count: 10, perBall: 15, tokkaku: { rounds: 2, perRound: 10 },
    heso: [[45, 16, K()], [15, 0, K()], [40, 16, JT(100)]],
    den: [[45, 16, K()], [15, 0, K()], [40, 16, JT(100)]],
  },
];

export const machineById = (id) => MACHINES.find((m) => m.id === id) || null;
