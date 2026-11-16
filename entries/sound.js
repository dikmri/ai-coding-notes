/* 音
 * 音声ファイルは使わず、Web Audio API でその場で音を合成する。
 * ブラウザは操作の前に音を出させないので、AudioContext は最初に押したときに作る */
dekiru.add({
  id: 'sd-piano', c: 'sound', lv: 2,
  t: '鍵盤ピアノ', y: 'けんばんぴあの',
  tags: ['Web Audio', '楽器', 'キーボード操作', 'オシレーター'],
  d: '2オクターブの鍵盤を、マウス・指・パソコンのキーボード（A〜K の段と W・E・T・Y・U）で弾ける。音は発振器（オシレーター）で作り、音量の山（エンベロープ）を付けて鍵盤らしくする。',
  p: '周波数は 440 × 2^((音の番号 − 69) ÷ 12)。半音上がるごとに約1.06倍になる。',
  html: `<div class="kb" id="kb"></div><p>キーボードの A S D F G H J K と W E T Y U でも弾けます</p>`,
  css: `
    body { display: grid; place-content: center; justify-items: center; gap: 10px; background: #1b1b22; color: #aaa; font-size: 12px; user-select: none; touch-action: none; }
    .kb { position: relative; display: flex; height: 40vh; }
    .w { width: 5.6vw; max-width: 54px; height: 100%; background: linear-gradient(#fff, #eee); border: 1px solid #333; border-radius: 0 0 6px 6px; }
    .b { width: 3.4vw; max-width: 32px; height: 62%; margin: 0 -1.7vw; background: linear-gradient(#333, #000); border-radius: 0 0 4px 4px; z-index: 1; }
    @media (min-width: 964px) { .b { margin: 0 -16px; } }
    .w.on { background: linear-gradient(#ffd6c9, #ffb39c); } .b.on { background: linear-gradient(#e0532f, #8a2a14); }`,
  js() {
    let ac;
    const kb = document.getElementById('kb');
    const KEYS = 'awsedftgyhujk';
    const keys = [];
    for (let n = 60; n < 84; n++) {
      const black = [1, 3, 6, 8, 10].includes(n % 12);
      const k = document.createElement('div');
      k.className = black ? 'b' : 'w';
      k.dataset.n = n;
      kb.append(k);
      keys.push(k);
    }
    const playing = new Map();
    function on(n) {
      if (playing.has(n)) return;
      ac = ac || new AudioContext();
      const o = ac.createOscillator(), o2 = ac.createOscillator(), g = ac.createGain();
      const f = 440 * 2 ** ((n - 69) / 12);
      o.type = 'triangle'; o.frequency.value = f; o2.type = 'sine'; o2.frequency.value = f * 2;
      g.gain.setValueAtTime(0, ac.currentTime);
      g.gain.linearRampToValueAtTime(0.35, ac.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.12, ac.currentTime + 0.4);
      o.connect(g); o2.connect(g); g.connect(ac.destination);
      o.start(); o2.start();
      playing.set(n, { o, o2, g });
      keys[n - 60].classList.add('on');
    }
    function off(n) {
      const p = playing.get(n); if (!p) return;
      p.g.gain.cancelScheduledValues(ac.currentTime);
      p.g.gain.setTargetAtTime(0, ac.currentTime, 0.12);
      p.o.stop(ac.currentTime + 0.6); p.o2.stop(ac.currentTime + 0.6);
      playing.delete(n);
      keys[n - 60].classList.remove('on');
    }
    kb.addEventListener('pointerdown', (e) => { const k = e.target.closest('[data-n]'); if (k) { kb.setPointerCapture(e.pointerId); on(+k.dataset.n); kb.dataset.last = k.dataset.n; } });
    kb.addEventListener('pointermove', (e) => { if (!kb.hasPointerCapture(e.pointerId)) return; const k = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-n]'); if (k && k.dataset.n !== kb.dataset.last) { off(+kb.dataset.last); on(+k.dataset.n); kb.dataset.last = k.dataset.n; } });
    kb.addEventListener('pointerup', () => off(+kb.dataset.last));
    addEventListener('keydown', (e) => { const i = KEYS.indexOf(e.key.toLowerCase()); if (i >= 0 && !e.repeat) on(60 + i); });
    addEventListener('keyup', (e) => { const i = KEYS.indexOf(e.key.toLowerCase()); if (i >= 0) off(60 + i); });
    if (window.THUMB) { const song = [60, 62, 64, 65, 67, 69, 71, 72]; let i = 0; setInterval(() => { keys.forEach((k) => k.classList.remove('on')); keys[song[i++ % 8] - 60].classList.add('on'); }, 300); }
  },
}, {
  id: 'sd-theremin', c: 'sound', lv: 2,
  t: 'テルミン', y: 'てるみん',
  tags: ['Web Audio', '楽器', 'マウス', '波形'],
  d: '画面に触れずに演奏する電子楽器テルミンのまね。横の位置で音の高さ、縦の位置で音量が変わる。鳴っている音の波形をその場で描く。',
  html: `<canvas id="c"></canvas><p id="hint">押したまま動かすと鳴ります（横=高さ、縦=音量）</p>`,
  css: `body { background: #0c0f1a; touch-action: none; overflow: hidden; } canvas { display: block; width: 100vw; height: 100vh; cursor: crosshair; } p { position: fixed; top: 8px; width: 100%; text-align: center; margin: 0; color: #fff8; font-size: 12px; pointer-events: none; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d');
    const fit = () => { c.width = innerWidth; c.height = innerHeight; };
    fit(); addEventListener('resize', fit);
    let ac, osc, gain, an, data;
    function start() {
      if (!ac) {
        ac = new AudioContext(); osc = ac.createOscillator(); gain = ac.createGain(); an = ac.createAnalyser();
        const vib = ac.createOscillator(), vg = ac.createGain();
        vib.frequency.value = 5.5; vg.gain.value = 6; vib.connect(vg); vg.connect(osc.frequency); vib.start();
        osc.type = 'sine'; gain.gain.value = 0; osc.connect(gain); gain.connect(an); an.connect(ac.destination); osc.start();
        data = new Uint8Array(an.fftSize);
      }
    }
    const set = (e) => { const f = 110 * 2 ** ((e.clientX / innerWidth) * 4); osc.frequency.setTargetAtTime(f, ac.currentTime, 0.02); gain.gain.setTargetAtTime((1 - e.clientY / innerHeight) * 0.4, ac.currentTime, 0.03); };
    c.addEventListener('pointerdown', (e) => { start(); c.setPointerCapture(e.pointerId); set(e); });
    c.addEventListener('pointermove', (e) => { if (ac && c.hasPointerCapture(e.pointerId)) set(e); });
    c.addEventListener('pointerup', () => { gain.gain.setTargetAtTime(0, ac.currentTime, 0.1); });
    (function draw(t) {
      x.fillStyle = '#0c0f1a40'; x.fillRect(0, 0, c.width, c.height);
      x.strokeStyle = '#7fe3ff'; x.lineWidth = 2; x.beginPath();
      if (an) { an.getByteTimeDomainData(data); data.forEach((v, i) => { const px = (i / data.length) * c.width, py = c.height / 2 + ((v - 128) / 128) * c.height * 0.4; i ? x.lineTo(px, py) : x.moveTo(px, py); }); }
      else for (let i = 0; i <= 200; i++) { const px = (i / 200) * c.width; const py = c.height / 2 + Math.sin(i / 8 + t / 200) * 40; i ? x.lineTo(px, py) : x.moveTo(px, py); }
      x.stroke();
      requestAnimationFrame(draw);
    })(0);
  },
}, {
  id: 'sd-drum-machine', c: 'sound', lv: 3,
  t: 'リズムマシン', y: 'りずむましん',
  tags: ['Web Audio', 'シーケンサー', 'ドラム', 'スケジューリング'],
  d: '4種類の打楽器×16拍の升目を押して並べると、その通りに繰り返し鳴る。太鼓もシンバルもすべてその場で合成する。音を出す時刻は AudioContext の時計で少し先まで予約するので、テンポが揺れない。',
  p: 'setInterval だけで鳴らすとずれる。少し先の時刻を指定して start(時刻) で予約すると、正確な拍になる。',
  html: `<div class="ctl"><button id="play">再生</button><label>テンポ <input type="range" id="bpm" min="60" max="180" value="110"></label><output id="bo">110</output></div><div class="grid" id="g"></div>`,
  css: `
    body { display: grid; place-content: center; gap: 10px; background: #15151d; color: #ddd; font-size: 12px; }
    .ctl { display: flex; gap: 10px; align-items: center; }
    .grid { display: grid; grid-template-columns: 60px repeat(16, 1fr); gap: 4px; width: min(94vw, 760px); }
    .grid span { align-self: center; }
    .grid button { aspect-ratio: 1; border: 0; border-radius: 5px; padding: 0; background: #2a2a36; }
    .grid button:nth-of-type(4n+1) { background: #34344a; }
    .grid button.on { background: hsl(var(--h) 80% 60%); }
    .grid button.now { outline: 2px solid #fff; }`,
  js() {
    const names = [['キック', 0], ['スネア', 45], ['ハイハット', 190], ['クラップ', 290]];
    const pattern = [[1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0], [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1], [0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0]];
    const g = document.getElementById('g'), cells = [];
    names.forEach(([n, h], r) => {
      g.insertAdjacentHTML('beforeend', `<span>${n}</span>`);
      cells[r] = [];
      for (let s = 0; s < 16; s++) { const b = document.createElement('button'); b.style.setProperty('--h', h); b.setAttribute('aria-label', `${n} ${s + 1}拍目`); b.classList.toggle('on', !!pattern[r][s]); b.setAttribute('aria-pressed', !!pattern[r][s]); b.onclick = () => { pattern[r][s] ^= 1; b.classList.toggle('on'); b.setAttribute('aria-pressed', !!pattern[r][s]); }; g.append(b); cells[r][s] = b; }
    });
    let ac, noise, timer = 0, step = 0, nextT = 0;
    const tempo = () => +document.getElementById('bpm').value;
    document.getElementById('bpm').oninput = (e) => { document.getElementById('bo').textContent = e.target.value; };
    function env(node, t, peak, dur) { const gg = ac.createGain(); gg.gain.setValueAtTime(peak, t); gg.gain.exponentialRampToValueAtTime(0.001, t + dur); node.connect(gg); gg.connect(ac.destination); return gg; }
    function noiseSrc(t, dur, type, freq) { const s = ac.createBufferSource(); s.buffer = noise; const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; s.connect(f); s.start(t); s.stop(t + dur); return f; }
    const voices = [
      (t) => { const o = ac.createOscillator(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.15); env(o, t, 1, 0.4); o.start(t); o.stop(t + 0.4); },
      (t) => { env(noiseSrc(t, 0.2, 'highpass', 1000), t, 0.6, 0.18); const o = ac.createOscillator(); o.type = 'triangle'; o.frequency.value = 190; env(o, t, 0.4, 0.1); o.start(t); o.stop(t + 0.1); },
      (t) => { env(noiseSrc(t, 0.05, 'highpass', 7000), t, 0.3, 0.05); },
      (t) => { for (const d of [0, 0.012, 0.025]) env(noiseSrc(t + d, 0.15, 'bandpass', 1500), t + d, 0.5, 0.12); },
    ];
    function schedule() {
      while (nextT < ac.currentTime + 0.12) {
        const s = step;
        pattern.forEach((row, r) => { if (row[s]) voices[r](nextT); });
        const delay = (nextT - ac.currentTime) * 1000;
        setTimeout(() => { cells.forEach((row) => row.forEach((b, i) => b.classList.toggle('now', i === s))); }, delay);
        nextT += 60 / tempo() / 4;
        step = (step + 1) % 16;
      }
    }
    document.getElementById('play').onclick = (e) => {
      if (!ac) { ac = new AudioContext(); noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate); const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
      if (timer) { clearInterval(timer); timer = 0; e.target.textContent = '再生'; return; }
      nextT = ac.currentTime + 0.05; step = 0; timer = setInterval(schedule, 25); e.target.textContent = '止める';
    };
    if (window.THUMB) { let s = 0; setInterval(() => { cells.forEach((row) => row.forEach((b, i) => b.classList.toggle('now', i === s))); s = (s + 1) % 16; }, 140); }
  },
}, {
  id: 'sd-synth', c: 'sound', lv: 3,
  t: '音色を作るシンセサイザー', y: 'ねいろをつくるしんせさいざー',
  tags: ['Web Audio', 'ADSR', 'フィルター', 'シンセ'],
  d: '波の形（正弦波・三角波・のこぎり波・矩形波）、音の立ち上がりから消えるまでの形（ADSR）、こもらせるフィルターを決めて、鍵盤で鳴らす。同じ高さでも音色がまるで変わる。',
  html: `
    <div class="panel">
      <label>波の形 <select id="wave"><option value="sawtooth">のこぎり波</option><option value="square">矩形波</option><option value="triangle">三角波</option><option value="sine">正弦波</option></select></label>
      <label>立ち上がり <input type="range" id="a" min="0" max="1" step="0.01" value="0.02"></label>
      <label>減衰 <input type="range" id="d" min="0.01" max="1" step="0.01" value="0.3"></label>
      <label>持続 <input type="range" id="s" min="0" max="1" step="0.01" value="0.5"></label>
      <label>余韻 <input type="range" id="r" min="0.01" max="2" step="0.01" value="0.5"></label>
      <label>こもり具合 <input type="range" id="cut" min="200" max="8000" step="10" value="2400"></label>
    </div>
    <div class="keys" id="keys"></div>`,
  css: `body { display: grid; place-content: center; gap: 12px; background: #20232b; color: #ccd; font-size: 12px; } .panel { display: grid; grid-template-columns: repeat(3, auto); gap: 8px 16px; } label { display: grid; gap: 2px; } .keys { display: flex; gap: 4px; } .keys button { width: 44px; height: 110px; border-radius: 0 0 8px 8px; border: 0; background: #f4f4f4; font-size: 11px; display: grid; align-items: end; padding-bottom: 6px; } .keys button.on { background: #ff9a76; }`,
  js() {
    let ac;
    const $ = (id) => +document.getElementById(id).value;
    const notes = [['ド', 60], ['レ', 62], ['ミ', 64], ['ファ', 65], ['ソ', 67], ['ラ', 69], ['シ', 71], ['ド', 72]];
    const keys = document.getElementById('keys');
    for (const [n, m] of notes) {
      const b = document.createElement('button');
      b.textContent = n;
      b.addEventListener('pointerdown', () => play(m, b));
      keys.append(b);
    }
    function play(m, b) {
      ac = ac || new AudioContext();
      const t = ac.currentTime, o = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain();
      o.type = document.getElementById('wave').value; o.frequency.value = 440 * 2 ** ((m - 69) / 12);
      f.type = 'lowpass'; f.frequency.value = $('cut'); f.Q.value = 6;
      const A = $('a'), D = $('d'), S = $('s'), R = $('r'), hold = 0.35;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.4, t + A); g.gain.linearRampToValueAtTime(0.4 * S, t + A + D);
      g.gain.setValueAtTime(0.4 * S, t + A + D + hold); g.gain.linearRampToValueAtTime(0, t + A + D + hold + R);
      o.connect(f); f.connect(g); g.connect(ac.destination);
      o.start(t); o.stop(t + A + D + hold + R + 0.05);
      b.classList.add('on'); setTimeout(() => b.classList.remove('on'), (A + D + hold) * 1000);
    }
  },
}, {
  id: 'sd-chiptune-sfx', c: 'sound', lv: 2,
  t: '8ビット風の効果音', y: 'はちびっとふうのこうかおん',
  tags: ['効果音', 'チップチューン', 'Web Audio', 'ゲーム'],
  d: 'ジャンプ・お金・光線・爆発・強くなる、の効果音を、矩形波の高さを素早く上下させたり雑音を混ぜたりして作る。「でたらめ」を押すと毎回違う効果音ができる。',
  html: `<div class="pad" id="pad"></div>`,
  css: `body { display: grid; place-items: center; background: #1d1f33; } .pad { display: grid; grid-template-columns: repeat(3, 150px); gap: 10px; } .pad button { height: 70px; border: 0; border-radius: 12px; font: 700 15px sans-serif; color: #fff; background: hsl(var(--h) 60% 45%); box-shadow: 0 5px 0 hsl(var(--h) 60% 28%); } .pad button:active { translate: 0 4px; box-shadow: 0 1px 0 hsl(var(--h) 60% 28%); }`,
  js() {
    let ac;
    const A = () => (ac = ac || new AudioContext());
    function tone(type, f0, f1, dur, vol = 0.25, t = A().currentTime) {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + dur);
    }
    function boom() { A(); const b = ac.createBuffer(1, ac.sampleRate * 0.6, ac.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2; const s = ac.createBufferSource(), f = ac.createBiquadFilter(); s.buffer = b; f.type = 'lowpass'; f.frequency.value = 900; s.connect(f); f.connect(ac.destination); s.start(); }
    const sfx = {
      ジャンプ: () => tone('square', 220, 880, 0.18),
      お金: () => { const t = A().currentTime; tone('square', 988, 988, 0.08, 0.2, t); tone('square', 1319, 1319, 0.3, 0.2, t + 0.08); },
      光線: () => tone('sawtooth', 1800, 120, 0.25, 0.15),
      爆発: boom,
      強くなる: () => { const t = A().currentTime; [523, 659, 784, 1047, 1319].forEach((f, i) => tone('square', f, f * 1.01, 0.09, 0.18, t + i * 0.07)); },
      でたらめ: () => tone(['square', 'sawtooth', 'triangle'][Math.floor(Math.random() * 3)], 100 + Math.random() * 1500, 50 + Math.random() * 2000, 0.1 + Math.random() * 0.4),
    };
    const pad = document.getElementById('pad');
    Object.keys(sfx).forEach((k, i) => { const b = document.createElement('button'); b.textContent = k; b.style.setProperty('--h', i * 55); b.onclick = sfx[k]; pad.append(b); });
  },
}, {
  id: 'sd-oscilloscope', c: 'sound', lv: 2,
  t: '音の波形と周波数を見る', y: 'おとのはけいとしゅうはすうをみる',
  tags: ['AnalyserNode', '波形', 'スペクトル', 'Web Audio'],
  d: '鳴らした音を AnalyserNode に通し、上に時間ごとの波の形、下に周波数ごとの強さを描く。波の形を変えると、倍音（上の方の周波数）の出方が変わるのが目で見える。',
  html: `<div class="ctl"><button id="on">鳴らす</button><select id="type"><option value="sine">正弦波</option><option value="triangle">三角波</option><option value="square">矩形波</option><option value="sawtooth">のこぎり波</option></select><label>高さ <input type="range" id="f" min="60" max="1200" value="220"></label></div><canvas id="c"></canvas>`,
  css: `body { display: flex; flex-direction: column; background: #070b10; color: #9fe; font-size: 12px; } .ctl { display: flex; gap: 10px; align-items: center; padding: 8px; } canvas { flex: 1; width: 100%; min-height: 0; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d');
    let ac, osc, g, an;
    const fit = () => { c.width = c.clientWidth; c.height = c.clientHeight; };
    fit(); addEventListener('resize', fit);
    document.getElementById('on').onclick = (e) => {
      if (!ac) { ac = new AudioContext(); an = ac.createAnalyser(); an.fftSize = 2048; g = ac.createGain(); g.gain.value = 0.15; g.connect(an); an.connect(ac.destination); }
      if (osc) { osc.stop(); osc = null; e.target.textContent = '鳴らす'; return; }
      osc = ac.createOscillator(); osc.type = document.getElementById('type').value; osc.frequency.value = +document.getElementById('f').value; osc.connect(g); osc.start(); e.target.textContent = '止める';
    };
    document.getElementById('type').onchange = (e) => { if (osc) osc.type = e.target.value; };
    document.getElementById('f').oninput = (e) => { if (osc) osc.frequency.setTargetAtTime(+e.target.value, ac.currentTime, 0.02); };
    (function draw(t) {
      const W = c.width, H = c.height;
      x.fillStyle = '#070b10'; x.fillRect(0, 0, W, H);
      x.strokeStyle = '#123'; for (let i = 0; i < W; i += 40) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, H); x.stroke(); }
      x.strokeStyle = '#5ff'; x.lineWidth = 2; x.beginPath();
      if (an) {
        const td = new Uint8Array(an.fftSize); an.getByteTimeDomainData(td);
        for (let i = 0; i < 1024; i++) { const px = (i / 1024) * W, py = H * 0.28 + ((td[i] - 128) / 128) * H * 0.22; i ? x.lineTo(px, py) : x.moveTo(px, py); }
        x.stroke();
        const fd = new Uint8Array(an.frequencyBinCount); an.getByteFrequencyData(fd);
        const n = 256, bw = W / n;
        for (let i = 0; i < n; i++) { const v = fd[i] / 255; x.fillStyle = `hsl(${180 - v * 150} 90% 55%)`; x.fillRect(i * bw, H - v * H * 0.4, bw - 1, v * H * 0.4); }
      } else {
        for (let i = 0; i <= 300; i++) { const px = (i / 300) * W, py = H * 0.28 + Math.sin(i / 10 + t / 300) * H * 0.15; i ? x.lineTo(px, py) : x.moveTo(px, py); }
        x.stroke();
      }
      requestAnimationFrame(draw);
    })(0);
  },
}, {
  id: 'sd-speech', c: 'sound', lv: 2,
  t: '文章を読み上げる', y: 'ぶんしょうをよみあげる',
  tags: ['音声合成', 'speechSynthesis', '読み上げ', 'アクセシビリティ'],
  d: 'speechSynthesis に文章を渡すと、ブラウザが声に出して読む。声の種類・速さ・高さを選べ、今読んでいる言葉に印を付けながら進む。',
  p: 'boundary イベントは「今どの文字のところを読んでいるか」を知らせてくれる。',
  html: `<textarea id="t" rows="4" aria-label="読み上げる文章">こんにちは。この図鑑は、ライブラリを使わずに、ブラウザだけで作られています。声もブラウザが出しています。</textarea><div class="ctl"><select id="v" aria-label="声"></select><label>速さ <input type="range" id="rate" min="0.5" max="2" step="0.1" value="1"></label><label>高さ <input type="range" id="pitch" min="0" max="2" step="0.1" value="1"></label><button id="go">読み上げる</button><button id="stop">止める</button></div><p id="show" aria-hidden="true"></p>`,
  css: `body { display: grid; align-content: center; gap: 8px; padding: 14px; background: #f5f2ff; } textarea { font-size: 16px; } .ctl { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; font-size: 12px; } #show { font-size: 18px; line-height: 1.8; } mark { background: #ffe066; }`,
  js() {
    const sel = document.getElementById('v'), t = document.getElementById('t'), show = document.getElementById('show');
    if (!('speechSynthesis' in window)) show.textContent = 'このブラウザは読み上げに対応していません';
    else setup();
    function setup() {
      function voices() {
        const vs = speechSynthesis.getVoices();
        sel.innerHTML = vs.map((v, i) => `<option value="${i}" ${v.lang.startsWith('ja') ? 'selected' : ''}>${v.name}（${v.lang}）</option>`).join('');
      }
      voices();
      speechSynthesis.addEventListener('voiceschanged', voices);
      document.getElementById('go').onclick = () => {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(t.value);
        const v = speechSynthesis.getVoices()[sel.value];
        if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'ja-JP';
        u.rate = +document.getElementById('rate').value;
        u.pitch = +document.getElementById('pitch').value;
        // 今読んでいる語に印を付ける
        u.onboundary = (e) => {
          const s = t.value, end = e.charLength ? e.charIndex + e.charLength : e.charIndex + 1;
          show.replaceChildren(s.slice(0, e.charIndex), Object.assign(document.createElement('mark'), { textContent: s.slice(e.charIndex, end) }), s.slice(end));
        };
        u.onend = () => { show.textContent = '読み終わりました'; };
        speechSynthesis.speak(u);
      };
      document.getElementById('stop').onclick = () => speechSynthesis.cancel();
    }
  },
}, {
  id: 'sd-music-box', c: 'sound', lv: 2,
  t: 'オルゴール', y: 'おるごーる',
  tags: ['Web Audio', 'メロディー', 'きらきら星', '自動演奏'],
  d: '「きらきら星」の楽譜を音の高さと長さの並びとして持ち、AudioContext の時計で1音ずつ予約して鳴らす。鈴のような音色は、高さの違う正弦波を重ねて急に減衰させて作る。',
  html: `<button id="play">ねじを巻く（再生）</button><div class="drum" id="drum"></div>`,
  css: `body { display: grid; place-content: center; justify-items: center; gap: 14px; background: #3b2a1e; color: #f3e3c3; } .drum { position: relative; width: min(90vw, 600px); height: 200px; border-radius: 12px; background: linear-gradient(#d9b56b, #a07a35 50%, #d9b56b); overflow: hidden; } .pin { position: absolute; width: 10px; height: 10px; border-radius: 50%; background: #fff6d8; box-shadow: 0 1px 2px #0006; transition: background .1s; } .pin.hit { background: #ff7a59; scale: 1.6; }`,
  js() {
    const N = { ド: 60, レ: 62, ミ: 64, ファ: 65, ソ: 67, ラ: 69, シ: 71, 'ド\'': 72 };
    const score = 'ド ド ソ ソ ラ ラ ソ- ファ ファ ミ ミ レ レ ド- ソ ソ ファ ファ ミ ミ レ- ソ ソ ファ ファ ミ ミ レ- ド ド ソ ソ ラ ラ ソ- ファ ファ ミ ミ レ レ ド-'.split(' ').map((s) => [N[s.replace('-', '')], s.endsWith('-') ? 2 : 1]);
    const drum = document.getElementById('drum');
    let pos = 0;
    const pins = score.map(([m, len], i) => { const p = document.createElement('i'); p.className = 'pin'; p.style.left = 20 + pos * 12 + 'px'; p.style.top = 180 - (m - 58) * 11 + 'px'; pos += len; drum.append(p); return p; });
    let ac;
    function bell(m, t) {
      const f = 440 * 2 ** ((m - 69) / 12);
      for (const [mul, vol, dec] of [[1, 0.3, 1.6], [2.76, 0.08, 0.6], [5.4, 0.04, 0.3]]) {
        const o = ac.createOscillator(), g = ac.createGain();
        o.frequency.value = f * mul; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
        o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + dec);
      }
    }
    document.getElementById('play').onclick = () => {
      ac = ac || new AudioContext();
      let t = ac.currentTime + 0.1;
      const beat = 0.38;
      score.forEach(([m, len], i) => { bell(m, t); const at = (t - ac.currentTime) * 1000; setTimeout(() => { pins[i].classList.add('hit'); setTimeout(() => pins[i].classList.remove('hit'), 200); }, at); t += beat * len; });
    };
    if (window.THUMB) { let i = 0; setInterval(() => { pins.forEach((p) => p.classList.remove('hit')); pins[i++ % pins.length].classList.add('hit'); }, 300); }
  },
}, {
  id: 'sd-ambient-noise', c: 'sound', lv: 2,
  t: '雨音と波音を作る', y: 'あまおととなみおとをつくる',
  tags: ['ノイズ', '環境音', 'フィルター', '集中'],
  d: 'でたらめな値を並べた白色雑音を作り、高い音を削ると雨音に、音量をゆっくり上下させると打ち寄せる波の音になる。録音した音声は1つも使っていない。',
  html: `<div class="ctl"><button data-k="rain">雨</button><button data-k="wave">波</button><button data-k="wind">風</button><button id="stop">止める</button></div><label>音量 <input type="range" id="vol" min="0" max="1" step="0.01" value="0.5"></label><canvas id="c"></canvas>`,
  css: `body { display: grid; place-content: center; justify-items: center; gap: 10px; background: #12202e; color: #cde; } .ctl { display: flex; gap: 8px; } canvas { width: min(90vw, 560px); height: 160px; }`,
  js() {
    let ac, src, nodes = [], master, an;
    const c = document.getElementById('c'), x = c.getContext('2d');
    c.width = 560; c.height = 160;
    function noise() { const b = ac.createBuffer(2, ac.sampleRate * 3, ac.sampleRate); for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); let last = 0; for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = ch ? last * 3.5 : w; } } return b; }
    function stop() { if (src) src.stop(); nodes.forEach((n) => n.stop && n.stop()); src = null; nodes = []; }
    function start(kind) {
      ac = ac || new AudioContext();
      if (!master) { master = ac.createGain(); an = ac.createAnalyser(); master.connect(an); an.connect(ac.destination); }
      master.gain.value = +document.getElementById('vol').value;
      stop();
      src = ac.createBufferSource(); src.buffer = noise(); src.loop = true;
      const f = ac.createBiquadFilter(), g = ac.createGain();
      if (kind === 'rain') { f.type = 'highpass'; f.frequency.value = 900; g.gain.value = 0.25; }
      if (kind === 'wave' || kind === 'wind') {
        f.type = kind === 'wave' ? 'lowpass' : 'bandpass'; f.frequency.value = kind === 'wave' ? 600 : 500; f.Q.value = kind === 'wind' ? 2 : 0.7;
        const lfo = ac.createOscillator(), lg = ac.createGain();
        lfo.frequency.value = kind === 'wave' ? 0.12 : 0.3; lg.gain.value = 0.3; g.gain.value = 0.35;
        lfo.connect(lg); lg.connect(g.gain); lfo.start(); nodes.push(lfo);
        if (kind === 'wind') { const l2 = ac.createOscillator(), l2g = ac.createGain(); l2.frequency.value = 0.15; l2g.gain.value = 300; l2.connect(l2g); l2g.connect(f.frequency); l2.start(); nodes.push(l2); }
      }
      src.connect(f); f.connect(g); g.connect(master); src.start();
    }
    document.querySelector('.ctl').addEventListener('click', (e) => { if (e.target.dataset.k) start(e.target.dataset.k); });
    document.getElementById('stop').onclick = stop;
    document.getElementById('vol').oninput = (e) => { if (master) master.gain.value = +e.target.value; };
    (function draw() {
      x.fillStyle = '#12202e'; x.fillRect(0, 0, 560, 160); x.strokeStyle = '#7fd0ff'; x.beginPath();
      if (an) { const d = new Uint8Array(512); an.getByteTimeDomainData(d); d.forEach((v, i) => { const px = (i / 512) * 560, py = 80 + (v - 128) * 0.9; i ? x.lineTo(px, py) : x.moveTo(px, py); }); }
      else { x.moveTo(0, 80); x.lineTo(560, 80); }
      x.stroke(); requestAnimationFrame(draw);
    })();
  },
}, {
  id: 'sd-metronome', c: 'sound', lv: 2,
  t: 'メトロノーム', y: 'めとろのーむ',
  tags: ['テンポ', 'スケジューリング', 'Web Audio', '振り子'],
  d: '拍の音を AudioContext の時計で少し先まで予約して、正確な間隔で鳴らす。1拍目だけ高い音にし、振り子の絵も音と同じ時刻に合わせて振る。',
  html: `<div class="m"><div class="arm" id="arm"></div></div><div class="ctl"><button id="go">開始</button><label>テンポ <input type="range" id="bpm" min="40" max="208" value="100"></label><output id="o">100</output><select id="beats"><option>2</option><option>3</option><option selected>4</option></select>拍子</div>`,
  css: `body { display: grid; place-content: center; justify-items: center; gap: 14px; background: #f1ebe0; } .m { width: 200px; height: 240px; clip-path: polygon(30% 0, 70% 0, 100% 100%, 0 100%); background: linear-gradient(#8a5a2b, #5a3a1a); display: grid; justify-items: center; } .arm { width: 4px; height: 200px; margin-top: 30px; background: #ddd; transform-origin: 50% 100%; position: relative; } .arm::before { content: ""; position: absolute; left: -10px; top: 40px; width: 24px; height: 16px; background: #c9a227; border-radius: 3px; } .ctl { display: flex; gap: 8px; align-items: center; }`,
  js() {
    let ac, timer = 0, next = 0, beat = 0, side = 1;
    const arm = document.getElementById('arm');
    document.getElementById('bpm').oninput = (e) => { document.getElementById('o').textContent = e.target.value; };
    function click(t, accent) {
      const o = ac.createOscillator(), g = ac.createGain();
      o.frequency.value = accent ? 1500 : 1000; g.gain.setValueAtTime(0.4, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + 0.06);
    }
    function tick() {
      const spb = 60 / +document.getElementById('bpm').value, beats = +document.getElementById('beats').value;
      while (next < ac.currentTime + 0.1) {
        click(next, beat % beats === 0);
        const s = side;
        setTimeout(() => { arm.animate([{ rotate: `${-s * 25}deg` }, { rotate: `${s * 25}deg` }], { duration: spb * 1000, easing: 'ease-in-out', fill: 'forwards' }); }, (next - ac.currentTime) * 1000);
        side = -side; beat++; next += spb;
      }
    }
    document.getElementById('go').onclick = (e) => {
      ac = ac || new AudioContext();
      if (timer) { clearInterval(timer); timer = 0; e.target.textContent = '開始'; return; }
      next = ac.currentTime + 0.05; beat = 0; timer = setInterval(tick, 25); e.target.textContent = '止める';
    };
    if (window.THUMB) { let s = 1; setInterval(() => { arm.animate([{ rotate: `${-s * 25}deg` }, { rotate: `${s * 25}deg` }], { duration: 600, easing: 'ease-in-out', fill: 'forwards' }); s = -s; }, 600); }
  },
}, {
  id: 'sd-spatial', c: 'sound', lv: 3,
  t: '音の位置を動かす立体音響', y: 'おとのいちをうごかすりったいおんきょう',
  tags: ['PannerNode', '立体音響', 'HRTF', 'イヤホン'],
  d: '真ん中の人の頭を聞き手とし、鳴っている音の玉をドラッグで動かす。PannerNode が左右の耳への届き方を計算するので、イヤホンで聞くと音が玉のある方向から聞こえる。',
  html: `<div class="map" id="map"><div class="head">聞き手</div><div class="src" id="src">♪</div></div><button id="go">鳴らす（イヤホン推奨）</button>`,
  css: `body { display: grid; place-content: center; justify-items: center; gap: 10px; background: #0f172a; color: #ccd; touch-action: none; } .map { position: relative; width: min(80vmin, 420px); aspect-ratio: 1; border-radius: 50%; background: radial-gradient(#1e293b, #0f172a 70%); border: 1px solid #334; } .head { position: absolute; left: 50%; top: 50%; translate: -50% -50%; width: 60px; height: 60px; border-radius: 50%; background: #f3d6b4; color: #333; display: grid; place-items: center; font-size: 11px; } .head::before, .head::after { content: ""; position: absolute; top: 20px; width: 10px; height: 20px; border-radius: 5px; background: #e9bf95; } .head::before { left: -6px; } .head::after { right: -6px; } .src { position: absolute; width: 44px; height: 44px; translate: -50% -50%; border-radius: 50%; background: #ff7a59; display: grid; place-items: center; color: #fff; cursor: grab; box-shadow: 0 0 20px #ff7a59; }`,
  js() {
    const map = document.getElementById('map'), src = document.getElementById('src');
    let ac, panner, px = 0.8, py = 0.3;
    const place = () => { src.style.left = px * 100 + '%'; src.style.top = py * 100 + '%'; if (panner) { panner.positionX.value = (px - 0.5) * 10; panner.positionZ.value = (py - 0.5) * 10; } };
    place();
    src.addEventListener('pointerdown', (e) => src.setPointerCapture(e.pointerId));
    src.addEventListener('pointermove', (e) => { if (!src.hasPointerCapture(e.pointerId)) return; const r = map.getBoundingClientRect(); px = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); py = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)); place(); });
    document.getElementById('go').onclick = () => {
      if (ac) return;
      ac = new AudioContext();
      panner = new PannerNode(ac, { panningModel: 'HRTF', distanceModel: 'inverse', refDistance: 1 });
      const o = ac.createOscillator(), g = ac.createGain(), lfo = ac.createOscillator(), lg = ac.createGain();
      o.type = 'triangle'; o.frequency.value = 440; lfo.frequency.value = 3; lg.gain.value = 0.15; g.gain.value = 0.15;
      lfo.connect(lg); lg.connect(g.gain); o.connect(g); g.connect(panner); panner.connect(ac.destination);
      o.start(); lfo.start(); place();
    };
    if (window.THUMB) { let t = 0; setInterval(() => { t += 0.03; px = 0.5 + Math.cos(t) * 0.38; py = 0.5 + Math.sin(t) * 0.38; place(); }, 30); }
  },
}, {
  id: 'sd-generative-music', c: 'sound', lv: 3,
  t: '終わらない自動作曲', y: 'おわらないじどうさっきょく',
  tags: ['自動作曲', '五音音階', 'ランダムウォーク', 'Web Audio'],
  d: '五音音階（ド・レ・ミ・ソ・ラ）の中を、隣の音へ行ったり跳んだりしながらでたらめに歩いて旋律を作り、低音と一緒に鳴らし続ける。どの音を選んでも外れないので、毎回違うのに心地よい。',
  html: `<button id="go">演奏する</button><canvas id="c"></canvas>`,
  css: `body { display: grid; place-content: center; justify-items: center; gap: 10px; background: #0b1020; } canvas { width: min(92vw, 640px); height: 50vh; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d');
    c.width = 640; c.height = 300;
    const scale = [0, 2, 4, 7, 9], notes = [];
    let ac, timer = 0, idx = 7, next = 0, step = 0;
    const midi = (i) => 60 + scale[((i % 5) + 5) % 5] + 12 * Math.floor(i / 5) - 12;
    function play(m, t, dur, vol, type) {
      const o = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter();
      o.type = type; o.frequency.value = 440 * 2 ** ((m - 69) / 12); f.type = 'lowpass'; f.frequency.value = 2200;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(f); f.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + dur);
    }
    function schedule() {
      while (next < ac.currentTime + 0.2) {
        if (Math.random() < 0.85) {
          idx += [-2, -1, -1, 1, 1, 2, 0][Math.floor(Math.random() * 7)]; idx = Math.max(2, Math.min(14, idx));
          const m = midi(idx); play(m, next, 0.6, 0.18, 'triangle');
          notes.push({ m, born: performance.now() + (next - ac.currentTime) * 1000 });
        }
        if (step % 8 === 0) play(midi(Math.floor(idx / 5) * 5 - 5), next, 1.6, 0.12, 'sine');
        next += 0.22; step++;
      }
    }
    document.getElementById('go').onclick = (e) => {
      ac = ac || new AudioContext();
      if (timer) { clearInterval(timer); timer = 0; e.target.textContent = '演奏する'; return; }
      next = ac.currentTime + 0.05; timer = setInterval(schedule, 50); e.target.textContent = '止める';
    };
    if (window.THUMB) setInterval(() => { idx += Math.random() < 0.5 ? -1 : 1; idx = Math.max(2, Math.min(14, idx)); notes.push({ m: midi(idx), born: performance.now() }); }, 220);
    (function draw(now) {
      x.fillStyle = '#0b102033'; x.fillRect(0, 0, 640, 300);
      for (const n of notes) { const age = (now - n.born) / 1000; if (age < 0) continue; const px = 600 - age * 160, py = 300 - (n.m - 45) * 8; x.fillStyle = `hsla(${(n.m * 25) % 360} 80% 65% / ${Math.max(0, 1 - age / 4)})`; x.beginPath(); x.arc(px, py, 7, 0, 7); x.fill(); }
      while (notes.length && (now - notes[0].born) / 1000 > 4) notes.shift();
      requestAnimationFrame(draw);
    })(0);
  },
}, {
  id: 'sd-dtmf', c: 'sound', lv: 2,
  t: '電話のプッシュ音', y: 'でんわのぷっしゅおん',
  tags: ['DTMF', '電話', '周波数', 'Web Audio'],
  d: '電話のボタンの音は、低い音と高い音の2つを同時に鳴らした和音でできている（DTMF）。ボタンごとの2つの周波数の組み合わせを、そのまま鳴らす。キーボードの数字でも押せる。',
  html: `<div class="pad" id="pad"></div><p id="o" aria-live="polite"></p>`,
  css: `body { display: grid; place-content: center; justify-items: center; gap: 8px; background: #e9eef2; } .pad { display: grid; grid-template-columns: repeat(3, 70px); gap: 10px; } .pad button { height: 70px; border-radius: 50%; border: 0; background: #fff; font: 700 24px sans-serif; box-shadow: 0 3px 8px #0002; } .pad button:active, .pad button.on { background: #2f855a; color: #fff; } p { font: 13px ui-monospace, monospace; min-height: 1.4em; }`,
  js() {
    const rows = [697, 770, 852, 941], cols = [1209, 1336, 1477], keys = '123456789*0#';
    let ac;
    const pad = document.getElementById('pad');
    function press(k) {
      const i = keys.indexOf(k); if (i < 0) return;
      ac = ac || new AudioContext();
      const f1 = rows[Math.floor(i / 3)], f2 = cols[i % 3], t = ac.currentTime, g = ac.createGain();
      g.gain.setValueAtTime(0.15, t); g.gain.setValueAtTime(0.15, t + 0.18); g.gain.linearRampToValueAtTime(0, t + 0.22); g.connect(ac.destination);
      for (const f of [f1, f2]) { const o = ac.createOscillator(); o.frequency.value = f; o.connect(g); o.start(t); o.stop(t + 0.25); }
      document.getElementById('o').textContent = `「${k}」= ${f1} Hz ＋ ${f2} Hz`;
      const b = pad.children[i]; b.classList.add('on'); setTimeout(() => b.classList.remove('on'), 180);
    }
    [...keys].forEach((k) => { const b = document.createElement('button'); b.textContent = k; b.onclick = () => press(k); pad.append(b); });
    addEventListener('keydown', (e) => press(e.key));
    if (window.THUMB) { let i = 0; setInterval(() => { const b = pad.children[i++ % 12]; b.classList.add('on'); setTimeout(() => b.classList.remove('on'), 180); }, 300); }
  },
}, {
  id: 'sd-morse-beep', c: 'sound', lv: 2,
  t: 'モールス信号を鳴らす', y: 'もーるすしんごうをならす',
  tags: ['モールス信号', '符号', 'Web Audio', '点滅'],
  d: '英数字をモールス信号に直し、短点と長点を音と光で送る。長点は短点の3倍、文字の間は3倍、単語の間は7倍の長さで空ける。',
  html: `<input id="t" value="SOS HELLO" aria-label="送る文字"><button id="go">送信</button><div class="lamp" id="lamp"></div><p id="code"></p>`,
  css: `body { display: grid; place-content: center; justify-items: center; gap: 10px; background: #101418; color: #9cf; } input { font: 18px ui-monospace, monospace; text-transform: uppercase; } .lamp { width: 90px; height: 90px; border-radius: 50%; background: #332; transition: background .03s; } .lamp.on { background: #ffd23f; box-shadow: 0 0 40px #ffd23f; } p { font: 18px ui-monospace, monospace; letter-spacing: .1em; max-width: 90vw; word-break: break-all; }`,
  js() {
    const M = { a: '.-', b: '-...', c: '-.-.', d: '-..', e: '.', f: '..-.', g: '--.', h: '....', i: '..', j: '.---', k: '-.-', l: '.-..', m: '--', n: '-.', o: '---', p: '.--.', q: '--.-', r: '.-.', s: '...', t: '-', u: '..-', v: '...-', w: '.--', x: '-..-', y: '-.--', z: '--..', 0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-', 5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.' };
    const lamp = document.getElementById('lamp'), U = 0.09;
    let ac;
    document.getElementById('go').onclick = () => {
      ac = ac || new AudioContext();
      const words = document.getElementById('t').value.toLowerCase().split(/\s+/).filter(Boolean);
      document.getElementById('code').textContent = words.map((w) => [...w].map((ch) => M[ch] || '').join(' ')).join(' / ');
      let t = ac.currentTime + 0.1;
      const g = ac.createGain(); g.gain.value = 0; g.connect(ac.destination);
      const o = ac.createOscillator(); o.frequency.value = 650; o.connect(g); o.start();
      words.forEach((w, wi) => {
        [...w].forEach((ch, ci) => {
          [...(M[ch] || '')].forEach((s, si) => {
            const d = s === '.' ? U : U * 3;
            g.gain.setValueAtTime(0.2, t); g.gain.setValueAtTime(0, t + d);
            const at = (t - ac.currentTime) * 1000;
            setTimeout(() => lamp.classList.add('on'), at); setTimeout(() => lamp.classList.remove('on'), at + d * 1000);
            t += d + U;
          });
          t += U * 2;
        });
        t += U * 4;
      });
      o.stop(t);
    };
    if (window.THUMB) { const seq = '...---...'; let i = 0; setInterval(() => { const s = seq[i++ % 12]; if (s) { lamp.classList.add('on'); setTimeout(() => lamp.classList.remove('on'), s === '.' ? 120 : 360); } }, 450); }
  },
}, {
  id: 'sd-echo', c: 'sound', lv: 2,
  t: '山びこ（エコー）', y: 'やまびこえこー',
  tags: ['DelayNode', 'エコー', 'フィードバック', 'Web Audio'],
  d: '鳴らした音を遅らせて（DelayNode）少し小さくし、また入口に戻す。戻すたびに小さくなるので、山びこのように何度も返ってきてから消える。遅れと戻す量を変えられる。',
  html: `<div class="ctl"><button id="hit">「ポン」と鳴らす</button><label>遅れ <input type="range" id="dt" min="0.05" max="1" step="0.01" value="0.35"></label><label>戻す量 <input type="range" id="fb" min="0" max="0.9" step="0.01" value="0.55"></label></div><canvas id="c"></canvas>`,
  css: `body { display: grid; place-content: center; justify-items: center; gap: 10px; background: #1c2a1f; color: #cfe; font-size: 12px; } .ctl { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: center; } canvas { width: min(90vw, 560px); height: 140px; }`,
  js() {
    let ac, delay, fb, an;
    const c = document.getElementById('c'), x = c.getContext('2d');
    c.width = 560; c.height = 140;
    function setup() { ac = new AudioContext(); delay = ac.createDelay(2); fb = ac.createGain(); an = ac.createAnalyser(); delay.connect(fb); fb.connect(delay); delay.connect(an); an.connect(ac.destination); }
    document.getElementById('hit').onclick = () => {
      if (!ac) setup();
      delay.delayTime.value = +document.getElementById('dt').value; fb.gain.value = +document.getElementById('fb').value;
      const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
      o.frequency.setValueAtTime(660, t); o.frequency.exponentialRampToValueAtTime(330, t + 0.15);
      g.gain.setValueAtTime(0.4, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      o.connect(g); g.connect(an); g.connect(delay); o.start(t); o.stop(t + 0.25);
    };
    (function draw() {
      x.fillStyle = '#1c2a1f40'; x.fillRect(0, 0, 560, 140);
      if (an) { const d = new Uint8Array(512); an.getByteTimeDomainData(d); let peak = 0; d.forEach((v) => { peak = Math.max(peak, Math.abs(v - 128)); }); x.drawImage(c, -2, 0); x.fillStyle = '#9fe6b0'; x.fillRect(556, 70 - peak / 2, 4, peak); }
      requestAnimationFrame(draw);
    })();
  },
}, {
  id: 'sd-chords', c: 'sound', lv: 2,
  t: '和音の見本帳', y: 'わおんのみほんちょう',
  tags: ['和音', 'コード', '音楽理論', 'Web Audio'],
  d: '長三和音・短三和音・七の和音などを押すと、構成する音を鍵盤の上に示しながら同時に鳴らす。根音から何半音上の音を重ねるかの組み合わせで、明るい・暗い・不安定といった響きが決まる。',
  html: `<div class="chords" id="ch"></div><div class="kb" id="kb"></div><p id="o"></p>`,
  css: `body { display: grid; place-content: center; justify-items: center; gap: 10px; background: #f7f3ea; } .chords { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; } .kb { display: flex; height: 120px; } .kb i { width: 26px; border: 1px solid #555; background: #fff; border-radius: 0 0 4px 4px; } .kb i.b { width: 18px; margin: 0 -9px; height: 62%; background: #222; z-index: 1; } .kb i.on { background: #e0532f; } p { margin: 0; font-size: 13px; }`,
  js() {
    const CH = { 'C（明るい）': [0, 4, 7], 'Cm（暗い）': [0, 3, 7], 'C7（落ち着かない）': [0, 4, 7, 10], 'Cmaj7（おしゃれ）': [0, 4, 7, 11], 'Csus4（宙ぶらりん）': [0, 5, 7], 'Cdim（不気味）': [0, 3, 6], 'Caug（ふわっと）': [0, 4, 8], 'Cadd9（すっきり）': [0, 4, 7, 14] };
    const kb = document.getElementById('kb'), keys = [];
    for (let n = 0; n < 24; n++) { const i = document.createElement('i'); if ([1, 3, 6, 8, 10].includes(n % 12)) i.className = 'b'; kb.append(i); keys.push(i); }
    let ac;
    const NAMES = ['ド', 'ド♯', 'レ', 'レ♯', 'ミ', 'ファ', 'ファ♯', 'ソ', 'ソ♯', 'ラ', 'ラ♯', 'シ'];
    function play(name) {
      ac = ac || new AudioContext();
      const iv = CH[name], t = ac.currentTime;
      keys.forEach((k, n) => k.classList.toggle('on', iv.includes(n)));
      document.getElementById('o').textContent = `${name}: ${iv.map((n) => NAMES[n % 12]).join('・')}（根音から ${iv.join(', ')} 半音）`;
      iv.forEach((n, k) => { const o = ac.createOscillator(), g = ac.createGain(); o.type = 'triangle'; o.frequency.value = 261.63 * 2 ** (n / 12); g.gain.setValueAtTime(0, t + k * 0.03); g.gain.linearRampToValueAtTime(0.15, t + k * 0.03 + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + 1.6); o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + 1.7); });
    }
    const ch = document.getElementById('ch');
    Object.keys(CH).forEach((n) => { const b = document.createElement('button'); b.textContent = n; b.onclick = () => play(n); ch.append(b); });
    if (window.THUMB) { const ns = Object.keys(CH); let i = 0; setInterval(() => { const iv = CH[ns[i++ % ns.length]]; keys.forEach((k, n) => k.classList.toggle('on', iv.includes(n))); }, 900); }
  },
});
