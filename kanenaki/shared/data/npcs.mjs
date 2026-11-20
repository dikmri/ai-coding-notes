// NPC（設計書 §13 の 11 人。絵の id は NPC の id と同じ。師範の絵は職業の絵の色違いでよい）
// role: inn 宿屋（休む・倉庫）/ smith 鍛冶屋（武器と防具の店）/ apothecary 薬師（薬と巻物の店）
//       master 転職の師範 / story 筋書きの依頼 / warp ワープ
// lines は話しかけたときに順番か無作為に出す台詞。shop は売る品の id。quests は渡す依頼の id。

// 転職の試験（q_trial）は剣の師範が 6 人を代表して出す。ほかの師範は試験を終えた者を転職させる。
const TRIAL_HINT = '転職の試験は剣の師範が出している。試験を終えたら、ここで転職できる。';
const master = (cls, name, lines) => ({
  id: `npc_master_${cls}`, name, art: `npc_master_${cls}`, role: 'master', cls,
  quests: cls === 'swordsman' ? ['q_trial'] : [],
  lines: cls === 'swordsman' ? lines : [...lines, TRIAL_HINT],
});

export const npcs = {
  npc_innkeeper: {
    id: 'npc_innkeeper', name: '宿屋の女主人', art: 'npc_innkeeper', role: 'inn',
    services: ['rest', 'stash'], quests: ['q_crows'],
    lines: [
      'いらっしゃい。灰鐘の町で、屋根があって火が消えないのはここだけだよ。',
      '休んでいくかい。体の傷は寝れば治る。心の傷は、酒でごまかすしかないね。',
      '荷物が多いなら預かるよ。戻らなかった客の荷物も、奥にまだ山ほどある。',
      '鐘が鳴らなくなってから、朝が来たのかどうか分からない日が増えた。',
    ],
  },
  npc_smith: {
    id: 'npc_smith', name: '鍛冶屋', art: 'npc_smith', role: 'smith',
    shop: [
      'rusty_sword', 'long_sword', 'two_hander', 'short_knife', 'hatchet', 'oak_staff', 'iron_scepter',
      'leather_knuckle', 'wooden_shield', 'old_tome', 'leather_hood', 'iron_helm', 'cloth_tunic',
      'leather_armor', 'prayer_robe', 'chain_mail', 'leather_gloves', 'leather_boots', 'traveler_boots',
      'cloth_sash', 'leather_belt', 'iron_ring',
    ],
    lines: [
      '刃こぼれした剣は置いていけ。研いでも直らないなら、新しいのを買え。',
      '鉄を打つ音だけは、まだこの町に残っている。',
      '鐘楼の番兵は青銅でできている。斬るより、叩き割るほうが早い。',
    ],
  },
  npc_apothecary: {
    id: 'npc_apothecary', name: '薬師', art: 'npc_apothecary', role: 'apothecary',
    shop: ['potion_life', 'potion_life_big', 'potion_mana', 'potion_mana_big', 'scroll_return', 'holy_water_forget'],
    quests: ['q_herbs'],
    lines: [
      '傷薬なら棚にある。苦いが、死ぬよりはましだろう。',
      '帰還の巻物は切らすな。霧の中で道を失った者は、二度と戻らない。',
      '忘却の聖水は高いよ。覚えたことを忘れるのは、覚えるより難しいからね。',
    ],
  },
  npc_bellkeeper: {
    id: 'npc_bellkeeper', name: '鐘番の老人', art: 'npc_bellkeeper', role: 'story',
    quests: ['q_bones', 'q_shards', 'q_warden'],
    lines: [
      'わしはこの町の鐘を五十年鳴らしてきた。あの夜まではな。',
      '七つの鐘が一度に砕けた夜、地の底から冷たい息が吹き上がった。あれは魔物の息だ。',
      'かけらを集めてくれ。鐘がもう一度鳴れば、地の底の扉を閉じられるかもしれん。',
      '沈んだ鐘楼の奥に、まだ鐘を抱いている者がいる。あれは、わしの弟子だった。',
    ],
  },
  npc_warp: {
    id: 'npc_warp', name: 'ワープの番人', art: 'npc_warp', role: 'warp',
    // 一度行った地図にだけ送れる（needsVisit）。price はお金。着く場所は portals の to と同じ決まり
    // （x, y があればそこ、無ければ portal の出入口の隣）
    warps: [
      { name: '枯れ野の街道', map: 'road', portal: 'road_west', x: 4, y: 64, price: 0, needsVisit: true },
      { name: '霧沼', map: 'bog', portal: 'bog_west', x: 4, y: 64, price: 20, needsVisit: true },
      { name: '沈んだ鐘楼 1 階', map: 'tower1', portal: 'tower1_up', price: 50, needsVisit: true },
      { name: '沈んだ鐘楼 2 階', map: 'tower2', portal: 'tower2_up', price: 80, needsVisit: true },
      { name: '沈んだ鐘楼 3 階', map: 'tower3', portal: 'tower3_up', price: 120, needsVisit: true },
    ],
    lines: [
      '台に乗れば、行ったことのある場所へ送ってやる。行ったことのない場所へは送れない。',
      '送るたびに少し体が冷える。慣れれば気にならなくなるさ。',
    ],
  },
  npc_master_swordsman: master('swordsman', '剣の師範', [
    '剣は速さだ。迷った分だけ、相手が先に斬る。',
    'Lv10 になったら来い。どの職に就くにしても、まずここで腕を見せてもらう。',
    '受け流すことを覚えろ。斬られない者だけが、最後まで斬れる。',
  ]),
  npc_master_warrior: master('warrior', '戦の師範', [
    '前に立つ者がいなければ、後ろの者は皆死ぬ。',
    '重い武器を振れる腕があるなら、ここで鍛えてやる。',
    '鎖を投げろ。逃げる敵が戻ってくるのを待つ必要はない。',
  ]),
  npc_master_rogue: master('rogue', '影の師範', [
    '正面から戦うのは、腕に自信のない者のすることだ。',
    '時は盗める。ほんの 3 秒だけだがね。',
    '煙の中では、誰も君の顔を覚えていない。',
  ]),
  npc_master_priest: master('priest', '祈りの師範', [
    '倒れた仲間を起こせる者は、戦場で一番強い。',
    '鐘の音は聞こえなくなった。それでも光は、まだここにある。',
    '仲間の背中を見ていなさい。前ばかり見る者は、誰も救えない。',
  ]),
  npc_master_necromancer: master('necromancer', '死霊術の師範', [
    '死者を恐れるな。彼らはもう、誰も裏切らない。',
    '起こした骨の兵は、言われたとおりに戦う。迷うことも、逃げることもない。',
    '死を告げる術を教えよう。告げられた者は、三つ数える間しか立っていられない。',
  ]),
  npc_master_monk: master('monk', '拳の師範', [
    '構えを変えれば、同じ拳でも別の武器になる。',
    '仲間が危ないときは跳べ。気の流れをたどれば、仲間のもとへ届く。',
    '息を整えろ。乱れた息では、毒も呪いも払えない。',
  ]),
};
