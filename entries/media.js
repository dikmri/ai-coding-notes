/* カメラ・マイク・録画
 * 許可が必要な項目には perm（自己診断で飛ばす）・nt（一覧で自動起動しない）・so（同じオリジン扱い）を付ける */
dekiru.add({
  id: 'md-camera', c: 'media', lv: 1, so: 1, nt: 1, perm: 1,
  t: 'カメラを映して撮る', y: 'かめらをうつしてとる',
  tags: ['getUserMedia', 'カメラ', '撮影', 'PNG保存'],
  d: 'getUserMedia でカメラの映像を video 要素に流し、ボタンを押した瞬間の1コマを canvas に写して写真にする。撮った写真は PNG で保存できる。前後のカメラも切り替えられる。',
  p: '映像を止めるには、受け取った MediaStream の各トラックの stop() を呼ぶ。止めないとカメラの明かりが付いたままになる。',
  html: `<div class="ctl"><button id="start">カメラを起動</button><button id="shot" disabled>撮る</button><button id="flip" disabled>前後を切り替え</button><button id="stop" disabled>止める</button></div><video id="v" playsinline muted></video><div class="shots" id="shots"></div><p id="msg"></p>`,
  css: `body { display: grid; justify-items: center; align-content: start; gap: 8px; padding: 10px; background: #15171c; color: #ccc; } .ctl { display: flex; flex-wrap: wrap; gap: 6px; } video { width: min(94vw, 560px); border-radius: 12px; background: #000; transform: scaleX(-1); } .shots { display: flex; gap: 6px; flex-wrap: wrap; } .shots a img { width: 120px; border-radius: 8px; }`,
  js() {
    const v = document.getElementById('v');
    let stream = null, facing = 'user';
    const btns = (on) => ['shot', 'flip', 'stop'].forEach((id) => { document.getElementById(id).disabled = !on; });
    async function start() {
      stop();
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing }, audio: false });
        v.srcObject = stream; await v.play(); btns(true);
        document.getElementById('msg').textContent = '';
      } catch (e) { document.getElementById('msg').textContent = 'カメラを使えませんでした: ' + e.message; console.error(e); }
    }
    function stop() { if (stream) stream.getTracks().forEach((t) => t.stop()); stream = null; btns(false); }
    document.getElementById('start').onclick = start;
    document.getElementById('stop').onclick = stop;
    document.getElementById('flip').onclick = () => { facing = facing === 'user' ? 'environment' : 'user'; start(); };
    document.getElementById('shot').onclick = () => {
      const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
      const x = c.getContext('2d'); x.scale(-1, 1); x.drawImage(v, -c.width, 0);
      const a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = `photo-${Date.now()}.png`; a.title = '押すと保存';
      a.innerHTML = `<img alt="撮った写真">`; a.firstChild.src = a.href;
      document.getElementById('shots').prepend(a);
    };
  },
}, {
  id: 'md-camera-filters', c: 'media', lv: 1, so: 1, nt: 1, perm: 1,
  t: 'カメラにフィルターをかける', y: 'かめらにふぃるたーをかける',
  tags: ['カメラ', 'filter', 'getUserMedia', 'プリクラ風'],
  d: 'カメラの映像を映した video 要素に CSS の filter をかけるだけで、白黒・セピア・ネガ・色相回転・ぼかしの写りになる。画素を1つずつ計算しなくても済む。',
  html: `<button id="start">カメラを起動</button><video id="v" playsinline muted></video><div class="fs" id="fs"></div>`,
  css: `body { display: grid; justify-items: center; align-content: start; gap: 8px; padding: 10px; background: #1a1a1f; color: #ddd; } video { width: min(94vw, 560px); border-radius: 12px; background: #000; transform: scaleX(-1); transition: filter .3s; } .fs { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; }`,
  js() {
    const v = document.getElementById('v');
    const F = { そのまま: 'none', 白黒: 'grayscale(1) contrast(1.2)', セピア: 'sepia(1)', ネガ: 'invert(1)', 夢色: 'hue-rotate(160deg) saturate(2)', ぼかし: 'blur(6px)', 漫画: 'grayscale(1) contrast(3) brightness(1.2)', 夕焼け: 'sepia(.6) saturate(3) hue-rotate(-20deg)' };
    const fs = document.getElementById('fs');
    Object.entries(F).forEach(([k, f]) => { const b = document.createElement('button'); b.textContent = k; b.onclick = () => { v.style.filter = f; }; fs.append(b); });
    document.getElementById('start').onclick = async () => {
      try { v.srcObject = await navigator.mediaDevices.getUserMedia({ video: true }); await v.play(); }
      catch (e) { console.error('カメラを使えませんでした: ' + e.message); }
    };
  },
}, {
  id: 'md-camera-ascii', c: 'media', lv: 2, so: 1, nt: 1, perm: 1,
  t: 'カメラを文字の絵で映す', y: 'かめらをもじのえでうつす',
  tags: ['カメラ', 'アスキーアート', 'getImageData', 'リアルタイム'],
  d: 'カメラの1コマを小さな canvas に縮めて写し、画素の明るさを文字に置き換える。これを毎フレーム繰り返すと、自分の姿が文字でできた動画になる。',
  pipe: 'camera | ascii 100',
  html: `<button id="start">カメラを起動</button><pre id="o"></pre>`,
  css: `body { display: grid; justify-items: center; align-content: start; gap: 6px; padding: 6px; background: #000; color: #6dff8f; } pre { margin: 0; font: 8px/8px ui-monospace, Consolas, monospace; letter-spacing: 1px; }`,
  js() {
    const out = document.getElementById('o'), chars = ' .:-=+*#%@';
    const v = document.createElement('video'); v.muted = true; v.playsInline = true;
    const c = document.createElement('canvas'), x = c.getContext('2d', { willReadFrequently: true });
    document.getElementById('start').onclick = async () => {
      try { v.srcObject = await navigator.mediaDevices.getUserMedia({ video: true }); await v.play(); loop(); }
      catch (e) { out.textContent = 'カメラを使えませんでした: ' + e.message; }
    };
    function loop() {
      const cols = Math.floor(innerWidth / 6.5), rows = Math.floor(cols * (v.videoHeight / v.videoWidth) * 0.55);
      c.width = cols; c.height = rows;
      x.save(); x.scale(-1, 1); x.drawImage(v, -cols, 0, cols, rows); x.restore();
      const d = x.getImageData(0, 0, cols, rows).data;
      let s = '';
      for (let y = 0; y < rows; y++) { for (let i = 0; i < cols; i++) { const k = (y * cols + i) * 4; s += chars[Math.floor(((d[k] * 0.3 + d[k + 1] * 0.59 + d[k + 2] * 0.11) / 256) * chars.length)]; } s += '\n'; }
      out.textContent = s;
      requestAnimationFrame(loop);
    }
  },
}, {
  id: 'md-motion-detect', c: 'media', lv: 3, so: 1, nt: 1, perm: 1,
  t: '動いたところを見つける', y: 'うごいたところをみつける',
  tags: ['カメラ', '動き検出', 'フレーム差分', '防犯'],
  d: '1つ前のコマと今のコマの明るさの差を画素ごとに取り、差の大きい所だけを赤く塗る。差の合計を「動きの量」として棒で表す。手を振ると反応する。',
  pipe: 'camera | diff | heat',
  html: `<button id="start">カメラを起動</button><canvas id="c"></canvas><div class="meter"><i id="m"></i></div>`,
  css: `body { display: grid; justify-items: center; align-content: start; gap: 6px; padding: 8px; background: #111; color: #ccc; } canvas { width: min(94vw, 560px); border-radius: 10px; } .meter { width: min(94vw, 560px); height: 10px; background: #333; border-radius: 5px; overflow: hidden; } .meter i { display: block; height: 100%; width: 0; background: #ff5a3c; transition: width .1s; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d', { willReadFrequently: true });
    const W = 320, H = 240; c.width = W; c.height = H;
    const v = document.createElement('video'); v.muted = true; v.playsInline = true;
    let prev = null;
    document.getElementById('start').onclick = async () => {
      try { v.srcObject = await navigator.mediaDevices.getUserMedia({ video: true }); await v.play(); loop(); }
      catch (e) { console.error('カメラを使えませんでした: ' + e.message); }
    };
    function loop() {
      x.save(); x.scale(-1, 1); x.drawImage(v, -W, 0, W, H); x.restore();
      const img = x.getImageData(0, 0, W, H), d = img.data;
      let moved = 0;
      if (prev) for (let i = 0; i < d.length; i += 4) {
        const diff = Math.abs(d[i] - prev[i]) + Math.abs(d[i + 1] - prev[i + 1]) + Math.abs(d[i + 2] - prev[i + 2]);
        prev[i] = d[i]; prev[i + 1] = d[i + 1]; prev[i + 2] = d[i + 2];
        if (diff > 80) { d[i] = 255; d[i + 1] = 40; d[i + 2] = 40; moved++; } else { const g = (d[i] + d[i + 1] + d[i + 2]) / 6; d[i] = d[i + 1] = d[i + 2] = g; }
      } else prev = new Uint8ClampedArray(d);
      x.putImageData(img, 0, 0);
      document.getElementById('m').style.width = Math.min(100, (moved / (W * H)) * 800) + '%';
      requestAnimationFrame(loop);
    }
  },
}, {
  id: 'md-mic-meter', c: 'media', lv: 2, so: 1, nt: 1, perm: 1,
  t: 'マイクの音量計', y: 'まいくのおんりょうけい',
  tags: ['マイク', '音量', 'AnalyserNode', 'デシベル'],
  d: 'マイクの音を AnalyserNode に通し、波の値の2乗平均（RMS）から音量を求めて棒で表す。一番大きかった位置にはしばらく印を残す（ピークホールド）。',
  pipe: 'mic | avg | meter 120',
  html: `<button id="start">マイクを使う</button><div class="meter"><i id="lv"></i><b id="pk"></b></div><p id="db">-∞ dB</p>`,
  css: `body { display: grid; place-content: center; justify-items: center; gap: 12px; background: #14161b; color: #ddd; } .meter { position: relative; width: min(80vw, 480px); height: 28px; border-radius: 6px; background: linear-gradient(90deg, #2f855a 60%, #f0a43a 80%, #c23b22); overflow: hidden; } .meter i { position: absolute; inset: 0 0 0 auto; background: #222a; width: 100%; } .meter b { position: absolute; top: 0; bottom: 0; width: 3px; background: #fff; } p { font: 20px ui-monospace, monospace; }`,
  js() {
    let an, data, peak = 0, hold = 0;
    document.getElementById('start').onclick = async () => {
      try {
        const st = await navigator.mediaDevices.getUserMedia({ audio: true });
        const ac = new AudioContext(); an = ac.createAnalyser(); an.fftSize = 1024; data = new Float32Array(an.fftSize);
        ac.createMediaStreamSource(st).connect(an); loop();
      } catch (e) { console.error('マイクを使えませんでした: ' + e.message); }
    };
    function loop() {
      an.getFloatTimeDomainData(data);
      const rms = Math.sqrt(data.reduce((s, v) => s + v * v, 0) / data.length), db = 20 * Math.log10(rms || 1e-8), k = Math.max(0, Math.min(1, (db + 60) / 60));
      if (k > peak) { peak = k; hold = 60; } else if (--hold < 0) peak = Math.max(k, peak - 0.01);
      document.getElementById('lv').style.width = (1 - k) * 100 + '%';
      document.getElementById('pk').style.left = peak * 100 + '%';
      document.getElementById('db').textContent = `${db.toFixed(1)} dB`;
      requestAnimationFrame(loop);
    }
  },
}, {
  id: 'md-spectrogram', c: 'media', lv: 3, so: 1, nt: 1, perm: 1,
  t: '声の色地図（スペクトログラム）', y: 'こえのいろちずすぺくとろぐらむ',
  tags: ['マイク', 'スペクトログラム', 'FFT', '可視化'],
  d: 'マイクの音を周波数ごとの強さに分け（FFT）、縦を周波数、横を時間、色を強さとして右端に1列ずつ描き足していく。口笛は細い線、「あー」と「いー」では縞模様の並び方が違う。',
  pipe: 'mic | bar',
  html: `<button id="start">マイクを使う</button><canvas id="c"></canvas>`,
  css: `body { display: flex; flex-direction: column; background: #000; } button { align-self: center; margin: 6px; } canvas { flex: 1; width: 100%; min-height: 0; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d');
    const fit = () => { c.width = c.clientWidth; c.height = c.clientHeight; };
    fit(); addEventListener('resize', fit);
    document.getElementById('start').onclick = async () => {
      try {
        const st = await navigator.mediaDevices.getUserMedia({ audio: true });
        const ac = new AudioContext(), an = ac.createAnalyser(); an.fftSize = 2048; an.smoothingTimeConstant = 0;
        ac.createMediaStreamSource(st).connect(an);
        const d = new Uint8Array(an.frequencyBinCount), bins = 400;
        (function loop() {
          an.getByteFrequencyData(d);
          x.drawImage(c, -2, 0);
          for (let i = 0; i < bins; i++) { const v = d[i] / 255; x.fillStyle = `hsl(${260 - v * 260} 100% ${v * 60}%)`; x.fillRect(c.width - 2, c.height - ((i + 1) / bins) * c.height, 2, c.height / bins + 1); }
          requestAnimationFrame(loop);
        })();
      } catch (e) { console.error('マイクを使えませんでした: ' + e.message); }
    };
  },
}, {
  id: 'md-recorder', c: 'media', lv: 2, so: 1, nt: 1, perm: 1,
  t: '録音して聞き返す', y: 'ろくおんしてききかえす',
  tags: ['MediaRecorder', '録音', 'Blob', 'audio'],
  d: 'MediaRecorder でマイクの音を録り、止めたら Blob（ひとかたまりのデータ）にまとめて audio 要素で再生できるようにする。録った音はファイルとして保存もできる。',
  html: `<div class="ctl"><button id="rec">録音開始</button><span id="time">0.0 秒</span></div><ol id="list"></ol>`,
  css: `body { display: grid; justify-items: center; align-content: center; gap: 10px; background: #f5f2ec; } .ctl { display: flex; gap: 12px; align-items: center; } #rec.on { background: #c23b22; color: #fff; } ol { display: grid; gap: 8px; padding: 0; list-style: none; } li { display: flex; gap: 8px; align-items: center; background: #fff; padding: 6px 10px; border-radius: 10px; }`,
  js() {
    let mr, chunks = [], t0 = 0, timer = 0;
    const btn = document.getElementById('rec');
    btn.onclick = async () => {
      if (mr && mr.state === 'recording') { mr.stop(); return; }
      try {
        const st = await navigator.mediaDevices.getUserMedia({ audio: true });
        mr = new MediaRecorder(st); chunks = [];
        mr.ondataavailable = (e) => chunks.push(e.data);
        mr.onstop = () => {
          st.getTracks().forEach((t) => t.stop()); clearInterval(timer);
          const blob = new Blob(chunks, { type: mr.mimeType }), url = URL.createObjectURL(blob);
          const li = document.createElement('li');
          li.innerHTML = `<audio controls></audio><a download="rec.${mr.mimeType.includes('ogg') ? 'ogg' : 'webm'}">保存</a>`;
          li.querySelector('audio').src = url; li.querySelector('a').href = url;
          document.getElementById('list').prepend(li);
          btn.textContent = '録音開始'; btn.classList.remove('on');
        };
        mr.start(); t0 = performance.now(); btn.textContent = '止める'; btn.classList.add('on');
        timer = setInterval(() => { document.getElementById('time').textContent = ((performance.now() - t0) / 1000).toFixed(1) + ' 秒'; }, 100);
      } catch (e) { console.error('マイクを使えませんでした: ' + e.message); }
    };
  },
}, {
  id: 'md-screen-record', c: 'media', lv: 3, so: 1, nt: 1, perm: 1,
  t: '画面を録画する', y: 'がめんをろくがする',
  tags: ['getDisplayMedia', '画面録画', 'MediaRecorder', '動画保存'],
  d: 'getDisplayMedia で画面・ウィンドウ・タブのどれかを選んでもらい、その映像を MediaRecorder で録画する。止めると動画として再生でき、WebM ファイルとして保存できる。',
  html: `<button id="go">画面の録画を始める</button><video id="v" controls playsinline></video><a id="dl" hidden download="screen.webm">動画を保存</a>`,
  css: `body { display: grid; justify-items: center; align-content: center; gap: 10px; background: #1b1d24; color: #ddd; } video { width: min(94vw, 640px); border-radius: 10px; background: #000; } a { color: #9cf; }`,
  js() {
    let mr;
    const go = document.getElementById('go');
    go.onclick = async () => {
      if (mr && mr.state === 'recording') { mr.stop(); return; }
      try {
        const st = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        const chunks = [];
        mr = new MediaRecorder(st);
        mr.ondataavailable = (e) => chunks.push(e.data);
        mr.onstop = () => { st.getTracks().forEach((t) => t.stop()); const url = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' })); document.getElementById('v').src = url; const dl = document.getElementById('dl'); dl.href = url; dl.hidden = false; go.textContent = '画面の録画を始める'; };
        st.getVideoTracks()[0].addEventListener('ended', () => mr.state === 'recording' && mr.stop());
        mr.start(); go.textContent = '録画を止める';
      } catch (e) { console.error('画面を取り込めませんでした: ' + e.message); }
    };
  },
}, {
  id: 'md-canvas-record', c: 'media', lv: 3,
  t: '描いた動きを動画に保存', y: 'かいたうごきをどうがにほぞん',
  tags: ['captureStream', 'MediaRecorder', 'canvas', '動画保存'],
  d: 'canvas.captureStream() で canvas を映像として取り出し、MediaRecorder で3秒間録画して WebM 動画にする。プログラムで描いたアニメーションを、そのまま動画ファイルとして持ち出せる。',
  html: `<canvas id="c" width="480" height="270"></canvas><div><button id="rec">3秒録画する</button> <a id="dl" hidden download="animation.webm">動画を保存</a></div><video id="v" controls hidden></video>`,
  css: `body { display: grid; justify-items: center; align-content: center; gap: 8px; background: #101018; color: #ccc; } canvas, video { width: min(90vw, 480px); border-radius: 8px; } a { color: #9cf; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d');
    (function draw(t) {
      x.fillStyle = '#101018'; x.fillRect(0, 0, 480, 270);
      for (let i = 0; i < 12; i++) { const a = t / 600 + (i / 12) * Math.PI * 2; x.fillStyle = `hsl(${i * 30 + t / 20} 80% 60%)`; x.beginPath(); x.arc(240 + Math.cos(a) * 90, 135 + Math.sin(a * 2) * 70, 16, 0, 7); x.fill(); }
      x.fillStyle = '#fff'; x.font = '700 28px sans-serif'; x.fillText(`${(t / 1000).toFixed(1)} 秒`, 16, 40);
      requestAnimationFrame(draw);
    })(0);
    document.getElementById('rec').onclick = (e) => {
      const st = c.captureStream(30), chunks = [], mr = new MediaRecorder(st, { mimeType: MediaRecorder.isTypeSupported('video/webm') ? 'video/webm' : '' });
      mr.ondataavailable = (ev) => chunks.push(ev.data);
      mr.onstop = () => { const url = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' })); const v = document.getElementById('v'); v.src = url; v.hidden = false; const dl = document.getElementById('dl'); dl.href = url; dl.hidden = false; e.target.disabled = false; e.target.textContent = '3秒録画する'; };
      mr.start(); e.target.disabled = true; e.target.textContent = '録画中…';
      setTimeout(() => mr.stop(), 3000);
    };
  },
}, {
  id: 'md-speech-recognition', c: 'media', lv: 2, so: 1, nt: 1, perm: 1,
  t: '声を文字にする', y: 'こえをもじにする',
  tags: ['音声認識', 'SpeechRecognition', '文字起こし', 'マイク'],
  d: 'SpeechRecognition に日本語を指定して話しかけると、話している途中の仮の文字と、確定した文字を返してくれる。確定した文は下に積み重ねていく。',
  p: '使える環境はブラウザによって違う。使えないときはその旨を表示する。',
  html: `<button id="go">話しはじめる</button><p class="interim" id="tmp"></p><ol id="log"></ol>`,
  css: `body { display: grid; justify-items: center; align-content: center; gap: 8px; padding: 12px; background: #f3f6fb; } .interim { color: #888; min-height: 1.6em; font-size: 18px; margin: 0; } ol { width: min(520px, 92vw); font-size: 17px; } #go.on { background: #c23b22; color: #fff; }`,
  js() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition, go = document.getElementById('go');
    if (!SR) { go.disabled = true; document.getElementById('tmp').textContent = 'このブラウザは音声認識に対応していません'; }
    let rec = null;
    go.onclick = () => {
      if (rec) { rec.stop(); return; }
      rec = new SR(); rec.lang = 'ja-JP'; rec.interimResults = true; rec.continuous = true;
      rec.onresult = (e) => {
        let tmp = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) { const li = document.createElement('li'); li.textContent = r[0].transcript; document.getElementById('log').append(li); } else tmp += r[0].transcript;
        }
        document.getElementById('tmp').textContent = tmp;
      };
      rec.onerror = (e) => console.error('音声認識のエラー: ' + e.error);
      rec.onend = () => { rec = null; go.textContent = '話しはじめる'; go.classList.remove('on'); };
      rec.start(); go.textContent = '聞き取りを止める'; go.classList.add('on');
    };
  },
}, {
  id: 'md-tuner', c: 'media', lv: 3, so: 1, nt: 1, perm: 1,
  t: '楽器のチューナー', y: 'がっきのちゅーなー',
  tags: ['音の高さ', '自己相関', 'マイク', '音名'],
  d: 'マイクの波形を少しずつずらして自分自身と重ね合わせ（自己相関）、一番よく重なるずれから音の周期を求める。周波数を音名に直し、正しい高さから何セントずれているかを針で示す。',
  html: `<button id="go">マイクを使う</button><div class="note" id="note">--</div><div class="gauge"><i id="needle"></i></div><p id="hz">0 Hz</p>`,
  css: `body { display: grid; place-content: center; justify-items: center; gap: 10px; background: #111418; color: #eee; } .note { font: 900 22vmin/1 serif; } .gauge { position: relative; width: min(80vw, 420px); height: 20px; border-radius: 10px; background: linear-gradient(90deg, #c23b22, #f0a43a 40%, #2f855a 50%, #f0a43a 60%, #c23b22); } .gauge i { position: absolute; top: -6px; bottom: -6px; left: 50%; width: 4px; margin-left: -2px; background: #fff; transition: left .1s; } p { font: 16px ui-monospace, monospace; }`,
  js() {
    const NAMES = ['ド', 'ド♯', 'レ', 'レ♯', 'ミ', 'ファ', 'ファ♯', 'ソ', 'ソ♯', 'ラ', 'ラ♯', 'シ'];
    function pitch(buf, sr) {
      let rms = 0; for (const v of buf) rms += v * v; if (Math.sqrt(rms / buf.length) < 0.01) return -1;
      let best = -1, bestC = 0;
      for (let lag = Math.floor(sr / 1000); lag < Math.floor(sr / 60); lag++) {
        let c = 0; for (let i = 0; i < buf.length - lag; i++) c += buf[i] * buf[i + lag];
        if (c > bestC) { bestC = c; best = lag; }
      }
      return best > 0 ? sr / best : -1;
    }
    document.getElementById('go').onclick = async () => {
      try {
        const st = await navigator.mediaDevices.getUserMedia({ audio: true });
        const ac = new AudioContext(), an = ac.createAnalyser(); an.fftSize = 2048;
        ac.createMediaStreamSource(st).connect(an);
        const buf = new Float32Array(an.fftSize);
        (function loop() {
          an.getFloatTimeDomainData(buf);
          const f = pitch(buf, ac.sampleRate);
          if (f > 0) {
            const n = 12 * Math.log2(f / 440) + 69, r = Math.round(n), cents = Math.round((n - r) * 100);
            document.getElementById('note').textContent = NAMES[((r % 12) + 12) % 12];
            document.getElementById('needle').style.left = 50 + cents + '%';
            document.getElementById('hz').textContent = `${f.toFixed(1)} Hz ・ ${cents > 0 ? '+' : ''}${cents} セント`;
          }
          requestAnimationFrame(loop);
        })();
      } catch (e) { console.error('マイクを使えませんでした: ' + e.message); }
    };
  },
}, {
  id: 'md-video-player', c: 'media', lv: 3, nt: 1,
  t: '自作の動画プレーヤー', y: 'じさくのどうがぷれーやー',
  tags: ['video', '動画', 'プレーヤー', 'ピクチャーインピクチャー'],
  d: '再生・一時停止・シークバー・速さ・全画面・小窓表示（ピクチャー・イン・ピクチャー）を、video 要素の機能を呼ぶだけで作る。再生する動画も、その場で canvas に描いたものを録画して用意する。',
  html: `<div class="pl"><video id="v" playsinline></video><div class="bar"><button id="pp" disabled>準備中…</button><input type="range" id="seek" min="0" max="100" step="0.1" value="0" aria-label="再生位置"><span id="tm">0:00</span><select id="sp" aria-label="再生速度"><option>0.5</option><option selected>1</option><option>1.5</option><option>2</option></select><button id="pip">小窓</button><button id="fs">全画面</button></div></div>`,
  css: `body { display: grid; place-items: center; background: #0e0f13; color: #ddd; } .pl { width: min(94vw, 640px); border-radius: 12px; overflow: hidden; background: #000; } video { width: 100%; display: block; aspect-ratio: 16 / 9; } .bar { display: flex; gap: 6px; align-items: center; padding: 6px; background: #1c1e26; font-size: 12px; } #seek { flex: 1; }`,
  js() {
    const v = document.getElementById('v'), pp = document.getElementById('pp'), seek = document.getElementById('seek');
    const c = document.createElement('canvas'); c.width = 640; c.height = 360; const x = c.getContext('2d');
    let start = 0;
    const draw = (t) => { const k = (t - start) / 1000; x.fillStyle = `hsl(${k * 60} 50% 20%)`; x.fillRect(0, 0, 640, 360); x.fillStyle = '#fff'; x.font = '800 64px serif'; x.fillText(`${k.toFixed(1)} 秒`, 200, 200); x.fillStyle = '#ffcf5c'; x.beginPath(); x.arc(80 + k * 100, 290, 30, 0, 7); x.fill(); if (k < 5) requestAnimationFrame(draw); };
    const mr = new MediaRecorder(c.captureStream(30)), chunks = [];
    mr.ondataavailable = (e) => chunks.push(e.data);
    mr.onstop = () => { v.src = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' })); pp.disabled = false; pp.textContent = '再生'; };
    requestAnimationFrame((t) => { start = t; mr.start(); draw(t); setTimeout(() => mr.stop(), 5000); });
    const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    pp.onclick = () => (v.paused ? v.play() : v.pause());
    v.onplay = () => { pp.textContent = '一時停止'; }; v.onpause = () => { pp.textContent = '再生'; };
    v.ontimeupdate = () => { const d = isFinite(v.duration) ? v.duration : 5; seek.value = (v.currentTime / d) * 100; document.getElementById('tm').textContent = fmt(v.currentTime); };
    seek.oninput = () => { const d = isFinite(v.duration) ? v.duration : 5; v.currentTime = (seek.value / 100) * d; };
    document.getElementById('sp').onchange = (e) => { v.playbackRate = +e.target.value; };
    document.getElementById('pip').onclick = async () => {
      try {
        if (document.pictureInPictureElement) await document.exitPictureInPicture();
        else if (v.requestPictureInPicture) await v.requestPictureInPicture();
        else console.warn('このブラウザは小窓表示に対応していません');
      } catch (e) { console.error(e.message); }
    };
    document.getElementById('fs').onclick = () => document.querySelector('.pl').requestFullscreen?.();
  },
}, {
  id: 'md-color-tracker', c: 'media', lv: 3, so: 1, nt: 1, perm: 1,
  t: '赤い物を追いかける', y: 'あかいものをおいかける',
  tags: ['カメラ', '色の追跡', '重心', 'getImageData'],
  d: 'カメラの映像から「赤が強く、緑と青が弱い」画素を探し、その位置の平均（重心）に印を付ける。赤いペンやりんごを動かすと、印が追いかけてきて軌跡を描く。',
  html: `<button id="go">カメラを起動</button><canvas id="c"></canvas>`,
  css: `body { display: grid; justify-items: center; align-content: start; gap: 6px; padding: 8px; background: #121212; } canvas { width: min(94vw, 560px); border-radius: 10px; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d', { willReadFrequently: true });
    const W = 320, H = 240; c.width = W; c.height = H;
    const v = document.createElement('video'); v.muted = true; v.playsInline = true;
    const trail = [];
    document.getElementById('go').onclick = async () => {
      try { v.srcObject = await navigator.mediaDevices.getUserMedia({ video: true }); await v.play(); loop(); }
      catch (e) { console.error('カメラを使えませんでした: ' + e.message); }
    };
    function loop() {
      x.save(); x.scale(-1, 1); x.drawImage(v, -W, 0, W, H); x.restore();
      const d = x.getImageData(0, 0, W, H).data;
      let sx = 0, sy = 0, n = 0;
      for (let i = 0; i < d.length; i += 8) { const r = d[i], g = d[i + 1], b = d[i + 2]; if (r > 140 && r > g * 1.8 && r > b * 1.8) { const p = i / 4; sx += p % W; sy += (p / W) | 0; n++; } }
      if (n > 30) { trail.push([sx / n, sy / n]); if (trail.length > 40) trail.shift(); }
      x.strokeStyle = '#ffd23f'; x.lineWidth = 4; x.beginPath(); trail.forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py))); x.stroke();
      if (n > 30) { x.strokeStyle = '#0f0'; x.lineWidth = 3; x.beginPath(); x.arc(sx / n, sy / n, 16, 0, 7); x.stroke(); }
      requestAnimationFrame(loop);
    }
  },
});
