// カレンダーの計算（月の表、曜日、日本の祝日、予定の整理、知らせの時刻）のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../os/js/core/calendar.mjs';

const names = (y) => Object.fromEntries([...C.holidaysOf(y)].sort());

test('日付の文字と曜日、月の日数、うるう年', () => {
  assert.equal(C.ymd(2026, 11, 7), '2026-11-07');
  assert.deepEqual(C.parseYmd('2026-11-07'), { y: 2026, m: 11, d: 7 });
  assert.equal(C.parseYmd('2026-13-01'), null);
  assert.equal(C.weekday(2026, 11, 17), 2); // 火曜
  assert.equal(C.weekday(1991, 1, 1), 2);
  assert.equal(C.daysInMonth(2024, 2), 29);
  assert.equal(C.daysInMonth(2100, 2), 28);
  assert.equal(C.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(C.addDays('2024-03-01', -1), '2024-02-29');
  assert.equal(C.addMonths(2026, 12, 1).join('-'), '2027-1');
});

test('月の表: 日曜はじまりで6週。前後の月の日もうめる', () => {
  const g = C.monthGrid(2026, 11);
  assert.equal(g.length, 6);
  assert.equal(g[0][0].date, '2026-11-01'); // 2026年11月1日は日曜
  assert.equal(g[0][0].inMonth, true);
  const g2 = C.monthGrid(2026, 9);
  assert.equal(g2[0][0].date, '2026-08-30');
  assert.equal(g2[0][0].inMonth, false);
  assert.equal(g2[0][2].date, '2026-09-01');
});

test('祝日 2026年: 振替休日と国民の休日（9月の連休）も', () => {
  assert.deepEqual(names(2026), {
    '2026-01-01': '元日', '2026-01-12': '成人の日', '2026-02-11': '建国記念の日', '2026-02-23': '天皇誕生日',
    '2026-03-20': '春分の日', '2026-04-29': '昭和の日', '2026-05-03': '憲法記念日', '2026-05-04': 'みどりの日',
    '2026-05-05': 'こどもの日', '2026-05-06': '振替休日', '2026-07-20': '海の日', '2026-08-11': '山の日',
    '2026-09-21': '敬老の日', '2026-09-22': '国民の休日', '2026-09-23': '秋分の日', '2026-10-12': 'スポーツの日',
    '2026-11-03': '文化の日', '2026-11-23': '勤労感謝の日',
  });
});

test('祝日 1991年（ARCADIA-91 の年）: 成人の日は15日、5月4日は国民の休日、日曜の祝日は翌日が振替休日', () => {
  const h = names(1991);
  assert.equal(h['1991-01-15'], '成人の日');
  assert.equal(h['1991-03-21'], '春分の日');
  assert.equal(h['1991-04-29'], 'みどりの日');
  assert.equal(h['1991-05-04'], '国民の休日');
  assert.equal(h['1991-05-06'], '振替休日'); // 5月5日が日曜
  assert.equal(h['1991-09-16'], '振替休日'); // 敬老の日（9月15日）が日曜
  assert.equal(h['1991-11-04'], '振替休日');
  assert.equal(h['1991-12-23'], '天皇誕生日');
  assert.equal(h['1991-10-10'], '体育の日');
});

test('祝日: 特別な年（2019年・2020年・2021年）と、2019年は天皇誕生日がない', () => {
  const h19 = names(2019), h20 = names(2020), h21 = names(2021);
  assert.equal(h19['2019-05-01'], '天皇の即位の日');
  assert.equal(h19['2019-04-30'], '国民の休日');
  assert.equal(h19['2019-05-02'], '国民の休日');
  assert.equal(h19['2019-10-22'], '即位礼正殿の儀');
  assert.ok(!Object.values(h19).includes('天皇誕生日'));
  assert.equal(h20['2020-07-23'], '海の日');
  assert.equal(h20['2020-07-24'], 'スポーツの日');
  assert.equal(h20['2020-08-10'], '山の日');
  assert.equal(h21['2021-08-08'], '山の日');
  assert.equal(h21['2021-08-09'], '振替休日');
  assert.equal(C.holidayName('2026-09-22'), '国民の休日');
  assert.equal(C.holidayName('2026-11-17'), null);
});

test('予定: 読めない値を捨てて整え、日ごとに時刻の順に並べる', () => {
  const ev = C.normalizeEvents({ events: [
    { id: 'a', date: '2026-11-17', time: '15:00', title: '歯医者', memo: '', notify: true },
    { id: 'b', date: '2026-11-17', time: '', title: '終日の予定' },
    { id: 'c', date: '2026-11-17', time: '09:30', title: '朝会', notify: false },
    { id: 'd', date: 'あした', title: 'こわれた予定' },
    { date: '2026-11-18', time: '25:00', title: '時刻がこわれた予定' },
  ] });
  assert.equal(ev.length, 4);
  assert.equal(ev.find((e) => e.title === '時刻がこわれた予定').time, '');
  assert.ok(ev.every((e) => typeof e.id === 'string' && e.id));
  assert.deepEqual(C.eventsOn(ev, '2026-11-17').map((e) => e.title), ['終日の予定', '朝会', '歯医者']);
  assert.deepEqual(C.normalizeEvents('こわれた'), []);
});

test('知らせ: 知らせありで時刻がある予定のうち、時刻を過ぎて60分以内で、まだ知らせていないもの', () => {
  const ev = [
    { id: 'a', date: '2026-11-17', time: '09:00', title: 'A', notify: true },
    { id: 'b', date: '2026-11-17', time: '09:05', title: 'B', notify: true },
    { id: 'c', date: '2026-11-17', time: '07:00', title: 'C（古すぎる）', notify: true },
    { id: 'd', date: '2026-11-17', time: '09:00', title: 'D（知らせなし）', notify: false },
    { id: 'e', date: '2026-11-17', time: '', title: 'E（時刻なし）', notify: true },
  ];
  const now = { date: '2026-11-17', time: '09:03' };
  assert.deepEqual(C.dueReminders(ev, now, new Set()).map((e) => e.id), ['a']);
  assert.deepEqual(C.dueReminders(ev, now, new Set([C.reminderKey(ev[0])])), []);
  assert.deepEqual(C.dueReminders(ev, { date: '2026-11-18', time: '00:30' }, new Set()), []);
  assert.deepEqual(C.dueReminders([{ id: 'x', date: '2026-11-17', time: '23:50', notify: true }], { date: '2026-11-18', time: '00:10' }, new Set()).map((e) => e.id), ['x']); // 日をまたいでも60分以内
  assert.deepEqual(C.localNow(new Date(2026, 10, 17, 9, 3, 59)), { date: '2026-11-17', time: '09:03' });
});
