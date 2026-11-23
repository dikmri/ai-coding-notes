// 1 人用の釣り合いを、本物のデータで実際に戦わせて確かめる（§15）。
// キャラは「Lv を上げ、装備を抽選し、スキルとツリーを素直に上げた」状態。戦いの手は fixtures/solo.mjs の decide（人の真似）。
// 倒れない設定や能力値をいじる命令は使わない。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../kanenaki/sim/data.mjs';
import { runSolo, runPack } from '../kanenaki/sim/fixtures/solo-run.mjs';

const D = await loadData({ fallbackUrl: null });

for (const cls of ['warrior', 'priest', 'necromancer']) {
  test(`鐘守りの亡者: Lv24 の${D.classes[cls].name}が、大技をよけ、回復薬を使いながら 60〜150 秒で倒す`, () => {
    for (const seed of [2, 3]) {
      const r = runSolo(D, { cls, seed });
      assert.deepEqual(r.errors, [], r.errors.slice(0, 2).join('\n'));
      assert.ok(r.win, `${cls} s${seed}: 勝てない（ボスの体力 ${r.bossHpPct}%、${r.simS} 秒）`);
      assert.ok(r.simS >= 60 && r.simS <= 150, `${cls} s${seed}: ${r.simS} 秒`);
      assert.ok(r.minHpPct < 95, `${cls} s${seed}: 体力が減らない（${r.minHpPct}%）`);
    }
  });
  test(`鐘守りの亡者: Lv24 の${D.classes[cls].name}が、何もしないで殴り合う（よけない・薬なし）と倒れる`, () => {
    const r = runSolo(D, { cls, seed: 2, mode: 'stand' });
    assert.ok(r.died && !r.win, `${cls}: 倒れない（${r.simS} 秒、ボスの体力 ${r.bossHpPct}%）`);
  });
}

test('鐘守りの亡者: 手が少し遅い人（0.3 秒ごと）でも、戦士・司祭・ネクロマンサーは 180 秒以内に倒す', () => {
  for (const cls of ['warrior', 'priest', 'necromancer']) {
    const r = runSolo(D, { cls, seed: 2, every: 6 });
    assert.ok(r.win && r.simS <= 180, `${cls}: ${r.win ? '勝った' : '負けた'} ${r.simS} 秒（ボスの体力 ${r.bossHpPct}%）`);
  }
});

test('鐘守りの亡者: ほかの 3 職（剣士・盗賊・モンク）も 1 人で倒せる', () => {
  for (const cls of ['swordsman', 'rogue', 'monk']) {
    const r = runSolo(D, { cls, seed: 2 });
    assert.ok(r.win && r.simS <= 180, `${cls}: ${r.win ? '勝った' : '負けた'} ${r.simS} 秒`);
  }
});

test('序盤: Lv1 の冒険者が、街道の入口の近くの野良犬 3 匹と屍鴉 4 羽に、普通の攻撃と回復薬で勝つ（体力は 2 割以上残る）', () => {
  for (const seed of [1, 2, 3, 4]) {
    for (const pack of [[{ id: 'stray_dog', n: 3 }], [{ id: 'carrion_crow', n: 4 }]]) {
      const r = runPack(D, { cls: 'adventurer', level: 1, seed, map: 'road', at: { x: 14, y: 52 }, pack });
      assert.ok(r.win, `s${seed} ${pack[0].id}: 負けた`);
      assert.ok(r.minHpPct >= 20, `s${seed} ${pack[0].id}: 体力 ${r.minHpPct}%`);
    }
  }
});

test('精鋭: 霧沼と鐘楼の 1〜2 階の精鋭の群れに、その場所の Lv の 1 人のキャラが勝てる', () => {
  const cases = [
    { cls: 'warrior', level: 12, map: 'bog', at: { x: 24, y: 40 }, pack: [{ id: 'bog_wight', n: 1, elite: true }, { id: 'bog_wight', n: 2 }] },
    { cls: 'priest', level: 13, map: 'bog', at: { x: 78, y: 86 }, pack: [{ id: 'mist_witch', n: 1, elite: true }, { id: 'leech_swarm', n: 3 }] },
    { cls: 'necromancer', level: 16, map: 'tower1', pack: [{ id: 'bell_ghoul', n: 1, elite: true }, { id: 'bone_soldier', n: 2, level: 14 }] },
    { cls: 'rogue', level: 20, map: 'tower2', pack: [{ id: 'bell_ghoul', n: 1, elite: true, level: 18 }, { id: 'bell_ghoul', n: 2, level: 18 }] },
  ];
  for (const o of cases) {
    const r = runPack(D, { ...o, seed: 1, potions: 5 });
    assert.ok(r.win, `Lv${o.level} ${o.cls} ${o.map}: 負けた（${r.elites.join('・')}）`);
  }
});
