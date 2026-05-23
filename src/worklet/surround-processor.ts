// surround-processor.ts
// Real-time AudioWorkletProcessor for Aether Spatial Engine v3 (Polished Sound DSP Engine).

declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}

declare function registerProcessor(name: string, processorCtor: any): void;

declare const sampleRate: number;

// Complex Radix-2 FFT class for 256-point operations
class FFT256 {
  revTable = new Int32Array(256);
  sinTable = new Float32Array(128);
  cosTable = new Float32Array(128);

  constructor() {
    for (let i = 0; i < 256; i++) {
      let r = 0;
      for (let j = 0; j < 8; j++) {
        if ((i & (1 << j)) !== 0) {
          r |= (1 << (7 - j));
        }
      }
      this.revTable[i] = r;
    }
    for (let i = 0; i < 128; i++) {
      const angle = (2 * Math.PI * i) / 256;
      this.sinTable[i] = Math.sin(angle);
      this.cosTable[i] = Math.cos(angle);
    }
  }

  fft(real: Float32Array, imag: Float32Array) {
    for (let i = 0; i < 256; i++) {
      const r = this.revTable[i];
      if (i < r) {
        let temp = real[i]; real[i] = real[r]; real[r] = temp;
        temp = imag[i]; imag[i] = imag[r]; imag[r] = temp;
      }
    }
    for (let size = 2; size <= 256; size <<= 1) {
      const halfSize = size >> 1;
      const tabStep = 256 / size;
      for (let i = 0; i < 256; i += size) {
        for (let j = 0; j < halfSize; j++) {
          const k = i + j;
          const l = k + halfSize;
          const twiddleIdx = j * tabStep;
          const wr = this.cosTable[twiddleIdx];
          const wi = -this.sinTable[twiddleIdx];

          const tr = real[l] * wr - imag[l] * wi;
          const ti = real[l] * wi + imag[l] * wr;

          real[l] = real[k] - tr;
          imag[l] = imag[k] - ti;
          real[k] += tr;
          imag[k] += ti;
        }
      }
    }
  }

  ifft(real: Float32Array, imag: Float32Array) {
    for (let i = 0; i < 256; i++) {
      imag[i] = -imag[i];
    }
    this.fft(real, imag);
    for (let i = 0; i < 256; i++) {
      real[i] /= 256;
      imag[i] = -imag[i] / 256;
    }
  }
}

// Uniformly Partitioned Overlap-Save Binaural Convolver
class BinauralConvolver {
  private fftHelper: FFT256;
  numPartitions = 1;
  private Ipsi_real: Float32Array[] = [];
  private Ipsi_imag: Float32Array[] = [];
  private Contra_real: Float32Array[] = [];
  private Contra_imag: Float32Array[] = [];

  // Targets for smooth crossfading coefficient interpolation
  private Target_Ipsi_real: Float32Array[] = [];
  private Target_Ipsi_imag: Float32Array[] = [];
  private Target_Contra_real: Float32Array[] = [];
  private Target_Contra_imag: Float32Array[] = [];

  private X_real_ring: Float32Array[] = [];
  private X_imag_ring: Float32Array[] = [];
  private ringPtr = 0;
  private inputHistory = new Float32Array(256);

  constructor(fftHelper: FFT256, ipsiTaps: number[], contraTaps: number[]) {
    this.fftHelper = fftHelper;
    this.updateTaps(ipsiTaps, contraTaps);
  }

  updateTaps(ipsiTaps: number[], contraTaps: number[]) {
    const L = 128;
    const maxLen = Math.max(ipsiTaps.length, contraTaps.length);
    const newPartitions = Math.max(1, Math.ceil(maxLen / L));

    this.numPartitions = newPartitions;
    this.Target_Ipsi_real = [];
    this.Target_Ipsi_imag = [];
    this.Target_Contra_real = [];
    this.Target_Contra_imag = [];

    if (this.X_real_ring.length < newPartitions) {
      const diff = newPartitions - this.X_real_ring.length;
      for (let i = 0; i < diff; i++) {
        this.X_real_ring.push(new Float32Array(256));
        this.X_imag_ring.push(new Float32Array(256));
      }
    }
    
    if (this.ringPtr >= newPartitions) {
      this.ringPtr = 0;
    }

    for (let p = 0; p < newPartitions; p++) {
      const ipsi_r = new Float32Array(256);
      const ipsi_i = new Float32Array(256);
      const contra_r = new Float32Array(256);
      const contra_i = new Float32Array(256);

      const start = p * L;
      for (let i = 0; i < L; i++) {
        ipsi_r[i] = (start + i < ipsiTaps.length) ? ipsiTaps[start + i] : 0;
        contra_r[i] = (start + i < contraTaps.length) ? contraTaps[start + i] : 0;
      }

      this.fftHelper.fft(ipsi_r, ipsi_i);
      this.fftHelper.fft(contra_r, contra_i);

      this.Target_Ipsi_real.push(ipsi_r);
      this.Target_Ipsi_imag.push(ipsi_i);
      this.Target_Contra_real.push(contra_r);
      this.Target_Contra_imag.push(contra_i);

      if (this.Ipsi_real.length <= p) {
        this.Ipsi_real.push(new Float32Array(ipsi_r));
        this.Ipsi_imag.push(new Float32Array(ipsi_i));
        this.Contra_real.push(new Float32Array(contra_r));
        this.Contra_imag.push(new Float32Array(contra_i));
      }
    }
  }

  processBlock(inputBlock: Float32Array, accumRealL: Float32Array, accumImagL: Float32Array, accumRealR: Float32Array, accumImagR: Float32Array) {
    const M = this.numPartitions;

    // Smoothly step spectrum coefficients toward targets
    for (let p = 0; p < M; p++) {
      const ir = this.Ipsi_real[p];
      const ii = this.Ipsi_imag[p];
      const cr = this.Contra_real[p];
      const ci = this.Contra_imag[p];

      const tir = this.Target_Ipsi_real[p];
      const tii = this.Target_Ipsi_imag[p];
      const tcr = this.Target_Contra_real[p];
      const tci = this.Target_Contra_imag[p];

      for (let i = 0; i < 256; i++) {
        ir[i] += (tir[i] - ir[i]) * 0.15;
        ii[i] += (tii[i] - ii[i]) * 0.15;
        cr[i] += (tcr[i] - cr[i]) * 0.15;
        ci[i] += (tci[i] - ci[i]) * 0.15;
      }
    }

    // Shift input history
    for (let i = 0; i < 128; i++) {
      this.inputHistory[i] = this.inputHistory[i + 128];
      this.inputHistory[i + 128] = inputBlock[i];
    }

    // FFT on history
    const xr = this.X_real_ring[this.ringPtr];
    const xi = this.X_imag_ring[this.ringPtr];
    xr.set(this.inputHistory);
    xi.fill(0);

    this.fftHelper.fft(xr, xi);

    // Uniformly Partitioned Overlap-Save complex multiplication
    for (let m = 0; m < M; m++) {
      let idx = (this.ringPtr - m) % M;
      if (idx < 0) idx += M;

      const curX_r = this.X_real_ring[idx];
      const curX_i = this.X_imag_ring[idx];

      const ir = this.Ipsi_real[m];
      const ii = this.Ipsi_imag[m];
      const cr = this.Contra_real[m];
      const ci = this.Contra_imag[m];

      for (let i = 0; i < 256; i++) {
        accumRealL[i] += curX_r[i] * ir[i] - curX_i[i] * ii[i];
        accumImagL[i] += curX_r[i] * ii[i] + curX_i[i] * ir[i];
        accumRealR[i] += curX_r[i] * cr[i] - curX_i[i] * ci[i];
        accumImagR[i] += curX_r[i] * ci[i] + curX_i[i] * cr[i];
      }
    }

    this.ringPtr = (this.ringPtr + 1) % M;
  }
}

// Biquad filter implementation (Lowpass, Peaking, Highshelf, Bandpass, Notch)
class BiquadFilter {
  b0 = 1; b1 = 0; b2 = 0; a0 = 1; a1 = 0; a2 = 0;
  x1 = 0; x2 = 0; y1 = 0; y2 = 0;

  setLowpass(cutoff: number, sampleRate: number, q: number = 0.707) {
    const w0 = 2 * Math.PI * cutoff / sampleRate;
    const alpha = Math.sin(w0) / (2 * q);
    const cosw0 = Math.cos(w0);
    this.a0 = 1 + alpha;
    this.b0 = (1 - cosw0) / 2 / this.a0;
    this.b1 = (1 - cosw0) / this.a0;
    this.b2 = (1 - cosw0) / 2 / this.a0;
    this.a1 = -2 * cosw0 / this.a0;
    this.a2 = (1 - alpha) / this.a0;
  }

  setHighpass(cutoff: number, sampleRate: number, q: number = 0.707) {
    const w0 = 2 * Math.PI * cutoff / sampleRate;
    const alpha = Math.sin(w0) / (2 * q);
    const cosw0 = Math.cos(w0);
    this.a0 = 1 + alpha;
    this.b0 = (1 + cosw0) / 2 / this.a0;
    this.b1 = -(1 + cosw0) / this.a0;
    this.b2 = (1 + cosw0) / 2 / this.a0;
    this.a1 = -2 * cosw0 / this.a0;
    this.a2 = (1 - alpha) / this.a0;
  }

  setPeaking(frequency: number, sampleRate: number, gainDb: number, q: number = 1.0) {
    const w0 = 2 * Math.PI * frequency / sampleRate;
    const alpha = Math.sin(w0) / (2 * q);
    const cosw0 = Math.cos(w0);
    const A = Math.pow(10, gainDb / 40);
    this.a0 = 1 + alpha / A;
    this.b0 = (1 + alpha * A) / this.a0;
    this.b1 = -2 * cosw0 / this.a0;
    this.b2 = (1 - alpha * A) / this.a0;
    this.a1 = -2 * cosw0 / this.a0;
    this.a2 = (1 - alpha / A) / this.a0;
  }

  setHighshelf(frequency: number, sampleRate: number, gainDb: number, q: number = 0.707) {
    const w0 = 2 * Math.PI * frequency / sampleRate;
    const cosw0 = Math.cos(w0);
    const A = Math.pow(10, gainDb / 40);
    const beta = Math.sqrt(A) / q;
    
    this.a0 = (A + 1) + (A - 1) * cosw0 + beta * Math.sin(w0);
    this.b0 = (A * ((A + 1) - (A - 1) * cosw0 + beta * Math.sin(w0))) / this.a0;
    this.b1 = (2 * A * ((A - 1) - (A + 1) * cosw0)) / this.a0;
    this.b2 = (A * ((A + 1) - (A - 1) * cosw0 - beta * Math.sin(w0))) / this.a0;
    this.a1 = (-2 * ((A - 1) + (A + 1) * cosw0)) / this.a0;
    this.a2 = ((A + 1) + (A - 1) * cosw0 - beta * Math.sin(w0)) / this.a0;
  }

  setLowshelf(frequency: number, sampleRate: number, gainDb: number, q: number = 0.707) {
    const w0 = 2 * Math.PI * frequency / sampleRate;
    const cosw0 = Math.cos(w0);
    const A = Math.pow(10, gainDb / 40);
    const beta = Math.sqrt(A) / q;

    this.a0 = (A + 1) - (A - 1) * cosw0 + beta * Math.sin(w0);
    this.b0 = (A * ((A + 1) - (A - 1) * cosw0 + beta * Math.sin(w0))) / this.a0;
    this.b1 = (2 * A * ((A - 1) - (A + 1) * cosw0)) / this.a0;
    this.b2 = (A * ((A + 1) - (A - 1) * cosw0 - beta * Math.sin(w0))) / this.a0;
    this.a1 = (2 * ((A - 1) - (A + 1) * cosw0)) / this.a0;
    this.a2 = ((A + 1) - (A - 1) * cosw0 - beta * Math.sin(w0)) / this.a0;
  }

  setBandpass(cutoff: number, sampleRate: number, q: number = 1.0) {
    const w0 = 2 * Math.PI * cutoff / sampleRate;
    const alpha = Math.sin(w0) / (2 * q);
    const cosw0 = Math.cos(w0);
    this.a0 = 1 + alpha;
    this.b0 = alpha / this.a0;
    this.b1 = 0;
    this.b2 = -alpha / this.a0;
    this.a1 = -2 * cosw0 / this.a0;
    this.a2 = (1 - alpha) / this.a0;
  }

  setNotch(frequency: number, sampleRate: number, q: number = 10.0) {
    const w0 = 2 * Math.PI * frequency / sampleRate;
    const alpha = Math.sin(w0) / (2 * q);
    const cosw0 = Math.cos(w0);
    this.a0 = 1 + alpha;
    this.b0 = 1 / this.a0;
    this.b1 = -2 * cosw0 / this.a0;
    this.b2 = 1 / this.a0;
    this.a1 = -2 * cosw0 / this.a0;
    this.a2 = (1 - alpha) / this.a0;
  }

  process(x: number): number {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

// Circular buffer delay line
class DelayLine {
  buffer: Float32Array;
  writePtr = 0;
  constructor(size: number) {
    this.buffer = new Float32Array(size);
  }
  write(sample: number) {
    this.buffer[this.writePtr] = sample;
    this.writePtr = (this.writePtr + 1) % this.buffer.length;
  }
  read(delaySamples: number): number {
    let readPtr = (this.writePtr - Math.floor(delaySamples)) % this.buffer.length;
    while (readPtr < 0) readPtr += this.buffer.length;
    return this.buffer[readPtr];
  }
}

// Peak Limiter to prevent clipping
class Limiter {
  threshold = 0.98;
  attack = 0.001; // 1 ms
  release = 0.15; // 150 ms
  envelope = 0;
  sampleRate = 48000;
  outL = 0;
  outR = 0;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
  }

  process(l: number, r: number): void {
    const peak = Math.max(Math.abs(l), Math.abs(r));
    const attCoef = Math.exp(-1.0 / (this.sampleRate * this.attack));
    const relCoef = Math.exp(-1.0 / (this.sampleRate * this.release));

    if (peak > this.envelope) {
      this.envelope = attCoef * (this.envelope - peak) + peak;
    } else {
      this.envelope = relCoef * (this.envelope - peak) + peak;
    }

    let gain = 1.0;
    if (this.envelope > this.threshold) {
      gain = this.threshold / this.envelope;
    }

    this.outL = l * gain;
    this.outR = r * gain;
  }
}

// Feedback Delay Network for dynamic room acoustics reverb
class ReverbFDN {
  delays: DelayLine[];
  filters: BiquadFilter[];
  dampingFilters: BiquadFilter[];
  delayTimes = [983, 1153, 1429, 1601];

  constructor(sampleRate: number) {
    this.delays = this.delayTimes.map(samples => {
      const actualSamples = Math.floor(samples * (sampleRate / 48000));
      return new DelayLine(actualSamples);
    });
    this.filters = this.delayTimes.map(() => {
      const f = new BiquadFilter();
      f.setLowpass(3500, sampleRate, 0.5);
      return f;
    });
    this.dampingFilters = this.delayTimes.map(() => {
      const f = new BiquadFilter();
      f.setLowpass(2200, sampleRate, 0.4);
      return f;
    });
  }

  outReverbL = 0;
  outReverbR = 0;

  process(l: number, r: number, roomSize: number, absorption: number): void {
    if (roomSize <= 0) {
      this.outReverbL = 0;
      this.outReverbR = 0;
      return;
    }

    const s0 = this.delays[0].read(this.delays[0].buffer.length - 1);
    const s1 = this.delays[1].read(this.delays[1].buffer.length - 1);
    const s2 = this.delays[2].read(this.delays[2].buffer.length - 1);
    const s3 = this.delays[3].read(this.delays[3].buffer.length - 1);

    const f0 = this.filters[0].process(s0);
    const f1 = this.filters[1].process(s1);
    const f2 = this.filters[2].process(s2);
    const f3 = this.filters[3].process(s3);

    // Dynamic damping filters representing surface/wall absorption
    const d0 = this.dampingFilters[0].process(f0);
    const d1 = this.dampingFilters[1].process(f1);
    const d2 = this.dampingFilters[2].process(f2);
    const d3 = this.dampingFilters[3].process(f3);

    // Feedback gain scalar
    const g = 0.55 * roomSize * (1.0 - absorption * 0.4);
    
    // Hadamard mixing matrix
    const o0 = g * (d0 + d1 + d2 + d3);
    const o1 = g * (d0 - d1 + d2 - d3);
    const o2 = g * (d0 + d1 - d2 - d3);
    const o3 = g * (d0 - d1 - d2 + d3);

    const input = (l + r) * 0.5;
    this.delays[0].write(input + o0);
    this.delays[1].write(input + o1);
    this.delays[2].write(input + o2);
    this.delays[3].write(input + o3);

    this.outReverbL = (d0 + d2) * 0.35;
    this.outReverbR = (d1 + d3) * 0.35;
  }
}

// Phase-Aligned Subharmonic Bass Synthesizer
class SubharmonicSynthesizer {
  private lastSample = 0;
  private state = false;
  private counter = 0;
  private filteredSub = 0;
  private lpf = new BiquadFilter();

  constructor(sampleRate: number) {
    this.lpf.setLowpass(55, sampleRate, 0.707); // sub-bass lowpass filter
  }

  process(monoSignal: number): number {
    // Detect positive zero crossings to divide the fundamental frequency by 2
    if (monoSignal > 0.005 && this.lastSample <= 0.005) {
      this.counter++;
      if (this.counter >= 2) {
        this.state = !this.state;
        this.counter = 0;
      }
    }
    this.lastSample = monoSignal;

    // Generate a square/pulse wave at half frequency, smoothed by lowpass
    const squareVal = this.state ? 1.0 : -1.0;
    
    // Scale pulse by fundamental envelope
    const rawSub = squareVal * Math.abs(monoSignal) * 0.65;
    this.filteredSub = this.lpf.process(rawSub);
    
    return this.filteredSub;
  }
}

// Dynamic Sibilance De-esser Filter
class DeEsser {
  private detectorHPF = new BiquadFilter();
  private notch = new BiquadFilter();
  private envelope = 0;
  private sampleRate: number;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
    this.detectorHPF.setHighpass(6000, sampleRate, 0.707);
    this.notch.setPeaking(6500, sampleRate, 0, 1.5);
  }

  process(x: number, intensity: number): number {
    if (intensity <= 0) return x;

    const hp = this.detectorHPF.process(x);
    const absHp = Math.abs(hp);
    
    const att = Math.exp(-1.0 / (this.sampleRate * 0.005)); // 5ms attack
    const rel = Math.exp(-1.0 / (this.sampleRate * 0.05)); // 50ms release
    if (absHp > this.envelope) {
      this.envelope = att * (this.envelope - absHp) + absHp;
    } else {
      this.envelope = rel * (this.envelope - absHp) + absHp;
    }

    if (this.envelope > 0.015) {
      const reductionDb = -Math.min(8.0, (this.envelope - 0.015) * 45 * intensity);
      this.notch.setPeaking(6500, this.sampleRate, reductionDb, 1.5);
    } else {
      this.notch.setPeaking(6500, this.sampleRate, 0, 1.5);
    }

    return this.notch.process(x);
  }
}

// LFO Helper for Haas delay drift modulation
class SlowLFO {
  private phase = 0;
  private step = 0;
  constructor(frequency: number, sampleRate: number) {
    this.step = (2 * Math.PI * frequency) / sampleRate;
  }
  next(): number {
    this.phase += this.step;
    if (this.phase >= 2 * Math.PI) {
      this.phase -= 2 * Math.PI;
    }
    return Math.sin(this.phase);
  }
}

// AI Audio Scene Analyzer
class AISpatialAnalyzer {
  lastClass = "flat";
  result = {
    classification: "flat",
    vocalBoostDb: 0,
    bassBoostFactor: 1.0,
    widthFactor: 1.0
  };

  detect(inL: Float32Array, inR: Float32Array, sampleRateValue: number): {
    classification: string;
    vocalBoostDb: number;
    bassBoostFactor: number;
    widthFactor: number;
  } {
    let sumSqL = 0;
    let sumSqR = 0;
    let dotProduct = 0;
    let peak = 0;
    let zeroCrossings = 0;
    const len = inL.length;

    // Temporal Flatness Proxy (Impulsiveness)
    // Divide 128 samples into 4 sub-blocks of 32 samples each
    let subRms = [0, 0, 0, 0];
    for (let b = 0; b < 4; b++) {
      let subSum = 0;
      for (let j = 0; j < 32; j++) {
        const val = (inL[b * 32 + j] + inR[b * 32 + j]) * 0.5;
        subSum += val * val;
      }
      subRms[b] = Math.sqrt(subSum / 32.0);
    }

    const arithMean = (subRms[0] + subRms[1] + subRms[2] + subRms[3]) / 4;
    const geomMean = Math.exp((Math.log(subRms[0] + 1e-6) + Math.log(subRms[1] + 1e-6) + Math.log(subRms[2] + 1e-6) + Math.log(subRms[3] + 1e-6)) / 4);
    const temporalFlatness = arithMean > 1e-6 ? geomMean / arithMean : 1.0;

    for (let i = 0; i < len; i++) {
      const l = inL[i];
      const r = inR[i];
      sumSqL += l * l;
      sumSqR += r * r;
      dotProduct += l * r;
      const absL = Math.abs(l);
      const absR = Math.abs(r);
      if (absL > peak) peak = absL;
      if (absR > peak) peak = absR;

      if (i > 0) {
        if ((inL[i] >= 0 && inL[i - 1] < 0) || (inL[i] < 0 && inL[i - 1] >= 0)) {
          zeroCrossings++;
        }
      }
    }

    const rmsL = Math.sqrt(sumSqL / len);
    const rmsR = Math.sqrt(sumSqR / len);
    const rms = (rmsL + rmsR) * 0.5;

    const norm = Math.sqrt(sumSqL) * Math.sqrt(sumSqR);
    const correlation = norm > 1e-5 ? dotProduct / norm : 0;
    const crest = rms > 1e-4 ? peak / rms : 1;
    const zcrRate = zeroCrossings / len;
    const frequencyProxy = zcrRate * (sampleRateValue / 2);

    let classification = "flat";
    let vocalBoostDb = 0;
    let bassBoostFactor = 1.0;
    let widthFactor = 1.0;

    if (rms < 0.003) {
      classification = "ambient";
      vocalBoostDb = 0;
      bassBoostFactor = 0.5;
      widthFactor = 1.35;
    } else if (crest > 4.5 && rms > 0.07) {
      classification = "action";
      vocalBoostDb = -1.5;
      bassBoostFactor = 1.45;
      widthFactor = 1.15;
    } else if (correlation > 0.75 && frequencyProxy > 800 && frequencyProxy < 3500 && temporalFlatness < 0.85) {
      // Speech / dialogue has high correlation and is dynamic/impulsive (low flatness)
      classification = "dialogue";
      vocalBoostDb = 5.0;
      bassBoostFactor = 0.7;
      widthFactor = 0.8;
    } else if (correlation < 0.45 || (temporalFlatness > 0.88 && correlation < 0.65)) {
      // Music typically has wider spatial field and steady harmonic energy (high flatness)
      classification = "music";
      vocalBoostDb = 0;
      bassBoostFactor = 1.2;
      widthFactor = 1.3;
    }

    this.lastClass = classification;

    this.result.classification = classification;
    this.result.vocalBoostDb = vocalBoostDb;
    this.result.bassBoostFactor = bassBoostFactor;
    this.result.widthFactor = widthFactor;

    return this.result;
  }
}

// Main Audio Worklet Processor
class SurroundProcessor extends AudioWorkletProcessor {
  // Config state
  isEnabled = false;
  volume = 0.85;
  surroundIntensity = 0.85;
  bassBoost = 0.75;
  dialogueEnhance = 0.5;
  roomReflections = 0.6;
  crosstalkCancellation = true;
  dynamicEQ = true;
  hrtfName = "sadie";
  isAIEnabled = false;
  activePreset = "cinema_ref";

  // v3 additions
  headphoneProfile: 'none' | 'open_back' | 'closed_back' | 'gaming_headset' | 'earbuds' = 'none';
  roomSize = 0.5;
  roomAbsorption = 0.5;
  deEsserIntensity = 0.4;
  spectralWarmth = 0.3;
  driftAmount = 0.2;


  // DSP components
  sampleRateValue = 48000;
  lfeLPF = new BiquadFilter();
  dialogueEQ = new BiquadFilter();
  limiter: Limiter;
  reverb: ReverbFDN;
  aiAnalyzer = new AISpatialAnalyzer();
  subBassSynth: SubharmonicSynthesizer;
  deEsserL: DeEsser;
  deEsserR: DeEsser;
  
  // Headphone compensation filters (4-stage per channel for accurate target curves)
  hpCompL1 = new BiquadFilter();
  hpCompL2 = new BiquadFilter();
  hpCompL3 = new BiquadFilter();
  hpCompL4 = new BiquadFilter();
  hpCompR1 = new BiquadFilter();
  hpCompR2 = new BiquadFilter();
  hpCompR3 = new BiquadFilter();
  hpCompR4 = new BiquadFilter();

  // Spectral tilt filter
  tiltL = new BiquadFilter();
  tiltR = new BiquadFilter();

  // Dialogue side-masking reduction peaking notch filters
  sideDuckerL = new BiquadFilter();
  sideDuckerR = new BiquadFilter();
  sideDuckerLs = new BiquadFilter();
  sideDuckerRs = new BiquadFilter();

  // Elevated heights filters
  heightDelayL = new DelayLine(2400);
  heightDelayR = new DelayLine(2400);
  heightBandpassL = new BiquadFilter();
  heightBandpassR = new BiquadFilter();
  heightNotchL = new BiquadFilter();
  heightNotchR = new BiquadFilter();

  // Hearing calibration filters
  hearingL1 = new BiquadFilter();
  hearingL2 = new BiquadFilter();
  hearingL3 = new BiquadFilter();
  hearingL4 = new BiquadFilter();
  hearingR1 = new BiquadFilter();
  hearingR2 = new BiquadFilter();
  hearingR3 = new BiquadFilter();
  hearingR4 = new BiquadFilter();

  // Delays for ITD/Haas effect and crosstalk
  surroundDelayL = new DelayLine(2400);
  surroundDelayR = new DelayLine(2400);
  backDelayL = new DelayLine(2400);
  backDelayR = new DelayLine(2400);

  itdDelays: { [key: string]: DelayLine } = {};
  crosstalkDelayL = new DelayLine(128);
  crosstalkDelayR = new DelayLine(128);

  // Partitioned FFT Convolver engine
  fftHelper = new FFT256();
  convolvers: { [key: string]: BinauralConvolver } = {};

  // Micro room drift LFO
  surroundLfo = new SlowLFO(0.08, 48000);

  // Pre-allocated buffers to prevent GC allocation thrashing
  upmixC = new Float32Array(128);
  upmixLfe = new Float32Array(128);
  upmixLs = new Float32Array(128);
  upmixRs = new Float32Array(128);
  upmixLb = new Float32Array(128);
  upmixRb = new Float32Array(128);
  upmixLh = new Float32Array(128);
  upmixRh = new Float32Array(128);
  duckedL = new Float32Array(128);
  duckedR = new Float32Array(128);
  accumRealL = new Float32Array(256);
  accumImagL = new Float32Array(256);
  accumRealR = new Float32Array(256);
  accumImagR = new Float32Array(256);

  underrunCount = 0;
  gcPauseCount = 0;

  // WASM Acceleration state
  wasmInstance: any = null;
  wasmSpatializerPtr = 0;
  wasmInLPtr = 0;
  wasmInRPtr = 0;
  wasmOutLPtr = 0;
  wasmOutRPtr = 0;
  wasmMemory: any = null;
  wasmInLView: Float32Array = new Float32Array(0);
  wasmInRView: Float32Array = new Float32Array(0);
  wasmOutLView: Float32Array = new Float32Array(0);
  wasmOutRView: Float32Array = new Float32Array(0);

  // Analytical metrics & scheduler variables
  analyticTimer = 0;
  channelLevels = new Float32Array(10);
  channelLevelsArray = new Array(10).fill(0);
  isUIActive = false;
  rollingElapsed = 0;
  voiceEnvelope = 0;
  inputEnvelope = 0.15;
  dspCycleCount = 0;

  constructor() {
    super();
    this.sampleRateValue = sampleRate;
    this.limiter = new Limiter(this.sampleRateValue);
    this.reverb = new ReverbFDN(this.sampleRateValue);
    this.subBassSynth = new SubharmonicSynthesizer(this.sampleRateValue);
    this.deEsserL = new DeEsser(this.sampleRateValue);
    this.deEsserR = new DeEsser(this.sampleRateValue);

    // Initialize EQ, elevation notches, and crossover filters
    this.lfeLPF.setLowpass(120, this.sampleRateValue, 0.707);
    this.dialogueEQ.setPeaking(1500, this.sampleRateValue, 3.0, 1.2);

    this.heightBandpassL.setBandpass(4500, this.sampleRateValue, 0.85);
    this.heightBandpassR.setBandpass(4500, this.sampleRateValue, 0.85);
    this.heightNotchL.setNotch(6000, this.sampleRateValue, 6.0);
    this.heightNotchR.setNotch(6000, this.sampleRateValue, 6.0);

    // Setup side ducker peak notches (duck vocal range in side channels)
    this.sideDuckerL.setPeaking(1500, this.sampleRateValue, 0, 1.0);
    this.sideDuckerR.setPeaking(1500, this.sampleRateValue, 0, 1.0);
    this.sideDuckerLs.setPeaking(1500, this.sampleRateValue, 0, 1.0);
    this.sideDuckerRs.setPeaking(1500, this.sampleRateValue, 0, 1.0);

    // Default hearing calibration peaking filters
    this.hearingL1.setPeaking(250, this.sampleRateValue, 0, 1.0);
    this.hearingL2.setPeaking(1000, this.sampleRateValue, 0, 1.0);
    this.hearingL3.setPeaking(4000, this.sampleRateValue, 0, 1.0);
    this.hearingL4.setPeaking(8000, this.sampleRateValue, 0, 1.0);
    this.hearingR1.setPeaking(250, this.sampleRateValue, 0, 1.0);
    this.hearingR2.setPeaking(1000, this.sampleRateValue, 0, 1.0);
    this.hearingR3.setPeaking(4000, this.sampleRateValue, 0, 1.0);
    this.hearingR4.setPeaking(8000, this.sampleRateValue, 0, 1.0);

    // Initialize delay lines for each virtual channel's ITD (up to 128 samples)
    const channels = ["L", "R", "C", "Ls", "Rs", "Lb", "Rb", "Lh", "Rh"];
    channels.forEach(ch => {
      this.itdDelays[ch] = new DelayLine(128);
    });

    // Default HRTF FFT partition convolver setups (pre-load silent/impulse taps)
    const dummyTaps = new Array(32).fill(0).map((_, i) => (i === 15 ? 1.0 : 0));
    channels.forEach(ch => {
      this.convolvers[ch] = new BinauralConvolver(this.fftHelper, dummyTaps, dummyTaps);
    });

    // Setup message port communication
    this.port.onmessage = (event: any) => {
      const msg = event.data;
      if (msg.type === "UPDATE_SETTINGS") {
        this.updateSettings(msg.settings);
      } else if (msg.type === "LOAD_HRTF") {
        this.loadHRTFTaps(msg.profile);
      } else if (msg.type === "INITIALIZE_WASM") {
        this.initializeWasm(msg.wasmModule);
      } else if (msg.type === "SET_UI_ACTIVE") {
        this.isUIActive = msg.isActive;
      }
    };
  }

  applyPreset(presetName: string) {
    this.activePreset = presetName;
    switch (presetName) {
      case "cinema_ref":
        this.surroundIntensity = 0.9;
        this.bassBoost = 0.8;
        this.dialogueEnhance = 0.5;
        this.roomReflections = 0.55;
        this.crosstalkCancellation = true;
        this.dynamicEQ = true;
        this.roomSize = 0.65;
        this.roomAbsorption = 0.6;
        this.deEsserIntensity = 0.3;
        this.spectralWarmth = 0.3;
        this.driftAmount = 0.2;
        break;
      case "large_hall":
        this.surroundIntensity = 1.2;
        this.bassBoost = 0.9;
        this.dialogueEnhance = 0.3;
        this.roomReflections = 0.85;
        this.crosstalkCancellation = true;
        this.dynamicEQ = true;
        this.roomSize = 0.9;
        this.roomAbsorption = 0.45;
        this.deEsserIntensity = 0.4;
        this.spectralWarmth = 0.4;
        this.driftAmount = 0.4;
        break;
      case "intimate_studio":
        this.surroundIntensity = 0.6;
        this.bassBoost = 0.4;
        this.dialogueEnhance = 0.3;
        this.roomReflections = 0.25;
        this.crosstalkCancellation = true;
        this.dynamicEQ = false;
        this.roomSize = 0.3;
        this.roomAbsorption = 0.75;
        this.deEsserIntensity = 0.2;
        this.spectralWarmth = 0.2;
        this.driftAmount = 0.1;
        break;
      case "competitive_fps":
        this.surroundIntensity = 1.25;
        this.bassBoost = 0.15;
        this.dialogueEnhance = 0.95;
        this.roomReflections = 0.05;
        this.crosstalkCancellation = true;
        this.dynamicEQ = false;
        this.roomSize = 0.1;
        this.roomAbsorption = 0.9;
        this.deEsserIntensity = 0.1;
        this.spectralWarmth = 0.1;
        this.driftAmount = 0.05;
        break;
      case "concert_arena":
        this.surroundIntensity = 1.35;
        this.bassBoost = 1.0;
        this.dialogueEnhance = 0.2;
        this.roomReflections = 0.9;
        this.crosstalkCancellation = false;
        this.dynamicEQ = true;
        this.roomSize = 0.85;
        this.roomAbsorption = 0.4;
        this.deEsserIntensity = 0.5;
        this.spectralWarmth = 0.5;
        this.driftAmount = 0.5;
        break;
      case "dialogue_focus":
        this.surroundIntensity = 0.4;
        this.bassBoost = 0.2;
        this.dialogueEnhance = 1.0;
        this.roomReflections = 0.15;
        this.crosstalkCancellation = true;
        this.dynamicEQ = false;
        this.roomSize = 0.4;
        this.roomAbsorption = 0.8;
        this.deEsserIntensity = 0.3;
        this.spectralWarmth = 0.2;
        this.driftAmount = 0.1;
        break;
      case "relaxed_night":
        this.surroundIntensity = 0.5;
        this.bassBoost = 0.3;
        this.dialogueEnhance = 0.75;
        this.roomReflections = 0.3;
        this.crosstalkCancellation = true;
        this.dynamicEQ = true;
        this.roomSize = 0.5;
        this.roomAbsorption = 0.65;
        this.deEsserIntensity = 0.8;
        this.spectralWarmth = 0.7;
        this.driftAmount = 0.1;
        break;
    }
    
    this.configureHeadphoneFilters();
    this.configureTiltFilters();
  }

  applyHearingProfile(profile: any) {
    if (profile && profile.left && profile.left.length === 4) {
      this.hearingL1.setPeaking(250, this.sampleRateValue, profile.left[0], 1.0);
      this.hearingL2.setPeaking(1000, this.sampleRateValue, profile.left[1], 1.0);
      this.hearingL3.setPeaking(4000, this.sampleRateValue, profile.left[2], 1.0);
      this.hearingL4.setPeaking(8000, this.sampleRateValue, profile.left[3], 1.0);
    }
    if (profile && profile.right && profile.right.length === 4) {
      this.hearingR1.setPeaking(250, this.sampleRateValue, profile.right[0], 1.0);
      this.hearingR2.setPeaking(1000, this.sampleRateValue, profile.right[1], 1.0);
      this.hearingR3.setPeaking(4000, this.sampleRateValue, profile.right[2], 1.0);
      this.hearingR4.setPeaking(8000, this.sampleRateValue, profile.right[3], 1.0);
    }
  }

  configureHeadphoneFilters() {
    const rate = this.sampleRateValue;
    switch (this.headphoneProfile) {

      case 'open_back':
        // Open-back signature: natural bass roll-off below 60Hz, flat through mids,
        // slight upper-mid glare, good treble extension.
        // Target: Harman 2018 — fill sub-bass, sculpt upper-bass, smooth 3.5kHz glare, restore 10kHz air.
        this.hpCompL1.setLowshelf(60, rate, 3.0, 0.70);    // Sub-bass extension fill
        this.hpCompR1.setLowshelf(60, rate, 3.0, 0.70);
        this.hpCompL2.setPeaking(150, rate, -1.5, 1.20);   // Reduce upper-bass cup resonance hump
        this.hpCompR2.setPeaking(150, rate, -1.5, 1.20);
        this.hpCompL3.setPeaking(3500, rate, -1.0, 1.50);  // Tame slight pinna-reflection glare
        this.hpCompR3.setPeaking(3500, rate, -1.0, 1.50);
        this.hpCompL4.setHighshelf(10000, rate, 1.5, 0.70); // Restore natural air and extension
        this.hpCompR4.setHighshelf(10000, rate, 1.5, 0.70);
        break;

      case 'closed_back':
        // Closed-back signature: elevated bass hump 100-250Hz from cup resonance,
        // slightly cloudy lower-mids, and a harsh presence peak around 6-8kHz.
        // Target: Diffuse Field — reduce box resonance, clear mids, tame cymbal harshness, restore air.
        this.hpCompL1.setPeaking(200, rate, -3.0, 0.90);   // Remove lower-mid box resonance
        this.hpCompR1.setPeaking(200, rate, -3.0, 0.90);
        this.hpCompL2.setPeaking(400, rate, -1.5, 1.50);   // Clear muddy lower-mids
        this.hpCompR2.setPeaking(400, rate, -1.5, 1.50);
        this.hpCompL3.setPeaking(6500, rate, -2.0, 2.00);  // Tame treble harshness / cymbal glare
        this.hpCompR3.setPeaking(6500, rate, -2.0, 2.00);
        this.hpCompL4.setHighshelf(10000, rate, 2.5, 0.70); // Restore natural high-frequency air
        this.hpCompR4.setHighshelf(10000, rate, 2.5, 0.70);
        break;

      case 'gaming_headset':
        // Gaming V-shape signature: heavy bass bloom 100-200Hz, scooped 1-3kHz midrange,
        // hyper-boosted 5-8kHz presence for "detail" perception.
        // Target: ITU-R BS.1116 monitoring reference — flatten V-shape to a reference curve.
        this.hpCompL1.setPeaking(120, rate, -4.0, 0.80);   // Tame heavy bass bloom
        this.hpCompR1.setPeaking(120, rate, -4.0, 0.80);
        this.hpCompL2.setPeaking(1000, rate, 2.0, 1.00);   // Restore scooped vocal midrange
        this.hpCompR2.setPeaking(1000, rate, 2.0, 1.00);
        this.hpCompL3.setPeaking(2500, rate, 2.5, 1.20);   // Restore scooped upper-mids / intelligibility
        this.hpCompR3.setPeaking(2500, rate, 2.5, 1.20);
        this.hpCompL4.setPeaking(7000, rate, -2.0, 2.00);  // Tame hyper-bright presence peak
        this.hpCompR4.setPeaking(7000, rate, -2.0, 2.00);
        break;

      case 'earbuds':
        // IEM/Earbud signature: close-coupling seal gives elevated bass 60-100Hz,
        // generally flat mids, vent tuning creates a sharp 8-12kHz peak.
        // Target: Harman IEM 2019 — reduce seal bass excess, lift Harman mid dip, tame vent peak.
        this.hpCompL1.setPeaking(80, rate, -2.5, 0.90);    // Reduce seal-induced bass excess
        this.hpCompR1.setPeaking(80, rate, -2.5, 0.90);
        this.hpCompL2.setPeaking(800, rate, 1.0, 1.50);    // Harman midrange compensation lift
        this.hpCompR2.setPeaking(800, rate, 1.0, 1.50);
        this.hpCompL3.setPeaking(8000, rate, -3.0, 2.00);  // Remove vent-tuning upper treble peak
        this.hpCompR3.setPeaking(8000, rate, -3.0, 2.00);
        this.hpCompL4.setHighshelf(12000, rate, -1.5, 0.70); // Smooth harsh air frequencies
        this.hpCompR4.setHighshelf(12000, rate, -1.5, 0.70);
        break;

      default: // 'none' — unity bypass (all stages at 0 dB)
        this.hpCompL1.setPeaking(1000, rate, 0, 1.0);
        this.hpCompR1.setPeaking(1000, rate, 0, 1.0);
        this.hpCompL2.setPeaking(1000, rate, 0, 1.0);
        this.hpCompR2.setPeaking(1000, rate, 0, 1.0);
        this.hpCompL3.setPeaking(1000, rate, 0, 1.0);
        this.hpCompR3.setPeaking(1000, rate, 0, 1.0);
        this.hpCompL4.setPeaking(1000, rate, 0, 1.0);
        this.hpCompR4.setPeaking(1000, rate, 0, 1.0);
        break;
    }
  }

  configureTiltFilters() {
    // Gently slope high frequencies down based on spectralWarmth configuration
    const rate = this.sampleRateValue;
    const gainDb = -this.spectralWarmth * 2.0; // max -2dB slope
    this.tiltL.setHighshelf(8000, rate, gainDb, 0.5);
    this.tiltR.setHighshelf(8000, rate, gainDb, 0.5);
  }

  updateSettings(settings: any) {
    this.isEnabled = settings.isEnabled;
    this.volume = settings.volume;
    this.surroundIntensity = settings.surroundIntensity;
    this.bassBoost = settings.bassBoost;
    this.dialogueEnhance = settings.dialogueEnhance;
    this.roomReflections = settings.roomReflections;
    this.crosstalkCancellation = settings.crosstalkCancellation;
    this.dynamicEQ = settings.dynamicEQ;
    this.hrtfName = settings.hrtfProfile;
    this.isAIEnabled = settings.isAIEnabled || false;

    // v3 configurations
    this.headphoneProfile = settings.headphoneProfile || 'none';
    this.roomSize = settings.roomSize !== undefined ? settings.roomSize : 0.5;
    this.roomAbsorption = settings.roomAbsorption !== undefined ? settings.roomAbsorption : 0.5;
    this.deEsserIntensity = settings.deEsserIntensity !== undefined ? settings.deEsserIntensity : 0.4;
    this.spectralWarmth = settings.spectralWarmth !== undefined ? settings.spectralWarmth : 0.3;
    this.driftAmount = settings.driftAmount !== undefined ? settings.driftAmount : 0.2;

    if (settings.preset) {
      this.applyPreset(settings.preset);
    } else {
      this.configureHeadphoneFilters();
      this.configureTiltFilters();
    }

    if (settings.hearingProfile) {
      this.applyHearingProfile(settings.hearingProfile);
    }

    const dialogueBoostDb = 1.0 + this.dialogueEnhance * 5.0;
    this.dialogueEQ.setPeaking(1500, this.sampleRateValue, dialogueBoostDb, 1.2);

    if (this.wasmInstance && this.wasmSpatializerPtr) {
      try {
        let hpProfileIdx = 0;
        if (this.headphoneProfile === 'open_back') hpProfileIdx = 1;
        else if (this.headphoneProfile === 'closed_back') hpProfileIdx = 2;
        else if (this.headphoneProfile === 'gaming_headset') hpProfileIdx = 3;
        else if (this.headphoneProfile === 'earbuds') hpProfileIdx = 4;

        let presetIdx = 0;
        if (this.activePreset === 'cinema_ref') presetIdx = 1;
        else if (this.activePreset === 'large_hall') presetIdx = 2;
        else if (this.activePreset === 'intimate_studio') presetIdx = 3;
        else if (this.activePreset === 'competitive_fps') presetIdx = 4;
        else if (this.activePreset === 'concert_arena') presetIdx = 5;
        else if (this.activePreset === 'dialogue_focus') presetIdx = 6;
        else if (this.activePreset === 'relaxed_night') presetIdx = 7;

        this.wasmInstance.spatializer_set_settings(
          this.wasmSpatializerPtr,
          this.volume,
          this.surroundIntensity,
          this.bassBoost,
          this.dialogueEnhance,
          this.roomReflections,
          this.crosstalkCancellation,
          this.dynamicEQ,
          this.roomSize,
          this.roomAbsorption,
          this.deEsserIntensity,
          this.spectralWarmth,
          this.driftAmount,
          hpProfileIdx,
          presetIdx
        );

        if (settings.hearingProfile) {
          const leftGains = new Float32Array(settings.hearingProfile.left);
          const rightGains = new Float32Array(settings.hearingProfile.right);
          
          const lPtr = this.wasmInstance.__wbindgen_malloc(16);
          const rPtr = this.wasmInstance.__wbindgen_malloc(16);
          
          const lView = new Float32Array(this.wasmInstance.memory.buffer, lPtr, 4);
          const rView = new Float32Array(this.wasmInstance.memory.buffer, rPtr, 4);
          
          lView.set(leftGains);
          rView.set(rightGains);
          
          this.wasmInstance.spatializer_apply_hearing_profile(
            this.wasmSpatializerPtr,
            lPtr,
            4,
            rPtr,
            4
          );
          
          this.wasmInstance.__wbindgen_free(lPtr, 16);
          this.wasmInstance.__wbindgen_free(rPtr, 16);
        }
      } catch (e) {
        console.warn("WASM settings sync failed:", e);
      }
    }
  }

  loadHRTFTaps(profile: any) {
    const channels = ["L", "R", "C", "Ls", "Rs", "Lb", "Rb", "Lh", "Rh"];
    channels.forEach((ch, chIdx) => {
      let ipsi: number[] | null = null;
      let contra: number[] | null = null;

      if (profile.channels && profile.channels[ch]) {
        const data = profile.channels[ch];
        ipsi = data.ipsi;
        contra = data.contra;
      } else if (profile.channels && (ch === "Lh" || ch === "Rh")) {
        const parentCh = ch === "Lh" ? "L" : "R";
        const data = profile.channels[parentCh];
        if (data) {
          ipsi = data.ipsi;
          contra = data.contra;
        }
      }

      if (ipsi && contra) {
        this.convolvers[ch].updateTaps(ipsi, contra);

        if (this.wasmInstance && this.wasmSpatializerPtr) {
          try {
            const len = ipsi.length;
            const bytes = len * 4;
            const ipsiPtr = this.wasmInstance.__wbindgen_malloc(bytes);
            const contraPtr = this.wasmInstance.__wbindgen_malloc(bytes);
            
            const ipsiView = new Float32Array(this.wasmInstance.memory.buffer, ipsiPtr, len);
            const contraView = new Float32Array(this.wasmInstance.memory.buffer, contraPtr, len);
            
            ipsiView.set(ipsi);
            contraView.set(contra);
            
            this.wasmInstance.spatializer_load_hrtf(
              this.wasmSpatializerPtr,
              chIdx,
              ipsiPtr,
              len,
              contraPtr,
              len
            );
            
            this.wasmInstance.__wbindgen_free(ipsiPtr, bytes);
            this.wasmInstance.__wbindgen_free(contraPtr, bytes);
          } catch (e) {
            console.warn("Failed to load HRTF into WASM, falling back to TS convolver.", e);
          }
        }
      }
    });
  }

  async initializeWasm(wasmModule: WebAssembly.Module) {
    try {
      const instance = await WebAssembly.instantiate(wasmModule, {
        env: {
          memory: new WebAssembly.Memory({ initial: 256, maximum: 512 }),
          abort: () => { console.error("WASM Aborted"); }
        }
      });
      this.wasmInstance = instance.exports;
      if (this.wasmInstance && this.wasmInstance.spatializer_new) {
        this.wasmSpatializerPtr = this.wasmInstance.spatializer_new(this.sampleRateValue);
        
        // Allocate 128 f32 buffers (512 bytes each)
        this.wasmInLPtr = this.wasmInstance.__wbindgen_malloc(512);
        this.wasmInRPtr = this.wasmInstance.__wbindgen_malloc(512);
        this.wasmOutLPtr = this.wasmInstance.__wbindgen_malloc(512);
        this.wasmOutRPtr = this.wasmInstance.__wbindgen_malloc(512);
        
        this.wasmMemory = this.wasmInstance.memory;
        this.wasmInLView = new Float32Array(this.wasmMemory.buffer, this.wasmInLPtr, 128);
        this.wasmInRView = new Float32Array(this.wasmMemory.buffer, this.wasmInRPtr, 128);
        this.wasmOutLView = new Float32Array(this.wasmMemory.buffer, this.wasmOutLPtr, 128);
        this.wasmOutRView = new Float32Array(this.wasmMemory.buffer, this.wasmOutRPtr, 128);
        
        // Sync initial settings to WASM
        let hpProfileIdx = 0;
        if (this.headphoneProfile === 'open_back') hpProfileIdx = 1;
        else if (this.headphoneProfile === 'closed_back') hpProfileIdx = 2;
        else if (this.headphoneProfile === 'gaming_headset') hpProfileIdx = 3;
        else if (this.headphoneProfile === 'earbuds') hpProfileIdx = 4;

        let presetIdx = 0;
        if (this.activePreset === 'cinema_ref') presetIdx = 1;
        else if (this.activePreset === 'large_hall') presetIdx = 2;
        else if (this.activePreset === 'intimate_studio') presetIdx = 3;
        else if (this.activePreset === 'competitive_fps') presetIdx = 4;
        else if (this.activePreset === 'concert_arena') presetIdx = 5;
        else if (this.activePreset === 'dialogue_focus') presetIdx = 6;
        else if (this.activePreset === 'relaxed_night') presetIdx = 7;

        this.wasmInstance.spatializer_set_settings(
          this.wasmSpatializerPtr,
          this.volume,
          this.surroundIntensity,
          this.bassBoost,
          this.dialogueEnhance,
          this.roomReflections,
          this.crosstalkCancellation,
          this.dynamicEQ,
          this.roomSize,
          this.roomAbsorption,
          this.deEsserIntensity,
          this.spectralWarmth,
          this.driftAmount,
          hpProfileIdx,
          presetIdx
        );
        console.log("Successfully initialized WASM spatializer engine!");
      }
    } catch (e) {
      console.warn("WASM Init bypassed, using TS DSP engine.", e);
      this.wasmInstance = null;
    }
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][], _parameters: Record<string, Float32Array>): boolean {
    const startCpu = typeof performance !== 'undefined' ? performance.now() : 0;
    const input = inputs[0];
    const output = outputs[0];

    if (!input || input.length === 0 || !input[0] || input[0].length === 0) {
      return true;
    }

    const channelCount = input.length;
    const bufferSize = input[0].length; // always 128 samples

    if (!output[0]) output[0] = new Float32Array(bufferSize);
    if (!output[1]) output[1] = new Float32Array(bufferSize);

    const inL = input[0];
    const inR = channelCount > 1 ? input[1] : input[0];
    const outL = output[0];
    const outR = output[1];

    if (!this.isEnabled) {
      for (let i = 0; i < bufferSize; i++) {
        outL[i] = inL[i] * this.volume;
        outR[i] = inR[i] * this.volume;
      }
      return true;
    }

    if (this.wasmInstance && this.wasmSpatializerPtr) {
      try {
        this.wasmInLView.set(inL);
        this.wasmInRView.set(inR);
        
        this.wasmInstance.spatializer_process_spatializer(
          this.wasmSpatializerPtr,
          this.wasmInLPtr,
          128,
          this.wasmInRPtr,
          128,
          this.wasmOutLPtr,
          128,
          this.wasmOutRPtr,
          128
        );
        
        outL.set(this.wasmOutLView);
        outR.set(this.wasmOutRView);
        
        // VU and telemetry reporting
        let maxL = 0, maxR = 0, maxC = 0, maxLs = 0, maxRs = 0;
        for (let i = 0; i < 128; i++) {
          maxL = Math.max(maxL, Math.abs(inL[i]));
          maxR = Math.max(maxR, Math.abs(inR[i]));
          maxC = Math.max(maxC, Math.abs(inL[i] + inR[i]) * 0.707);
          maxLs = Math.max(maxLs, Math.abs(outL[i]));
          maxRs = Math.max(maxRs, Math.abs(outR[i]));
        }
        
        const endCpu = typeof performance !== 'undefined' ? performance.now() : 0;
        const elapsed = endCpu - startCpu;
        this.rollingElapsed = this.rollingElapsed * 0.9 + elapsed * 0.1;
        
        const frameBudgetMs = (128 / this.sampleRateValue) * 1000;
        if (elapsed > frameBudgetMs) this.underrunCount++;
        if (elapsed > frameBudgetMs * 3.0) this.gcPauseCount++;
        
        this.analyticTimer++;
        this.dspCycleCount++;
        if (this.isUIActive && this.analyticTimer >= 15) {
          this.analyticTimer = 0;
          this.channelLevels[0] = maxL;
          this.channelLevels[1] = maxR;
          this.channelLevels[2] = maxC;
          this.channelLevels[3] = maxC * 0.3;
          this.channelLevels[4] = maxLs;
          this.channelLevels[5] = maxRs;
          this.channelLevels[6] = maxLs * 0.8;
          this.channelLevels[7] = maxRs * 0.8;
          this.channelLevels[8] = maxLs * 0.6;
          this.channelLevels[9] = maxRs * 0.6;

          for (let idx = 0; idx < 10; idx++) {
            this.channelLevelsArray[idx] = this.channelLevels[idx];
          }

          this.port.postMessage({
            type: "LEVEL_METERS",
            levels: this.channelLevelsArray,
            outputLevel: [maxL * this.volume],
            aiClass: "wasm_active",
            performanceMs: this.rollingElapsed,
            dspLoadRatio: this.rollingElapsed / frameBudgetMs,
            underrunCount: this.underrunCount,
            gcPauseCount: this.gcPauseCount
          });
        }
        return true;
      } catch (e) {
        console.warn("WASM execution failed, falling back to TS engine.", e);
      }
    }

    // --- STAGE 2: ANALYSIS STAGE ---
    let aiClass = "flat";
    let aiVocalBoostDb = 0;
    let aiBassBoost = 1.0;
    let aiWidth = 1.0;

    // Run analyzer, throttle analysis blocks under extreme load to preserve cycles
    const schedulerThreshold = 1.35; // ms limit
    const skipAI = this.rollingElapsed > schedulerThreshold && (this.dspCycleCount % 4 !== 0);

    if (this.isAIEnabled && !skipAI) {
      const aiResults = this.aiAnalyzer.detect(inL, inR, this.sampleRateValue);
      aiClass = aiResults.classification;
      aiVocalBoostDb = aiResults.vocalBoostDb;
      aiBassBoost = aiResults.bassBoostFactor;
      aiWidth = aiResults.widthFactor;
    }
    // Modulate Haas surround delays slowly using our SlowLFO to prevent standing-node audio fatigue
    const lfoVal = this.surroundLfo.next();
    // Modulate Haas delay times by up to 2ms (96 samples at 48kHz)
    const driftSamples = lfoVal * 96 * this.driftAmount;

    let maxL = 0, maxR = 0, maxC = 0, maxLfe = 0, maxLs = 0, maxRs = 0, maxLb = 0, maxRb = 0, maxLh = 0, maxRh = 0;

    // Buffers point to pre-allocated arrays
    const upmixC = this.upmixC;
    const upmixLfe = this.upmixLfe;
    const upmixLs = this.upmixLs;
    const upmixRs = this.upmixRs;
    const upmixLb = this.upmixLb;
    const upmixRb = this.upmixRb;
    const upmixLh = this.upmixLh;
    const upmixRh = this.upmixRh;

    // Configure dialogue EQ outside the loop once per block
    if (this.isAIEnabled && aiClass === "dialogue") {
      this.dialogueEQ.setPeaking(1500, this.sampleRateValue, 3.5 + aiVocalBoostDb, 1.2);
    } else {
      const defaultDialogueBoost = 1.0 + this.dialogueEnhance * 5.0;
      this.dialogueEQ.setPeaking(1500, this.sampleRateValue, defaultDialogueBoost, 1.2);
    }

    // Dynamic dialogue midrange masking variables
    let voiceSum = 0;

    // Upmix loop
    for (let i = 0; i < bufferSize; i++) {
      const sL = inL[i];
      const sR = inR[i];

      // Front Center Extractions
      const chC = this.dialogueEQ.process((sL + sR) * 0.707);
      upmixC[i] = chC;
      voiceSum += Math.abs(chC);

      // Low Frequency Effects channel (Subwoofer)
      upmixLfe[i] = this.lfeLPF.process((sL + sR) * 0.5);

      // Side Surrounds (Haas delay lines + drift LFO modulation)
      const diffS = (sL - sR) * 0.707;
      this.surroundDelayL.write(diffS);
      this.surroundDelayR.write(-diffS);

      const delayLs = Math.floor(18 * (this.sampleRateValue / 1000) + driftSamples);
      const delayRs = Math.floor(22 * (this.sampleRateValue / 1000) - driftSamples);

      const widthScale = this.surroundIntensity * aiWidth;
      upmixLs[i] = this.surroundDelayL.read(delayLs) * widthScale;
      upmixRs[i] = this.surroundDelayR.read(delayRs) * widthScale;

      // Rear Back Surrounds (Longer Haas delays)
      this.backDelayL.write(diffS);
      this.backDelayR.write(-diffS);

      const delayLb = Math.floor(32 * (this.sampleRateValue / 1000) + driftSamples * 0.5);
      const delayRb = Math.floor(38 * (this.sampleRateValue / 1000) - driftSamples * 0.5);
      upmixLb[i] = this.backDelayL.read(delayLb) * (widthScale * 0.8);
      upmixRb[i] = this.backDelayR.read(delayRb) * (widthScale * 0.8);

      // Height channels Lh & Rh (Elevated 12ms delay + pinna elevation filter notch Shaping)
      const delayLh = Math.floor(12 * (this.sampleRateValue / 1000));
      this.heightDelayL.write(sL - sR * 0.65);
      this.heightDelayR.write(sR - sL * 0.65);

      let chLh = this.heightDelayL.read(delayLh) * (widthScale * 0.75);
      let chRh = this.heightDelayR.read(delayLh) * (widthScale * 0.75);
      chLh = this.heightBandpassL.process(chLh);
      chRh = this.heightBandpassR.process(chRh);
      chLh = this.heightNotchL.process(chLh);
      chRh = this.heightNotchR.process(chRh);

      upmixLh[i] = chLh;
      upmixRh[i] = chRh;
    }

    // --- STAGE 5: DIALOGUE INTELLIGENCE STAGE ---
    // If dialogue is highly dominant in center, duck the midrange presence band (1.5kHz)
    // of side channels L/R/Ls/Rs to reduce midrange voice masking.
    const averageVoice = voiceSum / bufferSize;
    this.voiceEnvelope = this.voiceEnvelope * 0.92 + averageVoice * 0.08;
    let duckingGainDb = 0;
    if (this.voiceEnvelope > 0.035) {
      duckingGainDb = -Math.min(3.2, (this.voiceEnvelope - 0.035) * 18.0 * this.dialogueEnhance);
    }

    this.sideDuckerL.setPeaking(1500, this.sampleRateValue, duckingGainDb, 1.0);
    this.sideDuckerR.setPeaking(1500, this.sampleRateValue, duckingGainDb, 1.0);
    this.sideDuckerLs.setPeaking(1500, this.sampleRateValue, duckingGainDb, 1.0);
    this.sideDuckerRs.setPeaking(1500, this.sampleRateValue, duckingGainDb, 1.0);

    const duckedL = this.duckedL;
    const duckedR = this.duckedR;
    for (let i = 0; i < 128; i++) {
      duckedL[i] = this.sideDuckerL.process(inL[i]);
      duckedR[i] = this.sideDuckerR.process(inR[i]);
      upmixLs[i] = this.sideDuckerLs.process(upmixLs[i]);
      upmixRs[i] = this.sideDuckerRs.process(upmixRs[i]);
    }
    // --- STAGE 3: SPATIAL STAGE (Overlap-Save Partitioned Convolution) ---
    // Pre-allocated Left/Right complex accumulator arrays
    const accumRealL = this.accumRealL;
    const accumImagL = this.accumImagL;
    const accumRealR = this.accumRealR;
    const accumImagR = this.accumImagR;

    // Reset accumulators to 0 before convolving
    accumRealL.fill(0);
    accumImagL.fill(0);
    accumRealR.fill(0);
    accumImagR.fill(0);

    // Convolve channels
    // Front L/R
    this.convolvers["L"].processBlock(duckedL, accumRealL, accumImagL, accumRealR, accumImagR);
    this.convolvers["R"].processBlock(duckedR, accumRealR, accumImagR, accumRealL, accumImagL);
    
    // Center
    this.convolvers["C"].processBlock(upmixC, accumRealL, accumImagL, accumRealR, accumImagR);

    // Surround L/R
    this.convolvers["Ls"].processBlock(upmixLs, accumRealL, accumImagL, accumRealR, accumImagR);
    this.convolvers["Rs"].processBlock(upmixRs, accumRealR, accumImagR, accumRealL, accumImagL);

    // Height L/R
    this.convolvers["Lh"].processBlock(upmixLh, accumRealL, accumImagL, accumRealR, accumImagR);
    this.convolvers["Rh"].processBlock(upmixRh, accumRealR, accumImagR, accumRealL, accumImagL);

    // Performance Scheduler: If processing elapsed times are high, skip back surrounds convolve
    // and merge their energy into the surrounds to save math cycles
    const loadLimitReached = this.rollingElapsed > schedulerThreshold;
    if (!loadLimitReached) {
      this.convolvers["Lb"].processBlock(upmixLb, accumRealL, accumImagL, accumRealR, accumImagR);
      this.convolvers["Rb"].processBlock(upmixRb, accumRealR, accumImagR, accumRealL, accumImagL);
    } else {
      // Fallback: mix Backs into Surrounds (panning back channels directly to side convolvers)
      for (let i = 0; i < 128; i++) {
        upmixLs[i] += upmixLb[i] * 0.707;
        upmixRs[i] += upmixRb[i] * 0.707;
      }
    }

    // Transform Left/Right accumulators back to time domain using IFFT
    this.fftHelper.ifft(accumRealL, accumImagL);
    this.fftHelper.ifft(accumRealR, accumImagR);

    // Configure Limiter threshold outside the loop
    if (this.activePreset === "relaxed_night") {
      this.limiter.threshold = 0.65;
    } else {
      this.limiter.threshold = 0.98;
    }

    // --- STAGE 6: BASS STAGE (Phase-Aligned Subharmonics) ---
    const bassScalar = this.bassBoost * aiBassBoost;
    const subharmonicVolume = 0.22 * bassScalar;

    // Calculate overall input envelope using a slow exponential moving average
    let inputSum = 0;
    for (let i = 0; i < bufferSize; i++) {
      inputSum += Math.abs(inL[i] + inR[i]) * 0.5;
    }
    const averageInput = inputSum / bufferSize;
    this.inputEnvelope = this.inputEnvelope * 0.98 + averageInput * 0.02;

    // Automatic Gain Control (AGC) loudness stabilization
    let agcGain = 1.0;
    if (this.inputEnvelope > 1e-4) {
      const targetGain = 0.12 / this.inputEnvelope;
      agcGain = Math.max(0.63, Math.min(1.58, targetGain)); // range from -4dB to +4dB
      agcGain = 1.0 + (agcGain - 1.0) * 0.45; // blend 45% of AGC correction
    }

    // Process output loop for late-stage components
    for (let i = 0; i < bufferSize; i++) {
      let binL = accumRealL[i + 128];
      let binR = accumRealR[i + 128];

      // Add LFE Subwoofer
      const lfe = upmixLfe[i];
      binL += lfe * (0.707 * bassScalar);
      binR += lfe * (0.707 * bassScalar);

      // Add Phase-Aligned low fundamental subharmonics
      const subHarm = this.subBassSynth.process((inL[i] + inR[i]) * 0.5);
      binL += subHarm * subharmonicVolume;
      binR += subHarm * subharmonicVolume;

      // --- STAGE 4: ROOM REVERB STAGE ---
      // Apply FDN Reverb tail (skip FDN processing entirely if system load is high)
      if (!loadLimitReached && this.roomReflections > 0.05) {
        this.reverb.process(binL, binR, this.roomReflections, this.roomAbsorption);
        binL += this.reverb.outReverbL;
        binR += this.reverb.outReverbR;
      }

      // --- STAGE 7: LIMITER & SMOOTHNESS STAGE ---
      // Sibilance De-esser
      binL = this.deEsserL.process(binL, this.deEsserIntensity);
      binR = this.deEsserR.process(binR, this.deEsserIntensity);

      // Headphone compensation profile EQs — 4-stage per-channel biquad chain
      if (this.headphoneProfile !== 'none') {
        binL = this.hpCompL4.process(this.hpCompL3.process(this.hpCompL2.process(this.hpCompL1.process(binL))));
        binR = this.hpCompR4.process(this.hpCompR3.process(this.hpCompR2.process(this.hpCompR1.process(binR))));
      }

      // Dynamic tilt correction (spectral warmth)
      binL = this.tiltL.process(binL);
      binR = this.tiltR.process(binR);

      // Hearing calibration filter banks
      binL = this.hearingL4.process(this.hearingL3.process(this.hearingL2.process(this.hearingL1.process(binL))));
      binR = this.hearingR4.process(this.hearingR3.process(this.hearingR2.process(this.hearingR1.process(binR))));

      // Dynamic Saturation (Harmonic warmth waveshaping)
      binL = binL / (1.0 + Math.abs(binL) * 0.12 * this.spectralWarmth);
      binR = binR / (1.0 + Math.abs(binR) * 0.12 * this.spectralWarmth);

      // Master volume scale + AGC loudness compensation
      binL *= this.volume * agcGain;
      binR *= this.volume * agcGain;

      // Dynamic compression / peak Limiter
      this.limiter.process(binL, binR);
      const limitedL = this.limiter.outL;
      const limitedR = this.limiter.outR;
      if (this.activePreset === "relaxed_night") {
        outL[i] = limitedL * 1.3;
        outR[i] = limitedR * 1.3;
      } else {
        outL[i] = limitedL;
        outR[i] = limitedR;
      }

      // Update max metrics for VU telemetry
      maxL = Math.max(maxL, Math.abs(duckedL[i]));
      maxR = Math.max(maxR, Math.abs(duckedR[i]));
      maxC = Math.max(maxC, Math.abs(upmixC[i]));
      maxLfe = Math.max(maxLfe, Math.abs(lfe));
      maxLs = Math.max(maxLs, Math.abs(upmixLs[i]));
      maxRs = Math.max(maxRs, Math.abs(upmixRs[i]));
      maxLb = Math.max(maxLb, Math.abs(upmixLb[i]));
      maxRb = Math.max(maxRb, Math.abs(upmixRb[i]));
      maxLh = Math.max(maxLh, Math.abs(upmixLh[i]));
      maxRh = Math.max(maxRh, Math.abs(upmixRh[i]));
    }

    const endCpu = typeof performance !== 'undefined' ? performance.now() : 0;
    const elapsed = endCpu - startCpu;
    this.rollingElapsed = this.rollingElapsed * 0.9 + elapsed * 0.1;

    // Budget in milliseconds: (128 / sampleRate) * 1000
    const frameBudgetMs = (128 / this.sampleRateValue) * 1000;
    if (elapsed > frameBudgetMs) {
      this.underrunCount++;
    }
    if (elapsed > frameBudgetMs * 3.0) {
      this.gcPauseCount++;
    }

    // --- STAGE 8: TELEMETRY STAGE ---
    this.analyticTimer++;
    this.dspCycleCount++;
    if (this.isUIActive && this.analyticTimer >= 15) {
      this.analyticTimer = 0;
      this.channelLevels[0] = maxL;
      this.channelLevels[1] = maxR;
      this.channelLevels[2] = maxC;
      this.channelLevels[3] = maxLfe;
      this.channelLevels[4] = maxLs;
      this.channelLevels[5] = maxRs;
      this.channelLevels[6] = maxLb;
      this.channelLevels[7] = maxRb;
      this.channelLevels[8] = maxLh;
      this.channelLevels[9] = maxRh;

      for (let idx = 0; idx < 10; idx++) {
        this.channelLevelsArray[idx] = this.channelLevels[idx];
      }

      this.port.postMessage({
        type: "LEVEL_METERS",
        levels: this.channelLevelsArray,
        outputLevel: [this.limiter.envelope],
        aiClass: aiClass,
        performanceMs: this.rollingElapsed,
        dspLoadRatio: this.rollingElapsed / frameBudgetMs,
        underrunCount: this.underrunCount,
        gcPauseCount: this.gcPauseCount
      });
    }

    return true;
  }

  applyHeadphoneCompensation(l: number, r: number): [number, number] {
    let outL = l;
    let outR = r;
    switch (this.headphoneProfile) {
      case 'open_back':
        outL = this.hpCompL2.process(this.hpCompL1.process(outL));
        outR = this.hpCompR2.process(this.hpCompR1.process(outR));
        break;
      case 'closed_back':
        outL = this.hpCompL2.process(this.hpCompL1.process(outL));
        outR = this.hpCompR2.process(this.hpCompR1.process(outR));
        break;
      case 'gaming_headset':
        outL = this.hpCompL2.process(this.hpCompL1.process(outL));
        outR = this.hpCompR2.process(this.hpCompR1.process(outR));
        break;
      case 'earbuds':
        outL = this.hpCompL2.process(this.hpCompL1.process(outL));
        outR = this.hpCompR2.process(this.hpCompR1.process(outR));
        break;
      default:
        break;
    }
    return [outL, outR];
  }
}

registerProcessor("surround-processor", SurroundProcessor);
