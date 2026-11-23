// 保存の中身（client/save.mjs）のテスト: 3 枠、版の番号、壊れた中身、書き出しと読み込み
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptySave, parseSave, putSlot, clearSlot, exportSlot, importText, slotSummary, serializeSave, exportFileName } from '../kanenaki/client/save.mjs';
import { SAVE_VERSION, SAVE_SLOTS } from '../kanenaki/shared/schema.mjs';

const char = (o = {}) => ({ v: 1, id: 'abc123', name: 'リルス', cls: 'adventurer', level: 4, xp: 10, gold: 50, map: 'road', inv: [], equip: {}, stash: [], ...o });

test('空の保存は版の番号と 3 枠を持つ', () => {
  const s = emptySave();
  assert.equal(s.v, SAVE_VERSION);
  assert.equal(s.slots.length, SAVE_SLOTS);
  assert.ok(s.slots.every((x) => x === null));
});

test('読む: 無い・壊れた JSON・知らない形は空の保存にし、理由を返す', () => {
  assert.deepEqual(parseSave(null), { save: emptySave(), error: null });
  for (const bad of ['{oops', '[]', '"x"', JSON.stringify({ v: 1, slots: 'x' })]) {
    const r = parseSave(bad);
    assert.deepEqual(r.save, emptySave());
    assert.ok(r.error, `${bad} は理由つき`);
  }
});

test('読む: 新しすぎる版は読まずに理由を返す（上書きして消さないため）', () => {
  const r = parseSave(JSON.stringify({ v: SAVE_VERSION + 1, slots: [null, null, null] }));
  assert.equal(r.error, 'newer');
});

test('読む: 枠の数が違えば 3 枠にそろえ、壊れた枠は空にする', () => {
  const r = parseSave(JSON.stringify({ v: 1, slots: [{ char: char(), savedAt: 't' }, { char: { name: 1 } }] }));
  assert.equal(r.save.slots.length, SAVE_SLOTS);
  assert.equal(r.save.slots[0].char.name, 'リルス');
  assert.equal(r.save.slots[1], null);
  assert.equal(r.save.slots[2], null);
});

test('書く: 枠に入れると元の保存は変わらず、書いた時刻と最後に遊んだ枠が残る。往復しても同じ', () => {
  const a = emptySave();
  const b = putSlot(a, 1, char(), '2026-11-21T00:00:00.000Z');
  assert.equal(a.slots[1], null);
  assert.equal(b.slots[1].char.level, 4);
  assert.equal(b.slots[1].savedAt, '2026-11-21T00:00:00.000Z');
  assert.equal(b.last, 1);
  assert.deepEqual(parseSave(serializeSave(b)).save, b);
  assert.throws(() => putSlot(a, 3, char()), /枠/);
});

test('消す: その枠だけ空になる', () => {
  const b = clearSlot(putSlot(putSlot(emptySave(), 0, char()), 2, char({ name: 'ミル' })), 0);
  assert.equal(b.slots[0], null);
  assert.equal(b.slots[2].char.name, 'ミル');
});

test('書き出しと読み込み: 書き出した文を読み込むと同じキャラになる。種類・版・中身が違えば断る', () => {
  const s = putSlot(emptySave(), 0, char({ level: 12 }));
  const text = exportSlot(s, 0, '2026-11-21T01:02:03.000Z');
  const r = importText(text);
  assert.equal(r.ok, true);
  assert.deepEqual(r.char, s.slots[0].char);
  assert.equal(importText('{oops').ok, false);
  assert.equal(importText(JSON.stringify({ kind: 'other', v: 1, char: char() })).ok, false);
  assert.equal(importText(JSON.stringify({ kind: 'kanenaki-save', v: SAVE_VERSION + 1, char: char() })).ok, false);
  assert.equal(importText(JSON.stringify({ kind: 'kanenaki-save', v: 1, char: { name: 'x' } })).ok, false);
  assert.equal(exportSlot(s, 1), null, '空の枠は書き出せない');
});

test('書き出すファイルの名前は名前とレベルと日付から作り、使えない文字は入れない', () => {
  assert.equal(exportFileName(char({ name: 'リ/ル:ス', level: 7 }), new Date('2026-11-21T09:00:00Z')), 'kanenaki-リ_ル_ス-Lv7-20261121.json');
});

test('枠の見出し: 名前・職業・レベル・場所。空の枠は null', () => {
  const data = { classes: { adventurer: { name: '冒険者' } }, maps: { road: { name: '枯れ野の街道' } } };
  const s = putSlot(emptySave(), 0, char(), '2026-11-21T00:00:00.000Z');
  assert.deepEqual(slotSummary(s.slots[0], data), { name: 'リルス', cls: '冒険者', level: 4, place: '枯れ野の街道', savedAt: '2026-11-21T00:00:00.000Z' });
  assert.equal(slotSummary(null, data), null);
});
