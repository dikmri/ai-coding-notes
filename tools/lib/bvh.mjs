// 人の動きの記録（BVH）を読む。骨の並び（HIERARCHY）と、コマごとの数（MOTION）
import * as Q from './quat.mjs';

export function parse(text) {
  const tok = text.split(/\s+/).filter(Boolean);
  let i = 0;
  const joints = [];
  const expect = (w) => { if (tok[i++] !== w) throw new Error(`BVH: ${w} がありません（${tok[i - 1]}）`); };
  function joint(parent) {
    const kind = tok[i++];   // ROOT か JOINT
    if (kind !== 'ROOT' && kind !== 'JOINT') throw new Error('BVH: 骨の書き方が違います: ' + kind);
    const j = { name: tok[i++], parent, offset: null, channels: [], end: null };
    const me = joints.push(j) - 1;
    expect('{'); expect('OFFSET'); j.offset = [+tok[i++], +tok[i++], +tok[i++]];
    expect('CHANNELS'); const n = +tok[i++]; j.channels = tok.slice(i, i + n); i += n;
    while (tok[i] !== '}') {
      if (tok[i] === 'End') { i += 2; expect('{'); expect('OFFSET'); j.end = [+tok[i++], +tok[i++], +tok[i++]]; expect('}'); }
      else joint(me);
    }
    expect('}');
  }
  expect('HIERARCHY'); joint(-1);
  expect('MOTION'); expect('Frames:'); const count = +tok[i++];
  expect('Frame'); expect('Time:'); const frameTime = +tok[i++];
  const per = joints.reduce((a, j) => a + j.channels.length, 0), frames = [];
  for (let f = 0; f < count; f++) { frames.push(Float32Array.from(tok.slice(i, i + per), Number)); i += per; }
  return { joints, frames, frameTime };
}

// 1 コマの、関節ごとの世界での位置と回転。位置の数がある関節はそれを、ない関節は OFFSET を親からの位置にする
export function fk(b, f) {
  const row = b.frames[f], pos = [], rot = [];
  let k = 0;
  b.joints.forEach((j, n) => {
    const t = j.offset.slice(), axes = [], degs = [];
    for (const c of j.channels) {
      const v = row[k++];
      if (c.endsWith('position')) t['XYZ'.indexOf(c[0])] = v;
      else { axes.push(c[0]); degs.push(v); }
    }
    const q = Q.fromEuler(axes, degs);
    if (j.parent < 0) { pos[n] = t; rot[n] = q; }
    else { const p = pos[j.parent], r = rot[j.parent], d = Q.rotate(r, t); pos[n] = [p[0] + d[0], p[1] + d[1], p[2] + d[2]]; rot[n] = Q.mul(r, q); }
  });
  return { pos, rot };
}
