// 地図（設計書 §4、§13）。組み立てはサーバーの係の kanenaki/shared/mapgen.mjs の buildMap が行う。
// 座標はマスの番号。マス (x, y) は rows[y][x]。buildMap は x, y に 0.5 を足してマスの中心にする。
//
// 町（town）: 手で作った 64×64 の文字の行（rows）と legend。
//   legend の 1 文字 = { ground: 床の種類, solid?: 歩けない, prop?: その上に置く物の絵の id }
//   legend の prop の物は buildMap が置く。props には建物など大きな物だけを書く。
// props = [{ art, x, y, label? }]。x, y は物の中心のマス（大きさは mapgen の PROP_INFO。家 3×3・4×3・3×4、鐘楼 4×4）。
//   町の建物の足元は rows の 'h'（鐘楼は 'r'）で、PROP_INFO の大きさと同じ広さにしてある。
// portals = [{ id, x, y, r, at?, to:{ map, portal?, x?, y? }, oneWay?, opensAfter? }]
//   to.portal は行き先の地図の出入口の id。to.x, to.y があれば、そこに着く（町と野外だけ。迷宮は部屋が種で決まるので portal だけ）。
//   迷宮の出入口は x, y の代わりに at: 'entrance'（入口の部屋）か 'exit'（最も奥の部屋。3 階ではボスの部屋）。
//   opensAfter: その魔物を倒したあとに使える。oneWay: 戻る出入口が無い。
// spawns = [{ monsters:[id], x, y, r, count, respawn: 秒, level?, at? }]
//   level があれば scaleMonster でその Lv に合わせる。迷宮では x, y を書かず、mapgen が部屋へ配る。at: 'boss' はボスの部屋。
// light = 暗さ（0 = 明るい 〜 1 = 真っ暗）。画面の係の render.mjs の読み方に合わせた数。fog は霧の濃さ（0〜1、使うかは画面の係）。
// gen の項目は mapgen.mjs の genField / genDungeon が読む名前に合わせてある。歩けない床は mapgen の SOLID_TILES。

const townRows = [
  '################################################################',
  '#..............................................................#',
  '#......................fffffffffffffffff.......................#',
  '#....................P.f...............f.P.....................#',
  '#..T..............T....f.g.g.g...g.g.g.f..T..............T.....#',
  '#......................f...............f.......................#',
  '#......................f.g.g.g...g.g.g.f....T..................#',
  '#....T...............P.f...............f.P..................T..#',
  '#...................T..fffffff:::fffffff.......................#',
  '#.............................:::..............................#',
  '#.............................:::..............................#',
  '#.........hhhh................:::...............hhh............#',
  '#.........hhhh...hhh..........:::....hhh........hhhc...........#',
  '#........bhhhhb..hhh..........:::....hhh........hhhc...........#',
  '#..........::....hhh..........:::....hhh.......B.::............#',
  '#..........::............T....:::....hhh.........::............#',
  '#..........::.................:::................::............#',
  '#..........::.................:::................::............#',
  '#..........::.................:::................::............#',
  '#..........::.................:::................::............#',
  '#..T.......::....~~~..........:::................::..hhhh......#',
  '#..........::..~~~~~~~B::::::::::::::::::B.......::..hhhh......#',
  '#..........::..~~~~~~~::::::::::::::::::::.......::..hhhh......#',
  '#..........::..~~~~~~~::::::::::::::::::::.......::............#',
  '#.....T....::....~~~..::::::::rrrr::::::::.......::.........T..#',
  '#..........::.........::::::::rrrr::::::::.......::............#',
  '#..........::.........::::::::rrrr::::::::.......::............#',
  '#..........::.........::::::::rrrr::::::::.......::......T.....#',
  '#..........::.........::::::::::::::::::::.......::............#',
  '#...t......::.....t...::::::::::::::::::::..t....::.....t......#',
  '#:::::::::::::::::::::::::::::::::::::::::::::::::::::::::======',
  '#:::::::::::::::::::::::::::::::::::::::::::::::::::::::::======',
  '#:::::::::::::::::::::::::::::::::::::::::::::::::::::::::======',
  '#...t......::.....t...::::::::::::::::::::..t...:::.....t......#',
  '#..........::.........::::::::::::::::::::......:::............#',
  '#...hhhh...::.........::::::::::::::::::::......:::............#',
  '#...hhhh...::.........::::::::::::::::::::......:::...hhh......#',
  '#...hhhh...::.........::::::::::::::::::::......:::...hhh......#',
  '#..........::.........::::::::::::::::::::......:::...hhh......#',
  '#..........::.........::::::::::::::::::::......:::............#',
  '#..........::.........::::::::::::::::::::......:::.........T..#',
  '#.....T....::.........B::::::::::::::::::B......:::............#',
  '#..........::.................:::......fffffffff:::ffffffff....#',
  '#..........::.................:::......f,,,,,,,,,,,,,,,,,,f....#',
  '#.T........::.................:::......f,,,,,,,,,,,,,,,,,,f....#',
  '#.........hhh.................:::......f,,,,,,,,,,,,,,,,,,f....#',
  '#.........hhh.................:::..T...f,,,,,,,,,,,,,,,,,,f....#',
  '#.........hhh.......T.........:::......f,,,,,,,,,,,,,,,,,,f....#',
  '#.........hhh..............T..:::......f,,,,,,,,,,,,,,,,,,f....#',
  '#.............................:::......f,,,,,,,,,,,,,,,,,,f....#',
  '#.............................:::.hhh..f,,,,,,,,,,,,,,,,,,f....#',
  '#.......................hhh...:::.hhh..f,,,,,,,,,,,,,,,,,,f....#',
  '#................hhh....hhh...:::.hhh..f,,,,,,,hhhh,,,,,,,f....#',
  '#................hhh....hhh...:::.hhh..f,,,,,,,hhhh,,,,,,,f....#',
  '#................hhh....hhh...:::......f,,,,,,,hhhh,,,,,,,f....#',
  '#.............................:::......f,,,,,,,,,,,,,,,,,,f....#',
  '#.............................:::...T..f,,,,,,,,,,,,,,,,,,f....#',
  '#.............T............T..:::......ffffffffffffffffffff....#',
  '#..T..........................:::..............................#',
  '#.............................:::...........................T..#',
  '#.......T......................................................#',
  '#..............................................................#',
  '#..............................................................#',
  '################################################################',
];

const townLegend = {
  '#': { ground: 'wall_town', solid: true },
  '.': { ground: 'grass' },
  ',': { ground: 'dirt' },
  ':': { ground: 'cobble' },
  '=': { ground: 'road' },
  '~': { ground: 'water', solid: true },
  'h': { ground: 'cobble', solid: true }, // 家の足元（props の家が上に立つ）
  'r': { ground: 'cobble', solid: true }, // 崩れた鐘楼の足元
  'T': { ground: 'grass', solid: true, prop: 'tree_oak' },
  'P': { ground: 'grass', solid: true, prop: 'tree_pine' },
  'f': { ground: 'grass', solid: true, prop: 'fence' },
  'g': { ground: 'grass', solid: true, prop: 'grave' },
  'b': { ground: 'cobble', solid: true, prop: 'barrel' },
  'c': { ground: 'cobble', solid: true, prop: 'crate' },
  't': { ground: 'grass', solid: true, prop: 'torch' },
  'B': { ground: 'cobble', solid: true, prop: 'brazier' },
};

const townProps = [
  { art: 'belltower_ruin', x: 31.5, y: 25.5, label: '灰鐘の鐘楼' },
  { art: 'house_b', x: 11.5, y: 12, label: '宿屋' },
  { art: 'house_a', x: 49, y: 12, label: '鍛冶屋' },
  { art: 'house_c', x: 11, y: 46.5, label: '薬師の店' },
  { art: 'house_b', x: 48.5, y: 53, label: '師範の館' },
  { art: 'house_a', x: 18, y: 13 },
  { art: 'house_c', x: 38, y: 13.5 },
  { art: 'house_b', x: 54.5, y: 21 },
  { art: 'house_a', x: 18, y: 53 },
  { art: 'house_c', x: 25, y: 52.5 },
  { art: 'house_b', x: 5.5, y: 36 },
  { art: 'house_a', x: 55, y: 37 },
  { art: 'house_c', x: 35, y: 51.5 },
  { art: 'warp_pad', x: 25, y: 37 },
  { art: 'door', x: 12, y: 13 },
  { art: 'door', x: 49, y: 13 },
  { art: 'door', x: 11, y: 45 },
  { art: 'door', x: 48, y: 52 },
];

// 迷宮の共通の gen（mapgen の genDungeon が読む名前）
const tower = (seed, extra = {}) => ({
  type: 'dungeon', seed, floor: 'dungeon_floor', wall: 'wall_dungeon', rubble: 'dungeon_rubble',
  rubbleAmount: 0.06, rooms: 12, roomMin: 6, roomMax: 12, corridor: 2, loops: 0.15, fillRooms: true, ...extra,
});

export const maps = {
  town: {
    id: 'town', name: '灰鐘の町', w: 64, h: 64, levels: [0, 0], safe: true,
    rows: townRows, legend: townLegend,
    light: 0,
    entry: { x: 32, y: 34 },
    respawn: { x: 32, y: 34 },
    spawns: [],
    portals: [
      { id: 'town_east', x: 63, y: 31, r: 1.6, to: { map: 'road', portal: 'road_west', x: 4, y: 64 } },
    ],
    npcs: [
      { id: 'npc_innkeeper', x: 13, y: 15 },
      { id: 'npc_smith', x: 51, y: 15 },
      { id: 'npc_apothecary', x: 13, y: 43 },
      { id: 'npc_bellkeeper', x: 35, y: 25 },
      { id: 'npc_warp', x: 27, y: 37 },
      { id: 'npc_master_swordsman', x: 41, y: 46 },
      { id: 'npc_master_warrior', x: 43, y: 46 },
      { id: 'npc_master_rogue', x: 45, y: 46 },
      { id: 'npc_master_priest', x: 53, y: 46 },
      { id: 'npc_master_necromancer', x: 55, y: 46 },
      { id: 'npc_master_monk', x: 57, y: 46 },
    ],
    props: townProps,
  },

  road: {
    id: 'road', name: '枯れ野の街道', w: 128, h: 128, levels: [1, 8],
    gen: {
      type: 'field', seed: 1201, ground: 'grass', patch: 'dirt', patchAmount: 0.2, patchScale: 9,
      road: 'road', hub: { x: 64, y: 64 }, ponds: 4, pondMin: 2, pondMax: 4,
      trees: 0.03, rocks: 0.008, forestScale: 12,
      treeArts: ['tree_dead', 'tree_oak', 'tree_dead', 'tree_pine'], rockArts: ['rock_a', 'rock_b'],
      decor: [{ art: 'grave', density: 0.002 }, { art: 'fence', density: 0.002 }],
    },
    light: 0.55,
    spawns: [
      { monsters: ['stray_dog'], x: 22, y: 46, r: 9, count: 3, respawn: 30 },
      { monsters: ['carrion_crow'], x: 26, y: 84, r: 9, count: 4, respawn: 30 },
      { monsters: ['stray_dog', 'carrion_crow'], x: 42, y: 30, r: 10, count: 4, respawn: 35 },
      { monsters: ['mud_imp'], x: 52, y: 94, r: 10, count: 5, respawn: 40 },
      { monsters: ['mud_imp', 'mud_imp_slinger'], x: 64, y: 40, r: 10, count: 5, respawn: 40 },
      { monsters: ['mud_imp_slinger'], x: 80, y: 86, r: 9, count: 5, respawn: 40 },
      { monsters: ['bone_soldier'], x: 96, y: 38, r: 10, count: 6, respawn: 45 },
      { monsters: ['bone_soldier', 'mud_imp'], x: 100, y: 92, r: 10, count: 7, respawn: 45, level: 7 },
      { monsters: ['stray_dog'], x: 40, y: 112, r: 9, count: 5, respawn: 35, level: 4 },
    ],
    portals: [
      { id: 'road_west', x: 1, y: 64, r: 1.6, to: { map: 'town', portal: 'town_east', x: 60, y: 31 } },
      { id: 'road_east', x: 126, y: 64, r: 1.6, to: { map: 'bog', portal: 'bog_west', x: 4, y: 64 } },
    ],
    npcs: [],
    props: [],
  },

  bog: {
    id: 'bog', name: '霧沼', w: 128, h: 128, levels: [8, 16],
    gen: {
      type: 'field', seed: 1301, ground: 'swamp', patch: 'grass', patchAmount: 0.25, patchScale: 7,
      road: 'dirt', hub: { x: 64, y: 58 }, ponds: 18, pondMin: 2, pondMax: 6,
      trees: 0.04, rocks: 0.006, forestScale: 10,
      treeArts: ['tree_dead'], rockArts: ['rock_a', 'rock_b'],
      decor: [{ art: 'grave', density: 0.003 }],
    },
    light: 0.72, fog: 0.5,
    spawns: [
      { monsters: ['bog_wight'], x: 30, y: 36, r: 10, count: 5, respawn: 45 },
      { monsters: ['venom_toad'], x: 24, y: 94, r: 10, count: 6, respawn: 45 },
      { monsters: ['leech_swarm'], x: 52, y: 98, r: 10, count: 9, respawn: 40 },
      { monsters: ['leech_swarm', 'venom_toad'], x: 60, y: 28, r: 10, count: 7, respawn: 45 },
      { monsters: ['mist_witch'], x: 84, y: 86, r: 10, count: 4, respawn: 60 },
      { monsters: ['bog_wight', 'mist_witch'], x: 86, y: 62, r: 9, count: 5, respawn: 60, level: 14 },
      { monsters: ['mist_witch', 'leech_swarm'], x: 104, y: 104, r: 10, count: 6, respawn: 60, level: 15 },
    ],
    portals: [
      { id: 'bog_west', x: 1, y: 64, r: 1.6, to: { map: 'road', portal: 'road_east', x: 123, y: 64 } },
      { id: 'bog_tower', x: 110, y: 31, r: 1.2, to: { map: 'tower1', portal: 'tower1_up' } },
    ],
    npcs: [],
    props: [{ art: 'belltower_ruin', x: 110, y: 27, label: '沈んだ鐘楼' }],
  },

  tower1: {
    id: 'tower1', name: '沈んだ鐘楼 1 階', w: 96, h: 96, levels: [14, 18],
    gen: tower(1401),
    light: 0.74,
    spawns: [
      { monsters: ['bone_soldier'], r: 3, count: 4, respawn: 60, level: 14 },
      { monsters: ['bell_ghoul'], r: 3, count: 3, respawn: 60 },
      { monsters: ['cursed_acolyte', 'bone_soldier'], r: 3, count: 4, respawn: 60, level: 15 },
      { monsters: ['bell_ghoul', 'bone_soldier'], r: 3, count: 4, respawn: 60, level: 15 },
    ],
    portals: [
      { id: 'tower1_up', at: 'entrance', r: 1.2, to: { map: 'bog', portal: 'bog_tower', x: 110, y: 34 } },
      { id: 'tower1_down', at: 'exit', r: 1.2, to: { map: 'tower2', portal: 'tower2_up' } },
    ],
    npcs: [],
    props: [],
  },

  tower2: {
    id: 'tower2', name: '沈んだ鐘楼 2 階', w: 96, h: 96, levels: [18, 22],
    gen: tower(1402, { rubbleAmount: 0.09, rooms: 13 }),
    light: 0.76,
    spawns: [
      { monsters: ['bell_ghoul'], r: 3, count: 4, respawn: 60, level: 18 },
      { monsters: ['cursed_acolyte'], r: 3, count: 3, respawn: 60, level: 19 },
      { monsters: ['bronze_sentinel'], r: 3, count: 2, respawn: 75 },
      { monsters: ['bell_ghoul', 'bone_soldier'], r: 3, count: 4, respawn: 60, level: 19 },
      { monsters: ['bronze_sentinel', 'cursed_acolyte'], r: 3, count: 3, respawn: 75, level: 20 },
    ],
    portals: [
      { id: 'tower2_up', at: 'entrance', r: 1.2, to: { map: 'tower1', portal: 'tower1_down' } },
      { id: 'tower2_down', at: 'exit', r: 1.2, to: { map: 'tower3', portal: 'tower3_up' } },
    ],
    npcs: [],
    props: [],
  },

  tower3: {
    id: 'tower3', name: '沈んだ鐘楼 3 階', w: 96, h: 96, levels: [22, 26],
    gen: tower(1403, { rubbleAmount: 0.12, rooms: 10, roomMax: 14 }),
    light: 0.78,
    spawns: [
      { monsters: ['bronze_sentinel'], r: 3, count: 2, respawn: 75, level: 22 },
      { monsters: ['bell_ghoul', 'cursed_acolyte'], r: 3, count: 4, respawn: 60, level: 22 },
      { monsters: ['bell_ghoul'], r: 3, count: 3, respawn: 60, level: 23 },
      { monsters: ['bell_warden'], at: 'boss', r: 1, count: 1, respawn: 600 },
    ],
    portals: [
      { id: 'tower3_up', at: 'entrance', r: 1.2, to: { map: 'tower2', portal: 'tower2_down' } },
      { id: 'tower3_exit', at: 'exit', r: 1.2, to: { map: 'town', x: 32, y: 36 }, oneWay: true, opensAfter: 'bell_warden' },
    ],
    npcs: [],
    props: [],
  },
};
