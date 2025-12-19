
import React, { useEffect, useState, useRef } from 'react';
import { Play, Terminal, Box, Database, Cpu } from 'lucide-react';

interface TitleScreenProps {
  onStart: () => void;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({ onStart }) => {
  const [glitch, setGlitch] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Glitch Timer
  useEffect(() => {
    const interval = setInterval(() => {
      setGlitch(true);
      setTimeout(() => setGlitch(false), 150);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Neural Network Animation Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let w = canvas.width = window.innerWidth;
    let h = canvas.height = window.innerHeight;

    const nodes: {x: number, y: number, vx: number, vy: number}[] = [];
    const NODE_COUNT = 80;
    
    for(let i=0; i<NODE_COUNT; i++) {
        nodes.push({
            x: Math.random() * w,
            y: Math.random() * h,
            vx: (Math.random() - 0.5) * 0.5,
            vy: (Math.random() - 0.5) * 0.5
        });
    }

    let animationId = 0;

    const animate = () => {
        ctx.clearRect(0, 0, w, h);
        
        ctx.fillStyle = '#00f3ff';
        ctx.strokeStyle = 'rgba(0, 243, 255, 0.1)';
        
        for (let i = 0; i < NODE_COUNT; i++) {
            const node = nodes[i];
            node.x += node.vx;
            node.y += node.vy;

            if (node.x < 0 || node.x > w) node.vx *= -1;
            if (node.y < 0 || node.y > h) node.vy *= -1;
            
            ctx.beginPath();
            ctx.arc(node.x, node.y, 2, 0, Math.PI * 2);
            ctx.fill();

            for (let j = i + 1; j < NODE_COUNT; j++) {
                const node2 = nodes[j];
                const dx = node.x - node2.x;
                const dy = node.y - node2.y;
                const dist = dx*dx + dy*dy;
                
                if (dist < 20000) { // Connection distance squared
                    ctx.beginPath();
                    ctx.moveTo(node.x, node.y);
                    ctx.lineTo(node2.x, node2.y);
                    ctx.lineWidth = 1 - (dist / 20000);
                    ctx.stroke();
                }
            }
        }
        animationId = requestAnimationFrame(animate);
    };
    
    animate();

    const handleResize = () => {
        w = canvas.width = window.innerWidth;
        h = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    return () => {
        cancelAnimationFrame(animationId);
        window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-[#02040a] flex flex-col items-center justify-center overflow-hidden z-[100] font-mono select-none perspective-[1200px]">
      
      {/* Background Neural Network Canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 opacity-20 pointer-events-none" />

      {/* Scrolling Code Column (Matrix Effect) */}
      <div className="absolute top-0 left-10 w-48 h-full overflow-hidden opacity-10 pointer-events-none hidden md:block">
          <div className="animate-[scrollDown_20s_linear_infinite] text-[10px] text-neon-cyan font-mono leading-none">
              {Array.from({length: 100}).map((_, i) => (
                  <div key={i} className="whitespace-nowrap">
                      {Math.random().toString(2).substr(2, 32)}
                  </div>
              ))}
          </div>
      </div>
      <div className="absolute top-0 right-10 w-48 h-full overflow-hidden opacity-10 pointer-events-none hidden md:block">
          <div className="animate-[scrollUp_25s_linear_infinite] text-[10px] text-neon-magenta font-mono leading-none text-right">
              {Array.from({length: 100}).map((_, i) => (
                  <div key={i} className="whitespace-nowrap">
                      {Math.random().toString(16).substr(2, 24).toUpperCase()}
                  </div>
              ))}
          </div>
      </div>

      {/* --- 3D CYBERPUNK ENVIRONMENT (Grids) --- */}
      <div className="absolute inset-0 w-full h-full transform-style-3d overflow-hidden pointer-events-none">
          {/* Ceiling Grid */}
          <div className="absolute -top-[50%] -left-[50%] w-[200%] h-[200%] bg-[linear-gradient(rgba(147,51,234,0.08)_1px,transparent_1px),linear_gradient(90deg,rgba(147,51,234,0.08)_1px,transparent_1px)] bg-[size:60px_60px] animate-[gridCeiling_30s_linear_infinite]"
               style={{ transform: 'rotateX(75deg) translateZ(300px)' }}>
          </div>

          {/* Floor Grid (Moving) */}
          <div className="absolute -bottom-[50%] -left-[50%] w-[200%] h-[200%] bg-[linear-gradient(rgba(0,243,255,0.08)_1px,transparent_1px),linear_gradient(90deg,rgba(0,243,255,0.08)_1px,transparent_1px)] bg-[size:60px_60px] animate-[gridFloor_20s_linear_infinite]"
               style={{ transform: 'rotateX(70deg) translateZ(-200px)' }}>
               {/* Fade Horizon */}
               <div className="absolute inset-0 bg-gradient-to-t from-[#02040a] via-transparent to-transparent"></div>
          </div>
      </div>

      {/* --- MAIN CONTENT CARD --- */}
      <div className="relative z-10 w-full max-w-4xl p-10 flex flex-col items-center transform transition-transform hover:scale-105 duration-700">
        
        {/* Top Bar Decoration */}
        <div className="w-full flex justify-between items-center mb-16 border-b border-white/10 pb-2 text-white/40 tracking-[0.5em] text-[10px] font-bold uppercase">
             <div className="flex items-center gap-4">
                 <Terminal size={12} className="text-neon-cyan" />
                 <span>Secure_Connection</span>
             </div>
             <div className="animate-pulse text-neon-magenta">System.Ready</div>
        </div>

        {/* LOGO AREA */}
        <div className="relative mb-8 group perspective-[500px]">
            {/* Main Glitch Text */}
            <h1 className={`text-9xl md:text-[10rem] font-display font-black text-transparent bg-clip-text bg-white tracking-tighter leading-none relative z-20 mix-blend-difference ${glitch ? 'translate-x-1 skew-x-12' : ''}`}>
                XENO
            </h1>
            <h1 className={`text-9xl md:text-[10rem] font-display font-black text-transparent bg-clip-text bg-white tracking-tighter leading-none relative z-20 mix-blend-difference mt-[-30px] ${glitch ? '-translate-x-1 skew-x-[-12deg]' : ''}`}>
                GENESIS
            </h1>
            
            {/* Chromatic Aberration Layers */}
            <h1 className={`text-9xl md:text-[10rem] font-display font-black text-neon-cyan absolute top-0 left-0 z-10 opacity-60 mix-blend-screen translate-x-[4px] translate-y-[-2px] ${glitch ? '-translate-x-4' : ''}`}>
                XENO
            </h1>
             <h1 className={`text-9xl md:text-[10rem] font-display font-black text-neon-magenta absolute top-[110px] left-0 z-10 opacity-60 mix-blend-screen translate-x-[-4px] translate-y-[2px] ${glitch ? 'translate-x-4' : ''}`}>
                GENESIS
            </h1>
        </div>

        {/* Subtitle */}
        <div className="text-slate-400 font-mono text-sm max-w-md text-center leading-relaxed mb-16 relative">
            <span className="absolute -left-4 top-0 text-neon-cyan/50 text-xl">"</span>
            Synthetic agential materials evolving in fluidic space.
            <br/>
            <span className="text-neon-cyan">Observe. Adapt. Transcend.</span>
            <span className="absolute -right-4 bottom-0 text-neon-cyan/50 text-xl">"</span>
        </div>

        {/* CTA Button */}
        <button 
            onClick={onStart}
            className="group relative px-16 py-6 bg-transparent overflow-hidden"
        >
            {/* Button Borders */}
            <div className="absolute inset-0 border border-neon-cyan/30 clip-path-polygon group-hover:border-neon-cyan/80 transition-colors duration-300" 
                 style={{ clipPath: 'polygon(10% 0, 100% 0, 100% 70%, 90% 100%, 0 100%, 0 30%)' }}></div>
            
            {/* Button Fill */}
            <div className="absolute inset-0 bg-neon-cyan/5 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out"
                 style={{ clipPath: 'polygon(10% 0, 100% 0, 100% 70%, 90% 100%, 0 100%, 0 30%)' }}></div>

            <span className="relative flex items-center gap-4 text-neon-cyan font-display font-bold text-xl tracking-[0.2em] group-hover:text-white transition-colors">
                <Box className="animate-spin-slow" size={20} />
                INITIALIZE
            </span>
        </button>

        {/* CREDITS FOOTER */}
        <div className="absolute bottom-6 w-full flex justify-between px-10 text-[10px] font-mono text-slate-600 uppercase tracking-wider">
            <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span>SERVER_STATUS: ONLINE</span>
            </div>
            <div className="opacity-40 flex gap-4">
                <span className="flex items-center gap-1"><Cpu size={10}/> NEURAL_LINK</span>
                <span className="flex items-center gap-1"><Database size={10}/> GENOME_DB</span>
            </div>
        </div>

      </div>
      
      {/* Scanline Vignette & Noise */}
      <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear_gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[size:100%_2px,3px_100%] z-20"></div>
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle,transparent_40%,#000_100%)] z-30"></div>

      <style>{`
        @keyframes gridFloor {
            0% { background-position: 0 0; }
            100% { background-position: 0 60px; }
        }
        @keyframes gridCeiling {
            0% { background-position: 0 0; }
            100% { background-position: 0 -60px; }
        }
        @keyframes scrollDown {
            0% { transform: translateY(-100%); }
            100% { transform: translateY(100%); }
        }
        @keyframes scrollUp {
            0% { transform: translateY(100%); }
            100% { transform: translateY(-100%); }
        }
        .transform-style-3d {
            transform-style: preserve-3d;
        }
        .animate-spin-slow {
            animation: spin 4s linear infinite;
        }
        @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};
