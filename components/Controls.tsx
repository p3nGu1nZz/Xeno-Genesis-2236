import React from 'react';
import { Play, Pause, Zap, Activity, BrainCircuit, Settings } from 'lucide-react';

interface ControlsProps {
  isRunning: boolean;
  generation: number;
  timeRemaining: number;
  onTogglePlay: () => void;
  onAnalyze: () => void;
  onOpenSettings: () => void;
  isAnalyzing: boolean;
}

export const Controls: React.FC<ControlsProps> = ({
  isRunning,
  generation,
  timeRemaining,
  onTogglePlay,
  onAnalyze,
  onOpenSettings,
  isAnalyzing
}) => {
  return (
    <div className="flex flex-col gap-4 p-6 bg-slate-900/80 border-r border-slate-800 h-full backdrop-blur-md w-80 relative z-30">
      <h1 className="text-3xl font-display font-bold text-transparent bg-clip-text bg-gradient-to-r from-neon-cyan to-neon-magenta">
        XENO<br/>GENESIS
      </h1>
      <div className="text-xs font-mono text-slate-400 tracking-widest mb-4">
        VER 2236.4.1 // TUFTS_ARCHIVE
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
          <div className="absolute top-0 right-0 p-2 opacity-20 group-hover:opacity-40 transition-opacity">
            <Zap size={40} className="text-yellow-500"/>
          </div>
          <div className="text-slate-500 text-xs uppercase mb-1">Morphogenetic Cycle</div>
          <div className="text-4xl text-white font-display">{generation.toString().padStart(3, '0')}</div>
        </div>

        <div className="bg-slate-950 p-4 rounded border border-slate-800">
          <div className="text-slate-500 text-xs uppercase mb-1">Bio-Electric Stability</div>
          <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden mt-2">
            <div 
              className="bg-neon-magenta h-full transition-all duration-75 relative"
              style={{ width: `${Math.max(0, (timeRemaining / 600) * 100)}%` }}
            >
               <div className="absolute inset-0 bg-white/20 animate-pulse-fast"></div>
            </div>
          </div>
          <div className="text-right text-xs text-neon-magenta mt-1">{timeRemaining} ticks to Mutation</div>
        </div>
      </div>

      <div className="mt-auto">
        <button
          onClick={onAnalyze}
          disabled={isAnalyzing}
          className="w-full flex items-center justify-center gap-2 p-4 rounded-md font-mono font-bold bg-purple-900/20 text-purple-300 border border-purple-500/50 hover:bg-purple-900/40 disabled:opacity-50 transition-all group shadow-[0_0_15px_rgba(168,85,247,0.1)] hover:shadow-[0_0_25px_rgba(168,85,247,0.3)]"
        >
          {isAnalyzing ? (
            <BrainCircuit className="animate-spin" size={20} />
          ) : (
            <Activity className="group-hover:text-neon-cyan transition-colors" size={20} />
          )}
          {isAnalyzing ? 'UPLINKING...' : 'AI ASSISTANT'}
        </button>
        <p className="text-[10px] text-slate-500 mt-2 text-center">
          Powered by Gemini Neural Link
        </p>
      </div>
    </div>
  );
};