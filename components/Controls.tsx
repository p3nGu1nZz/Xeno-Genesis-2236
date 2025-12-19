
import React from 'react';
import { Play, Pause, Zap, Activity, BrainCircuit, Settings, Volume2, VolumeX, PanelLeftClose, PanelLeftOpen, Cpu, Dna, FlaskConical } from 'lucide-react';
import { SimulationConfig, Genome } from '../types';

interface ControlsProps {
  isRunning: boolean;
  generation: number;
  timeRemaining: number;
  onTogglePlay: () => void;
  onAnalyze: () => void;
  onOpenSettings: () => void;
  isAnalyzing: boolean;
  onToggleAcoustic: () => void;
  acousticActive: boolean;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  minimizedPanels: { A: boolean, B: boolean };
  onRestorePanel: (id: 'A' | 'B') => void;
  genomeA: Genome | null;
  genomeB: Genome | null;
}

// Creative Icon Component for Minimized Genomes
const BioChip = ({ color, label, onClick, id }: { color: string, label: string, onClick: () => void, id: string }) => {
    return (
        <button 
            onClick={onClick}
            className={`relative group w-12 h-12 flex flex-col items-center justify-center bg-slate-900 border ${id === 'A' ? 'border-neon-cyan/40' : 'border-neon-magenta/40'} rounded-lg overflow-hidden transition-all hover:scale-105 hover:border-opacity-100 ${id === 'A' ? 'hover:shadow-[0_0_15px_rgba(0,243,255,0.3)]' : 'hover:shadow-[0_0_15px_rgba(255,0,255,0.3)]'}`}
            title={`Restore ${label} Genome`}
        >
            {/* Background Data Stream Effect */}
            <div className={`absolute inset-0 opacity-10 flex flex-col gap-0.5`}>
                {Array.from({length: 8}).map((_, i) => (
                   <div key={i} className={`h-px w-full ${id === 'A' ? 'bg-neon-cyan' : 'bg-neon-magenta'} animate-pulse`} style={{ animationDelay: `${i * 0.1}s` }} /> 
                ))}
            </div>

            {/* Central Icon */}
            <div className={`z-10 relative bg-slate-950/80 p-1.5 rounded-full border ${id === 'A' ? 'border-neon-cyan/20' : 'border-neon-magenta/20'}`}>
                <Dna size={16} className={id === 'A' ? 'text-neon-cyan' : 'text-neon-magenta'} />
            </div>

            {/* Label Tiny */}
            <span className={`absolute bottom-0.5 text-[8px] font-bold font-mono uppercase ${id === 'A' ? 'text-neon-cyan' : 'text-neon-magenta'} opacity-70`}>
                {id}
            </span>

            {/* Status Light */}
            <div className="absolute top-1 right-1 w-1 h-1 bg-white rounded-full animate-ping" />
        </button>
    );
};

export const Controls: React.FC<ControlsProps> = ({
  isRunning,
  generation,
  onTogglePlay,
  onAnalyze,
  onOpenSettings,
  isAnalyzing,
  onToggleAcoustic,
  acousticActive,
  isCollapsed,
  onToggleCollapse,
  minimizedPanels,
  onRestorePanel,
  genomeA,
  genomeB
}) => {
  return (
    <div 
      className={`relative z-30 h-full bg-slate-900/80 border-r border-slate-800 backdrop-blur-md transition-all duration-500 flex flex-col ${isCollapsed ? 'w-20' : 'w-80'}`}
    >
      {/* Toggle Button */}
      <button 
        onClick={onToggleCollapse}
        className="absolute -right-4 top-6 bg-slate-800 border border-slate-700 text-neon-cyan p-1 rounded-full shadow-lg hover:bg-slate-700 z-40"
      >
        {isCollapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
      </button>

      {/* MINIMIZED VIEW (TOOLBAR) */}
      {isCollapsed && (
        <div className="flex flex-col items-center py-6 gap-6 h-full w-full">
            <div className="text-neon-cyan font-bold text-lg rotate-90 mt-4 mb-2 origin-center whitespace-nowrap tracking-widest opacity-50">XENO</div>
            
            <button 
                onClick={onTogglePlay}
                className={`p-3 rounded-xl transition-all shadow-lg ${
                  isRunning ? 'text-red-400 bg-red-950/50 border border-red-500/30' : 'text-neon-cyan bg-cyan-950/50 border border-neon-cyan/30'
                }`}
                title={isRunning ? "Halt Simulation" : "Initiate Simulation"}
            >
                {isRunning ? <Pause size={20} /> : <Play size={20} />}
            </button>

            <button 
                onClick={onOpenSettings}
                className="p-3 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
                title="System Settings"
            >
                <Settings size={20} />
            </button>
            
            {/* Divider */}
            <div className="w-8 h-px bg-slate-800" />

            {/* DOCKED MINIMIZED GENOMES */}
            <div className="flex flex-col gap-3">
                {(genomeA && minimizedPanels.A) && (
                    <BioChip 
                        id="A" 
                        color="neon-cyan" 
                        label="Group A" 
                        onClick={() => onRestorePanel('A')} 
                    />
                )}
                {(genomeB && minimizedPanels.B) && (
                    <BioChip 
                        id="B" 
                        color="neon-magenta" 
                        label="Group B" 
                        onClick={() => onRestorePanel('B')} 
                    />
                )}
            </div>

            <div className="mt-auto flex flex-col gap-4 mb-4 items-center">
                 <button 
                    onClick={onToggleAcoustic}
                    className={`p-3 rounded-full transition-all ${
                        acousticActive 
                        ? 'text-neon-magenta bg-fuchsia-950/50 border border-neon-magenta/50 shadow-[0_0_10px_rgba(255,0,255,0.2)] animate-pulse' 
                        : 'text-slate-600 hover:text-slate-400'
                    }`}
                    title="Acoustic Stimulus"
                 >
                     {acousticActive ? <Volume2 size={20} /> : <VolumeX size={20} />}
                 </button>

                 <button
                    onClick={onAnalyze}
                    className={`p-3 rounded-full border transition-all ${
                        isAnalyzing
                        ? 'text-purple-300 border-purple-500 bg-purple-900/20'
                        : 'text-purple-400 border-transparent hover:text-white hover:bg-purple-900/10'
                    }`}
                    title="AI Analysis Link"
                 >
                    {isAnalyzing ? <BrainCircuit className="animate-spin" size={20} /> : <Activity size={20} />}
                 </button>
            </div>
        </div>
      )}

      {/* EXPANDED VIEW */}
      {!isCollapsed && (
        <div className="flex flex-col gap-4 p-6 h-full w-full opacity-100 transition-opacity duration-300 overflow-y-auto custom-scrollbar">
            <div className="flex items-end justify-between border-b border-slate-800 pb-4 mb-2">
                <div>
                    <h1 className="text-3xl font-display font-black text-transparent bg-clip-text bg-gradient-to-r from-neon-cyan via-white to-neon-magenta tracking-tight">
                        XENO<br/>GENESIS
                    </h1>
                    <div className="text-[10px] font-mono text-slate-500 tracking-[0.2em] mt-1">
                        PROJECT: ORIGIN_2236
                    </div>
                </div>
                <div className="text-right">
                    <Cpu className="text-slate-700 mb-1 ml-auto" size={24} />
                    <div className="text-[10px] text-slate-600 font-mono">
                        V.4.2.1
                    </div>
                </div>
            </div>

            <div className="flex gap-2 mb-2">
                <button
                onClick={onTogglePlay}
                className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg font-mono font-bold transition-all shadow-lg ${
                    isRunning 
                    ? 'bg-red-500/10 text-red-400 border border-red-500/50 hover:bg-red-500/20 shadow-[0_0_20px_rgba(239,68,68,0.1)]' 
                    : 'bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/50 hover:bg-neon-cyan/20 shadow-[0_0_20px_rgba(0,243,255,0.1)]'
                }`}
                >
                {isRunning ? <Pause size={18} /> : <Play size={18} />}
                {isRunning ? 'HALT SEQUENCE' : 'INITIATE'}
                </button>
                <button 
                    onClick={onOpenSettings}
                    className="p-3 rounded-lg bg-slate-800 text-slate-400 border border-slate-700 hover:text-white hover:bg-slate-700 transition-colors"
                >
                    <Settings size={18} />
                </button>
            </div>
            
            {/* DOCKED PANEL SECTION (Expanded Mode) */}
            {((genomeA && minimizedPanels.A) || (genomeB && minimizedPanels.B)) && (
                <div className="mb-2 bg-slate-950/80 p-3 rounded-lg border border-slate-800 shadow-inner">
                    <div className="flex items-center gap-2 text-[10px] text-slate-500 uppercase font-bold mb-3 tracking-wider">
                        <FlaskConical size={12} />
                        Cryo-Storage
                    </div>
                    <div className="flex gap-3 justify-start">
                        {(genomeA && minimizedPanels.A) && (
                            <BioChip 
                                id="A" 
                                color="neon-cyan" 
                                label="Group A" 
                                onClick={() => onRestorePanel('A')} 
                            />
                        )}
                        {(genomeB && minimizedPanels.B) && (
                            <BioChip 
                                id="B" 
                                color="neon-magenta" 
                                label="Group B" 
                                onClick={() => onRestorePanel('B')} 
                            />
                        )}
                    </div>
                </div>
            )}

            <div className="space-y-4 font-mono">
                {/* Generation Counter */}
                <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 relative overflow-hidden group">
                    <div className="absolute -right-6 -top-6 w-24 h-24 bg-yellow-500/10 rounded-full blur-2xl group-hover:bg-yellow-500/20 transition-all"></div>
                    <div className="relative z-10">
                        <div className="flex items-center gap-2 text-slate-500 text-xs uppercase mb-1 font-bold">
                            <Zap size={12} className="text-yellow-500"/>
                            Evolution Cycle
                        </div>
                        <div className="text-4xl text-white font-display tracking-widest">{generation.toString().padStart(4, '0')}</div>
                    </div>
                </div>

                {/* Acoustic Stimulation Control */}
                <button 
                onClick={onToggleAcoustic}
                className={`w-full flex items-center justify-between p-4 rounded-lg border transition-all group ${
                    acousticActive 
                    ? 'bg-fuchsia-950/30 border-neon-magenta/60 text-white shadow-[0_0_15px_rgba(255,0,255,0.15)]' 
                    : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-600'
                }`}
                >
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-md ${acousticActive ? 'bg-neon-magenta text-black' : 'bg-slate-800 text-slate-600'}`}>
                            {acousticActive ? <Volume2 size={18} /> : <VolumeX size={18} />}
                        </div>
                        <div className="text-left">
                            <div className={`text-xs font-bold uppercase ${acousticActive ? 'text-neon-magenta' : 'text-slate-500'}`}>Acoustic Field</div>
                            <div className="text-[10px] opacity-60">300Hz Stimulus</div>
                        </div>
                    </div>
                    <div className={`w-2 h-2 rounded-full ${acousticActive ? 'bg-neon-magenta animate-ping' : 'bg-slate-700'}`}></div>
                </button>

                {/* Status Box */}
                <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
                    <div className="flex items-center gap-2 text-neon-green mb-2">
                        <Activity size={16} className="animate-pulse" />
                        <span className="text-xs font-bold uppercase">System Status</span>
                    </div>
                    <div className="text-xs text-slate-400 leading-relaxed font-mono">
                        <span className="text-slate-600 mr-2">{'>'}</span>Cloning protocols active.<br/>
                        <span className="text-slate-600 mr-2">{'>'}</span>Genetic stabilization: 99.8%<br/>
                        <span className="text-slate-600 mr-2">{'>'}</span>Morphology scan: READY
                    </div>
                </div>
            </div>

            <div className="mt-auto pt-4">
                <button
                onClick={onAnalyze}
                disabled={isAnalyzing}
                className="relative overflow-hidden w-full flex items-center justify-center gap-2 p-4 rounded-lg font-mono font-bold bg-purple-950/30 text-purple-300 border border-purple-500/50 hover:bg-purple-900/40 hover:text-white disabled:opacity-50 transition-all group shadow-[0_0_15px_rgba(168,85,247,0.1)] hover:shadow-[0_0_25px_rgba(168,85,247,0.25)]"
                >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-purple-500/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                {isAnalyzing ? (
                    <BrainCircuit className="animate-spin" size={20} />
                ) : (
                    <Activity className="group-hover:text-neon-cyan transition-colors" size={20} />
                )}
                {isAnalyzing ? 'UPLINKING...' : 'ASSIMULATE'}
                </button>
                <p className="text-[10px] text-slate-600 mt-3 text-center tracking-widest uppercase">
                Gemini Neural Link // Active
                </p>
            </div>
        </div>
      )}
    </div>
  );
};
