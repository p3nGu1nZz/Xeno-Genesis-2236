
import React, { useState, useEffect, useRef } from 'react';
import { X, Bot, BrainCircuit, FlaskConical, Zap, Thermometer, Waves, Activity, Terminal, Play, Server, Download } from 'lucide-react';

interface MomBotPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MomBotPanel: React.FC<MomBotPanelProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const [logs, setLogs] = useState<string[]>([]);
  const [activeStimulus, setActiveStimulus] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'DISCONNECTED' | 'CONNECTING' | 'CONNECTED'>('CONNECTING');
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Simulate connection sequence
    const timer = setTimeout(() => setConnectionStatus('CONNECTED'), 1500);
    return () => clearTimeout(timer);
  }, []);

  // Auto-scroll to bottom whenever logs update
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  useEffect(() => {
    if (connectionStatus === 'CONNECTED') {
        const interval = setInterval(() => {
            const messages = [
                "Medea: Sampling latent space...",
                "Inverse Model: Generating candidate intervention...",
                "Forward Model: Predicting morphogenetic drift...",
                "Optimizer: Maximizing information gain (Infotaxis)...",
                "MomBot: Adjusting bio-electric field...",
                "MomBot: Calibrating optical sensors...",
                "Synmorpho: Deviation detected in sector 4...",
            ];
            const msg = messages[Math.floor(Math.random() * messages.length)];
            const timestamp = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
            
            // Append log instead of replacing/slicing to retain history
            setLogs(prev => [...prev, `[${timestamp}] ${msg}`]);
        }, 2000);
        return () => clearInterval(interval);
    }
  }, [connectionStatus]);

  const handleExportLogs = () => {
      const logContent = logs.join('\n');
      const blob = new Blob([logContent], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mombot_logs_${Date.now()}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
        <div className="bg-slate-950 border border-neon-cyan/50 w-[900px] h-[600px] rounded-xl shadow-[0_0_50px_rgba(0,243,255,0.15)] flex flex-col overflow-hidden relative">
            
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-900/50">
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded border ${connectionStatus === 'CONNECTED' ? 'border-neon-cyan bg-neon-cyan/10 text-neon-cyan' : 'border-slate-600 bg-slate-800 text-slate-500'}`}>
                        <Bot size={24} />
                    </div>
                    <div>
                        <h2 className="font-display font-bold text-xl text-white tracking-wider">MOMBOT <span className="text-neon-cyan">NEURALINK</span></h2>
                        <div className="flex items-center gap-2 text-[10px] font-mono">
                            <span className={`w-2 h-2 rounded-full ${connectionStatus === 'CONNECTED' ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
                            <span className="text-slate-400">HARDWARE INTERFACE: {connectionStatus}</span>
                        </div>
                    </div>
                </div>
                <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
                    <X size={24} />
                </button>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex p-4 gap-4 overflow-hidden">
                
                {/* Left Column: Medea AI (Brain) */}
                <div className="flex-1 flex flex-col gap-4 bg-slate-900/30 rounded border border-slate-800 p-4">
                    <div className="flex items-center gap-2 text-neon-magenta font-bold font-display border-b border-slate-800 pb-2 mb-2">
                        <BrainCircuit size={18} />
                        <h3>MEDEA AI CORE</h3>
                    </div>
                    
                    {/* Active Inference Visualizer (Mock) */}
                    <div className="flex-1 bg-black rounded border border-slate-800 relative overflow-hidden flex items-center justify-center">
                        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-10 mix-blend-overlay"></div>
                        {/* Schematic Diagram Logic from PDF */}
                        <div className="text-center space-y-4 relative z-10">
                            <div className="flex justify-center gap-8 text-xs font-mono text-slate-500">
                                <div className="p-2 border border-slate-700 rounded bg-slate-900">Inverse Model</div>
                                <div className="p-2 border border-slate-700 rounded bg-slate-900">Forward Model</div>
                            </div>
                            <div className="w-px h-8 bg-slate-700 mx-auto"></div>
                            <div className="p-3 border border-neon-magenta/50 rounded bg-neon-magenta/10 text-neon-magenta font-bold animate-pulse">
                                OPTIMIZER (INFOTAXIS)
                            </div>
                            <div className="w-px h-8 bg-slate-700 mx-auto"></div>
                            <div className="text-[10px] text-slate-400">SELECTING INTERVENTION...</div>
                        </div>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                        <div className="bg-slate-950 p-2 rounded">
                            <div className="text-slate-500">Model Uncertainty</div>
                            <div className="text-orange-400">12.4%</div>
                        </div>
                        <div className="bg-slate-950 p-2 rounded">
                            <div className="text-slate-500">Information Gain</div>
                            <div className="text-neon-cyan">0.89 bits</div>
                        </div>
                    </div>
                </div>

                {/* Center Column: MomBot Hardware (Body) */}
                <div className="flex-[1.5] flex flex-col gap-4 bg-slate-900/30 rounded border border-slate-800 p-4">
                     <div className="flex items-center gap-2 text-neon-green font-bold font-display border-b border-slate-800 pb-2 mb-2">
                        <Server size={18} />
                        <h3>MOMBOT HARDWARE</h3>
                    </div>

                    <div className="grid grid-cols-2 gap-3 h-full">
                        {/* Stimuli Controls */}
                        <div className="col-span-2 grid grid-cols-4 gap-2">
                            <button 
                                onClick={() => setActiveStimulus('CHEM')}
                                className={`p-3 rounded border flex flex-col items-center gap-2 transition-all ${activeStimulus === 'CHEM' ? 'bg-neon-green/20 border-neon-green text-neon-green' : 'bg-slate-950 border-slate-700 text-slate-400 hover:border-slate-500'}`}
                            >
                                <FlaskConical size={20} />
                                <span className="text-[10px] font-bold">CHEMICAL</span>
                            </button>
                            <button 
                                onClick={() => setActiveStimulus('ELEC')}
                                className={`p-3 rounded border flex flex-col items-center gap-2 transition-all ${activeStimulus === 'ELEC' ? 'bg-yellow-500/20 border-yellow-500 text-yellow-500' : 'bg-slate-950 border-slate-700 text-slate-400 hover:border-slate-500'}`}
                            >
                                <Zap size={20} />
                                <span className="text-[10px] font-bold">ELECTRICAL</span>
                            </button>
                            <button 
                                onClick={() => setActiveStimulus('TEMP')}
                                className={`p-3 rounded border flex flex-col items-center gap-2 transition-all ${activeStimulus === 'TEMP' ? 'bg-red-500/20 border-red-500 text-red-500' : 'bg-slate-950 border-slate-700 text-slate-400 hover:border-slate-500'}`}
                            >
                                <Thermometer size={20} />
                                <span className="text-[10px] font-bold">THERMAL</span>
                            </button>
                            <button 
                                onClick={() => setActiveStimulus('VIBE')}
                                className={`p-3 rounded border flex flex-col items-center gap-2 transition-all ${activeStimulus === 'VIBE' ? 'bg-blue-500/20 border-blue-500 text-blue-500' : 'bg-slate-950 border-slate-700 text-slate-400 hover:border-slate-500'}`}
                            >
                                <Waves size={20} />
                                <span className="text-[10px] font-bold">VIBRATION</span>
                            </button>
                        </div>

                        {/* Physical View Placeholder */}
                        <div className="col-span-2 flex-1 bg-black rounded border border-slate-800 relative overflow-hidden group">
                             {/* Mock Camera Feed */}
                             <div className="absolute inset-0 opacity-50 bg-[repeating-linear-gradient(0deg,transparent,transparent_1px,#000_1px,#000_2px)]"></div>
                             <div className="absolute top-2 left-2 text-[10px] font-mono text-green-500 flex items-center gap-1">
                                <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                                CAM_01: BIO_REACTOR
                             </div>
                             
                             {/* Central Graphic */}
                             <div className="absolute inset-0 flex items-center justify-center">
                                <div className="w-32 h-32 border border-slate-600 rounded-full flex items-center justify-center animate-[spin_10s_linear_infinite]">
                                    <div className="w-24 h-24 border border-dashed border-slate-600 rounded-full"></div>
                                </div>
                                <Activity className="text-slate-600 absolute" size={32} />
                             </div>

                             {/* Action Overlay */}
                             {activeStimulus && (
                                 <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-slate-900/90 border border-slate-500 px-4 py-1 rounded-full text-xs font-mono text-white flex items-center gap-2">
                                     <Play size={10} className="fill-current" />
                                     RUNNING: {activeStimulus}_PROTOCOL_V4
                                 </div>
                             )}
                        </div>
                    </div>
                </div>

                {/* Right Column: Logs */}
                <div className="w-48 flex flex-col gap-2 bg-black/50 rounded border border-slate-800 p-2 font-mono text-[10px]">
                    <div className="text-slate-500 border-b border-slate-800 pb-1 mb-1 flex items-center justify-between">
                        <span className="flex items-center gap-1"><Terminal size={10} /> SYSTEM LOG</span>
                        <button 
                            onClick={handleExportLogs} 
                            className="text-neon-cyan hover:text-white transition-colors"
                            title="Export Logs"
                        >
                            <Download size={10} />
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto space-y-1.5 custom-scrollbar">
                        {logs.map((log, i) => (
                            <div key={i} className="text-slate-300 break-words leading-tight opacity-80">
                                {log}
                            </div>
                        ))}
                        <div ref={logsEndRef} />
                    </div>
                </div>

            </div>

            {/* Footer */}
            <div className="p-3 bg-slate-950 border-t border-slate-800 flex justify-between items-center text-[10px] text-slate-500 font-mono">
                <div>LINKED: Tufts Allen Discovery Center // PORT: 443</div>
                <div className="flex gap-4">
                    <span>AGENTIAL_MAT_SYNC: 98%</span>
                    <span>ETHICS_MODULE: ACTIVE</span>
                </div>
            </div>

        </div>
    </div>
  );
};
