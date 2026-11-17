// AI アシスタント「イコちゃん」の窓: イコちゃんの紹介、動きの設定（速さ・画面に出すか）、使い方ガイドの再生、
// AI の道具とつなぐ（MCP）、止める。AI との対話（API キー）は、このあとの更新でこの窓に足す。
// 道具を動かす部品は assistant/agent.mjs、MCP の橋渡しのブラウザの側は assistant/mcp.mjs。
import { getAgent } from '../assistant/agent.mjs';
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
  const root = (st.root || '（出来る！のフォルダ）').replaceAll('\\', '/'), port = st.port || 8765;
  const cmd = `claude mcp add future-os -- node "${root}/tools/mcp-bridge.mjs" --port ${port}`;
  const json = JSON.stringify({ mcpServers: { 'future-os': { command: 'node', args: [`${root}/tools/mcp-bridge.mjs`, '--port', String(port)] } } }, null, 2);
  const win = wm.open({
    app: 'assistant', icon: 'icons/assistant.svg', className: 'app-assistant', title: 'AI アシスタント', w: 480, h: 640, ...rect, args: {},
    render(w) {
      w.body.innerHTML = `<div class="as-main">
        <div class="as-hello"><canvas class="as-face" width="48" height="48" aria-hidden="true"></canvas><div><h2 class="as-name">イコちゃん</h2><p>Future OS の案内役です。画面の中を歩いて、指さしながら使い方を案内します。AI につなぐと、頼んだ操作をイコちゃんが代わりに行います。</p></div></div>
        <fieldset class="as-set"><legend>イコちゃんの動き</legend>
          <label><input type="radio" name="asSpeed-${w.id}" value="normal"> 歩いて見せる(<u>W</u>)</label>
          <label><input type="radio" name="asSpeed-${w.id}" value="fast"> さっと飛ぶ(<u>F</u>)</label>
          <label><input type="radio" name="asSpeed-${w.id}" value="instant"> 動きを省く(<u>I</u>)</label>
          <label class="as-vis"><input type="checkbox" data-visible> 画面に出す(<u>V</u>)</label>
        </fieldset>
        <section class="as-sec"><h3>使い方ガイド</h3><ul class="as-guides">${guides.map((g) => `<li><button type="button" class="flat as-btn" data-run="${esc(g.id)}">見る</button><div><b>${esc(g.title)}</b><span>${esc(g.summary || '')}</span></div></li>`).join('')}</ul></section>
        <section class="as-sec as-mcp"><h3>AI の道具とつなぐ（MCP）</h3>
          <label><input type="checkbox" data-mcp> MCP からの操作を受け付ける(<u>M</u>)</label>
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
        <div class="as-actions"><button type="button" class="flat as-btn as-stop" data-a="stop" disabled>止める(Esc)</button></div>
      </div>
      <div class="status-bar"><div class="status-field" role="status" data-status></div><div class="status-field" style="width:190px" data-conn></div><div class="size-grip"></div></div>`;
    },
  });
  const q = (s) => win.body.querySelector(s);
  const say = (t) => { const f = q('.status-field[data-status]'); f.textContent = t; f.title = t; };
  const showConn = (s = mcp.status()) => { const f = q('[data-conn]'); f.textContent = mcp.label(s); f.title = f.textContent; };
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
  });

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
  win.cleanup = () => { agent.events.removeEventListener('state', onState); mcp.events.removeEventListener('state', onMcp); };
  say('ガイドを選んで「見る」を押してください。');
  log('assistant.open', { guides: guides.length, mcp: can }, 'ok');
  return win;
}
