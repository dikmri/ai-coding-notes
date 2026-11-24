// 台の仕様（MyWiki dedama-graph.md §2）。名前と題材はオリジナル。実在の機種の名前・キャラ・演出はまねない。
// 確率は「1/n」の n。rpk は店の標準の回転率（1,000 円あたり）、border は等価のボーダー（dedama/tools/stats.mjs で 30,000 時間分の試行から）。
// spinValue は 12 時間の日で求めた通常時 1 回転の価値（円。dedama/tools/ev.mjs の 2 万日分）。累計データの期待値に使う。
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
// わんこそば 大盛りライトの LT: 6 回を LT の表で回し、外れたら残り保留 1 個（ラスト）は RUSH の表で回す
const WANKO_LT = ST(6, ST(1, null, { table: 'den', key: 'last', label: 'ラスト' }), { table: 'lt', key: 'lt', label: 'LT' });
// 腕ずもう 2 の LT: 時短 100 回＋残り保留 1 個。外れの 2.5% は 1 回だけの延長戦（RUSH の表）
const UDE_LT = ST(101, null, { table: 'lt', key: 'lt', label: 'LT' });

export const MACHINES = [
  {
    id: 'dynamite', name: 'P 商店街ダイナマイト', type: 'ミドル・確変ループ',
    spec: ['大当たり 1/319.7 → 確変 1/39.9（次の当たりまで）', '確変 65%（10R 60%・4R 5%）／通常 35% は時短 100 回'],
    blurb: '昔ながらの確変ループ。確変に入れば次の当たりまで続く。通常当たりでも時短 100 回の引き戻しがある。',
    normal: 319.7, high: 39.9, rpk: 15.5, border: 16.3, spinValue: 59.21, count: 10, perBall: 14,
    heso: [[60, 10, K()], [5, 4, K()], [35, 10, JT(100)]],
    den: [[60, 10, K()], [5, 4, K()], [35, 10, JT(100)]],
  },
  {
    id: 'hamster', name: 'P あまえんぼハムスター', type: '甘デジ・ST＋時短',
    spec: ['大当たり 1/99.9 → 毎回 ST 8 回（1/9.9）＋時短 22 回', 'ヘソ 3R（約 270 発）／電チュー 10R 30%・5R 70%'],
    blurb: '当たりやすい甘デジ。当たるたびに ST 8 回（1/9.9）と時短 22 回。出玉は少なめでも、よく連チャンする。',
    normal: 99.9, high: 9.9, rpk: 17, border: 18.2, spinValue: 54.72, count: 10, perBall: 10,
    heso: [[100, 3, ST(8, JT(22))]],
    den: [[30, 10, ST(8, JT(22))], [70, 5, ST(8, JT(22))]],
  },
  {
    id: 'train', name: 'P 夜行列車ラッシュ', type: 'ライトミドル・ST',
    spec: ['大当たり 1/199.8 → ST 120 回（1/79.9、継続 約 78%）', 'ヘソ ST 50%・時短 50%（3R）／電チュー 10R・5R 半々'],
    blurb: '初当たりの半分が ST 120 回へ。ST 中は 1/79.9 で、当たれば 10R か 5R。外れても時短 100 回が付く。',
    normal: 199.8, high: 79.9, rpk: 17.5, border: 18.8, spinValue: 51.68, count: 10, perBall: 13,
    heso: [[50, 3, ST(120)], [50, 3, JT(100)]],
    den: [[50, 10, ST(120)], [50, 5, ST(120)]],
  },
  {
    id: 'crab', name: 'P 宇宙海賊カニ船長', type: 'ミドル・ST',
    spec: ['大当たり 1/319.7 → ST 163 回（1/99.4、継続 約 81%）', 'ヘソ ST 50%・時短 50%（3R）／ST 中は全部 10R 約 1,500 発'],
    blurb: 'ST 163 回を 1/99.4 で回す。ST 中の当たりは全部 10R（約 1,500 発）。入れば大きいが、入るまでが長い。',
    normal: 319.7, high: 99.4, rpk: 17, border: 17.9, spinValue: 54.40, count: 10, perBall: 16,
    heso: [[50, 3, ST(163)], [50, 3, JT(100)]],
    den: [[100, 10, ST(163)]],
  },
  {
    id: 'daibutsu', name: 'P 大仏さまオールナイト', type: '一種二種混合',
    spec: ['大当たり 1/319.7 → RUSH 50%（13 回、継続 約 86%）', 'RUSH 中は小当たり 1/7.4 が V へ → 10R 約 1,400 発'],
    blurb: 'RUSH は 13 回（時短 9 回＋残り保留 4 個）。電チューの小当たりが V に入れば大当たり。当たりは全部 10R で、また RUSH。',
    normal: 319.7, koatari: 7.4, rpk: 16.5, border: 17.5, spinValue: 55.95, count: 10, perBall: 15,
    heso: [[50, 3, RUSH(13)], [50, 3, N()]],
    den: [[100, 10, RUSH(13)]],
  },
  {
    id: 'hanabi', name: 'CR 昭和大花火 MAX', type: '旧 MAX・確変ループ',
    spec: ['大当たり 1/399.6 → 確変 1/39.9（次の当たりまで）', '確変 16R 45%・突確 15%／通常 16R 40% は時短 100 回'],
    blurb: '重い 1/399.6。確変 16R は約 2,240 発。突確（出玉なしの確変）もある、荒い台。',
    normal: 399.6, high: 39.9, rpk: 15.5, border: 16.4, spinValue: 59.34, count: 10, perBall: 15, tokkaku: { rounds: 2, perRound: 10 },
    heso: [[45, 16, K()], [15, 0, K()], [40, 16, JT(100)]],
    den: [[45, 16, K()], [15, 0, K()], [40, 16, JT(100)]],
  },
  // ---- 2026-11-24 に足した 4 台。作者が挙げた実在の台の確率と振り分けを参考にし、名前と題材はオリジナル ----
  {
    // 参考: ライトミドルの一種二種混合（時短 100 回の RUSH、当たりは 10R を 1〜3 回、STリセットあり）
    id: 'sushi', name: 'P くるくる寿司ラッシュ', type: 'ライトミドル・一種二種混合',
    spec: ['大当たり 1/229.95 → 51% で RUSH（100 回、1/69.35、継続 約 77%）', 'RUSH の当たり 1,500・3,000・4,500 発、24% は出玉なしで 100 回に戻る'],
    blurb: 'RUSH は皿が 100 枚流れるまで（100 回）。1 皿 1,500 発で、2 皿・3 皿重ねて出ることもある。空の皿（出玉なし）でも 100 回に戻る。',
    normal: 229.95, high: 69.35, rpk: 18, border: 19.0, spinValue: 51.80, count: 10, perBall: 15,
    heso: [[1, 3, ST(4500, null, { key: 'st4500', label: 'RUSH' })], [50, 3, ST(100, null, { label: 'RUSH' })], [49, 3, N()]],
    den: [[5.5, 30, ST(100, null, { label: 'RUSH' })], [26.9, 20, ST(100, null, { label: 'RUSH' })], [43.8, 10, ST(100, null, { label: 'RUSH' })], [23.8, 0, ST(100, null, { label: 'RUSH' })]],
  },
  {
    // 参考: スマパチのライトミドル（合算の半分は 300 発のチャージ、ST 130 回、当たりは全部 3,000 発以上）
    id: 'laundry', name: 'e 真夜中コインランドリー', type: 'ライトミドル・一種二種混合',
    spec: ['大当たり 1/199.9（半分は 300 発の「乾燥だけ」で通常へ）', '洗濯の 51% で RUSH（ST 130 回 1/95.3、継続 約 75%）、毎回 3,000 発'],
    blurb: '当たりの半分は 300 発だけの「乾燥」。洗濯（1,500 発）の半分で RUSH に入り、RUSH の当たりは全部 3,000 発（3% は 6,000 発）。',
    normal: 199.9, high: 95.3, rpk: 15.5, border: 16.7, spinValue: 57.75, count: 10, perBall: 15,
    heso: [[25, 10, ST(130, null, { label: 'RUSH' })], [0.5, 2, ST(130, null, { label: 'RUSH' })], [24.5, 10, N()], [50, 2, N()]],
    den: [[97, 20, ST(130, null, { label: 'RUSH' })], [3, 40, ST(130, null, { label: 'RUSH' })]],
  },
  {
    // 参考: スマパチのミドル・LT（1 回転で決着するバトル、LT は毎回当たって 7,500 発か 1,500 発）
    id: 'yokozuna', name: 'e 大一番どすこい横綱', type: 'ミドル・一種二種混合・LT',
    spec: ['大当たり 1/349.99 → 40% で 1 回転の大一番（勝てば 7,500 発＋LT）', 'LT は毎回当たり: 7,500 発 25%・1,500 発 51% で続く（継続 約 76%）'],
    blurb: '取組（1,500 発）の半分で、1 回転の大一番。勝てば 7,500 発と LT。LT は 1 回転ごとに当たり、4 回に 1 回は 7,500 発。',
    normal: 349.99, rpk: 16, border: 17.2, spinValue: 58.91, count: 10, perBall: 15,
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
    normal: 349.9, high: 99.9, rpk: 15, border: 16.0, spinValue: 59.83, count: 10, perBall: 15,
    heso: [[10, 20, ST(144, null, { label: 'LT' })], [45, 10, ST(144, null, { label: 'LT' })], [45, 10, N()]],
    den: [[25, 40, ST(144, null, { label: 'LT' })], [55, 10, ST(144, null, { label: 'LT' })], [6, 2, ST(144, null, { label: 'LT' })], [14, 0, ST(144, null, { label: 'LT' })]],
  },
  // ---- 2026-11-24 に足した 4 台（その 2）。作者が挙げた実在の台の公表スペック（確率・振り分け・RUSH の回数・継続率）を参考にし、名前と題材はオリジナル ----
  // RUSH の回数は「時短 ＋ 残り保留 1 個」。右打ち中の 1 回転の当たりやすさ（小当たりから V に入る分を含む）を high に置く
  {
    // 参考: ミドルの一種二種混合（ヘソ 6R の 60.2% で RUSH、RUSH は 4 回で約 93%、当たりは 9R 20%・3R 80%）
    id: 'wanko', name: 'P わんこそば 早食い道場', type: 'ミドル・一種二種混合',
    spec: ['大当たり 1/319.7 → 60% で RUSH（4 回 1/2.06、継続 約 93%）', 'ヘソ 6R 約 600 発／RUSH の当たり 9R 20%・3R 80%（約 900・300 発）'],
    blurb: 'お椀が空いたら、すぐ次のそば。RUSH は 4 回だけでも 1 回転ごとに半分近く当たり、9 割以上で続く。1 回の出玉は少なめで、そのぶん速い。',
    normal: 319.68, high: 2.06, rpk: 19, border: 20.2, spinValue: 48.21, count: 10, perBall: 11,
    heso: [[60.2, 6, ST(4, null, { label: 'RUSH' })], [39.8, 6, N()]],
    den: [[20, 9, ST(4, null, { label: 'RUSH' })], [80, 3, ST(4, null, { label: 'RUSH' })]],
  },
  {
    // 参考: ライトミドルの一種二種混合・LT（ヘソ 3R の 56% で RUSH 4 回、RUSH の当たりの 2% で LT 6 回＋残り保留 1 個）
    id: 'wanko2', name: 'P わんこそば 大盛りライト', type: 'ライトミドル・一種二種混合・LT',
    spec: ['大当たり 1/129.7 → 56% で RUSH（4 回 1/2.44、継続 約 88%）', 'RUSH の当たりの 2% で LT（6 回＋ラスト 1 回、継続 約 97%）'],
    blurb: '軽めのわんこそば。RUSH の当たりは 3R（約 210 発）が多く、たまに 9R。2% で大盛りの LT に入れば、ほとんど終わらない。',
    normal: 129.7, high: 2.44, rpk: 16.5, border: 17.8, spinValue: 54.51, count: 10, perBall: 8,
    heso: [[56, 3, ST(4, null, { label: 'RUSH' })], [44, 3, N()]],
    den: [[80, 3, ST(4, null, { label: 'RUSH' })], [18, 9, ST(4, null, { label: 'RUSH' })], [2, 9, WANKO_LT]],
    lt: [[80, 3, WANKO_LT], [20, 9, WANKO_LT]],
  },
  {
    // 参考: ライトミドルの一種二種混合（ヘソ 4R の 50% で RUSH 3 回、継続 約 95%、当たりは 9R 8%・6R 8%・3R 84%）
    id: 'udezumo', name: 'P 腕ずもう 最強決定戦', type: 'ライトミドル・一種二種混合',
    spec: ['大当たり 1/199.8 → 50% で RUSH（3 回 1/1.58、継続 約 95%）', 'ヘソ 4R 約 240 発／RUSH の当たり 3R 84%・6R 8%・9R 8%'],
    blurb: '勝ち抜き戦の RUSH は 3 回。1 回転で 6 割以上当たるので、20 連もふつうに起きる。1 回の出玉は 180 発が多い、連チャンで積む台。',
    normal: 199.8, high: 1.58, rpk: 20, border: 21.1, spinValue: 46.29, count: 10, perBall: 7,
    heso: [[50, 4, ST(3, null, { label: 'RUSH' })], [50, 4, N()]],
    den: [[8, 9, ST(3, null, { label: 'RUSH' })], [8, 6, ST(3, null, { label: 'RUSH' })], [84, 3, ST(3, null, { label: 'RUSH' })]],
  },
  {
    // 参考: ライトミドルの一種二種混合・LT（ヘソ 6R の 60% で RUSH 3 回、RUSH の 10R の半分で LT（時短 100 回＋残り保留）、LT は 97.5% で続く）
    id: 'udezumo2', name: 'P 腕ずもう 最強決定戦 2', type: 'ライトミドル・一種二種混合・LT',
    spec: ['大当たり 1/199.5 → 60% で RUSH（3 回 1/1.71、継続 約 93%）', 'RUSH の当たりの 3% で LT（101 回、継続 97.5%、外れても延長戦）'],
    blurb: 'ヘソは 6R 約 540 発。RUSH の当たりは 2R（約 120 発）がほとんどで、3% の 10R で LT。LT は 101 回あって、終わるのは 2.5% の負けだけ。',
    normal: 199.5, high: 1.71, rpk: 17, border: 18.1, spinValue: 52.76, count: 10, perBall: 7, perBallBy: { heso: 10 },
    heso: [[60, 6, ST(3, null, { label: 'RUSH' })], [40, 6, N()]],
    den: [[3, 10, UDE_LT], [3, 10, ST(3, null, { label: 'RUSH' })], [94, 2, ST(3, null, { label: 'RUSH' })]],
    lt: [[6, 10, UDE_LT], [91.5, 2, UDE_LT], [2.5, 2, ST(1, null, { table: 'den', key: 'encho', label: '延長戦' })]],
  },
];
export const machineById = (id) => MACHINES.find((m) => m.id === id) || null;
