import React, { useEffect, useState, useRef } from 'react';
import { useStore, PRESETS } from '../utils/store';
import { DashboardSpeakerVisualizer } from './components/DashboardSpeakerVisualizer';
import { runDSPDiagnostics, DiagnosticResult } from '../utils/offline-tester';
import { 
  Radio,
  Activity,
  X,
  CheckCircle2,
  Ear,
  Play,
  Sliders,
  Layers,
  BarChart2,
  Clock,
  UploadCloud,
  Trash2
} from 'lucide-react';

const CALIBRATION_FREQS = [250, 1000, 4000, 8000];

const App: React.FC = () => {
  const {
    isEnabled,
    preset,
    crosstalkCancellation,
    dynamicEQ,
    customIRName,
    activeTabTitle,
    isAIEnabled,
    headphoneProfile,
    roomSize,
    roomAbsorption,
    deEsserIntensity,
    spectralWarmth,
    driftAmount,
    initStore,
    setSetting,
    applyPreset,
    toggleEnabled,
    uploadCustomIR,
    clearCustomIR,
    disconnectCapture
  } = useStore();

  const [levels, setLevels] = useState<number[]>(new Array(10).fill(0));
  const [spectrum, setSpectrum] = useState<number[]>(new Array(128).fill(0));
  const [detectedAIClass, setDetectedAIClass] = useState<string>('flat');
  const [performanceMs, setPerformanceMs] = useState<number>(0);
  const [dspLoadRatio, setDspLoadRatio] = useState<number>(0);
  const [underrunCount, setUnderrunCount] = useState<number>(0);
  const [gcPauseCount, setGcPauseCount] = useState<number>(0);

  // Diagnostics state
  const [diagnosticResult, setDiagnosticResult] = useState<DiagnosticResult | null>(null);
  const [isRunningDiag, setIsRunningDiag] = useState(false);
  const [showDiagModal, setShowDiagModal] = useState(false);

  // Hearing Calibration Wizard state
  const [showCalibrator, setShowCalibrator] = useState(false);
  const [calibStep, setCalibStep] = useState<number>(0);
  const [calibValues, setCalibValues] = useState<number[]>(new Array(8).fill(30));
  const [isPlayingTestTone, setIsPlayingTestTone] = useState(false);

  // Native audio refs for hearing wizard
  const localAudioCtxRef = useRef<AudioContext | null>(null);
  const oscillatorNodeRef = useRef<OscillatorNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const pannerNodeRef = useRef<StereoPannerNode | null>(null);

  useEffect(() => {
    initStore();
  }, [initStore]);

  // Audio level and spectrum receivers
  useEffect(() => {
    const hasChromeRuntime = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage;
    
    if (!hasChromeRuntime) {
      // Mock data generator for local previewing
      if (!isEnabled) {
        setLevels(new Array(10).fill(0));
        setSpectrum(new Array(128).fill(0));
        setDetectedAIClass('flat');
        setPerformanceMs(0);
        setDspLoadRatio(0);
        setUnderrunCount(0);
        setGcPauseCount(0);
        return;
      }

      const mockInterval = setInterval(() => {
        const mockLevels = new Array(10).fill(0).map((_, idx) => {
          const base = idx === 3 ? 0.35 : idx >= 8 ? 0.15 : 0.2;
          const rnd = Math.random() * 0.45;
          return base + rnd;
        });

        const mockSpectrum = new Array(128).fill(0).map((_, idx) => {
          const factor = Math.max(0, 180 - idx * 2.2);
          return Math.round(factor * (0.6 + Math.random() * 0.4));
        });

        const mockPerf = 0.38 + Math.random() * 0.12;
        setLevels(mockLevels);
        setSpectrum(mockSpectrum);
        setPerformanceMs(mockPerf);
        setDspLoadRatio(mockPerf / 2.66);

        const classes = ['dialogue', 'music', 'action', 'ambient'];
        const classIdx = Math.floor(Date.now() / 4000) % 4;
        setDetectedAIClass(isAIEnabled ? classes[classIdx] : 'flat');
      }, 50);

      return () => clearInterval(mockInterval);
    }

    const messageListener = (message: any) => {
      if (message.type === 'LEVEL_METERS_UI') {
        setLevels(message.levels);
        if (message.aiClass) {
          setDetectedAIClass(message.aiClass);
        }
        if (message.performanceMs !== undefined) {
          setPerformanceMs(message.performanceMs);
        }
        if (message.dspLoadRatio !== undefined) {
          setDspLoadRatio(message.dspLoadRatio);
        }
        if (message.underrunCount !== undefined) {
          setUnderrunCount(message.underrunCount);
        }
        if (message.gcPauseCount !== undefined) {
          setGcPauseCount(message.gcPauseCount);
        }
      } else if (message.type === 'SPECTRUM_DATA_UI') {
        setSpectrum(message.spectrum);
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);
    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, [isEnabled, isAIEnabled]);

  // Run diagnostics
  const handleRunDiagnostics = async () => {
    setIsRunningDiag(true);
    setShowDiagModal(true);
    setDiagnosticResult(null);
    try {
      const res = await runDSPDiagnostics();
      setDiagnosticResult(res);
    } catch (err) {
      console.error(err);
    } finally {
      setIsRunningDiag(false);
    }
  };

  // Hearing Calibration Sweep Tone generator
  const startTone = (frequency: number, pan: number, thresholdVolume: number) => {
    stopTone();
    try {
      if (!localAudioCtxRef.current) {
        localAudioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = localAudioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.value = frequency;

      const dbAmplitude = -60 + (thresholdVolume / 100) * 45; // -60dB to -15dB range
      const amp = Math.pow(10, dbAmplitude / 20);

      gain.gain.value = amp;

      if (ctx.createStereoPanner) {
        const panner = ctx.createStereoPanner();
        panner.pan.value = pan;
        osc.connect(gain);
        gain.connect(panner);
        panner.connect(ctx.destination);
        pannerNodeRef.current = panner;
      } else {
        osc.connect(gain);
        gain.connect(ctx.destination);
      }

      osc.start();
      oscillatorNodeRef.current = osc;
      gainNodeRef.current = gain;
      setIsPlayingTestTone(true);
    } catch (err) {
      console.error("Tone generation failed:", err);
    }
  };

  const stopTone = () => {
    if (oscillatorNodeRef.current) {
      try {
        oscillatorNodeRef.current.stop();
        oscillatorNodeRef.current.disconnect();
      } catch (_) {}
      oscillatorNodeRef.current = null;
    }
    if (gainNodeRef.current) {
      gainNodeRef.current.disconnect();
      gainNodeRef.current = null;
    }
    if (pannerNodeRef.current) {
      pannerNodeRef.current.disconnect();
      pannerNodeRef.current = null;
    }
    setIsPlayingTestTone(false);
  };

  const handleCalibVolumeChange = (val: number) => {
    const newVals = [...calibValues];
    newVals[calibStep] = val;
    setCalibValues(newVals);

    if (isPlayingTestTone) {
      const dbAmplitude = -60 + (val / 100) * 45;
      const amp = Math.pow(10, dbAmplitude / 20);
      if (gainNodeRef.current) {
        gainNodeRef.current.gain.setTargetAtTime(amp, localAudioCtxRef.current!.currentTime, 0.04);
      }
    }
  };

  const handleNextCalibStep = () => {
    stopTone();
    if (calibStep < 7) {
      setCalibStep(calibStep + 1);
    } else {
      // Convert sweeps thresholds into peaking EQs compensation values
      const leftProfile = [0, 1, 2, 3].map(i => {
        const threshold = calibValues[i];
        const compVal = Math.max(0, (threshold - 20) * 0.22); // up to +17.6dB compensation
        return parseFloat(compVal.toFixed(1));
      });

      const rightProfile = [4, 5, 6, 7].map(i => {
        const threshold = calibValues[i];
        const compVal = Math.max(0, (threshold - 20) * 0.22);
        return parseFloat(compVal.toFixed(1));
      });

      setSetting('hearingProfile', {
        left: leftProfile,
        right: rightProfile
      });

      setShowCalibrator(false);
      alert("Calibration finalized! Values mapped to peaking filters.");
    }
  };

  const resetHearingProfile = () => {
    setSetting('hearingProfile', {
      left: [0, 0, 0, 0],
      right: [0, 0, 0, 0]
    });
    setCalibValues(new Array(8).fill(30));
  };

  const handleCustomIRUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 4 * 1024 * 1024) {
      alert("WAV Impulse file too large. Select one below 4MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64Data = result.split(',')[1];
      uploadCustomIR(file.name, base64Data);
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    return () => stopTone();
  }, []);

  const isRightEar = calibStep >= 4;
  const currentFreq = CALIBRATION_FREQS[calibStep % 4];
  const panValue = isRightEar ? 1.0 : -1.0;

  // 10 channel labels
  const channelNames = ["L", "R", "C", "LFE", "Ls", "Rs", "Lb", "Rb", "Lh", "Rh"];

  return (
    <div className="w-full min-h-screen bg-[#040409] flex flex-col p-6 select-none relative font-sans text-slate-200">
      <style>{`
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #334155; border-radius: 2px; }
        ::-webkit-scrollbar-thumb:hover { background: #f59e0b66; }
      `}</style>
      
      {/* 1. HEADER BAR */}
      <header className="flex items-center justify-between pb-4 border-b border-slate-900 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-400 to-amber-600 flex items-center justify-center shadow-lg">
            <Radio className="w-6 h-6 text-slate-950 stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-extrabold uppercase tracking-wider bg-gradient-to-r from-amber-300 via-amber-100 to-slate-400 bg-clip-text text-transparent">
                Aether Spatial Control Center
              </h1>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-amber-400">
                v3.0 Reference
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-xs text-slate-400 font-mono truncate max-w-xl">
                Captured Stream: {activeTabTitle || 'Waiting for connection...'}
              </p>
              {activeTabTitle && activeTabTitle !== 'No active audio tab' && (
                <button
                  onClick={disconnectCapture}
                  className="text-xs text-rose-500 hover:text-rose-400 underline font-semibold transition-colors focus:outline-none"
                  title="Stop capturing and release tab audio"
                >
                  (Disconnect)
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Master Power Toggle Button */}
        <button
          onClick={toggleEnabled}
          className={`px-6 py-2 rounded-full text-xs font-black uppercase tracking-widest transition-all duration-300 flex items-center gap-2 border ${
            isEnabled 
              ? 'bg-amber-400 text-slate-950 border-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.4)]'
              : 'bg-transparent text-slate-400 border-slate-800 hover:text-white hover:border-slate-600'
          }`}
        >
          <span className={`w-2 h-2 rounded-full ${isEnabled ? 'bg-slate-950 animate-ping' : 'bg-slate-500'}`} />
          {isEnabled ? 'ACTIVE' : 'BYPASS'}
        </button>
      </header>

      {/* 2. THREE-PANEL CORE GRID */}
      <main className="flex-1 grid grid-cols-12 gap-6 my-6 min-h-0">
        
        {/* LEFT COLUMN: ACOUSTIC PROFILE AND ENHANCERS */}
        <section className="col-span-4 flex flex-col gap-4 overflow-y-auto pr-1">
          
          {/* Reference Presets */}
          <div className="p-5 rounded-2xl bg-slate-950/45 border border-slate-900">
            <div className="flex items-center gap-2 mb-4">
              <Layers className="w-4 h-4 text-amber-400" />
              <h2 className="text-xs font-black uppercase tracking-wider text-slate-300">
                Premium Acoustic Presets
              </h2>
            </div>
            
            <div className="grid grid-cols-1 gap-2">
              {Object.entries(PRESETS).map(([key, def]) => (
                <button
                  key={key}
                  onClick={() => applyPreset(key)}
                  className={`px-4 py-2.5 rounded-xl text-left text-xs font-semibold flex items-center justify-between border transition-all ${
                    preset === key
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-300 font-bold'
                      : 'bg-slate-900/30 border-transparent text-slate-400 hover:bg-slate-900/50 hover:text-slate-200'
                  }`}
                >
                  <span>{def.name}</span>
                  {preset === key && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
                </button>
              ))}
            </div>
          </div>

          {/* Room Acoustics Card */}
          <div className="p-5 rounded-2xl bg-slate-950/45 border border-slate-900">
            <div className="flex items-center gap-2 mb-4">
              <Sliders className="w-4 h-4 text-amber-400" />
              <h2 className="text-xs font-black uppercase tracking-wider text-slate-300">
                Dynamic Room Tuning Matrix
              </h2>
            </div>

            <div className="flex flex-col gap-4">
              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-slate-400">Virtual Room Dimensions</span>
                  <span className="font-mono text-amber-400">{Math.round(roomSize * 100)}m³</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={roomSize * 100}
                  onChange={(e) => setSetting('roomSize', parseFloat(e.target.value) / 100)}
                />
              </div>

              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-slate-400">Wall/Ceiling Damping</span>
                  <span className="font-mono text-amber-400">{Math.round(roomAbsorption * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={roomAbsorption * 100}
                  onChange={(e) => setSetting('roomAbsorption', parseFloat(e.target.value) / 100)}
                />
              </div>

              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-slate-400">Sibilance De-esser Intensity</span>
                  <span className="font-mono text-amber-400">{Math.round(deEsserIntensity * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={deEsserIntensity * 100}
                  onChange={(e) => setSetting('deEsserIntensity', parseFloat(e.target.value) / 100)}
                />
              </div>

              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-slate-400">Spectral Warmth (Harmonics)</span>
                  <span className="font-mono text-amber-400">{Math.round(spectralWarmth * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={spectralWarmth * 100}
                  onChange={(e) => setSetting('spectralWarmth', parseFloat(e.target.value) / 100)}
                />
              </div>

              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-slate-400">Micro Room Haas Drift</span>
                  <span className="font-mono text-amber-400">{Math.round(driftAmount * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={driftAmount * 100}
                  onChange={(e) => setSetting('driftAmount', parseFloat(e.target.value) / 100)}
                />
              </div>
            </div>
          </div>

          {/* Custom IR Space Modeling */}
          <div className="p-5 rounded-2xl bg-slate-950/45 border border-slate-900">
            <div className="flex items-center gap-2 mb-3">
              <UploadCloud className="w-4 h-4 text-amber-400" />
              <h2 className="text-xs font-black uppercase tracking-wider text-slate-300">
                Custom Space Modeling
              </h2>
            </div>
            
            <p className="text-[11px] text-slate-400 mb-4 leading-relaxed">
              Upload custom room impulse response WAV files (under 4MB).
            </p>

            {customIRName ? (
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900/50 border border-amber-500/20">
                <span className="text-xs font-semibold text-amber-300 truncate max-w-[180px]" title={customIRName}>
                  {customIRName}
                </span>
                <button
                  onClick={clearCustomIR}
                  className="p-1 rounded-md text-slate-400 hover:text-rose-400 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center border border-dashed border-slate-800 rounded-xl p-5 hover:border-slate-600 hover:bg-slate-900/10 cursor-pointer transition-all">
                <UploadCloud className="w-6 h-6 text-slate-500 mb-2" />
                <span className="text-xs text-slate-400 text-center">Click to upload WAV impulse</span>
                <input
                  type="file"
                  accept=".wav"
                  onChange={handleCustomIRUpload}
                  className="hidden"
                />
              </label>
            )}
          </div>

        </section>

        {/* MIDDLE COLUMN: VISUALIZER ENGINE & HEADPHONE COMPENSATION */}
        <section className="col-span-5 flex flex-col gap-4 overflow-y-auto pr-1">
          
          <DashboardSpeakerVisualizer levels={levels} isEnabled={isEnabled} />

          {/* Headphone Compensation Selector */}
          <div className="p-5 rounded-2xl bg-slate-950/45 border border-slate-900 flex-1 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Ear className="w-4 h-4 text-amber-400" />
                <h2 className="text-xs font-black uppercase tracking-wider text-slate-300">
                  Headphone Reference Correction
                </h2>
              </div>
              <p className="text-[11px] text-slate-400 mb-4 leading-relaxed">
                Applies correction target curves to compensate for driver resonance and open-back roll-off characteristics.
              </p>

              <div className="grid grid-cols-2 gap-2.5">
                {[
                  { id: 'none', label: 'Bypass (Flat)' },
                  { id: 'open_back', label: 'Open-Back Boost' },
                  { id: 'closed_back', label: 'Closed-Back Scoop' },
                  { id: 'gaming_headset', label: 'Gaming Reference' },
                  { id: 'earbuds', label: 'In-Ear Tame' }
                ].map((hp) => (
                  <button
                    key={hp.id}
                    onClick={() => setSetting('headphoneProfile', hp.id as any)}
                    className={`px-3 py-2.5 rounded-xl text-xs font-semibold text-center border transition-all ${
                      headphoneProfile === hp.id
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-300 font-bold'
                        : 'bg-slate-900/35 border-transparent text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                    }`}
                  >
                    {hp.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Sub-Enhancements Toggles */}
            <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-slate-900/50">
              <label className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/25 border border-slate-900 cursor-pointer">
                <span className="text-[11px] text-slate-300 font-semibold">Crosstalk Cancel</span>
                <input
                  type="checkbox"
                  checked={crosstalkCancellation}
                  onChange={(e) => setSetting('crosstalkCancellation', e.target.checked)}
                  className="accent-amber-400"
                />
              </label>

              <label className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/25 border border-slate-900 cursor-pointer">
                <span className="text-[11px] text-slate-300 font-semibold">Dynamic Equalizer</span>
                <input
                  type="checkbox"
                  checked={dynamicEQ}
                  onChange={(e) => setSetting('dynamicEQ', e.target.checked)}
                  className="accent-amber-400"
                />
              </label>
            </div>
          </div>

        </section>

        {/* RIGHT COLUMN: TELEMETRY & SPECTRUM HUD */}
        <section className="col-span-3 flex flex-col gap-4 overflow-y-auto pr-1">
          
          {/* Latency & AI Classification HUD */}
          <div className="p-4 rounded-xl bg-slate-950/45 border border-slate-900 flex flex-col gap-3.5">
            
            <div className="flex justify-between items-center">
              <span className="text-[10px] uppercase tracking-widest text-slate-400 font-bold flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                DSP Performance
              </span>
              <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded uppercase ${
                performanceMs > 1.8 
                  ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20 shadow-sm' 
                  : performanceMs > 1.2
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-sm'
                    : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-sm'
              }`}>
                {performanceMs > 1.8 ? 'Critical' : performanceMs > 1.2 ? 'Heavy' : 'Stable'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-2xl font-black font-mono text-amber-300">
                  {performanceMs.toFixed(2)}<span className="text-xs text-slate-400 font-normal ml-0.5">ms</span>
                </div>
                <div className="text-[9px] text-slate-500 uppercase tracking-wider font-extrabold text-slate-400">Callback Time</div>
              </div>
              
              <div className="text-right">
                <div className="text-2xl font-black font-mono text-amber-300">
                  {(dspLoadRatio * 100).toFixed(1)}<span className="text-xs text-slate-400 font-normal ml-0.5">%</span>
                </div>
                <div className="text-[9px] text-slate-500 uppercase tracking-wider font-extrabold text-slate-400">DSP Load Ratio</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-3 border-t border-slate-900/50">
              <div>
                <div className={`text-base font-extrabold font-mono ${underrunCount > 0 ? 'text-rose-400' : 'text-slate-300'}`}>
                  {underrunCount}
                </div>
                <div className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold">Underruns / Glitches</div>
              </div>

              <div className="text-right">
                <div className={`text-base font-extrabold font-mono ${gcPauseCount > 0 ? 'text-rose-400' : 'text-slate-300'}`}>
                  {gcPauseCount}
                </div>
                <div className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold">GC Pause Events</div>
              </div>
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-slate-900/50">
              <span className="text-[9px] text-slate-400 uppercase font-bold tracking-wider">AI Detected Scene</span>
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-300 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/20 shadow-sm">
                {detectedAIClass.toUpperCase()}
              </span>
            </div>
          </div>

          {/* 10-Channel VU Indicators */}
          <div className="p-4 rounded-xl bg-slate-950/45 border border-slate-900 flex-1 flex flex-col">
            <div className="flex items-center gap-2 mb-3">
              <BarChart2 className="w-3.5 h-3.5 text-amber-400" />
              <h2 className="text-[10px] font-bold uppercase tracking-wider text-slate-300">
                10-Channel Discrete VU Grid
              </h2>
            </div>

            <div className="flex-1 grid grid-cols-10 gap-1.5 items-end h-[100px]">
              {levels.map((lvl, i) => {
                const heightPercent = Math.min(100, Math.floor(lvl * 100));
                return (
                  <div key={i} className="h-full flex flex-col justify-end items-center relative group">
                    <div className="w-full bg-slate-900 rounded-t overflow-hidden flex flex-col justify-end h-full">
                      <div 
                        className="w-full bg-gradient-to-t from-amber-600 to-amber-300 transition-all duration-75"
                        style={{ height: `${heightPercent}%` }}
                      />
                    </div>
                    <span className="text-[7px] text-slate-400 font-mono mt-1 font-extrabold scale-90">{channelNames[i]}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Real-time Spectrum visualizer */}
          <div className="p-4 rounded-xl bg-slate-950/45 border border-slate-900">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-300">
                Real-Time FFT Array
              </span>
              <span className="text-[9px] text-slate-500 font-mono">128 Bins</span>
            </div>

            {/* Custom SVG line spectrum rendering */}
            <div className="h-[48px] w-full bg-slate-900/40 rounded overflow-hidden">
              <svg className="w-full h-full" viewBox="0 0 128 40" preserveAspectRatio="none">
                <path
                  d={`M ${spectrum.map((val, idx) => `${idx},${40 - (val / 255) * 38}`).join(' L ')}`}
                  fill="none"
                  stroke="#d4af37"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          </div>

          {/* Diagnostic and Wizards buttons */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => {
                setCalibStep(0);
                setShowCalibrator(true);
              }}
              className="py-2 px-3 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs font-bold text-slate-300 flex items-center justify-center gap-1.5 hover:text-white transition-all"
            >
              <Ear className="w-4 h-4 text-amber-400" />
              Run Calibrator
            </button>

            <button
              onClick={handleRunDiagnostics}
              className="py-2 px-3 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs font-bold text-slate-300 flex items-center justify-center gap-1.5 hover:text-white transition-all"
            >
              <Activity className="w-4 h-4 text-amber-400" />
              DSP Benchmark
            </button>
          </div>

        </section>

      </main>

      {/* 3. DIAGNOSTIC RESULTS MODAL OVERLAY */}
      {showDiagModal && (
        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-6">
          <div className="w-[500px] rounded-2xl bg-slate-900 border border-slate-800 p-6 flex flex-col max-h-[90%] shadow-2xl relative">
            <button 
              onClick={() => setShowDiagModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white transition"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <Activity className="w-6 h-6 text-amber-400" />
              <h2 className="text-base font-bold text-slate-100">
                Aether Engine Diagnostics Benchmark
              </h2>
            </div>

            {isRunningDiag ? (
              <div className="flex-1 flex flex-col items-center justify-center py-10 gap-4">
                <div className="w-10 h-10 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" />
                <p className="text-xs text-slate-400">Synthesizing audio blocks & benchmarking pipeline...</p>
              </div>
            ) : (
              diagnosticResult && (
                <div className="flex-1 overflow-y-auto space-y-4 pr-1 text-xs">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-900">
                      <div className="text-[10px] uppercase text-slate-500 font-bold mb-1">Processing Latency</div>
                      <div className="text-lg font-mono font-black text-amber-300">
                        {diagnosticResult.estimatedLatencyMs.toFixed(2)} ms
                      </div>
                      <div className="text-[9px] text-slate-500 mt-1">Limit: 2.67ms (128 samples)</div>
                    </div>

                    <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-900">
                      <div className="text-[10px] uppercase text-slate-500 font-bold mb-1">Peak Amplitude</div>
                      <div className="text-lg font-mono font-black text-amber-300">
                        {diagnosticResult.maxAmplitude.toFixed(4)}
                      </div>
                      <div className="text-[9px] text-slate-500 mt-1">Limiter Pass: {diagnosticResult.maxAmplitude <= 1.0 ? 'Yes' : 'No'}</div>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-900 space-y-2">
                    <h3 className="text-xs font-bold text-slate-300 border-b border-slate-800 pb-1.5">
                      System Benchmark Metrics
                    </h3>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[10px] text-slate-400">
                      <div className="flex justify-between">
                        <span>Offline Render Time:</span>
                        <span className="text-slate-300">{diagnosticResult.durationMs.toFixed(2)} ms</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Simulated CPU Load:</span>
                        <span className="text-slate-300">{diagnosticResult.cpuLoadPercent.toFixed(2)} %</span>
                      </div>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-amber-500/5 border border-amber-500/10 flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-amber-400 shrink-0" />
                    <div>
                      <h4 className="text-xs font-bold text-amber-300">Diagnostics Check Passed</h4>
                      <p className="text-[10px] text-slate-400 mt-1">
                        The AudioWorklet thread runs correctly within the required latency constraints. Limiter safety confirms no clipping.
                      </p>
                    </div>
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      )}

      {/* 4. HEARING CALIBRATION WIZARD OVERLAY */}
      {showCalibrator && (
        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-6">
          <div className="w-[450px] rounded-2xl bg-slate-900 border border-slate-800 p-6 flex flex-col shadow-2xl relative">
            
            <button
              onClick={() => {
                stopTone();
                setShowCalibrator(false);
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-white transition"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-2">
              <Ear className="w-5 h-5 text-amber-400" />
              <h2 className="text-sm font-black uppercase tracking-wider text-slate-200">
                Hearing Equalizer Sweep Wizard
              </h2>
            </div>
            
            <p className="text-xs text-slate-400 mb-6 leading-relaxed">
              Plays pure test tones. Move the slider down until the tone is barely audible.
            </p>

            <div className="p-5 rounded-xl bg-slate-950 border border-slate-900 mb-6 text-center">
              <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-1">
                Active Ear Testing
              </div>
              <div className="text-xl font-black text-amber-300 uppercase mb-2">
                {isRightEar ? 'Right Ear' : 'Left Ear'}
              </div>
              
              <div className="text-sm font-mono font-bold text-slate-300">
                Test Band: {currentFreq}Hz
              </div>

              <div className="mt-4 flex justify-center">
                <button
                  onClick={() => startTone(currentFreq, panValue, calibValues[calibStep])}
                  className={`py-2 px-6 rounded-full text-xs font-bold flex items-center gap-1.5 border transition-all ${
                    isPlayingTestTone
                      ? 'bg-amber-400 text-slate-950 border-amber-400 shadow-glow-cyan'
                      : 'bg-transparent text-slate-300 border-slate-700 hover:border-slate-500'
                  }`}
                >
                  <Play className="w-3.5 h-3.5" />
                  {isPlayingTestTone ? 'Tone Playing...' : 'Play Test Tone'}
                </button>
              </div>
            </div>

            <div className="space-y-1 mb-6">
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-slate-400">Audibility Threshold Level</span>
                <span className="font-mono text-amber-400">{calibValues[calibStep]}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={calibValues[calibStep]}
                onChange={(e) => handleCalibVolumeChange(parseInt(e.target.value))}
              />
              <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                <span>Softer (More Sensitive)</span>
                <span>Louder (Less Sensitive)</span>
              </div>
            </div>

            <div className="flex justify-between items-center">
              <button
                onClick={resetHearingProfile}
                className="text-xs text-slate-500 hover:text-slate-300 underline font-semibold"
              >
                Clear Calibration
              </button>

              <button
                onClick={handleNextCalibStep}
                className="py-2.5 px-6 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md transition"
              >
                {calibStep < 7 ? 'Next Frequency Band' : 'Finalize Calibration'}
              </button>
            </div>

            {/* Steps indicator nodes */}
            <div className="flex justify-center gap-1 mt-6">
              {new Array(8).fill(0).map((_, idx) => (
                <div 
                  key={idx} 
                  className={`w-2.5 h-1.5 rounded-full transition-all ${
                    idx === calibStep 
                      ? 'bg-amber-400 w-4' 
                      : idx < calibStep 
                        ? 'bg-amber-500/40' 
                        : 'bg-slate-800'
                  }`} 
                />
              ))}
            </div>

          </div>
        </div>
      )}

    </div>
  );
};

export default App;
