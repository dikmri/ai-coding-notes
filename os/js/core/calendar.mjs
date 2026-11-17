// カレンダーの計算: 日付の文字（YYYY-MM-DD）、曜日、月の表、日本の祝日（1991〜2099年）、予定の整理、知らせの時刻。
// 日付と時刻は「暦と時計に書いてある値」の文字のまま持ち、時刻の一瞬（Date）には直さない（時差でずれないように）。
// 曜日や日数の計算は UTC の暦で行う。画面には触らない純粋な関数だけを置く（テストは tests/os-calendar.test.mjs）。

const pad = (n, w = 2) => String(n).padStart(w, '0');
export const ymd = (y, m, d) => `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
export function parseYmd(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s));
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
  return { y, m: mo, d };
}
const utc = (y, m, d) => new Date(Date.UTC(y, m - 1, d));
export const weekday = (y, m, d) => utc(y, m, d).getUTCDay();
export const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export function addDays(s, n) { const p = parseYmd(s), t = utc(p.y, p.m, p.d + n); return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()); }
export function addMonths(y, m, n) { const k = y * 12 + (m - 1) + n; return [Math.floor(k / 12), (k % 12) + 1]; }

// 月の表: 日曜はじまりで 6 週 × 7 日。前後の月の日もうめる
export function monthGrid(y, m) {
  let cur = addDays(ymd(y, m, 1), -weekday(y, m, 1));
  const rows = [];
  for (let r = 0; r < 6; r++) {
    const row = [];
    for (let c = 0; c < 7; c++) { const p = parseYmd(cur); row.push({ date: cur, d: p.d, inMonth: p.m === m && p.y === y, dow: c }); cur = addDays(cur, 1); }
    rows.push(row);
  }
  return rows;
}

/* ---------- 日本の祝日（国民の祝日に関する法律。1991〜2099年） ---------- */
const nthMonday = (y, m, n) => 1 + ((1 - weekday(y, m, 1) + 7) % 7) + 7 * (n - 1);
// 春分・秋分の日の近似の式（1980〜2099年に使える）
const vernal = (y) => Math.floor(20.8431 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
const autumnal = (y) => Math.floor(23.2488 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
function baseHolidays(y) {
  const h = new Map(), add = (m, d, name) => h.set(ymd(y, m, d), name);
  add(1, 1, '元日');
  add(1, y < 2000 ? 15 : nthMonday(y, 1, 2), '成人の日');
  if (y >= 1967) add(2, 11, '建国記念の日');
  if (y >= 2020) add(2, 23, '天皇誕生日');
  add(3, vernal(y), '春分の日');
  add(4, 29, y >= 2007 ? '昭和の日' : 'みどりの日');
  add(5, 3, '憲法記念日');
  if (y >= 2007) add(5, 4, 'みどりの日');
  add(5, 5, 'こどもの日');
  if (y === 2020) add(7, 23, '海の日'); else if (y === 2021) add(7, 22, '海の日'); else if (y >= 2003) add(7, nthMonday(y, 7, 3), '海の日'); else if (y >= 1996) add(7, 20, '海の日');
  if (y === 2020) add(8, 10, '山の日'); else if (y === 2021) add(8, 8, '山の日'); else if (y >= 2016) add(8, 11, '山の日');
  add(9, y < 2003 ? 15 : nthMonday(y, 9, 3), '敬老の日');
  add(9, autumnal(y), '秋分の日');
  if (y === 2020) add(7, 24, 'スポーツの日'); else if (y === 2021) add(7, 23, 'スポーツの日');
  else if (y >= 2022) add(10, nthMonday(y, 10, 2), 'スポーツの日'); else if (y >= 2000) add(10, nthMonday(y, 10, 2), '体育の日'); else add(10, 10, '体育の日');
  add(11, 3, '文化の日');
  add(11, 23, '勤労感謝の日');
  if (y >= 1989 && y <= 2018) add(12, 23, '天皇誕生日');
  // 一度だけの祝日
  if (y === 1993) add(6, 9, '皇太子徳仁親王の結婚の儀');
  if (y === 2019) { add(5, 1, '天皇の即位の日'); add(10, 22, '即位礼正殿の儀'); }
  return h;
}
const cache = new Map();
export function holidaysOf(y) {
  if (cache.has(y)) return cache.get(y);
  const base = baseHolidays(y), all = new Map(base);
  // 振替休日: 祝日が日曜なら、2007年からは次の祝日でない日、それより前は翌日（月曜）
  for (const [date] of base) {
    const p = parseYmd(date);
    if (weekday(p.y, p.m, p.d) !== 0) continue;
    let next = addDays(date, 1);
    if (y >= 2007) while (all.has(next)) next = addDays(next, 1);
    if (!all.has(next) && next.startsWith(String(y))) all.set(next, '振替休日');
  }
  // 国民の休日: 前の日と次の日が国民の祝日で、日曜でも振替休日でもない日
  for (let m = 1; m <= 12; m++) for (let d = 1; d <= daysInMonth(y, m); d++) {
    const date = ymd(y, m, d);
    if (all.has(date) || weekday(y, m, d) === 0) continue;
    if (base.has(addDays(date, -1)) && base.has(addDays(date, 1))) all.set(date, '国民の休日');
  }
  cache.set(y, all);
  return all;
}
export const holidayName = (date) => { const p = parseYmd(date); return p ? holidaysOf(p.y).get(date) ?? null : null; };

/* ---------- 予定 ---------- */
// 予定: { id, date: 'YYYY-MM-DD', time: 'HH:MM' か ''（終日）, title, memo, notify }
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
let seq = 0;
export const newId = () => 'ev' + Date.now().toString(36) + (seq++).toString(36);
export function normalizeEvents(json) {
  const list = Array.isArray(json) ? json : Array.isArray(json?.events) ? json.events : [];
  return list.filter((e) => e && parseYmd(e.date)).map((e) => ({
    id: typeof e.id === 'string' && e.id ? e.id : newId(),
    date: e.date, time: TIME.test(e.time) ? e.time : '',
    title: String(e.title ?? '').slice(0, 200), memo: String(e.memo ?? '').slice(0, 4000), notify: !!e.notify,
  }));
}
export const eventsOn = (events, date) => events.filter((e) => e.date === date).sort((a, b) => (a.time || '').localeCompare(b.time || '') || a.title.localeCompare(b.title, 'ja'));
export const reminderKey = (e) => `${e.id}@${e.date}T${e.time}`;
export const localNow = (d) => ({ date: ymd(d.getFullYear(), d.getMonth() + 1, d.getDate()), time: `${pad(d.getHours())}:${pad(d.getMinutes())}` });
// 2つの「日付と時刻」の差（分）。どちらも暦と時計の値なので、UTC の暦の上で引き算する
function minutesOf(date, time) { const p = parseYmd(date), [h, mi] = time.split(':').map(Number); return Date.UTC(p.y, p.m - 1, p.d, h, mi) / 60000; }
// 知らせる予定: 知らせありで時刻がある予定のうち、時刻を過ぎて 60 分以内で、まだ知らせていないもの
export function dueReminders(events, now, fired, windowMin = 60) {
  const t = minutesOf(now.date, now.time);
  return events.filter((e) => e.notify && e.time && !fired.has(reminderKey(e))).filter((e) => { const diff = t - minutesOf(e.date, e.time); return diff >= 0 && diff <= windowMin; });
}
export const FILE = '/ドキュメント/予定.json';
