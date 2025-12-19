import React from 'react';
import { Genome, CellType } from '../types';
import { COLORS } from '../constants';
import { Dna } from 'lucide-react';

interface GenomeVisualizerProps {
  genome: Genome | null;
  label?: string;
  borderColor?: string;
  className?: string;
}

export const GenomeVisualizer: React.FC<GenomeVisualizerProps> = ({ 
  genome, 
  label = "GENOME MAP", 
  borderColor = "border-slate-700",
  className = "bottom-6 right-6" 
}) => {
  if (!genome) return null;

  const size = genome.gridSize;

  return (
    <div className={`absolute w-64 bg-slate-900/90 border ${borderColor} rounded-lg p-4 backdrop-blur shadow-2xl z-20 transition-all duration-500 ${className}`}>
      <div className="flex items-center gap-2 mb-3 text-slate-300 border-b border-white/10 pb-2">
        <Dna size={18} />
        <span className="font-display font-bold text-sm text-white">{label}</span>
      </div>

      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}>
        {genome.genes.map((row, y) => (
          row.map((cell, x) => {
            let style: React.CSSProperties = {};
            let cellClass = "aspect-square rounded-sm transition-all duration-300 ";

            if (cell === CellType.SKIN) {
                style.backgroundColor = genome.color;
                style.boxShadow = `0 0 5px ${genome.color}`;
            } else if (cell === CellType.HEART) {
                cellClass += "bg-red-500 shadow-[0_0_5px_#ef4444]";
            } else if (cell === CellType.NEURON) {
                cellClass += "bg-yellow-500 shadow-[0_0_5px_#eab308]";
            } else {
                cellClass += "bg-slate-800/50";
            }
            
            return (
              <div 
                key={`${x}-${y}`} 
                className={cellClass}
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
            <span>FITNESS:</span>
            <span className="text-white">{genome.fitness.toFixed(1)}</span>
        </div>
        <div className="flex justify-between">
            <span>PLASTICITY:</span>
            <span className="text-white">{genome.bioelectricMemory.toFixed(3)}</span>
        </div>
      </div>
    </div>
  );
};