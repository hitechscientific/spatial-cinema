import React, { useEffect, useState } from 'react';
import { useStore, PRESETS } from '../utils/store';
import { 
  Layers,
  Ear,
  Radio,
  ExternalLink,
  Cpu
} from 'lucide-react';

const App: React.FC = () => {
  const {
    isEnabled,
    preset,
    headphoneProfile,
    activeTabTitle,
    isAIEnabled,
    initStore,
    setSetting,
    applyPreset,
    toggleEnabled,
    disconnectCapture
  } = useStore();

  const [levels, setLevels] = useState<number[]>(new Array(10).fill(0));
  const [detectedAIClass, setDetectedAIClass] = useState<string>('flat');

  // Initialize store state
  useEffect(() => {
    initStore();
  }, [initStore]);

  // Audio level and AI class receiver for mini visualizer
  useEffect(() => {
    const hasChromeRuntime = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage;
    
    if (!hasChromeRuntime) {
      if (!isEnabled) {
        setLevels(new Array(10).fill(0));
        setDetectedAIClass('flat');
        return;
      }

      const mockInterval = setInterval(() => {
        const mockLevels = new Array(10).fill(0).map((_, idx) => {
          const base = idx === 3 ? 0.3 : 0.15;
          return base + Math.random() * 0.45;
        });
        setLevels(mockLevels);

        const classes = ['dialogue', 'music', 'action', 'ambient'];
        const classIdx = Math.floor(Date.now() / 4000) % 4;
        setDetectedAIClass(isAIEnabled ? classes[classIdx] : 'flat');
      }, 80);

      return () => clearInterval(mockInterval);
    }

    const messageListener = (message: any) => {
      if (message.type === 'LEVEL_METERS_UI') {
        setLevels(message.levels);
        if (message.aiClass) {
          setDetectedAIClass(message.aiClass);
        }
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);
    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, [isEnabled, isAIEnabled]);

  const launchDashboard = () => {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.create({ url: chrome.runtime.getURL('src/dashboard/index.html') });
    } else {
      alert("Opening 3D Dashboard Control Center (Local Simulation Mode)");
    }
  };

  const channelNames = ["L", "R", "C", "LFE", "Ls", "Rs", "Lb", "Rb", "Lh", "Rh"];

  return (
    <div className="w-[360px] h-[480px] bg-[#06060c] flex flex-col p-4 select-none relative font-sans text-slate-200 overflow-hidden">
      
      {/* 1. HEADER TITLE BAR */}
      <header className="flex items-center justify-between pb-3 border-b border-slate-900 z-10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-amber-400 to-amber-600 flex items-center justify-center shadow-lg">
            <Radio className="w-5 h-5 text-slate-950 stroke-[2.5]" />
          </div>
          <div>
            <h1 className="text-xs font-bold uppercase tracking-wider bg-gradient-to-r from-amber-300 to-slate-300 bg-clip-text text-transparent">
              Aether Spatial
            </h1>
            <div className="flex items-center gap-1 mt-0.5">
              <p className="text-[9px] text-slate-400 font-mono max-w-[110px] truncate" title={activeTabTitle}>
                {activeTabTitle || 'Inactive tab'}
              </p>
              {activeTabTitle && activeTabTitle !== 'No active audio tab' && (
                <button
                  onClick={disconnectCapture}
                  className="text-[8px] text-rose-500 hover:text-rose-400 underline font-semibold transition-colors focus:outline-none"
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
          className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all duration-300 flex items-center gap-1.5 border ${
            isEnabled 
              ? 'bg-amber-400 text-slate-950 border-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.3)]'
              : 'bg-transparent text-slate-400 border-slate-800 hover:text-white hover:border-slate-700'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${isEnabled ? 'bg-slate-950 animate-pulse' : 'bg-slate-500'}`} />
          {isEnabled ? 'ACTIVE' : 'BYPASS'}
        </button>
      </header>

      {/* 2. CORE INTERFACE CONTAINER */}
      <div className="flex-1 flex flex-col justify-between py-3 overflow-hidden">

        {/* Mini VU Grid */}
        <div className="p-3 rounded-xl bg-slate-950 border border-slate-900">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <Cpu className="w-3 h-3 text-amber-400" />
              Discrete VU Meters
            </span>
            <span className="text-[9px] font-mono font-bold text-amber-400 px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 uppercase">
              AI: {detectedAIClass}
            </span>
          </div>

          <div className="grid grid-cols-10 gap-1 items-end h-[50px]">
            {levels.map((lvl, i) => {
              const heightPercent = Math.min(100, Math.floor(lvl * 100));
              return (
                <div key={i} className="h-full flex flex-col justify-end items-center">
                  <div className="w-full bg-slate-900/60 rounded-t overflow-hidden flex flex-col justify-end h-full">
                    <div 
                      className="w-full bg-gradient-to-t from-amber-600 to-amber-300 transition-all duration-75"
                      style={{ height: `${heightPercent}%` }}
                    />
                  </div>
                  <span className="text-[6.5px] text-slate-500 font-mono mt-0.5 scale-90">{channelNames[i]}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Preset Selector */}
        <div className="space-y-1.5">
          <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold flex items-center gap-1">
            <Layers className="w-3 h-3 text-amber-400" />
            Quick Preset
          </label>
          <select
            value={preset}
            onChange={(e) => applyPreset(e.target.value)}
            className="w-full bg-slate-950 border border-slate-900 rounded-xl px-3 py-2 text-xs text-slate-300 font-semibold focus:outline-none focus:border-amber-500/50"
          >
            {Object.entries(PRESETS).map(([key, def]) => (
              <option key={key} value={key}>{def.name}</option>
            ))}
          </select>
        </div>

        {/* Headphone Profiles */}
        <div className="space-y-1.5">
          <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold flex items-center gap-1">
            <Ear className="w-3 h-3 text-amber-400" />
            Headphone Correction
          </label>
          <select
            value={headphoneProfile}
            onChange={(e) => setSetting('headphoneProfile', e.target.value as any)}
            className="w-full bg-slate-950 border border-slate-900 rounded-xl px-3 py-2 text-xs text-slate-300 font-semibold focus:outline-none focus:border-amber-500/50"
          >
            <option value="none">Bypass (Flat Calibration)</option>
            <option value="open_back">Open-Back Headphone Boost</option>
            <option value="closed_back">Closed-Back Reference Damping</option>
            <option value="gaming_headset">Gaming Headset Equalization</option>
            <option value="earbuds">In-Ear Monitors (IEMs)</option>
          </select>
        </div>

        {/* Dashboard Launcher Button */}
        <button
          onClick={launchDashboard}
          className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs uppercase tracking-widest shadow-[0_4px_15px_rgba(245,158,11,0.25)] flex items-center justify-center gap-2 hover:shadow-[0_4px_20px_rgba(245,158,11,0.35)] transition-all duration-300 mt-2"
        >
          <span>Launch 3D Control Center</span>
          <ExternalLink className="w-3.5 h-3.5 stroke-[2.5]" />
        </button>

      </div>

      {/* FOOTER STATS */}
      <footer className="flex items-center justify-between pt-2 border-t border-slate-900/60 text-[8px] font-mono text-slate-500">
        <span>AETHER ENGINE V3.0</span>
        <span>LATENCY: BINAURAL DIRECT</span>
      </footer>

    </div>
  );
};

export default App;
