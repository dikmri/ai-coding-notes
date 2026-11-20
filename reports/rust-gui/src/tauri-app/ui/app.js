// タスク帳（Tauri 版）の画面。状態は JS に持ち、記録だけを Rust へ送る。
import { Store, ScrollBench, ROW_HEIGHT, group } from './core.js';

// Tauri の外（ふつうのブラウザー）で開いたときは、記録を送らずに動く
const invoke = window.__TAURI__?.core?.invoke ?? (async () => {});
const ARGS = window.__TASKBOOK_ARGS__ ?? { items: 0, benchScroll: null };

function log(event, args = '', result = '') {
  invoke('log_event', { event, args, result }).catch(() => {});
}
const ms = (t0) => `ms=${(performance.now() - t0).toFixed(2)}`;

window.addEventListener('error', (e) => log('error', e.message, `${e.filename}:${e.lineno}`));
window.addEventListener('unhandledrejection', (e) => log('error', 'unhandledrejection', String(e.reason)));

const $ = (id) => document.getElementById(id);
const list = $('list');
const spacer = $('spacer');
const store = new Store();
let query = '';
let status = 'all';
let visible = [];
let message = '準備できました';

// ---- 一覧（見えている行だけを描く。行の要素は使い回す） ----
const pool = [];

function makeRow() {
  const row = document.createElement('div');
  row.className = 'row';
  row.setAttribute('role', 'listitem');
  const check = document.createElement('input');
  check.type = 'checkbox';
  check.className = 'check';
  const text = document.createElement('span');
  text.className = 'text';
  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'del';
  del.textContent = '削除';
  row.append(check, text, del);
  spacer.append(row);
  return { row, check, text, del };
}

function renderRows() {
  const top = list.scrollTop;
  const first = Math.max(0, Math.floor(top / ROW_HEIGHT) - 2);
  const last = Math.min(visible.length, Math.ceil((top + list.clientHeight) / ROW_HEIGHT) + 2);
  const need = Math.max(0, last - first);
  while (pool.length < need) pool.push(makeRow());
  for (let k = 0; k < pool.length; k++) {
    const r = pool[k];
    if (k >= need) {
      r.row.hidden = true;
      continue;
    }
    const task = store.tasks[visible[first + k]];
    r.row.hidden = false;
    r.row.style.transform = `translateY(${(first + k) * ROW_HEIGHT}px)`;
    r.row.dataset.id = task.id;
    if (r.text.textContent !== task.text) {
      r.text.textContent = task.text;
      r.check.setAttribute('aria-label', `${task.text} を完了にする`);
      r.del.setAttribute('aria-label', `${task.text} を削除`);
    }
    r.check.checked = task.done;
    r.row.classList.toggle('done', task.done);
  }
}

function refilter(why) {
  const t0 = performance.now();
  visible = store.filter(query, status);
  const c = store.counts();
  spacer.style.height = `${visible.length * ROW_HEIGHT}px`;
  $('shown').textContent = `${group(c.total)} 件中 ${group(visible.length)} 件を表示`;
  $('counts').textContent = `未完了 ${group(c.active)} ・ 完了 ${group(c.done)}`;
  $('message').textContent = message;
  renderRows();
  log('filter', `why=${why} q=${query} status=${status}`, `hits=${visible.length} ${ms(t0)}`);
}

list.addEventListener('scroll', renderRows, { passive: true });
new ResizeObserver(renderRows).observe(list);

spacer.addEventListener('change', (e) => {
  if (!e.target.classList.contains('check')) return;
  const id = Number(e.target.closest('.row').dataset.id);
  const r = store.toggle(id);
  log('toggle', `id=${id}`, `done=${r}`);
  refilter('toggle');
});
spacer.addEventListener('click', (e) => {
  if (!e.target.classList.contains('del')) return;
  const id = Number(e.target.closest('.row').dataset.id);
  const r = store.remove(id);
  log('remove', `id=${id}`, `removed=${r}`);
  refilter('remove');
});

// ---- 上と下の操作 ----
$('add-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('new-task');
  const id = store.add(input.value);
  if (id === null) {
    log('add', 'text=', 'skipped=empty');
    return;
  }
  log('add', `text=${input.value.trim()}`, `id=${id}`);
  message = `「${input.value.trim()}」を足しました`;
  input.value = '';
  refilter('add');
});

$('query').addEventListener('input', (e) => {
  query = e.target.value;
  refilter('query');
});

for (const radio of document.querySelectorAll('input[name="status"]')) {
  radio.addEventListener('change', (e) => {
    status = e.target.value;
    refilter('status');
  });
}

$('dark').addEventListener('change', (e) => {
  document.documentElement.classList.toggle('dark', e.target.checked);
  log('theme', `dark=${e.target.checked}`, 'ok');
});

$('gen').addEventListener('click', () => {
  const t0 = performance.now();
  store.generate(10000);
  log('generate', 'n=10000', ms(t0));
  message = '1万件を作りました';
  refilter('generate');
});
$('clear-done').addEventListener('click', () => {
  const n = store.clearDone();
  log('clear_done', '', `removed=${n}`);
  message = `完了 ${group(n)} 件を消しました`;
  refilter('clear_done');
});
$('clear').addEventListener('click', () => {
  const n = store.clear();
  log('clear', '', `removed=${n}`);
  message = `${group(n)} 件を消しました`;
  refilter('clear');
});

// ---- 起動 ----
if (ARGS.items > 0) {
  const t0 = performance.now();
  store.generate(ARGS.items);
  log('generate', `n=${ARGS.items}`, ms(t0));
}
refilter('startup');

// 2 回目の rAF = 1 枚目が画面に出たあと、を「表示できた」とする
requestAnimationFrame(() =>
  requestAnimationFrame((readyAt) => {
    invoke('ready', { items: store.tasks.length }).catch(() => {});
    if (ARGS.benchScroll) runBench(new ScrollBench(ARGS.benchScroll), readyAt);
  }),
);

function runBench(bench, readyAt) {
  const frame = (now) => {
    const step = bench.tick((now - readyAt) / 1000);
    if (step.kind === 'wait') {
      requestAnimationFrame(frame);
    } else if (step.kind === 'scroll') {
      if (step.first) log('bench.scroll.start', '', 'ok');
      list.scrollTop = Math.min(step.offset, visible.length * ROW_HEIGHT);
      requestAnimationFrame(frame);
    } else if (step.kind === 'finished') {
      log(
        'bench.scroll.done',
        `secs=${step.secs.toFixed(3)}`,
        `frames=${step.frames} fps=${(step.frames / step.secs).toFixed(1)} max_gap_ms=${step.maxGapMs.toFixed(1)}`,
      );
    }
  };
  requestAnimationFrame(frame);
}
