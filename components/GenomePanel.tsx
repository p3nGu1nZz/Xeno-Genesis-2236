
import React, { useState } from 'react';
import { Genome } from '../types';
import { GenomeVisualizer } from './GenomeVisualizer';
import { ArrowLeft, Dna, Activity, X } from 'lucide-react';

interface GenomePanelProps {
  genomes: { name: string; genome: Genome | null; color: string }[];
  hidden: boolean;
  onClose: () => void;
}

export const GenomePanel: React.FC<GenomePanelProps> = ({ genomes, hidden, onClose }) => {
  const [selectedGenomeIndex, setSelectedGenomeIndex] = useState<number | null>(null);

  if (hidden) return null;

  const selectedData = selectedGenomeIndex !== null ? genomes[selectedGenomeIndex] : null;

  return (
    <div className="fixed top-24 left-24 z-40 flex flex-col items-start animate-in fade-in zoom-in-95 duration-200">
        {/* Main Panel Container */}
        <div className="bg-slate-900/95 border border-slate-700 rounded-lg p-4 backdrop-blur-md shadow-2xl w-[320px]">
            
            {/* Header */}
            <div className="flex justify-between items-center mb-4 border-b border-slate-700 pb-3">
                <h3 className="font-display font-bold text-slate-200 flex items-center gap-2 text-sm">
                    <Activity size={16} className="text-neon-cyan"/>
                    GENOME DATABASE
                </h3>
                <button 
                    onClick={onClose}
                    className="text-slate-500 hover:text-white transition-colors"
                >
                    <X size={16} />
                </button>
            </div>

            {/* View Switching */}
            {selectedData && selectedData.genome ? (
                // DETAIL VIEW
                <div className="flex flex-col gap-4">
                    <button 
                        onClick={() => setSelectedGenomeIndex(null)}
                        className="flex items-center gap-2 text-xs font-mono text-slate-400 hover:text-white transition-colors bg-slate-800/50 p-2 rounded hover:bg-slate-800"
                    >
                        <ArrowLeft size={14} /> RETURN TO LIST
                    </button>
                    
                    <div className="bg-slate-950/50 rounded p-2 border border-slate-800">
                         <div className="text-xs font-mono text-neon-cyan mb-2 uppercase tracking-widest font-bold border-b border-slate-800 pb-1">
                             {selectedData.name}
                         </div>
                         <GenomeVisualizer 
                             genome={selectedData.genome} 
                             embedded={true} 
                             spacing={45} 
                         />
                    </div>
                </div>
            ) : (
                // LIST VIEW
                <div className="flex flex-col gap-2">
                    <div className="text-[10px] uppercase text-slate-500 font-mono tracking-widest mb-1">Active Neural Groups</div>
                    {genomes.map((g, idx) => (
                        <button
                            key={idx}
                            onClick={() => setSelectedGenomeIndex(idx)}
                            disabled={!g.genome}
                            className={`flex items-center gap-3 p-3 rounded border transition-all text-left group relative overflow-hidden ${
                                g.genome 
                                ? 'bg-slate-800 border-slate-700 hover:border-neon-cyan hover:bg-slate-750' 
                                : 'bg-slate-900/50 border-slate-800 opacity-50 cursor-not-allowed'
                            }`}
                        >
                            <div className="relative z-10 p-2 rounded bg-slate-900 border border-slate-700 group-hover:border-white/20">
                                <Dna size={18} style={{ color: g.color }} />
                            </div>
                            <div className="relative z-10 flex flex-col">
                                <span className="text-xs font-bold text-slate-200 group-hover:text-neon-cyan transition-colors">{g.name}</span>
                                <span className="text-[10px] text-slate-500 font-mono">
                                    {g.genome ? `ID: ${g.genome.id.substring(0,8)}` : 'ANALYZING...'}
                                </span>
                            </div>
                            {g.genome && (
                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-white/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                            )}
                        </button>
                    ))}
                    
                    <div className="mt-4 pt-3 border-t border-slate-800">
                        <div className="text-[10px] text-slate-500 font-mono leading-relaxed">
                            Select a group to view detailed morphology and neural topology.
                        </div>
                    </div>
                </div>
            )}
        </div>
    </div>
  );
};
