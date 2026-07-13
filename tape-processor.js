
// tape-processor.js v1.10 - keep this in sync with the version-tag in index.html
console.log('[SP-1 Disintegration] tape-processor.js v1.10 loaded');

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
    this.baking = false;
    this.bakePenaltySamplesLeft = 0;
    this.stuttering = false;
    this.stutterAnchor = 0;
    this.stutterPos = 0;
    this.stutterChunkLen = 1;
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
      else if(m.type === 'bake'){
        // Bake temporarily blends dropped-out audio back in (a nod to
        // literally baking sticky-shed tape to make it playable one more
        // time), rendered instantly so it's audible right away rather
        // than waiting for the loop to wrap. Releasing it snaps back to
        // the true current decay state and leaves a short wear penalty -
        // the relief was borrowed, not free.
        this.baking = m.value;
        if(this.baking){
          this.renderPreview(0.6);
        } else {
          this.bakePenaltySamplesLeft = Math.floor(this.sr*4);
          this.renderPreview(0);
        }
      }
      else if(m.type === 'stutter'){
        // Stutter freezes the real playhead in place (no decay progress
        // while held) and repeats a short slice at that position; on
        // release playback resumes exactly where it paused, so no part
        // of the loop is skipped.
        this.stuttering = m.value;
        if(this.stuttering){
          this.stutterAnchor = this.readPos;
          this.stutterChunkLen = Math.max(1, Math.floor(this.sr*0.12));
          this.stutterPos = 0;
        }
      }
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
  mutateChannel(pristine, aliveMask, progress, p, doKill, relief){
    const n = pristine.length;
    const reliefProgress = progress*(1-relief*0.6);
    const cutoffMix = reliefProgress*p.highEndLoss;
    const alpha = Math.max(0.05, 1 - cutoffMix*0.8);
    let z = 0;
    const toned = new Float32Array(n);
    for(let i=0;i<n;i++){
      z = z + alpha*(pristine[i]-z);
      toned[i] = z;
    }
    const satAmt = reliefProgress*0.35;
    const noiseAmt = reliefProgress*0.008;
    const satK = 1 + satAmt*2.5;
    for(let i=0;i<n;i++){
      let v = Math.tanh(toned[i]*satK)/satK;
      v += (this.rand()*2-1)*noiseAmt;
      toned[i] = v;
    }
    if(doKill){
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
    }
    const out = new Float32Array(n);
    for(let i=0;i<n;i++){
      let mask = aliveMask[i];
      if(relief > 0) mask = Math.min(1, mask + relief*(1-mask));
      out[i] = toned[i]*mask;
    }
    return out;
  }
  mutateBuffer(){
    const p = this.params;
    const progress = Math.min(1, this.decayFraction);
    const relief = this.baking ? 0.6 : 0;
    this.bufs[0] = this.mutateChannel(this.pristineBufs[0], this.aliveMasks[0], progress, p, true, relief);
    this.bufs[1] = this.mutateChannel(this.pristineBufs[1], this.aliveMasks[1], progress, p, true, relief);
    this.generation += 1;
    const wearMultiplier = this.bakePenaltySamplesLeft > 0 ? 2 : 1;
    const wear = (0.004+p.wearRate*0.02)*wearMultiplier;
    this.decayFraction = Math.min(1, this.decayFraction + wear);
    this.postState(true);
  }
  // Instant re-render at the current decay state with no new dropout
  // damage - used to make Bake's on/off transition audible immediately
  // instead of waiting for the loop to wrap around.
  renderPreview(relief){
    const p = this.params;
    const progress = Math.min(1, this.decayFraction);
    this.bufs[0] = this.mutateChannel(this.pristineBufs[0], this.aliveMasks[0], progress, p, false, relief);
    this.bufs[1] = this.mutateChannel(this.pristineBufs[1], this.aliveMasks[1], progress, p, false, relief);
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
      if(this.bakePenaltySamplesLeft > 0) this.bakePenaltySamplesLeft--;
      if(this.stuttering){
        const local = this.stutterPos % this.stutterChunkLen;
        let pos = this.stutterAnchor + this.direction*local;
        pos = ((pos % n)+n)%n;
        const i0 = Math.floor(pos)%n, i1 = (i0+1)%n, frac = pos-Math.floor(pos);
        const rampSamples = Math.min(128, this.stutterChunkLen);
        const fade = local < rampSamples ? local/rampSamples : 1;
        out[0][i] = (bufL[i0]*(1-frac)+bufL[i1]*frac)*fade;
        if(out.length > 1) out[1][i] = (bufR[i0]*(1-frac)+bufR[i1]*frac)*fade;
        this.stutterPos++;
        continue;
      }
      this.wobblePhase1 += (2*Math.PI*0.27)/this.sr;
      this.wobblePhase2 += (2*Math.PI*0.77)/this.sr;
      const wobble = Math.sin(this.wobblePhase1)*0.6 + Math.sin(this.wobblePhase2)*0.4;
      // Flutter is a live FX, not a decay parameter - it perturbs playback
      // speed only, never touches the buffer or the alive mask, so unlike
      // wearRate/highEndLoss/dropoutDensity it isn't gated by
      // decayFraction. The fader alone sets depth, audible from
      // generation 1 regardless of wear state. Ceiling raised from 0.01
      // to 0.05 (was ~1% max speed wobble, barely perceptible even at
      // max fader + full decay; now ~5% at max fader, a clearly audible
      // wow/flutter character on its own).
      const rate = 1 + wobble*p.wowFlutter*0.05;
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
