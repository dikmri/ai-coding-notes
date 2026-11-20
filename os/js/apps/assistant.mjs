// AI アシスタント「イコちゃん」の窓。タブは3つ: 話す（API キーでの AI との対話）、案内（使い方ガイド）、設定（動き・MCP）。
// 道具を動かす部品は assistant/agent.mjs、対話は assistant/chat.mjs、MCP の橋渡しのブラウザの側は assistant/mcp.mjs。
import { getAgent } from '../assistant/agent.mjs';
import { getChat } from '../assistant/chat.mjs';
import * as mcp from '../assistant/mcp.mjs';

const PREF = 'fos-assistant';
const GUIDES = ['desktop'];
const loadPref = () => { try { return { speed: 'normal', visible: true, mcp: false, ...JSON.parse(localStorage.getItem(PREF) || '{}') }; } catch { return { speed: 'normal', visible: true, mcp: false }; } };
const savePref = (p) => { try { localStorage.setItem(PREF, JSON.stringify(p)); } catch { /* 保存できない */ } };

// MCP の説明（Claude が下書きし、Gemini が清書した）
const MCP_TEXT = {
  ready: '印を付けると、Claude Code などの AI の道具から頼まれた操作を、イコちゃんがこの画面で行います。ファイルを消すなどの大事な操作の前には、進めてよいかこの画面でたずねます。',
  public: 'この公開版では使えません。手元のパソコンで node tools/serve.mjs を動かし、表示された住所を開くと使えます。',
  missing: '通信の中継点が見つかりません。node tools/serve.mjs を動かし直してから、ページを開き直してください。',
  step1: 'この窓にある「MCP からの操作を受け付ける」に印を付けます。',
  step2: 'Claude Code を使うときは、次のコマンドで連携用のプログラムを登録します。',
  step2b: 'Claude Desktop や Gemini CLI を使うときは、設定ファイルの mcpServers に次の内容を書き足してから、その道具を起動し直します。',
  step3: 'AI の道具に「Future OS でメモ帳を開いて、あいさつを書いて」のように頼みます。',
};

// 話すタブの文（Claude が下書きし、Gemini が清書した）
const TALK_TEXT = {
  nokey: 'AI と話すには、「設定」の「AI」のタブで鍵を登録してください。鍵がなくても、「案内」のタブのガイドや MCP からの操作は使えます。',
  ready: 'イコちゃんにしてほしいことを書いてください。たとえば、「メモ帳を開いて、今日の予定を書いて」のように頼めます。',
  placeholder: '例: メモ帳を開いて、今日の予定を書いて',
  stopped: '止めました。',
  limited: '上限の回数になったので止めました。続けるときは、もう一度頼んでください。',
};

export async function launch(os, args = {}, rect = {}) {
  const { wm, log, esc } = os;
  const one = wm.list().find((w) => w.app === 'assistant');
  if (one) { one.focus(); return one; }
  const agent = getAgent(os), pref = loadPref();
  agent.setSpeed(pref.speed);
  const guides = [];
  for (const id of GUIDES) { try { guides.push(await (await fetch(new URL(`../assistant/guides/${id}.json`, import.meta.url))).json()); } catch (e) { log('assistant.guide', { id }, 'error: ' + e.message); } }
  const can = await mcp.available();
  const st = mcp.status();
  const root = (st.root || '（AI コーディングノートのフォルダ）').replaceAll('\\', '/'), port = st.port || 8765;
  const cmd = `claude mcp add future-os -- node "${root}/tools/mcp-bridge.mjs" --port ${port}`;
  const json = JSON.stringify({ mcpServers: { 'future-os': { command: 'node', args: [`${root}/tools/mcp-bridge.mjs`, '--port', String(port)] } } }, null, 2);
  const win = wm.open({
    app: 'assistant', icon: 'icons/assistant.svg', className: 'app-assistant', title: 'AI アシスタント', w: 500, h: 660, ...rect, args: {},
    render(w) {
      w.body.innerHTML = `<div class="as-main">
        <div class="as-hello"><canvas class="as-face" width="48" height="48" aria-hidden="true"></canvas><div><h2 class="as-name">イコちゃん</h2><p>Future OS の案内役です。画面の中を歩いて、指さしながら使い方を案内します。AI につなぐと、頼んだ操作をイコちゃんが代わりに行います。</p></div></div>
        <div class="tabs as-tabs">
          <div class="tab-list" role="tablist"><button type="button" class="tab" aria-selected="true" data-tab="talk">話す(<u>T</u>)</button><button type="button" class="tab" data-tab="guide">案内(<u>G</u>)</button><button type="button" class="tab" data-tab="set">設定(<u>O</u>)</button></div>
          <div class="tab-page as-talk">
            <div class="as-ai"><span data-ai-label></span><button type="button" class="flat as-btn" data-a="aiset">AI の設定(<u>A</u>)...</button></div>
            <ol class="as-log" role="log" aria-live="polite" data-log></ol>
            <div class="as-ask"><textarea data-ask rows="2" aria-label="イコちゃんへの頼みごと" placeholder="${esc(TALK_TEXT.placeholder)}"></textarea><button type="button" class="flat as-btn default" data-a="send">送る</button></div>
            <div class="as-foot"><span data-usage></span><button type="button" class="flat as-btn" data-a="reset">会話を新しくする(<u>N</u>)</button></div>
          </div>
          <div class="tab-page" hidden>
            <ul class="as-guides">${guides.map((g) => `<li><button type="button" class="flat as-btn" data-run="${esc(g.id)}">見る</button><div><b>${esc(g.title)}</b><span>${esc(g.summary || '')}</span></div></li>`).join('')}</ul>
          </div>
          <div class="tab-page" hidden>
            <fieldset class="as-set"><legend>イコちゃんの動き</legend>
              <label><input type="radio" name="asSpeed-${w.id}" value="normal"> 歩いて見せる(<u>W</u>)</label>
              <label><input type="radio" name="asSpeed-${w.id}" value="fast"> さっと飛ぶ(<u>F</u>)</label>
              <label><input type="radio" name="asSpeed-${w.id}" value="instant"> 動きを省く(<u>I</u>)</label>
              <label class="as-vis"><input type="checkbox" data-visible> 画面に出す(<u>V</u>)</label>
            </fieldset>
            <section class="as-sec as-mcp" data-ai-ignore><h3>AI の道具とつなぐ（MCP）</h3>
              <label><input type="checkbox" data-mcp> MCP からの操作を受け付ける(<u>M</u>)</label>
              <p class="as-mcp-state" data-mcp-state role="status"></p>
              <p class="as-note" data-mcp-note></p>
              <details class="as-how"><summary>つなぎ方</summary>
                <ol>
                  <li>${esc(MCP_TEXT.step1)}</li>
                  <li>${esc(MCP_TEXT.step2)}
                    <div class="as-cmd"><code id="asCmd-${w.id}">${esc(cmd)}</code><span class="as-copy"><button type="button" class="flat as-btn" command="--copy" commandfor="asCmd-${w.id}">コマンドを写す</button><span class="as-tip" role="status"></span></span></div>
                    ${esc(MCP_TEXT.step2b)}
                    <div class="as-cmd"><pre id="asJson-${w.id}">${esc(json)}</pre><span class="as-copy"><button type="button" class="flat as-btn" command="--copy" commandfor="asJson-${w.id}">設定を写す</button><span class="as-tip" role="status"></span></span></div>
                  </li>
                  <li>${esc(MCP_TEXT.step3)}</li>
                </ol>
              </details>
            </section>
          </div>
        </div>
        <div class="as-actions"><button type="button" class="flat as-btn as-stop" data-a="stop" disabled>止める(Esc)</button></div>
      </div>
      <div class="status-bar"><div class="status-field" role="status" data-status></div><div class="status-field" style="width:190px" data-conn></div><div class="size-grip"></div></div>`;
    },
  });
  const q = (s) => win.body.querySelector(s);
  const say = (t) => { const f = q('.status-field[data-status]'); f.textContent = t; f.title = t; };
  const showConn = (s = mcp.status()) => { const t = mcp.label(s), f = q('[data-conn]'); f.textContent = t.short; f.title = t.long; q('[data-mcp-state]').textContent = t.long; };
  q(`input[value="${pref.speed}"]`).checked = true;
  q('[data-visible]').checked = pref.visible;
  const mcpBox = q('[data-mcp]');
  mcpBox.checked = can && pref.mcp; mcpBox.disabled = !can;
  q('[data-mcp-note]').textContent = can ? MCP_TEXT.ready : mcp.localHost() ? MCP_TEXT.missing : MCP_TEXT.public;
  showConn();
  if (pref.visible) await agent.show();
  const face = agent.frameCanvas('idle_1');
  if (face) q('.as-face').getContext('2d').drawImage(face, 0, 0);
  win.body.addEventListener('change', async (e) => {
    if (e.target.name?.startsWith('asSpeed')) { pref.speed = e.target.value; agent.setSpeed(pref.speed); savePref(pref); say(`動きを「${e.target.parentElement.textContent.trim().replace(/\(.\)$/, '')}」にしました。`); }
    if (e.target.matches('[data-visible]')) {
      pref.visible = e.target.checked; savePref(pref);
      // 案内の途中で隠したら、案内も止める（イコちゃんのいない案内は続けない）
      if (!pref.visible && agent.guiding) agent.stop();
      if (pref.visible) await agent.show(); else agent.hide();
      say(pref.visible ? 'イコちゃんを画面に出しました。' : 'イコちゃんを隠しました。');
    }
    if (e.target.matches('[data-mcp]')) {
      pref.mcp = e.target.checked; savePref(pref);
      log('assistant.mcp', { on: pref.mcp }, 'ok');
      if (pref.mcp) { say('MCP からの操作を受け付けます。'); await mcp.start(os); } else { mcp.stop(); say('MCP からの操作をやめました。'); }
    }
  });
  win.body.addEventListener('click', async (e) => {
    const run = e.target.closest('[data-run]');
    if (run) {
      const g = guides.find((x) => x.id === run.dataset.run);
      say('案内中です。Esc で止められます。');
      try { const done = await agent.runGuide(g); say(done ? '案内が終わりました。' : '案内を止めました。'); }
      catch (err) { say('案内を続けられませんでした: ' + err.message); }
      return;
    }
    if (e.target.closest('[data-a="stop"]')) agent.stop();
    if (e.target.closest('[data-a="send"]')) sendAsk();
    if (e.target.closest('[data-a="reset"]')) { chat.reset(); say('会話を新しくしました。'); }
    if (e.target.closest('[data-a="aiset"]')) os.launch('settings', { tab: 'ai' });
  });

  /* ---------- 話す（API キーでの対話） ---------- */
  const chat = getChat(os), logEl = q('[data-log]'), ask = q('[data-ask]');
  let ops = null; // いまの操作のまとまり（details）
  const scroll = () => { logEl.scrollTop = logEl.scrollHeight; };
  function addMsg(kind, who, text) {
    q('.as-empty')?.remove(); ops = null;
    const li = document.createElement('li'); li.className = 'as-msg ' + kind;
    if (who) { const b = document.createElement('b'); b.textContent = who; li.append(b); }
    const p = document.createElement('p'); p.textContent = text; li.append(p); // AI の文は textContent で入れる（HTML として読まない）
    logEl.append(li); scroll();
  }
  function addOp(d) {
    q('.as-empty')?.remove();
    if (!ops) {
      const li = document.createElement('li'); li.className = 'as-ops';
      li.innerHTML = '<details><summary></summary><ul></ul></details>';
      logEl.append(li); ops = { li, n: 0, first: d.text };
    }
    ops.n++;
    const item = document.createElement('li');
    item.innerHTML = `<span class="as-mark ${d.ok ? 'ok' : 'ng'}">${d.ok ? '済' : '失敗'}</span> `;
    item.append(d.text + (d.ok || !d.error ? '' : `（${d.error}）`));
    ops.li.querySelector('ul').append(item);
    ops.li.querySelector('summary').textContent = ops.n === 1 ? `操作: ${ops.first}` : `操作 ${ops.n} 件: ${ops.first} ほか`;
    scroll();
  }
  function showEmpty() {
    if (logEl.children.length) return;
    const ready = chat.config().ready;
    const li = document.createElement('li'); li.className = 'as-empty';
    li.innerHTML = `<p></p>${ready ? '' : '<button type="button" class="flat as-btn" data-a="aiset">AI の設定を開く</button>'}`;
    li.querySelector('p').textContent = ready ? TALK_TEXT.ready : TALK_TEXT.nokey;
    logEl.append(li);
  }
  function showAi() {
    const c = chat.config();
    q('[data-ai-label]').textContent = `${c.label}・${c.model}${c.ready ? '' : '（鍵が未登録）'}`;
    const u = chat.usage;
    q('[data-usage]').textContent = `この会話: 入力 ${u.input.toLocaleString('ja-JP')}・出力 ${u.output.toLocaleString('ja-JP')} トークン`;
    if (q('.as-empty')) { q('.as-empty').remove(); showEmpty(); }
  }
  async function sendAsk() {
    const text = ask.value.trim();
    if (!text || chat.busy) return;
    ask.value = '';
    say('送りました。Esc で止められます。');
    const r = await chat.send(text);
    if (r) say(r.stopped ? '止めました。' : r.limited ? '上限の回数で止めました。' : '答えが届きました。');
    else say('送れませんでした。');
  }
  // Enter で送り、Shift+Enter で改行する。日本語の変換を確定する Enter では送らない
  ask.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); sendAsk(); }
  });
  const onChat = (e) => {
    const d = e.detail;
    if (e.type === 'user') addMsg('me', 'あなた', d.text);
    else if (e.type === 'text') addMsg('ai', 'イコちゃん', d.text);
    else if (e.type === 'op') addOp(d);
    else if (e.type === 'note') addMsg('note', '', d.text);
    else if (e.type === 'error') addMsg('err', '', d.text);
    else if (e.type === 'done') { if (d.result === 'stopped') addMsg('note', '', TALK_TEXT.stopped); if (d.result === 'limited') addMsg('note', '', TALK_TEXT.limited); showAi(); }
    else if (e.type === 'reset') { logEl.textContent = ''; ops = null; showEmpty(); showAi(); }
    else if (e.type === 'busy') q('[data-a="send"]').disabled = d.busy;
  };
  const CHAT_EVENTS = ['user', 'text', 'op', 'note', 'error', 'done', 'reset', 'busy'];
  CHAT_EVENTS.forEach((t) => chat.events.addEventListener(t, onChat));
  const onSettings = () => showAi();
  os.events.addEventListener('settings', onSettings);
  os.events.addEventListener('aikeys', onSettings);
  showEmpty(); showAi();
  q('[data-a="send"]').disabled = chat.busy;

  // 写すボタン（command="--copy" と commandfor で写す相手を指す。command の知らせは泡立たないので、捕まえる段階で受ける）
  const timers = new WeakMap();
  let lastMessage = '';
  function report(button, ok) {
    const tip = button.nextElementSibling;
    clearTimeout(timers.get(button));
    button.removeAttribute('data-copied'); button.removeAttribute('data-failed');
    let message = ok ? '写しました' : '写せませんでした';
    if (message === lastMessage) message += ' '; // 同じ文が続くと読み上げられないので、見えない空白を足す
    lastMessage = message;
    tip.textContent = '';
    button.setAttribute(ok ? 'data-copied' : 'data-failed', '');
    requestAnimationFrame(() => { tip.textContent = message; });
    timers.set(button, setTimeout(() => { button.removeAttribute('data-copied'); button.removeAttribute('data-failed'); tip.textContent = ''; }, 2000));
  }
  async function copy(button, target) {
    const text = target.innerText.trim();
    if (!text) return;
    try { await navigator.clipboard.writeText(text); report(button, true); log('assistant.copy', { what: target.id.split('-')[0] }, 'ok'); }
    catch (err) { report(button, false); log('assistant.copy', { what: target.id.split('-')[0] }, 'error: ' + err.message); }
  }
  if ('CommandEvent' in window) win.body.addEventListener('command', (e) => { if (e.command === '--copy') copy(e.source, e.target); }, true);
  else win.body.addEventListener('click', (e) => { const b = e.target.closest('button[command="--copy"]'); const t = b && document.getElementById(b.getAttribute('commandfor')); if (t) copy(b, t); });

  const onState = (e) => { q('[data-a="stop"]').disabled = !e.detail.running; };
  const onMcp = (e) => showConn(e.detail);
  agent.events.addEventListener('state', onState);
  mcp.events.addEventListener('state', onMcp);
  win.cleanup = () => {
    agent.events.removeEventListener('state', onState); mcp.events.removeEventListener('state', onMcp);
    CHAT_EVENTS.forEach((t) => chat.events.removeEventListener(t, onChat));
    os.events.removeEventListener('settings', onSettings); os.events.removeEventListener('aikeys', onSettings);
  };
  say(chat.config().ready ? '頼みごとを書いて、送るを押してください。' : 'ガイドは「案内」のタブにあります。');
  log('assistant.open', { guides: guides.length, mcp: can }, 'ok');
  return win;
}
