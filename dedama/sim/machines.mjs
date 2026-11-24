// 台の仕様（MyWiki dedama-graph.md §2）。名前と題材はオリジナル。実在の機種の名前・キャラ・演出はまねない。
// 確率は「1/n」の n。rpk は店の標準の回転率（1,000 円あたり）、border は等価のボーダー（dedama/tools/stats.mjs で 30,000 時間分の試行から）。
// 回転率はどの台もボーダーの約 94%（店が少し勝つ、現実の釘の考え方）。振り分けは [重み, ラウンド数, 次の状態]。
// ラウンド数 0 は、tokkaku を持つ台では突確（出玉ほぼなし）、持たない台では ST リセット（出玉なしで次の状態を最初から）。
// 10R を何回も続けて払い出す当たり（3,000 発 = 1,500 発 × 2）は、ラウンド数 20 の 1 回の当たりとして数える。
// 次の状態: { mode: 'normal' | 'kakuhen' | 'st' | 'jitan' | 'rush', spins, then }。
//   kakuhen: 高確率で次回まで / st: 高確率で spins 回 / jitan: 通常の確率で spins 回 / rush: 一種二種混合の右打ち spins 回
//   then: spins を使い切った後に続く状態（甘デジの ST → 時短）

const K = (spins) => ({ mode: 'kakuhen' });
// opts: { p（1 回転の当たり確率の分母）, table（振り分けの表の名前）, key（記録の名前）, label（表示名） }。sim.mjs の「状態の決まり」
const ST = (spins, then, opts) => ({ mode: 'st', spins, then, ...opts });
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
  // ---- 2026-11-24 に足した 4 台。作者が挙げた実在の台の確率と振り分けを参考にし、名前と題材はオリジナル ----
  {
    // 参考: ライトミドルの一種二種混合（時短 100 回の RUSH、当たりは 10R を 1〜3 回、STリセットあり）
    id: 'sushi', name: 'P くるくる寿司ラッシュ', type: 'ライトミドル・一種二種混合',
    spec: ['大当たり 1/229.95 → 51% で RUSH（100 回、1/69.35、継続 約 77%）', 'RUSH の当たり 1,500・3,000・4,500 発、24% は出玉なしで 100 回に戻る'],
    blurb: 'RUSH は皿が 100 枚流れるまで（100 回）。1 皿 1,500 発で、2 皿・3 皿重ねて出ることもある。空の皿（出玉なし）でも 100 回に戻る。',
    normal: 229.95, high: 69.35, rpk: 18, border: 19.0, count: 10, perBall: 15,
    heso: [[1, 3, ST(4500, null, { key: 'st4500', label: 'RUSH' })], [50, 3, ST(100, null, { label: 'RUSH' })], [49, 3, N()]],
    den: [[5.5, 30, ST(100, null, { label: 'RUSH' })], [26.9, 20, ST(100, null, { label: 'RUSH' })], [43.8, 10, ST(100, null, { label: 'RUSH' })], [23.8, 0, ST(100, null, { label: 'RUSH' })]],
  },
  {
    // 参考: スマパチのライトミドル（合算の半分は 300 発のチャージ、ST 130 回、当たりは全部 3,000 発以上）
    id: 'laundry', name: 'e 真夜中コインランドリー', type: 'ライトミドル・一種二種混合',
    spec: ['大当たり 1/199.9（半分は 300 発の「乾燥だけ」で通常へ）', '洗濯の 51% で RUSH（ST 130 回 1/95.3、継続 約 75%）、毎回 3,000 発'],
    blurb: '当たりの半分は 300 発だけの「乾燥」。洗濯（1,500 発）の半分で RUSH に入り、RUSH の当たりは全部 3,000 発（3% は 6,000 発）。',
    normal: 199.9, high: 95.3, rpk: 15.5, border: 16.7, count: 10, perBall: 15,
    heso: [[25, 10, ST(130, null, { label: 'RUSH' })], [0.5, 2, ST(130, null, { label: 'RUSH' })], [24.5, 10, N()], [50, 2, N()]],
    den: [[97, 20, ST(130, null, { label: 'RUSH' })], [3, 40, ST(130, null, { label: 'RUSH' })]],
  },
  {
    // 参考: スマパチのミドル・LT（1 回転で決着するバトル、LT は毎回当たって 7,500 発か 1,500 発）
    id: 'yokozuna', name: 'e 大一番どすこい横綱', type: 'ミドル・一種二種混合・LT',
    spec: ['大当たり 1/349.99 → 40% で 1 回転の大一番（勝てば 7,500 発＋LT）', 'LT は毎回当たり: 7,500 発 25%・1,500 発 51% で続く（継続 約 76%）'],
    blurb: '取組（1,500 発）の半分で、1 回転の大一番。勝てば 7,500 発と LT。LT は 1 回転ごとに当たり、4 回に 1 回は 7,500 発。',
    normal: 349.99, rpk: 16, border: 17.2, count: 10, perBall: 15,
    heso: [[40, 10, ST(1, null, { p: 1, table: 'battle', key: 'battle', label: '大一番' })], [40, 10, N()], [20, 2, N()]],
    battle: [[50, 50, ST(1, null, { p: 1, table: 'lt', key: 'lt', label: 'LT' })], [50, 10, N()]],
    lt: [[25, 50, ST(1, null, { p: 1, table: 'lt', key: 'lt', label: 'LT' })], [51, 10, ST(1, null, { p: 1, table: 'lt', key: 'lt', label: 'LT' })], [24, 10, N()]],
    den: [],
  },
  {
    // 参考: スマパチのミドル・LT（ST 144 回、当たりの 25% が 6,000 発、出玉なしのリセットあり）
    id: 'maneki', name: 'e 招き猫 千客万来', type: 'ミドル・一種二種混合・LT',
    spec: ['大当たり 1/349.9 → 55% で LT（ST 144 回 1/99.9、継続 約 77%）', 'LT の当たり 6,000 発 25%・1,500 発 55%・300 発 6%・出玉なし 14%'],
    blurb: '招き猫が手を振れば LT。ST 144 回を 1/99.9 で回し、4 回に 1 回は 6,000 発の千客万来。空振り（出玉なし）でも 144 回に戻る。',
    normal: 349.9, high: 99.9, rpk: 15, border: 16.0, count: 10, perBall: 15,
    heso: [[10, 20, ST(144, null, { label: 'LT' })], [45, 10, ST(144, null, { label: 'LT' })], [45, 10, N()]],
    den: [[25, 40, ST(144, null, { label: 'LT' })], [55, 10, ST(144, null, { label: 'LT' })], [6, 2, ST(144, null, { label: 'LT' })], [14, 0, ST(144, null, { label: 'LT' })]],
  },
];

export const machineById = (id) => MACHINES.find((m) => m.id === id) || null;
