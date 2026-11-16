// Wavefront OBJ / MTL の書き出しと読み込み。面の色は "c_rrggbb" という名前の材質として持つ
const fmt = (x) => +x.toFixed(5);
export function toOBJ(objects, mtlName = 'model.mtl') {
  let s = '# Future OS ローポリ モデラー\nmtllib ' + mtlName + '\n', base = 1;
  for (const { name, mesh } of objects) {
    s += `o ${name}\n`;
    for (const p of mesh.v) s += `v ${fmt(p[0])} ${fmt(p[1])} ${fmt(p[2])}\n`;
    let cur = null;
    for (const f of mesh.f) {
      const mtl = 'c_' + (f.c || '#c0c0c0').slice(1).toLowerCase();
      if (mtl !== cur) { s += `usemtl ${mtl}\n`; cur = mtl; }
      s += 'f ' + f.i.map((i) => i + base).join(' ') + '\n';
    }
    base += mesh.v.length;
  }
  return s;
}
export function toMTL(objects) {
  const cols = new Set(objects.flatMap(({ mesh }) => mesh.f.map((f) => (f.c || '#c0c0c0').toLowerCase())));
  return [...cols].map((c) => { const n = parseInt(c.slice(1), 16), r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255; return `newmtl c_${c.slice(1)}\nKd ${fmt(r)} ${fmt(g)} ${fmt(b)}\n`; }).join('\n');
}
export function fromOBJ(text) {
  const all = [], objs = [];
  let cur = null, color = '#c0c0c0';
  const start = (name) => { cur = { name, mesh: { v: [], f: [] }, map: new Map() }; objs.push(cur); };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line[0] === '#') continue;
    const [tag, ...rest] = line.split(/\s+/);
    if (tag === 'o' || tag === 'g') { if (!cur || cur.mesh.f.length) start(rest.join(' ') || '物体'); else cur.name = rest.join(' ') || cur.name; }
    else if (tag === 'v') {
      // 頂点は書かれた順のまま、いまの物体に持たせる（読み戻しても番号が変わらない）
      if (!cur) start('物体');
      all.push(rest.slice(0, 3).map(Number));
      cur.map.set(all.length - 1, cur.mesh.v.length);
      cur.mesh.v.push(all[all.length - 1].slice());
    }
    else if (tag === 'usemtl') { const m = /^c_([0-9a-f]{6})$/i.exec(rest[0] || ''); color = m ? '#' + m[1].toLowerCase() : '#c0c0c0'; }
    else if (tag === 'f') {
      if (!cur) start('物体');
      const ix = rest.map((t) => { let n = parseInt(t.split('/')[0], 10); n = n < 0 ? all.length + n : n - 1; if (!cur.map.has(n)) { cur.map.set(n, cur.mesh.v.length); cur.mesh.v.push(all[n].slice()); } return cur.map.get(n); });
      if (ix.length >= 3) cur.mesh.f.push({ i: ix, c: color });
    }
  }
  return objs.filter((o) => o.mesh.f.length).map(({ name, mesh }) => ({ name, mesh }));
}
