/* ブラウザの機能 */
dekiru.add({
  id: 'ap-clipboard', c: 'api', lv: 2, so: 1,
  t: 'クリップボードの読み書き', y: 'くりっぷぼーどのよみかき',
  tags: ['Clipboard', 'コピー', '貼り付け', 'ClipboardItem'],
  d: 'navigator.clipboard で文字をコピーし、貼り付け欄から読み出す。ClipboardItem を使うと、太字などの書式付き HTML と書式なしの文字を同時にコピーでき、貼り付け先のアプリが都合のよい方を選ぶ。',
  html: `<div class="box"><p id="src">これは<strong>太字</strong>と<em>斜体</em>を含む文です。</p><div class="bar"><button id="plain">文字だけコピー</button><button id="rich">書式付きでコピー</button><button id="read">クリップボードを読む</button></div><div class="paste" contenteditable="true" aria-label="ここに貼り付けて試せます">ここに貼り付けて（Ctrl+V）試せます</div><p id="msg" role="status"></p></div>`,
  css: `body { display: grid; place-items: center; background: #f1f3f7; } .box { width: min(480px, 92vw); display: grid; gap: 8px; } .bar { display: flex; flex-wrap: wrap; gap: 6px; } .paste { min-height: 70px; border: 2px dashed #9aa6bd; border-radius: 10px; padding: 8px; background: #fff; } #msg { font-size: 13px; color: #2f855a; margin: 0; min-height: 1.3em; }`,
  js() {
    const msg = (s) => { document.getElementById('msg').textContent = s; };
    const src = document.getElementById('src');
    document.getElementById('plain').onclick = async () => { try { await navigator.clipboard.writeText(src.textContent); msg('文字だけをコピーしました'); } catch (e) { msg('コピーできませんでした: ' + e.message); } };
    document.getElementById('rich').onclick = async () => {
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([src.innerHTML], { type: 'text/html' }), 'text/plain': new Blob([src.textContent], { type: 'text/plain' }) })]);
        msg('書式付きでコピーしました。下の欄やワープロに貼ると太字が残ります');
      } catch (e) { msg('書式付きのコピーに未対応です: ' + e.message); }
    };
    document.getElementById('read').onclick = async () => { try { msg('読み取った内容: ' + (await navigator.clipboard.readText()).slice(0, 80)); } catch (e) { msg('読み取りは許可が必要です: ' + e.message); } };
  },
}, {
  id: 'ap-notification', c: 'api', lv: 2, so: 1, nt: 1, perm: 1,
  t: 'デスクトップに通知を出す', y: 'ですくとっぷにつうちをだす',
  tags: ['Notification', '通知', '許可', 'お知らせ'],
  d: 'Notification.requestPermission() で通知の許可をもらい、new Notification() で画面の隅に通知を出す。3秒後に出す予約もできる。許可の状態も表示する。',
  html: `<div class="box"><p>許可の状態: <b id="perm"></b></p><button id="ask">通知を許可する</button><button id="now">今すぐ通知</button><button id="later">3秒後に通知</button></div>`,
  css: `body { display: grid; place-items: center; background: #f3f0fa; } .box { display: grid; gap: 8px; justify-items: start; }`,
  js() {
    const show = () => { document.getElementById('perm').textContent = 'Notification' in window ? { granted: '許可済み', denied: '拒否', default: 'まだ聞いていない' }[Notification.permission] : '非対応'; };
    const notify = () => { if (Notification.permission === 'granted') new Notification('出来る！図鑑', { body: 'ブラウザから通知を出しました。', tag: 'dekiru' }); else console.warn('通知の許可がありません'); };
    document.getElementById('ask').onclick = async () => { await Notification.requestPermission(); show(); };
    document.getElementById('now').onclick = notify;
    document.getElementById('later').onclick = () => setTimeout(notify, 3000);
    show();
  },
}, {
  id: 'ap-fullscreen', c: 'api', lv: 1,
  t: '全画面にする', y: 'ぜんがめんにする',
  tags: ['Fullscreen', '全画面', ':fullscreen', 'プレゼン'],
  d: 'requestFullscreen() で要素1つだけを画面いっぱいに広げる。全画面中だけ効く :fullscreen の CSS で見た目を変え、Esc キーで元に戻る。',
  html: `<section id="s" class="slide"><h1>全画面のスライド</h1><p>全画面にすると文字が大きくなります</p><button id="fs">全画面にする</button></section>`,
  css: `body { display: grid; place-items: center; background: #e9edf3; } .slide { width: min(520px, 90vw); aspect-ratio: 16 / 9; border-radius: 14px; background: linear-gradient(135deg, #26407c, #7a5cff); color: #fff; display: grid; place-content: center; text-align: center; gap: 8px; } .slide h1 { margin: 0; font: 800 28px serif; } .slide:fullscreen { border-radius: 0; } .slide:fullscreen h1 { font-size: 8vw; } .slide:fullscreen p { font-size: 3vw; }`,
  js() {
    const s = document.getElementById('s'), b = document.getElementById('fs');
    b.onclick = async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await s.requestFullscreen(); } catch (e) { console.error('全画面にできませんでした: ' + e.message); } };
    document.addEventListener('fullscreenchange', () => { b.textContent = document.fullscreenElement ? '元に戻す（Esc）' : '全画面にする'; });
  },
}, {
  id: 'ap-vibrate', c: 'api', lv: 1,
  t: 'スマホを振動させる', y: 'すまほをしんどうさせる',
  tags: ['Vibration', '振動', 'スマホ', '触覚'],
  d: 'navigator.vibrate に「振動する時間・止まる時間」の並びを渡すと、そのリズムで端末が震える。対応しているのは主に Android のスマホ。対応していない環境ではそう表示する。',
  html: `<div class="pad"><button data-p="200">ブッ</button><button data-p="100,80,100">ブブッ</button><button data-p="500">ブーーー</button><button data-p="100,50,100,50,100,300,300,100,300">SOS風</button><button data-p="0">止める</button></div><p id="msg"></p>`,
  css: `body { display: grid; place-content: center; justify-items: center; background: #f6f1ff; } .pad { display: grid; grid-template-columns: repeat(2, 140px); gap: 8px; } .pad button { height: 56px; font-weight: 700; } p { font-size: 13px; }`,
  js() {
    const ok = 'vibrate' in navigator;
    document.getElementById('msg').textContent = ok ? 'ボタンを押すと振動します（対応端末のみ）' : 'この環境は振動に対応していません（主に Android のスマホで動きます）';
    document.querySelector('.pad').onclick = (e) => { const p = e.target.dataset.p; if (p && ok) navigator.vibrate(p.split(',').map(Number)); };
  },
}, {
  id: 'ap-geolocation', c: 'api', lv: 2, so: 1, nt: 1, perm: 1,
  t: '今いる場所を調べる', y: 'いまいるばしょをしらべる',
  tags: ['Geolocation', '位置情報', '距離', '方角'],
  d: '許可をもらって現在地の緯度・経度を取り、東京駅までのおおよその距離と方角を計算する。地球を球として扱うハバーサインの公式を使う。位置の情報はどこにも送らない。',
  html: `<button id="go">現在地を調べる</button><dl id="o"></dl><div class="compass"><i id="needle"></i><span>北</span></div>`,
  css: `body { display: grid; place-content: center; justify-items: center; gap: 10px; background: #eef4f0; } dl { display: grid; grid-template-columns: auto auto; gap: 4px 12px; margin: 0; } dt { color: #777; } .compass { position: relative; width: 120px; height: 120px; border-radius: 50%; border: 3px solid #2f855a; background: #fff; } .compass span { position: absolute; top: 2px; left: 50%; translate: -50% 0; font-size: 11px; } .compass i { position: absolute; left: 50%; top: 10%; width: 4px; height: 40%; margin-left: -2px; background: #c23b22; transform-origin: 50% 100%; transition: rotate .6s; }`,
  js() {
    const TOKYO = [35.681236, 139.767125];
    const rad = (d) => (d * Math.PI) / 180;
    function dist([a, b], [c, d]) { const R = 6371, x = Math.sin(rad(c - a) / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(rad(d - b) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); }
    function bearing([a, b], [c, d]) { const y = Math.sin(rad(d - b)) * Math.cos(rad(c)), x = Math.cos(rad(a)) * Math.sin(rad(c)) - Math.sin(rad(a)) * Math.cos(rad(c)) * Math.cos(rad(d - b)); return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360; }
    document.getElementById('go').onclick = () => {
      if (!navigator.geolocation) { document.getElementById('o').textContent = '位置情報に未対応です'; return; }
      navigator.geolocation.getCurrentPosition((p) => {
        const me = [p.coords.latitude, p.coords.longitude], km = dist(me, TOKYO), br = bearing(me, TOKYO);
        document.getElementById('o').innerHTML = `<dt>緯度</dt><dd>${me[0].toFixed(5)}</dd><dt>経度</dt><dd>${me[1].toFixed(5)}</dd><dt>誤差</dt><dd>約 ${Math.round(p.coords.accuracy)} m</dd><dt>東京駅まで</dt><dd>約 ${km.toFixed(1)} km（${['北', '北東', '東', '南東', '南', '南西', '西', '北西'][Math.round(br / 45) % 8]}）</dd>`;
        document.getElementById('needle').style.rotate = br + 'deg';
      }, (e) => { document.getElementById('o').textContent = '取得できませんでした: ' + e.message; }, { enableHighAccuracy: true, timeout: 10000 });
    };
  },
}, {
  id: 'ap-web-share', c: 'api', lv: 1,
  t: 'スマホの共有シートを開く', y: 'すまほのきょうゆうしーとをひらく',
  tags: ['Web Share', '共有', 'SNS', 'スマホ'],
  d: 'navigator.share() を呼ぶと、スマホでおなじみの共有シート（LINE やメールなどを選ぶ画面）が開く。対応していない環境では、代わりにリンクをコピーする。',
  html: `<article class="card"><h2>出来る！図鑑</h2><p>ライブラリなしで作られた見本の図鑑。</p><button id="share">共有する</button><p id="msg"></p></article>`,
  css: `body { display: grid; place-items: center; background: #fff3ec; } .card { width: min(360px, 90vw); background: #fff; padding: 18px; border-radius: 14px; box-shadow: 0 2px 10px #0001; } #msg { font-size: 13px; color: #555; }`,
  js() {
    const data = { title: '出来る！HTML/CSS/JavaScript', text: 'ライブラリなしでここまで出来る、という見本の図鑑', url: 'https://example.com/dekiru' };
    document.getElementById('share').onclick = async () => {
      if (navigator.share && (!navigator.canShare || navigator.canShare(data))) {
        try { await navigator.share(data); document.getElementById('msg').textContent = '共有しました'; } catch (e) { document.getElementById('msg').textContent = e.name === 'AbortError' ? 'やめました' : '共有できませんでした: ' + e.message; }
      } else {
        try { await navigator.clipboard.writeText(data.url); document.getElementById('msg').textContent = '共有シートが使えないので、リンクをコピーしました'; } catch { document.getElementById('msg').textContent = '共有もコピーもできない環境です'; }
      }
    };
  },
}, {
  id: 'ap-localstorage', c: 'api', lv: 1, so: 1,
  t: 'ブラウザに覚えさせる（localStorage）', y: 'ぶらうざにおぼえさせるろーかるすとれーじ',
  tags: ['localStorage', '保存', 'キーと値', 'JSON'],
  d: 'localStorage は、文字のキーと文字の値の組をブラウザに保存する。ページを閉じても消えない。この見本を開いた回数を数え、好きなキーと値を保存・削除できる。',
  html: `<p class="visits">この見本を開いた回数: <b id="v"></b></p><form id="f"><input id="k" placeholder="キー" value="好きな色" aria-label="キー"><input id="val" placeholder="値" value="朱色" aria-label="値"><button>保存</button></form><table id="t"></table>`,
  css: `body { padding: 12px; background: #f4f6f2; } .visits { font-size: 18px; } form { display: flex; gap: 6px; flex-wrap: wrap; } table { border-collapse: collapse; margin-top: 10px; background: #fff; } td { border: 1px solid #ddd; padding: 4px 10px; font-size: 14px; }`,
  js() {
    const P = 'demo-ls:';
    const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
    const set = (k, v) => { try { localStorage.setItem(k, v); } catch { /* 保存できない */ } };
    // 一覧のプレビュー表示（THUMB）は「開いた」に数えない
    const n = +(get(P + 'visits') || 0) + (window.THUMB ? 0 : 1);
    if (!window.THUMB) set(P + 'visits', n);
    document.getElementById('v').textContent = `${n} 回目`;
    function render() {
      const rows = [];
      try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith(P) && k !== P + 'visits') rows.push(k); } } catch { /* 読めない */ }
      document.getElementById('t').innerHTML = rows.map((k) => `<tr><td></td><td></td><td><button data-k="">消す</button></td></tr>`).join('') || '<tr><td>まだ何も保存していません</td></tr>';
      document.querySelectorAll('#t tr').forEach((tr, i) => { if (!rows[i]) return; tr.children[0].textContent = rows[i].slice(P.length); tr.children[1].textContent = get(rows[i]); tr.querySelector('button').onclick = () => { localStorage.removeItem(rows[i]); render(); }; });
    }
    document.getElementById('f').onsubmit = (e) => { e.preventDefault(); set(P + document.getElementById('k').value, document.getElementById('val').value); render(); };
    addEventListener('storage', render);
    render();
  },
}, {
  id: 'ap-indexeddb', c: 'api', lv: 3, so: 1,
  t: 'たくさん保存する（IndexedDB）', y: 'たくさんほぞんするいんでっくすとでぃーびー',
  tags: ['IndexedDB', 'データベース', '非同期', '保存'],
  d: 'IndexedDB はブラウザに入っているデータベース。文字だけでなく、日付や配列を含むオブジェクトを、そのまま大量に保存できる。メモを足して一覧にし、消すこともできる。',
  p: 'IndexedDB の命令は結果をイベントで返す。小さな関数で Promise に包むと、await で順番に書ける。',
  html: `<form id="f"><input id="t" placeholder="メモを書く" aria-label="メモ" required><button>保存</button></form><ul id="list"></ul><p id="n"></p>`,
  css: `body { padding: 12px; background: #f2f4f9; } form { display: flex; gap: 6px; } #t { flex: 1; } ul { list-style: none; padding: 0; } li { display: flex; gap: 8px; align-items: center; background: #fff; padding: 8px; margin-bottom: 4px; border-radius: 8px; } li small { color: #888; } li span { flex: 1; } p { font-size: 12px; color: #666; }`,
  js() {
    const req = (r) => new Promise((ok, ng) => { r.onsuccess = () => ok(r.result); r.onerror = () => ng(r.error); });
    let db;
    async function open() {
      const r = indexedDB.open('dekiru-demo', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('notes', { keyPath: 'id', autoIncrement: true });
      db = await req(r);
    }
    const store = (mode) => db.transaction('notes', mode).objectStore('notes');
    async function render() {
      const all = await req(store('readonly').getAll());
      const list = document.getElementById('list'); list.innerHTML = '';
      for (const n of all.reverse()) {
        const li = document.createElement('li');
        li.innerHTML = '<span></span><small></small><button>消す</button>';
        li.querySelector('span').textContent = n.text; li.querySelector('small').textContent = n.at.toLocaleString('ja-JP');
        li.querySelector('button').onclick = async () => { await req(store('readwrite').delete(n.id)); render(); };
        list.append(li);
      }
      document.getElementById('n').textContent = `保存しているメモ: ${all.length} 件（ページを開き直しても残ります）`;
    }
    document.getElementById('f').onsubmit = async (e) => { e.preventDefault(); const t = document.getElementById('t'); await req(store('readwrite').add({ text: t.value, at: new Date() })); t.value = ''; render(); };
    open().then(render).catch((e) => { document.getElementById('n').textContent = 'IndexedDB を開けませんでした: ' + e.message; });
  },
}, {
  id: 'ap-broadcast-channel', c: 'api', lv: 2, so: 1,
  t: 'タブ同士で話す（BroadcastChannel）', y: 'たぶどうしではなすぶろーどきゃすとちゃんねる',
  tags: ['BroadcastChannel', 'タブ間通信', 'メッセージ', '同期'],
  d: '同じサイトの別のタブや窓どうしで、同じ名前の BroadcastChannel を開くとメッセージを送り合える。ここでは画面の中にもう1つ小さな窓を作り、2つの窓で会話する。',
  html: `<div class="two"><section><h3>窓A（この画面）</h3><ol id="log"></ol><form id="f"><input id="m" value="こんにちは" aria-label="送る言葉"><button>送る</button></form></section><iframe id="b" title="窓B"></iframe></div>`,
  css: `body { padding: 8px; background: #eef1f6; } .two { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; height: 100%; } section, iframe { background: #fff; border-radius: 10px; border: 1px solid #ccd; } section { padding: 8px; display: flex; flex-direction: column; } iframe { width: 100%; height: 100%; } h3 { margin: 0 0 6px; font-size: 14px; } ol { flex: 1; overflow: auto; font-size: 13px; }`,
  js() {
    const ch = new BroadcastChannel('dekiru-chat');
    const log = (s) => { const li = document.createElement('li'); li.textContent = s; document.getElementById('log').append(li); };
    ch.onmessage = (e) => log('受信: ' + e.data);
    document.getElementById('f').onsubmit = (e) => { e.preventDefault(); const m = document.getElementById('m').value; ch.postMessage('窓Aより「' + m + '」'); log('送信: ' + m); };
    document.getElementById('b').srcdoc = `<meta charset="utf-8"><body style="font:13px sans-serif;padding:8px"><h3 style="margin:0 0 6px;font-size:14px">窓B（中の窓）</h3><ol id="l"></ol><button id="s">返事をする</button><script>
      const ch = new BroadcastChannel('dekiru-chat');
      const add = (t) => { const li = document.createElement('li'); li.textContent = t; document.getElementById('l').append(li); };
      ch.onmessage = (e) => add('受信: ' + e.data);
      document.getElementById('s').onclick = () => { ch.postMessage('窓Bより「元気です」'); add('送信: 元気です'); };
    </script></body>`;
    if (window.THUMB) setInterval(() => document.getElementById('f').requestSubmit(), 1500);
  },
}, {
  id: 'ap-web-worker', c: 'api', lv: 3, so: 1,
  t: '重い計算を別の流れで（Web Worker）', y: 'おもいけいさんをべつのながれでうぇぶわーかー',
  tags: ['Web Worker', '並行処理', 'Blob', '素数'],
  d: '1億までの素数を数える重い計算を、画面と同じ流れで走らせると回る印が止まって固まる。Web Worker に任せると、計算中も印はなめらかに回り続ける。Worker のコードは Blob から作るので、別ファイルはいらない。',
  html: `<div class="spin" aria-hidden="true"></div><div class="bar"><button id="main">画面の中で計算（固まる）</button><button id="work">Workerで計算（固まらない）</button></div><p id="o">ボタンを押してください</p>`,
  css: `body { display: grid; place-content: center; justify-items: center; gap: 14px; background: #f3f2ee; } .spin { width: 80px; height: 80px; border-radius: 50%; border: 10px solid #ddd; border-top-color: #e0532f; animation: r 1s linear infinite; } @keyframes r { to { rotate: 1turn; } } .bar { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; } p { font-weight: 700; }`,
  js() {
    const N = 30000000;
    function count(n) { const s = new Uint8Array(n + 1); let c = 0; for (let i = 2; i <= n; i++) { if (s[i]) continue; c++; for (let j = i * i; j <= n; j += i) s[j] = 1; } return c; }
    const o = document.getElementById('o');
    document.getElementById('main').onclick = () => { o.textContent = '計算中…'; setTimeout(() => { const t = performance.now(); const c = count(N); o.textContent = `画面の中で: ${N.toLocaleString()} までの素数は ${c.toLocaleString()} 個（${Math.round(performance.now() - t)} ms、その間は固まりました）`; }, 50); };
    document.getElementById('work').onclick = () => {
      const src = `${count.toString()}; onmessage = (e) => { const t = performance.now(); postMessage([count(e.data), performance.now() - t]); };`;
      const w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      o.textContent = 'Worker が計算中…（印は回り続けます）';
      w.onmessage = (e) => { o.textContent = `Worker で: ${N.toLocaleString()} までの素数は ${e.data[0].toLocaleString()} 個（${Math.round(e.data[1])} ms）`; w.terminate(); };
      w.onerror = (e) => { o.textContent = 'Worker を作れませんでした: ' + e.message; };
      w.postMessage(N);
    };
  },
}, {
  id: 'ap-online-status', c: 'api', lv: 1,
  t: 'つながっているかを知る', y: 'つながっているかをしる',
  tags: ['オフライン', 'navigator.onLine', 'online', 'ネットワーク'],
  d: 'navigator.onLine と online・offline イベントで、ネットにつながっているかを表示する。機内モードにしたり LAN を抜いたりすると表示が変わる。使えれば回線の種類の目安も出す。',
  html: `<div class="st" id="st"></div><p id="net"></p><ol id="log"></ol>`,
  css: `body { display: grid; place-content: center; justify-items: center; background: #f4f4f4; } .st { padding: 14px 28px; border-radius: 999px; font: 800 22px sans-serif; color: #fff; } .on { background: #2f855a; } .off { background: #c23b22; } ol { font-size: 13px; color: #555; }`,
  js() {
    const st = document.getElementById('st');
    const show = (ev) => {
      const on = navigator.onLine;
      st.textContent = on ? 'オンライン' : 'オフライン'; st.className = 'st ' + (on ? 'on' : 'off');
      const c = navigator.connection; document.getElementById('net').textContent = c ? `回線の目安: ${c.effectiveType}（下り約 ${c.downlink} Mbps）` : '';
      if (ev) { const li = document.createElement('li'); li.textContent = `${new Date().toLocaleTimeString('ja-JP')} ${on ? 'つながりました' : '切れました'}`; document.getElementById('log').prepend(li); }
    };
    addEventListener('online', show); addEventListener('offline', show);
    show();
  },
}, {
  id: 'ap-page-visibility', c: 'api', lv: 1,
  t: '見られていないときを知る', y: 'みられていないときをしる',
  tags: ['Page Visibility', 'visibilitychange', 'タブ', '省電力'],
  d: '別のタブに移ったり窓を最小化したりすると visibilitychange が起きる。見られていない間は動画や計算を止めて電池を節約し、戻ってきたら「何秒離れていたか」を表示する。',
  html: `<p class="big" id="st">見られています</p><p id="away">別のタブに移ってから戻ってきてください</p><ol id="log"></ol>`,
  css: `body { display: grid; place-content: center; justify-items: center; background: #eef3f9; } .big { font: 800 28px sans-serif; color: #26407c; } ol { font-size: 13px; }`,
  js() {
    let hiddenAt = 0;
    document.addEventListener('visibilitychange', () => {
      const li = document.createElement('li');
      if (document.hidden) { hiddenAt = performance.now(); li.textContent = `${new Date().toLocaleTimeString('ja-JP')} 見えなくなった`; }
      else { const s = ((performance.now() - hiddenAt) / 1000).toFixed(1); document.getElementById('away').textContent = `おかえりなさい。${s} 秒はなれていました`; li.textContent = `${new Date().toLocaleTimeString('ja-JP')} 戻ってきた（${s} 秒）`; }
      document.getElementById('st').textContent = document.hidden ? '見られていません' : '見られています';
      document.getElementById('log').prepend(li);
    });
  },
}, {
  id: 'ap-device-tilt', c: 'api', lv: 2,
  t: '傾けると転がる玉', y: 'かたむけるところがるたま',
  tags: ['DeviceOrientation', '傾き', 'センサー', 'スマホ'],
  d: 'スマホを傾けると、deviceorientation の角度に合わせて玉が転がる。iPhone では最初に許可が必要。パソコンではマウスの位置を傾きの代わりにする。',
  html: `<div class="tray" id="tray"><i id="ball"></i></div><button id="perm">傾きセンサーを使う</button><p id="o"></p>`,
  css: `body { display: grid; place-content: center; justify-items: center; gap: 8px; background: #e7efe9; } .tray { position: relative; width: min(80vmin, 360px); aspect-ratio: 1; border-radius: 24px; background: radial-gradient(#7cbf8c, #3f7d4c); box-shadow: inset 0 6px 16px #0006; } .tray i { position: absolute; width: 36px; height: 36px; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #fff, #e0532f 40%, #6b1d0e); box-shadow: 0 4px 6px #0006; } p { font: 12px ui-monospace, monospace; }`,
  js() {
    const tray = document.getElementById('tray'), ball = document.getElementById('ball');
    let tx = 0, ty = 0, x = 0.5, y = 0.5, vx = 0, vy = 0;
    addEventListener('deviceorientation', (e) => { if (e.gamma === null) return; tx = e.gamma / 45; ty = e.beta / 45; document.getElementById('o').textContent = `左右 ${e.gamma.toFixed(0)}° ・ 前後 ${e.beta.toFixed(0)}°`; });
    tray.addEventListener('pointermove', (e) => { const r = tray.getBoundingClientRect(); tx = ((e.clientX - r.left) / r.width - 0.5) * 2; ty = ((e.clientY - r.top) / r.height - 0.5) * 2; });
    document.getElementById('perm').onclick = async () => { if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) { try { await DeviceOrientationEvent.requestPermission(); } catch (e) { console.error(e.message); } } };
    (function loop(t) {
      if (window.THUMB) { tx = Math.sin(t / 700); ty = Math.cos(t / 900); }
      vx = (vx + tx * 0.0015) * 0.98; vy = (vy + ty * 0.0015) * 0.98; x += vx; y += vy;
      if (x < 0.05 || x > 0.95) { vx *= -0.6; x = Math.max(0.05, Math.min(0.95, x)); }
      if (y < 0.05 || y > 0.95) { vy *= -0.6; y = Math.max(0.05, Math.min(0.95, y)); }
      ball.style.left = `calc(${x * 100}% - 18px)`; ball.style.top = `calc(${y * 100}% - 18px)`;
      requestAnimationFrame(loop);
    })(0);
  },
}, {
  id: 'ap-wake-lock', c: 'api', lv: 2, so: 1,
  t: '画面を暗くさせない', y: 'がめんをくらくさせない',
  tags: ['Screen Wake Lock', '省電力', 'レシピ', 'スマホ'],
  d: 'レシピを見ながら料理するときなど、画面が勝手に暗くならないよう navigator.wakeLock.request("screen") で止めておく。タブを離れると解除されるので、戻ってきたらかけ直す。',
  html: `<button id="b">画面を点けたままにする</button><p id="st"></p>`,
  css: `body { display: grid; place-content: center; justify-items: center; gap: 10px; background: #fffbe8; } p { font-weight: 700; }`,
  js() {
    let lock = null, want = false;
    const st = document.getElementById('st'), b = document.getElementById('b');
    async function on() { try { lock = await navigator.wakeLock.request('screen'); st.textContent = '画面は暗くなりません'; lock.addEventListener('release', () => { st.textContent = '解除されました'; }); } catch (e) { st.textContent = '使えませんでした: ' + e.message; } }
    if (!('wakeLock' in navigator)) { st.textContent = 'この環境は Wake Lock に未対応です'; b.disabled = true; }
    b.onclick = async () => { want = !want; b.textContent = want ? 'やめる' : '画面を点けたままにする'; if (want) on(); else if (lock) { await lock.release(); lock = null; } };
    document.addEventListener('visibilitychange', () => { if (want && !document.hidden) on(); });
  },
}, {
  id: 'ap-file-system', c: 'api', lv: 3, so: 1,
  t: 'ファイルを開いて上書き保存', y: 'ふぁいるをひらいてうわがきほぞん',
  tags: ['File System Access', 'showOpenFilePicker', 'テキストエディタ', '保存'],
  d: '対応ブラウザでは showOpenFilePicker でファイルを開き、書き換えたら同じファイルに上書き保存できる。対応していなければ、ファイル選択とダウンロードで同じことをする。小さなメモ帳アプリになる。',
  html: `<div class="bar"><button id="open">開く</button><button id="save">保存</button><button id="saveas">名前を付けて保存</button><span id="name">（新しいファイル）</span></div><textarea id="t" spellcheck="false" aria-label="本文">ここに書いた文章を、パソコンのファイルとして保存できます。</textarea>`,
  css: `body { display: flex; flex-direction: column; background: #f4f4f1; } .bar { display: flex; gap: 6px; align-items: center; padding: 8px; font-size: 13px; } #name { color: #666; } textarea { flex: 1; margin: 0 8px 8px; font: 14px/1.7 ui-monospace, monospace; }`,
  js() {
    const t = document.getElementById('t'), nameEl = document.getElementById('name');
    let handle = null;
    const native = 'showOpenFilePicker' in window;
    const types = [{ description: 'テキスト', accept: { 'text/plain': ['.txt', '.md'] } }];
    document.getElementById('open').onclick = async () => {
      try {
        if (native) { [handle] = await showOpenFilePicker({ types }); const f = await handle.getFile(); t.value = await f.text(); nameEl.textContent = f.name; }
        else { const inp = Object.assign(document.createElement('input'), { type: 'file', accept: '.txt,.md,text/plain' }); inp.onchange = async () => { const f = inp.files[0]; t.value = await f.text(); nameEl.textContent = f.name + '（読み込みのみ）'; }; inp.click(); }
      } catch (e) { if (e.name !== 'AbortError') console.error(e.message); }
    };
    async function saveAs() {
      if (native && 'showSaveFilePicker' in window) { handle = await showSaveFilePicker({ suggestedName: 'memo.txt', types }); nameEl.textContent = handle.name; return write(); }
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([t.value], { type: 'text/plain' })); a.download = 'memo.txt'; a.click(); nameEl.textContent = 'ダウンロードしました';
    }
    async function write() { const w = await handle.createWritable(); await w.write(t.value); await w.close(); nameEl.textContent = handle.name + '（保存しました）'; }
    document.getElementById('save').onclick = () => (handle ? write() : saveAs()).catch((e) => { if (e.name !== 'AbortError') console.error(e.message); });
    document.getElementById('saveas').onclick = () => saveAs().catch((e) => { if (e.name !== 'AbortError') console.error(e.message); });
  },
}, {
  id: 'ap-gamepad', c: 'api', lv: 2,
  t: 'ゲームコントローラーを読む', y: 'げーむこんとろーらーをよむ',
  tags: ['Gamepad', 'コントローラー', '入力', 'ゲーム'],
  d: 'USB や Bluetooth のゲームコントローラーをつなぐと、navigator.getGamepads() でボタンとスティックの状態を毎フレーム読める。左スティックで点を動かし、押されたボタンを光らせる。',
  html: `<p id="st">コントローラーをつないで、どれかのボタンを押してください</p><div class="pad"><div class="field"><i id="dot"></i></div><div class="btns" id="btns"></div></div>`,
  css: `body { display: grid; place-content: center; justify-items: center; gap: 10px; background: #1b1d26; color: #dde; } .pad { display: flex; gap: 16px; align-items: center; } .field { position: relative; width: 200px; height: 200px; border-radius: 50%; background: #2a2d3a; } .field i { position: absolute; width: 20px; height: 20px; margin: -10px; border-radius: 50%; background: #ffd23f; left: 50%; top: 50%; } .btns { display: grid; grid-template-columns: repeat(4, 34px); gap: 6px; } .btns b { height: 34px; border-radius: 50%; display: grid; place-items: center; background: #2a2d3a; font-size: 11px; } .btns b.on { background: #e0532f; color: #fff; }`,
  js() {
    const btns = document.getElementById('btns');
    btns.innerHTML = Array.from({ length: 16 }, (_, i) => `<b>${i}</b>`).join('');
    addEventListener('gamepadconnected', (e) => { document.getElementById('st').textContent = `つながりました: ${e.gamepad.id}`; });
    (function loop(t) {
      const gp = (navigator.getGamepads ? [...navigator.getGamepads()] : []).find(Boolean);
      let ax = 0, ay = 0, pressed = [];
      if (gp) { ax = gp.axes[0] || 0; ay = gp.axes[1] || 0; pressed = gp.buttons.map((b) => b.pressed); }
      else if (window.THUMB) { ax = Math.cos(t / 600); ay = Math.sin(t / 600); pressed[Math.floor(t / 400) % 16] = true; }
      const dot = document.getElementById('dot'); dot.style.left = 50 + ax * 45 + '%'; dot.style.top = 50 + ay * 45 + '%';
      [...btns.children].forEach((b, i) => b.classList.toggle('on', !!pressed[i]));
      requestAnimationFrame(loop);
    })(0);
  },
}, {
  id: 'ap-resize-observer', c: 'api', lv: 2,
  t: '大きさの変化を見張る', y: 'おおきさのへんかをみはる',
  tags: ['ResizeObserver', '大きさ', 'レイアウト', '要素'],
  d: 'ResizeObserver は、要素の大きさが変わるたびに知らせてくれる。右下をつまんで箱の大きさを変えると、今の幅と高さを表示し、幅に応じて中の表示を3段階に切り替える。',
  html: `<div class="box" id="box"><b id="size"></b><span id="mode"></span></div>`,
  css: `body { padding: 12px; background: #f1f4f8; } .box { width: 320px; height: 180px; resize: both; overflow: hidden; min-width: 100px; min-height: 80px; max-width: 95vw; border: 2px dashed #26407c; border-radius: 10px; display: grid; place-content: center; text-align: center; background: #fff; transition: background .3s; } .box.s { background: #ffe3dc; } .box.l { background: #dff3e4; } b { font: 700 24px ui-monospace, monospace; } span { font-size: 14px; color: #555; }`,
  js() {
    const box = document.getElementById('box');
    new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect, mode = width < 220 ? 's' : width > 420 ? 'l' : 'm';
      document.getElementById('size').textContent = `${Math.round(width)} × ${Math.round(height)}`;
      document.getElementById('mode').textContent = { s: '小さい表示', m: 'ふつうの表示', l: '大きい表示' }[mode];
      box.className = 'box ' + mode;
    }).observe(box);
    if (window.THUMB) { let t = 0; setInterval(() => { t += 0.05; box.style.width = 300 + Math.sin(t) * 200 + 'px'; }, 30); }
  },
}, {
  id: 'ap-mutation-observer', c: 'api', lv: 2,
  t: 'DOMの変化を見張る', y: 'どむのへんかをみはる',
  tags: ['MutationObserver', 'DOM', '変更の検出', '監視'],
  d: 'MutationObserver を付けると、要素の追加・削除・属性の変更・文字の書き換えが起きるたびに、何が変わったかの記録を受け取れる。下の一覧を操作すると記録が流れる。',
  html: `<div class="wrap"><div><div class="bar"><button id="add">項目を足す</button><button id="del">最後を消す</button><button id="color">色を変える</button></div><ul id="list" contenteditable="true" aria-label="書き換えられる一覧"><li>文字も書き換えられます</li></ul></div><ol id="log"></ol></div>`,
  css: `body { padding: 10px; background: #f5f3ee; } .wrap { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; } .bar { display: flex; flex-wrap: wrap; gap: 4px; } ul { background: #fff; padding: 8px 24px; border-radius: 8px; min-height: 100px; } ol { font: 12px ui-monospace, monospace; background: #222; color: #9fe; padding: 8px 8px 8px 30px; border-radius: 8px; max-height: 80vh; overflow: auto; }`,
  js() {
    const list = document.getElementById('list'), log = document.getElementById('log');
    new MutationObserver((ms) => {
      for (const m of ms) {
        const li = document.createElement('li');
        li.textContent = m.type === 'childList' ? `要素: +${m.addedNodes.length} / −${m.removedNodes.length}` : m.type === 'attributes' ? `属性 ${m.attributeName} が変わった` : `文字: 「${m.target.data.slice(0, 20)}」`;
        log.prepend(li);
      }
    }).observe(list, { childList: true, subtree: true, attributes: true, characterData: true });
    let n = 1;
    document.getElementById('add').onclick = () => { const li = document.createElement('li'); li.textContent = `足した項目 ${n++}`; list.append(li); };
    document.getElementById('del').onclick = () => list.lastElementChild && list.lastElementChild.remove();
    document.getElementById('color').onclick = () => { list.style.color = `hsl(${Math.random() * 360} 60% 40%)`; };
    if (window.THUMB) { const ids = ['add', 'add', 'color', 'del']; let i = 0; setInterval(() => document.getElementById(ids[i++ % 4]).click(), 600); }
  },
}, {
  id: 'ap-intersection-observer', c: 'api', lv: 2,
  t: 'どれだけ見えているかを見張る', y: 'どれだけみえているかをみはる',
  tags: ['IntersectionObserver', '可視判定', 'スクロール', '遅延読み込み'],
  d: 'IntersectionObserver は、要素が画面（や枠）にどれだけ入っているかの割合を知らせてくれる。枠をスクロールすると、各箱に今の割合が表示され、半分以上見えている箱だけ色が付く。',
  html: `<div class="scroller" id="sc"></div>`,
  css: `body { padding: 10px; background: #eef0f5; } .scroller { height: 80vh; overflow-y: auto; background: #fff; border-radius: 10px; padding: 40vh 20px; display: grid; gap: 30px; } .scroller div { height: 140px; border-radius: 12px; display: grid; place-items: center; font: 700 22px ui-monospace, monospace; background: #e3e6ee; transition: background .3s; } .scroller div.vis { background: #ffd166; }`,
  js() {
    const sc = document.getElementById('sc');
    for (let i = 0; i < 10; i++) { const d = document.createElement('div'); d.textContent = '0%'; sc.append(d); }
    const io = new IntersectionObserver((es) => es.forEach((e) => { e.target.textContent = Math.round(e.intersectionRatio * 100) + '%'; e.target.classList.toggle('vis', e.intersectionRatio >= 0.5); }), { root: sc, threshold: Array.from({ length: 21 }, (_, i) => i / 20) });
    sc.querySelectorAll('div').forEach((d) => io.observe(d));
    if (window.THUMB) setInterval(() => { sc.scrollTop = sc.scrollTop + 4 >= sc.scrollHeight - sc.clientHeight ? 0 : sc.scrollTop + 4; }, 16);
  },
}, {
  id: 'ap-web-components', c: 'api', lv: 3,
  t: '自作のタグを作る（Web Components）', y: 'じさくのたぐをつくるうぇぶこんぽーねんつ',
  tags: ['Custom Elements', 'Shadow DOM', 'Web Components', '部品'],
  d: 'customElements.define で <star-rating> という新しいタグを作る。中身は Shadow DOM に閉じ込めるので、ページの CSS と混ざらない。属性で値を決め、値が変わるとイベントで知らせる。',
  p: 'フレームワークの「部品」と同じことが、ブラウザ標準の機能だけで書ける。',
  html: `<p>ふつうのタグのように使えます:</p><star-rating value="3"></star-rating><star-rating value="5" max="7" color="#26407c"></star-rating><p id="o"></p>`,
  css: `body { display: grid; place-content: center; justify-items: center; gap: 10px; background: #fbf8f0; }`,
  js() {
    class StarRating extends HTMLElement {
      static observedAttributes = ['value', 'max', 'color'];
      constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.shadowRoot.addEventListener('click', (e) => { const i = e.target.dataset.i; if (i) { this.setAttribute('value', i); this.dispatchEvent(new CustomEvent('change', { detail: +i, bubbles: true })); } });
      }
      attributeChangedCallback() { this.render(); }
      connectedCallback() { this.render(); }
      render() {
        const v = +this.getAttribute('value') || 0, max = +this.getAttribute('max') || 5, col = this.getAttribute('color') || '#e0a400';
        this.shadowRoot.innerHTML = `<style>button { border: 0; background: none; font-size: 36px; cursor: pointer; color: #ddd; padding: 0 2px; } button.on { color: ${col}; } button:hover { transform: scale(1.2); }</style>` +
          Array.from({ length: max }, (_, k) => `<button data-i="${k + 1}" class="${k < v ? 'on' : ''}" aria-label="${k + 1}">★</button>`).join('');
      }
    }
    customElements.define('star-rating', StarRating);
    document.addEventListener('change', (e) => { if (e.target.tagName === 'STAR-RATING') document.getElementById('o').textContent = `評価が ${e.detail} に変わりました`; });
  },
}, {
  id: 'ap-template-slot', c: 'api', lv: 3,
  t: 'templateとslotで型を使い回す', y: 'てんぷれーととすろっとでかたをつかいまわす',
  tags: ['template', 'slot', 'Shadow DOM', 'Custom Elements'],
  d: 'template 要素に名刺の型を1度だけ書き、自作タグ <name-card> の中の名前や肩書きを slot（差し込み口）へはめ込む。中身だけ変えて何枚でも同じ見た目の名刺が作れる。',
  html: `
    <template id="tpl">
      <style>.card { display: flex; gap: 12px; align-items: center; padding: 12px 16px; border-radius: 14px; background: #fff; box-shadow: 0 2px 8px #0002; border-left: 6px solid var(--c, #e0532f); } .av { width: 52px; height: 52px; border-radius: 50%; background: var(--c, #e0532f); color: #fff; display: grid; place-items: center; font: 800 22px serif; } ::slotted([slot=name]) { font-weight: 800; font-size: 18px; } ::slotted([slot=role]) { color: #666; font-size: 13px; }</style>
      <div class="card"><div class="av" id="av"></div><div><slot name="name"></slot><br><slot name="role"></slot></div></div>
    </template>
    <div class="list">
      <name-card><span slot="name">山田 花子</span><span slot="role">見本づくり係</span></name-card>
      <name-card style="--c:#26407c"><span slot="name">佐藤 一郎</span><span slot="role">パイプ工房の主</span></name-card>
      <name-card style="--c:#2f855a"><span slot="name">鈴木 次郎</span><span slot="role">索引の番人</span></name-card>
    </div>`,
  css: `body { display: grid; place-items: center; background: #f2f0ea; } .list { display: grid; gap: 10px; }`,
  js() {
    customElements.define('name-card', class extends HTMLElement {
      connectedCallback() {
        if (this.shadowRoot) return;
        const root = this.attachShadow({ mode: 'open' });
        root.append(document.getElementById('tpl').content.cloneNode(true));
        root.getElementById('av').textContent = (this.querySelector('[slot=name]')?.textContent || '？')[0];
      }
    });
  },
}, {
  id: 'ap-wasm-by-hand', c: 'api', lv: 3,
  t: '手書きのWebAssembly', y: 'てがきのうぇぶあせんぶりー',
  tags: ['WebAssembly', 'バイナリ', '機械語', 'コンパイル'],
  d: '2つの数を足すだけの WebAssembly を、41バイトの数の並びとして手で書き、ブラウザにその場で読み込ませて呼び出す。コンパイラもファイルも使わない。各バイトの意味も並べて示す。',
  p: '先頭の 00 61 73 6d は「\\0asm」という目印。その後に型・関数・書き出し・本体の4つの区画が続く。',
  html: `<div class="calc"><input id="a" type="number" value="20" aria-label="1つ目の数"> + <input id="b" type="number" value="22" aria-label="2つ目の数"> = <output id="o">?</output></div><table id="t"></table>`,
  css: `body { display: grid; place-content: center; justify-items: center; gap: 12px; background: #15171f; color: #dde; } .calc { font: 700 26px ui-monospace, monospace; } .calc input { width: 4em; font: inherit; } output { color: #ffd166; } table { border-collapse: collapse; font: 12px ui-monospace, monospace; } td { padding: 2px 8px; border-bottom: 1px solid #2c2f3a; } td:first-child { color: #7fd4ff; white-space: nowrap; }`,
  js() {
    const parts = [
      [[0x00, 0x61, 0x73, 0x6d], '目印 \\0asm'], [[0x01, 0x00, 0x00, 0x00], '版 1'],
      [[0x01, 0x07, 0x01, 0x60, 0x02, 0x7f, 0x7f, 0x01, 0x7f], '型の区画: (i32, i32) → i32 を1つ'],
      [[0x03, 0x02, 0x01, 0x00], '関数の区画: 型0の関数を1つ'],
      [[0x07, 0x07, 0x01, 0x03, 0x61, 0x64, 0x64, 0x00, 0x00], '書き出し: 関数0を "add" という名前で'],
      [[0x0a, 0x09, 0x01, 0x07, 0x00, 0x20, 0x00, 0x20, 0x01, 0x6a, 0x0b], '本体: 引数0と引数1を読んで足す（i32.add）'],
    ];
    const bytes = new Uint8Array(parts.flatMap((p) => p[0]));
    document.getElementById('t').innerHTML = parts.map(([b, d]) => `<tr><td>${b.map((x) => x.toString(16).padStart(2, '0')).join(' ')}</td><td>${d}</td></tr>`).join('') + `<tr><td>合計 ${bytes.length} バイト</td><td>WebAssembly.validate: ${WebAssembly.validate(bytes)}</td></tr>`;
    WebAssembly.instantiate(bytes).then(({ instance }) => {
      const run = () => { document.getElementById('o').textContent = instance.exports.add(+document.getElementById('a').value | 0, +document.getElementById('b').value | 0); };
      document.getElementById('a').oninput = run; document.getElementById('b').oninput = run;
      run();
    });
  },
}, {
  id: 'ap-fps-meter', c: 'api', lv: 2,
  t: '描画の速さを測る（FPS）', y: 'びょうがのはやさをはかるえふぴーえす',
  tags: ['requestAnimationFrame', 'FPS', '性能', '計測'],
  d: 'requestAnimationFrame が呼ばれる間隔から、1秒あたりの描画回数（FPS）を求めてグラフにする。「重さ」を上げて1フレームごとに無駄な計算をさせると、FPS が下がる様子が見える。',
  html: `<div class="hud"><b id="fps">--</b> FPS</div><canvas id="c" width="480" height="140"></canvas><label>重さ <input type="range" id="w" min="0" max="40" value="0"> <span id="wv">0 ms</span></label><div class="ball" id="ball"></div>`,
  css: `body { display: grid; place-content: center; justify-items: center; gap: 8px; background: #0f1218; color: #cde; } .hud { font: 14px ui-monospace, monospace; } .hud b { font-size: 40px; color: #6dff8f; } canvas { width: min(92vw, 480px); background: #161b24; border-radius: 8px; } .ball { width: 24px; height: 24px; border-radius: 50%; background: #ffd166; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d'), hist = [];
    let last = performance.now(), acc = 0, frames = 0, pos = 0;
    document.getElementById('w').oninput = (e) => { document.getElementById('wv').textContent = e.target.value + ' ms'; };
    (function loop(now) {
      const busy = +document.getElementById('w').value, t0 = performance.now();
      while (performance.now() - t0 < busy) { /* わざと重くする */ }
      const dt = now - last; last = now; acc += dt; frames++;
      hist.push(1000 / dt); if (hist.length > 240) hist.shift();
      if (acc > 500) { document.getElementById('fps').textContent = Math.round((frames * 1000) / acc); acc = 0; frames = 0; }
      x.clearRect(0, 0, 480, 140); x.strokeStyle = '#ffffff22'; x.beginPath(); x.moveTo(0, 140 - 60 * 2); x.lineTo(480, 140 - 60 * 2); x.stroke();
      x.strokeStyle = '#6dff8f'; x.beginPath(); hist.forEach((f, i) => (i ? x.lineTo(i * 2, 140 - Math.min(70, f) * 2) : x.moveTo(0, 140 - Math.min(70, f) * 2))); x.stroke();
      pos = (pos + dt * 0.2) % 300; document.getElementById('ball').style.translate = `${pos - 150}px 0`;
      requestAnimationFrame(loop);
    })(last);
  },
}, {
  id: 'ap-print-styles', c: 'api', lv: 1,
  t: '印刷するときだけの見た目', y: 'いんさつするときだけのみため',
  tags: ['@media print', '印刷', 'window.print', 'ページ区切り'],
  d: '@media print の中に書いた CSS は印刷するときだけ効く。ボタンや背景色を消し、リンクの後ろに URL を書き足し、章ごとに改ページする。「印刷」を押すと印刷の確認画面で確かめられる。',
  html: `<article><button id="p" class="no-print">印刷する</button><h1>旅のしおり</h1><p>集合は朝8時、<a href="https://example.com/map">駅前の地図</a>を見てください。</p><h2>持ち物</h2><ul><li>水筒</li><li>雨具</li></ul><h2 class="page">2日目</h2><p>2日目の予定は新しいページから印刷されます。</p></article>`,
  css: `body { padding: 16px; background: #eef4ee; } article { max-width: 36em; background: #fff; padding: 16px 24px; border-radius: 12px; } @media print { body { background: none; padding: 0; } article { box-shadow: none; padding: 0; } .no-print { display: none; } a::after { content: "（" attr(href) "）"; font-size: .8em; color: #555; } .page { break-before: page; } h1 { border-bottom: 2px solid #000; } }`,
  js() {
    document.getElementById('p').onclick = () => window.print();
  },
}, {
  id: 'ap-selection-toolbar', c: 'api', lv: 2,
  t: '選んだ文字の上に出る道具', y: 'えらんだもじのうえにでるどうぐ',
  tags: ['Selection', 'Range', 'selectionchange', 'ツールバー'],
  d: '文章の一部をなぞって選ぶと、selectionchange で選択範囲を受け取り、その範囲の位置に小さな道具を浮かべる。選んだ文字数を出し、コピーや強調ができる。',
  html: `<article id="art"><p>ブラウザには、文章のどこが選ばれているかを調べる仕組みがあります。この段落の一部をなぞってみてください。選んだ範囲の真上に、小さな道具が現れます。</p><p>強調を押すと、選んだ部分に印が付きます。コピーを押すと、選んだ文字がクリップボードに入ります。</p></article><div class="tb" id="tb" hidden><span id="n"></span><button id="cp">コピー</button><button id="mk">強調</button></div>`,
  css: `body { padding: 20px; background: #fbfaf6; line-height: 2; } article { max-width: 34em; font-size: 16px; } .tb { position: fixed; display: flex; gap: 4px; align-items: center; padding: 4px 6px; border-radius: 8px; background: #222; color: #fff; font-size: 12px; translate: -50% -110%; } .tb button { background: #444; color: #fff; border: 0; padding: 3px 8px; } mark { background: #ffe066; }`,
  js() {
    const tb = document.getElementById('tb'), art = document.getElementById('art');
    let range = null;
    document.addEventListener('selectionchange', () => {
      const sel = getSelection();
      if (!sel.rangeCount || sel.isCollapsed || !art.contains(sel.anchorNode)) { tb.hidden = true; return; }
      range = sel.getRangeAt(0);
      const r = range.getBoundingClientRect();
      tb.style.left = r.left + r.width / 2 + 'px'; tb.style.top = r.top + 'px'; tb.hidden = false;
      document.getElementById('n').textContent = `${[...sel.toString()].length} 文字`;
    });
    document.getElementById('cp').onmousedown = (e) => e.preventDefault();
    document.getElementById('mk').onmousedown = (e) => e.preventDefault();
    document.getElementById('cp').onclick = async () => { try { await navigator.clipboard.writeText(range.toString()); document.getElementById('n').textContent = 'コピーしました'; } catch { document.getElementById('n').textContent = 'コピーできません'; } };
    document.getElementById('mk').onclick = () => { const m = document.createElement('mark'); m.append(range.extractContents()); range.insertNode(m); getSelection().removeAllRanges(); tb.hidden = true; };
  },
}, {
  id: 'ap-mini-editor', c: 'api', lv: 3,
  t: '書式を付けられる小さな編集欄', y: 'しょしきをつけられるちいさなへんしゅうらん',
  tags: ['contenteditable', 'Range', 'エディタ', '書式'],
  d: 'contenteditable を付けた要素は、その場で文字を書き換えられる。選んだ範囲を Range で取り出して strong や em で包むと、太字・斜体・強調のボタンが作れる。書いた結果の HTML も下に出す。',
  html: `<div class="bar"><button data-tag="strong"><b>太字</b></button><button data-tag="em"><i>斜体</i></button><button data-tag="mark">強調</button><button data-tag="">書式を外す</button></div><div class="ed" id="ed" contenteditable="true" aria-label="編集欄">ここに文章を書いて、一部を選んでからボタンを押してください。</div><pre id="html"></pre>`,
  css: `body { padding: 12px; background: #f3f4f7; } .bar { display: flex; gap: 4px; } .ed { margin: 6px 0; min-height: 100px; background: #fff; border: 1px solid #ccd; border-radius: 8px; padding: 10px; line-height: 1.8; } .ed:focus { outline: 2px solid #26407c; } pre { font-size: 12px; white-space: pre-wrap; word-break: break-all; background: #fff; padding: 8px; border-radius: 6px; } mark { background: #ffe066; }`,
  js() {
    const ed = document.getElementById('ed');
    const show = () => { document.getElementById('html').textContent = ed.innerHTML; };
    document.querySelector('.bar').addEventListener('mousedown', (e) => e.preventDefault());
    document.querySelector('.bar').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const sel = getSelection(); if (!sel.rangeCount || sel.isCollapsed || !ed.contains(sel.anchorNode)) return;
      const r = sel.getRangeAt(0), frag = r.extractContents();
      if (b.dataset.tag) { const el = document.createElement(b.dataset.tag); el.append(frag); r.insertNode(el); }
      else r.insertNode(document.createTextNode(frag.textContent));
      ed.normalize(); show();
    });
    ed.addEventListener('input', show);
    show();
  },
}, {
  id: 'ap-eyedropper', c: 'api', lv: 2, so: 1, nt: 1,
  t: '画面のどこでも色を拾う', y: 'がめんのどこでもいろをひろう',
  tags: ['EyeDropper', 'スポイト', '色', 'デザイン'],
  d: 'EyeDropper API を使うと、ブラウザの外も含めた画面のどこからでもスポイトで色を拾える。拾った色は一覧に並べ、押すとコピーする。対応していない環境ではそう表示する。',
  html: `<button id="go">スポイトで色を拾う</button><p id="msg"></p><div class="list" id="list"></div>`,
  css: `body { display: grid; place-content: center; justify-items: center; gap: 8px; background: linear-gradient(90deg, #ff5e7e, #ffcf5c, #5ce1e6, #9b7bff); } .list { display: flex; gap: 6px; flex-wrap: wrap; } .list button { width: 70px; height: 70px; border-radius: 12px; border: 2px solid #fff; font: 10px ui-monospace, monospace; color: #fff; text-shadow: 0 1px 2px #000; } #msg { background: #fffc; padding: 4px 8px; border-radius: 6px; }`,
  js() {
    const msg = document.getElementById('msg');
    if (!('EyeDropper' in window)) { msg.textContent = 'この環境は EyeDropper に未対応です（Chrome や Edge で使えます）'; document.getElementById('go').disabled = true; }
    document.getElementById('go').onclick = async () => {
      try {
        const { sRGBHex } = await new EyeDropper().open();
        const b = document.createElement('button'); b.style.background = sRGBHex; b.textContent = sRGBHex;
        b.onclick = () => navigator.clipboard.writeText(sRGBHex).then(() => { msg.textContent = `${sRGBHex} をコピーしました`; });
        document.getElementById('list').prepend(b);
      } catch (e) { msg.textContent = 'やめました'; }
    };
  },
}, {
  id: 'ap-pointer-lock', c: 'api', lv: 3,
  t: 'マウスを閉じ込めて見回す', y: 'まうすをとじこめてみまわす',
  tags: ['Pointer Lock', 'movementX', '3D', 'FPS視点'],
  d: '画面を押すとマウスの矢印が消えて画面に閉じ込められ、端に着いても止まらずに動いた量（movementX・Y）だけが届く。その量で立方体の部屋を見回す。Esc で解除する。',
  html: `<div class="view" id="view"><div class="room" id="room"><div class="w" style="--t:rotateY(0deg) translateZ(-300px)">北</div><div class="w" style="--t:rotateY(90deg) translateZ(-300px)">東</div><div class="w" style="--t:rotateY(180deg) translateZ(-300px)">南</div><div class="w" style="--t:rotateY(-90deg) translateZ(-300px)">西</div><div class="w f" style="--t:rotateX(90deg) translateZ(-300px)">床</div><div class="w f" style="--t:rotateX(-90deg) translateZ(-300px)">天井</div></div><p id="hint">押すと見回せます（Esc で解除）</p></div>`,
  css: `body { overflow: hidden; background: #000; } .view { position: fixed; inset: 0; perspective: 400px; display: grid; place-items: center; cursor: pointer; } .room { position: relative; width: 600px; height: 600px; transform-style: preserve-3d; } .w { position: absolute; inset: 0; display: grid; place-items: center; font: 900 120px serif; color: #fff8; transform: var(--t); background: repeating-linear-gradient(90deg, #2b3a67 0 60px, #24325a 0 120px); border: 2px solid #fff3; } .w.f { background: repeating-conic-gradient(#3b2a1e 0 25%, #4a3627 0 50%) 0 0 / 120px 120px; } p { position: fixed; bottom: 10px; width: 100%; text-align: center; color: #fff; margin: 0; }`,
  js() {
    const view = document.getElementById('view'), room = document.getElementById('room');
    let yaw = 0, pitch = 0;
    const apply = () => { room.style.transform = `rotateX(${pitch}deg) rotateY(${yaw}deg)`; };
    view.addEventListener('click', () => view.requestPointerLock?.());
    document.addEventListener('pointerlockchange', () => { document.getElementById('hint').textContent = document.pointerLockElement ? 'マウスを動かして見回す（Esc で解除）' : '押すと見回せます（Esc で解除）'; });
    document.addEventListener('mousemove', (e) => { if (document.pointerLockElement !== view) return; yaw += e.movementX * 0.15; pitch = Math.max(-80, Math.min(80, pitch - e.movementY * 0.15)); apply(); });
    apply();
    if (window.THUMB) setInterval(() => { yaw += 1; apply(); }, 30);
  },
}, {
  id: 'ap-abort-controller', c: 'api', lv: 2,
  t: '途中で止められる処理', y: 'とちゅうでとめられるしょり',
  tags: ['AbortController', 'Promise', '取り消し', 'タイムアウト'],
  d: '時間のかかる処理に AbortController の signal を渡しておくと、「やめる」ボタンからいつでも止められる。fetch も同じ仕組みで止められる。AbortSignal.timeout で時間切れにもできる。',
  html: `<div class="bar"><button id="go">読み込み開始（10秒）</button><button id="stop" disabled>やめる</button><label><input type="checkbox" id="to"> 3秒で時間切れにする</label></div><progress id="p" max="100" value="0"></progress><p id="o"></p>`,
  css: `body { display: grid; place-content: center; gap: 10px; background: #f0f3f6; } .bar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; } progress { width: min(80vw, 420px); height: 16px; } p { font-weight: 700; }`,
  js() {
    let ctl = null;
    function fakeDownload(signal, onProgress) {
      return new Promise((ok, ng) => {
        let p = 0;
        const timer = setInterval(() => { p += 1; onProgress(p); if (p >= 100) { clearInterval(timer); ok('読み込み完了'); } }, 100);
        signal.addEventListener('abort', () => { clearInterval(timer); ng(signal.reason); }, { once: true });
      });
    }
    document.getElementById('go').onclick = async () => {
      ctl = new AbortController();
      const signal = document.getElementById('to').checked ? AbortSignal.any([ctl.signal, AbortSignal.timeout(3000)]) : ctl.signal;
      document.getElementById('stop').disabled = false; document.getElementById('o').textContent = '読み込み中…';
      try { document.getElementById('o').textContent = await fakeDownload(signal, (v) => { document.getElementById('p').value = v; }); }
      catch (e) { document.getElementById('o').textContent = e.name === 'TimeoutError' ? '時間切れで止まりました' : '途中でやめました'; }
      document.getElementById('stop').disabled = true;
    };
    document.getElementById('stop').onclick = () => ctl && ctl.abort();
  },
}, {
  id: 'ap-fetch-local', c: 'api', lv: 2,
  t: 'fetchでデータを受け取る', y: 'ふぇっちででーたをうけとる',
  tags: ['fetch', 'Response', 'Blob', 'JSON'],
  d: 'fetch は URL からデータを受け取る標準の道具。ここではネットに出ず、その場で作った Blob の URL と data: URL を fetch して、JSON・文字・バイト数の3通りで受け取る。使い方は本物のサーバーからでも同じ。',
  html: `<div class="bar"><button id="j">JSONとして受け取る</button><button id="t">文字として受け取る</button><button id="d">data: URL を受け取る</button></div><pre id="o"></pre>`,
  css: `body { padding: 12px; background: #f4f5f1; } .bar { display: flex; flex-wrap: wrap; gap: 6px; } pre { background: #fff; padding: 10px; border-radius: 8px; font-size: 13px; white-space: pre-wrap; }`,
  js() {
    const o = document.getElementById('o');
    const data = { 図鑑: '出来る', 項目: ['光', '音', '動き'], 更新: new Date().toISOString() };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
    document.getElementById('j').onclick = async () => { const res = await fetch(url); const json = await res.json(); o.textContent = `状態 ${res.status} ・ 種類 ${res.headers.get('content-type')}\n` + JSON.stringify(json, null, 2); };
    document.getElementById('t').onclick = async () => { const res = await fetch(url); const text = await res.text(); o.textContent = `文字として ${text.length} 文字:\n${text}`; };
    document.getElementById('d').onclick = async () => { const res = await fetch('data:text/plain;charset=utf-8,' + encodeURIComponent('data: URL の中身も fetch で読めます')); const buf = await res.arrayBuffer(); o.textContent = `${buf.byteLength} バイト: ${new TextDecoder().decode(buf)}`; };
    document.getElementById('j').click();
  },
}, {
  id: 'ap-proxy-reactive', c: 'api', lv: 3,
  t: 'Proxyで作る小さなリアクティブ', y: 'ぷろきしでつくるちいさなりあくてぃぶ',
  tags: ['Proxy', 'データバインディング', 'リアクティブ', 'フレームワークの仕組み'],
  d: 'データを Proxy で包み、値が書き換えられたら画面の対応する所を自動で書き換える。data-bind 属性で結ぶだけで、入力欄と表示がつながる。人気のフレームワークの心臓部と同じ考え方を20行ほどで作る。',
  p: 'Proxy の set の罠（トラップ）で「値が変わった」ことを知り、その値を使っている要素だけを更新する。',
  html: `<div class="box"><label>名前 <input data-model="name"></label><label>年齢 <input type="number" data-model="age"></label><p>こんにちは、<b data-bind="name"></b> さん。来年は <b data-bind="next"></b> 歳ですね。</p><button id="old">1つ年をとる</button></div>`,
  css: `body { display: grid; place-items: center; background: #f2f5f0; } .box { display: grid; gap: 8px; background: #fff; padding: 18px; border-radius: 14px; box-shadow: 0 2px 10px #0001; } label { display: flex; gap: 8px; align-items: center; } b { color: #c23b22; }`,
  js() {
    function reactive(obj, computed) {
      const update = () => {
        const all = { ...obj, ...Object.fromEntries(Object.entries(computed).map(([k, f]) => [k, f(obj)])) };
        document.querySelectorAll('[data-bind]').forEach((el) => { el.textContent = all[el.dataset.bind]; });
        document.querySelectorAll('[data-model]').forEach((el) => { if (el !== document.activeElement) el.value = obj[el.dataset.model]; });
      };
      const state = new Proxy(obj, { set(t, k, v) { t[k] = v; update(); return true; } });
      document.querySelectorAll('[data-model]').forEach((el) => el.addEventListener('input', () => { state[el.dataset.model] = el.type === 'number' ? +el.value : el.value; }));
      update();
      return state;
    }
    const state = reactive({ name: '出来る太郎', age: 20 }, { next: (s) => s.age + 1 });
    document.getElementById('old').onclick = () => { state.age++; };
    if (window.THUMB) setInterval(() => { state.age++; }, 700);
  },
}, {
  id: 'ap-hash-router', c: 'api', lv: 2,
  t: 'ページを読み込み直さない画面切り替え', y: 'ぺーじをよみこみなおさないがめんきりかえ',
  tags: ['ルーター', 'hashchange', 'SPA', '履歴'],
  d: 'URL の # 以降（ハッシュ）が変わったら hashchange で受け取り、対応する画面を描き直す。ページ全体を読み込み直さずに画面が切り替わり、ブラウザの戻るボタンも効く。いわゆるシングルページアプリの仕組み。',
  html: `<nav><a href="#/">ホーム</a><a href="#/items">一覧</a><a href="#/items/3">3番の詳細</a><a href="#/about">このアプリ</a></nav><main id="view"></main>`,
  css: `body { background: #f5f3ee; } nav { display: flex; gap: 6px; padding: 10px; background: #26407c; } nav a { color: #fff; padding: 4px 10px; border-radius: 6px; text-decoration: none; } nav a.on { background: #fff3; } main { padding: 16px; } main h2 { margin-top: 0; }`,
  js() {
    const routes = [
      [/^\/$/, () => '<h2>ホーム</h2><p>上の項目を押すと、ページを読み込み直さずに画面が変わります。</p>'],
      [/^\/items$/, () => '<h2>一覧</h2><ul>' + [1, 2, 3, 4, 5].map((n) => `<li><a href="#/items/${n}">項目 ${n}</a></li>`).join('') + '</ul>'],
      [/^\/items\/(\d+)$/, (id) => `<h2>項目 ${id} の詳細</h2><p>URL の中の番号 ${id} を取り出して表示しています。</p><a href="#/items">一覧へ戻る</a>`],
      [/^\/about$/, () => '<h2>このアプリ</h2><p>hashchange イベントと正規表現だけで作った、小さなルーターです。</p>'],
    ];
    function render() {
      const path = location.hash.slice(1) || '/';
      const hit = routes.find(([re]) => re.test(path));
      document.getElementById('view').innerHTML = hit ? hit[1](...path.match(hit[0]).slice(1)) : '<h2>見つかりません</h2>';
      document.querySelectorAll('nav a').forEach((a) => a.classList.toggle('on', a.getAttribute('href') === '#' + path));
    }
    addEventListener('hashchange', render);
    render();
    if (window.THUMB) { const ps = ['#/', '#/items', '#/items/3', '#/about']; let i = 0; setInterval(() => { location.hash = ps[++i % 4]; }, 1100); }
  },
});
