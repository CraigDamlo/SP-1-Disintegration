
class TapeProcessor extends AudioWorkletProcessor {
  constructor(options){
    super();
    const opts = options.processorOptions || {};
    this.buf = opts.buffer ? new Float32Array(opts.buffer) : new Float32Array(1);
    this.sr = opts.sampleRate || sampleRate;
    this.readPos = 0;
    this.direction = 1;
    this.playing = false;
    this.frozen = false;
    this.generation = 0;
    this.decayFraction = 0;
    this.params = { wearRate:0.35, highEndLoss:0.55, dropoutDensity:0.4, wowFlutter:0.25 };
    this.filterState = 0;
    this.wobblePhase1 = 0;
    this.wobblePhase2 = 0;
    this.rngState = 12345;
    this.previewCounter = 0;
    this.port.onmessage = (e) => {
      const m = e.data;
      if(m.type === 'params') Object.assign(this.params, m.value);
      else if(m.type === 'play') this.playing = m.value;
      else if(m.type === 'reverse') this.direction = m.value ? -1 : 1;
      else if(m.type === 'freeze') this.frozen = m.value;
      else if(m.type === 'loadBuffer'){
        this.buf = new Float32Array(m.buffer);
        this.readPos = this.direction === 1 ? 0 : this.buf.length-1;
        this.generation = 0;
        this.decayFraction = 0;
        this.filterState = 0;
        this.postState(true);
      }
    };
  }
  rand(){
    this.rngState = (this.rngState*1103515245+12345) & 0x7fffffff;
    return this.rngState/0x7fffffff;
  }
  mutateBuffer(){
    const n = this.buf.length;
    const p = this.params;
    const progress = Math.min(1, this.decayFraction);
    const cutoffMix = progress*p.highEndLoss;
    const alpha = Math.max(0.02, 1 - cutoffMix*0.85);
    let z = 0;
    for(let i=0;i<n;i++){
      z = z + alpha*(this.buf[i]-z);
      this.buf[i] = z;
    }
    const dropoutAmount = progress*p.dropoutDensity;
    const events = Math.floor(dropoutAmount*n/this.sr*10);
    for(let e=0;e<events;e++){
      if(this.rand() > dropoutAmount*1.3+0.05) continue;
      const start = Math.floor(this.rand()*n);
      const len = Math.floor((0.002+dropoutAmount*0.05)*this.sr);
      const end = Math.min(n, start+len);
      for(let i=start;i<end;i++){
        const t = (i-start)/Math.max(1,end-start);
        const fade = Math.sin(Math.PI*t);
        this.buf[i] *= (1 - fade*Math.min(1,dropoutAmount*1.5+0.2));
      }
    }
    const satAmt = progress*0.6;
    const noiseAmt = progress*0.012;
    for(let i=0;i<n;i++){
      let v = this.buf[i];
      v = Math.tanh(v*(1+satAmt*3))/(1+satAmt*0.5);
      v += (this.rand()*2-1)*noiseAmt;
      this.buf[i] = v;
    }
    const gain = 1 - progress*0.55;
    for(let i=0;i<n;i++) this.buf[i] *= gain > 0.05 ? (gain/Math.max(gain, 0.999999)) : 1;
    this.generation += 1;
    const wear = 0.004+p.wearRate*0.02;
    this.decayFraction = Math.min(1, this.decayFraction + wear);
    this.postState(true);
  }
  postState(withPreview){
    let preview = null;
    if(withPreview){
      const steps = 200;
      preview = new Float32Array(steps);
      const n = this.buf.length;
      for(let i=0;i<steps;i++) preview[i] = this.buf[Math.floor(i/steps*n)];
    }
    this.port.postMessage({
      type:'state', generation:this.generation, decayFraction:this.decayFraction, preview: preview
    });
  }
  process(inputs, outputs){
    const out = outputs[0];
    const n = this.buf.length;
    if(n < 2 || !this.playing){
      for(const ch of out) ch.fill(0);
      return true;
    }
    const p = this.params;
    for(let i=0;i<out[0].length;i++){
      this.wobblePhase1 += (2*Math.PI*0.27)/this.sr;
      this.wobblePhase2 += (2*Math.PI*0.77)/this.sr;
      const wobble = Math.sin(this.wobblePhase1)*0.6 + Math.sin(this.wobblePhase2)*0.4;
      const depth = this.decayFraction*p.wowFlutter;
      const rate = 1 + wobble*depth*0.01;
      this.readPos += this.direction*rate;
      if(this.readPos >= n){
        this.readPos -= n;
        if(!this.frozen) this.mutateBuffer();
      } else if(this.readPos < 0){
        this.readPos += n;
        if(!this.frozen) this.mutateBuffer();
      }
      const i0 = Math.floor(this.readPos)%n;
      const i1 = (i0+1)%n;
      const frac = this.readPos - Math.floor(this.readPos);
      const s = this.buf[i0]*(1-frac) + this.buf[i1]*frac;
      for(const ch of out) ch[i] = s;
    }
    return true;
  }
}
registerProcessor('tape-processor', TapeProcessor);
