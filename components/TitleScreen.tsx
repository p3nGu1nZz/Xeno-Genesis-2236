import React, { useEffect, useState } from 'react';
import { Play, Cpu, Globe } from 'lucide-react';

interface TitleScreenProps {
  onStart: () => void;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({ onStart }) => {
  const [glitch, setGlitch] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setGlitch(true);
      setTimeout(() => setGlitch(false), 200);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 bg-deep-space flex flex-col items-center justify-center overflow-hidden z-[100]">
      {/* Background Grid */}
      <div 
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
            backgroundImage: `linear-gradient(rgba(0, 243, 255, 0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 243, 255, 0.1) 1px, transparent 1px)`,
            backgroundSize: '40px 40px',
            transform: 'perspective(500px) rotateX(60deg) translateY(-100px) scale(2)'
        }}
      />

      <div className="relative z-10 text-center space-y-8 p-10 bg-black/40 backdrop-blur-sm border border-slate-800 rounded-2xl shadow-[0_0_100px_rgba(0,243,255,0.1)]">
        
        {/* S.U.T.I Header */}
        <div className="flex items-center justify-center gap-3 text-neon-cyan/60 tracking-[0.5em] text-xs font-mono animate-pulse">
            <Globe size={14} /> S.U.T.I. ARCHIVES // CLASSIFIED
        </div>

        <div className="relative">
            <h1 className={`text-7xl md:text-9xl font-display font-black text-transparent bg-clip-text bg-gradient-to-br from-white via-neon-cyan to-blue-900 ${glitch ? 'translate-x-1 opacity-80' : ''}`}>
            XENO
            <br />
            GENESIS
            </h1>
            <div className="absolute -top-4 -right-4 text-neon-magenta font-mono text-xl rotate-12 border border-neon-magenta px-2 rounded">
                2236 AD
            </div>
        </div>

        <div className="text-slate-400 font-mono text-sm max-w-md mx-auto leading-relaxed">
            Search for Ultra-Terrestrial Intelligence. 
            <br/>
            Simulating biological evolution of synthetic agential materials in fluidic space.
        </div>

        <button 
            onClick={onStart}
            className="group relative px-8 py-4 bg-neon-cyan/10 hover:bg-neon-cyan/20 border border-neon-cyan text-neon-cyan font-display font-bold text-xl tracking-widest rounded transition-all duration-300 overflow-hidden"
        >
            <span className="absolute inset-0 w-full h-full bg-neon-cyan/20 transform -translate-x-full group-hover:translate-x-0 transition-transform duration-300"></span>
            <span className="relative flex items-center gap-3">
                <Cpu className="animate-spin-slow" />
                INITIALIZE SIMULATION
            </span>
        </button>

        <div className="text-[10px] text-slate-600 font-mono mt-8">
            VER 4.2.1 // TUFTS UNIVERSITY NEURAL LINK ESTABLISHED
        </div>
      </div>
    </div>
  );
};