// 音の実験室の計算（音のことばの字句・構文の解析、誤りの位置、音の名前と周波数、
// loop を進めたときに予約される音の列、その場で書き換えたときの切り替わり、見本）のテスト。音は鳴らさない
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../os/js/core/livecode.mjs';

// 書いた文字を解析して、誤りが無いことを確かめる
const ok = (src) => { const r = L.compile(src); assert.equal(r.ok, true, JSON.stringify(r.error)); return r.program; };
// 誤りになることと、その行・列・説明を確かめる
const bad = (src) => { const r = L.compile(src); assert.equal(r.ok, false, '誤りになるはず: ' + src); return r.error; };
// 0 秒から鳴らして、until 秒までに予約される音（note と sample）を [時刻, 高さか名前] の並びにする
function play(src, until, { lead = 0 } = {}) {
  const e = new L.Engine();
  e.run(ok(src), 0, { lead });
  return e.advance(until).flatMap((it) => it.events).filter((ev) => ev.kind !== 'rest');
}
const r3 = (x) => Math.round(x * 1000) / 1000;
const simple = (evs) => evs.map((ev) => [r3(ev.time), ev.kind === 'note' ? ev.midi : ev.name]);

/* ---------- 音の名前と周波数 ---------- */
test('音の名前: C4 は 60、シャープとフラット、低い C-1、知らない名前は null', () => {
  assert.equal(L.noteToMidi('C4'), 60);
  assert.equal(L.noteToMidi('A4'), 69);
  assert.equal(L.noteToMidi('D#3'), 51);
  assert.equal(L.noteToMidi('Bb2'), 46);
  assert.equal(L.noteToMidi('eb4'), 63);
  assert.equal(L.noteToMidi('B#3'), 60);
  assert.equal(L.noteToMidi('Cb4'), 59);
  assert.equal(L.noteToMidi('C-1'), 0);
  assert.equal(L.noteToMidi('G9'), 127);
  assert.equal(L.noteToMidi('H4'), null);
  assert.equal(L.noteToMidi('C'), null);
});
test('周波数: A4 は 440Hz、1 オクターブで 2 倍、半音は 2 の 12 乗根', () => {
  assert.equal(L.midiToFreq(69), 440);
  assert.equal(L.midiToFreq(81), 880);
  assert.ok(Math.abs(L.midiToFreq(60) - 261.6256) < 1e-3);
  assert.ok(Math.abs(L.midiToFreq(70) / L.midiToFreq(69) - 2 ** (1 / 12)) < 1e-12);
});
test('MIDI の番号から音の名前へ（シャープで書く）', () => {
  assert.equal(L.midiToName(60), 'C4');
  assert.equal(L.midiToName(61), 'C#4');
  assert.equal(L.midiToName(46), 'A#2');
  assert.equal(L.midiToName(0), 'C-1');
  assert.equal(L.midiToName(60.4), 'C4');
});

/* ---------- 字句 ---------- */
test('字句: 命令・音の名前・数・コメント・名前・記号に分け、行と列を持つ', () => {
  const t = L.tokenize('play D#3 len 0.5 # 低い音\nset 根 = Bb2 + 7');
  const sig = t.filter((x) => x.type !== 'nl').map((x) => [x.type, x.text, x.line, x.col]);
  assert.deepEqual(sig, [
    ['kw', 'play', 1, 1], ['note', 'D#3', 1, 6], ['opt', 'len', 1, 10], ['num', '0.5', 1, 14], ['comment', '# 低い音', 1, 18],
    ['kw', 'set', 2, 1], ['name', '根', 2, 5], ['op', '=', 2, 7], ['note', 'Bb2', 2, 9], ['op', '+', 2, 13], ['num', '7', 2, 15],
  ]);
});
test('字句: 文字の位置（start と end）は元の文字の中の位置', () => {
  const src = 'loop a {\n  sample kick\n}';
  for (const t of L.tokenize(src)) if (t.type !== 'nl') assert.equal(src.slice(t.start, t.end), t.text);
});
test('字句: 音色・打楽器・効果・和音の名前は builtin、pick などは func、知らない文字は bad', () => {
  const ty = (s) => L.tokenize(s).filter((x) => x.type !== 'nl').map((x) => x.type);
  assert.deepEqual(ty('synth saw'), ['kw', 'builtin']);
  assert.deepEqual(ty('sample kick'), ['kw', 'builtin']);
  assert.deepEqual(ty('fx echo'), ['kw', 'builtin']);
  assert.deepEqual(ty('play pick [C4 E4]'), ['kw', 'func', 'punct', 'note', 'note', 'punct']);
  assert.deepEqual(ty('chord C4 major'), ['kw', 'note', 'builtin']);
  assert.deepEqual(ty('play C4 ＠'), ['kw', 'note', 'bad']);
});
test('字句: 閉じていない文字があっても止まらない（色分けは書いている途中でも使う）', () => {
  assert.ok(L.tokenize('loop {\n play [C4 E4\n# ').length > 3);
  assert.equal(L.tokenize('').length, 0);
});

/* ---------- 構文と誤り ---------- */
test('構文: tempo・seed・set・loop。loop の名前は日本語でもよい', () => {
  const p = ok('tempo 90\nseed 3\nset root = C3\nloop ドラム {\n  sample kick\n  rest 1\n}\nloop bass {\n  play root\n  rest 2\n}');
  assert.equal(p.tempo, 90);
  assert.equal(p.seed, 3);
  assert.deepEqual(p.loops.map((l) => l.name), ['ドラム', 'bass']);
  assert.equal(p.globals.get('root'), 48);
});
test('構文: tempo を書かなければ 120、seed は 1', () => {
  const p = ok('loop a {\n play C4\n rest 1\n}');
  assert.equal(p.tempo, 120);
  assert.equal(p.seed, 1);
});
test('誤り: 知らない命令は、行と列と日本語の説明。近い命令を勧める', () => {
  const e = bad('loop a {\n  plya C4\n  rest 1\n}');
  assert.equal(e.line, 2); assert.equal(e.col, 3); assert.equal(e.len, 4);
  assert.match(e.message, /plya/); assert.match(e.message, /play/);
});
test('誤り: 閉じていない { は、その { の位置を出す', () => {
  const e = bad('tempo 100\nloop a {\n  play C4\n  rest 1\n');
  assert.equal(e.line, 2); assert.equal(e.col, 8);
  assert.match(e.message, /}/);
});
test('誤り: 閉じていない [ と (', () => {
  let e = bad('loop a {\n play [C4 E4\n rest 1\n}');
  assert.equal(e.line, 2); assert.equal(e.col, 7); assert.match(e.message, /\]/);
  e = bad('loop a {\n play (C4 + 2\n rest 1\n}');
  assert.match(e.message, /\)/);
  ok('loop a {\n play [chord C4 major\n  G5]\n rest 1\n}'); // [ ] の中は行をまたげる
});
test('誤り: 対応する { の無い }', () => {
  const e = bad('loop a {\n play C4\n rest 1\n}\n}');
  assert.equal(e.line, 5); assert.equal(e.col, 1);
});
test('誤り: 知らない打楽器・音色・効果は、使えるものを並べて勧める', () => {
  let e = bad('loop a {\n sample kik\n rest 1\n}');
  assert.equal(e.line, 2); assert.equal(e.col, 9); assert.match(e.message, /kick/);
  e = bad('loop a {\n synth sawtooth\n play C4\n rest 1\n}');
  assert.equal(e.line, 2); assert.match(e.message, /saw/);
  e = bad('loop a {\n fx eco\n play C4\n rest 1\n}');
  assert.match(e.message, /echo/);
});
test('誤り: 決めていない名前と、高さの数を忘れた音の名前', () => {
  let e = bad('loop a {\n play root\n rest 1\n}');
  assert.equal(e.line, 2); assert.equal(e.col, 7); assert.match(e.message, /root/);
  e = bad('loop a {\n play D\n rest 1\n}');
  assert.match(e.message, /D4/);
});
test('誤り: 1 つの行に続きが残っている（同時に鳴らすなら [ ] と勧める）', () => {
  const e = bad('loop a {\n play C4 E4\n rest 1\n}');
  assert.equal(e.line, 2); assert.equal(e.col, 10);
  assert.match(e.message, /\[/);
});
test('誤り: rest の無い loop は、止まらなくなるので誤り（loop の行を指す）', () => {
  const e = bad('tempo 120\nloop a {\n play C4\n}');
  assert.equal(e.line, 2); assert.match(e.message, /rest/);
});
test('誤り: loop の中の loop、loop の外の fx、2 回の tempo、同じ名前の loop', () => {
  assert.match(bad('loop a {\n loop b {\n rest 1\n }\n}').message, /loop/);
  assert.match(bad('fx echo\nloop a {\n rest 1\n}').message, /fx/);
  assert.equal(bad('tempo 100\ntempo 120\nloop a {\n rest 1\n}').line, 2);
  const e = bad('loop a {\n rest 1\n}\nloop a {\n rest 2\n}');
  assert.equal(e.line, 4); assert.match(e.message, /a/);
});
test('誤り: 範囲の外の数（tempo・amp・len・音の高さ・repeat の数）', () => {
  assert.match(bad('tempo 5\nloop a {\n rest 1\n}').message, /tempo/);
  assert.equal(bad('loop a {\n play C4 amp 9\n rest 1\n}').line, 2);
  assert.equal(bad('loop a {\n play C4 len 0\n rest 1\n}').line, 2);
  assert.equal(bad('loop a {\n play 200\n rest 1\n}').line, 2);
  assert.equal(bad('loop a {\n repeat 2.5 {\n rest 1\n }\n}').line, 2);
  assert.equal(bad('loop a {\n rest -1\n}').line, 2);
});
test('誤り: sample に len は使えない（使えるものを出す）', () => {
  const e = bad('loop a {\n sample kick len 2\n rest 1\n}');
  assert.equal(e.line, 2); assert.equal(e.col, 14); assert.match(e.message, /amp/);
});
test('誤り: 全角の文字は、半角で書くように言う', () => {
  const e = bad('loop a {\n ｐｌａｙ C4\n rest 1\n}');
  assert.match(e.message, /半角/);
  assert.match(bad('loop a {\n play C4　＃\n rest 1\n}').message, /半角/);
});
test('誤り: set の = を忘れた・決まった名前を set に使った', () => {
  assert.match(bad('set root C3\nloop a {\n rest 1\n}').message, /=/);
  assert.match(bad('set count = 1\nloop a {\n rest 1\n}').message, /count/);
});
test('誤り: 0 で割る（実行してみて見つかる誤りも、行と列を出す）', () => {
  const e = bad('loop a {\n play C4 + 1 / 0\n rest 1\n}');
  assert.equal(e.line, 2);
});

/* ---------- 実行: 予約される音の列 ---------- */
test('実行: tempo 120 では 1 拍が 0.5 秒。play は鳴らすだけで、rest で進む', () => {
  const evs = play('tempo 120\nloop a {\n play C4\n rest 1\n play E4 len 0.5\n rest 1\n}', 2);
  assert.deepEqual(simple(evs), [[0, 60], [0.5, 64], [1, 60], [1.5, 64]]);
  assert.equal(evs[0].dur, 0.5); // len を書かなければ 1 拍
  assert.equal(evs[1].dur, 0.25);
  assert.equal(evs[0].synth, 'sine');
  assert.equal(evs[0].line, 3);
});
test('実行: 予約は lead 秒あとから始まる', () => {
  assert.deepEqual(simple(play('loop a {\n play C4\n rest 1\n}', 1.2, { lead: 0.1 })), [[0.1, 60], [0.6, 60], [1.1, 60]]);
});
test('実行: 複数の loop は同時に始まり、それぞれの長さでくり返す', () => {
  const evs = play('tempo 60\nloop a {\n sample kick\n rest 1\n}\nloop b {\n play G4\n rest 1.5\n}', 3);
  assert.deepEqual(simple(evs), [[0, 'kick'], [0, 67], [1, 'kick'], [1.5, 67], [2, 'kick']]);
});
test('実行: repeat と、[ ] で同時に鳴らす音、chord の和音', () => {
  const evs = play('tempo 60\nloop a {\n repeat 2 {\n  play [C4 G4]\n  rest 0.5\n }\n chord A3 minor\n rest 1\n}', 1.9);
  assert.deepEqual(simple(evs), [[0, 60], [0, 67], [0.5, 60], [0.5, 67], [1, 57], [1, 60], [1, 64]]);
});
test('実行: 和音の種類と音階', () => {
  assert.deepEqual(L.chordNotes(60, 'major'), [60, 64, 67]);
  assert.deepEqual(L.chordNotes(60, 'minor'), [60, 63, 67]);
  assert.deepEqual(L.chordNotes(60, 'dom7'), [60, 64, 67, 70]);
  assert.deepEqual(L.chordNotes(57, 'min7'), [57, 60, 64, 67]);
  assert.deepEqual(L.scaleNotes(60, 'penta'), [60, 62, 64, 67, 69, 72]);
  assert.deepEqual(L.scaleNotes(60, 'major'), [60, 62, 64, 65, 67, 69, 71, 72]);
});
test('実行: 変数と計算。音の名前は数として足し引きできる。並びに足すと全部に足す', () => {
  const evs = play('tempo 60\nset root = C3\nset up = [0 4 7]\nloop a {\n play root + 7\n rest 1\n play root + up + 12\n rest 1\n}', 1.9);
  assert.deepEqual(simple(evs), [[0, 55], [1, 60], [1, 64], [1, 67]]);
  const p = ok('set x = (1 + 2) * 4 - 6 / 3\nloop a {\n rest 1\n}');
  assert.equal(p.globals.get('x'), 10);
});
test('実行: loop の中の set は、そのくり返しの中で使える', () => {
  const evs = play('tempo 60\nloop a {\n set n = C4\n repeat 3 {\n  play n\n  set n = n + 2\n  rest 1\n }\n}', 2.5);
  assert.deepEqual(simple(evs), [[0, 60], [1, 62], [2, 64]]);
});
test('実行: count はくり返しの回数（0 から）。cycle は並びを順に回す', () => {
  const evs = play('tempo 60\nloop a {\n play C4 + count\n play cycle [E5 G5 B5]\n rest 1\n}', 3.5);
  assert.deepEqual(simple(evs), [[0, 60], [0, 76], [1, 61], [1, 79], [2, 62], [2, 83], [3, 63], [3, 76]]);
});
test('実行: synth の命令は、そのあとの play の音色を変える。play の synth はその音だけ', () => {
  const evs = play('loop a {\n play C4\n synth saw\n play D4\n play E4 synth bell\n play F4\n rest 1\n}', 0.1);
  assert.deepEqual(evs.map((e) => e.synth), ['sine', 'saw', 'bell', 'saw']);
});
test('実行: loop の外の synth は、すべての loop の初めの音色になる', () => {
  const evs = play('synth pluck\nloop a {\n play C4\n rest 1\n}', 0.1);
  assert.equal(evs[0].synth, 'pluck');
});
test('実行: amp・pan・rate の値が音に付く', () => {
  const evs = play('loop a {\n play C4 amp 0.5 pan -1\n sample snare amp 1.2 rate 2\n rest 1\n}', 0.1);
  assert.equal(evs[0].amp, 0.5); assert.equal(evs[0].pan, -1);
  assert.equal(evs[1].name, 'snare'); assert.equal(evs[1].amp, 1.2); assert.equal(evs[1].rate, 2);
});
test('実行: 音には周波数も付く', () => {
  const evs = play('loop a {\n play A4\n rest 1\n}', 0.1);
  assert.equal(evs[0].freq, 440);
});
test('実行: fx は、そのくり返しのすべての音に掛ける効果の並び（拍の長さも渡す）', () => {
  const e = new L.Engine();
  e.run(ok('tempo 120\nloop a {\n fx lowpass 800\n fx echo\n play C4\n rest 1\n}'), 0, { lead: 0 });
  const [it] = e.advance(0.1);
  assert.deepEqual(it.fx, [{ type: 'lowpass', value: 800 }, { type: 'echo', value: 0.5 }]);
  assert.equal(it.spb, 0.5);
  assert.equal(it.loop, 'a');
});
test('実行: fx の数は count で変えられる（くり返しごとに計算する）', () => {
  const e = new L.Engine();
  e.run(ok('tempo 60\nloop a {\n fx lowpass 400 + count * 100\n play C4\n rest 1\n}'), 0, { lead: 0 });
  assert.deepEqual(e.advance(2.5).map((it) => it.fx[0].value), [400, 500, 600]);
});
test('実行: 種が同じなら pick と rand は同じ並び、種を変えると変わる', () => {
  const src = (s) => `seed ${s}\ntempo 240\nloop m {\n play pick [C4 D4 E4 G4 A4] amp rand 0.2 0.9\n rest 0.25\n}`;
  const a = play(src(7), 4), b = play(src(7), 4), c = play(src(8), 4);
  assert.deepEqual(a.map((e) => [e.midi, e.amp]), b.map((e) => [e.midi, e.amp]));
  assert.notDeepEqual(a.map((e) => e.midi), c.map((e) => e.midi));
  assert.ok(a.every((e) => [60, 62, 64, 67, 69].includes(e.midi) && e.amp >= 0.2 && e.amp < 0.9));
  assert.ok(new Set(a.map((e) => e.midi)).size >= 3, '5 つの中から散らばる');
});
test('実行: 乱数は loop ごとに別の流れ（ほかの loop を足しても並びが変わらない）', () => {
  const one = play('seed 5\ntempo 240\nloop m {\n play pick [C4 D4 E4 G4]\n rest 0.25\n}', 3);
  const two = play('seed 5\ntempo 240\nloop m {\n play pick [C4 D4 E4 G4]\n rest 0.25\n}\nloop x {\n play pick [C5 D5]\n rest 0.5\n}', 3);
  assert.deepEqual(one.map((e) => e.midi), two.filter((e) => e.loop === 'm').map((e) => e.midi));
});
test('実行: loop の外の play は、動かしたときに 1 回だけ鳴る', () => {
  const evs = play('tempo 60\nplay C5\nrest 1\nplay D5\nloop a {\n sample hat\n rest 1\n}', 3);
  assert.deepEqual(simple(evs.filter((e) => e.loop !== 'a')), [[0, 72], [1, 74]]);
  assert.equal(evs.filter((e) => e.loop === 'a').length, 3);
});
test('実行: 印（rest）も行の番号を持つ（今の行を光らせるため）', () => {
  const e = new L.Engine();
  e.run(ok('tempo 60\nloop a {\n play C4\n rest 1\n}'), 0, { lead: 0 });
  const evs = e.advance(0.5)[0].events;
  assert.deepEqual(evs.map((x) => [x.kind, x.line, x.time]), [['note', 3, 0], ['rest', 4, 0]]);
  assert.equal(evs[1].dur, 1);
});

/* ---------- その場で書き換える ---------- */
const A = 'tempo 120\nloop a {\n play C4\n rest 1\n play E4\n rest 1\n}';
const B = 'tempo 120\nloop a {\n play G4\n rest 0.5\n}';
test('書き換え: 同じ名前の loop は、次のくり返しの頭から新しい中身になる', () => {
  const e = new L.Engine();
  e.run(ok(A), 0, { lead: 0 });
  const first = e.advance(0.3).flatMap((it) => it.events).filter((x) => x.kind === 'note');
  assert.deepEqual(simple(first), [[0, 60], [0.5, 64]]);
  e.run(ok(B), 0.6); // 1 回目のくり返し（0〜1 秒）の途中で書き換える
  const next = e.advance(2.2).flatMap((it) => it.events).filter((x) => x.kind === 'note');
  assert.deepEqual(simple(next), [[1, 67], [1.25, 67], [1.5, 67], [1.75, 67], [2, 67]]);
});
test('書き換え: くり返しの回数（count）は続きから数える', () => {
  const e = new L.Engine();
  e.run(ok('tempo 60\nloop a {\n play C4 + count\n rest 1\n}'), 0, { lead: 0 });
  e.advance(1.5);
  e.run(ok('tempo 60\nloop a {\n play C5 + count\n rest 1\n}'), 1.2);
  const evs = e.advance(3.5).flatMap((it) => it.events).filter((x) => x.kind === 'note');
  assert.deepEqual(simple(evs), [[2, 74], [3, 75]]);
});
test('書き換え: 消した loop は、今のくり返しを鳴らし終えたら止まる', () => {
  const e = new L.Engine();
  e.run(ok('tempo 60\nloop a {\n play C4\n rest 2\n}\nloop b {\n sample kick\n rest 1\n}'), 0, { lead: 0 });
  e.advance(0.5);
  e.run(ok('tempo 60\nloop b {\n sample kick\n rest 1\n}'), 0.7);
  const evs = e.advance(5).flatMap((it) => it.events).filter((x) => x.kind !== 'rest');
  assert.equal(evs.filter((x) => x.loop === 'a').length, 0);
  assert.deepEqual(e.status().map((s) => s.name), ['b']);
});
test('書き換え: 新しく足した loop は、次の小節（4 拍）の頭から始まる', () => {
  const e = new L.Engine();
  e.run(ok('tempo 120\nloop a {\n sample kick\n rest 1\n}'), 0, { lead: 0 });
  e.advance(0.2);
  e.run(ok('tempo 120\nloop a {\n sample kick\n rest 1\n}\nloop b {\n play C5\n rest 1\n}'), 0.7);
  const b = e.advance(3).flatMap((it) => it.events).filter((x) => x.loop === 'b' && x.kind === 'note');
  assert.equal(r3(b[0].time), 2); // 4 拍 = 2 秒の頭
});
test('書き換え: tempo を変えると、それぞれの loop の次のくり返しから速さが変わる', () => {
  const e = new L.Engine();
  e.run(ok('tempo 60\nloop a {\n sample kick\n rest 1\n}'), 0, { lead: 0 });
  e.advance(0.5);
  e.run(ok('tempo 120\nloop a {\n sample kick\n rest 1\n}'), 0.5);
  const t = e.advance(2.1).flatMap((it) => it.events).filter((x) => x.kind === 'sample').map((x) => r3(x.time));
  assert.deepEqual(t, [1, 1.5, 2]);
});
test('書き換え: 種を変えると、次のくり返しから乱数の並びを初めからにする', () => {
  const src = (s) => `seed ${s}\ntempo 60\nloop m {\n play pick [C4 D4 E4 G4 A4 B4]\n rest 1\n}`;
  const fresh = play(src(9), 3).map((x) => x.midi);
  const e = new L.Engine();
  e.run(ok(src(2)), 0, { lead: 0 });
  e.advance(2.5);
  e.run(ok(src(9)), 2.5);
  const after = e.advance(6).flatMap((it) => it.events).filter((x) => x.kind === 'note').map((x) => x.midi);
  assert.deepEqual(after, fresh);
});
test('止める: stop のあとは何も予約しない。もう一度 run すると初めから', () => {
  const e = new L.Engine();
  e.run(ok(A), 0, { lead: 0 });
  e.advance(1);
  e.stop();
  assert.equal(e.advance(5).length, 0);
  assert.equal(e.playing, false);
  e.run(ok(A), 10, { lead: 0.1 });
  // 1 回分のくり返し（C4 と E4）をまとめて予約する
  assert.deepEqual(simple(e.advance(10.2).flatMap((it) => it.events).filter((x) => x.kind === 'note')), [[10.1, 60], [10.6, 64]]);
});
test('実行の誤り: 途中のくり返しで誤りが出た loop だけ止まり、誤りを残す', () => {
  const e = new L.Engine();
  // 3 回目（count が 2）で 0 で割る
  e.run(ok('tempo 60\nloop a {\n play C4 + 12 / (2 - count)\n rest 1\n}\nloop b {\n sample hat\n rest 1\n}'), 0, { lead: 0 });
  const evs = e.advance(4.5).flatMap((it) => it.events).filter((x) => x.kind !== 'rest');
  assert.equal(evs.filter((x) => x.loop === 'a').length, 2);
  assert.equal(evs.filter((x) => x.loop === 'b').length, 5);
  assert.equal(e.errors.length, 1);
  assert.equal(e.errors[0].loop, 'a'); assert.equal(e.errors[0].line, 3);
});

test('実行: % は割った余り（負の数でも 0 以上）', () => {
  const p = ok('set a = 10 % 4\nset b = -1 % 12\nset c = 2 + 7 % 4 * 2\nloop x {\n rest 1\n}');
  assert.equal(p.globals.get('a'), 2);
  assert.equal(p.globals.get('b'), 11);
  assert.equal(p.globals.get('c'), 8);
});

/* ---------- エディタの字下げ ---------- */
test('字下げ: Enter のあとは前の行と同じ。{ で終わる行のあとは 2 つ深く', () => {
  assert.equal(L.nextIndent('  play C4'), '  ');
  assert.equal(L.nextIndent('loop a {'), '  ');
  assert.equal(L.nextIndent('  repeat 4 {  # 4 回'), '    ');
  assert.equal(L.nextIndent('play C4'), '');
});
test('字下げ: 選んだ行をまとめて深くする・戻す。選ぶ範囲もずらす', () => {
  const t = 'loop a {\nplay C4\nrest 1\n}';
  const s = t.indexOf('play'), e = t.indexOf('1') + 1;
  const r = L.indentLines(t, s, e, 1);
  assert.equal(r.text, 'loop a {\n  play C4\n  rest 1\n}');
  assert.equal(r.text.slice(r.start, r.end), '  play C4\n  rest 1');
  const back = L.indentLines(r.text, r.start, r.end, -1);
  assert.equal(back.text, t);
  assert.equal(back.text.slice(back.start, back.end), 'play C4\nrest 1');
  // 字下げが 1 つしか無い行は、その分だけ戻す。字下げの無い行はそのまま
  assert.equal(L.indentLines(' a\nb', 0, 4, -1).text, 'a\nb');
  // 次の行の頭までを選んだときは、その行は含めない
  assert.equal(L.indentLines('a\nb\nc', 0, 2, 1).text, '  a\nb\nc');
});

test('コメント: 選んだ行の頭に # を付ける。全部に付いていれば外す。空の行はそのまま', () => {
  const t = 'loop a {\n  play C4\n\n  rest 1\n}';
  const s = t.indexOf('play'), e = t.indexOf('rest 1') + 6;
  const r = L.toggleComment(t, s, e);
  assert.equal(r.text, 'loop a {\n  # play C4\n\n  # rest 1\n}');
  const back = L.toggleComment(r.text, r.start, r.end);
  assert.equal(back.text, t);
  // 1 行だけ（何も選んでいない）
  assert.equal(L.toggleComment('play C4', 3, 3).text, '# play C4');
  assert.equal(L.toggleComment('#play C4', 0, 0).text, 'play C4');
});
test('版の番号: くり返しには、その中身を渡した run の番号が付く', () => {
  const e = new L.Engine();
  e.run(ok(A), 0, { lead: 0 });
  assert.equal(e.advance(0.1)[0].ver, 1);
  e.run(ok(B), 0.5);
  assert.deepEqual(e.advance(1.6).map((it) => it.ver), [2, 2, 2]);
});

/* ---------- 書き出しの長さ ---------- */
test('書き出し: 小節の数と tempo から秒の長さ（4 拍で 1 小節）', () => {
  assert.equal(L.barsToSeconds(4, 120), 8);
  assert.equal(L.barsToSeconds(2, 60), 8);
});

/* ---------- 見本 ---------- */
test('見本: 4〜6 個あり、どれも誤りなく解析でき、音が予約される', () => {
  assert.ok(L.EXAMPLES.length >= 4 && L.EXAMPLES.length <= 6);
  for (const ex of L.EXAMPLES) {
    const p = ok(ex.code);
    assert.ok(ex.name && ex.id, ex.id);
    const e = new L.Engine(); e.run(p, 0, { lead: 0 });
    const evs = e.advance(L.barsToSeconds(2, p.tempo)).flatMap((it) => it.events).filter((x) => x.kind !== 'rest');
    assert.ok(evs.length > 0, ex.id);
  }
});
test('見本「最初の一音」: ド・ミ・ソ・ド を 1 拍ずつ', () => {
  const ex = L.EXAMPLES[0];
  const p = ok(ex.code);
  const e = new L.Engine(); e.run(p, 0, { lead: 0 });
  const spb = 60 / p.tempo;
  const evs = e.advance(4 * spb - 0.001).flatMap((it) => it.events).filter((x) => x.kind === 'note');
  assert.deepEqual(evs.map((x) => x.midi), [60, 64, 67, 72]);
  assert.deepEqual(evs.map((x) => r3(x.time / spb)), [0, 1, 2, 3]);
});
test('見本「ドラムの 8 ビート」: 1 小節にハイハット 8 つ、バスドラムは 1 拍目と 3 拍目、スネアは 2 拍目と 4 拍目', () => {
  const ex = L.EXAMPLES.find((x) => x.id === 'beat8');
  const p = ok(ex.code), spb = 60 / p.tempo;
  const e = new L.Engine(); e.run(p, 0, { lead: 0 });
  const evs = e.advance(4 * spb - 0.001).flatMap((it) => it.events).filter((x) => x.kind === 'sample');
  const at = (n) => evs.filter((x) => x.name === n).map((x) => r3(x.time / spb));
  assert.deepEqual(at('hat'), [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]);
  assert.deepEqual(at('kick'), [0, 2]);
  assert.deepEqual(at('snare'), [1, 3]);
});
test('見本: 「和音とベース」「ランダムな旋律」「エコー」がある', () => {
  const ids = L.EXAMPLES.map((x) => x.id);
  for (const id of ['chords', 'random', 'echo']) assert.ok(ids.includes(id), id);
  const echo = L.EXAMPLES.find((x) => x.id === 'echo');
  const e = new L.Engine(); e.run(ok(echo.code), 0, { lead: 0 });
  assert.ok(e.advance(1).some((it) => it.fx.some((f) => f.type === 'echo')));
});

/* ---------- 説明書 ---------- */
test('説明書: 命令ごとに説明と例があり、例はどれも解析できる', () => {
  assert.ok(L.REFERENCE.length >= 10);
  for (const r of L.REFERENCE) {
    assert.ok(r.word && r.text && r.example, r.word);
    // loop を含む例はそのまま、tempo・seed・set の例は loop の外に、ほかは loop の中に入れて解析する
    const code = /\bloop\b/.test(r.example) ? r.example
      : /^(tempo|seed|set)\b/.test(r.example) ? `${r.example}\nloop 例 {\n rest 1\n}` : `loop 例 {\n${r.example}\n rest 1\n}`;
    assert.equal(L.compile(code).ok, true, r.word + ': ' + JSON.stringify(L.compile(code).error));
  }
});
