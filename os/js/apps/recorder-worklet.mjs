// 音声レコーダーの音を拾う部品（AudioWorklet）。マイクの音を 2048 標本ずつまとめて画面の側へ送る。
// 画面の側は、録音中の切れ端だけを残し、ほかは音の大きさの表示に使う。
class FosRecorder extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Float32Array(2048);
    this.n = 0;
    this.port.onmessage = (e) => { if (e.data === 'flush' && this.n) this.send(); };
  }
  send() { const out = this.buf.slice(0, this.n); this.port.postMessage(out, [out.buffer]); this.n = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) for (let i = 0; i < ch.length; i++) { this.buf[this.n++] = ch[i]; if (this.n === this.buf.length) this.send(); }
    return true;
  }
}
registerProcessor('fos-recorder', FosRecorder);
