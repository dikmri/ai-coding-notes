// 職業（冒険者と 6 職）
// base は Lv1 の主な能力値。perLevel は 1 レベルごとに増える量（life・mana は最大体力・最大魔力の素の値）。
// 転職したら、その職の base + perLevel × (Lv − 1) で計算し直す想定。
// 能力値とダメージの計算はサーバーの係の kanenaki/shared/calc.mjs（computeStats・damageRange）。
// 数値は tests/mmo-data-balance.test.mjs が calc.mjs の式で「倒すまでの回数」を確かめている。
// start は冒険者を作ったときの持ち物（weapon と armor は装備する、items は持ち物、gold はお金）。
import { skillsByClass } from './skills.mjs';

export const classes = {
  adventurer: {
    name: '冒険者',
    desc: '灰鐘の町に流れ着いた者。剣も弓も呪文も少しずつ使える。Lv10 で 6 つの職のどれかへ進む。',
    base: { str: 10, dex: 10, int: 8, vit: 10 },
    perLevel: { str: 1, dex: 1, int: 1, vit: 1, life: 4, mana: 2 },
    life: 30, mana: 12,
    skills: skillsByClass.adventurer,
    treeStart: 'c0',
    art: 'adventurer',
    weapons: ['sword', 'dagger', 'axe', 'staff', 'scepter', 'knuckle', 'greatsword'],
    start: { weapon: 'rusty_sword', armor: ['cloth_tunic'], items: [{ id: 'potion_life', count: 5 }, { id: 'scroll_return', count: 1 }], gold: 30 },
  },
  swordsman: {
    name: '剣士',
    desc: '速い剣で踏み込み、斬り抜ける。構えで攻撃を受け流し、敵の間を跳び回る。',
    base: { str: 14, dex: 14, int: 6, vit: 12 },
    perLevel: { str: 2, dex: 2, int: 0, vit: 2, life: 5, mana: 2 },
    life: 34, mana: 10,
    skills: skillsByClass.swordsman,
    treeStart: 'swordsman_g',
    art: 'swordsman',
    weapons: ['sword', 'greatsword', 'dagger'],
  },
  warrior: {
    name: '戦士',
    desc: '重い武器と厚い鎧で前に立つ。鎖で敵を引き寄せ、地を割って道をふさぐ。',
    base: { str: 18, dex: 8, int: 4, vit: 16 },
    perLevel: { str: 3, dex: 1, int: 0, vit: 2, life: 7, mana: 1 },
    life: 40, mana: 8,
    skills: skillsByClass.warrior,
    treeStart: 'warrior_g',
    art: 'warrior',
    weapons: ['axe', 'greatsword', 'sword'],
  },
  rogue: {
    name: '盗賊',
    desc: '短剣と罠と煙で戦う。時を少し巻き戻し、影と入れ替わって逃げる。',
    base: { str: 10, dex: 18, int: 8, vit: 10 },
    attackStat: 'dex', // 普通の攻撃は器用で強くなる
    perLevel: { str: 1, dex: 3, int: 1, vit: 1, life: 6, mana: 2 },
    life: 30, mana: 12,
    skills: skillsByClass.rogue,
    treeStart: 'rogue_g',
    art: 'rogue',
    weapons: ['dagger', 'sword'],
  },
  priest: {
    name: '司祭',
    desc: '祈りで仲間を癒し、盾で守る。倒れた仲間を起こせるただ 1 つの職。',
    base: { str: 8, dex: 8, int: 16, vit: 12 },
    perLevel: { str: 1, dex: 1, int: 3, vit: 1, life: 5, mana: 4 },
    life: 30, mana: 20,
    skills: skillsByClass.priest,
    treeStart: 'priest_g',
    art: 'priest',
    weapons: ['scepter', 'staff'],
  },
  necromancer: {
    name: 'ネクロマンサー',
    desc: '骨の兵と射手を起こして戦わせる。敵どうしを魂の鎖でつなぎ、死を予告する。',
    base: { str: 6, dex: 8, int: 18, vit: 10 },
    perLevel: { str: 1, dex: 1, int: 3, vit: 1, life: 3, mana: 4 },
    life: 26, mana: 22,
    skills: skillsByClass.necromancer,
    treeStart: 'necromancer_g',
    art: 'necromancer',
    weapons: ['staff', 'dagger', 'scepter'],
  },
  monk: {
    name: 'モンク',
    desc: '拳と気で戦う。構えを切り替えて攻めと守りを替え、仲間のもとへ跳んで盾を張る。',
    base: { str: 12, dex: 14, int: 8, vit: 14 },
    attackStat: 'dex',
    perLevel: { str: 1, dex: 2, int: 1, vit: 2, life: 6, mana: 2 },
    life: 36, mana: 12,
    skills: skillsByClass.monk,
    treeStart: 'monk_g',
    art: 'monk',
    weapons: ['knuckle', 'staff'],
  },
};
