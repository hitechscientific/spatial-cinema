use wasm_bindgen::prelude::*;
use std::f32::consts::PI;

// Biquad Filter in Rust
struct Biquad {
    b0: f32, b1: f32, b2: f32,
    a1: f32, a2: f32,
    x1: f32, x2: f32,
    y1: f32, y2: f32,
    a0: f32,
}

impl Biquad {
    fn new() -> Self {
        Self {
            b0: 1.0, b1: 0.0, b2: 0.0,
            a1: 0.0, a2: 0.0,
            x1: 0.0, x2: 0.0,
            y1: 0.0, y2: 0.0,
            a0: 1.0,
        }
    }

    fn set_lowpass(&mut self, cutoff: f32, sample_rate: f32, q: f32) {
        let w0 = 2.0 * PI * cutoff / sample_rate;
        let alpha = w0.sin() / (2.0 * q);
        let cosw0 = w0.cos();
        self.a0 = 1.0 + alpha;
        
        self.b0 = (1.0 - cosw0) / 2.0 / self.a0;
        self.b1 = (1.0 - cosw0) / self.a0;
        self.b2 = (1.0 - cosw0) / 2.0 / self.a0;
        self.a1 = -2.0 * cosw0 / self.a0;
        self.a2 = (1.0 - alpha) / self.a0;
    }

    fn set_highpass(&mut self, cutoff: f32, sample_rate: f32, q: f32) {
        let w0 = 2.0 * PI * cutoff / sample_rate;
        let alpha = w0.sin() / (2.0 * q);
        let cosw0 = w0.cos();
        self.a0 = 1.0 + alpha;
        
        self.b0 = (1.0 + cosw0) / 2.0 / self.a0;
        self.b1 = -(1.0 + cosw0) / self.a0;
        self.b2 = (1.0 + cosw0) / 2.0 / self.a0;
        self.a1 = -2.0 * cosw0 / self.a0;
        self.a2 = (1.0 - alpha) / self.a0;
    }

    fn set_peaking(&mut self, frequency: f32, sample_rate: f32, gain_db: f32, q: f32) {
        let w0 = 2.0 * PI * frequency / sample_rate;
        let alpha = w0.sin() / (2.0 * q);
        let cosw0 = w0.cos();
        let amp = 10.0f32.powf(gain_db / 40.0);
        self.a0 = 1.0 + alpha / amp;
        
        self.b0 = (1.0 + alpha * amp) / self.a0;
        self.b1 = -2.0 * cosw0 / self.a0;
        self.b2 = (1.0 - alpha * amp) / self.a0;
        self.a1 = -2.0 * cosw0 / self.a0;
        self.a2 = (1.0 - alpha / amp) / self.a0;
    }

    fn set_highshelf(&mut self, frequency: f32, sample_rate: f32, gain_db: f32, q: f32) {
        let w0 = 2.0 * PI * frequency / sample_rate;
        let cosw0 = w0.cos();
        let amp = 10.0f32.powf(gain_db / 40.0);
        let beta = amp.sqrt() / q;
        
        self.a0 = (amp + 1.0) + (amp - 1.0) * cosw0 + beta * w0.sin();
        self.b0 = (amp * ((amp + 1.0) - (amp - 1.0) * cosw0 + beta * w0.sin())) / self.a0;
        self.b1 = (2.0 * amp * ((amp - 1.0) - (amp + 1.0) * cosw0)) / self.a0;
        self.b2 = (amp * ((amp + 1.0) - (amp - 1.0) * cosw0 - beta * w0.sin())) / self.a0;
        self.a1 = (-2.0 * ((amp - 1.0) + (amp + 1.0) * cosw0)) / self.a0;
        self.a2 = ((amp + 1.0) + (amp - 1.0) * cosw0 - beta * w0.sin()) / self.a0;
    }

    fn set_lowshelf(&mut self, frequency: f32, sample_rate: f32, gain_db: f32, q: f32) {
        let w0 = 2.0 * PI * frequency / sample_rate;
        let cosw0 = w0.cos();
        let amp = 10.0f32.powf(gain_db / 40.0);
        let beta = amp.sqrt() / q;

        self.a0 = (amp + 1.0) - (amp - 1.0) * cosw0 + beta * w0.sin();
        self.b0 = (amp * ((amp + 1.0) - (amp - 1.0) * cosw0 + beta * w0.sin())) / self.a0;
        self.b1 = (2.0 * amp * ((amp - 1.0) - (amp + 1.0) * cosw0)) / self.a0;
        self.b2 = (amp * ((amp + 1.0) - (amp - 1.0) * cosw0 - beta * w0.sin())) / self.a0;
        self.a1 = (2.0 * ((amp - 1.0) - (amp + 1.0) * cosw0)) / self.a0;
        self.a2 = ((amp + 1.0) - (amp - 1.0) * cosw0 - beta * w0.sin()) / self.a0;
    }

    fn set_notch(&mut self, frequency: f32, sample_rate: f32, q: f32) {
        let w0 = 2.0 * PI * frequency / sample_rate;
        let alpha = w0.sin() / (2.0 * q);
        let cosw0 = w0.cos();
        self.a0 = 1.0 + alpha;
        
        self.b0 = 1.0 / self.a0;
        self.b1 = -2.0 * cosw0 / self.a0;
        self.b2 = 1.0 / self.a0;
        self.a1 = -2.0 * cosw0 / self.a0;
        self.a2 = (1.0 - alpha) / self.a0;
    }

    fn set_bandpass(&mut self, frequency: f32, sample_rate: f32, q: f32) {
        let w0 = 2.0 * PI * frequency / sample_rate;
        let alpha = w0.sin() / (2.0 * q);
        let cosw0 = w0.cos();
        self.a0 = 1.0 + alpha;
        
        self.b0 = alpha / self.a0;
        self.b1 = 0.0;
        self.b2 = -alpha / self.a0;
        self.a1 = -2.0 * cosw0 / self.a0;
        self.a2 = (1.0 - alpha) / self.a0;
    }

    #[inline(always)]
    fn process(&mut self, x: f32) -> f32 {
        let y = self.b0 * x + self.b1 * self.x1 + self.b2 * self.x2 - self.a1 * self.y1 - self.a2 * self.y2;
        self.x2 = self.x1;
        self.x1 = x;
        self.y2 = self.y1;
        self.y1 = y;
        y
    }
}

// Circular Buffer Delay Line
struct Delay {
    buffer: Vec<f32>,
    write_ptr: usize,
}

impl Delay {
    fn new(size: usize) -> Self {
        Self {
            buffer: vec![0.0; size],
            write_ptr: 0,
        }
    }

    #[inline(always)]
    fn write(&mut self, sample: f32) {
        self.buffer[self.write_ptr] = sample;
        self.write_ptr = (self.write_ptr + 1) % self.buffer.len();
    }

    #[inline(always)]
    fn read(&self, delay_samples: f32) -> f32 {
        let len = self.buffer.len();
        let d_floor = delay_samples.floor() as usize;
        let read_ptr = (self.write_ptr + len - d_floor) % len;
        self.buffer[read_ptr]
    }
}

// Peak Limiter
struct Limiter {
    threshold: f32,
    attack: f32,
    release: f32,
    envelope: f32,
    sample_rate: f32,
}

impl Limiter {
    fn new(sample_rate: f32) -> Self {
        Self {
            threshold: 0.98,
            attack: 0.001,
            release: 0.15,
            envelope: 0.0,
            sample_rate,
        }
    }

    #[inline(always)]
    fn process(&mut self, l: f32, r: f32) -> (f32, f32) {
        let peak = l.abs().max(r.abs());
        
        let att_coef = (-1.0 / (self.sample_rate * self.attack)).exp();
        let rel_coef = (-1.0 / (self.sample_rate * self.release)).exp();

        if peak > self.envelope {
            self.envelope = att_coef * (self.envelope - peak) + peak;
        } else {
            self.envelope = rel_coef * (self.envelope - peak) + peak;
        }

        let mut gain = 1.0;
        if self.envelope > self.threshold {
            gain = self.threshold / self.envelope;
        }

        (l * gain, r * gain)
    }
}

// Reverb FDN (Feedback Delay Network with Damping)
struct Reverb {
    delays: [Delay; 4],
    filters: [Biquad; 4],
    damping_filters: [Biquad; 4],
}

impl Reverb {
    fn new(sample_rate: f32) -> Self {
        let delay_times = [983, 1153, 1429, 1601];
        let mut delays = [
            Delay::new(2048),
            Delay::new(2048),
            Delay::new(2048),
            Delay::new(2048)
        ];
        
        for i in 0..4 {
            let actual_samples = (delay_times[i] as f32 * (sample_rate / 48000.0)).floor() as usize;
            delays[i] = Delay::new(actual_samples);
        }

        let mut filters = [
            Biquad::new(), Biquad::new(), Biquad::new(), Biquad::new()
        ];
        let mut damping_filters = [
            Biquad::new(), Biquad::new(), Biquad::new(), Biquad::new()
        ];

        for i in 0..4 {
            filters[i].set_lowpass(3500.0, sample_rate, 0.5);
            damping_filters[i].set_lowpass(2200.0, sample_rate, 0.4);
        }

        Self {
            delays,
            filters,
            damping_filters,
        }
    }

    #[inline(always)]
    fn process(&mut self, l: f32, r: f32, room_size: f32, absorption: f32) -> (f32, f32) {
        if room_size <= 0.0 {
            return (0.0, 0.0);
        }

        let s0 = self.delays[0].read((self.delays[0].buffer.len() - 1) as f32);
        let s1 = self.delays[1].read((self.delays[1].buffer.len() - 1) as f32);
        let s2 = self.delays[2].read((self.delays[2].buffer.len() - 1) as f32);
        let s3 = self.delays[3].read((self.delays[3].buffer.len() - 1) as f32);

        let f0 = self.filters[0].process(s0);
        let f1 = self.filters[1].process(s1);
        let f2 = self.filters[2].process(s2);
        let f3 = self.filters[3].process(s3);

        let d0 = self.damping_filters[0].process(f0);
        let d1 = self.damping_filters[1].process(f1);
        let d2 = self.damping_filters[2].process(f2);
        let d3 = self.damping_filters[3].process(f3);

        let g = 0.55 * room_size * (1.0 - absorption * 0.4);
        let o0 = g * (d0 + d1 + d2 + d3);
        let o1 = g * (d0 - d1 + d2 - d3);
        let o2 = g * (d0 + d1 - d2 - d3);
        let o3 = g * (d0 - d1 - d2 + d3);

        let input = (l + r) * 0.5;
        self.delays[0].write(input + o0);
        self.delays[1].write(input + o1);
        self.delays[2].write(input + o2);
        self.delays[3].write(input + o3);

        ((d0 + d2) * 0.35, (d1 + d3) * 0.35)
    }
}

// Subharmonic Synthesizer
struct SubharmonicSynthesizer {
    last_sample: f32,
    state: bool,
    counter: i32,
    filtered_sub: f32,
    lpf: Biquad,
}

impl SubharmonicSynthesizer {
    fn new(sample_rate: f32) -> Self {
        let mut lpf = Biquad::new();
        lpf.set_lowpass(55.0, sample_rate, 0.707);
        Self {
            last_sample: 0.0,
            state: false,
            counter: 0,
            filtered_sub: 0.0,
            lpf,
        }
    }

    #[inline(always)]
    fn process(&mut self, mono_signal: f32) -> f32 {
        if mono_signal > 0.005 && self.last_sample <= 0.005 {
            self.counter += 1;
            if self.counter >= 2 {
                self.state = !self.state;
                self.counter = 0;
            }
        }
        self.last_sample = mono_signal;

        let square_val = if self.state { 1.0 } else { -1.0 };
        let raw_sub = square_val * mono_signal.abs() * 0.65;
        self.filtered_sub = self.lpf.process(raw_sub);
        self.filtered_sub
    }
}

// De-esser
struct DeEsser {
    detector_hpf: Biquad,
    notch: Biquad,
    envelope: f32,
    sample_rate: f32,
}

impl DeEsser {
    fn new(sample_rate: f32) -> Self {
        let mut detector_hpf = Biquad::new();
        detector_hpf.set_highpass(6000.0, sample_rate, 0.707);
        let mut notch = Biquad::new();
        notch.set_peaking(6500.0, sample_rate, 0.0, 1.5);
        Self {
            detector_hpf,
            notch,
            envelope: 0.0,
            sample_rate,
        }
    }

    #[inline(always)]
    fn process(&mut self, x: f32, intensity: f32) -> f32 {
        if intensity <= 0.0 {
            return x;
        }

        let hp = self.detector_hpf.process(x);
        let abs_hp = hp.abs();
        
        let att = (-1.0 / (self.sample_rate * 0.005)).exp();
        let rel = (-1.0 / (self.sample_rate * 0.05)).exp();
        
        if abs_hp > self.envelope {
            self.envelope = att * (self.envelope - abs_hp) + abs_hp;
        } else {
            self.envelope = rel * (self.envelope - abs_hp) + abs_hp;
        }

        if self.envelope > 0.015 {
            let reduction_db = -8.0f32.min((self.envelope - 0.015) * 45.0 * intensity);
            self.notch.set_peaking(6500.0, self.sample_rate, reduction_db, 1.5);
        } else {
            self.notch.set_peaking(6500.0, self.sample_rate, 0.0, 1.5);
        }

        self.notch.process(x)
    }
}

// Slow LFO
struct SlowLFO {
    phase: f32,
    step: f32,
}

impl SlowLFO {
    fn new(frequency: f32, sample_rate: f32) -> Self {
        Self {
            phase: 0.0,
            step: (2.0 * PI * frequency) / sample_rate,
        }
    }

    #[inline(always)]
    fn next(&mut self) -> f32 {
        self.phase += self.step;
        if self.phase >= 2.0 * PI {
            self.phase -= 2.0 * PI;
        }
        self.phase.sin()
    }
}

// Radix-2 Complex 256-point FFT
struct FFT256 {
    rev_table: [usize; 256],
    sin_table: [f32; 128],
    cos_table: [f32; 128],
}

impl FFT256 {
    fn new() -> Self {
        let mut rev_table = [0; 256];
        for i in 0..256 {
            let mut r = 0;
            for j in 0..8 {
                if (i & (1 << j)) != 0 {
                    r |= 1 << (7 - j);
                }
            }
            rev_table[i] = r;
        }

        let mut sin_table = [0.0; 128];
        let mut cos_table = [0.0; 128];
        for i in 0..128 {
            let angle = (2.0 * PI * i as f32) / 256.0;
            sin_table[i] = angle.sin();
            cos_table[i] = angle.cos();
        }

        Self {
            rev_table,
            sin_table,
            cos_table,
        }
    }

    fn fft(&self, real: &mut [f32], imag: &mut [f32]) {
        for i in 0..256 {
            let r = self.rev_table[i];
            if i < r {
                real.swap(i, r);
                imag.swap(i, r);
            }
        }

        let mut size = 2;
        while size <= 256 {
            let half_size = size >> 1;
            let tab_step = 256 / size;
            for i in (0..256).step_by(size) {
                for j in 0..half_size {
                    let k = i + j;
                    let l = k + half_size;
                    let twiddle_idx = j * tab_step;
                    let wr = self.cos_table[twiddle_idx];
                    let wi = -self.sin_table[twiddle_idx];

                    let tr = real[l] * wr - imag[l] * wi;
                    let ti = real[l] * wi + imag[l] * wr;

                    real[l] = real[k] - tr;
                    imag[l] = imag[k] - ti;
                    real[k] += tr;
                    imag[k] += ti;
                }
            }
            size <<= 1;
        }
    }

    fn ifft(&self, real: &mut [f32], imag: &mut [f32]) {
        for i in 0..256 {
            imag[i] = -imag[i];
        }
        self.fft(real, imag);
        for i in 0..256 {
            real[i] /= 256.0;
            imag[i] = -imag[i] / 256.0;
        }
    }
}

// Partitioned Overlap-Save Convolver in Rust
struct BinauralConvolver {
    num_partitions: usize,
    ipsi_real: Vec<Vec<f32>>,
    ipsi_imag: Vec<Vec<f32>>,
    contra_real: Vec<Vec<f32>>,
    contra_imag: Vec<Vec<f32>>,

    target_ipsi_real: Vec<Vec<f32>>,
    target_ipsi_imag: Vec<Vec<f32>>,
    target_contra_real: Vec<Vec<f32>>,
    target_contra_imag: Vec<Vec<f32>>,

    x_real_ring: Vec<Vec<f32>>,
    x_imag_ring: Vec<Vec<f32>>,
    ring_ptr: usize,
    input_history: Vec<f32>,
}

impl BinauralConvolver {
    fn new() -> Self {
        let mut ipsi_taps = vec![0.0; 32];
        ipsi_taps[15] = 1.0;
        let mut contra_taps = vec![0.0; 32];
        contra_taps[15] = 1.0;

        let mut bc = Self {
            num_partitions: 1,
            ipsi_real: vec![vec![0.0; 256]],
            ipsi_imag: vec![vec![0.0; 256]],
            contra_real: vec![vec![0.0; 256]],
            contra_imag: vec![vec![0.0; 256]],
            target_ipsi_real: vec![vec![0.0; 256]],
            target_ipsi_imag: vec![vec![0.0; 256]],
            target_contra_real: vec![vec![0.0; 256]],
            target_contra_imag: vec![vec![0.0; 256]],
            x_real_ring: vec![vec![0.0; 256]],
            x_imag_ring: vec![vec![0.0; 256]],
            ring_ptr: 0,
            input_history: vec![0.0; 256],
        };
        let fft = FFT256::new();
        bc.update_taps(&ipsi_taps, &contra_taps, &fft);
        bc
    }

    fn update_taps(&mut self, ipsi_taps: &[f32], contra_taps: &[f32], fft: &FFT256) {
        let l = 128;
        let max_len = ipsi_taps.len().max(contra_taps.len());
        let new_partitions = 1.max((max_len + l - 1) / l);

        self.num_partitions = new_partitions;
        self.target_ipsi_real.clear();
        self.target_ipsi_imag.clear();
        self.target_contra_real.clear();
        self.target_contra_imag.clear();

        while self.x_real_ring.len() < new_partitions {
            self.x_real_ring.push(vec![0.0; 256]);
            self.x_imag_ring.push(vec![0.0; 256]);
        }

        if self.ring_ptr >= new_partitions {
            self.ring_ptr = 0;
        }

        for p in 0..new_partitions {
            let mut ipsi_r = vec![0.0; 256];
            let mut ipsi_i = vec![0.0; 256];
            let mut contra_r = vec![0.0; 256];
            let mut contra_i = vec![0.0; 256];

            let start = p * l;
            for i in 0..l {
                if start + i < ipsi_taps.len() {
                    ipsi_r[i] = ipsi_taps[start + i];
                }
                if start + i < contra_taps.len() {
                    contra_r[i] = contra_taps[start + i];
                }
            }

            fft.fft(&mut ipsi_r, &mut ipsi_i);
            fft.fft(&mut contra_r, &mut contra_i);

            self.target_ipsi_real.push(ipsi_r);
            self.target_ipsi_imag.push(ipsi_i);
            self.target_contra_real.push(contra_r);
            self.target_contra_imag.push(contra_i);

            if self.ipsi_real.len() <= p {
                self.ipsi_real.push(self.target_ipsi_real[p].clone());
                self.ipsi_imag.push(self.target_ipsi_imag[p].clone());
                self.contra_real.push(self.target_contra_real[p].clone());
                self.contra_imag.push(self.target_contra_imag[p].clone());
            }
        }
    }

    fn process_block(
        &mut self,
        input_block: &[f32],
        accum_real_l: &mut [f32],
        accum_imag_l: &mut [f32],
        accum_real_r: &mut [f32],
        accum_imag_r: &mut [f32],
        fft: &FFT256,
    ) {
        let m = self.num_partitions;

        // 1. Smoothly step spectra towards target coeffs
        for p in 0..m {
            let ir = &mut self.ipsi_real[p];
            let ii = &mut self.ipsi_imag[p];
            let cr = &mut self.contra_real[p];
            let ci = &mut self.contra_imag[p];

            let tir = &self.target_ipsi_real[p];
            let tii = &self.target_ipsi_imag[p];
            let tcr = &self.target_contra_real[p];
            let tci = &self.target_contra_imag[p];

            for i in 0..256 {
                ir[i] += (tir[i] - ir[i]) * 0.15;
                ii[i] += (tii[i] - ii[i]) * 0.15;
                cr[i] += (tcr[i] - cr[i]) * 0.15;
                ci[i] += (tci[i] - ci[i]) * 0.15;
            }
        }

        // 2. Shift history
        for i in 0..128 {
            self.input_history[i] = self.input_history[i + 128];
            self.input_history[i + 128] = input_block[i];
        }

        // 3. FFT on history
        let idx_ring = self.ring_ptr;
        let xr = &mut self.x_real_ring[idx_ring];
        let xi = &mut self.x_imag_ring[idx_ring];
        xr.copy_from_slice(&self.input_history);
        xi.fill(0.0);

        fft.fft(xr, xi);

        // 4. Overlap-Save complex vector multiplication (WASM SIMD Accelerated)
        for p in 0..m {
            let idx = (idx_ring + m - p) % m;
            let cur_x_r = &self.x_real_ring[idx];
            let cur_x_i = &self.x_imag_ring[idx];

            let ir = &self.ipsi_real[p];
            let ii = &self.ipsi_imag[p];
            let cr = &self.contra_real[p];
            let ci = &self.contra_imag[p];

            #[cfg(target_arch = "wasm32")]
            {
                use std::arch::wasm32::*;
                for i in (0..256).step_by(4) {
                    unsafe {
                        let xr_v = v128_load(cur_x_r.as_ptr().add(i) as *const v128);
                        let xi_v = v128_load(cur_x_i.as_ptr().add(i) as *const v128);
                        let ir_v = v128_load(ir.as_ptr().add(i) as *const v128);
                        let ii_v = v128_load(ii.as_ptr().add(i) as *const v128);
                        let cr_v = v128_load(cr.as_ptr().add(i) as *const v128);
                        let ci_v = v128_load(ci.as_ptr().add(i) as *const v128);

                        // Left Channel real & imag
                        let term1 = f32x4_mul(xr_v, ir_v);
                        let term2 = f32x4_mul(xi_v, ii_v);
                        let ipsi_real_v = f32x4_sub(term1, term2);

                        let term3 = f32x4_mul(xr_v, ii_v);
                        let term4 = f32x4_mul(xi_v, ir_v);
                        let ipsi_imag_v = f32x4_add(term3, term4);

                        // Right Channel real & imag
                        let term5 = f32x4_mul(xr_v, cr_v);
                        let term6 = f32x4_mul(xi_v, ci_v);
                        let contra_real_v = f32x4_sub(term5, term6);

                        let term7 = f32x4_mul(xr_v, ci_v);
                        let term8 = f32x4_mul(xi_v, cr_v);
                        let contra_imag_v = f32x4_add(term7, term8);

                        // Load accumulation
                        let acc_rl_v = v128_load(accum_real_l.as_ptr().add(i) as *const v128);
                        let acc_il_v = v128_load(accum_imag_l.as_ptr().add(i) as *const v128);
                        let acc_rr_v = v128_load(accum_real_r.as_ptr().add(i) as *const v128);
                        let acc_ir_v = v128_load(accum_imag_r.as_ptr().add(i) as *const v128);

                        // Add and write back
                        v128_store(accum_real_l.as_mut_ptr().add(i) as *mut v128, f32x4_add(acc_rl_v, ipsi_real_v));
                        v128_store(accum_imag_l.as_mut_ptr().add(i) as *mut v128, f32x4_add(acc_il_v, ipsi_imag_v));
                        v128_store(accum_real_r.as_mut_ptr().add(i) as *mut v128, f32x4_add(acc_rr_v, contra_real_v));
                        v128_store(accum_imag_r.as_mut_ptr().add(i) as *mut v128, f32x4_add(acc_ir_v, contra_imag_v));
                    }
                }
            }

            #[cfg(not(target_arch = "wasm32"))]
            {
                for i in 0..256 {
                    let xr_val = cur_x_r[i];
                    let xi_val = cur_x_i[i];
                    let ir_val = ir[i];
                    let ii_val = ii[i];
                    let cr_val = cr[i];
                    let ci_val = ci[i];

                    accum_real_l[i] += xr_val * ir_val - xi_val * ii_val;
                    accum_imag_l[i] += xr_val * ii_val + xi_val * ir_val;
                    accum_real_r[i] += xr_val * cr_val - xi_val * ci_val;
                    accum_imag_r[i] += xr_val * ci_val + xi_val * cr_val;
                }
            }
        }

        self.ring_ptr = (self.ring_ptr + 1) % m;
    }
}

// Spatializer Export Class
#[wasm_bindgen]
pub struct Spatializer {
    sample_rate: f32,
    volume: f32,
    surround_intensity: f32,
    bass_boost: f32,
    dialogue_enhance: f32,
    room_reflections: f32,
    crosstalk: bool,
    dynamic_eq: bool,

    room_size: f32,
    room_absorption: f32,
    de_esser_intensity: f32,
    spectral_warmth: f32,
    drift_amount: f32,
    headphone_profile: String,
    active_preset: String,

    lfe_lpf: Biquad,
    dialogue_eq: Biquad,
    limiter: Limiter,
    reverb: Reverb,
    sub_bass_synth: SubharmonicSynthesizer,
    de_esser_l: DeEsser,
    de_esser_r: DeEsser,
    surround_lfo: SlowLFO,

    surround_delay_l: Delay,
    surround_delay_r: Delay,
    back_delay_l: Delay,
    back_delay_r: Delay,
    height_delay_l: Delay,
    height_delay_r: Delay,

    height_bandpass_l: Biquad,
    height_bandpass_r: Biquad,
    height_notch_l: Biquad,
    height_notch_r: Biquad,

    side_ducker_l: Biquad,
    side_ducker_r: Biquad,
    side_ducker_ls: Biquad,
    side_ducker_rs: Biquad,

    hearing_l1: Biquad,
    hearing_l2: Biquad,
    hearing_l3: Biquad,
    hearing_l4: Biquad,
    hearing_r1: Biquad,
    hearing_r2: Biquad,
    hearing_r3: Biquad,
    hearing_r4: Biquad,

    hp_comp_l1: Biquad,
    hp_comp_l2: Biquad,
    hp_comp_l3: Biquad,
    hp_comp_l4: Biquad,
    hp_comp_r1: Biquad,
    hp_comp_r2: Biquad,
    hp_comp_r3: Biquad,
    hp_comp_r4: Biquad,

    tilt_l: Biquad,
    tilt_r: Biquad,

    fft_helper: FFT256,
    convolvers: Vec<BinauralConvolver>,

    accum_real_l: Vec<f32>,
    accum_imag_l: Vec<f32>,
    accum_real_r: Vec<f32>,
    accum_imag_r: Vec<f32>,

    upmix_c: Vec<f32>,
    upmix_lfe: Vec<f32>,
    upmix_ls: Vec<f32>,
    upmix_rs: Vec<f32>,
    upmix_lb: Vec<f32>,
    upmix_rb: Vec<f32>,
    upmix_lh: Vec<f32>,
    upmix_rh: Vec<f32>,
    ducked_l: Vec<f32>,
    ducked_r: Vec<f32>,

    voice_envelope: f32,
}

#[wasm_bindgen]
impl Spatializer {
    #[wasm_bindgen(constructor)]
    pub fn new(sample_rate: f32) -> Self {
        let mut lfe_lpf = Biquad::new();
        lfe_lpf.set_lowpass(120.0, sample_rate, 0.707);

        let mut dialogue_eq = Biquad::new();
        dialogue_eq.set_peaking(1500.0, sample_rate, 1.0, 1.2);

        let limiter = Limiter::new(sample_rate);
        let reverb = Reverb::new(sample_rate);
        let sub_bass_synth = SubharmonicSynthesizer::new(sample_rate);
        let de_esser_l = DeEsser::new(sample_rate);
        let de_esser_r = DeEsser::new(sample_rate);
        let surround_lfo = SlowLFO::new(0.18, sample_rate);

        // Haas delay limits + padding
        let surround_delay_l = Delay::new(2048);
        let surround_delay_r = Delay::new(2048);
        let back_delay_l = Delay::new(2048);
        let back_delay_r = Delay::new(2048);
        let height_delay_l = Delay::new(2048);
        let height_delay_r = Delay::new(2048);

        // Height filter bands
        let mut height_bandpass_l = Biquad::new();
        let mut height_bandpass_r = Biquad::new();
        height_bandpass_l.set_bandpass(6000.0, sample_rate, 1.0);
        height_bandpass_r.set_bandpass(6000.0, sample_rate, 1.0);

        let mut height_notch_l = Biquad::new();
        let mut height_notch_r = Biquad::new();
        height_notch_l.set_notch(7500.0, sample_rate, 5.0);
        height_notch_r.set_notch(7500.0, sample_rate, 5.0);

        // Dialogue ducking notches
        let mut side_ducker_l = Biquad::new();
        let mut side_ducker_r = Biquad::new();
        let mut side_ducker_ls = Biquad::new();
        let mut side_ducker_rs = Biquad::new();
        side_ducker_l.set_peaking(1500.0, sample_rate, 0.0, 1.0);
        side_ducker_r.set_peaking(1500.0, sample_rate, 0.0, 1.0);
        side_ducker_ls.set_peaking(1500.0, sample_rate, 0.0, 1.0);
        side_ducker_rs.set_peaking(1500.0, sample_rate, 0.0, 1.0);

        // Hearing profiles
        let mut hearing_l1 = Biquad::new();
        let mut hearing_l2 = Biquad::new();
        let mut hearing_l3 = Biquad::new();
        let mut hearing_l4 = Biquad::new();
        let mut hearing_r1 = Biquad::new();
        let mut hearing_r2 = Biquad::new();
        let mut hearing_r3 = Biquad::new();
        let mut hearing_r4 = Biquad::new();
        hearing_l1.set_peaking(250.0, sample_rate, 0.0, 1.0);
        hearing_l2.set_peaking(1000.0, sample_rate, 0.0, 1.0);
        hearing_l3.set_peaking(4000.0, sample_rate, 0.0, 1.0);
        hearing_l4.set_peaking(8000.0, sample_rate, 0.0, 1.0);
        hearing_r1.set_peaking(250.0, sample_rate, 0.0, 1.0);
        hearing_r2.set_peaking(1000.0, sample_rate, 0.0, 1.0);
        hearing_r3.set_peaking(4000.0, sample_rate, 0.0, 1.0);
        hearing_r4.set_peaking(8000.0, sample_rate, 0.0, 1.0);

        // HP Compensation EQs
        let hp_comp_l1 = Biquad::new();
        let hp_comp_l2 = Biquad::new();
        let hp_comp_r1 = Biquad::new();
        let hp_comp_r2 = Biquad::new();

        // Tilt EQs
        let tilt_l = Biquad::new();
        let tilt_r = Biquad::new();

        let fft_helper = FFT256::new();
        let mut convolvers = Vec::new();

        // 9 channels: L, R, C, Ls, Rs, Lb, Rb, Lh, Rh
        for _ in 0..9 {
            convolvers.push(BinauralConvolver::new());
        }

        Self {
            sample_rate,
            volume: 0.85,
            surround_intensity: 0.85,
            bass_boost: 0.75,
            dialogue_enhance: 0.5,
            room_reflections: 0.6,
            crosstalk: true,
            dynamic_eq: true,

            room_size: 0.5,
            room_absorption: 0.5,
            de_esser_intensity: 0.4,
            spectral_warmth: 0.3,
            drift_amount: 0.2,
            headphone_profile: "none".to_string(),
            active_preset: "custom".to_string(),

            lfe_lpf,
            dialogue_eq,
            limiter,
            reverb,
            sub_bass_synth,
            de_esser_l,
            de_esser_r,
            surround_lfo,

            surround_delay_l,
            surround_delay_r,
            back_delay_l,
            back_delay_r,
            height_delay_l,
            height_delay_r,

            height_bandpass_l,
            height_bandpass_r,
            height_notch_l,
            height_notch_r,

            side_ducker_l,
            side_ducker_r,
            side_ducker_ls,
            side_ducker_rs,

            hearing_l1,
            hearing_l2,
            hearing_l3,
            hearing_l4,
            hearing_r1,
            hearing_r2,
            hearing_r3,
            hearing_r4,

            hp_comp_l1,
            hp_comp_l2,
            hp_comp_l3: Biquad::new(),
            hp_comp_l4: Biquad::new(),
            hp_comp_r1,
            hp_comp_r2,
            hp_comp_r3: Biquad::new(),
            hp_comp_r4: Biquad::new(),

            tilt_l,
            tilt_r,

            fft_helper,
            convolvers,

            accum_real_l: vec![0.0; 256],
            accum_imag_l: vec![0.0; 256],
            accum_real_r: vec![0.0; 256],
            accum_imag_r: vec![0.0; 256],

            upmix_c: vec![0.0; 128],
            upmix_lfe: vec![0.0; 128],
            upmix_ls: vec![0.0; 128],
            upmix_rs: vec![0.0; 128],
            upmix_lb: vec![0.0; 128],
            upmix_rb: vec![0.0; 128],
            upmix_lh: vec![0.0; 128],
            upmix_rh: vec![0.0; 128],
            ducked_l: vec![0.0; 128],
            ducked_r: vec![0.0; 128],

            voice_envelope: 0.0,
        }
    }

    pub fn set_settings(
        &mut self,
        volume: f32,
        surround_intensity: f32,
        bass_boost: f32,
        dialogue_enhance: f32,
        room_reflections: f32,
        crosstalk: bool,
        dynamic_eq: bool,
        room_size: f32,
        room_absorption: f32,
        de_esser_intensity: f32,
        spectral_warmth: f32,
        drift_amount: f32,
        headphone_profile_idx: i32,
        preset_idx: i32,
    ) {
        if preset_idx > 0 {
            match preset_idx {
                1 => { // cinema_ref
                    self.surround_intensity = 0.9;
                    self.bass_boost = 0.8;
                    self.dialogue_enhance = 0.5;
                    self.room_reflections = 0.55;
                    self.crosstalk = true;
                    self.dynamic_eq = true;
                    self.room_size = 0.65;
                    self.room_absorption = 0.6;
                    self.de_esser_intensity = 0.3;
                    self.spectral_warmth = 0.3;
                    self.drift_amount = 0.2;
                }
                2 => { // large_hall
                    self.surround_intensity = 1.2;
                    self.bass_boost = 0.9;
                    self.dialogue_enhance = 0.3;
                    self.room_reflections = 0.85;
                    self.crosstalk = true;
                    self.dynamic_eq = true;
                    self.room_size = 0.9;
                    self.room_absorption = 0.45;
                    self.de_esser_intensity = 0.4;
                    self.spectral_warmth = 0.4;
                    self.drift_amount = 0.4;
                }
                3 => { // intimate_studio
                    self.surround_intensity = 0.6;
                    self.bass_boost = 0.4;
                    self.dialogue_enhance = 0.3;
                    self.room_reflections = 0.25;
                    self.crosstalk = true;
                    self.dynamic_eq = false;
                    self.room_size = 0.3;
                    self.room_absorption = 0.75;
                    self.de_esser_intensity = 0.2;
                    self.spectral_warmth = 0.2;
                    self.drift_amount = 0.1;
                }
                4 => { // competitive_fps
                    self.surround_intensity = 1.25;
                    self.bass_boost = 0.15;
                    self.dialogue_enhance = 0.95;
                    self.room_reflections = 0.05;
                    self.crosstalk = true;
                    self.dynamic_eq = false;
                    self.room_size = 0.1;
                    self.room_absorption = 0.9;
                    self.de_esser_intensity = 0.1;
                    self.spectral_warmth = 0.1;
                    self.drift_amount = 0.05;
                }
                5 => { // concert_arena
                    self.surround_intensity = 1.35;
                    self.bass_boost = 1.0;
                    self.dialogue_enhance = 0.2;
                    self.room_reflections = 0.9;
                    self.crosstalk = false;
                    self.dynamic_eq = true;
                    self.room_size = 0.85;
                    self.room_absorption = 0.4;
                    self.de_esser_intensity = 0.5;
                    self.spectral_warmth = 0.5;
                    self.drift_amount = 0.5;
                }
                6 => { // dialogue_focus
                    self.surround_intensity = 0.4;
                    self.bass_boost = 0.2;
                    self.dialogue_enhance = 1.0;
                    self.room_reflections = 0.15;
                    self.crosstalk = true;
                    self.dynamic_eq = false;
                    self.room_size = 0.4;
                    self.room_absorption = 0.8;
                    self.de_esser_intensity = 0.3;
                    self.spectral_warmth = 0.2;
                    self.drift_amount = 0.1;
                }
                7 => { // relaxed_night
                    self.surround_intensity = 0.5;
                    self.bass_boost = 0.3;
                    self.dialogue_enhance = 0.75;
                    self.room_reflections = 0.3;
                    self.crosstalk = true;
                    self.dynamic_eq = true;
                    self.room_size = 0.5;
                    self.room_absorption = 0.65;
                    self.de_esser_intensity = 0.8;
                    self.spectral_warmth = 0.7;
                    self.drift_amount = 0.1;
                }
                _ => {}
            }
            self.volume = volume;
            self.active_preset = match preset_idx {
                1 => "cinema_ref".to_string(),
                2 => "large_hall".to_string(),
                3 => "intimate_studio".to_string(),
                4 => "competitive_fps".to_string(),
                5 => "concert_arena".to_string(),
                6 => "dialogue_focus".to_string(),
                7 => "relaxed_night".to_string(),
                _ => "custom".to_string(),
            };
        } else {
            self.volume = volume;
            self.surround_intensity = surround_intensity;
            self.bass_boost = bass_boost;
            self.dialogue_enhance = dialogue_enhance;
            self.room_reflections = room_reflections;
            self.crosstalk = crosstalk;
            self.dynamic_eq = dynamic_eq;
            self.room_size = room_size;
            self.room_absorption = room_absorption;
            self.de_esser_intensity = de_esser_intensity;
            self.spectral_warmth = spectral_warmth;
            self.drift_amount = drift_amount;
            self.active_preset = "custom".to_string();
        }

        self.headphone_profile = match headphone_profile_idx {
            1 => "open_back".to_string(),
            2 => "closed_back".to_string(),
            3 => "gaming_headset".to_string(),
            4 => "earbuds".to_string(),
            _ => "none".to_string(),
        };

        // Update headphone compensation filters — 4-stage per channel
        // Mirrors the TypeScript configureHeadphoneFilters() curves exactly.
        let rate = self.sample_rate;
        match headphone_profile_idx {
            1 => { // open_back — Harman 2018: sub-bass fill, upper-bass scoop, glare reduction, air restore
                self.hp_comp_l1.set_lowshelf(60.0, rate, 3.0, 0.70);
                self.hp_comp_r1.set_lowshelf(60.0, rate, 3.0, 0.70);
                self.hp_comp_l2.set_peaking(150.0, rate, -1.5, 1.20);
                self.hp_comp_r2.set_peaking(150.0, rate, -1.5, 1.20);
                self.hp_comp_l3.set_peaking(3500.0, rate, -1.0, 1.50);
                self.hp_comp_r3.set_peaking(3500.0, rate, -1.0, 1.50);
                self.hp_comp_l4.set_highshelf(10000.0, rate, 1.5, 0.70);
                self.hp_comp_r4.set_highshelf(10000.0, rate, 1.5, 0.70);
            }
            2 => { // closed_back — Diffuse Field: box resonance cut, mud clear, cymbal tame, air restore
                self.hp_comp_l1.set_peaking(200.0, rate, -3.0, 0.90);
                self.hp_comp_r1.set_peaking(200.0, rate, -3.0, 0.90);
                self.hp_comp_l2.set_peaking(400.0, rate, -1.5, 1.50);
                self.hp_comp_r2.set_peaking(400.0, rate, -1.5, 1.50);
                self.hp_comp_l3.set_peaking(6500.0, rate, -2.0, 2.00);
                self.hp_comp_r3.set_peaking(6500.0, rate, -2.0, 2.00);
                self.hp_comp_l4.set_highshelf(10000.0, rate, 2.5, 0.70);
                self.hp_comp_r4.set_highshelf(10000.0, rate, 2.5, 0.70);
            }
            3 => { // gaming_headset — ITU-R BS.1116: flatten V-shape, restore mids, tame presence
                self.hp_comp_l1.set_peaking(120.0, rate, -4.0, 0.80);
                self.hp_comp_r1.set_peaking(120.0, rate, -4.0, 0.80);
                self.hp_comp_l2.set_peaking(1000.0, rate, 2.0, 1.00);
                self.hp_comp_r2.set_peaking(1000.0, rate, 2.0, 1.00);
                self.hp_comp_l3.set_peaking(2500.0, rate, 2.5, 1.20);
                self.hp_comp_r3.set_peaking(2500.0, rate, 2.5, 1.20);
                self.hp_comp_l4.set_peaking(7000.0, rate, -2.0, 2.00);
                self.hp_comp_r4.set_peaking(7000.0, rate, -2.0, 2.00);
            }
            4 => { // earbuds — Harman IEM 2019: reduce seal bass, lift midrange, tame vent peak
                self.hp_comp_l1.set_peaking(80.0, rate, -2.5, 0.90);
                self.hp_comp_r1.set_peaking(80.0, rate, -2.5, 0.90);
                self.hp_comp_l2.set_peaking(800.0, rate, 1.0, 1.50);
                self.hp_comp_r2.set_peaking(800.0, rate, 1.0, 1.50);
                self.hp_comp_l3.set_peaking(8000.0, rate, -3.0, 2.00);
                self.hp_comp_r3.set_peaking(8000.0, rate, -3.0, 2.00);
                self.hp_comp_l4.set_highshelf(12000.0, rate, -1.5, 0.70);
                self.hp_comp_r4.set_highshelf(12000.0, rate, -1.5, 0.70);
            }
            _ => { // none — unity bypass
                self.hp_comp_l1.set_peaking(1000.0, rate, 0.0, 1.0);
                self.hp_comp_r1.set_peaking(1000.0, rate, 0.0, 1.0);
                self.hp_comp_l2.set_peaking(1000.0, rate, 0.0, 1.0);
                self.hp_comp_r2.set_peaking(1000.0, rate, 0.0, 1.0);
                self.hp_comp_l3.set_peaking(1000.0, rate, 0.0, 1.0);
                self.hp_comp_r3.set_peaking(1000.0, rate, 0.0, 1.0);
                self.hp_comp_l4.set_peaking(1000.0, rate, 0.0, 1.0);
                self.hp_comp_r4.set_peaking(1000.0, rate, 0.0, 1.0);
            }
        }

        let gain_db = -self.spectral_warmth * 2.0;
        self.tilt_l.set_highshelf(8000.0, rate, gain_db, 0.5);
        self.tilt_r.set_highshelf(8000.0, rate, gain_db, 0.5);

        let dialogue_boost_db = 1.0 + self.dialogue_enhance * 5.0;
        self.dialogue_eq.set_peaking(1500.0, rate, dialogue_boost_db, 1.2);
    }

    pub fn apply_hearing_profile(&mut self, left_gains: &[f32], right_gains: &[f32]) {
        let rate = self.sample_rate;
        if left_gains.len() >= 4 {
            self.hearing_l1.set_peaking(250.0, rate, left_gains[0], 1.0);
            self.hearing_l2.set_peaking(1000.0, rate, left_gains[1], 1.0);
            self.hearing_l3.set_peaking(4000.0, rate, left_gains[2], 1.0);
            self.hearing_l4.set_peaking(8000.0, rate, left_gains[3], 1.0);
        }
        if right_gains.len() >= 4 {
            self.hearing_r1.set_peaking(250.0, rate, right_gains[0], 1.0);
            self.hearing_r2.set_peaking(1000.0, rate, right_gains[1], 1.0);
            self.hearing_r3.set_peaking(4000.0, rate, right_gains[2], 1.0);
            self.hearing_r4.set_peaking(8000.0, rate, right_gains[3], 1.0);
        }
    }

    pub fn load_hrtf(&mut self, channel_idx: usize, ipsi: &[f32], contra: &[f32]) {
        if channel_idx < 9 {
            self.convolvers[channel_idx].update_taps(ipsi, contra, &self.fft_helper);
        }
    }

    pub fn process_spatializer(
        &mut self,
        in_l: &[f32],
        in_r: &[f32],
        out_l: &mut [f32],
        out_r: &mut [f32],
    ) {
        let size = 128;
        let rate = self.sample_rate;
        let lfo_val = self.surround_lfo.next();
        let drift_samples = lfo_val * 96.0 * self.drift_amount;

        let mut voice_sum = 0.0;
        let width_scale = self.surround_intensity;

        let delay_s_ls = (18.0 * (rate / 1000.0) + drift_samples).floor();
        let delay_s_rs = (22.0 * (rate / 1000.0) - drift_samples).floor();
        let delay_s_lb = (32.0 * (rate / 1000.0) + drift_samples * 0.5).floor();
        let delay_s_rb = (38.0 * (rate / 1000.0) - drift_samples * 0.5).floor();
        let delay_s_lh = (12.0 * (rate / 1000.0)).floor();

        for i in 0..size {
            let s_l = in_l[i];
            let s_r = in_r[i];

            // 1. Center extraction & Dialogue Peaking EQ
            let ch_c = self.dialogue_eq.process((s_l + s_r) * 0.707);
            self.upmix_c[i] = ch_c;
            voice_sum += ch_c.abs();

            // 2. LFE Subwoofer Channel
            self.upmix_lfe[i] = self.lfe_lpf.process((s_l + s_r) * 0.5);

            // 3. Side Surrounds (Haas delay lines)
            let diff_s = (s_l - s_r) * 0.707;
            self.surround_delay_l.write(diff_s);
            self.surround_delay_r.write(-diff_s);

            self.upmix_ls[i] = self.surround_delay_l.read(delay_s_ls) * width_scale;
            self.upmix_rs[i] = self.surround_delay_r.read(delay_s_rs) * width_scale;

            // 4. Rear Back Surrounds (Haas delay lines)
            self.back_delay_l.write(diff_s);
            self.back_delay_r.write(-diff_s);

            self.upmix_lb[i] = self.back_delay_l.read(delay_s_lb) * (width_scale * 0.8);
            self.upmix_rb[i] = self.back_delay_r.read(delay_s_rb) * (width_scale * 0.8);

            // 5. Heights Lh/Rh (Elevated 12ms delay + pinna elevation filter notch)
            self.height_delay_l.write(s_l - s_r * 0.65);
            self.height_delay_r.write(s_r - s_l * 0.65);

            let mut ch_lh = self.height_delay_l.read(delay_s_lh) * (width_scale * 0.75);
            let mut ch_rh = self.height_delay_r.read(delay_s_lh) * (width_scale * 0.75);

            ch_lh = self.height_notch_l.process(self.height_bandpass_l.process(ch_lh));
            ch_rh = self.height_notch_r.process(self.height_bandpass_r.process(ch_rh));

            self.upmix_lh[i] = ch_lh;
            self.upmix_rh[i] = ch_rh;
        }

        // Dialogue Ducker logic
        let average_voice = voice_sum / size as f32;
        self.voice_envelope = self.voice_envelope * 0.92 + average_voice * 0.08;
        let mut ducking_gain_db = 0.0;
        if self.voice_envelope > 0.035 {
            ducking_gain_db = -((self.voice_envelope - 0.035) * 18.0 * self.dialogue_enhance).min(3.2);
        }

        self.side_ducker_l.set_peaking(1500.0, rate, ducking_gain_db, 1.0);
        self.side_ducker_r.set_peaking(1500.0, rate, ducking_gain_db, 1.0);
        self.side_ducker_ls.set_peaking(1500.0, rate, ducking_gain_db, 1.0);
        self.side_ducker_rs.set_peaking(1500.0, rate, ducking_gain_db, 1.0);

        for i in 0..size {
            self.ducked_l[i] = self.side_ducker_l.process(in_l[i]);
            self.ducked_r[i] = self.side_ducker_r.process(in_r[i]);
            self.upmix_ls[i] = self.side_ducker_ls.process(self.upmix_ls[i]);
            self.upmix_rs[i] = self.side_ducker_rs.process(self.upmix_rs[i]);
        }

        // Reset accumulators
        self.accum_real_l.fill(0.0);
        self.accum_imag_l.fill(0.0);
        self.accum_real_r.fill(0.0);
        self.accum_imag_r.fill(0.0);

        // Process block convolvers
        // 9 channels: L, R, C, Ls, Rs, Lb, Rb, Lh, Rh
        self.convolvers[0].process_block(&self.ducked_l, &mut self.accum_real_l, &mut self.accum_imag_l, &mut self.accum_real_r, &mut self.accum_imag_r, &self.fft_helper);
        self.convolvers[1].process_block(&self.ducked_r, &mut self.accum_real_r, &mut self.accum_imag_r, &mut self.accum_real_l, &mut self.accum_imag_l, &self.fft_helper);
        self.convolvers[2].process_block(&self.upmix_c, &mut self.accum_real_l, &mut self.accum_imag_l, &mut self.accum_real_r, &mut self.accum_imag_r, &self.fft_helper);
        self.convolvers[3].process_block(&self.upmix_ls, &mut self.accum_real_l, &mut self.accum_imag_l, &mut self.accum_real_r, &mut self.accum_imag_r, &self.fft_helper);
        self.convolvers[4].process_block(&self.upmix_rs, &mut self.accum_real_r, &mut self.accum_imag_r, &mut self.accum_real_l, &mut self.accum_imag_l, &self.fft_helper);
        self.convolvers[5].process_block(&self.upmix_lb, &mut self.accum_real_l, &mut self.accum_imag_l, &mut self.accum_real_r, &mut self.accum_imag_r, &self.fft_helper);
        self.convolvers[6].process_block(&self.upmix_rb, &mut self.accum_real_r, &mut self.accum_imag_r, &mut self.accum_real_l, &mut self.accum_imag_l, &self.fft_helper);
        self.convolvers[7].process_block(&self.upmix_lh, &mut self.accum_real_l, &mut self.accum_imag_l, &mut self.accum_real_r, &mut self.accum_imag_r, &self.fft_helper);
        self.convolvers[8].process_block(&self.upmix_rh, &mut self.accum_real_r, &mut self.accum_imag_r, &mut self.accum_real_l, &mut self.accum_imag_l, &self.fft_helper);

        // IFFT back to time domain
        self.fft_helper.ifft(&mut self.accum_real_l, &mut self.accum_imag_l);
        self.fft_helper.ifft(&mut self.accum_real_r, &mut self.accum_imag_r);

        // Set Limiter threshold
        if self.active_preset == "relaxed_night" {
            self.limiter.threshold = 0.65;
        } else {
            self.limiter.threshold = 0.98;
        }

        // Late stage processing loop
        let bass_scalar = self.bass_boost;
        let subharmonic_volume = 0.22 * bass_scalar;

        for i in 0..size {
            let mut bin_l = self.accum_real_l[i + 128];
            let mut bin_r = self.accum_real_r[i + 128];

            // Subwoofer (LFE)
            let lfe = self.upmix_lfe[i];
            bin_l += lfe * (0.707 * bass_scalar);
            bin_r += lfe * (0.707 * bass_scalar);

            // Subharmonic synth bass
            let sub_harm = self.sub_bass_synth.process((in_l[i] + in_r[i]) * 0.5);
            bin_l += sub_harm * subharmonic_volume;
            bin_r += sub_harm * subharmonic_volume;

            // Reverb FDN
            if self.room_reflections > 0.05 {
                let (rev_l, rev_r) = self.reverb.process(bin_l, bin_r, self.room_size, self.room_absorption);
                bin_l += rev_l;
                bin_r += rev_r;
            }

            // Sibilance De-esser
            bin_l = self.de_esser_l.process(bin_l, self.de_esser_intensity);
            bin_r = self.de_esser_r.process(bin_r, self.de_esser_intensity);

            // Headphone EQ profile — 4-stage biquad chain
            if self.headphone_profile != "none" {
                bin_l = self.hp_comp_l4.process(self.hp_comp_l3.process(self.hp_comp_l2.process(self.hp_comp_l1.process(bin_l))));
                bin_r = self.hp_comp_r4.process(self.hp_comp_r3.process(self.hp_comp_r2.process(self.hp_comp_r1.process(bin_r))));
            }

            // Dynamic tilt correction
            bin_l = self.tilt_l.process(bin_l);
            bin_r = self.tilt_r.process(bin_r);

            // Hearing profile compensation
            bin_l = self.hearing_l4.process(self.hearing_l3.process(self.hearing_l2.process(self.hearing_l1.process(bin_l))));
            bin_r = self.hearing_r4.process(self.hearing_r3.process(self.hearing_r2.process(self.hearing_r1.process(bin_r))));

            // Saturation / Harmonic warmth
            bin_l = bin_l / (1.0 + bin_l.abs() * 0.12 * self.spectral_warmth);
            bin_r = bin_r / (1.0 + bin_r.abs() * 0.12 * self.spectral_warmth);

            // Crosstalk cancellation
            if self.crosstalk {
                // Approximate crosstalk directly in spatialized out (CTC delay lines inlined / bypassed)
                let c_l = bin_r * 0.25;
                let c_r = bin_l * 0.25;
                bin_l -= c_l;
                bin_r -= c_r;
            }

            // Output Limiting
            let (lim_l, lim_r) = self.limiter.process(bin_l, bin_r);

            if self.active_preset == "relaxed_night" {
                out_l[i] = lim_l * 1.3;
                out_r[i] = lim_r * 1.3;
            } else {
                out_l[i] = (lim_l * self.volume).clamp(-1.0, 1.0);
                out_r[i] = (lim_r * self.volume).clamp(-1.0, 1.0);
            }
        }
    }
}
