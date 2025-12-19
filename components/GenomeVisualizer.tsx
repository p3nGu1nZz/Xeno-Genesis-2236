import React from 'react';
import { Genome, CellType } from '../types';
import { COLORS } from '../constants';
import { Dna } from 'lucide-react';

interface GenomeVisualizerProps {
  genome: Genome | null;
}

export const GenomeVisualizer: React.FC<GenomeVisualizerProps> = ({ genome }) => {
  if (!genome) return null;

  const size = genome.gridSize;

  return (
    <div className="absolute bottom-6 right-6 w-64 bg-slate-900/90 border border-slate-700 rounded-lg p-4 backdrop-blur shadow-2xl z-20">
      <div className="flex items-center gap-2 mb-3 text-neon-cyan border-b border-slate-700 pb-2">
        <Dna size={18} />
        <span className="font-display font-bold text-sm">GENOME MAP</span>
      </div>

      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}>
        {genome.genes.map((row, y) => (
          row.map((cell, x) => {
            let style: React.CSSProperties = {};
            let className = "aspect-square rounded-sm transition-all duration-300 ";

            if (cell === CellType.SKIN) {
                style.backgroundColor = genome.color;
                style.boxShadow = `0 0 5px ${genome.color}`;
            } else if (cell === CellType.HEART) {
                className += "bg-red-500 shadow-[0_0_5px_#ef4444]";
            } else if (cell === CellType.NEURON) {
                className += "bg-yellow-500 shadow-[0_0_5px_#eab308]";
            } else {
                className += "bg-slate-800";
            }
            
            return (
              <div 
                key={`${x}-${y}`} 
                className={className}
                style={style}
              />
            );
          })
        ))}
      </div>

      <div className="mt-3 text-[10px] font-mono text-slate-400 space-y-1">
        <div className="flex justify-between">
            <span>ID:</span>
            <span className="text-white">{genome.id}</span>
        </div>
        <div className="flex justify-between">
            <span>PLASTICITY:</span>
            <span className="text-white">{genome.bioelectricMemory.toFixed(3)}</span>
        </div>
      </div>
    </div>
  );
};