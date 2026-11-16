// SID 風シンセを鳴らす AudioWorklet。音の計算は core/sidengine.mjs と同じもの（WAV の書き出しと同じ音になる）
import { SidEngine } from '../core/sidengine.mjs';

class SidProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.e = new SidEngine(sampleRate);
    this.last = '';
    this.port.onmessage = ({ data: d }) => {
      if (d.type === 'params') this.e.setParams(d.song);
      else if (d.type === 'on') this.e.noteOn(d.voice, d.note);
      else if (d.type === 'off') this.e.noteOff(d.voice);
      else if (d.type === 'update') this.e.update(d.song);
      else if (d.type === 'play') { this.e.setParams(d.song); this.e.play(d.song, d.opt); }
      else if (d.type === 'stop') { this.e.stop(); this.last = ''; this.port.postMessage({ type: 'pos', pos: null }); }
    };
  }
  process(_in, outputs) {
    const out = outputs[0];
    this.e.render(out[0], 0, out[0].length);
    for (let c = 1; c < out.length; c++) out[c].set(out[0]);
    // 再生の位置が変わったら画面へ知らせる（曲の最後まで行って止まった時も）
    const pos = this.e.position(), key = pos ? pos.order + ':' + pos.step : '';
    if (key !== this.last) { this.last = key; this.port.postMessage({ type: 'pos', pos }); }
    return true;
  }
}
registerProcessor('fos-sid', SidProcessor);
