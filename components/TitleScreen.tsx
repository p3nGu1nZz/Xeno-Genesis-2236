
import React, { useEffect, useState } from 'react';
import { Play, Cpu, Globe, Binary, Terminal } from 'lucide-react';

interface TitleScreenProps {
  onStart: () => void;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({ onStart }) => {
  const [glitch, setGlitch] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setGlitch(true);
      setTimeout(() => setGlitch(false), 150);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 bg-[#050b14] flex flex-col items-center justify-center overflow-hidden z-[100] font-mono selection:bg-neon-magenta selection:text-white">
      
      {/* --- CYBERPUNK BACKGROUND LAYERS --- */}
      
      {/* 1. Perspective Grid (Floor) */}
      <div className="absolute inset-0 pointer-events-none perspective-[1000px]">
        <div className="absolute inset-0 bg-[linear-gradient(transparent_0%,rgba(0,243,255,0.1)_1px,transparent_2px)] bg-[size:100%_40px] animate-[gridFlow_2s_linear_infinite]" 
             style={{ transform: 'rotateX(60deg) scale(2) translateY(50%)' }}></div>
        <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_0%,rgba(0,243,255,0.05)_1px,transparent_2px)] bg-[size:40px_100%]" 
             style={{ transform: 'rotateX(60deg) scale(2)' }}></div>
      </div>

      {/* 2. Data Rain / Hex Overlay */}
      <div className="absolute inset-0 opacity-10 pointer-events-none"
           style={{
               backgroundImage: `radial-gradient(circle at 50% 50%, transparent 0%, #050b14 90%), repeating-linear-gradient(0deg, transparent, transparent 2px, #00f3ff 2px, #00f3ff 3px)`,
               backgroundSize: '100% 100%, 100% 6px'
           }}
      ></div>

      {/* 3. Floating Particles/Code */}
      <div className="absolute top-10 left-10 text-neon-cyan/20 text-[10px] flex flex-col gap-1">
          {Array.from({length: 10}).map((_, i) => (
              <div key={i} className="animate-pulse" style={{ animationDelay: `${i*0.2}s` }}>
                  0x{Math.random().toString(16).substr(2,8).toUpperCase()} :: MEM_ALLOC_{i}
              </div>
          ))}
      </div>
      <div className="absolute bottom-10 right-10 text-neon-magenta/20 text-[10px] text-right flex flex-col gap-1">
           {Array.from({length: 8}).map((_, i) => (
              <div key={i} className="animate-pulse" style={{ animationDelay: `${i*0.3}s` }}>
                  Process::{Math.random().toString(36).substr(2,6).toUpperCase()} [RUNNING]
              </div>
          ))}
      </div>

      {/* --- MAIN CONTENT CARD --- */}
      <div className="relative z-10 w-full max-w-4xl p-10 flex flex-col items-center">
        
        {/* Top Bar Decoration */}
        <div className="w-full flex justify-between items-center mb-12 border-b border-neon-cyan/30 pb-2 text-neon-cyan/60 tracking-[0.3em] text-[10px] font-bold">
             <div className="flex items-center gap-2">
                 <Terminal size={12} />
                 SYS.ROOT.USER
             </div>
             <div className="animate-pulse">NET.LINK: SECURE</div>
        </div>

        {/* LOGO AREA */}
        <div className="relative mb-8 group">
            {/* Glitch Shadow layers */}
            <h1 className={`text-8xl md:text-9xl font-display font-black text-transparent bg-clip-text bg-gradient-to-b from-white via-slate-200 to-slate-500 relative z-20 ${glitch ? 'translate-x-1 skew-x-12' : ''}`}>
                XENO
            </h1>
            <h1 className={`text-8xl md:text-9xl font-display font-black text-transparent bg-clip-text bg-gradient-to-b from-neon-cyan via-white to-neon-magenta absolute top-0 left-0 z-10 opacity-50 mix-blend-screen translate-x-[2px] ${glitch ? '-translate-x-2' : ''}`}>
                XENO
            </h1>
            
            <h1 className={`text-8xl md:text-9xl font-display font-black text-transparent bg-clip-text bg-white relative z-20 mt-[-20px] ${glitch ? '-translate-x-1 skew-x-[-12deg]' : ''}`}>
                GENESIS
            </h1>
             <h1 className={`text-8xl md:text-9xl font-display font-black text-neon-magenta absolute top-[100px] left-0 z-10 opacity-30 mix-blend-screen translate-x-[-2px] ${glitch ? 'translate-x-2' : ''}`}>
                GENESIS
            </h1>

            <div className="absolute -right-12 top-0 rotate-90 origin-bottom-left flex gap-4 text-xs font-mono text-neon-cyan opacity-60">
                <span>EST. 2236</span>
                <span>//</span>
                <span>EVOLUTION_SIM</span>
            </div>
        </div>

        {/* Subtitle */}
        <div className="text-slate-400 font-mono text-sm max-w-md text-center leading-relaxed mb-12 border-l-2 border-neon-cyan/50 pl-4 bg-black/20 backdrop-blur-sm py-2">
            Synthetic agential materials evolving in fluidic space.
            <br/>
            Observe. Adapt. Transcend.
        </div>

        {/* CTA Button */}
        <button 
            onClick={onStart}
            className="group relative px-12 py-5 bg-neon-cyan/5 hover:bg-neon-cyan/10 border border-neon-cyan/50 text-neon-cyan font-display font-bold text-xl tracking-[0.2em] clip-path-polygon transition-all duration-300 hover:shadow-[0_0_30px_rgba(0,243,255,0.3)] hover:border-neon-cyan"
            style={{ clipPath: 'polygon(10% 0, 100% 0, 100% 70%, 90% 100%, 0 100%, 0 30%)' }}
        >
            <div className="absolute inset-0 bg-neon-cyan/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
            <span className="relative flex items-center gap-4">
                <Binary className="animate-pulse" size={20} />
                INITIALIZE_SIM
            </span>
        </button>

        {/* CREDITS FOOTER */}
        <div className="mt-24 w-full flex flex-col items-center gap-1 text-[10px] font-mono text-slate-600 uppercase tracking-wider">
            <div className="flex items-center gap-2">
                <span>Created by Kara Rawson aka p3nGu1nZz</span>
                <span className="text-neon-magenta">•</span>
                <span>Copyright 2026</span>
            </div>
            <div className="opacity-60 flex items-center gap-2">
                <span>Inspired by the work of Dr. Michael Levin</span>
                <span className="text-slate-700">|</span>
                <span>Tufts University</span>
            </div>
        </div>

      </div>
      
      {/* Scanline Vignette */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle,transparent_60%,#000_100%)] z-20"></div>

      <style>{`
        @keyframes gridFlow {
            0% { background-position: 0 0; }
            100% { background-position: 0 40px; }
        }
      `}</style>
    </div>
  );
};
