use wasm_bindgen::prelude::*;
use std::f32::consts::PI;

// Biquad Filter in Rust
struct Biquad {
    b0: f32, b1: f32, b2: f32,
    a1: f32, a2: f32,
    x1: f32, x2: f32,
    y1: f32, y2: f32,
}

impl Biquad {
    fn new() -> Self {
        Self {
            b0: 1.0, b1: 0.0, b2: 0.0,
            a1: 0.0, a2: 0.0,
            x1: 0.0, x2: 0.0,
            y1: 0.0, y2: 0.0,
        }
    }

    fn set_lowpass(&mut self, cutoff: f32, sample_rate: f32, q: f32) {
        let w0 = 2.0 * PI * cutoff / sample_rate;
        let alpha = w0.sin() / (2.0 * q);
        let cosw0 = w0.cos();
        let a0 = 1.0 + alpha;
        
        self.b0 = (1.0 - cosw0) / 2.0 / a0;
        self.b1 = (1.0 - cosw0) / a0;
        self.b2 = (1.0 - cosw0) / 2.0 / a0;
        self.a1 = -2.0 * cosw0 / a0;
        self.a2 = (1.0 - alpha) / a0;
    }

    fn set_highpass(&mut self, cutoff: f32, sample_rate: f32, q: f32) {
        let w0 = 2.0 * PI * cutoff / sample_rate;
        let alpha = w0.sin() / (2.0 * q);
        let cosw0 = w0.cos();
        let a0 = 1.0 + alpha;
        
        self.b0 = (1.0 + cosw0) / 2.0 / a0;
        self.b1 = -(1.0 + cosw0) / a0;
        self.b2 = (1.0 + cosw0) / 2.0 / a0;
        self.a1 = -2.0 * cosw0 / a0;
        self.a2 = (1.0 - alpha) / a0;
    }

    fn set_peaking(&mut self, frequency: f32, sample_rate: f32, gain_db: f32, q: f32) {
        let w0 = 2.0 * PI * frequency / sample_rate;
        let alpha = w0.sin() / (2.0 * q);
        let cosw0 = w0.cos();
        let amp = 10.0f32.powf(gain_db / 40.0);
        let a0 = 1.0 + alpha / amp;
        
        self.b0 = (1.0 + alpha * amp) / a0;
        self.b1 = -2.0 * cosw0 / a0;
        self.b2 = (1.0 - alpha * amp) / a0;
        self.a1 = -2.0 * cosw0 / a0;
        self.a2 = (1.0 - alpha / amp) / a0;
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

// 32-tap FIR Filter for HRTF Convolution
struct FIRFilter {
    taps: [f32; 32],
    history: [f32; 32],
    history_ptr: usize,
}

impl FIRFilter {
    fn new() -> Self {
        Self {
            taps: [0.0; 32],
            history: [0.0; 32],
            history_ptr: 0,
        }
    }

    fn update_taps(&mut self, new_taps: &[f32]) {
        for i in 0..32 {
          if i < new_taps.len() {
            self.taps[i] = new_taps[i];
          } else {
            self.taps[i] = 0.0;
          }
        }
    }

    #[inline(always)]
    fn process(&mut self, x: f32) -> f32 {
        self.history[self.history_ptr] = x;
        let mut out = 0.0;
        let mut h_ptr = self.history_ptr;
        
        for i in 0..32 {
            out += self.taps[i] * self.history[h_ptr];
            if h_ptr == 0 {
                h_ptr = 31;
            } else {
                h_ptr -= 1;
            }
        }
        
        self.history_ptr = (self.history_ptr + 1) % 32;
        out
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

// Reverb FDN (Feedback Delay Network)
struct Reverb {
    delays: [Delay; 4],
    filters: [Biquad; 4],
    feedback: f32,
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
            Biquad::new(),
            Biquad::new(),
            Biquad::new(),
            Biquad::new()
        ];

        for i in 0..4 {
            filters[i].set_lowpass(3500.0, sample_rate, 0.5);
        }

        Self {
            delays,
            filters,
            feedback: 0.5,
        }
    }

    #[inline(always)]
    fn process(&mut self, l: f32, r: f32, room_size: f32) -> (f32, f32) {
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

        let g = 0.55 * room_size;
        let o0 = g * (f0 + f1 + f2 + f3);
        let o1 = g * (f0 - f1 + f2 - f3);
        let o2 = g * (f0 + f1 - f2 - f3);
        let o3 = g * (f0 - f1 - f2 + f3);

        let input = (l + r) * 0.5;
        self.delays[0].write(input + o0);
        self.delays[1].write(input + o1);
        self.delays[2].write(input + o2);
        self.delays[3].write(input + o3);

        ((s0 + s2) * 0.4, (s1 + s3) * 0.4)
    }
}

// Spatializer Export Struct
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

    lfe_lpf: Biquad,
    bass_lpf: Biquad,
    bass_hpf: Biquad,
    dialogue_eq: Biquad,
    limiter: Limiter,
    reverb: Reverb,

    surround_delay_l: Delay,
    surround_delay_r: Delay,
    back_delay_l: Delay,
    back_delay_r: Delay,

    itd_delays: Vec<Delay>, // Keyed L, R, C, Ls, Rs, Lb, Rb
    crosstalk_delay_l: Delay,
    crosstalk_delay_r: Delay,

    fir_ipsi: Vec<FIRFilter>,
    fir_contra: Vec<FIRFilter>,
}

#[wasm_bindgen]
impl Spatializer {
    #[wasm_bindgen(constructor)]
    pub fn new(sample_rate: f32) -> Self {
        let mut lfe_lpf = Biquad::new();
        lfe_lpf.set_lowpass(120.0, sample_rate, 0.707);

        let mut bass_lpf = Biquad::new();
        bass_lpf.set_lowpass(90.0, sample_rate, 0.707);

        let mut bass_hpf = Biquad::new();
        bass_hpf.set_highpass(100.0, sample_rate, 0.707);

        let mut dialogue_eq = Biquad::new();
        dialogue_eq.set_peaking(1500.0, sample_rate, 4.0, 1.2);

        let limiter = Limiter::new(sample_rate);
        let reverb = Reverb::new(sample_rate);

        let delay_s_ls = (18.0 * (sample_rate / 1000.0)).floor() as usize;
        let delay_s_rs = (22.0 * (sample_rate / 1000.0)).floor() as usize;
        let delay_s_lb = (32.0 * (sample_rate / 1000.0)).floor() as usize;
        let delay_s_rb = (38.0 * (sample_rate / 1000.0)).floor() as usize;

        let surround_delay_l = Delay::new(delay_s_ls + 128);
        let surround_delay_r = Delay::new(delay_s_rs + 128);
        let back_delay_l = Delay::new(delay_s_lb + 128);
        let back_delay_r = Delay::new(delay_s_rb + 128);

        let mut itd_delays = Vec::new();
        let mut fir_ipsi = Vec::new();
        let mut fir_contra = Vec::new();

        // 7 channels: L, R, C, Ls, Rs, Lb, Rb
        for _ in 0..7 {
            itd_delays.push(Delay::new(128));
            fir_ipsi.push(FIRFilter::new());
            fir_contra.push(FIRFilter::new());
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

            lfe_lpf,
            bass_lpf,
            bass_hpf,
            dialogue_eq,
            limiter,
            reverb,

            surround_delay_l,
            surround_delay_r,
            back_delay_l,
            back_delay_r,

            itd_delays,
            crosstalk_delay_l: Delay::new(128),
            crosstalk_delay_r: Delay::new(128),

            fir_ipsi,
            fir_contra,
        }
    }

    pub fn set_settings(&mut self, volume: f32, surround_intensity: f32, bass_boost: f32, dialogue_enhance: f32, room_reflections: f32, crosstalk: bool, dynamic_eq: bool) {
        self.volume = volume;
        self.surround_intensity = surround_intensity;
        self.bass_boost = bass_boost;
        self.dialogue_enhance = dialogue_enhance;
        self.room_reflections = room_reflections;
        self.crosstalk = crosstalk;
        self.dynamic_eq = dynamic_eq;

        let dialogue_boost_db = 1.0 + dialogue_enhance * 7.0;
        self.dialogue_eq.set_peaking(1500.0, self.sample_rate, dialogue_boost_db, 1.2);
    }

    pub fn load_hrtf(&mut self, channel_idx: usize, ipsi: &[f32], contra: &[f32]) {
        if channel_idx < 7 {
            self.fir_ipsi[channel_idx].update_taps(ipsi);
            self.fir_contra[channel_idx].update_taps(contra);
        }
    }

    // Process a block of 128 samples
    pub fn process_spatializer(&mut self, in_l: &[f32], in_r: &[f32], out_l: &mut [f32], out_r: &mut [f32]) {
        let size = in_l.len();
        
        let delay_s_ls = (18.0 * (self.sample_rate / 1000.0)).floor();
        let delay_s_rs = (22.0 * (self.sample_rate / 1000.0)).floor();
        let delay_s_lb = (32.0 * (self.sample_rate / 1000.0)).floor();
        let delay_s_rb = (38.0 * (self.sample_rate / 1000.0)).floor();

        for i in 0..size {
            let s_l = in_l[i];
            let s_r = in_r[i];

            // 1. Upmixer
            let ch_l = s_l;
            let ch_r = s_r;
            
            let mut ch_c = (s_l + s_r) * 0.707;
            ch_c = self.dialogue_eq.process(ch_c);

            let ch_lfe = self.lfe_lpf.process((s_l + s_r) * 0.5);

            let diff_s = (s_l - s_r) * 0.707;
            
            self.surround_delay_l.write(diff_s);
            self.surround_delay_r.write(-diff_s);
            self.back_delay_l.write(diff_s);
            self.back_delay_r.write(-diff_s);

            let ch_ls = self.surround_delay_l.read(delay_s_ls) * self.surround_intensity;
            let ch_rs = self.surround_delay_r.read(delay_s_rs) * self.surround_intensity;
            let ch_lb = self.back_delay_l.read(delay_s_lb) * (self.surround_intensity * 0.85);
            let ch_rb = self.back_delay_r.read(delay_s_rb) * (self.surround_intensity * 0.85);

            // 2. HRTF Spatializer Accumulators
            let mut bin_l = 0.0;
            let mut bin_r = 0.0;

            // Center Channel (idx 2)
            bin_l += self.fir_ipsi[2].process(ch_c);
            bin_r += self.fir_contra[2].process(ch_c);

            // Front Left Channel (idx 0)
            self.itd_delays[0].write(ch_l);
            let itd_r_l = self.itd_delays[0].read(11.0);
            bin_l += self.fir_ipsi[0].process(ch_l);
            bin_r += self.fir_contra[0].process(itd_r_l) * 0.85;

            // Front Right Channel (idx 1)
            self.itd_delays[1].write(ch_r);
            let itd_l_r = self.itd_delays[1].read(11.0);
            bin_l += self.fir_contra[1].process(itd_l_r) * 0.85;
            bin_r += self.fir_ipsi[1].process(ch_r);

            // Surround Left Channel (idx 3)
            self.itd_delays[3].write(ch_ls);
            let itd_r_ls = self.itd_delays[3].read(28.0);
            bin_l += self.fir_ipsi[3].process(ch_ls);
            bin_r += self.fir_contra[3].process(itd_r_ls) * 0.55;

            // Surround Right Channel (idx 4)
            self.itd_delays[4].write(ch_rs);
            let itd_l_rs = self.itd_delays[4].read(28.0);
            bin_l += self.fir_contra[4].process(itd_l_rs) * 0.55;
            bin_r += self.fir_ipsi[4].process(ch_rs);

            // Back Left Channel (idx 5)
            self.itd_delays[5].write(ch_lb);
            let itd_r_lb = self.itd_delays[5].read(30.0);
            bin_l += self.fir_ipsi[5].process(ch_lb);
            bin_r += self.fir_contra[5].process(itd_r_lb) * 0.48;

            // Back Right Channel (idx 6)
            self.itd_delays[6].write(ch_rb);
            let itd_l_rb = self.itd_delays[6].read(30.0);
            bin_l += self.fir_contra[6].process(itd_l_rb) * 0.48;
            bin_r += self.fir_ipsi[6].process(ch_rb);

            // LFE & Psychoacoustic sub-harmonics
            bin_l += ch_lfe * 0.707;
            bin_r += ch_lfe * 0.707;

            if self.bass_boost > 0.0 {
                let mono = (s_l + s_r) * 0.5;
                let sub = self.bass_lpf.process(mono);
                let saturated = (sub * 1.5).tanh();
                let harmonics = self.bass_hpf.process(saturated) * self.bass_boost * 0.8;
                bin_l += harmonics * 0.707;
                bin_r += harmonics * 0.707;
            }

            // 3. Room Reflections
            let (rev_l, rev_r) = self.reverb.process(bin_l, bin_r, self.room_reflections);
            bin_l += rev_l;
            bin_r += rev_r;

            // 4. Crosstalk
            if self.crosstalk {
                self.crosstalk_delay_l.write(bin_l);
                self.crosstalk_delay_r.write(bin_r);
                let cancel_l = self.crosstalk_delay_r.read(7.0) * 0.25;
                let cancel_r = self.crosstalk_delay_l.read(7.0) * 0.25;
                bin_l -= cancel_l;
                bin_r -= cancel_r;
            }

            // 5. Volume & Limiter
            bin_l *= self.volume;
            bin_r *= self.volume;

            let (lim_l, lim_r) = self.limiter.process(bin_l, bin_r);
            out_l[i] = lim_l;
            out_r[i] = lim_r;
        }
    }
}
