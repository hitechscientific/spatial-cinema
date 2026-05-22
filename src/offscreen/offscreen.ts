// offscreen.ts
// Handles tab capture streams, AudioContext, and AudioWorklet rendering in the background.

import { HRTF_PROFILES } from '../utils/hrtf-data';

let audioContext: AudioContext | null = null;
let mediaStream: MediaStream | null = null;
let sourceNode: MediaStreamAudioSourceNode | null = null;
let workletNode: AudioWorkletNode | null = null;
let analyserNode: AnalyserNode | null = null;
let spectrumInterval: number | null = null;

// Listen for messages from the service worker background page
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'START_CAPTURE') {
    startCapture(message.streamId, message.settings)
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // Keep message channel open for async response
  } else if (message.type === 'STOP_CAPTURE') {
    stopCapture();
    sendResponse({ success: true });
    return false;
  } else if (message.type === 'SETTINGS_UPDATE') {
    updateSettings(message.settings);
    sendResponse({ success: true });
    return false;
  }
  return false;
});

async function startCapture(streamId: string, settings: any) {
  try {
    if (audioContext) {
      await stopCapture();
    }

    // 1. Capture the tab audio media stream
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId
        }
      } as any,
      video: false
    });

    // 2. Initialize AudioContext
    audioContext = new AudioContext({
      latencyHint: 'interactive',
      sampleRate: 48000 // Standardize on 48kHz for high-fidelity HRTF matching
    });

    audioContext.onstatechange = () => {
      if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume().catch((e) => console.warn("Failed to auto-resume AudioContext:", e));
      }
    };

    // Monitor track ended events (e.g. if the captured tab is refreshed or closed)
    mediaStream.getAudioTracks().forEach((track) => {
      track.onended = () => {
        console.log("Captured tab stream track ended. Stopping spatializer.");
        chrome.runtime.sendMessage({ type: 'STOP_SPATIALIZER' }).catch(() => {});
      };
    });

    // 3. Load AudioWorklet module
    // The processor is output to '/worklet/surround-processor.js' by Vite config
    const workletUrl = chrome.runtime.getURL('worklet/surround-processor.js');
    await audioContext.audioWorklet.addModule(workletUrl);

    // 4. Create nodes
    sourceNode = audioContext.createMediaStreamSource(mediaStream);
    workletNode = new AudioWorkletNode(audioContext, 'surround-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2] // Output stereo (binaural)
    });

    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 256; // Fast frequency analysis for spectrum bar graph
    analyserNode.smoothingTimeConstant = 0.75;

    // 5. Build routing graph
    sourceNode.connect(workletNode);
    workletNode.connect(analyserNode);
    analyserNode.connect(audioContext.destination);

    // 6. Apply initial settings
    updateSettings(settings);

    // 7. Try loading WASM module if available in assets
    try {
      const wasmUrl = chrome.runtime.getURL('wasm/surround_dsp.wasm');
      const response = await fetch(wasmUrl);
      if (response.ok) {
        const wasmBuffer = await response.arrayBuffer();
        const wasmModule = await WebAssembly.compile(wasmBuffer);
        workletNode.port.postMessage({
          type: 'INITIALIZE_WASM',
          wasmModule
        });
      }
    } catch (e) {
      // WASM not built yet, fallback to optimized TypeScript DSP (expected by default)
      console.log('Running optimized TypeScript DSP pipeline.');
    }

    // 8. Worklet message handling (routing channel levels and latency back to UI)
    workletNode.port.onmessage = (event) => {
      if (event.data.type === 'LEVEL_METERS') {
        chrome.runtime.sendMessage({
          type: 'LEVEL_METERS_UI',
          levels: event.data.levels,
          outputLevel: event.data.outputLevel,
          aiClass: event.data.aiClass,
          performanceMs: event.data.performanceMs || 0,
          dspLoadRatio: event.data.dspLoadRatio || 0,
          underrunCount: event.data.underrunCount || 0,
          gcPauseCount: event.data.gcPauseCount || 0
        }).catch(() => {}); // Suppress error if popup is closed
      }
    };

    // 9. Start real-time audio visualization analyzer interval
    const dataArray = new Uint8Array(analyserNode.frequencyBinCount);
    spectrumInterval = window.setInterval(() => {
      if (analyserNode) {
        analyserNode.getByteFrequencyData(dataArray);
        chrome.runtime.sendMessage({
          type: 'SPECTRUM_DATA_UI',
          spectrum: Array.from(dataArray)
        }).catch(() => {}); // Suppress errors when popup is closed
      }
    }, 33); // ~30 fps

    // 10. Start playing
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }
  } catch (err: any) {
    console.error('Failed to capture audio stream or build audio graph:', err);
    throw err;
  }
}

function updateSettings(settings: any) {
  if (!workletNode) return;

  // Send settings packet directly to AudioWorklet thread
  workletNode.port.postMessage({
    type: 'UPDATE_SETTINGS',
    settings
  });

  // Handle custom IR decoding vs HRTF profiles
  if (settings.customIRData) {
    decodeAndLoadCustomIR(settings.customIRData);
  } else {
    // Send built-in HRTF profile taps
    const profile = HRTF_PROFILES[settings.hrtfProfile] || HRTF_PROFILES.kemar;
    workletNode.port.postMessage({
      type: 'LOAD_HRTF',
      profile
    });
  }
}

async function decodeAndLoadCustomIR(base64Wav: string) {
  if (!audioContext || !workletNode) return;

  try {
    const rawData = atob(base64Wav);
    const bytes = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; i++) {
      bytes[i] = rawData.charCodeAt(i);
    }

    const audioBuffer = await audioContext.decodeAudioData(bytes.buffer);
    
    // Extract channels
    const leftIR = audioBuffer.getChannelData(0);
    const rightIR = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : leftIR;

    // Crop or pad to 256 taps for the partitioned convolver
    const tapsL = new Array(256).fill(0);
    const tapsR = new Array(256).fill(0);

    for (let i = 0; i < 256; i++) {
      tapsL[i] = i < leftIR.length ? leftIR[i] : 0;
      tapsR[i] = i < rightIR.length ? rightIR[i] : 0;
    }

    // Load custom IR into all channels with standard surround delays
    const customProfile = {
      channels: {
        C: { ipsi: tapsL, contra: tapsR, delay: 0, gain: 1.0 },
        L: { ipsi: tapsL, contra: tapsR, delay: 11, gain: 0.85 },
        R: { ipsi: tapsR, contra: tapsL, delay: 11, gain: 0.85 },
        Ls: { ipsi: tapsL, contra: tapsR, delay: 28, gain: 0.55 },
        Rs: { ipsi: tapsR, contra: tapsL, delay: 28, gain: 0.55 },
        Lb: { ipsi: tapsL, contra: tapsR, delay: 30, gain: 0.48 },
        Rb: { ipsi: tapsR, contra: tapsL, delay: 30, gain: 0.48 },
        Lh: { ipsi: tapsL, contra: tapsR, delay: 6, gain: 0.65 },
        Rh: { ipsi: tapsR, contra: tapsL, delay: 6, gain: 0.65 }
      }
    };

    workletNode.port.postMessage({
      type: 'LOAD_HRTF',
      profile: customProfile
    });

    console.log('Custom Impulse Response loaded successfully.');
  } catch (err) {
    console.error('Failed to decode custom Impulse Response WAV file:', err);
  }
}

async function stopCapture() {
  if (spectrumInterval) {
    clearInterval(spectrumInterval);
    spectrumInterval = null;
  }

  if (workletNode) {
    workletNode.disconnect();
    workletNode = null;
  }

  if (sourceNode) {
    sourceNode.disconnect();
    sourceNode = null;
  }

  if (analyserNode) {
    analyserNode.disconnect();
    analyserNode = null;
  }

  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop());
    mediaStream = null;
  }

  if (audioContext) {
    await audioContext.close();
    audioContext = null;
  }
}
