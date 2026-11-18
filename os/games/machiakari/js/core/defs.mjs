// 街あかりの決まりごと（道・区画・施設・政策の数値）。お金の単位は「万円」
export const MONEY = '万円';

// 道路: 費用は1マスあたり。speed は車の速さの倍率、cap は1車線あたりで混まずに通れる台数の目安
export const ROADS = {
  1: { key: 'street', name: '小道', cost: 10, upkeep: 0.25, speed: 1, lanes: 1, cap: 3, noise: 4, zoneAccess: true },
  2: { key: 'avenue', name: '大通り', cost: 30, upkeep: 0.7, speed: 1.45, lanes: 2, cap: 4, noise: 12, zoneAccess: true },
  3: { key: 'highway', name: '高速道路', cost: 80, upkeep: 1.6, speed: 2.4, lanes: 2, cap: 6, noise: 22, zoneAccess: false },
};
export const BRIDGE_MULT = 4;
export const POWERLINE = { cost: 2, upkeep: 0.03, waterMult: 4 };
export const BULLDOZE_COST = 1;

// 区画: cls は R（住宅）C（商業）I（工業）O（オフィス）。cap は水準 1〜3 の住人または働き口の数
export const ZONES = {
  1: { key: 'RL', cls: 'R', name: '住宅（低密度）', short: '住', cap: [5, 8, 12], color: '#5fbf6a' },
  2: { key: 'RH', cls: 'R', name: '住宅（高密度）', short: '住', cap: [26, 44, 66], color: '#2e8f4a' },
  3: { key: 'CL', cls: 'C', name: '商業（低密度）', short: '商', cap: [4, 6, 9], color: '#5aa0e6' },
  4: { key: 'CH', cls: 'C', name: '商業（高密度）', short: '商', cap: [16, 26, 40], color: '#2f6fc0' },
  5: { key: 'IN', cls: 'I', name: '工業', short: '工', cap: [9, 13, 18], color: '#e0b43c', pollution: [36, 26, 12] },
  6: { key: 'OF', cls: 'O', name: 'オフィス', short: '事', cap: [18, 30, 46], color: '#9b7be0' },
};
export const CLASS_OF = (zone) => (ZONES[zone] ? ZONES[zone].cls : null);

// 1人（住宅）または働き口1つ（ほか）あたりの電気と水の使用量
export const USE = {
  power: { R: 0.12, C: 0.2, I: 0.34, O: 0.24, svc: 4 },
  water: { R: 0.16, C: 0.12, I: 0.24, O: 0.12, svc: 3 },
};

// 施設。size は辺のマス数（1 か 2）。budget は予算の分類。unlock は解放の段階の鍵（milestones.mjs）
export const SVC = {
  coal: { id: 1, name: '石炭火力発電所', size: 2, cost: 3000, upkeep: 140, power: 650, pollution: 110, noise: 30, budget: 'power', desc: '電気をたくさん作る。煙で空気が汚れる。' },
  wind: { id: 2, name: '風力発電機', size: 1, cost: 450, upkeep: 22, power: 55, noise: 10, budget: 'power', desc: '汚れない。風の強さで発電量が変わる。' },
  solar: { id: 3, name: '太陽光発電所', size: 2, cost: 2400, upkeep: 70, power: 380, budget: 'power', desc: '汚れない。夜は蓄えた分だけ（3割）になる。' },
  tower: { id: 4, name: '給水塔', size: 1, cost: 400, upkeep: 28, water: 260, budget: 'water', desc: '道の下の水道管で水を届ける。道に面して置く。' },
  pump: { id: 5, name: '揚水ポンプ場', size: 1, cost: 1100, upkeep: 60, water: 1500, needsWater: true, budget: 'water', desc: '川や湖の水をくみ上げる。水辺に置く。' },
  sewer: { id: 6, name: '小さな下水処理場', size: 1, cost: 600, upkeep: 32, sewer: 320, pollution: 14, budget: 'water', desc: '道の下の下水管で集めた水をきれいにする。' },
  sewer2: { id: 7, name: '下水処理場', size: 2, cost: 2600, upkeep: 130, sewer: 2400, pollution: 20, budget: 'water', desc: 'たくさんの下水をきれいにする。' },
  fire: { id: 8, name: '消防署', size: 1, cost: 800, upkeep: 55, radius: 16, cover: 'fire', budget: 'fire', desc: '火事を防ぎ、起きた火事を消す。' },
  police: { id: 9, name: '警察署', size: 1, cost: 800, upkeep: 55, radius: 16, cover: 'police', budget: 'police', desc: '犯罪を減らす。' },
  clinic: { id: 10, name: '診療所', size: 1, cost: 900, upkeep: 65, radius: 14, cover: 'health', budget: 'health', desc: '住む人の健康を守る。' },
  hospital: { id: 11, name: '総合病院', size: 2, cost: 3400, upkeep: 190, radius: 30, cover: 'health', strength: 1.4, budget: 'health', desc: '広い範囲の健康を守る。' },
  school: { id: 12, name: '小学校', size: 1, cost: 1000, upkeep: 65, radius: 14, cover: 'edu', strength: 0.45, budget: 'edu', desc: '学ぶ人が増え、建物の水準が上がりやすくなる。' },
  high: { id: 13, name: '高校', size: 2, cost: 2600, upkeep: 140, radius: 24, cover: 'edu', strength: 0.75, budget: 'edu', desc: 'より広い範囲の教育。オフィスの需要が増える。' },
  univ: { id: 14, name: '大学', size: 2, cost: 6000, upkeep: 280, radius: 44, cover: 'edu', strength: 1.1, budget: 'edu', desc: '街じゅうの教育を高める。' },
  park: { id: 15, name: '小さな公園', size: 1, cost: 120, upkeep: 4, park: 18, parkR: 4, budget: 'park', desc: 'まわりの地価と満足が上がる。' },
  plaza: { id: 16, name: '噴水広場', size: 1, cost: 350, upkeep: 10, park: 28, parkR: 5, budget: 'park', desc: '人が集まる広場。商業にも少し効く。' },
  bigpark: { id: 17, name: '森の公園', size: 2, cost: 900, upkeep: 24, park: 46, parkR: 8, budget: 'park', desc: '池と森のある大きな公園。' },
  metro: { id: 18, name: '地下鉄の駅', size: 1, cost: 1400, upkeep: 70, radius: 7, cover: 'transit', budget: 'transit', desc: '駅の近くどうしの移動は車を使わなくなる。' },
  landmark: { id: 19, name: 'あかりの塔', size: 1, cost: 12000, upkeep: 150, park: 70, parkR: 14, unique: true, budget: 'park', desc: '街の名所。地価と観光客が大きく増える。' },
};
export const SVC_BY_ID = Object.fromEntries(Object.entries(SVC).map(([key, v]) => [v.id, { key, ...v }]));

// 道具の一覧（画面の道具箱の順）。unlock の鍵は milestones.mjs の UNLOCK と同じ名前
export const TOOL_GROUPS = [
  { key: 'road', name: '道路', items: [{ kind: 'road', road: 1 }, { kind: 'road', road: 2 }, { kind: 'road', road: 3 }] },
  { key: 'res', name: '住宅', items: [{ kind: 'zone', zone: 1 }, { kind: 'zone', zone: 2 }] },
  { key: 'com', name: '商業', items: [{ kind: 'zone', zone: 3 }, { kind: 'zone', zone: 4 }, { kind: 'zone', zone: 6 }] },
  { key: 'ind', name: '工業', items: [{ kind: 'zone', zone: 5 }] },
  { key: 'power', name: '電気', items: [{ kind: 'power' }, { kind: 'svc', key: 'coal' }, { kind: 'svc', key: 'wind' }, { kind: 'svc', key: 'solar' }] },
  { key: 'water', name: '水道', items: [{ kind: 'svc', key: 'tower' }, { kind: 'svc', key: 'pump' }, { kind: 'svc', key: 'sewer' }, { kind: 'svc', key: 'sewer2' }] },
  { key: 'safety', name: '安全', items: [{ kind: 'svc', key: 'fire' }, { kind: 'svc', key: 'police' }, { kind: 'svc', key: 'clinic' }, { kind: 'svc', key: 'hospital' }] },
  { key: 'edu', name: '教育', items: [{ kind: 'svc', key: 'school' }, { kind: 'svc', key: 'high' }, { kind: 'svc', key: 'univ' }] },
  { key: 'park', name: '公園', items: [{ kind: 'svc', key: 'park' }, { kind: 'svc', key: 'plaza' }, { kind: 'svc', key: 'bigpark' }, { kind: 'svc', key: 'metro' }, { kind: 'svc', key: 'landmark' }] },
  { key: 'district', name: '地区', items: [{ kind: 'district' }] },
  { key: 'dezone', name: '区画を消す', items: [{ kind: 'dezone' }] },
  { key: 'bulldoze', name: 'ブルドーザー', items: [{ kind: 'bulldoze' }] },
  { key: 'inspect', name: '調べる', items: [{ kind: 'inspect' }] },
];
export function toolKey(t) {
  if (!t) return '';
  if (t.kind === 'road') return 'road:' + t.road;
  if (t.kind === 'zone') return 'zone:' + t.zone;
  if (t.kind === 'svc') return 'svc:' + t.key;
  return t.kind;
}
export function toolName(t) {
  if (t.kind === 'road') return ROADS[t.road].name;
  if (t.kind === 'zone') return ZONES[t.zone].name;
  if (t.kind === 'svc') return SVC[t.key].name;
  return { power: '送電線', bulldoze: 'ブルドーザー', dezone: '区画を消す', district: '地区を塗る', inspect: '調べる' }[t.kind] || t.kind;
}
// 引いて使う道具（2点の間に並べる）と、四角く塗る道具
export const DRAG_LINE = new Set(['road', 'power']);
export const DRAG_RECT = new Set(['zone', 'dezone', 'bulldoze', 'district']);

// 予算の分類（施設の予算の割合を 50〜150% で決める）
export const BUDGETS = {
  road: '道路の維持', power: '電気', water: '水道と下水', fire: '消防', police: '警察', health: '医療', edu: '教育', park: '公園', transit: '地下鉄',
};

// 政策。市全体（0）か、地区ごとに決める
export const POLICIES = [
  { key: 'saveEnergy', name: '省エネの呼びかけ', desc: '電気の使用 −20%。住む人の満足 −2。' },
  { key: 'saveWater', name: '節水の呼びかけ', desc: '水と下水の使用 −20%。住む人の満足 −2。' },
  { key: 'smokeFree', name: '禁煙の街', desc: '健康が上がり、満足 +3。商業の税収 −10%。' },
  { key: 'greenIndustry', name: '工場の緑化', desc: '工業の公害 −50%。工業の税収 −15%。' },
  { key: 'heavyBan', name: '大型車の通行禁止', desc: 'トラックは地区の中の道を避ける。騒音 −30%。' },
  { key: 'heightLimit', name: '高さの制限', desc: '建物は水準2まで。地価 +6。' },
  { key: 'patrol', name: '夜回り', desc: '犯罪 −30%。住む人1人あたり月 0.02 万円。' },
  { key: 'nightlife', name: '夜の街', desc: '商業の需要と観光客が増える。夜の交通と騒音も増える。' },
  { key: 'bikeLanes', name: '自転車と歩きの街', desc: '近い移動は歩きになり、車が減る。満足 +2。月 0.01 万円/人。' },
];
export const POLICY_BY_KEY = Object.fromEntries(POLICIES.map((p) => [p.key, p]));

export const DISTRICT_COLORS = ['#ff7eb6', '#7ee0ff', '#ffd36e', '#a8ff8a', '#c89bff', '#ff9f6e', '#6effc7', '#ff6e6e'];

// 時間: 実時間の秒あたりの進み方（速さ1）。1日（昼と夜の1巡）は 180 秒、1か月は 48 秒。
// 暦と時刻は別に進む（予算の手応えは月ごとに早く返し、昼と夜はゆっくりめぐらせる）。
// 1日を短くしすぎると、朝に出た車が着く前に夜になり、夜も車が減らない
export const DAY_SECONDS = 180;
export const MONTH_SECONDS = 48;
