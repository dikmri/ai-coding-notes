/* UI部品 */
dekiru.add({
  id: 'ui-dialog', c: 'ui', lv: 1,
  t: 'モーダルダイアログ', y: 'もーだるだいあろぐ',
  tags: ['dialog', 'showModal', 'モーダル', 'フォーム'],
  d: 'dialog 要素を showModal() で開くと、背面の操作を止め、Esc で閉じ、閉じたら元のボタンへ戻る。ここまでブラウザが全部やってくれる。どのボタンで閉じたかも受け取れる。',
  p: '<form method="dialog"> の中のボタンを押すと、そのボタンの value が dialog.returnValue に入って閉じる。',
  html: `
    <button id="open">削除する…</button>
    <p id="res" aria-live="polite"></p>
    <dialog id="dlg" closedby="any" aria-labelledby="ttl">
      <h2 id="ttl">本当に削除しますか？</h2>
      <p>この操作は取り消せません。</p>
      <form method="dialog"><button value="cancel" autofocus>やめる</button> <button value="delete" class="danger">削除する</button></form>
    </dialog>`,
  css: `
    body { display: grid; place-content: center; justify-items: center; background: #f1efe9; }
    dialog { border: 0; border-radius: 16px; padding: 22px 26px; box-shadow: 0 20px 60px #0004; }
    dialog::backdrop { background: #0006; backdrop-filter: blur(3px); }
    dialog h2 { margin: 0 0 6px; font-size: 20px; }
    .danger { background: #c23b22; color: #fff; border-color: #c23b22; }
    dialog[open] { animation: pop .2s ease-out; }
    @keyframes pop { from { opacity: 0; scale: .95; } }`,
  js() {
    const dlg = document.getElementById('dlg');
    document.getElementById('open').onclick = () => dlg.showModal();
    dlg.addEventListener('close', () => {
      document.getElementById('res').textContent = dlg.returnValue === 'delete' ? '削除しました' : 'やめました';
      dlg.returnValue = '';
    });
    if (!('closedBy' in HTMLDialogElement.prototype)) {
      dlg.addEventListener('click', (e) => {
        if (e.target !== dlg) return;
        const r = dlg.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dlg.close();
      });
    }
    if (window.THUMB) dlg.showModal();
  },
}, {
  id: 'ui-popover-menu', c: 'ui', lv: 2,
  t: 'ポップオーバーのメニュー', y: 'ぽっぷおーばーのめにゅー',
  tags: ['popover', 'popovertarget', 'メニュー', 'アンカー配置'],
  d: 'popover 属性を付けた要素は、popovertarget を持つボタンだけで開閉できる。外を押すか Esc で閉じる（ライトディスミス）まで JS なしで動く。アンカー配置が使えればボタンの真下に出す。',
  html: `
    <button popovertarget="menu" class="anchor">操作 ▾</button>
    <ul id="menu" popover>
      <li><button>名前を変える</button></li><li><button>複製する</button></li><li><button>共有する</button></li><li><button class="del">削除する</button></li>
    </ul>`,
  css: `
    body { display: grid; place-items: start center; padding-top: 18vh; background: #eef1f6; }
    .anchor { anchor-name: --menu; font-size: 16px; }
    #menu { margin: 0; padding: 6px; list-style: none; border: 1px solid #ccd; border-radius: 10px; box-shadow: 0 10px 30px #0002; }
    #menu button { width: 100%; text-align: left; border: 0; background: none; padding: 8px 14px; border-radius: 6px; }
    #menu button:hover, #menu button:focus-visible { background: #e8edff; }
    .del { color: #c23b22; }
    @supports (anchor-name: --a) {
      #menu { position-anchor: --menu; inset: auto; top: anchor(bottom); left: anchor(left); margin-top: 6px; position-try-fallbacks: flip-block; }
    }`,
  js() {
    document.getElementById('menu').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) { document.getElementById('menu').hidePopover(); console.log('選んだ操作: ' + b.textContent); }
    });
    if (window.THUMB) document.getElementById('menu').showPopover();
  },
}, {
  id: 'ui-tooltip', c: 'ui', lv: 1,
  t: 'ツールチップ', y: 'つーるちっぷ',
  tags: ['ツールチップ', 'aria-describedby', 'hover', 'focus'],
  d: 'ボタンにマウスを乗せたとき、またはキーボードで選んだときに小さな説明を出す。説明は aria-describedby で結んでいるので、読み上げソフトにも伝わる。',
  html: `
    <div class="row">
      <span class="tt"><button aria-describedby="t1">保存</button><span role="tooltip" id="t1">Ctrl+S でも保存できます</span></span>
      <span class="tt"><button aria-describedby="t2">共有</button><span role="tooltip" id="t2">リンクをコピーします</span></span>
      <span class="tt"><button aria-describedby="t3">?</button><span role="tooltip" id="t3">困ったらここを押す</span></span>
    </div>`,
  css: `
    body { display: grid; place-items: center; background: #f6f3ec; }
    .row { display: flex; gap: 30px; }
    .tt { position: relative; }
    [role=tooltip] { position: absolute; left: 50%; bottom: calc(100% + 10px); translate: -50% 4px; white-space: nowrap; padding: 6px 10px; border-radius: 8px; background: #222; color: #fff; font-size: 13px; opacity: 0; pointer-events: none; transition: opacity .15s, translate .15s; }
    [role=tooltip]::after { content: ""; position: absolute; left: 50%; top: 100%; margin-left: -6px; border: 6px solid transparent; border-top-color: #222; }
    .tt:hover [role=tooltip], .tt:focus-within [role=tooltip] { opacity: 1; translate: -50% 0; }`,
  js() {
    if (window.THUMB) { const tts = document.querySelectorAll('.tt button'); let i = 0; setInterval(() => tts[i++ % 3].focus(), 900); }
  },
}, {
  id: 'ui-accordion', c: 'ui', lv: 1,
  t: '開閉する質問集（アコーディオン）', y: 'かいへいするしつもんしゅうあこーでぃおん',
  tags: ['details', 'summary', 'アコーディオン', 'FAQ'],
  d: 'details と summary だけで開閉する。同じ name を付けると、1つ開けば他は閉じる排他の動きになる。開閉の高さのアニメーションは対応ブラウザでだけ付く。',
  p: '中身が閉じていてもページ内検索で見つかり、見つかると自動で開く。',
  html: `
    <div class="faq">
      <details name="q" open><summary>ライブラリは本当に使っていませんか？</summary><p>使っていません。どの見本も、ブラウザに最初から入っている機能だけで動きます。</p></details>
      <details name="q"><summary>古いブラウザでも動きますか？</summary><p>新しい機能を使う見本は、使えないときの代わりの動きも用意しています。</p></details>
      <details name="q"><summary>コードは自由に使えますか？</summary><p>見本は学ぶための小さなコードです。自分の作品に合わせて書き換えてください。</p></details>
    </div>`,
  css: `
    :root { interpolate-size: allow-keywords; }
    body { display: grid; place-items: center; background: #eef3f0; }
    .faq { width: min(520px, 92vw); display: grid; gap: 8px; }
    details { background: #fff; border-radius: 10px; padding: 0 16px; box-shadow: 0 1px 4px #0001; }
    summary { cursor: pointer; padding: 14px 0; font-weight: 700; list-style: none; display: flex; justify-content: space-between; }
    summary::after { content: "＋"; color: #2f855a; transition: rotate .2s; }
    details[open] summary::after { rotate: 45deg; }
    details p { margin: 0 0 14px; color: #444; }
    details::details-content { height: 0; overflow: hidden; transition: height .3s ease, content-visibility .3s allow-discrete; }
    details[open]::details-content { height: auto; }`,
  js() {
    if (window.THUMB) { const ds = document.querySelectorAll('details'); let i = 0; setInterval(() => { ds[++i % 3].open = true; }, 1200); }
  },
}, {
  id: 'ui-tabs', c: 'ui', lv: 2,
  t: 'キーボードで操作できるタブ', y: 'きーぼーどでそうさできるたぶ',
  tags: ['タブ', 'ARIA', 'キーボード操作', 'role=tablist'],
  d: 'タブの見た目だけでなく、role・aria-selected・aria-controls を正しく付け、左右の矢印キーと Home/End で移動できるようにする。読み上げソフトにも「3つのうち2番目のタブ」と伝わる。',
  html: `
    <div class="tabs">
      <div role="tablist" aria-label="言語">
        <button role="tab" aria-selected="true" aria-controls="p1" id="t1">HTML</button>
        <button role="tab" aria-selected="false" aria-controls="p2" id="t2" tabindex="-1">CSS</button>
        <button role="tab" aria-selected="false" aria-controls="p3" id="t3" tabindex="-1">JavaScript</button>
      </div>
      <div role="tabpanel" id="p1" aria-labelledby="t1">文書の骨組みを作る言語。見出し・段落・リンクなどの意味を表す。</div>
      <div role="tabpanel" id="p2" aria-labelledby="t2" hidden>見た目を決める言語。色・配置・動きを指定する。</div>
      <div role="tabpanel" id="p3" aria-labelledby="t3" hidden>動きを付ける言語。押したら何が起きるかを書く。</div>
    </div>`,
  css: `
    body { display: grid; place-items: center; background: #f4f1ea; }
    .tabs { width: min(520px, 92vw); }
    [role=tablist] { display: flex; gap: 4px; border-bottom: 2px solid #ddd; }
    [role=tab] { border: 0; border-radius: 8px 8px 0 0; background: none; padding: 10px 16px; font-weight: 700; color: #666; position: relative; }
    [role=tab][aria-selected=true] { color: #c23b22; }
    [role=tab][aria-selected=true]::after { content: ""; position: absolute; left: 0; right: 0; bottom: -2px; height: 3px; background: #c23b22; }
    [role=tabpanel] { background: #fff; padding: 18px; border-radius: 0 0 10px 10px; min-height: 90px; }`,
  js() {
    const tabs = [...document.querySelectorAll('[role=tab]')];
    function select(t) {
      for (const x of tabs) {
        const on = x === t;
        x.setAttribute('aria-selected', on);
        x.tabIndex = on ? 0 : -1;
        document.getElementById(x.getAttribute('aria-controls')).hidden = !on;
      }
      t.focus();
    }
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => select(t));
      t.addEventListener('keydown', (e) => {
        const k = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
        if (k === undefined) return;
        e.preventDefault();
        select(tabs[(k + tabs.length) % tabs.length]);
      });
    });
    if (window.THUMB) { let i = 0; setInterval(() => select(tabs[++i % 3]), 1100); }
  },
}, {
  id: 'ui-toast', c: 'ui', lv: 2,
  t: '積み重なる通知（トースト）', y: 'つみかさなるつうちとーすと',
  tags: ['トースト', 'popover', '通知', 'role=status'],
  d: '画面の隅に短い通知を積み重ねて出し、時間がたったら消す。通知の入れ物は popover="manual" で最前面に置き、role="status" で読み上げにも伝える。',
  html: `
    <div class="bar"><button data-k="ok">保存しました</button><button data-k="info">新着が3件あります</button><button data-k="err">通信に失敗しました</button></div>
    <ol id="stack" popover="manual" role="status"></ol>`,
  css: `
    body { display: grid; place-items: center; background: #eceff4; }
    .bar { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
    #stack { inset: auto 16px 16px auto; margin: 0; padding: 0; list-style: none; border: 0; background: none; display: flex; flex-direction: column; gap: 8px; overflow: visible; }
    #stack li { position: relative; min-width: 240px; padding: 12px 16px; border-radius: 10px; color: #fff; box-shadow: 0 8px 20px #0003; overflow: hidden; transition: opacity .3s, translate .3s; }
    @starting-style { #stack li { opacity: 0; translate: 40px 0; } }
    #stack li.out { opacity: 0; translate: 40px 0; }
    #stack li::after { content: ""; position: absolute; left: 0; bottom: 0; height: 3px; background: #fff8; animation: life 3s linear forwards; }
    @keyframes life { from { width: 100%; } to { width: 0; } }
    .ok { background: #2f855a; } .info { background: #26407c; } .err { background: #c23b22; }`,
  js() {
    const stack = document.getElementById('stack');
    stack.showPopover();
    function toast(kind, text) {
      const li = document.createElement('li');
      li.className = kind; li.textContent = text;
      stack.append(li);
      setTimeout(() => { li.classList.add('out'); setTimeout(() => li.remove(), 350); }, 3000);
    }
    document.querySelector('.bar').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) toast(b.dataset.k, b.textContent); });
    if (window.THUMB) { const bs = document.querySelectorAll('.bar button'); let i = 0; setInterval(() => bs[i++ % 3].click(), 800); }
  },
}, {
  id: 'ui-snap-carousel', c: 'ui', lv: 2,
  t: 'スクロールで止まるカルーセル', y: 'すくろーるでとまるかるーせる',
  tags: ['scroll-snap', 'カルーセル', 'IntersectionObserver', 'スワイプ'],
  d: '横に並べた札を scroll-snap で1枚ずつぴたりと止める。指でのスワイプもブラウザ任せ。今どの札が見えているかを IntersectionObserver で調べ、下の点に反映する。',
  html: `
    <div class="car">
      <div class="track" id="track"></div>
      <div class="nav"><button id="prev" aria-label="前へ">←</button><div class="dots" id="dots"></div><button id="next" aria-label="次へ">→</button></div>
    </div>`,
  css: `
    body { display: grid; place-items: center; background: #1f2430; color: #fff; }
    .car { width: min(560px, 92vw); }
    .track { display: flex; gap: 12px; overflow-x: auto; scroll-snap-type: x mandatory; scroll-behavior: smooth; scrollbar-width: none; padding: 6px 0; }
    .track::-webkit-scrollbar { display: none; }
    .slide { flex: 0 0 85%; scroll-snap-align: center; aspect-ratio: 16 / 9; border-radius: 14px; display: grid; place-items: center; font: 800 10vmin serif; background: linear-gradient(135deg, hsl(var(--h) 70% 55%), hsl(calc(var(--h) + 40) 70% 40%)); }
    .nav { display: flex; align-items: center; justify-content: space-between; margin-top: 10px; }
    .dots { display: flex; gap: 6px; }
    .dots i { width: 9px; height: 9px; border-radius: 50%; background: #fff4; transition: background .2s, scale .2s; }
    .dots i.on { background: #fff; scale: 1.3; }`,
  js() {
    const track = document.getElementById('track'), dots = document.getElementById('dots');
    const names = ['壱', '弐', '参', '肆', '伍'];
    const slides = names.map((n, i) => { const s = document.createElement('div'); s.className = 'slide'; s.textContent = n; s.style.setProperty('--h', i * 60); track.append(s); dots.append(document.createElement('i')); return s; });
    let cur = 0;
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { cur = slides.indexOf(e.target); [...dots.children].forEach((d, i) => d.classList.toggle('on', i === cur)); } }), { root: track, threshold: 0.6 });
    slides.forEach((s) => io.observe(s));
    const go = (i) => slides[(i + slides.length) % slides.length].scrollIntoView({ inline: 'center', block: 'nearest' });
    document.getElementById('prev').onclick = () => go(cur - 1);
    document.getElementById('next').onclick = () => go(cur + 1);
    if (window.THUMB) setInterval(() => go(cur + 1), 1300);
  },
}, {
  id: 'ui-switch', c: 'ui', lv: 1,
  t: 'トグルスイッチ', y: 'とぐるすいっち',
  tags: ['スイッチ', 'チェックボックス', 'role=switch', 'appearance'],
  d: '本物のチェックボックスに appearance: none を付け、見た目だけをスイッチに描き直す。キーボード操作・フォーム送信・読み上げは元のチェックボックスのまま使える。',
  html: `
    <ul>
      <li><label><input type="checkbox" role="switch" checked> 通知を受け取る</label></li>
      <li><label><input type="checkbox" role="switch"> 暗い配色</label></li>
      <li><label><input type="checkbox" role="switch" checked> 自動で保存</label></li>
      <li><label><input type="checkbox" role="switch" disabled> 使えない設定</label></li>
    </ul>`,
  css: `
    body { display: grid; place-items: center; background: #f3f4f6; }
    ul { list-style: none; padding: 20px 26px; margin: 0; background: #fff; border-radius: 14px; box-shadow: 0 2px 10px #0001; display: grid; gap: 14px; font-size: 16px; }
    label { display: flex; align-items: center; gap: 12px; cursor: pointer; }
    input { appearance: none; margin: 0; width: 46px; height: 26px; border-radius: 99px; background: #c9ccd3; position: relative; cursor: pointer; transition: background .25s; flex: none; }
    input::before { content: ""; position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px #0004; transition: translate .25s cubic-bezier(.3, 1.4, .5, 1); }
    input:checked { background: #2f855a; }
    input:checked::before { translate: 20px 0; }
    input:focus-visible { outline: 3px solid #e0532f; outline-offset: 2px; }
    input:disabled { opacity: .4; cursor: not-allowed; }`,
  js() {
    if (window.THUMB) { const ins = document.querySelectorAll('input:not(:disabled)'); let i = 0; setInterval(() => { const x = ins[i++ % 3]; x.checked = !x.checked; }, 700); }
  },
}, {
  id: 'ui-star-rating', c: 'ui', lv: 2,
  t: '星で評価する', y: 'ほしでひょうかする',
  tags: ['評価', 'ラジオボタン', ':has()', 'フォーム'],
  d: '中身は5つのラジオボタン。:has() で「自分より後ろの星が選ばれているか」を調べて塗るので、JS なしでホバーと選択の両方が表示できる。矢印キーでも選べる。',
  html: `
    <form>
      <fieldset class="stars">
        <legend>この図鑑の評価</legend>
        <input type="radio" name="r" id="s1" value="1"><label for="s1" title="1">★</label>
        <input type="radio" name="r" id="s2" value="2"><label for="s2" title="2">★</label>
        <input type="radio" name="r" id="s3" value="3"><label for="s3" title="3">★</label>
        <input type="radio" name="r" id="s4" value="4" checked><label for="s4" title="4">★</label>
        <input type="radio" name="r" id="s5" value="5"><label for="s5" title="5">★</label>
      </fieldset>
      <output id="o"></output>
    </form>`,
  css: `
    body { display: grid; place-items: center; background: #fff8ec; }
    .stars { border: 0; display: flex; flex-wrap: wrap; gap: 4px; }
    .stars legend { font-size: 14px; color: #666; margin-bottom: 6px; }
    .stars input { position: absolute; opacity: 0; }
    .stars label { font-size: 12vmin; line-height: 1; color: #ddd; cursor: pointer; transition: color .1s, scale .1s; }
    .stars input:checked + label, .stars label:has(~ input:checked) { color: #f5a623; }
    .stars:has(label:hover) label { color: #ddd; }
    .stars:has(label:hover) label:hover, .stars:has(label:hover) label:has(~ label:hover) { color: #f5a623; }
    .stars input:focus-visible + label { outline: 2px solid #e0532f; border-radius: 4px; }
    .stars label:active { scale: .9; }
    output { display: block; text-align: center; font-size: 18px; }`,
  js() {
    const show = () => { document.getElementById('o').textContent = `評価: ${document.querySelector('[name=r]:checked').value} / 5`; };
    document.querySelector('form').addEventListener('change', show);
    show();
  },
}, {
  id: 'ui-stepper', c: 'ui', lv: 1,
  t: '手続きの段階表示', y: 'てつづきのだんかいひょうじ',
  tags: ['ステップ', '進捗', 'aria-current', '申し込み'],
  d: '入力→確認→完了のような手続きで、今どの段階にいるかを丸と線で示す。終わった段階はチェック、今の段階は aria-current="step" で表す。',
  html: `
    <ol class="steps" id="steps"><li>入力</li><li>確認</li><li>支払い</li><li>完了</li></ol>
    <div class="bar"><button id="back">戻る</button><button id="next">次へ</button></div>`,
  css: `
    body { display: grid; place-content: center; gap: 26px; background: #f2f5f9; }
    .steps { list-style: none; display: flex; margin: 0; padding: 0; counter-reset: s; width: min(560px, 92vw); }
    .steps li { flex: 1; position: relative; text-align: center; font-size: 14px; color: #888; counter-increment: s; padding-top: 44px; }
    .steps li::before { content: counter(s); position: absolute; top: 0; left: 50%; translate: -50% 0; width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; background: #fff; border: 3px solid #ccd; font-weight: 700; z-index: 1; transition: .3s; }
    .steps li:not(:first-child)::after { content: ""; position: absolute; top: 16px; right: 50%; width: 100%; height: 3px; background: #ccd; transition: background .3s; }
    .steps li.done::before { content: "✓"; background: #2f855a; border-color: #2f855a; color: #fff; }
    .steps li.done::after, .steps li[aria-current]::after { background: #2f855a; }
    .steps li[aria-current]::before { border-color: #2f855a; color: #2f855a; scale: 1.15; }
    .steps li[aria-current] { color: #222; font-weight: 700; }
    .bar { display: flex; justify-content: center; gap: 10px; }`,
  js() {
    const lis = [...document.querySelectorAll('.steps li')];
    let at = 0;
    function show() { lis.forEach((li, i) => { li.classList.toggle('done', i < at); if (i === at) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current'); }); }
    document.getElementById('next').onclick = () => { at = Math.min(lis.length - 1, at + 1); show(); };
    document.getElementById('back').onclick = () => { at = Math.max(0, at - 1); show(); };
    show();
    if (window.THUMB) setInterval(() => { at = (at + 1) % lis.length; show(); }, 900);
  },
}, {
  id: 'ui-drawer', c: 'ui', lv: 2,
  t: '横から出る引き出し', y: 'よこからでるひきだし',
  tags: ['ドロワー', 'dialog', '@starting-style', 'ナビゲーション'],
  d: 'dialog をモーダルとして開き、画面の左端に貼り付けて横から滑り込ませる。閉じるときも滑って消える。背景を押すか Esc で閉じる。',
  html: `
    <button id="open">☰ メニュー</button>
    <dialog id="dr" class="drawer" closedby="any" aria-label="メニュー">
      <nav><a href="#">図鑑</a><a href="#">パイプ工房</a><a href="#">索引</a><a href="#">設定</a></nav>
      <button id="close">閉じる</button>
    </dialog>`,
  css: `
    body { padding: 20px; background: #f3efe6; }
    .drawer { margin: 0; inset: 0 auto 0 0; height: 100dvh; max-height: none; width: min(300px, 80vw); border: 0; padding: 20px; background: #1f2a44; color: #fff;
      translate: -100% 0; transition: translate .35s cubic-bezier(.3, .8, .3, 1), display .35s allow-discrete, overlay .35s allow-discrete; }
    .drawer[open] { translate: 0 0; display: flex; flex-direction: column; justify-content: space-between; }
    @starting-style { .drawer[open] { translate: -100% 0; } }
    .drawer::backdrop { background: #0000; transition: background .35s, display .35s allow-discrete, overlay .35s allow-discrete; }
    .drawer[open]::backdrop { background: #0007; }
    @starting-style { .drawer[open]::backdrop { background: #0000; } }
    nav { display: grid; gap: 4px; }
    nav a { color: #fff; text-decoration: none; padding: 10px 12px; border-radius: 8px; font-weight: 700; }
    nav a:hover { background: #ffffff1a; }`,
  js() {
    const d = document.getElementById('dr');
    document.getElementById('open').onclick = () => d.showModal();
    document.getElementById('close').onclick = () => d.close();
    if (!('closedBy' in HTMLDialogElement.prototype)) d.addEventListener('click', (e) => { if (e.target === d && e.clientX > d.getBoundingClientRect().right) d.close(); });
    if (window.THUMB) setInterval(() => (d.open ? d.close() : d.showModal()), 1400);
  },
}, {
  id: 'ui-context-menu', c: 'ui', lv: 2,
  t: '右クリックメニュー', y: 'みぎくりっくめにゅー',
  tags: ['contextmenu', 'popover', '右クリック', 'メニュー'],
  d: 'contextmenu イベントでブラウザ標準のメニューを止め、押した位置に自作のメニューを出す。メニューは popover なので、外を押すか Esc で閉じる。',
  html: `<div class="area" id="area">ここを右クリック（長押し）</div><ul id="cm" popover><li><button>切り取り</button></li><li><button>コピー</button></li><li><button>貼り付け</button></li><li class="sep"></li><li><button>色を変える</button></li></ul><p id="log"></p>`,
  css: `
    body { display: grid; place-content: center; gap: 10px; background: #f5f2ff; }
    .area { width: min(480px, 90vw); height: 220px; border: 2px dashed #7a5cff; border-radius: 14px; display: grid; place-items: center; color: #7a5cff; font-weight: 700; transition: background .3s; }
    #cm { position: fixed; inset: auto; margin: 0; padding: 6px; list-style: none; border: 1px solid #ccd; border-radius: 10px; box-shadow: 0 10px 30px #0002; min-width: 160px; }
    #cm button { width: 100%; text-align: left; border: 0; background: none; padding: 7px 12px; border-radius: 6px; }
    #cm button:hover { background: #ece8ff; }
    .sep { height: 1px; background: #ddd; margin: 4px 0; }
    #log { margin: 0; font-size: 13px; color: #555; min-height: 1.4em; }`,
  js() {
    const area = document.getElementById('area'), cm = document.getElementById('cm');
    function open(x, y) { cm.style.left = Math.min(x, innerWidth - 180) + 'px'; cm.style.top = Math.min(y, innerHeight - 180) + 'px'; cm.showPopover(); cm.querySelector('button').focus(); }
    area.addEventListener('contextmenu', (e) => { e.preventDefault(); open(e.clientX, e.clientY); });
    cm.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      document.getElementById('log').textContent = `「${b.textContent}」を選びました`;
      if (b.textContent === '色を変える') area.style.background = `hsl(${Math.random() * 360} 80% 92%)`;
      cm.hidePopover();
    });
    if (window.THUMB) open(innerWidth / 2 - 40, innerHeight / 2 - 60);
  },
}, {
  id: 'ui-sortable-list', c: 'ui', lv: 2,
  t: 'つかんで並べ替える一覧', y: 'つかんでならべかえるいちらん',
  tags: ['ドラッグ&ドロップ', '並べ替え', 'キーボード操作', 'Pointer Events'],
  d: '項目をつかんで上下に動かすと、ほかの項目がよけて並べ替わる。マウスでも指でも動き、キーボードでは Alt＋上下の矢印で順番を入れ替えられる。',
  html: `<ol class="list" id="list"></ol><p class="hint">つかんで動かす。または項目を選んで Alt＋↑↓</p>`,
  css: `
    body { display: grid; place-content: center; gap: 8px; background: #edf2ef; touch-action: none; }
    .list { list-style: none; padding: 0; margin: 0; width: min(380px, 90vw); display: grid; gap: 6px; }
    .list li { display: flex; align-items: center; gap: 10px; padding: 12px 14px; background: #fff; border-radius: 10px; box-shadow: 0 1px 3px #0002; cursor: grab; user-select: none; }
    .list li::before { content: "⋮⋮"; color: #aaa; letter-spacing: -2px; }
    .list li.drag { opacity: .4; }
    .list li:focus-visible { outline: 3px solid #2f855a; }
    .hint { font-size: 12px; color: #666; margin: 0; }`,
  js() {
    const list = document.getElementById('list');
    ['朝ごはん', '散歩', '図鑑を読む', 'コードを書く', '昼寝'].forEach((t) => { const li = document.createElement('li'); li.textContent = t; li.tabIndex = 0; list.append(li); });
    let drag = null;
    list.addEventListener('pointerdown', (e) => { const li = e.target.closest('li'); if (!li) return; drag = li; li.classList.add('drag'); li.setPointerCapture(e.pointerId); });
    list.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const over = [...list.children].find((li) => { const r = li.getBoundingClientRect(); return li !== drag && e.clientY > r.top && e.clientY < r.bottom; });
      if (!over) return;
      const r = over.getBoundingClientRect();
      list.insertBefore(drag, e.clientY < r.top + r.height / 2 ? over : over.nextSibling);
    });
    list.addEventListener('pointerup', () => { if (drag) { drag.classList.remove('drag'); console.log('並び: ' + [...list.children].map((l) => l.textContent).join(' → ')); drag = null; } });
    list.addEventListener('keydown', (e) => {
      const li = e.target.closest('li');
      if (!li || !e.altKey) return;
      if (e.key === 'ArrowUp' && li.previousElementSibling) { list.insertBefore(li, li.previousElementSibling); li.focus(); e.preventDefault(); }
      if (e.key === 'ArrowDown' && li.nextElementSibling) { list.insertBefore(li.nextElementSibling, li); li.focus(); e.preventDefault(); }
    });
    if (window.THUMB) setInterval(() => list.append(list.firstElementChild), 900);
  },
}, {
  id: 'ui-kanban', c: 'ui', lv: 2,
  t: 'カンバン（ドラッグ＆ドロップ）', y: 'かんばんどらっぐあんどどろっぷ',
  tags: ['ドラッグ&ドロップ', 'draggable', 'タスク管理', 'カンバン'],
  d: 'HTML の draggable 属性と dragstart・dragover・drop イベントで、札を列から列へ移す。札の数は列ごとに自動で数え直す。',
  html: `
    <div class="board">
      <section data-col="todo"><h2>やること <span></span></h2><ul><li draggable="true">図鑑を読む</li><li draggable="true">パイプを試す</li></ul></section>
      <section data-col="doing"><h2>やっている <span></span></h2><ul><li draggable="true">コードを書き換える</li></ul></section>
      <section data-col="done"><h2>終わった <span></span></h2><ul><li draggable="true">ブラウザを開く</li></ul></section>
    </div>`,
  css: `
    body { padding: 12px; background: #e6ebf2; }
    .board { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
    section { background: #f7f9fc; border-radius: 12px; padding: 10px; min-height: 200px; transition: background .15s; }
    section.over { background: #dbe8ff; }
    h2 { margin: 0 0 8px; font-size: 14px; } h2 span { color: #888; font-weight: 400; }
    ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; min-height: 120px; }
    li { background: #fff; border-radius: 8px; padding: 10px; box-shadow: 0 1px 3px #0002; cursor: grab; font-size: 14px; }
    li.dragging { opacity: .4; }
    [data-col=done] li { text-decoration: line-through; color: #888; }`,
  js() {
    let dragged = null;
    const count = () => document.querySelectorAll('section').forEach((s) => { s.querySelector('h2 span').textContent = `(${s.querySelectorAll('li').length})`; });
    document.addEventListener('dragstart', (e) => { dragged = e.target; e.target.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
    document.addEventListener('dragend', (e) => { e.target.classList.remove('dragging'); });
    for (const s of document.querySelectorAll('section')) {
      s.addEventListener('dragover', (e) => { e.preventDefault(); s.classList.add('over'); });
      s.addEventListener('dragleave', () => s.classList.remove('over'));
      s.addEventListener('drop', (e) => { e.preventDefault(); s.classList.remove('over'); if (dragged) { s.querySelector('ul').append(dragged); count(); console.log(`「${dragged.textContent}」を ${s.dataset.col} へ`); } });
    }
    count();
    if (window.THUMB) { const cols = document.querySelectorAll('section ul'); let i = 0; setInterval(() => { const li = document.querySelector('li'); cols[++i % 3].append(li); count(); }, 900); }
  },
}, {
  id: 'ui-infinite-scroll', c: 'ui', lv: 2,
  t: 'どこまでも続く一覧', y: 'どこまでもつづくいちらん',
  tags: ['無限スクロール', 'IntersectionObserver', '遅延読み込み', 'フィード'],
  d: '一覧の最後に見えない目印を置き、目印が画面に入ったら次の20件を足す。スクロールの位置を自分で計算しなくても、IntersectionObserver が知らせてくれる。',
  html: `<ul id="feed"></ul><p id="sentinel">読み込み中…</p>`,
  css: `body { background: #f4f1ea; padding: 10px; } ul { list-style: none; padding: 0; margin: 0 auto; max-width: 480px; display: grid; gap: 8px; } li { background: #fff; padding: 12px 14px; border-radius: 10px; box-shadow: 0 1px 3px #0001; display: flex; gap: 10px; align-items: center; } li b { width: 36px; height: 36px; border-radius: 50%; background: hsl(var(--h) 60% 60%); flex: none; } #sentinel { text-align: center; color: #888; }`,
  js() {
    const feed = document.getElementById('feed');
    let n = 0;
    function more() {
      for (let i = 0; i < 20; i++) {
        n++;
        const li = document.createElement('li');
        li.innerHTML = `<b style="--h:${(n * 37) % 360}"></b><span>${n} 件目の投稿。下へ進むと、まだまだ出てきます。</span>`;
        feed.append(li);
      }
      console.log(`${n} 件まで読み込みました`);
    }
    new IntersectionObserver((es) => { if (es[0].isIntersecting) setTimeout(more, 300); }, { rootMargin: '200px' }).observe(document.getElementById('sentinel'));
    more();
    if (window.THUMB) setInterval(() => scrollBy(0, 4), 16);
  },
}, {
  id: 'ui-virtual-list', c: 'ui', lv: 3,
  t: '10万行の仮想リスト', y: 'じゅうまんぎょうのかそうりすと',
  tags: ['仮想スクロール', '大量データ', 'パフォーマンス', 'スクロール'],
  d: '10万行ぶんの高さの空箱を作り、そのうち画面に見えている数十行だけを実際に描く。スクロールのたびに描く行を入れ替えるので、何行あっても軽い。',
  p: '描いている行は常に30行ほど。DOM の要素数を増やさないことが速さの秘訣。',
  html: `<div class="vp" id="vp"><div class="spacer" id="sp"></div><ol class="rows" id="rows"></ol></div><p id="info"></p>`,
  css: `body { display: grid; place-content: center; gap: 6px; background: #eef0f3; } .vp { position: relative; width: min(480px, 92vw); height: 70vh; overflow-y: auto; background: #fff; border-radius: 10px; box-shadow: 0 1px 6px #0002; } .rows { position: absolute; left: 0; right: 0; top: 0; margin: 0; padding: 0; list-style: none; } .rows li { height: 32px; padding: 0 12px; display: flex; align-items: center; gap: 10px; border-bottom: 1px solid #f0f0f0; font: 13px ui-monospace, monospace; } .rows li:nth-child(odd) { background: #fafafa; } .rows i { width: 10px; height: 10px; border-radius: 2px; } p { margin: 0; font-size: 12px; color: #555; }`,
  js() {
    const N = 100000, H = 32, vp = document.getElementById('vp'), rows = document.getElementById('rows');
    document.getElementById('sp').style.height = N * H + 'px';
    function render() {
      const first = Math.floor(vp.scrollTop / H), count = Math.ceil(vp.clientHeight / H) + 2;
      rows.style.transform = `translateY(${first * H}px)`;
      let html = '';
      for (let i = first; i < Math.min(N, first + count); i++) html += `<li><i style="background:hsl(${(i * 7) % 360} 70% 55%)"></i>${String(i + 1).padStart(6, '0')} 行目 ・ 値 ${((i * 2654435761) % 1000).toString().padStart(3, ' ')}</li>`;
      rows.innerHTML = html;
      document.getElementById('info').textContent = `全 ${N.toLocaleString()} 行のうち、描いているのは ${rows.children.length} 行だけ`;
    }
    vp.addEventListener('scroll', render, { passive: true });
    render();
    if (window.THUMB) setInterval(() => { vp.scrollTop += 900; }, 30);
  },
}, {
  id: 'ui-sortable-table', c: 'ui', lv: 2,
  t: '並べ替えと絞り込みの表', y: 'ならべかえとしぼりこみのひょう',
  tags: ['表', 'aria-sort', '絞り込み', 'Intl.Collator'],
  d: '見出しを押すとその列で並べ替え、もう一度押すと逆順にする。上の欄に打つと一致する行だけ残す。日本語の並べ替えは Intl.Collator に任せる。',
  html: `<input id="q" type="search" placeholder="絞り込む（例: 果物）" aria-label="絞り込み"><table><thead><tr><th><button data-k="0">名前</button></th><th><button data-k="1">種類</button></th><th><button data-k="2">値段</button></th><th><button data-k="3">在庫</button></th></tr></thead><tbody id="tb"></tbody></table>`,
  css: `body { padding: 12px; background: #f6f4ef; } input { width: 100%; max-width: 320px; margin-bottom: 8px; } table { border-collapse: collapse; width: 100%; background: #fff; border-radius: 10px; overflow: hidden; font-size: 14px; } th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid #eee; } th button { border: 0; background: none; font-weight: 700; padding: 0; } th[aria-sort] button::after { content: " ▲"; color: #c23b22; } th[aria-sort=descending] button::after { content: " ▼"; } td:nth-child(n+3) { text-align: right; font-variant-numeric: tabular-nums; }`,
  js() {
    const data = [['りんご', '果物', 150, 32], ['だいこん', '野菜', 180, 12], ['みかん', '果物', 80, 120], ['キャベツ', '野菜', 210, 8], ['いちご', '果物', 480, 15], ['にんじん', '野菜', 60, 54], ['ぶどう', '果物', 520, 6], ['トマト', '野菜', 98, 41], ['すいか', '果物', 1200, 3], ['ねぎ', '野菜', 130, 25]];
    const col = new Intl.Collator('ja'), tb = document.getElementById('tb');
    let key = -1, dir = 1;
    function render() {
      const q = document.getElementById('q').value.trim();
      const rows = data.filter((r) => !q || r.join(' ').includes(q));
      if (key >= 0) rows.sort((a, b) => dir * (typeof a[key] === 'number' ? a[key] - b[key] : col.compare(a[key], b[key])));
      tb.innerHTML = rows.map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2].toLocaleString()}円</td><td>${r[3]}</td></tr>`).join('');
      document.querySelectorAll('th').forEach((th, i) => { if (i === key) th.setAttribute('aria-sort', dir > 0 ? 'ascending' : 'descending'); else th.removeAttribute('aria-sort'); });
    }
    document.querySelector('thead').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; const k = +b.dataset.k; dir = k === key ? -dir : 1; key = k; render(); });
    document.getElementById('q').addEventListener('input', render);
    render();
    if (window.THUMB) { let k = 0; setInterval(() => { document.querySelectorAll('th button')[k++ % 4].click(); }, 900); }
  },
}, {
  id: 'ui-command-palette', c: 'ui', lv: 3,
  t: 'コマンドパレット', y: 'こまんどぱれっと',
  tags: ['Ctrl+K', 'dialog', 'あいまい検索', 'キーボード操作'],
  d: 'Ctrl+K（Mac は ⌘K）で命令の一覧を開き、文字を打つと飛び飛びの一致でも候補を絞る。上下キーで選んで Enter で実行。日本語入力の変換中の Enter では実行しない。',
  p: 'keydown の isComposing を見ると、IME で変換を確定する Enter と、実行の Enter を区別できる。',
  html: `
    <p>Ctrl+K で開く <button id="open">開く</button></p>
    <p id="log"></p>
    <dialog id="pal" closedby="any" aria-label="コマンドパレット">
      <input id="q" placeholder="命令を探す…" role="combobox" aria-expanded="true" aria-controls="list" aria-autocomplete="list" autocomplete="off">
      <ul id="list" role="listbox"></ul>
    </dialog>`,
  css: `
    body { padding: 20px; background: #f1f3f7; }
    #pal { margin-top: 12vh; width: min(520px, 92vw); padding: 0; border: 0; border-radius: 14px; box-shadow: 0 20px 60px #0004; }
    #q { width: 100%; border: 0; border-bottom: 1px solid #eee; padding: 14px 16px; font-size: 16px; outline: none; border-radius: 0; }
    ul { list-style: none; margin: 0; padding: 6px; max-height: 50vh; overflow: auto; }
    li { padding: 9px 12px; border-radius: 8px; cursor: pointer; display: flex; justify-content: space-between; }
    li[aria-selected=true] { background: #26407c; color: #fff; }
    li small { opacity: .6; }
    mark { background: none; color: #e0532f; font-weight: 800; }
    li[aria-selected=true] mark { color: #ffd166; }`,
  js() {
    const cmds = [['新しく作る', 'Ctrl+N'], ['開く', 'Ctrl+O'], ['保存する', 'Ctrl+S'], ['名前を付けて保存', ''], ['印刷する', 'Ctrl+P'], ['暗い配色に切り替え', ''], ['文字を大きく', 'Ctrl+＋'], ['文字を小さく', 'Ctrl+－'], ['全画面にする', 'F11'], ['設定を開く', ''], ['ヘルプを見る', 'F1'], ['終了する', '']];
    const pal = document.getElementById('pal'), q = document.getElementById('q'), list = document.getElementById('list');
    let hits = [], sel = 0;
    function match(text, query) {
      if (!query) return [];
      const idx = []; let j = 0;
      for (let i = 0; i < text.length && j < query.length; i++) if (text[i].toLowerCase() === query[j].toLowerCase()) { idx.push(i); j++; }
      return j === query.length ? idx : null;
    }
    function render() {
      hits = cmds.map(([n, k]) => ({ n, k, m: match(n, q.value.trim()) })).filter((h) => h.m);
      sel = Math.min(sel, Math.max(0, hits.length - 1));
      list.innerHTML = hits.map((h, i) => `<li role="option" aria-selected="${i === sel}" data-i="${i}">${[...h.n].map((ch, k) => (h.m.includes(k) ? `<mark>${ch}</mark>` : ch)).join('')}<small>${h.k}</small></li>`).join('') || '<li>見つかりません</li>';
    }
    function run(i) { const h = hits[i]; if (!h) return; pal.close(); document.getElementById('log').textContent = `「${h.n}」を実行しました`; }
    const open = () => { q.value = ''; sel = 0; render(); pal.showModal(); };
    document.getElementById('open').onclick = open;
    addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); open(); } });
    q.addEventListener('input', () => { sel = 0; render(); });
    q.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = (sel + 1) % Math.max(1, hits.length); render(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = (sel - 1 + hits.length) % Math.max(1, hits.length); render(); }
      else if (e.key === 'Enter') { e.preventDefault(); if (e.isComposing || e.keyCode === 229) return; run(sel); }
    });
    list.addEventListener('click', (e) => { const li = e.target.closest('[data-i]'); if (li) run(+li.dataset.i); });
    if (window.THUMB) { open(); const word = 'ほぞん'; let i = 0; setInterval(() => { q.value = word.slice(0, (i++ % 5)); render(); }, 500); }
  },
}, {
  id: 'ui-skeleton', c: 'ui', lv: 1,
  t: '読み込み中の骨組み表示', y: 'よみこみちゅうのほねぐみひょうじ',
  tags: ['スケルトン', 'ローディング', 'aria-busy', 'グラデーション'],
  d: '中身が届くまで、文字や画像の位置に灰色の板を置き、光の帯を流して待っていることを伝える。届いたら本物に入れ替える。読み込み中は aria-busy で知らせる。',
  html: `<article id="card" aria-busy="true"><div class="av sk"></div><div class="lines"><div class="sk l1"></div><div class="sk l2"></div><div class="sk l3"></div></div></article><button id="re">もう一度読み込む</button>`,
  css: `
    body { display: grid; place-content: center; justify-items: center; gap: 12px; background: #f0f2f5; }
    article { width: min(420px, 90vw); display: flex; gap: 14px; padding: 16px; background: #fff; border-radius: 14px; box-shadow: 0 1px 6px #0001; }
    .av { width: 56px; height: 56px; border-radius: 50%; flex: none; }
    .lines { flex: 1; display: grid; gap: 8px; align-content: center; }
    .sk { background: linear-gradient(90deg, #e6e8eb 25%, #f4f5f7 50%, #e6e8eb 75%) 0 0 / 300% 100%; border-radius: 6px; animation: shine 1.3s linear infinite; }
    .l1 { height: 14px; width: 50%; } .l2 { height: 12px; } .l3 { height: 12px; width: 80%; }
    @keyframes shine { from { background-position: 100% 0; } to { background-position: 0 0; } }
    .real .name { font-weight: 700; } .real p { margin: 4px 0 0; color: #555; font-size: 14px; }
    .real .av { background: linear-gradient(135deg, #f093fb, #f5576c); }`,
  js() {
    const card = document.getElementById('card'), skeleton = card.innerHTML;
    function load() {
      card.innerHTML = skeleton; card.className = ''; card.setAttribute('aria-busy', 'true');
      setTimeout(() => { card.className = 'real'; card.innerHTML = '<div class="av"></div><div><div class="name">出来る 太郎</div><p>素の HTML と CSS で、読み込み中の表示まで作れました。</p></div>'; card.setAttribute('aria-busy', 'false'); }, 1800);
    }
    document.getElementById('re').onclick = load;
    load();
    if (window.THUMB) setInterval(load, 3000);
  },
}, {
  id: 'ui-split-pane', c: 'ui', lv: 2,
  t: '境目を動かせる2分割画面', y: 'さかいめをうごかせるにぶんかつがめん',
  tags: ['分割', 'role=separator', 'ドラッグ', 'キーボード操作'],
  d: '左右の区画の境目をつかんで幅を変える。境目は role="separator" と aria-valuenow を持ち、キーボードの左右キーでも動かせる。',
  html: `<div class="split" id="s"><section>左の区画</section><div class="bar" id="bar" role="separator" aria-orientation="vertical" aria-label="区画の幅" aria-valuemin="15" aria-valuemax="85" aria-valuenow="40" tabindex="0"></div><section>右の区画</section></div>`,
  css: `
    body { background: #eceae4; touch-action: none; }
    .split { --w: 40%; display: grid; grid-template-columns: var(--w) 10px 1fr; height: 100%; }
    section { display: grid; place-items: center; font-weight: 700; color: #555; }
    section:first-child { background: #fff6e8; } section:last-child { background: #e8f2ff; }
    .bar { background: #c9c4b8; cursor: col-resize; position: relative; }
    .bar::after { content: ""; position: absolute; left: 3px; right: 3px; top: 50%; height: 40px; margin-top: -20px; border-radius: 3px; background: repeating-linear-gradient(#fff 0 2px, transparent 2px 6px); }
    .bar:hover, .bar:focus-visible { background: #e0532f; outline: none; }`,
  js() {
    const s = document.getElementById('s'), bar = document.getElementById('bar');
    const set = (p) => { p = Math.max(15, Math.min(85, p)); s.style.setProperty('--w', p + '%'); bar.setAttribute('aria-valuenow', Math.round(p)); };
    bar.addEventListener('pointerdown', (e) => bar.setPointerCapture(e.pointerId));
    bar.addEventListener('pointermove', (e) => { if (bar.hasPointerCapture(e.pointerId)) set((e.clientX / innerWidth) * 100); });
    bar.addEventListener('keydown', (e) => { const v = +bar.getAttribute('aria-valuenow'); if (e.key === 'ArrowLeft') set(v - 5); if (e.key === 'ArrowRight') set(v + 5); });
    if (window.THUMB) { let t = 0; setInterval(() => { t += 0.05; set(50 + Math.sin(t) * 25); }, 30); }
  },
}, {
  id: 'ui-calendar', c: 'ui', lv: 2,
  t: '月めくりカレンダー', y: 'つきめくりかれんだー',
  tags: ['カレンダー', 'Date', '曜日', 'グリッド'],
  d: '月の1日の曜日と、その月の日数から日付の升目を組み立てる。今日に印を付け、土日を色分けし、前後の月へめくれる。日付の計算は Date だけで足りる。',
  p: 'new Date(年, 月 + 1, 0) で「その月の最後の日」が求まる。0日目は前の月の末日になる性質を使う。',
  html: `<div class="cal"><header><button id="pv" aria-label="前の月">‹</button><h2 id="ttl"></h2><button id="nx" aria-label="次の月">›</button></header><div class="grid" id="g"></div></div>`,
  css: `
    body { display: grid; place-items: center; background: #f3efe7; }
    .cal { width: min(380px, 92vw); background: #fff; border-radius: 14px; padding: 14px; box-shadow: 0 2px 10px #0001; }
    header { display: flex; align-items: center; justify-content: space-between; } h2 { margin: 0; font-size: 18px; }
    .grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; margin-top: 10px; text-align: center; }
    .grid b { font-size: 12px; color: #888; } .grid b:first-child { color: #c23b22; } .grid b:nth-child(7) { color: #26407c; }
    .grid span { aspect-ratio: 1; display: grid; place-items: center; border-radius: 50%; font-size: 14px; }
    .grid .sun { color: #c23b22; } .grid .sat { color: #26407c; }
    .grid .today { background: #e0532f; color: #fff; font-weight: 800; }`,
  js() {
    const now = new Date();
    let y = now.getFullYear(), m = now.getMonth();
    function render() {
      document.getElementById('ttl').textContent = new Intl.DateTimeFormat('ja-JP-u-ca-japanese', { era: 'long', year: 'numeric', month: 'long' }).format(new Date(y, m, 1)) + `（${y}年）`;
      const first = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate();
      let html = '日月火水木金土'.split('').map((d) => `<b>${d}</b>`).join('') + '<span></span>'.repeat(first);
      for (let d = 1; d <= days; d++) {
        const w = (first + d - 1) % 7, today = y === now.getFullYear() && m === now.getMonth() && d === now.getDate();
        html += `<span class="${w === 0 ? 'sun' : w === 6 ? 'sat' : ''}${today ? ' today' : ''}">${d}</span>`;
      }
      document.getElementById('g').innerHTML = html;
    }
    document.getElementById('pv').onclick = () => { m--; if (m < 0) { m = 11; y--; } render(); };
    document.getElementById('nx').onclick = () => { m++; if (m > 11) { m = 0; y++; } render(); };
    render();
  },
}, {
  id: 'ui-chat', c: 'ui', lv: 2,
  t: 'チャット画面', y: 'ちゃっとがめん',
  tags: ['チャット', 'IME', 'Enterで送信', '自動スクロール'],
  d: '吹き出しを左右に並べ、新しい発言が来たら一番下までスクロールする。Enter で送信、Shift+Enter で改行。日本語の変換を確定する Enter では送信しない。',
  html: `<div class="chat"><ol id="log"></ol><form id="f"><textarea id="t" rows="1" placeholder="メッセージ（Enterで送信）" aria-label="メッセージ"></textarea><button>送信</button></form></div>`,
  css: `
    body { display: grid; place-items: center; background: #dfe7ef; }
    .chat { width: min(420px, 94vw); height: 92vh; display: flex; flex-direction: column; background: #f7f9fb; border-radius: 16px; overflow: hidden; box-shadow: 0 2px 12px #0002; }
    ol { flex: 1; overflow-y: auto; list-style: none; margin: 0; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
    li { max-width: 75%; padding: 8px 12px; border-radius: 14px; background: #fff; box-shadow: 0 1px 2px #0001; white-space: pre-wrap; animation: in .2s ease-out; }
    li.me { align-self: flex-end; background: #26407c; color: #fff; border-bottom-right-radius: 4px; }
    li.bot { border-bottom-left-radius: 4px; }
    @keyframes in { from { opacity: 0; translate: 0 6px; } }
    form { display: flex; gap: 6px; padding: 8px; background: #fff; border-top: 1px solid #e5e5e5; }
    textarea { flex: 1; resize: none; field-sizing: content; max-height: 120px; }`,
  js() {
    const log = document.getElementById('log'), t = document.getElementById('t'), f = document.getElementById('f');
    const say = (text, who) => { const li = document.createElement('li'); li.className = who; li.textContent = text; log.append(li); log.scrollTop = log.scrollHeight; };
    const replies = ['なるほど！', 'それは出来ますよ。', 'ライブラリなしでも大丈夫です。', 'もう少し詳しく教えてください。'];
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = t.value.trim(); if (!v) return;
      say(v, 'me'); t.value = '';
      setTimeout(() => say(`「${v.slice(0, 20)}」ですね。${replies[Math.floor(Math.random() * replies.length)]}`, 'bot'), 600);
    });
    t.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (e.isComposing || e.keyCode === 229) return; f.requestSubmit(); }
    });
    say('こんにちは。何でも話しかけてください。', 'bot');
    if (window.THUMB) { const qs = ['こんにちは', 'ライブラリは要る？', 'すごい']; let i = 0; setInterval(() => { t.value = qs[i++ % 3]; f.requestSubmit(); }, 1500); }
  },
}, {
  id: 'ui-tag-input', c: 'ui', lv: 2,
  t: 'タグを入れる欄', y: 'たぐをいれるらん',
  tags: ['タグ', 'チップ', '入力欄', 'IME'],
  d: '文字を打って Enter か読点で確定すると、小さな札（チップ）になって並ぶ。× で消し、空欄で Backspace を押すと最後の札が消える。同じタグは重ねて入れない。',
  html: `<div class="box" id="box"><input id="in" placeholder="タグを入力（Enterで追加）" aria-label="タグ"></div><p id="val"></p>`,
  css: `
    body { display: grid; place-content: center; gap: 6px; background: #f2f1ee; }
    .box { width: min(480px, 92vw); display: flex; flex-wrap: wrap; gap: 6px; padding: 8px; background: #fff; border: 2px solid #d6d2c8; border-radius: 12px; }
    .box:focus-within { border-color: #e0532f; }
    .chip { display: inline-flex; align-items: center; gap: 4px; padding: 3px 4px 3px 10px; border-radius: 99px; background: #fde4dc; color: #8a2a14; font-size: 14px; animation: pop .15s ease-out; }
    .chip button { border: 0; background: none; padding: 0 6px; border-radius: 99px; color: inherit; }
    .chip button:hover { background: #f6c3b4; }
    #in { flex: 1; min-width: 120px; border: 0; outline: none; padding: 4px; }
    @keyframes pop { from { scale: .6; } }
    p { margin: 0; font: 12px ui-monospace, monospace; color: #666; }`,
  js() {
    const box = document.getElementById('box'), input = document.getElementById('in');
    const tags = [];
    function render() {
      box.querySelectorAll('.chip').forEach((c) => c.remove());
      tags.forEach((t, i) => { const c = document.createElement('span'); c.className = 'chip'; c.innerHTML = `<span></span><button aria-label="${t} を消す">×</button>`; c.firstChild.textContent = t; c.lastChild.onclick = () => { tags.splice(i, 1); render(); input.focus(); }; box.insertBefore(c, input); });
      document.getElementById('val').textContent = JSON.stringify(tags);
    }
    function add(v) { v = v.trim().replace(/[、,]$/, ''); if (v && !tags.includes(v)) tags.push(v); input.value = ''; render(); }
    input.addEventListener('keydown', (e) => {
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === 'Enter') { e.preventDefault(); add(input.value); }
      else if (e.key === 'Backspace' && !input.value && tags.length) { tags.pop(); render(); }
    });
    input.addEventListener('input', () => { if (/[、,]$/.test(input.value)) add(input.value); });
    ['HTML', 'CSS', '図鑑'].forEach(add);
    if (window.THUMB) { const w = ['JS', 'SVG', 'Canvas', '音']; let i = 0; setInterval(() => { if (tags.length > 6) tags.splice(0, 3); add(w[i++ % 4] + i); }, 800); }
  },
}, {
  id: 'ui-progress', c: 'ui', lv: 1,
  t: '進み具合の表示いろいろ', y: 'すすみぐあいのひょうじいろいろ',
  tags: ['progress', 'meter', '円形', '進捗'],
  d: 'progress（作業の進み具合）と meter（量の目盛り）は別の要素。どちらも accent-color などで色を変えられる。円形の進み具合は conic-gradient で描く。',
  html: `
    <div class="wrap">
      <label>ダウンロード <progress id="p" max="100" value="30"></progress></label>
      <label>ディスク使用量 <meter id="m" min="0" max="100" low="60" high="85" optimum="20" value="70"></meter></label>
      <label>不定（いつ終わるか分からない） <progress></progress></label>
      <div class="ring" id="ring" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="30"><span id="rv">30%</span></div>
    </div>`,
  css: `
    body { display: grid; place-items: center; background: #f4f6f8; }
    .wrap { display: grid; gap: 14px; width: min(420px, 90vw); font-size: 14px; }
    label { display: grid; gap: 4px; }
    progress, meter { width: 100%; height: 14px; accent-color: #e0532f; }
    .ring { --v: 30; position: relative; justify-self: center; width: 120px; aspect-ratio: 1; display: grid; place-items: center; }
    .ring::before { content: ""; position: absolute; inset: 0; border-radius: 50%; background: conic-gradient(#2f855a calc(var(--v) * 1%), #dfe5ea 0); mask: radial-gradient(circle, transparent 52%, #000 53%); }
    .ring span { font: 800 22px sans-serif; color: #2f855a; }`,
  js() {
    let v = 30;
    setInterval(() => {
      v = (v + 2) % 102;
      document.getElementById('p').value = v;
      document.getElementById('m').value = (v * 0.9 + 10) % 100;
      const r = document.getElementById('ring'); r.style.setProperty('--v', v); r.setAttribute('aria-valuenow', v);
      document.getElementById('rv').textContent = v + '%';
    }, 120);
  },
});
