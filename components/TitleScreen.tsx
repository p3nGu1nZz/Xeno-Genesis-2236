
import React, { useEffect, useState } from 'react';
import { Cpu, Globe, Zap, Volume2, VolumeX } from 'lucide-react';

interface TitleScreenProps {
  onStart: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({ onStart, isMuted, onToggleMute }) => {
  const [glitch, setGlitch] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setGlitch(true);
      setTimeout(() => setGlitch(false), 150);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 bg-[#020408] flex flex-col items-center justify-center overflow-hidden z-[100]">
      {/* Centered Branching Background Animation */}
      <div 
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
            background: `
                radial-gradient(circle at center, transparent 0%, #000 70%),
                repeating-radial-gradient(circle at center, rgba(0, 243, 255, 0.15) 0px, transparent 2px, transparent 50px),
                linear-gradient(0deg, transparent 49%, rgba(255, 0, 255, 0.05) 50%, transparent 51%),
                linear-gradient(90deg, transparent 49%, rgba(0, 243, 255, 0.05) 50%, transparent 51%)
            `,
            backgroundSize: '200% 200%, 100px 100px, 100% 100%, 100% 100%',
            animation: 'pulse-expand 20s linear infinite',
        }}
      >
          <style>{`
            @keyframes pulse-expand {
                0% { background-position: center, center, center, center; transform: scale(1); }
                50% { background-position: center, center, center, center; transform: scale(1.1); }
                100% { background-position: center, center, center, center; transform: scale(1); }
            }
          `}</style>
      </div>
      
      {/* Decorative center burst */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-r from-neon-cyan/5 via-purple-500/5 to-neon-magenta/5 rounded-full blur-3xl animate-pulse" />

      {/* Sound Toggle */}
      <button 
        onClick={onToggleMute}
        className="absolute top-8 right-8 z-50 text-neon-cyan hover:text-white transition-colors p-2 bg-black/50 rounded-full border border-neon-cyan/30"
        title={isMuted ? "Unmute Audio" : "Mute Audio"}
      >
        {isMuted ? <VolumeX size={24} /> : <Volume2 size={24} />}
      </button>

      <div className="relative z-10 text-center space-y-10 p-12 bg-black/60 backdrop-blur-md border border-slate-800/80 rounded-sm shadow-[0_0_150px_rgba(0,243,255,0.15)] max-w-4xl w-full mx-4">
        
        {/* Header Status Bar */}
        <div className="flex items-center justify-between w-full border-b border-white/10 pb-4 mb-4 text-[10px] tracking-[0.3em] font-mono text-neon-cyan/80">
            <span className="flex items-center gap-2"><Globe size={12} /> NET.UNIVERSE.SIM</span>
            <span className="animate-pulse">STATUS: ONLINE</span>
            <span className="flex items-center gap-2">SECURE_CONNECTION <Zap size={12} /></span>
        </div>

        <div className="relative py-4">
            {/* Cyberpunk Glitch Title */}
            <h1 className={`text-7xl md:text-9xl font-display font-black text-transparent bg-clip-text bg-gradient-to-b from-white via-neon-cyan to-neon-magenta tracking-tighter ${glitch ? 'translate-x-1 skew-x-12 opacity-90' : ''} transition-all duration-75`}>
            XENO
            <br />
            GENESIS
            </h1>
            
            {/* Holographic Overlays */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full opacity-30 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] mix-blend-overlay pointer-events-none"></div>
            
            <div className="absolute -top-6 -right-2 md:right-10 text-white/90 bg-neon-magenta px-3 py-1 text-xs font-bold font-mono rotate-3 skew-x-[-10deg] shadow-[0_0_15px_#ff00ff]">
                BUILD 2236.4
            </div>
        </div>

        <div className="space-y-4">
            <div className="h-px w-32 mx-auto bg-gradient-to-r from-transparent via-neon-cyan to-transparent"></div>
            <div className="text-slate-300 font-mono text-sm md:text-base max-w-lg mx-auto leading-relaxed tracking-wide">
                <span className="text-neon-cyan">>></span> EVOLUTIONARY_PROTOCOL_INITIATED<br/>
                <span className="text-slate-500">Simulating soft-body dynamics and neural topology in fluidic space. Observe the emergence of synthetic life.</span>
            </div>
            <div className="h-px w-32 mx-auto bg-gradient-to-r from-transparent via-neon-cyan to-transparent"></div>
        </div>

        <button 
            onClick={onStart}
            className="group relative inline-flex items-center justify-center px-10 py-5 bg-black border border-neon-cyan text-neon-cyan font-display font-bold text-xl tracking-widest overflow-hidden hover:text-black transition-colors duration-300 mt-6"
        >
            <span className="absolute inset-0 w-full h-full bg-neon-cyan transform -translate-x-full group-hover:translate-x-0 transition-transform duration-300 ease-out"></span>
            <span className="relative flex items-center gap-4 z-10">
                <Cpu className="animate-[spin_4s_linear_infinite]" size={24} />
                INITIALIZE_SYSTEM
            </span>
            
            {/* Button Glitch Effect Elements */}
            <div className="absolute top-0 right-0 w-2 h-2 bg-white opacity-0 group-hover:opacity-100 transition-opacity delay-100"></div>
            <div className="absolute bottom-0 left-0 w-2 h-2 bg-white opacity-0 group-hover:opacity-100 transition-opacity delay-100"></div>
        </button>

        <div className="text-[10px] text-slate-600 font-mono mt-8 uppercase tracking-widest">
            Tufts University // Levin Lab // Neural Link Est. 4.2.1
        </div>
      </div>
    </div>
  );
};
