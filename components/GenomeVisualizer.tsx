
import React, { useState, useRef, useEffect } from 'react';
import { Genome, CellType } from '../types';
import { Dna, Minus, GripHorizontal, Maximize2 } from 'lucide-react';

interface GenomeVisualizerProps {
  genome: Genome | null;
  label?: string;
  borderColor?: string;
  initialPosition?: { x: number, y: number };
  hidden: boolean;
  onMinimize: () => void;
}

export const GenomeVisualizer: React.FC<GenomeVisualizerProps> = ({ 
  genome, 
  label = "GENOME MAP", 
  borderColor = "border-slate-700",
  initialPosition = { x: 100, y: 100 },
  hidden,
  onMinimize
}) => {
  const [position, setPosition] = useState(initialPosition);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  
  // Drag Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragOffset({
        x: e.clientX - position.x,
        y: e.clientY - position.y
    });
  };

  const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
          setPosition({
              x: e.clientX - dragOffset.x,
              y: e.clientY - dragOffset.y
          });
      }
  };

  const handleMouseUp = () => {
      setIsDragging(false);
  };

  useEffect(() => {
      if (isDragging) {
          window.addEventListener('mousemove', handleMouseMove);
          window.addEventListener('mouseup', handleMouseUp);
      } else {
          window.removeEventListener('mousemove', handleMouseMove);
          window.removeEventListener('mouseup', handleMouseUp);
      }
      return () => {
          window.removeEventListener('mousemove', handleMouseMove);
          window.removeEventListener('mouseup', handleMouseUp);
      };
  }, [isDragging]);

  if (!genome) return null;
  const size = genome.gridSize;

  // Render hidden using display:none to preserve position state in React
  return (
    <div 
        className={`fixed w-64 bg-slate-900/90 border ${borderColor} rounded-lg p-4 backdrop-blur shadow-2xl z-20 transition-opacity duration-300`}
        style={{ 
            left: position.x, 
            top: position.y,
            display: hidden ? 'none' : 'block'
        }}
    >
      {/* Header / Drag Handle */}
      <div 
        className="flex items-center justify-between gap-2 mb-3 text-slate-300 border-b border-white/10 pb-2 cursor-move select-none"
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center gap-2">
            <GripHorizontal size={14} className="text-slate-500" />
            <span className="font-display font-bold text-sm text-white">{label}</span>
        </div>
        <button 
            onClick={onMinimize}
            className="text-slate-500 hover:text-white"
            title="Minimize to Toolbar"
        >
            <Minus size={14} />
        </button>
      </div>

      <div className="grid gap-1 pointer-events-none" style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}>
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

      <div className="mt-3 text-[10px] font-mono text-slate-400 space-y-1 select-none">
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
