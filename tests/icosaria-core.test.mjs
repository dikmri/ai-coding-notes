// 「蒼海と白柱のイコサリア」の計算の部分（乱数、成長とダメージ、装備の生成、楽譜、地図と当たり判定）のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../os/games/icosaria/js/core/rng.mjs';
import * as St from '../os/games/icosaria/js/core/stats.mjs';
import * as Lo from '../os/games/icosaria/js/core/loot.mjs';
import * as Mu from '../os/games/icosaria/js/core/music.mjs';
import * as Tm from '../os/games/icosaria/js/core/tilemap.mjs';

test('乱数: 同じ種なら同じ並び。0 以上 1 未満。重み付きの選択は重みの比に近づく', () => {
  const a = makeRng(42), b = makeRng(42);
  const xs = Array.from({ length: 5 }, () => a.next());
  assert.deepEqual(xs, Array.from({ length: 5 }, () => b.next()));
  for (const v of xs) assert.ok(v >= 0 && v < 1);
  const r = makeRng(7), n = { a: 0, b: 0 };
  for (let i = 0; i < 4000; i++) n[r.weighted([{ v: 'a', w: 3 }, { v: 'b', w: 1 }]).v]++;
  assert.ok(n.a / n.b > 2.5 && n.a / n.b < 3.5);
  const k = r.int(3, 5);
  assert.ok(k >= 3 && k <= 5 && Number.isInteger(k));
});

test('成長: 次のレベルまでの経験値は floor(40 × Lv^1.45)', () => {
  assert.deepEqual([1, 2, 3, 4].map(St.xpToNext), [40, 109, 196, 298]);
});

test('ダメージ: 設計書の式。装甲で減り、閃光で 1.6 倍。最低 1', () => {
  // 斬撃力 14、防御 6、倍率 1、乱数の係数 1 → 14 × 100/112 = 12.5 → 12
  assert.equal(St.damage({ atk: 14, resonance: 10 }, { def: 6 }, { mult: 1, phys: 1, res: 0, roll: 1 }), 12);
  assert.equal(St.damage({ atk: 14, resonance: 10 }, { def: 6 }, { mult: 1, phys: 1, res: 0, roll: 1, crit: true }), 20);
  // 相の威力 +20%、共鳴力の寄与
  assert.equal(St.damage({ atk: 10, resonance: 20 }, { def: 0 }, { mult: 1, phys: 0.3, res: 1, roll: 1, elemPct: 20 }), 27);
  assert.equal(St.damage({ atk: 0, resonance: 0 }, { def: 999 }, { mult: 1, phys: 1, res: 0, roll: 1 }), 1);
});

test('能力: レベルと装備の屈折銘を足し、割合の上がり方も入れる。歩速には上限がある', () => {
  const s = St.derive({ level: 3, items: [{ affixes: [{ stat: 'atk', v: 5 }, { stat: 'atk_pct', v: 10 }] }, { affixes: [{ stat: 'move_spd_pct', v: 100 }, { stat: 'hp', v: 20 }] }] });
  // 斬撃力: 初期 14 + (3-1)×2 = 18、+5 = 23、×1.10 = 25.3 → 25
  assert.equal(s.atk, 25);
  assert.equal(s.hp, 120 + 2 * 16 + 20);
  assert.equal(s.move_spd, 7.2);
  assert.equal(s.crit, 5);
});

const DATA = {
  rarities: [{ id: 'common', weight: 58, affixes: [0, 1] }, { id: 'azure', weight: 28, affixes: [1, 2] }, { id: 'sunset', weight: 11, affixes: [3, 3] }, { id: 'icosa', weight: 3, affixes: [2, 2] }],
  slots: [{ id: 'weapon', bases: ['短剣', '細剣'] }, { id: 'boots', bases: ['革靴'] }],
  affixes: [
    { id: 'a1', stat: 'atk', min: 2, max: 12, slots: ['weapon'] }, { id: 'a2', stat: 'crit', min: 3, max: 12, slots: ['weapon'] },
    { id: 'a3', stat: 'def', min: 2, max: 12, slots: ['boots'] }, { id: 'a4', stat: 'move_spd_pct', min: 4, max: 16, slots: ['boots'] },
    { id: 'a5', stat: 'hp', min: 16, max: 75, slots: ['weapon', 'boots'] }, { id: 'a6', stat: 'tide_pct', min: 8, max: 25, slots: ['weapon'] },
  ],
  uniques: [{ name: 'さざ波の歌剣', slot: 'weapon' }],
};
test('装備: 部位に合う屈折銘だけが、重ならずに、レア度の数だけ付く。値は範囲の中', () => {
  const rng = makeRng(3);
  for (let i = 0; i < 300; i++) {
    const it = Lo.rollItem(rng, DATA, { ilvl: 5, face: 1 });
    const slot = DATA.slots.find((s) => s.id === it.slot);
    assert.ok(slot.bases.includes(it.base));
    const r = DATA.rarities.find((x) => x.id === it.rarity);
    assert.ok(it.affixes.length >= r.affixes[0] && it.affixes.length <= r.affixes[1], it.rarity + ' ' + it.affixes.length);
    assert.equal(new Set(it.affixes.map((a) => a.id)).size, it.affixes.length);
    for (const a of it.affixes) {
      const d = DATA.affixes.find((x) => x.id === a.id);
      assert.ok(d.slots.includes(it.slot));
      assert.ok(a.v >= d.min && a.v <= Math.ceil(d.max * Lo.faceScale(1)), `${a.id} ${a.v}`);
    }
  }
});
test('装備: 周回の面が進むと、上のレア度が出やすくなり、値の上限も上がる', () => {
  const count = (face) => { const rng = makeRng(9); let hi = 0; for (let i = 0; i < 3000; i++) if (['sunset', 'icosa'].includes(Lo.rollRarity(rng, DATA, { face }))) hi++; return hi; };
  assert.ok(count(5) > count(1) * 1.3);
  assert.ok(Lo.faceScale(5) > Lo.faceScale(1));
  assert.equal(Lo.faceScale(1), 1);
});

test('楽譜: 「音:長さ」を読み、合計のステップ数を返す。和音とドラムも読む', () => {
  assert.equal(Mu.noteToMidi('C4'), 60);
  assert.equal(Mu.noteToMidi('C#4'), 61);
  assert.equal(Mu.noteToMidi('Bb3'), 58);
  const p = Mu.parseNotes('C4:4 E4+G4:2 R:10');
  assert.equal(p.total, 16);
  assert.deepEqual(p.events, [{ step: 0, len: 4, notes: [60] }, { step: 4, len: 2, notes: [64, 67] }]);
  const d = Mu.parseNotes('K+H:2 S:2 R:12', { drums: true });
  assert.deepEqual(d.events, [{ step: 0, len: 2, notes: ['K', 'H'] }, { step: 2, len: 2, notes: ['S'] }]);
  assert.equal(d.total, 16);
  assert.ok(Mu.parseNotes('X9:4 C4:4').errors.length >= 1);
});
test('楽譜: チャンネルの長さが小節に足りなければ休みで埋め、長すぎれば切る', () => {
  const fit = Mu.fitChannel(Mu.parseNotes('C4:4'), 16);
  assert.equal(fit.total, 16);
  const cut = Mu.fitChannel(Mu.parseNotes('C4:12 D4:12'), 16);
  assert.equal(cut.total, 16);
  assert.deepEqual(cut.events.at(-1), { step: 12, len: 4, notes: [62] });
});

test('地図: 文字の並びからタイルと物を読み、物の下の床は周りの床にする', () => {
  const m = Tm.parseMap(['WWWW', 'W.PW', 'W.,W', 'WWWW']);
  assert.equal(m.w, 4); assert.equal(m.h, 4);
  assert.equal(m.tileAt(1, 1), 'sand_plain');
  assert.equal(m.tileAt(2, 1), 'sand_plain');
  assert.deepEqual(m.entities, [{ kind: 'player', ch: 'P', x: 2, y: 1 }]);
  assert.equal(m.solidAt(0, 0), true);
  assert.equal(m.solidAt(1, 1), false);
  assert.equal(m.solidAt(-1, 0), true);
});
test('当たり判定: 箱を動かすと、壁の手前で止まる。軸ごとに滑れる', () => {
  const m = Tm.parseMap(['#####', '#...#', '#...#', '#####']);
  const solid = (tx, ty) => m.solidAt(tx, ty);
  // 16px のタイル。箱 10×8 を x=20, y=20 から左へ大きく動かすと、左の壁（x<16）の手前で止まる
  const r = Tm.moveBox({ x: 20, y: 20, w: 10, h: 8 }, -30, 0, solid, 16);
  assert.equal(r.x, 16); assert.equal(r.hitX, true);
  // 斜めに動かして上の壁に当たっても、横には進む
  const s = Tm.moveBox({ x: 20, y: 20, w: 10, h: 8 }, 6, -10, solid, 16);
  assert.equal(s.x, 26); assert.equal(s.y, 16); assert.equal(s.hitY, true);
});

test('WAV: 16ビットのステレオの形に組み立てる。範囲の外の値は切る', async () => {
  const { encodeWav } = await import('../os/games/icosaria/js/core/wav.mjs');
  const L = new Float32Array([0, 1, -1, 2]), R = new Float32Array([0.5, -0.5, 0, -2]);
  const b = encodeWav([L, R], 44100);
  const dv = new DataView(b.buffer);
  const str = (o, n) => String.fromCharCode(...b.slice(o, o + n));
  assert.equal(str(0, 4), 'RIFF'); assert.equal(str(8, 4), 'WAVE'); assert.equal(str(12, 4), 'fmt '); assert.equal(str(36, 4), 'data');
  assert.equal(dv.getUint16(22, true), 2);
  assert.equal(dv.getUint32(24, true), 44100);
  assert.equal(dv.getUint32(40, true), 4 * 2 * 2);
  assert.equal(b.length, 44 + 16);
  assert.equal(dv.getInt16(44 + 4, true), 32767);
  assert.equal(dv.getInt16(44 + 8, true), -32768);
  assert.equal(dv.getInt16(44 + 12, true), 32767);
});
