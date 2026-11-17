// 政策: 市全体（0）と、マスの属する地区の政策を合わせて調べる
export function hasPolicy(s, k, key) {
  const city = s.policies[0];
  if (city && city.includes(key)) return true;
  const d = s.dist[k];
  return !!(d && s.policies[d] && s.policies[d].includes(key));
}
// どこかで使われていれば true（市全体の効果の計算用）
export function anyPolicy(s, key) {
  return Object.values(s.policies).some((list) => list && list.includes(key));
}
