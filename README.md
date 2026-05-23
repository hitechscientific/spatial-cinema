# 🎬 Browser-Native Cinematic Headphone Virtualization (Home Theatre Mode)

A production-grade, low-latency browser extension that makes standard headphones feel like a premium cinema. Rather than an abstract "audio booster", it implements a true "Home Theatre Mode" that virtualizes discrete speaker fields, manages dynamic range, and calibrates room acoustics directly in your browser. Built using Manifest V3, Web Audio API, AudioWorklets, Rust compiled to WebAssembly (with SIMD acceleration), Three.js (WebGL), and Chrome's Offscreen Documents.

---

## 🚀 Key Features

* **Universal Browser Tab Capture**: Capture high-fidelity audio generically from YouTube, Netflix, Disney+, Spotify, Twitch, browser games, and HTML5 players.
* **7.1 Channel Upmixer**: Intelligently extracts surround sound spatial channels (Front Left/Right/Center, Surround L/R, Back L/R, Heights L/R, and LFE Subwoofer) in real-time from standard stereo sources.
* **Binaural HRTF Convolution Engine**: Implements ITD (Interaural Time Difference), IID (Interaural Intensity Difference), and 32-tap FIR pinna reflection filters using standardized profiles (MIT KEMAR, CIPIC, and SADIE II).
* **Headphone Acoustic Compensation (v3)**: Features 4-stage cascaded biquad DSP curves modeled specifically to flatten the frequency responses of Open-back, Closed-back, Gaming headsets, and IEM/Earbud drivers.
* **Psychoacoustic Sub-Bass Synthesizer**: Detects zero-crossings to mathematically synthesize higher harmonics of deep sub-bass frequencies, allowing standard headphone diaphragms to emulate physical theater subwoofer rumble.
* **Advanced DSP Enhancers**: Real-time sibilance De-esser, adjustable spectral tilt warmth, and a micro-room Haas delay drift LFO to reduce listening fatigue and provide natural spatialization.
* **Dual-Engine Architecture**: Seamless fallback and synchronization between a lock-free TypeScript AudioWorklet and a SIMD-accelerated Rust WebAssembly engine.
* **3D Soundfield HUD**: Renders a dynamic virtual speaker layout using Three.js WebGL showing real-time spatial wave propagation in the dashboard.
* **Personalized Hearing Calibration Wizard**: Sweeps frequencies (250Hz, 1kHz, 4kHz, and 8kHz) per ear to measure individual hearing thresholds and maps the differences to parametric correction curves.
* **Custom Space Modeling (IR Upload)**: Allows uploading personalized `.wav` binaural room impulse responses (BRIRs) which are decoded, cropped, and loaded directly into the convolver.
* **Diagnostics & Benchmarks**: Features real-time FFT spectrum graphs, discrete channel VU meters, and an Offline rendering benchmark runner that measures processing latency and simulated CPU overhead.

---

## ⚖️ Technology Comparison: Spatial Cinema vs. Alternatives

| Feature | Spatial Cinema (This Project) | OS-Level Virtual Surround (e.g. Windows Sonic) | Premium Spatial Audio (e.g. Dolby Atmos for Headphones) | Standard Stereo |
| :--- | :--- | :--- | :--- | :--- |
| **Execution Environment** | **Browser-native** (Web Audio, WASM SIMD) | OS-level kernel | OS-level / Paid software | Everywhere |
| **Platform Compatibility** | **Cross-Platform** (Windows, Mac, Linux, ChromeOS) | Windows / Xbox only | Windows / Xbox / Apple ecosystem | Universal |
| **DSP Latency** | **Ultra-low (2.67ms)** via AudioWorklet | Low | Low | Zero |
| **Headphone Compensation** | **Yes** (4-stage cascaded custom biquads) | No (flat output) | Yes (hardware-dependent) | No |
| **Custom Impulse Responses** | **Yes** (Load custom `.wav` HRTFs) | No | No (proprietary only) | N/A |
| **Upmixing Algorithm** | **7.1 channel extraction** from stereo sources | 5.1/7.1 to stereo (requires surround source) | Object-based & channel upmixing | None |
| **Installation** | **Zero-install** browser extension | Built-in (OS) | Paid add-on or bundled | Built-in |
| **Customizability** | **High** (Deep room size, warmth, drift parameters) | Low (On/Off) | Medium (EQ presets) | Low |

---

## 🧠 Deep-Dive Architecture & DSP Operations

### 1. Dual-Engine DSP Execution Pipeline
To satisfy strict extension security and performance constraints, the system implements a synchronized dual-engine pipeline:
* **Primary Engine**: WebAssembly compiled from Rust source code. Heavy vector calculations for FIR filter convolution are accelerated via **128-bit SIMD** operations.
* **Fallback Engine**: Optimized TypeScript equivalent. If WebAssembly fails to compile or load due to browser security restrictions, the extension gracefully falls back to a Javascript-native pipeline within the `AudioWorkletGlobalScope` to ensure uninterrupted audio.

### 2. Uniformly Partitioned Overlap-Save Convolution
Convolution with high-tap impulse responses is computationally expensive in the time domain ($O(N^2)$ complexity). Rather than naive convolution, this project implements a **Uniformly Partitioned Overlap-Save Convolver** using a custom Radix-2 Complex 256-point FFT engine:
* Large impulse response filters are segmented into equal block partitions ($L = 128$).
* Real-time inputs are transformed into the frequency domain.
* Vector multiplications are computed in the frequency domain ($O(N \log N)$ complexity) using Rust SIMD loops, and then transformed back via IFFT.
* Coefficients are crossfaded dynamically (interpolated by a factor of `0.15` per frame) to prevent clicking or popping artifacts during runtime preset changes.

### 3. AI Audio Scene Analyzer
The spatializer includes a real-time signal classification system [AISpatialAnalyzer](file:///c:/Users/hitec/own/web_audio_api/spatial%20cinema/src/worklet/surround-processor.ts#L533-L619) that calculates:
$$\text{RMS} = \sqrt{\frac{1}{N}\sum_{i=1}^{N} x_i^2}$$
$$\text{Correlation} = \frac{\sum (L_i \cdot R_i)}{\sqrt{\sum L_i^2} \cdot \sqrt{\sum R_i^2}}$$
$$\text{Crest Factor} = \frac{\text{Peak Amplitude}}{\text{RMS}}$$
$$\text{ZCR Rate} = \frac{\text{Zero Crossings}}{\text{Frame Length}}$$

Based on these heuristics, the audio is classified:
* **Dialogue**: High correlation, ZCR proxy in speech ranges (800Hz - 3.5kHz) $\rightarrow$ automatically boosts center channels (+5.0dB) and narrows side image for speech clarity.
* **Action**: High crest factor and high RMS $\rightarrow$ boosts bass boost factor (1.45x) and slightly dips dialogue EQ to protect hearing.
* **Music**: Low correlation $\rightarrow$ widens spatial stereo image (1.3x width).
* **Ambient**: Low RMS $\rightarrow$ expands room size (1.35x width) and cuts sub-bass response.

### 4. 4-Stage Parametric Headphone Compensation Curves
Driver enclosures and diaphragms alter the frequency response of incoming sound. To achieve flat spatialization, the project introduces parametric correction targets:
* **Open-Back Boost**: Harman Target 2018 curve compensation. Low-shelf boost below 60Hz (+3dB) and peaking cut at 3.5kHz (-1dB) to tame pinna reflection glare.
* **Closed-Back Scoop**: Diffuse Field curve. Peaking dip at 200Hz (-3dB) to reduce box cup resonances and a high-shelf boost at 10kHz (+2.5dB) to restore air.
* **Gaming Headset EQ**: Corrects standard V-shaped responses. Dips bloated bass at 120Hz (-4dB), boosts critical midrange frequencies at 1kHz (+2dB) and 2.5kHz (+2.5dB), and notches bright presence peaks at 7kHz (-2dB).
* **In-Ear Monitor Tame**: Harman IEM 2019 target. Dips bass seal resonance at 80Hz (-2.5dB), lifts mids at 800Hz (+1dB), and notches high-frequency sibilance at 8kHz (-3dB).

### 5. Hearing Calibration & Parametric Compensation
The [Hearing Calibration Wizard](file:///c:/Users/hitec/own/web_audio_api/spatial%20cinema/src/dashboard/App.tsx#L797-L907) sweeps test tones across 250Hz, 1kHz, 4kHz, and 8kHz separately for the left and right ears. When the user sets the threshold volume (where they can barely hear the tone), the engine maps the deviation relative to a reference threshold, computing a compensation profile:
$$\text{Gain Db} = \max(0, (\text{Threshold} - 20) \times 0.22)$$
This maps compensation gains (up to +17.6dB) into dedicated biquad peaking filters in the AudioWorklet to restore balanced binaural spatial perception.

---

## 📁 Project Folder Structure

The project's workspace files and folders are organized as follows:

```
spatial cinema/
├── Cargo.toml                          # Workspaces Rust configuration
├── build.bat                           # Windows compiler helper shell
├── manifest.json                       # Extension Manifest V3 metadata
├── package.json                        # NPM React/TypeScript dependencies
├── postcss.config.js                   # Styles postprocessor setup
├── tailwind.config.js                  # Tailwind CSS theme configurations
├── tsconfig.json                       # TypeScript compiler guidelines
├── vite.config.ts                      # Multi-entry build and asset packaging
├── icons/                              # Stored extension PNG graphics
├── public/                             # Public static assets
│   └── wasm/
│       └── surround_dsp.wasm           # Compiled WebAssembly binary
├── scripts/
│   └── generate-icons.js               # Utility script generating extension icons
└── src/
    ├── background/
    │   └── serviceWorker.ts            # Extension service worker (capture coordination)
    ├── dashboard/
    │   ├── index.html                  # HTML entry point for the 3D Dashboard
    │   ├── main.tsx                    # React mounting script
    │   ├── App.tsx                     # 3D Dashboard container and Wizard states
    │   └── components/
    │       └── DashboardSpeakerVisualizer.tsx # Three.js WebGL 3D speaker field render
    ├── dsp/
    │   ├── Cargo.toml                  # Rust wasm-pack configuration
    │   └── src/
    │       └── lib.rs                  # Core Rust DSP SIMD convolution source code
    ├── offscreen/
    │   ├── offscreen.html              # Context host for chrome.tabCapture streams
    │   └── offscreen.ts                # AudioContext setup and custom IR decoder
    ├── popup/
    │   ├── index.html                  # HTML entry point for browser popup
    │   ├── main.tsx                    # React popup mounting script
    │   ├── App.tsx                     # Popup controller interface
    │   ├── index.css                   # Global styles and tailwind components
    │   └── components/
    │       ├── AudioVisualizer.tsx     # Canvas-based spectrum and VU metrics
    │       └── SpeakerVisualizer.tsx   # Canvas speaker angle HUD
    └── utils/
        ├── hrtf-data.ts                # HRTF impulse responses databases
        ├── offline-tester.ts           # OfflineAudioContext benchmark suite
        └── store.ts                    # Zustand Chrome storage synchronization store
```

---

## 📦 Getting Started & Compiling

### Prerequisites
* **Node.js** (v18 or higher) & **NPM**
* **Rust toolchain** (optional, to modify or compile the WebAssembly DSP engine)
* **wasm-pack** (optional, run `cargo install wasm-pack` to compile Rust to WASM)

### Step 1: Install Dependencies
Open a command prompt in the workspace directory and install packages:
```bash
npm install
```

### Step 2: Generate Asset Icons
Run the icon generator script to copy pre-packaged graphical assets to the extension folders:
```bash
node scripts/generate-icons.js
```

### Step 3: Compile the Rust WebAssembly Crate (Optional)
If you make changes to the Rust engine in [lib.rs](file:///c:/Users/hitec/own/web_audio_api/spatial%20cinema/src/dsp/src/lib.rs):
```bash
# Navigate to the dsp crate directory
cd src/dsp

# Compile to WASM targeting web imports
wasm-pack build --target web

# Copy/rename the generated binary to the public assets directory
mkdir -p ../../public/wasm
cp pkg/surround_dsp_bg.wasm ../../public/wasm/surround_dsp.wasm
```
*Note: If the WASM file is missing or blocked by browser CSP policies, the extension automatically falls back to the TypeScript execution code.*

### Step 4: Build the Extension
Compile TypeScript files, process CSS, and build all extension entry points with Vite:
```bash
npm run build
```
This output is written to the `/dist` directory.

---

## 🔌 Installing in Browsers

1. Open your browser and navigate to the Extensions management page:
   * **Chrome**: `chrome://extensions`
   * **Edge**: `edge://extensions`
   * **Brave**: `brave://extensions`
2. Enable the **Developer Mode** toggle switch (usually found in the top-right corner).
3. Click the **Load unpacked** button.
4. Select the `dist` folder generated inside this project directory.
5. The extension is now loaded and visible in your browser's toolbar!

---

## 🎮 Extended Usage Guide

1. Open a media source tab (e.g., YouTube playing a Dolby Atmos test video or movie trailer).
2. Click the extension icon in your toolbar to open the **Aether Spatial** Popup.
3. Click the **Bypass / Active** toggle to start capturing.
   * *Security Note: Chrome will display a screen-sharing indicator at the bottom of the screen. This is standard behavior for the `chrome.tabCapture` API to routing tab audio to the offscreen page.*
4. Select an acoustic preset from the list to suit your content:
   * **Dolby Cinema Reference**: Balanced curve optimized for movies, featuring center dialogue stabilization, controlled theatrical subwoofer bass, and immersive room surrounds.
   * **IMAX Theater Mode**: Simulated huge cinema hall width, powerful subharmonic LFE rumble, and deep reflections for an expansive sense of scale.
   * **Small Room Theater**: Tighter, shorter reflections and closer center-speaker localization, suited for standard domestic home theatre setups.
   * **Night Cinema Mode**: Restricts transient peak amplitudes (dynamic range control) while taming sub-bass rumble to maintain vocal audibility without waking the house.
   * **Cinematic Dialogue Boost**: Focuses on vocal midrange frequency clarity and side-channel ducker attenuation to resolve quiet dialogue issues.
   * **Competitive FPS**: Optimizes spatial directionality and high-frequency positioning for game audio.
5. Click **Launch 3D Control Center** to open the advanced Dashboard tab.
6. Under **Room Tuning**, configure Virtual Room Dimensions, Wall Absorption, sibilance damping, and Haas Delay Drift to personalize the room model.

### Uploading Custom Impulse Responses
If you have custom Binaural Room Impulse Responses (BRIR) or personalized HRTFs:
1. Open the **Aether Spatial Control Center** dashboard.
2. Under **Custom Space Modeling**, click the upload area and select a `.wav` file.
3. The offscreen script decodes the file, extracts the left/right impulse channels, crops them to the convolver's 256-sample window, and pushes the coefficients to the processor.

---

## 🧪 Testing & Diagnostics

Verify DSP engine accuracy, latency constraints, and performance inside the dashboard:
1. Launch the **3D Control Center** dashboard.
2. Click the **DSP Benchmark** button in the bottom-right corner.
3. This spins up an [offline-tester.ts](file:///c:/Users/hitec/own/web_audio_api/spatial%20cinema/src/utils/offline-tester.ts) runner using an `OfflineAudioContext`:
   * Renders a 1.0-second synthetic white noise buffer with hot transient bursts.
   * Checks processing time: A healthy pipeline processes the buffer in under `5ms` (representing `<0.5%` simulated CPU load).
   * Verifies that the peak limiter was activated during hot transient bursts, keeping the peak output under `1.0` and preventing clipping distortion.
   * Confirms API compatibility for AudioWorklets, WebAssembly, tab capture, and offscreen documents.

---

## 🔮 Future Architectural Evolution Roadmap

To transition the Aether Spatial Engine into a pro-audio grade framework, the following structural enhancements are planned:

1. **Dynamic Modular DSP Graph Engine**: Evolve from a static linear pipeline into a patchable, modular dependency graph. Each DSP module (Biquad, Convolver, Sub-Bass, Limiter) will be hot-swappable, independently bypassable, and profiled at the node level to monitor microsecond CPU cost.
2. **Multi-Resolution Partitioned Convolution**: Optimize the convolution reverb by partitioning impulse responses into multiple sizes (e.g., small 64-sample partitions for zero-latency early reflections, and larger 1024-sample partitions for the FDN reverb tail), lowering overhead without degrading acoustic reflections.
3. **Continuous Angular HRTF Interpolation**: Move away from discrete profiles towards continuous 3D coordinate-based HRTF coefficient interpolation. This will allow virtual sound sources to move smoothly around the listener's head without boundary crossfade artifacts.
4. **Webcam & WebXR Head Tracking**: Integrate face mesh models and WebXR gyroscopic tracking to rotate the virtual HRTF soundfield dynamically relative to the listener's head position, providing a vastly more convincing holographic room simulation.
5. **SharedArrayBuffer Ring Buffers**: Utilize `SharedArrayBuffer` memory pools and lock-free atomic ring buffers to stream telemetry between the audio thread, background worker, and Three.js visualizer. This removes main thread message serialization overhead entirely.
6. **Cross-Platform C++ and DAW Export**: Refactor the core Rust crate into a standalone library targeting native VST/AU DAW plugins, mobile apps, and browser extensions from a single codebase.

