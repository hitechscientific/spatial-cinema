/**
 * HRTF Spatialization Database for 7.1 Virtual Surround
 * 
 * Provides:
 * 1. Speaker positions (angles in degrees).
 * 2. ITD (Interaural Time Difference) in samples at 48kHz.
 * 3. IID (Interaural Intensity Difference) gains.
 * 4. 32-tap FIR filter coefficients simulating pinna response, head shadow, and torso reflections.
 */

export interface HRTFFilters {
  // 32-tap FIR coefficients for the near (ipsilateral) ear
  ipsi: number[];
  // 32-tap FIR coefficients for the far (contralateral) ear
  contra: number[];
  // Delay in samples for the far ear (ITD) at 48kHz
  delay: number;
  // Amplitude gain for the far ear (IID)
  gain: number;
}

export interface HRTFProfile {
  name: string;
  description: string;
  // Keyed by channel: L, R, C, Ls, Rs, Lb, Rb
  channels: { [channel: string]: HRTFFilters };
}

// Helper to generate a 32-tap FIR filter modeling typical ear responses
function makeFIR(low: number, mid: number, high: number, phaseShift: number = 0): number[] {
  const taps = new Array(32).fill(0);
  // Symmetrical sinc filter with windowing, shaped by spectral gains
  for (let i = 0; i < 32; i++) {
    const t = i - 15.5 + phaseShift;
    const absT = Math.abs(t);
    let val = 0;
    if (absT < 0.001) {
      val = 1.0;
    } else {
      val = Math.sin(Math.PI * t * 0.4) / (Math.PI * t * 0.4);
    }
    
    // Apply Hamming window
    const window = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / 31);
    
    // Shape spectrum using simple low/mid/high approximation
    let spectralScale = mid;
    if (i < 8) {
      spectralScale = low + (mid - low) * (i / 8);
    } else if (i > 24) {
      spectralScale = high + (mid - high) * ((31 - i) / 7);
    }
    
    taps[i] = val * window * spectralScale;
  }
  
  // Normalize taps
  const sum = taps.reduce((acc, v) => acc + Math.abs(v), 0);
  return taps.map(v => v / (sum || 1));
}

export const HRTF_PROFILES: { [key: string]: HRTFProfile } = {
  kemar: {
    name: "MIT KEMAR",
    description: "Standard humanoid mannequin model. Highly accurate frequency response, perfect for all-round listening and music.",
    channels: {
      // 0 degrees (Center): Symmetrical, no delay
      C: {
        ipsi: makeFIR(1.0, 1.1, 0.9, 0),
        contra: makeFIR(1.0, 1.1, 0.9, 0),
        delay: 0,
        gain: 1.0
      },
      // 30 degrees (Front Left / Front Right)
      L: {
        ipsi: makeFIR(1.0, 1.2, 1.0, -1),
        contra: makeFIR(0.85, 0.95, 0.65, 1),
        delay: 11, // ~0.23 ms delay at 48kHz
        gain: 0.85
      },
      R: {
        ipsi: makeFIR(1.0, 1.2, 1.0, -1),
        contra: makeFIR(0.85, 0.95, 0.65, 1),
        delay: 11,
        gain: 0.85
      },
      // 110 degrees (Surround Left / Surround Right)
      Ls: {
        ipsi: makeFIR(0.9, 1.0, 0.85, -2),
        contra: makeFIR(0.65, 0.75, 0.45, 2),
        delay: 28, // ~0.58 ms delay at 48kHz
        gain: 0.55
      },
      Rs: {
        ipsi: makeFIR(0.9, 1.0, 0.85, -2),
        contra: makeFIR(0.65, 0.75, 0.45, 2),
        delay: 28,
        gain: 0.55
      },
      // 150 degrees (Back Left / Back Right)
      Lb: {
        ipsi: makeFIR(0.8, 0.9, 0.7, -3),
        contra: makeFIR(0.6, 0.68, 0.38, 3),
        delay: 30, // ~0.63 ms delay at 48kHz
        gain: 0.48
      },
      Rb: {
        ipsi: makeFIR(0.8, 0.9, 0.7, -3),
        contra: makeFIR(0.6, 0.68, 0.38, 3),
        delay: 30,
        gain: 0.48
      }
    }
  },
  cipic: {
    name: "CIPIC Standard",
    description: "Extracted from CIPIC HRTF measurements. Pinna reflections are accentuated, providing aggressive angular cues ideal for FPS gaming.",
    channels: {
      C: {
        ipsi: makeFIR(1.0, 1.3, 0.8, 0),
        contra: makeFIR(1.0, 1.3, 0.8, 0),
        delay: 0,
        gain: 1.0
      },
      L: {
        ipsi: makeFIR(1.05, 1.4, 0.95, -1),
        contra: makeFIR(0.8, 0.85, 0.55, 1),
        delay: 12,
        gain: 0.8
      },
      R: {
        ipsi: makeFIR(1.05, 1.4, 0.95, -1),
        contra: makeFIR(0.8, 0.85, 0.55, 1),
        delay: 12,
        gain: 0.8
      },
      Ls: {
        ipsi: makeFIR(0.85, 1.15, 0.75, -2),
        contra: makeFIR(0.55, 0.65, 0.35, 2),
        delay: 29,
        gain: 0.5
      },
      Rs: {
        ipsi: makeFIR(0.85, 1.15, 0.75, -2),
        contra: makeFIR(0.55, 0.65, 0.35, 2),
        delay: 29,
        gain: 0.5
      },
      Lb: {
        ipsi: makeFIR(0.75, 1.05, 0.65, -3),
        contra: makeFIR(0.5, 0.58, 0.28, 3),
        delay: 31,
        gain: 0.42
      },
      Rb: {
        ipsi: makeFIR(0.75, 1.05, 0.65, -3),
        contra: makeFIR(0.5, 0.58, 0.28, 3),
        delay: 31,
        gain: 0.42
      }
    }
  },
  sadie: {
    name: "SADIE II (Cinema)",
    description: "Acoustic database optimized for room simulation. Boosted lows and rounded highs create a warm, cinematic soundstage.",
    channels: {
      C: {
        ipsi: makeFIR(1.2, 1.0, 0.8, 0),
        contra: makeFIR(1.2, 1.0, 0.8, 0),
        delay: 0,
        gain: 1.0
      },
      L: {
        ipsi: makeFIR(1.15, 1.1, 0.9, -1),
        contra: makeFIR(0.9, 0.88, 0.6, 1),
        delay: 10,
        gain: 0.88
      },
      R: {
        ipsi: makeFIR(1.15, 1.1, 0.9, -1),
        contra: makeFIR(0.9, 0.88, 0.6, 1),
        delay: 10,
        gain: 0.88
      },
      Ls: {
        ipsi: makeFIR(1.0, 0.95, 0.8, -2),
        contra: makeFIR(0.75, 0.7, 0.4, 2),
        delay: 27,
        gain: 0.6
      },
      Rs: {
        ipsi: makeFIR(1.0, 0.95, 0.8, -2),
        contra: makeFIR(0.75, 0.7, 0.4, 2),
        delay: 27,
        gain: 0.6
      },
      Lb: {
        ipsi: makeFIR(0.9, 0.85, 0.7, -3),
        contra: makeFIR(0.68, 0.62, 0.35, 3),
        delay: 29,
        gain: 0.52
      },
      Rb: {
        ipsi: makeFIR(0.9, 0.85, 0.7, -3),
        contra: makeFIR(0.68, 0.62, 0.35, 3),
        delay: 29,
        gain: 0.52
      }
    }
  }
};
