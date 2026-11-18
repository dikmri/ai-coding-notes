// 建物の成長: 建つ確率、水準（1〜3）、空き家になる確率
import { ZONES } from './defs.mjs';

export const capacity = (zone, level) => (ZONES[zone] ? ZONES[zone].cap[Math.max(1, Math.min(3, level)) - 1] : 0);

// 1回の見回りで建ち始める確率。道に面していなければ建たない。電気がなくても建つが（建ってから困りごとの印で知らせる）、
// 建ちにくい。需要が高く地価が高いほど建ちやすい
export function growChance({ demand, lv = 30, access, power, pol = 0 }) {
  if (!access || demand <= 0) return 0;
  return Math.min(0.9, (demand / 100) * (0.35 + lv / 160) * (1 - Math.min(0.6, pol / 150)) * (power ? 1 : 0.35));
}

// 目指す水準。水道と下水がそろわないと 1 のまま。住宅と商業は地価、工業とオフィスは教育で上がる
export function targetLevel(cls, { lv = 0, happy = 50, edu = 0, water = true, sewer = true, heightLimit = false }) {
  if (!water || !sewer) return 1;
  let L = 1;
  if (cls === 'R') { if (lv >= 36 && happy >= 48) L = 2; if (lv >= 56 && happy >= 60 && edu >= 0.35) L = 3; }
  else if (cls === 'C') { if (lv >= 34) L = 2; if (lv >= 54 && edu >= 0.25) L = 3; }
  else if (cls === 'I') { if (edu >= 0.2) L = 2; if (edu >= 0.5 && lv >= 25) L = 3; }
  else if (cls === 'O') { if (lv >= 40 && edu >= 0.5) L = 2; if (lv >= 60 && edu >= 0.8) L = 3; }
  return heightLimit ? Math.min(L, 2) : L;
}

// 1回の見回りで空き家になる確率。困りごとが続いた月数（months）で増える
export function abandonChance({ power, water, sewer, happy = 50, demand = 0, months = 0, crime = 0 }) {
  let p = 0;
  if (!power) p += 0.06;
  if (!water) p += 0.035;
  if (!sewer) p += 0.025;
  if (happy < 25) p += 0.03;
  if (crime > 70) p += 0.02;
  if (demand < -50) p += 0.015;
  return Math.min(0.5, p * Math.min(3, Math.max(0, months - 1)));
}
