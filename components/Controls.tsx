
import React from 'react';
import { Play, Pause, Zap, Settings, PanelLeftClose, PanelLeftOpen, Dna, Network, TrendingUp, FlaskConical, Lock, Scan, Syringe, Biohazard, Skull, CircleDashed, Sprout } from 'lucide-react';
import { UpgradeID, ToolMode } from '../types';
import { TOOL_COLORS, TOOL_COSTS } from '../constants';

interface ControlsProps {
  isRunning: boolean;
  generation: number;
  timeRemaining: number;
  evolutionProgress: number;
  growthProgress: number;      // New Prop
  reproductionProgress: number; // New Prop
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
  
  // New Props for Game
  bioData: number;
  unlockedUpgrades: UpgradeID[];
  onOpenResearch: () => void;

  // Tools
  activeTool: ToolMode;
  onSelectTool: (tool: ToolMode) => void;
}

export const Controls: React.FC<ControlsProps> = ({
  isRunning,
  generation,
  evolutionProgress,
  growthProgress,
  reproductionProgress,
  onTogglePlay,
  onOpenSettings,
  isCollapsed,
  onToggleCollapse,
  showGenomePanel,
  onToggleGenomePanel,
  onToggleMomBot,
  showDriftPanel,
  onToggleDriftPanel,
  bioData,
  unlockedUpgrades,
  onOpenResearch,
  activeTool,
  onSelectTool
}) => {

  const isGenomeUnlocked = unlockedUpgrades.includes('GENOME_SEQUENCER');
  const isMomBotUnlocked = unlockedUpgrades.includes('MOMBOT_LINK');
  const isDriftUnlocked = unlockedUpgrades.includes('DRIFT_ANALYSIS');

  // Tool Config for rendering
  const tools = [
      { id: 'SCANNER', icon: Scan, cost: 0, color: TOOL_COLORS.SCANNER, label: 'SCAN' },
      { id: 'INJECTOR', icon: Syringe, cost: 50, color: TOOL_COLORS.INJECTOR, label: 'FEED' },
      { id: 'MUTAGEN', icon: Biohazard, cost: 250, color: TOOL_COLORS.MUTAGEN, label: 'MUTATE' },
      { id: 'REAPER', icon: Skull, cost: 0, color: TOOL_COLORS.REAPER, label: 'CULL' }
  ];

  return (
    <>
      {/* Top Bar for Evolution Progress (When Sidebar Collapsed) */}
      {isCollapsed && (
          <div className="fixed top-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-4 animate-in fade-in slide-in-from-top-4 duration-300">
             
              {/* Mini BioData Counter */}
              <div className="bg-slate-950/80 backdrop-blur border border-neon-magenta/30 rounded-full py-2 px-4 flex items-center gap-2 shadow-[0_0_15px_rgba(255,0,255,0.1)]">
                  <FlaskConical size={14} className="text-neon-magenta" />
                  <span className="text-white font-mono font-bold">{Math.floor(bioData)}</span>
              </div>

              <div className="bg-slate-950/80 backdrop-blur border border-slate-700 rounded-full py-2 px-6 flex items-center gap-6 shadow-[0_0_30px_rgba(0,0,0,0.5)]">
                <div className="flex flex-col items-center">
                    <span className="text-[10px] text-slate-500 font-mono tracking-widest">GEN</span>
                    <span className="text-xl font-display font-bold text-white leading-none">{generation.toString().padStart(4, '0')}</span>
                </div>
                
                <div className="h-8 w-px bg-slate-800"></div>

                <div className="flex flex-col gap-1 min-w-[100px]">
                    {/* Reproduction (White) */}
                    <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
                        <div 
                            className="h-full bg-white shadow-[0_0_8px_#ffffff]" 
                            style={{ width: `${reproductionProgress * 100}%`, transition: 'width 0.2s linear' }}
                        ></div>
                    </div>
                     {/* Growth (Yellow) */}
                    <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
                        <div 
                            className="h-full bg-yellow-400 shadow-[0_0_8px_#facc15]" 
                            style={{ width: `${growthProgress * 100}%`, transition: 'width 0.2s linear' }}
                        ></div>
                    </div>
                     {/* Evolution (Cyan) */}
                    <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
                        <div 
                            className="h-full bg-neon-cyan shadow-[0_0_8px_#00f3ff]" 
                            style={{ width: `${evolutionProgress * 100}%`, transition: 'width 0.1s linear' }}
                        ></div>
                    </div>
                </div>
              </div>
          </div>
      )}

      {/* GOD TOOLS TOOLBAR (Bottom Center) */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-950/90 backdrop-blur-md border border-slate-700 rounded-full p-2 flex gap-2 shadow-2xl">
          {tools.map((t) => (
              <button
                  key={t.id}
                  onClick={() => onSelectTool(t.id as ToolMode)}
                  className={`relative group p-3 rounded-full transition-all border ${
                      activeTool === t.id 
                        ? 'bg-slate-800 border-white text-white shadow-[0_0_15px_rgba(255,255,255,0.2)]' 
                        : 'bg-transparent border-transparent text-slate-500 hover:text-white hover:bg-slate-900'
                  }`}
                  style={{ borderColor: activeTool === t.id ? t.color : undefined }}
                  title={`${t.label} ${t.cost > 0 ? `(${t.cost} BD)` : ''}`}
              >
                  <t.icon size={20} style={{ color: activeTool === t.id ? t.color : undefined }} />
                  
                  {/* Label Tooltip */}
                  <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-black px-2 py-1 rounded text-[10px] font-mono whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity border border-slate-800 text-white pointer-events-none">
                      {t.label} {t.cost > 0 && <span className="text-neon-magenta">{t.cost} BD</span>}
                  </div>
              </button>
          ))}
      </div>

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
                onClick={onOpenResearch}
                className="p-3 text-neon-magenta hover:bg-neon-magenta/10 rounded-full transition-colors relative"
                title="Research Lab"
              >
                  <FlaskConical size={20} />
                  <div className="absolute -top-1 -right-1 w-2 h-2 bg-neon-green rounded-full animate-pulse"></div>
              </button>

              <div className="flex flex-col gap-4 mt-auto mb-4">
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
              
              {/* RESOURCE DISPLAY */}
              <div className="bg-slate-950 border border-neon-magenta/30 rounded p-4 flex items-center justify-between shadow-[0_0_20px_rgba(255,0,255,0.05)]">
                  <div>
                      <div className="text-[10px] text-slate-500 font-mono mb-1">BIO-DATA COLLECTED</div>
                      <div className="text-2xl font-display font-bold text-white flex items-center gap-2">
                          {Math.floor(bioData).toLocaleString()} <span className="text-neon-magenta text-sm">BD</span>
                      </div>
                  </div>
                  <button 
                     onClick={onOpenResearch}
                     className="p-3 bg-neon-magenta text-white rounded hover:bg-fuchsia-500 transition-colors shadow-[0_0_15px_rgba(255,0,255,0.4)] group"
                  >
                      <FlaskConical size={20} className="group-hover:rotate-12 transition-transform"/>
                  </button>
              </div>

              <div className="flex gap-2">
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
                  {/* MAIN STATUS DISPLAY */}
                  <div className="bg-slate-950 p-4 rounded border border-slate-800 relative overflow-hidden group space-y-3">
                      
                      <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                          <span className="text-xs text-slate-400 font-bold">COLONY STATUS</span>
                          <span className="text-lg text-white font-display">{generation.toString().padStart(4, '0')}</span>
                      </div>

                      {/* 1. REPRODUCTION BAR (WHITE) */}
                      <div className="space-y-1">
                          <div className="flex justify-between text-[10px] text-slate-500">
                              <span className="flex items-center gap-1"><CircleDashed size={10} className="text-white"/> REPRODUCTION</span>
                              <span className="text-white">{Math.floor(reproductionProgress * 100)}%</span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                             <div 
                                className="h-full bg-white shadow-[0_0_8px_#ffffff]" 
                                style={{ width: `${reproductionProgress * 100}%`, transition: 'width 0.2s linear' }}
                             ></div>
                          </div>
                      </div>

                      {/* 2. GROWTH BAR (YELLOW) */}
                      <div className="space-y-1">
                          <div className="flex justify-between text-[10px] text-slate-500">
                              <span className="flex items-center gap-1"><Sprout size={10} className="text-yellow-400"/> GROWTH</span>
                              <span className="text-yellow-400">{Math.floor(growthProgress * 100)}%</span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                             <div 
                                className="h-full bg-yellow-400 shadow-[0_0_8px_#facc15]" 
                                style={{ width: `${growthProgress * 100}%`, transition: 'width 0.2s linear' }}
                             ></div>
                          </div>
                      </div>

                      {/* 3. EVOLUTION BAR (CYAN) */}
                      <div className="space-y-1">
                          <div className="flex justify-between text-[10px] text-slate-500">
                              <span className="flex items-center gap-1"><Zap size={10} className="text-neon-cyan"/> EVOLUTION</span>
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

                   {/* MomBot Neuralink Button (LOCKED) */}
                  <button 
                      onClick={onToggleMomBot}
                      disabled={!isMomBotUnlocked}
                      className={`w-full p-3 rounded border flex items-center justify-center gap-3 transition-all group ${
                          isMomBotUnlocked 
                            ? 'border-neon-magenta/30 bg-neon-magenta/5 hover:bg-neon-magenta/10 text-neon-magenta cursor-pointer'
                            : 'border-slate-800 bg-slate-900 text-slate-600 cursor-not-allowed'
                      }`}
                  >
                      {isMomBotUnlocked ? <Network size={20} className="group-hover:animate-pulse" /> : <Lock size={16} />}
                      <span className="font-bold text-sm tracking-wider">NEURALINK: MOMBOT</span>
                  </button>

                  <div className="grid grid-cols-2 gap-2">
                      {/* Genome Monitor Button (LOCKED) */}
                      <button 
                          onClick={onToggleGenomePanel}
                          disabled={!isGenomeUnlocked}
                          className={`p-3 rounded border flex flex-col items-center gap-2 transition-all group relative ${
                              !isGenomeUnlocked 
                                ? 'bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed'
                                : showGenomePanel 
                                    ? 'bg-neon-cyan/10 border-neon-cyan/50 text-neon-cyan' 
                                    : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-600 hover:bg-slate-900'
                          }`}
                      >
                          {!isGenomeUnlocked && <div className="absolute top-2 right-2"><Lock size={12}/></div>}
                          <Dna size={20} className={showGenomePanel ? "animate-pulse" : ""} />
                          <span className="text-[10px] font-bold">GENOMES</span>
                      </button>

                      {/* Drift Analysis Button (LOCKED) */}
                      <button 
                          onClick={onToggleDriftPanel}
                          disabled={!isDriftUnlocked}
                          className={`p-3 rounded border flex flex-col items-center gap-2 transition-all group relative ${
                              !isDriftUnlocked 
                                ? 'bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed'
                                : showDriftPanel 
                                    ? 'bg-neon-cyan/10 border-neon-cyan/50 text-neon-cyan' 
                                    : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-600 hover:bg-slate-900'
                          }`}
                      >
                           {!isDriftUnlocked && <div className="absolute top-2 right-2"><Lock size={12}/></div>}
                          <TrendingUp size={20} />
                          <span className="text-[10px] font-bold">DRIFT</span>
                      </button>
                  </div>

                  <div className="bg-slate-950 p-4 rounded border border-slate-800">
                    <div className="flex items-center gap-2 text-neon-green mb-2">
                        <Scan size={16} className="fill-current" />
                        <span className="text-xs font-bold uppercase">Active Protocol</span>
                    </div>
                    <div className="text-xs text-slate-400 leading-relaxed">
                        Select tool from bottom bar. Scan for resources or intervene directly in evolution.
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
