
// tape-processor.js v1.8 - keep this in sync with the version-tag in index.html
console.log('[SP-1 Disintegration] tape-processor.js v1.8 loaded');

class TapeProcessor extends AudioWorkletProcessor {
  constructor(options){
    super();
    const opts = options.processorOptions || {};
    const bL = opts.bufferL ? new Float32Array(opts.bufferL) : new Float32Array(1);
    const bR = opts.bufferR ? new Float32Array(opts.bufferR) : new Float32Array(bL);
    this.bufs = [bL, bR];
    this.pristineBufs = [bL.slice(), bR.slice()];
    this.aliveMasks = [new Float32Array(bL.length).fill(1), new Float32Array(bR.length).fill(1)];
    this.sr = opts.sampleRate || sampleRate;
    this.readPos = 0;
    this.direction = 1;
    this.playing = false;
    this.frozen = false;
    this.generation = 0;
    this.decayFraction = 0;
    this.params = { wearRate:0.35, highEndLoss:0.55, dropoutDensity:0.4, wowFlutter:0.25 };
    this.wobblePhase1 = 0;
    this.wobblePhase2 = 0;
    this.rngState = 12345;
    this.port.onmessage = (e) => {
      const m = e.data;
      if(m.type === 'params') Object.assign(this.params, m.value);
      else if(m.type === 'play') this.playing = m.value;
      else if(m.type === 'reverse') this.direction = m.value ? -1 : 1;
      else if(m.type === 'freeze') this.frozen = m.value;
      else if(m.type === 'loadBuffer'){
        const l = new Float32Array(m.bufferL);
        const r = m.bufferR ? new Float32Array(m.bufferR) : new Float32Array(l);
        this.bufs = [l, r];
        // The loaded buffers become the new pristine reference. Tone is
        // always computed fresh from this reference, never cascaded, so
        // loading a saved (already-decayed) slot resumes cleanly rather
        // than re-compounding on top of it.
        this.pristineBufs = [l.slice(), r.slice()];
        this.aliveMasks = [
          m.aliveMaskL ? new Float32Array(m.aliveMaskL) : new Float32Array(l.length).fill(1),
          m.aliveMaskR ? new Float32Array(m.aliveMaskR) : new Float32Array(r.length).fill(1)
        ];
        this.readPos = this.direction === 1 ? 0 : l.length-1;
        this.generation = m.generation || 0;
        this.decayFraction = m.decayFraction || 0;
        this.postState(true);
      }
      else if(m.type === 'requestSnapshot'){
        this.port.postMessage({
          type:'snapshot', slot:m.slot,
          bufferL:this.bufs[0].buffer.slice(0), bufferR:this.bufs[1].buffer.slice(0),
          aliveMaskL:this.aliveMasks[0].buffer.slice(0), aliveMaskR:this.aliveMasks[1].buffer.slice(0),
          generation:this.generation, decayFraction:this.decayFraction
        });
      }
    };
  }
  rand(){
    this.rngState = (this.rngState*1103515245+12345) & 0x7fffffff;
    return this.rngState/0x7fffffff;
  }
  // Processes ONE channel. Called separately for L and R with their own
  // pristine reference, own alive mask, and own draws from the shared RNG
  // stream - since each channel's kill-chunk positions are chosen from
  // independent random draws, the two channels disintegrate differently,
  // same as real tape where oxide doesn't flake off both tracks identically.
  mutateChannel(pristine, aliveMask, progress, p){
    const n = pristine.length;
    const cutoffMix = progress*p.highEndLoss;
    const alpha = Math.max(0.05, 1 - cutoffMix*0.8);
    let z = 0;
    const toned = new Float32Array(n);
    for(let i=0;i<n;i++){
      z = z + alpha*(pristine[i]-z);
      toned[i] = z;
    }
    const satAmt = progress*0.35;
    const noiseAmt = progress*0.008;
    const satK = 1 + satAmt*2.5;
    for(let i=0;i<n;i++){
      let v = Math.tanh(toned[i]*satK)/satK;
      v += (this.rand()*2-1)*noiseAmt;
      toned[i] = v;
    }
    const killFraction = 0.006 + p.wearRate*p.dropoutDensity*0.05;
    const samplesToKill = Math.floor(n*killFraction);
    let killed = 0, attempts = 0;
    while(killed < samplesToKill && attempts < 250){
      attempts++;
      const start = Math.floor(this.rand()*n);
      const chunkLen = Math.floor((0.01+this.rand()*0.08)*this.sr);
      const end = Math.min(n, start+chunkLen);
      let anyAlive = false;
      for(let i=start;i<end;i++){ if(aliveMask[i] > 0.01){ anyAlive = true; break; } }
      if(!anyAlive) continue;
      const fadeLen = Math.min(24, Math.floor((end-start)/4));
      for(let i=start;i<end;i++){
        let m = 0;
        if(i-start < fadeLen) m = 1-(i-start)/Math.max(1,fadeLen);
        else if(end-i < fadeLen) m = 1-(end-i)/Math.max(1,fadeLen);
        aliveMask[i] = Math.min(aliveMask[i], m);
      }
      killed += (end-start);
    }
    const out = new Float32Array(n);
    for(let i=0;i<n;i++) out[i] = toned[i]*aliveMask[i];
    return out;
  }
  mutateBuffer(){
    const p = this.params;
    const progress = Math.min(1, this.decayFraction);
    this.bufs[0] = this.mutateChannel(this.pristineBufs[0], this.aliveMasks[0], progress, p);
    this.bufs[1] = this.mutateChannel(this.pristineBufs[1], this.aliveMasks[1], progress, p);
    this.generation += 1;
    const wear = 0.004+p.wearRate*0.02;
    this.decayFraction = Math.min(1, this.decayFraction + wear);
    this.postState(true);
  }
  postState(withPreview){
    let previewL = null, previewR = null;
    if(withPreview){
      const steps = 200;
      const n = this.bufs[0].length;
      previewL = new Float32Array(steps);
      previewR = new Float32Array(steps);
      for(let i=0;i<steps;i++){
        const idx = Math.floor(i/steps*n);
        previewL[i] = this.bufs[0][idx];
        previewR[i] = this.bufs[1][idx];
      }
    }
    this.port.postMessage({
      type:'state', generation:this.generation, decayFraction:this.decayFraction,
      previewL: previewL, previewR: previewR
    });
  }
  process(inputs, outputs){
    const out = outputs[0];
    const n = this.bufs[0].length;
    if(n < 2 || !this.playing){
      for(const ch of out) ch.fill(0);
      return true;
    }
    const p = this.params;
    const bufL = this.bufs[0], bufR = this.bufs[1];
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
      out[0][i] = bufL[i0]*(1-frac) + bufL[i1]*frac;
      if(out.length > 1) out[1][i] = bufR[i0]*(1-frac) + bufR[i1]*frac;
    }
    return true;
  }
}
registerProcessor('tape-processor', TapeProcessor);
