
import React from 'react';
import { X, TrendingUp } from 'lucide-react';
import { GeneticStats } from '../types';
import { GeneticDriftChart } from './GeneticDriftChart';

interface DriftPanelProps {
  isOpen: boolean;
  onClose: () => void;
  history: GeneticStats[];
}

export const DriftPanel: React.FC<DriftPanelProps> = ({ isOpen, onClose, history }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed bottom-24 left-24 z-40 animate-in fade-in slide-in-from-left-10 duration-300">
      <div className="bg-slate-900/95 border border-slate-700 rounded-lg p-4 backdrop-blur-md shadow-2xl w-[600px] h-[400px] flex flex-col">
        
        {/* Header */}
        <div className="flex justify-between items-center mb-4 border-b border-slate-700 pb-3">
            <h3 className="font-display font-bold text-slate-200 flex items-center gap-2 text-sm">
                <TrendingUp size={16} className="text-neon-cyan"/>
                GENETIC DRIFT ANALYSIS
            </h3>
            <button 
                onClick={onClose}
                className="text-slate-500 hover:text-white transition-colors"
            >
                <X size={16} />
            </button>
        </div>

        <div className="flex-1 bg-slate-950/50 rounded border border-slate-800 p-2 relative">
             <GeneticDriftChart data={history} width={550} height={280} />
        </div>

        <div className="mt-3 flex justify-between text-[10px] text-slate-500 font-mono">
            <span>START GEN: {history[0]?.generation || 0}</span>
            <span>CURRENT GEN: {history[history.length-1]?.generation || 0}</span>
        </div>
      </div>
    </div>
  );
};
