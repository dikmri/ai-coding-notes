// AI アシスタント「イコちゃん」の窓: イコちゃんの紹介、動きの設定（速さ・画面に出すか）、使い方ガイドの再生、止める。
// AI との対話（API キー）は、このあとの更新でこの窓に足す。道具を動かす部品は assistant/agent.mjs。
import { getAgent } from '../assistant/agent.mjs';

const PREF = 'fos-assistant';
const GUIDES = ['desktop'];
const loadPref = () => { try { return { speed: 'normal', visible: true, ...JSON.parse(localStorage.getItem(PREF) || '{}') }; } catch { return { speed: 'normal', visible: true }; } };
const savePref = (p) => { try { localStorage.setItem(PREF, JSON.stringify(p)); } catch { /* 保存できない */ } };

export async function launch(os, args = {}, rect = {}) {
  const { wm, log, esc } = os;
  const one = wm.list().find((w) => w.app === 'assistant');
  if (one) { one.focus(); return one; }
  const agent = getAgent(os), pref = loadPref();
  agent.setSpeed(pref.speed);
  const guides = [];
  for (const id of GUIDES) { try { guides.push(await (await fetch(new URL(`../assistant/guides/${id}.json`, import.meta.url))).json()); } catch (e) { log('assistant.guide', { id }, 'error: ' + e.message); } }
  const win = wm.open({
    app: 'assistant', icon: 'icons/assistant.svg', className: 'app-assistant', title: 'AI アシスタント', w: 480, h: 540, ...rect, args: {},
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
        <div class="as-actions"><button type="button" class="flat as-btn as-stop" data-a="stop" disabled>止める(Esc)</button></div>
      </div>
      <div class="status-bar"><div class="status-field" role="status" data-status></div><div class="status-field" style="width:160px" data-conn>AI: つないでいません</div><div class="size-grip"></div></div>`;
    },
  });
  const q = (s) => win.body.querySelector(s);
  const say = (t) => { const f = q('.status-field[data-status]'); f.textContent = t; f.title = t; };
  q(`input[value="${pref.speed}"]`).checked = true;
  q('[data-visible]').checked = pref.visible;
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
  const onState = (e) => { q('[data-a="stop"]').disabled = !e.detail.running; };
  agent.events.addEventListener('state', onState);
  win.cleanup = () => agent.events.removeEventListener('state', onState);
  say('ガイドを選んで「見る」を押してください。');
  log('assistant.open', { guides: guides.length }, 'ok');
  return win;
}
