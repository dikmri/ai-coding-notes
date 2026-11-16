/* 入力・フォーム */
dekiru.add({
  id: 'fm-validation', c: 'form', lv: 2,
  t: '入力チェック', y: 'にゅうりょくちぇっく',
  tags: [':user-invalid', 'required', 'pattern', 'setCustomValidity'],
  d: 'required・type="email"・pattern などの属性だけでブラウザが入力を確かめる。:user-invalid を使うと、まだ触っていない欄はいきなり赤くならず、触った後で間違っていたときだけ知らせる。',
  p: ':invalid は表示した瞬間から当てはまるが、:user-invalid は利用者が操作してからでないと当てはまらない。',
  html: `
    <form id="f" novalidate>
      <label>お名前 <input name="name" required autocomplete="name"></label>
      <label>メール <input name="mail" type="email" required autocomplete="email"></label>
      <label>郵便番号 <input name="zip" pattern="\\d{3}-\\d{4}" placeholder="123-4567" inputmode="numeric" autocomplete="postal-code"></label>
      <label>合言葉（「ひらけごま」） <input name="word" id="word" required></label>
      <button>送る</button>
      <p id="msg" role="status"></p>
    </form>`,
  css: `
    body { display: grid; place-items: center; background: #f2f4f7; }
    form { display: grid; gap: 10px; width: min(380px, 92vw); background: #fff; padding: 20px; border-radius: 14px; box-shadow: 0 2px 10px #0001; }
    label { display: grid; gap: 4px; font-size: 13px; color: #444; }
    input { font-size: 15px; }
    input:user-invalid { border-color: #c23b22; background: #fff4f2; }
    input:user-valid { border-color: #2f855a; }
    label:has(input:user-invalid)::after { content: attr(data-err); color: #c23b22; font-size: 12px; }
    #msg { margin: 0; min-height: 1.4em; font-weight: 700; }`,
  js() {
    const f = document.getElementById('f'), word = document.getElementById('word');
    const update = (inp) => { inp.parentElement.dataset.err = inp.validationMessage; };
    word.addEventListener('input', () => { word.setCustomValidity(word.value && word.value !== 'ひらけごま' ? '合言葉が違います' : ''); });
    f.addEventListener('input', (e) => update(e.target));
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      [...f.elements].forEach((el) => el.tagName === 'INPUT' && update(el));
      const ok = f.checkValidity();
      document.getElementById('msg').textContent = ok ? '送信できる状態です' : '赤い欄を直してください';
      if (!ok) f.querySelector(':invalid').focus();
    });
  },
}, {
  id: 'fm-password-strength', c: 'form', lv: 2,
  t: 'パスワードの強さ', y: 'ぱすわーどのつよさ',
  tags: ['パスワード', 'meter', '表示切り替え', 'セキュリティ'],
  d: '長さ・大文字・小文字・数字・記号を調べて強さを5段階で表し、満たした条件に印を付ける。目のボタンで伏せ字と表示を切り替える。',
  html: `
    <div class="box">
      <label for="pw">パスワード</label>
      <div class="row"><input id="pw" type="password" autocomplete="new-password" aria-describedby="rules"><button id="eye" type="button" aria-pressed="false" aria-label="パスワードを表示">表示</button></div>
      <meter id="m" min="0" max="5" low="2" high="4" optimum="5" value="0"></meter>
      <ul id="rules"></ul>
    </div>`,
  css: `
    body { display: grid; place-items: center; background: #eef0f5; }
    .box { width: min(360px, 92vw); display: grid; gap: 8px; background: #fff; padding: 18px; border-radius: 14px; }
    .row { display: flex; gap: 6px; } input { flex: 1; font-size: 16px; }
    meter { width: 100%; height: 12px; }
    ul { list-style: none; padding: 0; margin: 0; font-size: 13px; display: grid; gap: 3px; }
    li::before { content: "○ "; color: #aaa; } li.ok { color: #2f855a; } li.ok::before { content: "● "; color: #2f855a; }`,
  js() {
    const pw = document.getElementById('pw'), eye = document.getElementById('eye');
    const rules = [['12文字以上', (s) => [...s].length >= 12], ['小文字の英字', (s) => /[a-z]/.test(s)], ['大文字の英字', (s) => /[A-Z]/.test(s)], ['数字', (s) => /\d/.test(s)], ['記号', (s) => /[^A-Za-z0-9]/.test(s)]];
    const ul = document.getElementById('rules');
    ul.innerHTML = rules.map(([t]) => `<li>${t}</li>`).join('');
    pw.addEventListener('input', () => {
      let n = 0;
      rules.forEach(([, f], i) => { const ok = f(pw.value); ul.children[i].classList.toggle('ok', ok); if (ok) n++; });
      document.getElementById('m').value = n;
    });
    eye.onclick = () => { const show = pw.type === 'password'; pw.type = show ? 'text' : 'password'; eye.setAttribute('aria-pressed', show); eye.textContent = show ? '隠す' : '表示'; };
    if (window.THUMB) { const s = 'Dekiru!2026html'; let i = 0; setInterval(() => { pw.value = s.slice(0, (i++ % (s.length + 4))); pw.dispatchEvent(new Event('input')); }, 200); }
  },
}, {
  id: 'fm-datalist', c: 'form', lv: 1,
  t: '入力の候補（datalist）', y: 'にゅうりょくのこうほでーたりすと',
  tags: ['datalist', '入力補完', '都道府県', 'オートコンプリート'],
  d: 'input に list 属性で datalist を結ぶだけで、打ち始めると候補が出る。候補にない値も自由に入れられるのが select との違い。47都道府県を候補にした。',
  html: `<label>都道府県 <input list="pref" id="p" placeholder="例: 北海道"></label><datalist id="pref"></datalist><p id="o"></p>`,
  css: `body { display: grid; place-content: center; gap: 8px; background: #f5f3ee; } label { display: grid; gap: 6px; font-size: 14px; } input { font-size: 18px; width: 16em; } p { margin: 0; color: #555; }`,
  js() {
    const prefs = '北海道 青森県 岩手県 宮城県 秋田県 山形県 福島県 茨城県 栃木県 群馬県 埼玉県 千葉県 東京都 神奈川県 新潟県 富山県 石川県 福井県 山梨県 長野県 岐阜県 静岡県 愛知県 三重県 滋賀県 京都府 大阪府 兵庫県 奈良県 和歌山県 鳥取県 島根県 岡山県 広島県 山口県 徳島県 香川県 愛媛県 高知県 福岡県 佐賀県 長崎県 熊本県 大分県 宮崎県 鹿児島県 沖縄県'.split(' ');
    document.getElementById('pref').innerHTML = prefs.map((p) => `<option value="${p}">`).join('');
    const p = document.getElementById('p');
    p.addEventListener('input', () => { document.getElementById('o').textContent = prefs.includes(p.value) ? `${p.value} は ${prefs.indexOf(p.value) + 1} 番目の都道府県です` : ''; });
  },
}, {
  id: 'fm-range-styled', c: 'form', lv: 2,
  t: '見た目を変えたスライダー', y: 'みためをかえたすらいだー',
  tags: ['input range', '疑似要素', '吹き出し', 'CSS変数'],
  d: 'input type="range" のつまみと溝を疑似要素で描き直し、値に合わせて塗りの幅と吹き出しの位置を動かす。中身は本物のスライダーなので、キーボードでも動く。',
  html: `<div class="wrap"><output id="o">50</output><input type="range" id="r" min="0" max="100" value="50" aria-label="音量"></div>`,
  css: `
    body { display: grid; place-items: center; background: #1f2433; color: #fff; }
    .wrap { position: relative; width: min(420px, 86vw); padding-top: 44px; }
    input { --p: 50%; appearance: none; width: 100%; height: 10px; border-radius: 99px; margin: 0; background: linear-gradient(90deg, #ff7a59 var(--p), #3a4155 var(--p)); cursor: pointer; }
    input::-webkit-slider-thumb { appearance: none; width: 26px; height: 26px; border-radius: 50%; background: #fff; border: 5px solid #ff7a59; box-shadow: 0 2px 6px #0006; }
    input::-moz-range-thumb { width: 18px; height: 18px; border-radius: 50%; background: #fff; border: 5px solid #ff7a59; }
    input:focus-visible { outline: 3px solid #ffd166; outline-offset: 4px; }
    output { position: absolute; top: 0; left: var(--p, 50%); translate: -50% 0; padding: 3px 10px; border-radius: 8px; background: #ff7a59; font: 700 15px sans-serif; }
    output::after { content: ""; position: absolute; left: 50%; top: 100%; margin-left: -6px; border: 6px solid transparent; border-top-color: #ff7a59; }`,
  js() {
    const r = document.getElementById('r'), o = document.getElementById('o');
    const set = () => { const p = ((r.value - r.min) / (r.max - r.min)) * 100; r.style.setProperty('--p', p + '%'); o.style.setProperty('--p', `calc(${p}% + ${13 - p * 0.26}px)`); o.textContent = r.value; };
    r.addEventListener('input', set);
    set();
    if (window.THUMB) { let t = 0; setInterval(() => { t += 0.05; r.value = 50 + Math.sin(t) * 50; set(); }, 30); }
  },
}, {
  id: 'fm-autosize', c: 'form', lv: 1,
  t: '中身に合わせて伸びる入力欄', y: 'なかみにあわせてのびるにゅうりょくらん',
  tags: ['field-sizing', 'textarea', '自動調整', 'フォーム'],
  d: 'field-sizing: content を付けた textarea は、書いた量に合わせて高さが伸び縮みする。使えないブラウザでは、scrollHeight を測って高さを合わせる JS に切り替える。',
  html: `<label for="t">感想</label><textarea id="t" placeholder="書くほど欄が伸びます">一行目
二行目</textarea><input id="i" placeholder="横にも伸びる" aria-label="横に伸びる欄">`,
  css: `body { display: grid; place-content: center; gap: 8px; background: #f7f5f0; } textarea, input { field-sizing: content; font-size: 16px; } textarea { width: min(420px, 90vw); min-height: 3lh; max-height: 12lh; resize: none; } input { min-width: 10ch; max-width: 90vw; }`,
  js() {
    if (!CSS.supports('field-sizing', 'content')) {
      const t = document.getElementById('t');
      const fit = () => { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; };
      t.addEventListener('input', fit); fit();
    }
    if (window.THUMB) { const t = document.getElementById('t'); let n = 2; setInterval(() => { n = n > 8 ? 1 : n + 1; t.value = Array.from({ length: n }, (_, i) => `${i + 1}行目`).join('\n'); t.dispatchEvent(new Event('input')); }, 500); }
  },
}, {
  id: 'fm-otp', c: 'form', lv: 2,
  t: '確認コードの6マス入力', y: 'かくにんこーどのろくますにゅうりょく',
  tags: ['ワンタイムパスワード', 'autocomplete', '貼り付け', 'フォーカス移動'],
  d: '1マスに1文字ずつ入れると次のマスへ進み、Backspace で前に戻る。6桁まとめて貼り付けると全マスに配る。autocomplete="one-time-code" で SMS のコードを候補に出せる端末もある。',
  html: `<form id="f"><p>届いた6桁のコードを入力</p><div class="cells" id="cells"></div><p id="o" role="status"></p></form>`,
  css: `body { display: grid; place-items: center; background: #eef2f6; } form { text-align: center; } .cells { display: flex; gap: 8px; justify-content: center; } .cells input { width: 48px; height: 58px; text-align: center; font: 700 26px ui-monospace, monospace; border-radius: 10px; } .cells input:focus { outline: 3px solid #26407c; } #o { font-weight: 700; color: #2f855a; min-height: 1.4em; }`,
  js() {
    const cells = document.getElementById('cells');
    const ins = Array.from({ length: 6 }, (_, i) => {
      const inp = document.createElement('input');
      Object.assign(inp, { inputMode: 'numeric', maxLength: 1, autocomplete: i ? 'off' : 'one-time-code' });
      inp.setAttribute('aria-label', `${i + 1}桁目`);
      cells.append(inp);
      return inp;
    });
    const check = () => { const v = ins.map((i) => i.value).join(''); document.getElementById('o').textContent = v.length === 6 ? `コード ${v} を確認しました` : ''; };
    ins.forEach((inp, i) => {
      inp.addEventListener('input', () => {
        const digits = inp.value.normalize('NFKC').replace(/\D/g, '');
        if (digits.length > 1) { [...digits].slice(0, 6 - i).forEach((d, k) => { ins[i + k].value = d; }); ins[Math.min(5, i + digits.length - 1)].focus(); }
        else { inp.value = digits; if (digits && ins[i + 1]) ins[i + 1].focus(); }
        check();
      });
      inp.addEventListener('keydown', (e) => { if (e.key === 'Backspace' && !inp.value && ins[i - 1]) { ins[i - 1].focus(); ins[i - 1].value = ''; e.preventDefault(); check(); } });
      inp.addEventListener('paste', (e) => { const t = e.clipboardData.getData('text').normalize('NFKC').replace(/\D/g, ''); if (t.length > 1) { e.preventDefault(); [...t].slice(0, 6).forEach((d, k) => { if (ins[k]) ins[k].value = d; }); ins[Math.min(5, t.length - 1)].focus(); check(); } });
    });
    if (window.THUMB) { let k = 0; setInterval(() => { if (k === 6) { ins.forEach((x) => { x.value = ''; }); k = 0; } else ins[k++].value = String((k * 7) % 10); check(); }, 350); }
  },
}, {
  id: 'fm-file-list', c: 'form', lv: 2,
  t: '選んだファイルの一覧', y: 'えらんだふぁいるのいちらん',
  tags: ['File API', 'input file', 'ドラッグ&ドロップ', 'サムネイル'],
  d: '複数のファイルを選ぶか落とすと、名前・大きさ・種類を一覧にし、画像なら縮小表示も出す。ファイルはどこにも送らず、ブラウザの中だけで読む。',
  html: `<label class="drop" id="drop">ファイルを選ぶ、またはここに落とす<input type="file" id="f" multiple hidden></label><ul id="list"></ul>`,
  css: `body { padding: 14px; background: #f3f1ec; } .drop { display: block; text-align: center; padding: 26px; border: 3px dashed #b9b2a3; border-radius: 14px; color: #666; cursor: pointer; } .drop.over { border-color: #e0532f; background: #fff2ee; } ul { list-style: none; padding: 0; display: grid; gap: 6px; } li { display: flex; gap: 10px; align-items: center; background: #fff; padding: 8px; border-radius: 10px; font-size: 13px; } li img, li .ic { width: 44px; height: 44px; object-fit: cover; border-radius: 6px; background: #e8e3d8; display: grid; place-items: center; font-size: 10px; } li small { color: #888; }`,
  js() {
    const list = document.getElementById('list'), drop = document.getElementById('drop');
    const size = (b) => new Intl.NumberFormat('ja-JP', { style: 'unit', unit: b > 1e6 ? 'megabyte' : 'kilobyte', maximumFractionDigits: 1 }).format(b > 1e6 ? b / 1e6 : b / 1e3);
    function show(files) {
      for (const f of files) {
        const li = document.createElement('li');
        const thumb = f.type.startsWith('image/') ? `<img alt="" src="${URL.createObjectURL(f)}">` : `<span class="ic">${(f.name.split('.').pop() || '?').toUpperCase()}</span>`;
        li.innerHTML = `${thumb}<div><div class="n"></div><small>${size(f.size)} ・ ${f.type || '種類不明'} ・ ${new Date(f.lastModified).toLocaleDateString('ja-JP')}</small></div>`;
        li.querySelector('.n').textContent = f.name;
        list.prepend(li);
      }
    }
    document.getElementById('f').addEventListener('change', (e) => show(e.target.files));
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); show(e.dataTransfer.files); });
    show([new File(['こんにちは'], '見本のメモ.txt', { type: 'text/plain' }), new File([new Uint8Array(250000)], '大きなデータ.bin', { type: 'application/octet-stream' })]);
  },
}, {
  id: 'fm-multistep', c: 'form', lv: 2,
  t: '段階に分けたフォーム', y: 'だんかいにわけたふぉーむ',
  tags: ['多段階', 'fieldset', '入力チェック', 'FormData'],
  d: '長いフォームを3つの段階に分け、今の段階の入力が正しいときだけ次へ進める。最後に全部の入力を FormData でまとめて確認画面に出す。',
  html: `
    <form id="f">
      <ol class="dots"><li></li><li></li><li></li></ol>
      <fieldset><legend>1. お名前</legend><label>名前 <input name="名前" required></label></fieldset>
      <fieldset hidden><legend>2. 連絡先</legend><label>メール <input name="メール" type="email" required></label></fieldset>
      <fieldset hidden><legend>3. 好きな技術</legend><label><input type="radio" name="技術" value="HTML" required> HTML</label><label><input type="radio" name="技術" value="CSS"> CSS</label><label><input type="radio" name="技術" value="JavaScript"> JavaScript</label></fieldset>
      <div class="bar"><button type="button" id="back">戻る</button><button id="next">次へ</button></div>
      <pre id="out"></pre>
    </form>`,
  css: `
    body { display: grid; place-items: center; background: #f0f3f1; }
    form { width: min(380px, 92vw); background: #fff; padding: 18px; border-radius: 14px; display: grid; gap: 10px; }
    fieldset { border: 0; padding: 0; display: grid; gap: 8px; } legend { font-weight: 800; font-size: 18px; margin-bottom: 6px; }
    .dots { list-style: none; display: flex; gap: 6px; padding: 0; margin: 0; } .dots li { flex: 1; height: 5px; border-radius: 3px; background: #ddd; } .dots li.on { background: #2f855a; }
    .bar { display: flex; justify-content: space-between; } pre { margin: 0; font-size: 13px; background: #f6f6f6; padding: 8px; border-radius: 8px; white-space: pre-wrap; }
    pre:empty { display: none; }`,
  js() {
    const f = document.getElementById('f'), sets = [...f.querySelectorAll('fieldset')], dots = [...f.querySelectorAll('.dots li')];
    let at = 0;
    const show = () => { sets.forEach((s, i) => { s.hidden = i !== at; }); dots.forEach((d, i) => d.classList.toggle('on', i <= at)); document.getElementById('back').disabled = at === 0; document.getElementById('next').textContent = at === sets.length - 1 ? '確認する' : '次へ'; };
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const cur = sets[at];
      const bad = [...cur.querySelectorAll('input')].find((i) => !i.checkValidity());
      if (bad) { bad.reportValidity(); return; }
      if (at < sets.length - 1) { at++; show(); sets[at].querySelector('input').focus(); }
      else document.getElementById('out').textContent = JSON.stringify(Object.fromEntries(new FormData(f)), null, 2);
    });
    document.getElementById('back').onclick = () => { at = Math.max(0, at - 1); show(); };
    show();
  },
}, {
  id: 'fm-input-mask', c: 'form', lv: 2,
  t: '電話番号やカード番号の自動整形', y: 'でんわばんごうやかーどばんごうのじどうせいけい',
  tags: ['入力整形', '全角数字', '郵便番号', 'inputmode'],
  d: '打った数字を、電話番号は「090-1234-5678」、郵便番号は「123-4567」、カード番号は4桁ごとに区切って整える。全角の数字で打っても半角に直す。',
  p: 'normalize("NFKC") を通すと、全角の「１２３」が半角の「123」になる。',
  html: `
    <form class="f">
      <label>電話番号 <input id="tel" inputmode="tel" autocomplete="tel" placeholder="09012345678"></label>
      <label>郵便番号 <input id="zip" inputmode="numeric" autocomplete="postal-code" placeholder="1234567"></label>
      <label>カード番号（見本） <input id="card" inputmode="numeric" placeholder="1234 5678 9012 3456"></label>
    </form>`,
  css: `body { display: grid; place-items: center; background: #f4f2ee; } .f { display: grid; gap: 12px; width: min(340px, 90vw); } label { display: grid; gap: 4px; font-size: 13px; } input { font: 18px ui-monospace, monospace; letter-spacing: .05em; }`,
  js() {
    const digits = (s) => s.normalize('NFKC').replace(/\D/g, '');
    const fmt = {
      tel: (d) => { d = d.slice(0, 11); if (/^0[5789]0/.test(d)) return [d.slice(0, 3), d.slice(3, 7), d.slice(7)].filter(Boolean).join('-'); if (/^0[36]/.test(d)) return [d.slice(0, 2), d.slice(2, 6), d.slice(6, 10)].filter(Boolean).join('-'); return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 10)].filter(Boolean).join('-'); },
      zip: (d) => [d.slice(0, 3), d.slice(3, 7)].filter(Boolean).join('-'),
      card: (d) => d.slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 '),
    };
    for (const id of Object.keys(fmt)) {
      const el = document.getElementById(id);
      el.addEventListener('input', () => { el.value = fmt[id](digits(el.value)); });
    }
    if (window.THUMB) { const s = '０９０１２３４５６７８'; let i = 0; setInterval(() => { const t = document.getElementById('tel'); t.value = s.slice(0, (i++ % 12)); t.dispatchEvent(new Event('input')); }, 250); }
  },
}, {
  id: 'fm-char-count', c: 'form', lv: 1,
  t: '文字数と原稿用紙の枚数', y: 'もじすうとげんこうようしのまいすう',
  tags: ['文字数', '原稿用紙', 'Intl.Segmenter', '上限'],
  d: '書いた文字数・残りの文字数・400字詰め原稿用紙に換算した枚数を、打つたびに数え直す。絵文字や結合文字も1文字と数えるため Intl.Segmenter を使う。',
  html: `<label for="t">作文（上限 200 文字）</label><textarea id="t" rows="6" aria-describedby="c">ブラウザだけで作文の文字数を数えます。</textarea><div class="c" id="c" aria-live="polite"><span id="n"></span><span id="sheet"></span></div><div class="bar"><i id="bar"></i></div>`,
  css: `body { display: grid; place-content: center; gap: 6px; background: #fbf8f1; } textarea { width: min(460px, 92vw); font-size: 16px; } .c { display: flex; justify-content: space-between; font-size: 13px; } .over { color: #c23b22; font-weight: 700; } .bar { height: 6px; background: #e8e2d4; border-radius: 3px; overflow: hidden; } .bar i { display: block; height: 100%; background: #2f855a; transition: width .2s; } .bar i.warn { background: #f0a43a; } .bar i.over { background: #c23b22; }`,
  js() {
    const t = document.getElementById('t'), max = 200, seg = new Intl.Segmenter('ja', { granularity: 'grapheme' });
    function count() {
      const n = [...seg.segment(t.value.replace(/\n/g, ''))].length;
      const nEl = document.getElementById('n'), bar = document.getElementById('bar');
      nEl.textContent = n <= max ? `${n} 文字（あと ${max - n} 文字）` : `${n} 文字（${n - max} 文字オーバー）`;
      nEl.className = n > max ? 'over' : '';
      document.getElementById('sheet').textContent = `原稿用紙 ${(n / 400).toFixed(2)} 枚`;
      bar.style.width = Math.min(100, (n / max) * 100) + '%';
      bar.className = n > max ? 'over' : n > max * 0.8 ? 'warn' : '';
    }
    t.addEventListener('input', count);
    count();
    if (window.THUMB) setInterval(() => { t.value = t.value.length > 230 ? '' : t.value + 'あいうえお、'; count(); }, 200);
  },
}, {
  id: 'fm-json-form', c: 'form', lv: 3,
  t: 'JSONからフォームを作る', y: 'じぇいそんからふぉーむをつくる',
  tags: ['JSON', 'フォーム生成', 'FormData', '設定画面'],
  d: '項目の名前と種類を書いた JSON から、入力欄・選択肢・チェックボックスを組み立てる。左の JSON を書き換えると右のフォームがすぐに作り直される。',
  html: `<div class="wrap"><textarea id="j" spellcheck="false" aria-label="フォームの定義 JSON"></textarea><form id="f"></form></div><pre id="out"></pre>`,
  css: `body { padding: 10px; background: #f1f3f6; } .wrap { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; } textarea { font: 12px/1.5 ui-monospace, monospace; height: 60vh; } form { display: grid; gap: 8px; align-content: start; background: #fff; padding: 12px; border-radius: 10px; } label { display: grid; gap: 3px; font-size: 13px; } .ck { display: flex; gap: 6px; align-items: center; } pre { font-size: 12px; margin: 8px 0 0; } .err { color: #c23b22; }`,
  js() {
    const def = [
      { name: 'title', label: '題名', type: 'text', required: true },
      { name: 'color', label: '色', type: 'color', value: '#e0532f' },
      { name: 'size', label: '大きさ', type: 'range', min: 1, max: 10, value: 5 },
      { name: 'kind', label: '種類', type: 'select', options: ['図形', '文字', '音'] },
      { name: 'public', label: '公開する', type: 'checkbox' },
    ];
    const j = document.getElementById('j'), f = document.getElementById('f');
    j.value = JSON.stringify(def, null, 2);
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    function build() {
      let spec;
      try { spec = JSON.parse(j.value); } catch (e) { f.innerHTML = `<p class="err">JSON の書き方に誤りがあります: ${esc(e.message)}</p>`; return; }
      f.innerHTML = spec.map((s) => {
        if (s.type === 'select') return `<label>${esc(s.label)}<select name="${esc(s.name)}">${(s.options || []).map((o) => `<option>${esc(o)}</option>`).join('')}</select></label>`;
        if (s.type === 'checkbox') return `<label class="ck"><input type="checkbox" name="${esc(s.name)}"> ${esc(s.label)}</label>`;
        const attrs = ['min', 'max', 'value'].filter((k) => s[k] !== undefined).map((k) => `${k}="${esc(s[k])}"`).join(' ');
        return `<label>${esc(s.label)}<input type="${esc(s.type || 'text')}" name="${esc(s.name)}" ${attrs} ${s.required ? 'required' : ''}></label>`;
      }).join('') + '<button>送信</button>';
      show();
    }
    const show = () => { document.getElementById('out').textContent = JSON.stringify(Object.fromEntries(new FormData(f)), null, 2); };
    j.addEventListener('input', build);
    f.addEventListener('input', show);
    f.addEventListener('submit', (e) => { e.preventDefault(); show(); });
    build();
  },
}, {
  id: 'fm-color-scheme-maker', c: 'form', lv: 2,
  t: '1色から配色を作る', y: 'いっしょくからはいしょくをつくる',
  tags: ['input color', 'oklch', '配色', 'color-mix'],
  d: '色を1つ選ぶと、補色・三角形の配色・明暗の段階を作って並べる。計算は CSS の oklch と色相の足し算で行い、そのまま使える CSS 変数として書き出す。',
  p: 'oklch は人の目に感じる明るさがそろう色の表し方。色相だけ回しても明るさの印象が変わりにくい。',
  html: `<label>もとの色 <input type="color" id="c" value="#e0532f"></label><div class="rows" id="rows"></div><pre id="css"></pre>`,
  css: `body { padding: 12px; background: #f7f6f2; } .rows { display: grid; gap: 8px; margin: 10px 0; } .row { display: grid; grid-template-columns: 7em repeat(5, 1fr); gap: 4px; align-items: center; font-size: 12px; } .row i { height: 44px; border-radius: 8px; box-shadow: inset 0 0 0 1px #0001; } pre { font-size: 11px; background: #fff; padding: 8px; border-radius: 8px; white-space: pre-wrap; }`,
  js() {
    const c = document.getElementById('c'), rows = document.getElementById('rows');
    function render() {
      const base = c.value;
      const sets = {
        '明暗の段階': [95, 80, 60, 45, 30].map((l) => `oklch(from ${base} ${l}% c h)`),
        '補色': [`${base}`, `oklch(from ${base} l c calc(h + 180))`, `color-mix(in oklch, ${base}, white 60%)`, `color-mix(in oklch, oklch(from ${base} l c calc(h + 180)), white 60%)`, `color-mix(in oklch, ${base}, black 50%)`],
        '三角形': [0, 120, 240, 60, 300].map((d) => `oklch(from ${base} l c calc(h + ${d}))`),
        'くすみ': [0.02, 0.05, 0.08, 0.12, 0.16].map((ch) => `oklch(from ${base} 70% ${ch} h)`),
      };
      rows.innerHTML = Object.entries(sets).map(([k, list]) => `<div class="row"><span>${k}</span>${list.map((v) => `<i style="background:${v}" title="${v}"></i>`).join('')}</div>`).join('');
      document.getElementById('css').textContent = ':root {\n' + sets['明暗の段階'].map((v, i) => `  --c-${(i + 1) * 100}: ${v};`).join('\n') + `\n  --c-accent: ${sets['補色'][1]};\n}`;
      if (!CSS.supports('color', 'oklch(from red l c h)')) rows.insertAdjacentHTML('afterbegin', '<p>このブラウザは相対色（oklch(from …)）に対応していないため、一部の色が表示されません。</p>');
    }
    c.addEventListener('input', render);
    render();
    if (window.THUMB) { let h = 0; setInterval(() => { h = (h + 25) % 360; const t = document.createElement('canvas').getContext('2d'); t.fillStyle = `hsl(${h} 70% 50%)`; c.value = t.fillStyle; render(); }, 600); }
  },
}, {
  id: 'fm-date-wareki', c: 'form', lv: 1,
  t: '日付から和暦・曜日・日数', y: 'ひづけからわれきようびにっすう',
  tags: ['input date', '和暦', '曜日', '日数計算'],
  d: '日付を選ぶと、和暦・曜日・今日からの日数・その日の満年齢・干支を表示する。日付の欄はブラウザ標準のカレンダーが付いてくる。',
  html: `<label>日付 <input type="date" id="d" value="2000-01-01"></label><dl id="o"></dl>`,
  css: `body { display: grid; place-content: center; gap: 10px; background: #f8f4ea; } input { font-size: 18px; } dl { display: grid; grid-template-columns: auto 1fr; gap: 6px 16px; margin: 0; } dt { color: #888; font-size: 13px; } dd { margin: 0; font: 700 18px serif; }`,
  js() {
    const el = document.getElementById('d');
    function render() {
      if (!el.value) return;
      const [y, m, dd] = el.value.split('-').map(Number), d = new Date(y, m - 1, dd), now = new Date(), today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const diff = Math.round((d - today) / 86400000);
      let age = now.getFullYear() - y; if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < dd)) age--;
      const eto = '子丑寅卯辰巳午未申酉戌亥'[(((y - 4) % 12) + 12) % 12], kan = '甲乙丙丁戊己庚辛壬癸'[(((y - 4) % 10) + 10) % 10];
      const rows = [['和暦', new Intl.DateTimeFormat('ja-JP-u-ca-japanese', { era: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(d)], ['曜日', new Intl.DateTimeFormat('ja-JP', { weekday: 'long' }).format(d)], ['今日から', diff === 0 ? '今日' : diff > 0 ? `${diff} 日後` : `${-diff} 日前`], ['満年齢', age >= 0 ? `${age} 歳` : 'まだ先'], ['干支', `${kan}${eto}`]];
      document.getElementById('o').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
    }
    el.addEventListener('input', render);
    render();
  },
}, {
  id: 'fm-custom-select', c: 'form', lv: 2,
  t: '見た目を変えられるselect', y: 'みためをかえられるせれくと',
  tags: ['select', 'appearance: base-select', '選択肢', 'プログレッシブエンハンスメント'],
  d: 'appearance: base-select に対応したブラウザでは、標準の select のまま選択肢の中身に色や印を付けて自由に飾れる。対応していないブラウザでは普通の select として動く。',
  html: `
    <label for="s">好きな季節</label>
    <select id="s">
      <button><selectedcontent></selectedcontent></button>
      <option value="spring"><span class="ic" style="background:#f7a8c4"></span>春</option>
      <option value="summer"><span class="ic" style="background:#3fb7e8"></span>夏</option>
      <option value="autumn"><span class="ic" style="background:#e8833a"></span>秋</option>
      <option value="winter"><span class="ic" style="background:#8fa6c9"></span>冬</option>
    </select>
    <p id="o"></p>`,
  css: `
    body { display: grid; place-content: center; gap: 6px; background: #f4f1ea; }
    select { font-size: 16px; min-width: 200px; }
    @supports (appearance: base-select) {
      select, ::picker(select) { appearance: base-select; }
      select { border-radius: 10px; padding: 8px 12px; background: #fff; border: 2px solid #ddd5c6; }
      ::picker(select) { border: 0; border-radius: 12px; box-shadow: 0 10px 30px #0002; padding: 6px; }
      option { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-radius: 8px; }
      option:hover, option:focus { background: #f2ece0; }
      option::checkmark { content: "✓"; color: #c23b22; order: 1; margin-left: auto; }
    }
    .ic { display: inline-block; width: 14px; height: 14px; border-radius: 50%; }`,
  js() {
    const s = document.getElementById('s');
    s.addEventListener('change', () => { document.getElementById('o').textContent = `選んだ値: ${s.value}`; });
    document.getElementById('o').textContent = CSS.supports('appearance', 'base-select') ? '飾れる select に対応しています' : 'このブラウザでは普通の select として表示しています';
  },
}, {
  id: 'fm-formdata', c: 'form', lv: 2,
  t: '送る中身をのぞく（FormData）', y: 'おくるなかみをのぞくふぉーむでーた',
  tags: ['FormData', 'URLSearchParams', 'JSON', '送信'],
  d: 'フォームを送ると、実際に送られる中身を FormData で取り出し、JSON・URL のクエリ文字列・名前と値の一覧の3通りで見せる。複数選んだチェックボックスの扱いも分かる。',
  html: `
    <form id="f">
      <label>名前 <input name="name" value="出来る太郎"></label>
      <fieldset><legend>好きなもの</legend><label><input type="checkbox" name="like" value="HTML" checked> HTML</label><label><input type="checkbox" name="like" value="CSS" checked> CSS</label><label><input type="checkbox" name="like" value="JS"> JS</label></fieldset>
      <label>ひとこと <textarea name="memo">こんにちは &amp; さようなら</textarea></label>
      <button>送る（つもり）</button>
    </form>
    <div class="out"><h3>JSON</h3><pre id="a"></pre><h3>URL のクエリ</h3><pre id="b"></pre><h3>名前と値</h3><pre id="c"></pre></div>`,
  css: `body { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 12px; background: #f2f2ee; } form { display: grid; gap: 8px; align-content: start; } fieldset { display: flex; gap: 10px; } h3 { margin: 6px 0 2px; font-size: 12px; color: #888; } pre { margin: 0; font-size: 12px; background: #fff; padding: 6px; border-radius: 6px; white-space: pre-wrap; word-break: break-all; }`,
  js() {
    const f = document.getElementById('f');
    function show() {
      const fd = new FormData(f);
      const obj = {};
      for (const [k, v] of fd) obj[k] = k in obj ? [].concat(obj[k], v) : v;
      document.getElementById('a').textContent = JSON.stringify(obj, null, 2);
      document.getElementById('b').textContent = '?' + new URLSearchParams(fd).toString();
      document.getElementById('c').textContent = [...fd].map(([k, v]) => `${k} = ${v}`).join('\n');
    }
    f.addEventListener('submit', (e) => { e.preventDefault(); show(); });
    f.addEventListener('input', show);
    show();
  },
}, {
  id: 'fm-check-all', c: 'form', lv: 1,
  t: 'まとめて選ぶチェックボックス', y: 'まとめてえらぶちぇっくぼっくす',
  tags: ['チェックボックス', 'indeterminate', '一括選択', 'フォーム'],
  d: '「すべて」を押すと下のチェックが全部切り替わる。一部だけ選ばれているときは、「すべて」を中間の状態（indeterminate）で表示する。',
  html: `<fieldset><legend><label><input type="checkbox" id="all"> すべて</label></legend><label><input type="checkbox" class="it"> 新着のお知らせ</label><label><input type="checkbox" class="it" checked> 週刊のまとめ</label><label><input type="checkbox" class="it"> キャンペーン</label><label><input type="checkbox" class="it"> アンケート</label></fieldset><p id="o"></p>`,
  css: `body { display: grid; place-content: center; background: #f1f4f2; } fieldset { display: grid; gap: 8px; padding: 14px 18px; border-radius: 12px; border: 1px solid #ccd5ce; background: #fff; } legend { font-weight: 700; padding: 0 4px; } input { width: 18px; height: 18px; accent-color: #2f855a; vertical-align: -3px; } p { text-align: center; color: #555; }`,
  js() {
    const all = document.getElementById('all'), its = [...document.querySelectorAll('.it')];
    function sync() { const n = its.filter((i) => i.checked).length; all.checked = n === its.length; all.indeterminate = n > 0 && n < its.length; document.getElementById('o').textContent = `${its.length} 件中 ${n} 件を選択`; }
    all.addEventListener('change', () => { its.forEach((i) => { i.checked = all.checked; }); sync(); });
    its.forEach((i) => i.addEventListener('change', sync));
    sync();
    if (window.THUMB) { let k = 0; setInterval(() => { its[k++ % 4].click(); }, 600); }
  },
});
