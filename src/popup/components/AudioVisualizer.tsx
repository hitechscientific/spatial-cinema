import React, { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
  spectrum: number[]; // 128 elements (fftSize 256)
  levels: number[]; // 8 elements: L, R, C, LFE, Ls, Rs, Lb, Rb
  isEnabled: boolean;
}

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ spectrum, levels, isEnabled }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);

  // VU Channel names
  const channels = ['L', 'R', 'C', 'SUB', 'SL', 'SR', 'BL', 'BR'];
  
  // Smooth peak decay tracking
  const peaksRef = useRef<number[]>(new Array(8).fill(0));
  const peakHoldFramesRef = useRef<number[]>(new Array(8).fill(0));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      // 1. Setup dimensions
      const width = canvas.width;
      const height = canvas.height;

      // 2. Clear canvas with dark gradient
      ctx.fillStyle = '#0a0b16';
      ctx.fillRect(0, 0, width, height);

      if (!isEnabled) {
        // Draw idle message when bypassed
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.font = '10px JetBrains Mono';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('WAITING FOR ACTIVE AUDIO STREAM...', width / 2, height / 2);
        animationRef.current = requestAnimationFrame(render);
        return;
      }

      // 3. Draw Spectrum Wave / Bars
      const barWidth = (width / 40) - 1;
      const spectrumLen = Math.min(spectrum.length, 40); // display first 40 bands (up to ~8kHz)
      
      for (let i = 0; i < spectrumLen; i++) {
        const value = spectrum[i] || 0;
        const percent = value / 255;
        const barHeight = percent * (height - 15);
        const x = i * (barWidth + 1);
        const y = height - barHeight;

        // Gradient for bars (Cyan to Purple)
        const grad = ctx.createLinearGradient(x, y, x, height);
        grad.addColorStop(0, '#00f2fe');
        grad.addColorStop(0.5, '#9b51e0');
        grad.addColorStop(1, 'rgba(18, 19, 36, 0.2)');

        ctx.fillStyle = grad;
        ctx.fillRect(x, y, barWidth, barHeight);
      }

      // 4. Draw Bass Energy Pulsing Core
      // Sum first 4 bands (sub-bass up to ~150Hz)
      const bassSum = (spectrum[0] || 0) + (spectrum[1] || 0) + (spectrum[2] || 0) + (spectrum[3] || 0);
      const bassEnergy = bassSum / (255 * 4); // 0.0 to 1.0

      if (bassEnergy > 0.15) {
        ctx.beginPath();
        ctx.arc(width - 25, 25, 8 + bassEnergy * 10, 0, 2 * Math.PI);
        const bassGrad = ctx.createRadialGradient(width - 25, 25, 1, width - 25, 25, 8 + bassEnergy * 10);
        bassGrad.addColorStop(0, 'rgba(0, 242, 254, 0.6)');
        bassGrad.addColorStop(1, 'rgba(255, 0, 122, 0)');
        ctx.fillStyle = bassGrad;
        ctx.fill();
      }

      animationRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationRef.current);
    };
  }, [spectrum, isEnabled]);

  // VU Levels metering handling (independent decay in React rendering)
  // Decay peak holders
  useEffect(() => {
    const interval = setInterval(() => {
      const peaks = [...peaksRef.current];
      const holds = [...peakHoldFramesRef.current];

      for (let i = 0; i < 8; i++) {
        const val = levels[i] || 0;

        // Peak holder logic
        if (val >= peaks[i]) {
          peaks[i] = val;
          holds[i] = 12; // hold for 12 frames (approx 200ms)
        } else {
          if (holds[i] > 0) {
            holds[i]--;
          } else {
            peaks[i] = Math.max(0, peaks[i] - 0.07); // decay
          }
        }
      }

      peaksRef.current = peaks;
      peakHoldFramesRef.current = holds;
    }, 16); // ~60fps ticks

    return () => clearInterval(interval);
  }, [levels]);

  return (
    <div className="w-full flex flex-col gap-3">
      {/* 1. Canvas Spectrum Display */}
      <div className="relative w-full h-[65px] rounded-lg overflow-hidden border border-white/5 bg-studio-900">
        <canvas 
          ref={canvasRef} 
          width={350} 
          height={65} 
          className="w-full h-full block"
        />
        {/* Glow overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-studio-900/10 via-transparent to-transparent pointer-events-none" />
      </div>

      {/* 2. VU meters for the 8 surround channels */}
      <div className="grid grid-cols-8 gap-2 bg-studio-800/40 p-2.5 rounded-lg border border-white/5">
        {channels.map((ch, idx) => {
          const val = levels[idx] || 0;
          const peak = peaksRef.current[idx] || 0;

          // Height of active indicator
          const heightPct = isEnabled ? `${Math.round(val * 100)}%` : '0%';
          const peakBottomPct = isEnabled ? `${Math.round(peak * 100)}%` : '0%';

          return (
            <div key={ch} className="flex flex-col items-center gap-1.5 h-[90px]">
              {/* VU Meter Slot */}
              <div className="relative w-2 bg-studio-950 rounded-full flex-grow overflow-hidden border border-white/5">
                {/* Active Level fill */}
                <div 
                  className="absolute bottom-0 left-0 right-0 rounded-full transition-all duration-75"
                  style={{ 
                    height: heightPct,
                    background: ch === 'SUB' 
                      ? 'linear-gradient(to top, #00ff88, #00f2fe)' 
                      : 'linear-gradient(to top, #9b51e0, #ff007a, #00f2fe)'
                  }}
                />
                
                {/* Peak Hold dot */}
                {isEnabled && peak > 0.02 && (
                  <div 
                    className="absolute left-0 right-0 h-1 bg-white shadow-sm transition-all duration-75 rounded-full"
                    style={{ bottom: `calc(${peakBottomPct} - 2px)` }}
                  />
                )}
              </div>

              {/* Label */}
              <span className="text-[8px] font-mono font-bold tracking-wider text-slate-400">
                {ch}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
