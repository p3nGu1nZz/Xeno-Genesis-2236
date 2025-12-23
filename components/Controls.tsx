
import React from 'react';
import { Play, Pause, Zap, Activity, Settings, Volume2, VolumeX, PanelLeftClose, PanelLeftOpen, Dna, Microscope } from 'lucide-react';
import { SimulationConfig } from '../types';

interface ControlsProps {
  isRunning: boolean;
  generation: number;
  timeRemaining: number;
  evolutionProgress: number;
  onTogglePlay: () => void;
  onAnalyze: () => void;
  onOpenSettings: () => void;
  isAnalyzing: boolean;
  onToggleAcoustic: () => void;
  acousticActive: boolean;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  showGenomeA: boolean;
  onToggleGenomeA: () => void;
  showGenomeB: boolean;
  onToggleGenomeB: () => void;
}

export const Controls: React.FC<ControlsProps> = ({
  isRunning,
  generation,
  evolutionProgress,
  onTogglePlay,
  onAnalyze,
  onOpenSettings,
  isAnalyzing,
  onToggleAcoustic,
  acousticActive,
  isCollapsed,
  onToggleCollapse,
  showGenomeA,
  onToggleGenomeA,
  showGenomeB,
  onToggleGenomeB
}) => {
  return (
    <div 
      className={`relative z-30 h-full bg-slate-900/80 border-r border-slate-800 backdrop-blur-md transition-all duration-500 flex flex-col ${isCollapsed ? 'w-16' : 'w-80'}`}
    >
      {/* Toggle Button */}
      <button 
        onClick={onToggleCollapse}
        className="absolute -right-4 top-6 bg-slate-800 border border-slate-700 text-neon-cyan p-1 rounded-full shadow-lg hover:bg-slate-700 z-40"
      >
        {isCollapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
      </button>

      {/* MINIMIZED VIEW */}
      {isCollapsed && (
        <div className="flex flex-col items-center py-6 gap-6 h-full w-full">
            <div className="text-neon-cyan font-bold text-xl rotate-90 mt-2 mb-2 origin-center whitespace-nowrap">XENO</div>
            
            <button 
                onClick={onTogglePlay}
                className={`p-3 rounded-md transition-all ${
                  isRunning ? 'text-red-400 bg-red-500/20' : 'text-neon-cyan bg-neon-cyan/20'
                }`}
                title={isRunning ? "Halt" : "Initiate"}
            >
                {isRunning ? <Pause size={20} /> : <Play size={20} />}
            </button>

            <button 
                onClick={onOpenSettings}
                className="p-3 text-slate-400 hover:text-white"
                title="Settings"
            >
                <Settings size={20} />
            </button>

            <div className="flex flex-col gap-2 w-full px-2">
                 <button 
                   onClick={onToggleGenomeA}
                   className={`p-2 rounded transition-all ${showGenomeA ? 'text-neon-cyan bg-neon-cyan/10 border border-neon-cyan/50' : 'text-slate-600 border border-transparent'}`}
                   title="Toggle Genome A"
                 >
                   <Dna size={18} />
                 </button>
                 <button 
                   onClick={onToggleGenomeB}
                   className={`p-2 rounded transition-all ${showGenomeB ? 'text-neon-magenta bg-neon-magenta/10 border border-neon-magenta/50' : 'text-slate-600 border border-transparent'}`}
                   title="Toggle Genome B"
                 >
                   <Dna size={18} />
                 </button>
            </div>

            <div className="mt-auto flex flex-col gap-4 mb-4">
                 <button 
                    onClick={onToggleAcoustic}
                    className={`p-3 rounded-full ${acousticActive ? 'text-neon-magenta animate-pulse' : 'text-slate-600'}`}
                    title="Acoustic Stimulus"
                 >
                     {acousticActive ? <Volume2 size={20} /> : <VolumeX size={20} />}
                 </button>
            </div>
        </div>
      )}

      {/* MAXIMIZED VIEW */}
      {!isCollapsed && (
        <div className="flex flex-col gap-4 p-6 h-full w-full opacity-100 transition-opacity duration-300">
            <h1 className="text-3xl font-display font-bold text-transparent bg-clip-text bg-gradient-to-r from-neon-cyan to-neon-magenta">
                XENO<br/>GENESIS
            </h1>
            <div className="text-xs font-mono text-slate-400 tracking-widest mb-4">
                VER 2236.4.2 // TUFTS_ARCHIVE
            </div>

            <div className="flex gap-2 mb-6">
                <button
                onClick={onTogglePlay}
                className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-md font-mono font-bold transition-all ${
                    isRunning 
                    ? 'bg-red-500/20 text-red-400 border border-red-500/50 hover:bg-red-500/30' 
                    : 'bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/50 hover:bg-neon-cyan/30'
                }`}
                >
                {isRunning ? <Pause size={18} /> : <Play size={18} />}
                {isRunning ? 'HALT' : 'INITIATE'}
                </button>
                <button 
                    onClick={onOpenSettings}
                    className="p-3 rounded-md bg-slate-800 text-slate-300 border border-slate-700 hover:text-white hover:bg-slate-700 transition-colors"
                >
                    <Settings size={18} />
                </button>
            </div>

            <div className="space-y-4 font-mono">
                <div className="bg-slate-950 p-4 rounded border border-slate-800 relative overflow-hidden group">
                    {/* Progress Bar */}
                    <div className="absolute top-0 left-0 w-full h-1 bg-slate-800">
                        <div 
                           className="h-full bg-neon-cyan shadow-[0_0_10px_#00f3ff]" 
                           style={{ width: `${(1 - evolutionProgress) * 100}%`, transition: 'width 0.1s linear' }}
                        ></div>
                    </div>

                    <div className="absolute top-0 right-0 p-2 opacity-20 group-hover:opacity-40 transition-opacity">
                        <Zap size={40} className="text-yellow-500"/>
                    </div>
                    <div className="text-slate-500 text-xs uppercase mb-1 mt-1">Evolution Cycle</div>
                    <div className="text-4xl text-white font-display">{generation.toString().padStart(4, '0')}</div>
                    <div className="flex justify-between items-end mt-2">
                         <span className="text-[10px] text-slate-500">NEXT MUTATION</span>
                         <span className="text-xs text-neon-cyan font-bold">{Math.floor((1 - evolutionProgress) * 100)}%</span>
                    </div>
                </div>

                {/* Genome Monitors */}
                <div className="grid grid-cols-2 gap-3">
                    <button 
                        onClick={onToggleGenomeA}
                        className={`p-3 rounded border flex flex-col items-center gap-2 transition-all ${
                            showGenomeA 
                            ? 'bg-neon-cyan/10 border-neon-cyan/50 text-neon-cyan' 
                            : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-600'
                        }`}
                    >
                        <Dna size={20} />
                        <span className="text-[10px] font-bold">GROUP A</span>
                    </button>
                    <button 
                        onClick={onToggleGenomeB}
                        className={`p-3 rounded border flex flex-col items-center gap-2 transition-all ${
                            showGenomeB 
                            ? 'bg-neon-magenta/10 border-neon-magenta/50 text-neon-magenta' 
                            : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-600'
                        }`}
                    >
                        <Dna size={20} />
                        <span className="text-[10px] font-bold">GROUP B</span>
                    </button>
                </div>

                {/* Acoustic Stimulation Control */}
                <button 
                onClick={onToggleAcoustic}
                className={`w-full flex items-center justify-between p-4 rounded border transition-all ${
                    acousticActive 
                    ? 'bg-neon-magenta/20 border-neon-magenta text-white' 
                    : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-600'
                }`}
                >
                    <div className="flex items-center gap-2">
                        {acousticActive ? <Volume2 size={18} /> : <VolumeX size={18} />}
                        <span className="text-xs font-bold uppercase">300Hz Stimulus</span>
                    </div>
                    <div className={`w-2 h-2 rounded-full ${acousticActive ? 'bg-neon-magenta animate-pulse' : 'bg-slate-700'}`}></div>
                </button>

                <div className="bg-slate-950 p-4 rounded border border-slate-800">
                <div className="flex items-center gap-2 text-neon-green mb-2">
                    <Activity size={16} />
                    <span className="text-xs font-bold uppercase">Steady State System</span>
                </div>
                <div className="text-xs text-slate-400 leading-relaxed">
                    Cloning protocols active. Genetic stabilization in progress.
                </div>
                </div>
            </div>

            <div className="mt-auto">
                <p className="text-[10px] text-slate-500 mt-2 text-center">
                Powered by Gemini Neural Link
                </p>
            </div>
        </div>
      )}
    </div>
  );
};
