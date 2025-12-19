
import React from 'react';
import { AnalysisResult } from '../types';
import { X, Zap, ArrowRight } from 'lucide-react';

interface AnalysisPanelProps {
  result: AnalysisResult | null;
  onClose: () => void;
  onApplyUpgrade: () => void;
}

export const AnalysisPanel: React.FC<AnalysisPanelProps> = ({ result, onClose, onApplyUpgrade }) => {
  if (!result) return null;

  return (
    <div className="absolute top-6 right-6 w-96 bg-slate-950/95 border border-neon-cyan/50 text-slate-100 p-6 rounded-lg shadow-[0_0_30px_rgba(0,243,255,0.2)] backdrop-blur-xl z-50 animate-in fade-in slide-in-from-right-10 duration-300">
      <div className="flex justify-between items-start mb-4">
        <h2 className="text-xl font-display text-neon-cyan flex items-center gap-2">
          <span className="w-2 h-6 bg-neon-cyan block"></span>
          MORPHOLOGY REPORT
        </h2>
        <button onClick={onClose} className="text-slate-400 hover:text-white">
          <X size={20} />
        </button>
      </div>
      
      <div className="space-y-4 font-mono text-sm h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
        <div>
          <h3 className="text-slate-400 text-xs uppercase tracking-wider mb-1">Structural Analysis</h3>
          <p className="leading-relaxed text-slate-300 border-l-2 border-slate-700 pl-3">
            {result.analysis}
          </p>
        </div>

        <div>
          <h3 className="text-slate-400 text-xs uppercase tracking-wider mb-1">Evolutionary Suggestion</h3>
          <p className="leading-relaxed text-neon-green/90 border-l-2 border-neon-green/30 pl-3">
            {result.suggestion}
          </p>
          
          {/* Autonomous Upgrade Button */}
          <button 
            onClick={onApplyUpgrade}
            className="mt-3 w-full group relative overflow-hidden bg-neon-green/10 hover:bg-neon-green/20 border border-neon-green/50 text-neon-green text-xs font-bold py-3 px-4 rounded transition-all flex items-center justify-between"
          >
             <div className="flex items-center gap-2">
                <Zap size={14} className="fill-current" />
                <span>APPLY CRISPR UPGRADE</span>
             </div>
             <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
             
             {/* Scanline effect */}
             <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]"></div>
          </button>
        </div>

        <div>
          <h3 className="text-slate-400 text-xs uppercase tracking-wider mb-1">Biological Context</h3>
          <p className="leading-relaxed text-purple-300 border-l-2 border-purple-500/30 pl-3">
            {result.biologicalContext}
          </p>
        </div>
      </div>
      
      <div className="mt-4 pt-4 border-t border-slate-800 text-[10px] text-slate-500 font-mono text-center">
        GALACTIC FEDERATION SCIENCE DIVISION
      </div>
    </div>
  );
};
