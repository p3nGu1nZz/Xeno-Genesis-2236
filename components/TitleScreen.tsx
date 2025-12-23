
import React, { useEffect, useState, useRef } from 'react';
import { Cpu, Globe, Zap, Volume2, VolumeX } from 'lucide-react';

interface TitleScreenProps {
  onStart: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({ onStart, isMuted, onToggleMute }) => {
  const [glitch, setGlitch] = useState(false);
  
  // Refs for direct DOM manipulation to prevent render lag
  const cursorVRef = useRef<HTMLDivElement>(null);
  const cursorHRef = useRef<HTMLDivElement>(null);
  const cursorCenterRef = useRef<HTMLDivElement>(null);
  const cursorCoordsRef = useRef<HTMLDivElement>(null);
  
  const cardRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLDivElement>(null);
  const burstRef = useRef<HTMLDivElement>(null);
  const badgeRef = useRef<HTMLDivElement>(null);

  // Random Text Glitch
  useEffect(() => {
    const interval = setInterval(() => {
      setGlitch(true);
      setTimeout(() => setGlitch(false), 150);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  // Mouse Tracking & Animation Loop
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
        const { clientX: x, clientY: y } = e;
        const { innerWidth, innerHeight } = window;
        
        // 1. Update Cursor (Zero Latency)
        if (cursorVRef.current) cursorVRef.current.style.transform = `translateX(${x}px)`;
        if (cursorHRef.current) cursorHRef.current.style.transform = `translateY(${y}px)`;
        if (cursorCenterRef.current) cursorCenterRef.current.style.transform = `translate(${x}px, ${y}px)`;
        if (cursorCoordsRef.current) {
            cursorCoordsRef.current.style.transform = `translate(${x + 20}px, ${y + 20}px)`; 
            cursorCoordsRef.current.innerText = `X:${x.toString().padStart(4, '0')}\nY:${y.toString().padStart(4, '0')}`;
        }

        // 2. Update Parallax Elements (Smooth direct updates)
        const normX = (x / innerWidth) * 2 - 1; // -1 to 1
        const normY = (y / innerHeight) * 2 - 1;

        if (cardRef.current) {
            cardRef.current.style.transform = `perspective(1000px) rotateX(${normY * -3}deg) rotateY(${normX * 3}deg) scale(1.02)`;
        }
        
        if (bgRef.current) {
            bgRef.current.style.transform = `translate(${normX * -20}px, ${normY * -20}px)`;
        }

        if (burstRef.current) {
            burstRef.current.style.transform = `translate(calc(-50% + ${normX * 30}px), calc(-50% + ${normY * 30}px))`;
        }
        
        if (badgeRef.current) {
             badgeRef.current.style.transform = `translate(${normX * 5}px, ${normY * 5}px) rotate(3deg)`;
        }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <div 
        className="fixed inset-0 bg-[#020408] flex flex-col items-center justify-center overflow-hidden z-[100] cursor-none"
    >
      {/* 1. Dynamic Background Grid (Parallax) */}
      <div 
        ref={bgRef}
        className="absolute inset-0 opacity-20 pointer-events-none will-change-transform"
        style={{
            background: `
                radial-gradient(circle at center, transparent 0%, #000 90%),
                linear-gradient(0deg, transparent 24%, rgba(0, 243, 255, 0.05) 25%, transparent 26%),
                linear-gradient(90deg, transparent 24%, rgba(0, 243, 255, 0.05) 25%, transparent 26%)
            `,
            backgroundSize: '100% 100%, 40px 40px, 40px 40px',
        }}
      />
      
      {/* 2. Decorative Center Burst */}
      <div 
        ref={burstRef}
        className="absolute w-[800px] h-[800px] bg-gradient-to-r from-neon-cyan/5 via-purple-500/5 to-neon-magenta/5 rounded-full blur-3xl will-change-transform" 
        style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
      />

      {/* 3. Mouse Crosshairs (The "Leet" Cursor) */}
      <div className="fixed inset-0 pointer-events-none z-[110] opacity-40 mix-blend-screen">
          {/* Vertical Line */}
          <div ref={cursorVRef} className="absolute top-0 left-0 w-px h-full bg-neon-cyan/30 will-change-transform" />
          {/* Horizontal Line */}
          <div ref={cursorHRef} className="absolute top-0 left-0 h-px w-full bg-neon-cyan/30 will-change-transform" />
          {/* Center Target */}
          <div 
            ref={cursorCenterRef}
            className="absolute top-0 left-0 -ml-2 -mt-2 w-4 h-4 border border-neon-cyan rounded-full flex items-center justify-center will-change-transform"
          >
             <div className="w-0.5 h-0.5 bg-white rounded-full"></div>
          </div>
          {/* Coordinates */}
          <div 
            ref={cursorCoordsRef}
            className="absolute top-0 left-0 text-[8px] font-mono text-neon-cyan whitespace-pre will-change-transform"
          />
      </div>

      {/* Sound Toggle */}
      <button 
        onClick={onToggleMute}
        className="absolute top-8 right-8 z-50 text-neon-cyan hover:text-white transition-colors p-2 bg-black/50 rounded-full border border-neon-cyan/30 cursor-pointer"
        title={isMuted ? "Unmute Audio" : "Mute Audio"}
      >
        {isMuted ? <VolumeX size={24} /> : <Volume2 size={24} />}
      </button>

      {/* Main Holographic Card */}
      <div 
        ref={cardRef}
        className="relative z-10 text-center space-y-10 p-12 bg-black/40 backdrop-blur-sm border border-slate-800/80 rounded-sm shadow-[0_0_150px_rgba(0,243,255,0.15)] max-w-4xl w-full mx-4 will-change-transform"
      >
        
        {/* Header Status Bar */}
        <div className="flex items-center justify-between w-full border-b border-white/10 pb-4 mb-4 text-[10px] tracking-[0.3em] font-mono text-neon-cyan/80 select-none">
            <span className="flex items-center gap-2"><Globe size={12} /> NET.UNIVERSE.SIM</span>
            <span className="animate-pulse">STATUS: ONLINE</span>
            <span className="flex items-center gap-2">SECURE_CONNECTION <Zap size={12} /></span>
        </div>

        <div className="relative py-4 select-none">
            {/* Cyberpunk Glitch Title */}
            <h1 className={`text-7xl md:text-9xl font-display font-black text-transparent bg-clip-text bg-gradient-to-b from-white via-neon-cyan to-neon-magenta tracking-tighter ${glitch ? 'translate-x-1 skew-x-12 opacity-90' : ''} transition-all duration-75`}>
            XENO
            <br />
            GENESIS
            </h1>
            
            {/* Holographic Overlays */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full opacity-30 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] mix-blend-overlay pointer-events-none"></div>
            
            <div 
                ref={badgeRef}
                className="absolute -top-6 -right-2 md:right-10 text-white/90 bg-neon-magenta px-3 py-1 text-xs font-bold font-mono rotate-3 skew-x-[-10deg] shadow-[0_0_15px_#ff00ff] will-change-transform"
            >
                BUILD 2236.4
            </div>
        </div>

        <div className="space-y-4">
            <div className="h-px w-32 mx-auto bg-gradient-to-r from-transparent via-neon-cyan to-transparent"></div>
            <div className="text-slate-300 font-mono text-sm md:text-base max-w-lg mx-auto leading-relaxed tracking-wide select-none">
                <span className="text-neon-cyan">>></span> EVOLUTIONARY_PROTOCOL_INITIATED<br/>
                <span className="text-slate-500">Simulating soft-body dynamics and neural topology in fluidic space. Observe the emergence of synthetic life.</span>
            </div>
            <div className="h-px w-32 mx-auto bg-gradient-to-r from-transparent via-neon-cyan to-transparent"></div>
        </div>

        <button 
            onClick={onStart}
            className="group relative inline-flex items-center justify-center px-10 py-5 bg-black border border-neon-cyan text-neon-cyan font-display font-bold text-xl tracking-widest overflow-hidden hover:text-black transition-colors duration-300 mt-6 cursor-pointer"
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

        <div className="text-[10px] text-slate-600 font-mono mt-8 uppercase tracking-widest select-none">
            Tufts University // Levin Lab // Neural Link Est. 4.2.1
        </div>
      </div>
    </div>
  );
};
