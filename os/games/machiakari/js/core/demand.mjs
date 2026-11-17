// 需要（住宅・商業・工業・オフィス）。−100〜100。
// 住宅は「働き口の余り」、商業は「住む人と観光客の買い物」、工業は「働き手の余りと外への売り先」、オフィスは「学んだ働き手」で決まる
const clamp = (v, a = -1, b = 1) => Math.max(a, Math.min(b, v));
// 税が 9% より高いと需要が下がり、低いと少し上がる
const taxEffect = (t) => (t > 9 ? (t - 9) * 4.5 : (t - 9) * 2.5);

export function computeDemand({ residents = 0, jobs = { C: 0, I: 0, O: 0 }, edu = 0, taxes = { R: 9, C: 9, I: 9, O: 9 }, happiness = 60, tourists = 0, bonus = {} }) {
  const workforce = residents * 0.55;
  const totalJobs = (jobs.C || 0) + (jobs.I || 0) + (jobs.O || 0) + (jobs.S || 0);
  const free = workforce - totalJobs; // 正なら仕事のない人、負なら人手不足
  const R = 28 + 62 * clamp((totalJobs - workforce) / Math.max(40, workforce * 0.5)) + (happiness - 60) * 0.5 - taxEffect(taxes.R) + (bonus.R || 0);
  const needC = residents * 0.13 + tourists * 0.6;
  const C = 10 + 70 * clamp((needC - (jobs.C || 0)) / Math.max(15, needC * 0.6)) - taxEffect(taxes.C) + (bonus.C || 0);
  const I = 30 + 55 * clamp(free / Math.max(25, workforce * 0.3)) + 15 * clamp(((jobs.C || 0) * 1.2 - (jobs.I || 0)) / Math.max(20, jobs.C || 0)) - taxEffect(taxes.I) + (bonus.I || 0);
  const O = (edu > 0.25 ? 18 + 70 * (edu - 0.25) : -25) + 25 * clamp(free / Math.max(25, workforce * 0.3)) - taxEffect(taxes.O) + (bonus.O || 0);
  const r = (v) => Math.round(clamp(v, -100, 100));
  return { R: r(R), C: r(C), I: r(I), O: r(O), workforce, unemployed: Math.max(0, free) };
}
