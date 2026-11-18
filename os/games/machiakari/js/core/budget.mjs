// 予算: 税の収入、道と施設の維持費、融資の返済
import { BLD } from './city.mjs';
import { ROADS, SVC_BY_ID, POWERLINE, CLASS_OF } from './defs.mjs';
import { hasPolicy } from './policy.mjs';

// 税率 1% あたり、1人（住宅）または働き口1つあたりの月の税収の係数
export const TAX_RATE = { R: 3.1, C: 5.8, I: 4.0, O: 6.5 };

export function taxIncome(s) {
  const out = { R: 0, C: 0, I: 0, O: 0, total: 0 }, N = s.N;
  for (let k = 0; k < N * N; k++) {
    if (s.bld[k] !== BLD.BUILT || !s.occ[k]) continue;
    const cls = CLASS_OF(s.zone[k]);
    if (!cls) continue;
    let v = s.occ[k] * (s.taxes[cls] / 100) * TAX_RATE[cls] * (0.75 + 0.15 * (s.lvl[k] || 1));
    if (cls === 'C' && hasPolicy(s, k, 'smokeFree')) v *= 0.9;
    if (cls === 'I' && hasPolicy(s, k, 'greenIndustry')) v *= 0.85;
    out[cls] += v;
  }
  out.total = out.R + out.C + out.I + out.O;
  return out;
}

export function expenses(s, residents = 0) {
  const N = s.N, bud = (k) => (s.budgets[k] ?? 100) / 100;
  let roads = 0, services = 0, policies = 0;
  const byBudget = {};
  for (let k = 0; k < N * N; k++) {
    if (s.road[k]) roads += ROADS[s.road[k]].upkeep * (s.terrain[k] === 1 ? 2 : 1);
    if (s.pw[k]) roads += POWERLINE.upkeep;
    if (s.svc[k] && s.anchor[k] === k) {
      const def = SVC_BY_ID[s.svc[k]], v = def.upkeep * bud(def.budget);
      services += v;
      byBudget[def.budget] = (byBudget[def.budget] || 0) + v;
    }
  }
  roads *= bud('road');
  // 政策の費用（住む人の数に比例）
  const share = (key) => { const list = Object.entries(s.policies).filter(([, l]) => l && l.includes(key)); if (!list.length) return 0; if (list.some(([d]) => d === '0')) return 1; return Math.min(1, list.length * 0.25); };
  policies += residents * 0.02 * share('patrol') + residents * 0.01 * share('bikeLanes');
  const loans = s.loans.reduce((a, l) => a + l.pay, 0);
  return { roads, services, byBudget, policies, loans, total: roads + services + policies + loans };
}

// 元利均等の毎月の返済額
export function loanPayment(amount, annualRate, months) {
  const i = annualRate / 12;
  return i === 0 ? amount / months : (amount * i) / (1 - Math.pow(1 + i, -months));
}
export const LOANS = [
  { key: 'loan:1', amount: 10000, rate: 0.05, months: 36 },
  { key: 'loan:2', amount: 25000, rate: 0.065, months: 60 },
  { key: 'loan:3', amount: 50000, rate: 0.08, months: 96 },
];
export function takeLoan(s, key) {
  const L = LOANS.find((l) => l.key === key);
  if (!L || s.loans.some((l) => l.key === key)) return false;
  s.loans.push({ key, amount: L.amount, rate: L.rate, months: L.months, left: L.months, pay: loanPayment(L.amount, L.rate, L.months) });
  s.funds += L.amount;
  return true;
}
// 残りを一度に返す（元金の残り = 残りの回数の返済額の今の価値）
export function remaining(l) {
  const i = l.rate / 12;
  return i === 0 ? l.pay * l.left : (l.pay * (1 - Math.pow(1 + i, -l.left))) / i;
}
export function repayLoan(s, key) {
  const l = s.loans.find((x) => x.key === key);
  if (!l) return false;
  const v = Math.ceil(remaining(l));
  if (s.funds < v) return false;
  s.funds -= v;
  s.loans = s.loans.filter((x) => x !== l);
  return true;
}
