// 育成の決まり（純粋な関数）: パッシブのツリーのつながり、スキルのランク、レベルが上がったときの点
export function treeRoots(tree, cls) {
  const roots = new Set();
  const s = tree?.starts?.adventurer;
  if (s && tree.nodes[s]) roots.add(s);
  if (cls && cls !== 'adventurer') {
    const g = tree?.starts?.[cls];
    if (g && tree.nodes[g]) roots.add(g);
  }
  return roots;
}

export function canAlloc(tree, alloc, id) {
  const n = tree?.nodes?.[id];
  if (!n) return { ok: false, code: 'noNode' };
  if (alloc.has(id)) return { ok: false, code: 'already' };
  if (!n.links.some((l) => alloc.has(l))) return { ok: false, code: 'notConnected' };
  return { ok: true };
}

// 取り消したあとも、取ったマスが全部どれかの根からつながっているか
export function canUnalloc(tree, alloc, id, roots) {
  if (!alloc.has(id)) return { ok: false, code: 'notAllocated' };
  if (roots.has(id)) return { ok: false, code: 'root' };
  const left = new Set(alloc); left.delete(id);
  const seen = new Set();
  const q = [...roots].filter((r) => left.has(r));
  for (const r of q) seen.add(r);
  while (q.length) {
    const n = tree.nodes[q.pop()];
    for (const l of n?.links ?? []) if (left.has(l) && !seen.has(l)) { seen.add(l); q.push(l); }
  }
  if (seen.size < left.size) return { ok: false, code: 'wouldDisconnect' };
  return { ok: true };
}

// 取ったマスから、能力値の修正と要の決まりを集める
export function treeMods(tree, alloc) {
  const mods = [], rules = [];
  for (const id of alloc) {
    const n = tree?.nodes?.[id];
    if (!n) continue;
    for (const m of n.mods) mods.push(m);
    if (n.rule) rules.push(n.rule);
  }
  return { mods, rules };
}

// 冒険者のスキルは転職後も使える。魔物のスキル（cls: 'monster'）は使えない
export const skillUsable = (skill, cls) => !!skill && (skill.cls === 'adventurer' || skill.cls === cls);

// 今のランク rank から 1 つ上げられるか。ランク r+1 には Lv(unlock + r) が要る
export function canRankUp(skill, cls, level, rank, points) {
  if (!skill) return { ok: false, code: 'noSkill' };
  if (!skillUsable(skill, cls)) return { ok: false, code: 'wrongClass' };
  if (rank >= skill.maxRank) return { ok: false, code: 'maxRank' };
  if (level < skill.unlock + rank) return { ok: false, code: 'level' };
  if (points < 1) return { ok: false, code: 'noPoints' };
  return { ok: true };
}

export const levelUpGains = (from, to) => ({ passive: Math.max(0, to - from), skill: Math.max(0, to - from) });
