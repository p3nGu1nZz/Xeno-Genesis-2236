import React from 'react';
import { X, Play, MousePointer2, Zap, Activity } from 'lucide-react';

interface HelpModalProps {
  open: boolean;
  onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ open, onClose }) => {
  if (!open) return null;

  return (
    <div className="absolute inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-slate-900 border border-neon-cyan/50 w-[600px] max-h-[90vh] overflow-y-auto rounded-2xl shadow-[0_0_60px_rgba(0,243,255,0.15)] flex flex-col relative">
        
        <button 
            onClick={onClose} 
            className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors"
        >
            <X size={24} />
        </button>

        <div className="p-8 pb-4">
            <h2 className="text-3xl font-display font-bold text-transparent bg-clip-text bg-gradient-to-r from-neon-cyan to-neon-magenta mb-2">
                SIMULATION GUIDE
            </h2>
            <p className="text-slate-400 font-mono text-sm">
                Welcome to the Xeno-Genesis Research Terminal (2236 AD).
            </p>
        </div>

        <div className="px-8 py-4 space-y-6 overflow-y-auto font-mono text-sm text-slate-300 custom-scrollbar">
            
            <div className="space-y-2">
                <div className="flex items-center gap-2 text-neon-cyan font-bold">
                    <Activity size={18} />
                    <h3>OBJECTIVE</h3>
                </div>
                <p className="leading-relaxed border-l-2 border-slate-700 pl-4 text-slate-400">
                    Evolve a population of <span className="text-white">Xenobots</span> capable of efficient locomotion. 
                    The physics engine rewards displacement to the right. 
                    Creatures evolve over generations using a genetic algorithm based on morphological efficiency.
                </p>
            </div>

            <div className="space-y-2">
                <div className="flex items-center gap-2 text-neon-green font-bold">
                    <MousePointer2 size={18} />
                    <h3>CONTROLS</h3>
                </div>
                <div className="grid grid-cols-2 gap-4 border-l-2 border-slate-700 pl-4">
                    <div>
                        <span className="text-white block mb-1">CAMERA PAN</span>
                        <kbd className="bg-slate-800 px-2 py-1 rounded text-xs border border-slate-600">W</kbd>
                        <kbd className="bg-slate-800 px-2 py-1 rounded text-xs border border-slate-600 ml-1">A</kbd>
                        <kbd className="bg-slate-800 px-2 py-1 rounded text-xs border border-slate-600 ml-1">S</kbd>
                        <kbd className="bg-slate-800 px-2 py-1 rounded text-xs border border-slate-600 ml-1">D</kbd>
                    </div>
                    <div>
                        <span className="text-white block mb-1">ZOOM</span>
                        <kbd className="bg-slate-800 px-2 py-1 rounded text-xs border border-slate-600">Q</kbd>
                        <kbd className="bg-slate-800 px-2 py-1 rounded text-xs border border-slate-600 ml-1">E</kbd>
                    </div>
                </div>
            </div>

            <div className="space-y-2">
                <div className="flex items-center gap-2 text-yellow-500 font-bold">
                    <Zap size={18} />
                    <h3>BIO-ELECTRICITY</h3>
                </div>
                <p className="leading-relaxed border-l-2 border-slate-700 pl-4 text-slate-400">
                    <span className="text-yellow-400">Yellow Cells (Neurons)</span> act as structural struts and signal conductors.<br/>
                    <span className="text-red-400">Red Cells (Muscle)</span> contract periodically based on the bio-electric field.<br/>
                    <span className="text-neon-cyan">Bio-Memory</span> determines how quickly a bot physically adapts (plasticity) to stress.
                </p>
            </div>

        </div>

        <div className="p-8 pt-4 border-t border-slate-800 bg-slate-950/50">
            <button 
                onClick={onClose}
                className="w-full bg-neon-cyan/10 hover:bg-neon-cyan/20 text-neon-cyan border border-neon-cyan font-bold font-display py-4 rounded transition-all flex items-center justify-center gap-2 group"
            >
                <Play size={18} className="group-hover:fill-current" />
                ENTER SIMULATION
            </button>
        </div>

      </div>
    </div>
  );
};