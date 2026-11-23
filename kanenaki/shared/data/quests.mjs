// 依頼（設計書 §4。段階 1 は第 1 幕の 6 件）。形はサーバーの係の world.mjs・commands.mjs の読み方に合わせてある。
// giver: 依頼主の NPC の id（1 人）。転職の試験は 6 人の師範を代表して剣の師範が出し、終えるとどの師範のもとでも転職できる。
// minLevel: 受けられる Lv。requires: 先に終えておく依頼の id（無ければ書かない）。
// needs = { kill?: { 魔物の id: 数 }, items?: { 品の id: 数 } }。終える条件。品は渡すと持ち物から消える。
// reward = { xp, gold, items?: [{ id, qty }], classChange?: true（この依頼を終えると転職できる）, skillPoints? }
// lines = { offer: 受ける前, progress: 途中, done: 終えたとき }

export const quests = {
  q_crows: {
    id: 'q_crows', name: '屋根の上の屍鴉', giver: 'npc_innkeeper', minLevel: 1,
    desc: '宿屋の屋根に屍鴉が集まり、客がおびえている。街道の屍鴉を 12 羽倒す。',
    needs: { kill: { carrion_crow: 12 } },
    reward: { xp: 150, gold: 60, items: [{ id: 'potion_life', qty: 5 }] },
    lines: {
      offer: '屋根の上で鴉が鳴くと、客が「死人が出る」と言って帰っちまう。街道の屍鴉を減らしてくれないかい。',
      progress: 'まだ鳴き声が聞こえるよ。',
      done: '静かになったね。これは礼だよ、持っていきな。',
    },
  },
  q_bones: {
    id: 'q_bones', name: '街道の骨の兵', giver: 'npc_bellkeeper', minLevel: 4,
    desc: '鐘が砕けた夜に起き上がった骨の兵が、街道を東へ行く者を襲っている。骨の兵を 10 体倒す。',
    needs: { kill: { bone_soldier: 10 } },
    reward: { xp: 900, gold: 200, items: [{ id: 'leather_belt', qty: 1 }] },
    lines: {
      offer: '街道の東の端に、昔の兵の骨が起き上がって並んでおる。眠らせてやってくれ。',
      progress: '骨はまだ立っておるか。盾を持っておるから、正面からは崩しにくいぞ。',
      done: 'よくやった。あの者たちも、ようやく横になれた。',
    },
  },
  q_herbs: {
    id: 'q_herbs', name: '沼の薬草', giver: 'npc_apothecary', minLevel: 8,
    desc: '霧沼の魔物の体には、苦い薬草が絡みついている。沼の薬草を 8 つ集めて薬師に渡す。',
    needs: { items: { bog_herb: 8 } },
    reward: { xp: 3500, gold: 300, items: [{ id: 'potion_life_big', qty: 5 }, { id: 'potion_mana_big', qty: 3 }] },
    lines: {
      offer: '霧沼の魔物は、体に薬草を付けて歩いている。8 つ持ってきてくれたら、町の皆に薬を配れる。',
      progress: '薬草は湿ったままでいい。乾くと効き目が落ちる。',
      done: 'いい草だ。大きな薬を分けてやろう。',
    },
  },
  q_trial: {
    id: 'q_trial', name: '転職の試験', giver: 'npc_master_swordsman', minLevel: 10,
    desc: '師範たちに腕を見せる。街道の骨の兵 5 体と、泥小鬼の投石兵 5 体を倒して剣の師範に報告すると、6 人の師範のだれのもとでも転職できる。',
    needs: { kill: { bone_soldier: 5, mud_imp_slinger: 5 } },
    reward: { xp: 0, gold: 0, classChange: true, skillPoints: 1 },
    lines: {
      offer: 'どの職に就くにしても、まず腕を見せろ。街道の骨の兵と、石を投げる小鬼を 5 体ずつ倒してこい。',
      progress: 'まだ数が足りないな。',
      done: '見事だ。あとは、なりたい職の師範に話しかけるといい。',
    },
  },
  q_shards: {
    id: 'q_shards', name: '鐘のかけら', giver: 'npc_bellkeeper', minLevel: 14, requires: 'q_bones',
    desc: '沈んだ鐘楼の魔物が、砕けた聖鐘のかけらを持っている。鐘のかけらを 3 つ持ち帰る。',
    needs: { items: { bell_shard: 3 } },
    reward: { xp: 18000, gold: 1200, items: [{ id: 'holy_water_forget', qty: 2 }] },
    lines: {
      offer: '霧沼の東に、沈んだ鐘楼がある。中の魔物が鐘のかけらを抱えておる。3 つでいい、持ち帰ってくれ。',
      progress: 'かけらは触れると鳴る。耳を澄ませば見つかるはずじゃ。',
      done: 'おお……確かに鳴っておる。この鐘は、まだ鳴らせる。',
    },
  },
  q_warden: {
    id: 'q_warden', name: '鐘守りの亡者', giver: 'npc_bellkeeper', minLevel: 20, requires: 'q_shards',
    desc: '沈んだ鐘楼の 3 階の奥で、割れた鐘を抱いて立つ鐘守りの亡者を倒す。',
    needs: { kill: { bell_warden: 1 } },
    reward: { xp: 40000, gold: 5000, skillPoints: 1 },
    lines: {
      offer: '鐘楼の一番下に、鐘を抱いたまま立っている者がおる。あれはわしの弟子だった。眠らせてやってくれ。',
      progress: 'あの子は鐘を鳴らして死者を起こす。鳴らす前に、離れるのじゃ。',
      done: '……そうか。礼を言う。これで、残りの六つの鐘を探しに行ける。',
    },
  },
};
