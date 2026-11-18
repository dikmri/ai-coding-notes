// 多重録音スタジオの、マイクの音を拾う部品（AudioWorklet）。2048 標本ずつまとめ、最初の標本の番号（音の時計の currentFrame）を付けて画面の側へ送る。
// 番号が付いているので、画面の側は「再生の位置が録り始めに来た瞬間」の標本から正確に切り出せる（core/daw.mjs の alignTake）。
// 2 チャンネルのマイクは平均して 1 チャンネルにする。入力が途切れて番号が飛んだら、そこで区切って送る。
class FosDawRec extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Float32Array(2048);
    this.n = 0;
    this.f0 = 0;
    // flush: 2048 に満たない残りを送り、送り終えたことを 'flushed' で知らせる（停止のときに最後の切れ端を受け取る）
    this.port.onmessage = (e) => { if (e.data === 'flush') { if (this.n) this.send(); this.port.postMessage('flushed'); } };
  }
  send() { const data = this.buf.slice(0, this.n); this.port.postMessage({ frame: this.f0, data }, [data.buffer]); this.n = 0; }
  process(inputs) {
    const chs = inputs[0];
    if (!chs || !chs.length) return true;
    if (this.n && currentFrame !== this.f0 + this.n) this.send();
    if (!this.n) this.f0 = currentFrame;
    const len = chs[0].length, k = 1 / chs.length;
    for (let i = 0; i < len; i++) {
      let v = 0;
      for (const c of chs) v += c[i];
      this.buf[this.n++] = v * k;
      if (this.n === this.buf.length) { this.send(); this.f0 = currentFrame + i + 1; }
    }
    return true;
  }
}
registerProcessor('fos-daw-rec', FosDawRec);
