// タスク帳の共通部分（JS 版）。Rust の taskcore と同じ規則で、同じテストの値を使う。
// Tauri 版は画面の状態を JS に持つ（Tauri でよく使われる形）。

export const ROW_HEIGHT = 32;
export const BENCH_SPEED = 3000;
export const BENCH_DELAY = 1;

const WHAT = ['企画書', '見積もり', '議事録', '請求書', '発表資料', '週報', '契約書', '設計図'];
const DO = ['を作る', 'を見直す', 'を送る', 'を印刷する', 'を共有する', 'をまとめる'];

/** i 番目（0 始まり）の見本のタスクの本文 */
export function sampleText(i) {
  return `${String(i + 1).padStart(5, '0')} ${WHAT[i % WHAT.length]}${DO[Math.floor(i / WHAT.length) % DO.length]}`;
}

/** i 番目の見本のタスクを完了にしておくか（3 件に 1 件） */
export function sampleDone(i) {
  return i % 3 === 2;
}

/** 3 桁ごとに , を入れる */
export function group(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export const STATUS = [
  { key: 'all', label: 'すべて' },
  { key: 'active', label: '未完了' },
  { key: 'done', label: '完了' },
];

export class Store {
  tasks = [];
  nextId = 1;

  /** 見本のタスクを n 件、末尾に足す */
  generate(n) {
    for (let k = 0; k < n; k++) {
      const id = this.nextId++;
      const text = sampleText(id - 1);
      this.tasks.push({ id, text, done: sampleDone(id - 1), key: text.toLowerCase() });
    }
  }

  /** 前後の空白を除いて先頭に足す。空なら null */
  add(text) {
    const t = text.trim();
    if (!t) return null;
    const id = this.nextId++;
    this.tasks.unshift({ id, text: t, done: false, key: t.toLowerCase() });
    return id;
  }

  toggle(id) {
    const task = this.tasks.find((t) => t.id === id);
    if (!task) return null;
    task.done = !task.done;
    return task.done;
  }

  remove(id) {
    const pos = this.tasks.findIndex((t) => t.id === id);
    if (pos < 0) return false;
    this.tasks.splice(pos, 1);
    return true;
  }

  clearDone() {
    const before = this.tasks.length;
    this.tasks = this.tasks.filter((t) => !t.done);
    return before - this.tasks.length;
  }

  clear() {
    const n = this.tasks.length;
    this.tasks = [];
    this.nextId = 1;
    return n;
  }

  counts() {
    let done = 0;
    for (const t of this.tasks) if (t.done) done++;
    return { total: this.tasks.length, active: this.tasks.length - done, done };
  }

  /** 絞り込みに合うタスクの位置（tasks の添字）を並び順のまま返す */
  filter(query, status) {
    const q = query.trim().toLowerCase();
    const out = [];
    this.tasks.forEach((t, i) => {
      if (status === 'active' && t.done) return;
      if (status === 'done' && !t.done) return;
      if (q && !t.key.includes(q)) return;
      out.push(i);
    });
    return out;
  }
}

/** 一覧の自動スクロール（測定用）。Rust の taskcore::bench と同じ動き */
export class ScrollBench {
  constructor(secs) {
    this.secs = secs;
    this.frames = 0;
    this.first = null;
    this.last = null;
    this.maxGap = 0;
    this.finished = false;
  }

  /** t は表示からの経過秒。{ kind: 'wait' | 'scroll' | 'finished' | 'idle', ... } を返す */
  tick(t) {
    if (this.finished) return { kind: 'idle' };
    if (t < BENCH_DELAY) return { kind: 'wait' };
    if (this.first === null) this.first = t;
    if (this.last !== null) this.maxGap = Math.max(this.maxGap, t - this.last);
    this.last = t;
    if (t - BENCH_DELAY >= this.secs) {
      this.finished = true;
      return { kind: 'finished', frames: this.frames, secs: t - this.first, maxGapMs: this.maxGap * 1000 };
    }
    this.frames++;
    return { kind: 'scroll', offset: (t - BENCH_DELAY) * BENCH_SPEED, first: this.frames === 1 };
  }
}
