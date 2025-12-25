import React from 'react';
import { Play, Pause, Zap, Activity, Settings, PanelLeftClose, PanelLeftOpen, Dna, Network, TrendingUp } from 'lucide-react';

interface ControlsProps {
  isRunning: boolean;
  generation: number;
  timeRemaining: number;
  evolutionProgress: number;
  onTogglePlay: () => void;
  onAnalyze: () => void;
  onOpenSettings: () => void;
  isAnalyzing: boolean;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  showGenomePanel: boolean;
  onToggleGenomePanel: () => void;
  onToggleMomBot: () => void;
  showDriftPanel: boolean;
  onToggleDriftPanel: () => void;
}

export const Controls: React.FC<ControlsProps> = ({
  isRunning,
  generation,
  evolutionProgress,
  onTogglePlay,
  onOpenSettings,
  isCollapsed,
  onToggleCollapse,
  showGenomePanel,
  onToggleGenomePanel,
  onToggleMomBot,
  showDriftPanel,
  onToggleDriftPanel
}) => {
  return (
    <>
      {/* Top Bar for Evolution Progress (When Sidebar Collapsed) */}
      {isCollapsed && (
          <div className="fixed top-6 left-1/2 -translate-x-1/2 z-40 bg-slate-950/80 backdrop-blur border border-slate-700 rounded-full py-2 px-6 flex items-center gap-6 shadow-[0_0_30px_rgba(0,0,0,0.5)] animate-in fade-in slide-in-from-top-4 duration-300">
              <div className="flex flex-col items-center">
                  <span className="text-[10px] text-slate-500 font-mono tracking-widest">GENERATION</span>
                  <span className="text-xl font-display font-bold text-white leading-none">{generation.toString().padStart(4, '0')}</span>
              </div>
              
              <div className="h-8 w-px bg-slate-800"></div>

              <div className="flex flex-col items-center min-w-[140px]">
                  <div className="flex justify-between w-full text-[10px] text-slate-500 mb-1">
                     <span className="flex items-center gap-1"><Zap size={10} className="text-yellow-500" /> MUTATION</span>
                     <span className="text-neon-cyan">{Math.floor(evolutionProgress * 100)}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                       <div 
                           className="h-full bg-neon-cyan shadow-[0_0_8px_#00f3ff]" 
                           style={{ width: `${evolutionProgress * 100}%`, transition: 'width 0.1s linear' }}
                       ></div>
                  </div>
              </div>
          </div>
      )}

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

              <div className="flex flex-col gap-4 mt-auto mb-4">
                   <button 
                      onClick={onToggleMomBot}
                      className="p-2 text-neon-magenta hover:text-white transition-colors"
                      title="MomBot Neuralink Interface"
                  >
                      <Network size={20} />
                  </button>

                  <button 
                      onClick={onToggleGenomePanel}
                      className={`p-2 rounded transition-all ${showGenomePanel ? 'text-neon-cyan bg-neon-cyan/10 border border-neon-cyan/50' : 'text-slate-600 border border-transparent'}`}
                      title="Open Genome Database"
                  >
                      <Dna size={20} />
                  </button>
                  
                  <button 
                      onClick={onToggleDriftPanel}
                      className={`p-2 rounded transition-all ${showDriftPanel ? 'text-neon-cyan bg-neon-cyan/10 border border-neon-cyan/50' : 'text-slate-600 border border-transparent'}`}
                      title="Genetic Drift Analysis"
                  >
                      <TrendingUp size={20} />
                  </button>
                  
                  <button 
                      onClick={onOpenSettings}
                      className="p-2 text-slate-400 hover:text-white"
                      title="Settings"
                  >
                      <Settings size={20} />
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
                  VER 2236.4.3 // TUFTS_ARCHIVE
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
                             style={{ width: `${evolutionProgress * 100}%`, transition: 'width 0.1s linear' }}
                          ></div>
                      </div>

                      <div className="absolute top-0 right-0 p-2 opacity-20 group-hover:opacity-40 transition-opacity">
                          <Zap size={40} className="text-yellow-500"/>
                      </div>
                      <div className="text-slate-500 text-xs uppercase mb-1 mt-1">Evolution Cycle</div>
                      <div className="text-4xl text-white font-display">{generation.toString().padStart(4, '0')}</div>
                      <div className="flex justify-between items-end mt-2">
                           <span className="text-[10px] text-slate-500">NEXT MUTATION</span>
                           <span className="text-xs text-neon-cyan font-bold">{Math.floor(evolutionProgress * 100)}%</span>
                      </div>
                  </div>

                   {/* MomBot Neuralink Button */}
                  <button 
                      onClick={onToggleMomBot}
                      className="w-full p-3 rounded border border-neon-magenta/30 bg-neon-magenta/5 hover:bg-neon-magenta/10 text-neon-magenta flex items-center justify-center gap-3 transition-all group"
                  >
                      <Network size={20} className="group-hover:animate-pulse" />
                      <span className="font-bold text-sm tracking-wider">NEURALINK: MOMBOT</span>
                  </button>

                  <div className="grid grid-cols-2 gap-2">
                      {/* Genome Monitor Button */}
                      <button 
                          onClick={onToggleGenomePanel}
                          className={`p-3 rounded border flex flex-col items-center gap-2 transition-all group ${
                              showGenomePanel 
                              ? 'bg-neon-cyan/10 border-neon-cyan/50 text-neon-cyan' 
                              : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-600 hover:bg-slate-900'
                          }`}
                      >
                          <Dna size={20} className={showGenomePanel ? "animate-pulse" : ""} />
                          <span className="text-[10px] font-bold">GENOMES</span>
                      </button>

                      {/* Drift Analysis Button */}
                      <button 
                          onClick={onToggleDriftPanel}
                          className={`p-3 rounded border flex flex-col items-center gap-2 transition-all group ${
                              showDriftPanel 
                              ? 'bg-neon-cyan/10 border-neon-cyan/50 text-neon-cyan' 
                              : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-600 hover:bg-slate-900'
                          }`}
                      >
                          <TrendingUp size={20} />
                          <span className="text-[10px] font-bold">DRIFT</span>
                      </button>
                  </div>

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
    </>
  );
};