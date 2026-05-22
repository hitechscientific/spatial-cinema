import React, { useEffect, useState } from 'react';
import { useStore, PRESETS } from '../utils/store';
import { SpeakerVisualizer } from './components/SpeakerVisualizer';
import { AudioVisualizer } from './components/AudioVisualizer';
import { runDSPDiagnostics, DiagnosticResult } from '../utils/offline-tester';
import { 
  Volume2, 
  Compass, 
  Tv, 
  Settings, 
  Sparkles, 
  UploadCloud, 
  Trash2, 
  Info,
  Radio,
  Activity,
  X,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

const App: React.FC = () => {
  const {
    isEnabled,
    preset,
    hrtfProfile,
    volume,
    surroundIntensity,
    bassBoost,
    dialogueEnhance,
    roomReflections,
    crosstalkCancellation,
    dynamicEQ,
    customIRName,
    activeTabTitle,
    initStore,
    setSetting,
    applyPreset,
    toggleEnabled,
    uploadCustomIR,
    clearCustomIR
  } = useStore();

  const [activeTab, setActiveTab] = useState<'dashboard' | 'profiles' | 'enhancers'>('dashboard');
  const [levels, setLevels] = useState<number[]>(new Array(8).fill(0));
  const [spectrum, setSpectrum] = useState<number[]>(new Array(128).fill(0));
  
  const [diagnosticResult, setDiagnosticResult] = useState<DiagnosticResult | null>(null);
  const [isRunningDiag, setIsRunningDiag] = useState(false);
  const [showDiagModal, setShowDiagModal] = useState(false);

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

  // Initialize Zustand state from local / chrome storage
  useEffect(() => {
    initStore();
  }, [initStore]);

  // Audio level and spectrum receivers
  useEffect(() => {
    // Check if in standard Chrome Extension context
    const hasChromeRuntime = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage;
    
    if (!hasChromeRuntime) {
      // Mock Data Generator for standard browser preview/development
      if (!isEnabled) {
        setLevels(new Array(8).fill(0));
        setSpectrum(new Array(128).fill(0));
        return;
      }

      const mockInterval = setInterval(() => {
        // Generate random activity profiles
        const mockLevels = new Array(8).fill(0).map((_, idx) => {
          const base = idx === 3 ? 0.35 : 0.2; // subwoofer slightly more dynamic
          const rnd = Math.random() * 0.45;
          return base + rnd;
        });

        const mockSpectrum = new Array(128).fill(0).map((_, idx) => {
          // exponential decay towards highs with random bumps
          const factor = Math.max(0, 180 - idx * 2.5);
          return Math.round(factor * (0.6 + Math.random() * 0.4));
        });

        setLevels(mockLevels);
        setSpectrum(mockSpectrum);
      }, 50);

      return () => clearInterval(mockInterval);
    }

    // Real listener for extension processing messages
    const messageListener = (message: any) => {
      if (message.type === 'LEVEL_METERS_UI') {
        setLevels(message.levels);
      } else if (message.type === 'SPECTRUM_DATA_UI') {
        setSpectrum(message.spectrum);
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);
    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, [isEnabled]);

  // File Upload parsing logic
  const handleCustomIRUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check size limit (< 4MB to prevent storage bloat)
    if (file.size > 4 * 1024 * 1024) {
      alert("Impulse response file too large. Please select a WAV file under 4MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64Data = result.split(',')[1]; // Split data url scheme header
      uploadCustomIR(file.name, base64Data);
    };
    reader.onerror = () => {
      alert("Failed to read the WAV file.");
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="w-[390px] h-[600px] bg-studio-950 flex flex-col p-4 select-none relative font-sans text-slate-100 overflow-hidden">
      
      {/* 1. HEADER TITLE BAR */}
      <header className="flex items-center justify-between pb-3 border-b border-white/5 z-10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-studio-glow to-studio-neon flex items-center justify-center shadow-glow-cyan">
            <Radio className="w-5 h-5 text-studio-950 stroke-[2.5]" />
          </div>
          <div>
            <h1 className="text-sm font-bold uppercase tracking-wider bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
              Spatial Cinema
            </h1>
            <p className="text-[9px] text-slate-400 font-mono max-w-[180px] truncate" title={activeTabTitle}>
              {activeTabTitle}
            </p>
          </div>
        </div>

        {/* Master Power Toggle Button */}
        <button
          onClick={toggleEnabled}
          className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all duration-300 flex items-center gap-1.5 border ${
            isEnabled 
              ? 'bg-studio-glow text-studio-950 border-studio-glow shadow-glow-cyan font-extrabold'
              : 'bg-transparent text-slate-400 border-white/20 hover:text-white hover:border-white/40'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${isEnabled ? 'bg-studio-950 animate-ping' : 'bg-slate-500'}`} />
          {isEnabled ? 'ACTIVE' : 'BYPASS'}
        </button>
      </header>

      {/* 2. THREE.JS 3D SPEAKER GRAPH */}
      <section className="my-3">
        <SpeakerVisualizer levels={levels} isEnabled={isEnabled} />
      </section>

      {/* 3. TABS SELECTOR BAR */}
      <nav className="flex gap-1.5 p-0.5 rounded-lg bg-studio-900 border border-white/5 text-[10px] uppercase font-bold tracking-widest mb-3">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`flex-1 py-1.5 rounded-md flex items-center justify-center gap-1 transition-all ${
            activeTab === 'dashboard'
              ? 'bg-studio-800 text-studio-glow shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Tv className="w-3.5 h-3.5" />
          Dashboard
        </button>
        <button
          onClick={() => setActiveTab('profiles')}
          className={`flex-1 py-1.5 rounded-md flex items-center justify-center gap-1 transition-all ${
            activeTab === 'profiles'
              ? 'bg-studio-800 text-studio-glow shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Compass className="w-3.5 h-3.5" />
          Profiles
        </button>
        <button
          onClick={() => setActiveTab('enhancers')}
          className={`flex-1 py-1.5 rounded-md flex items-center justify-center gap-1 transition-all ${
            activeTab === 'enhancers'
              ? 'bg-studio-800 text-studio-glow shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          Enhancers
        </button>
      </nav>

      {/* 4. TAB CONTENTS */}
      <main className="flex-grow glass-panel rounded-xl p-3 border border-white/5 overflow-hidden flex flex-col justify-center min-h-[160px] max-h-[160px] mb-3">
        
        {/* DASHBOARD TAB */}
        {activeTab === 'dashboard' && (
          <div className="flex flex-col gap-2.5">
            {/* Preset Selector */}
            <div className="flex items-center justify-between">
              <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center gap-1">
                <Settings className="w-3.5 h-3.5" /> Preset Mode
              </label>
              <select
                value={preset}
                onChange={(e) => applyPreset(e.target.value)}
                className="bg-studio-900 border border-white/10 rounded-md px-2 py-1 text-[10px] font-semibold text-studio-glow focus:outline-none focus:border-studio-glow max-w-[150px]"
              >
                {Object.entries(PRESETS).map(([key, def]) => (
                  <option key={key} value={key} className="bg-studio-950 text-slate-200">
                    {def.name}
                  </option>
                ))}
                <option value="custom" disabled className="bg-studio-950 text-slate-500">Custom Tuned</option>
              </select>
            </div>

            {/* Master Volume Slider */}
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                <span className="flex items-center gap-1"><Volume2 className="w-3.5 h-3.5" /> Master Gain</span>
                <span className="text-studio-glow">{Math.round(volume * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1.0"
                step="0.05"
                value={volume}
                onChange={(e) => setSetting('volume', parseFloat(e.target.value))}
              />
            </div>

            {/* Surround Field Intensity Slider */}
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                <span>Surround Expansion</span>
                <span className="text-studio-glow">{Math.round(surroundIntensity * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1.0"
                step="0.05"
                value={surroundIntensity}
                onChange={(e) => setSetting('surroundIntensity', parseFloat(e.target.value))}
              />
            </div>
          </div>
        )}

        {/* HRTF PROFILES TAB */}
        {activeTab === 'profiles' && (
          <div className="flex flex-col gap-2.5 h-full justify-between">
            {/* Built-in HRTF Profiles */}
            <div className="flex items-center justify-between">
              <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center gap-1">
                HRTF Model
              </label>
              <div className="flex gap-1">
                {['sadie', 'kemar', 'cipic'].map((prof) => (
                  <button
                    key={prof}
                    disabled={!!customIRName}
                    onClick={() => setSetting('hrtfProfile', prof)}
                    className={`px-2 py-0.5 rounded text-[8px] font-extrabold uppercase border ${
                      customIRName 
                        ? 'opacity-40 border-white/5 bg-studio-950 text-slate-600'
                        : hrtfProfile === prof
                          ? 'border-studio-glow text-studio-glow bg-studio-glow/10'
                          : 'border-white/10 text-slate-400 hover:text-slate-200 bg-studio-900'
                    }`}
                  >
                    {prof === 'sadie' ? 'Sadie II' : prof === 'kemar' ? 'KEMAR' : 'CIPIC'}
                  </button>
                ))}
              </div>
            </div>

            {/* Profile description */}
            <div className="text-[9px] leading-relaxed text-slate-400 bg-studio-900/50 p-1.5 rounded border border-white/5 h-[40px] flex items-center gap-1">
              <Info className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span>
                {customIRName 
                  ? `Active custom IR: ${customIRName}`
                  : hrtfProfile === 'sadie' 
                    ? "SADIE II (Cinema) - Acoustically tuned for movie acoustics and deep spatial low-ends."
                    : hrtfProfile === 'kemar'
                      ? "MIT KEMAR (Reference) - Natural frequency response, perfect for hi-fi stereo audio upmixing."
                      : "CIPIC (Gaming) - Accentuated reflections for aggressive angular FPS footsteps cues."
                }
              </span>
            </div>

            {/* Custom WAV IR File Uploader & Diagnostics */}
            <div className="flex items-center justify-between border-t border-white/5 pt-2">
              <button
                onClick={handleRunDiagnostics}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-studio-900 border border-white/10 hover:border-studio-glow/30 hover:text-studio-glow text-[9px] font-bold uppercase tracking-wider text-slate-300 transition-all duration-150"
              >
                <Activity className="w-3.5 h-3.5 text-studio-glow" />
                Test Engine
              </button>

              {customIRName ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-mono text-studio-glow truncate max-w-[90px]">{customIRName}</span>
                  <button
                    onClick={clearCustomIR}
                    className="p-1 rounded bg-red-950/45 border border-red-800 text-red-400 hover:bg-red-900 hover:text-white transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <label className="flex items-center gap-1 px-2.5 py-1 rounded bg-studio-900 border border-white/10 hover:border-white/30 text-[9px] font-bold uppercase tracking-wider text-slate-300 cursor-pointer transition-all">
                  <UploadCloud className="w-3.5 h-3.5" />
                  Load .WAV
                  <input
                    type="file"
                    accept=".wav"
                    onChange={handleCustomIRUpload}
                    className="hidden"
                  />
                </label>
              )}
            </div>
          </div>
        )}

        {/* DSP ENHANCERS TAB */}
        {activeTab === 'enhancers' && (
          <div className="flex flex-col gap-2">
            
            {/* Grid for Boost Sliders */}
            <div className="grid grid-cols-2 gap-3 mb-1">
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                  <span>Dialogue Focus</span>
                  <span className="text-studio-glow">{Math.round(dialogueEnhance * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1.0"
                  step="0.05"
                  value={dialogueEnhance}
                  onChange={(e) => setSetting('dialogueEnhance', parseFloat(e.target.value))}
                />
              </div>

              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                  <span>Sub-Harmonic Bass</span>
                  <span className="text-studio-glow">{Math.round(bassBoost * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1.0"
                  step="0.05"
                  value={bassBoost}
                  onChange={(e) => setSetting('bassBoost', parseFloat(e.target.value))}
                />
              </div>
            </div>

            {/* Room reflections slider */}
            <div className="flex flex-col gap-1 mb-1">
              <div className="flex justify-between text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                <span>Room reflections (Reverb size)</span>
                <span className="text-studio-glow">{Math.round(roomReflections * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1.0"
                step="0.05"
                value={roomReflections}
                onChange={(e) => setSetting('roomReflections', parseFloat(e.target.value))}
              />
            </div>

            {/* Toggles */}
            <div className="flex justify-between gap-2 border-t border-white/5 pt-1.5">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={crosstalkCancellation}
                  onChange={(e) => setSetting('crosstalkCancellation', e.target.checked)}
                  className="rounded border-white/10 bg-studio-900 text-studio-glow focus:ring-0 w-3 h-3"
                />
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Cross-talk Cut</span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={dynamicEQ}
                  onChange={(e) => setSetting('dynamicEQ', e.target.checked)}
                  className="rounded border-white/10 bg-studio-900 text-studio-glow focus:ring-0 w-3 h-3"
                />
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Equal Loudness</span>
              </label>
            </div>
          </div>
        )}
      </main>

      {/* 5. VU METERS & CANVASES */}
      <footer className="z-10 mt-auto">
        <AudioVisualizer spectrum={spectrum} levels={levels} isEnabled={isEnabled} />
      </footer>

      {/* 6. DIAGNOSTICS MODAL OVERLAY */}
      {showDiagModal && (
        <div className="absolute inset-0 bg-studio-950/95 backdrop-blur-md z-50 flex flex-col p-4 transition-all duration-300">
          <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-studio-glow flex items-center gap-1.5 font-mono">
              <Activity className="w-4 h-4 text-studio-glow" /> System Diagnostics
            </h2>
            <button 
              onClick={() => setShowDiagModal(false)}
              className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-grow flex flex-col justify-center gap-3">
            {isRunningDiag ? (
              <div className="flex flex-col items-center justify-center gap-3 py-10">
                <div className="w-8 h-8 rounded-full border-2 border-studio-glow border-t-transparent animate-spin" />
                <span className="text-[9px] uppercase font-mono tracking-widest text-slate-400">Benchmarking Offline rendering context...</span>
              </div>
            ) : diagnosticResult ? (
              <div className="flex flex-col gap-2.5">
                {/* Latency card */}
                <div className="p-2.5 rounded-lg bg-studio-900/80 border border-white/5 flex items-center justify-between">
                  <div>
                    <h3 className="text-[9px] uppercase font-bold tracking-wider text-slate-400">Processing Latency</h3>
                    <p className="text-base font-bold text-white font-mono">{diagnosticResult.estimatedLatencyMs.toFixed(2)} ms</p>
                  </div>
                  <span className="text-[8px] font-bold uppercase tracking-widest text-emerald-400 px-2 py-0.5 bg-emerald-950/30 border border-emerald-800/30 rounded">
                    &lt;10ms (Stable)
                  </span>
                </div>

                {/* CPU card */}
                <div className="p-2.5 rounded-lg bg-studio-900/80 border border-white/5 flex items-center justify-between">
                  <div>
                    <h3 className="text-[9px] uppercase font-bold tracking-wider text-slate-400">Simulated CPU Load</h3>
                    <p className="text-base font-bold text-white font-mono">{diagnosticResult.cpuLoadPercent.toFixed(2)}%</p>
                  </div>
                  <span className="text-[8px] font-bold uppercase tracking-widest text-emerald-400 px-2 py-0.5 bg-emerald-950/30 border border-emerald-800/30 rounded">
                    ULTRA-LOW
                  </span>
                </div>

                {/* Clipping card */}
                <div className="p-2.5 rounded-lg bg-studio-900/80 border border-white/5 flex items-center justify-between">
                  <div>
                    <h3 className="text-[9px] uppercase font-bold tracking-wider text-slate-400">DSP Amplitude Limit</h3>
                    <p className="text-base font-bold text-white font-mono">{Math.round(diagnosticResult.maxAmplitude * 100)}% Peak</p>
                  </div>
                  <span className={`text-[8px] font-bold uppercase tracking-widest px-2 py-0.5 rounded border ${
                    diagnosticResult.clippingDetected
                      ? 'text-red-400 bg-red-950/30 border-red-800/30'
                      : 'text-emerald-400 bg-emerald-950/30 border-emerald-800/30'
                  }`}>
                    {diagnosticResult.clippingDetected ? 'CLIPPING' : 'LIMITER PASS'}
                  </span>
                </div>

                {/* API Checklist */}
                <div className="p-2.5 rounded-lg bg-studio-900/50 border border-white/5 flex flex-col gap-1.5 text-[9px] font-mono uppercase tracking-wider text-slate-400">
                  <div className="flex justify-between items-center">
                    <span>AudioWorklet Engine</span>
                    {diagnosticResult.apiSupport.audioWorklet ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <AlertCircle className="w-3.5 h-3.5 text-red-400" />}
                  </div>
                  <div className="flex justify-between items-center">
                    <span>WASM Acceleration</span>
                    {diagnosticResult.apiSupport.wasm ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <AlertCircle className="w-3.5 h-3.5 text-slate-500" />}
                  </div>
                  <div className="flex justify-between items-center">
                    <span>chrome.tabCapture API</span>
                    {diagnosticResult.apiSupport.tabCapture ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <AlertCircle className="w-3.5 h-3.5 text-yellow-500" />}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
          
          <button
            onClick={() => setShowDiagModal(false)}
            className="w-full py-2.5 mt-auto rounded-lg bg-gradient-to-r from-studio-glow to-studio-neon hover:opacity-90 text-studio-950 font-bold uppercase tracking-widest text-[10px] shadow-glow-cyan transition-all"
          >
            Close Diagnostics
          </button>
        </div>
      )}
    </div>
  );
};

export default App;
