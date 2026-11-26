// reports/riemann/js/oneline.mjs（1 行版の Lean ファイルから文字列を取り出す部分）を確かめる
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseProofSources, gitBlobSha1, scanLean } from '../reports/riemann/js/oneline.mjs';

const wrap = (body) => `/- 説明 -/ import Lean def proofSources : Array (String × String) := #[${body}] def main (args : List String) : IO UInt32 := do { pure 0 }`;

test('組を順に取り出し、前後のプログラムを分けて返す', () => {
  const r = parseProofSources(wrap('("a.lean","x"),("dir/b.lean","y")'));
  assert.deepEqual(r.entries, [{ path: 'a.lean', content: 'x' }, { path: 'dir/b.lean', content: 'y' }]);
  assert.match(r.header, /^\/- 説明 -\/ import Lean $/);
  assert.match(r.trailer, /^ def main/);
});

test('Lean の文字列のエスケープを元の文字に戻す', () => {
  const r = parseProofSources(wrap(String.raw`("e.lean","1\n2\t3\\4\"5\'6\x41ζ")`));
  assert.equal(r.entries[0].content, '1\n2\t3\\4"5\'6Aζ');
});

test('行をまたぐ \\ と改行は、次の行の先頭の空白ごと消える', () => {
  const r = parseProofSources(wrap('("g.lean","ab\\\n    cd")'));
  assert.equal(r.entries[0].content, 'abcd');
});

test('知らないエスケープは記録して返す', () => {
  const r = parseProofSources(wrap(String.raw`("q.lean","a\qb")`));
  assert.deepEqual(r.unknownEscapes, ['q']);
});

test('proofSources が無いファイルは断る', () => {
  assert.throws(() => parseProofSources('def main : IO Unit := pure ()'));
});

test('閉じていない文字列は断る', () => {
  assert.throws(() => parseProofSources(wrap('("a.lean","x)')));
});

test('git の識別子（blob の SHA-1）が git と同じになる', () => {
  assert.equal(gitBlobSha1(Buffer.from('')), 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391');
  assert.equal(gitBlobSha1(Buffer.from('hello\n')), 'ce013625030ba8dba906f756967f9e9ca394464a');
});

test('抜け道の語を数える: 文中の単語や名前の一部は数えない', () => {
  const files = [
    { path: 'A.lean', content: 'axiom bad : False\ntheorem t : True := by sorry\n' },
    { path: 'B.lean', content: '-- every a, b admit an idempotent\ntheorem axiomFree : True := trivial\n' },
    { path: 'C.lean', content: 'set_option debug.skipKernelTC true\nexample : 2 + 2 = 4 := by native_decide\n' },
    { path: 'D.lean', content: 'local notation "RH" => True\n#eval IO.println "x"\n' },
  ];
  const s = scanLean(files);
  assert.equal(s.axiom.length, 1);
  assert.equal(s.sorry.length, 1);
  assert.equal(s.admit.length, 0);
  assert.equal(s.skipKernel.length, 1);
  assert.equal(s.nativeDecide.length, 1);
  assert.equal(s.syntax.length, 1);
  assert.equal(s.eval.length, 1);
  assert.equal(s.sorry[0], 'A.lean:2: theorem t : True := by sorry');
});
