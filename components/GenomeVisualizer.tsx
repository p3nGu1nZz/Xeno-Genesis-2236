import React, { useState, useEffect, useMemo } from 'react';
import { Genome, CellType } from '../types';
import { Dna, Minus, GripHorizontal } from 'lucide-react';

interface GenomeVisualizerProps {
  genome: Genome | null;
  label?: string;
  borderColor?: string;
  initialPosition?: { x: number, y: number };
  hidden?: boolean;
  onMinimize?: () => void;
}

export const GenomeVisualizer: React.FC<GenomeVisualizerProps> = ({ 
  genome, 
  label = "GENOME MAP", 
  borderColor = "border-slate-700",
  initialPosition = { x: 100, y: 100 },
  hidden = false,
  onMinimize
}) => {
  const [position, setPosition] = useState(initialPosition);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isCollapsed, setIsCollapsed] = useState(false);
  
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

  const graphData = useMemo(() => {
    if (!genome) return { nodes: [], links: [], width: 0, height: 0, offsetX: 0, offsetY: 0 };

    const nodes: {x: number, y: number, type: CellType, key: string}[] = [];
    const links: {x1: number, y1: number, x2: number, y2: number, key: string}[] = [];
    const gridSize = genome.gridSize;
    const spacing = 24; // Distance between nodes in the visualizer
    
    // 1. Identify Nodes & Calculate Bounding Box for Centering
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const tempNodes: {x: number, y: number, type: CellType, gx: number, gy: number}[] = [];

    for(let y=0; y<gridSize; y++) {
        for(let x=0; x<gridSize; x++) {
            if(genome.genes[y][x] !== CellType.EMPTY) {
                const nx = x * spacing;
                const ny = y * spacing;
                tempNodes.push({ x: nx, y: ny, type: genome.genes[y][x], gx: x, gy: y });
                
                if(nx < minX) minX = nx;
                if(nx > maxX) maxX = nx;
                if(ny < minY) minY = ny;
                if(ny > maxY) maxY = ny;
            }
        }
    }
    
    if (tempNodes.length === 0) return { nodes: [], links: [], width: 0, height: 0, offsetX: 0, offsetY: 0 };

    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;
    
    // Center in a fixed container size (e.g. 200x200)
    const CONTAINER_SIZE = 200;
    const offsetX = (CONTAINER_SIZE - contentWidth) / 2 - minX;
    const offsetY = (CONTAINER_SIZE - contentHeight) / 2 - minY;

    // 2. Finalize Node Positions
    const nodeMap = new Map<string, {x: number, y: number}>();

    tempNodes.forEach(n => {
        const finalX = n.x + offsetX;
        const finalY = n.y + offsetY;
        const key = `${n.gx},${n.gy}`;
        
        nodes.push({ 
            x: finalX, 
            y: finalY, 
            type: n.type, 
            key 
        });
        nodeMap.set(key, {x: finalX, y: finalY});
    });

    // 3. Create Links (Structural Connections)
    // Connect to Right, Down, Diagonal Right, Diagonal Left (structural neighbors)
    const directions = [[1,0], [0,1], [1,1], [-1,1]];
    
    tempNodes.forEach(n => {
        const p1 = nodeMap.get(`${n.gx},${n.gy}`);
        if(!p1) return;

        directions.forEach(([dx, dy]) => {
            const nx = n.gx + dx;
            const ny = n.gy + dy;
            const p2 = nodeMap.get(`${nx},${ny}`);
            
            if (p2) {
                links.push({
                    x1: p1.x, y1: p1.y,
                    x2: p2.x, y2: p2.y,
                    key: `${n.gx},${n.gy}-${nx},${ny}`
                });
            }
        });
    });

    return { nodes, links, width: CONTAINER_SIZE, height: CONTAINER_SIZE };
  }, [genome]);

  if (hidden || !genome) return null;

  // COLLAPSED VIEW (ICON)
  if (isCollapsed) {
      return (
          <div 
             className={`fixed z-40 bg-slate-900 border ${borderColor} rounded-full p-3 shadow-[0_0_15px_rgba(0,0,0,0.5)] cursor-pointer hover:scale-110 transition-transform`}
             style={{ left: position.x, top: position.y }}
             onMouseDown={handleMouseDown}
             onClick={(e) => { 
                 if (!isDragging) setIsCollapsed(false); 
             }}
          >
             <Dna size={20} className="text-white" />
          </div>
      );
  }

  // EXPANDED VIEW
  return (
    <div 
        className={`fixed w-[240px] bg-slate-900/90 border ${borderColor} rounded-lg p-3 backdrop-blur shadow-2xl z-20 transition-opacity duration-300`}
        style={{ left: position.x, top: position.y }}
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
            onClick={() => {
                setIsCollapsed(true);
                onMinimize?.();
            }}
            className="text-slate-500 hover:text-white"
        >
            <Minus size={14} />
        </button>
      </div>

      {/* GRAPH RENDERER */}
      <div className="relative w-full aspect-square bg-slate-950/60 rounded border border-slate-800/50 flex items-center justify-center overflow-hidden">
         <svg width="200" height="200" viewBox="0 0 200 200" className="overflow-visible">
            {/* Filters for Organic Glow */}
            <defs>
                <filter id="node-blur" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="3" result="blur"/>
                    <feComposite in="SourceGraphic" in2="blur" operator="over"/>
                </filter>
                <filter id="glow-strong" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="2.5" result="coloredBlur"/>
                    <feMerge>
                        <feMergeNode in="coloredBlur"/>
                        <feMergeNode in="SourceGraphic"/>
                    </feMerge>
                </filter>
            </defs>

            {/* Links (Structural Tissue) */}
            <g className="opacity-40">
                {graphData.links.map(l => (
                    <line 
                        key={l.key} 
                        x1={l.x1} y1={l.y1} 
                        x2={l.x2} y2={l.y2} 
                        stroke={genome.color} 
                        strokeWidth="1.5" 
                    />
                ))}
            </g>

            {/* Nodes (Cells) */}
            {graphData.nodes.map(n => {
                let fill = genome.color;
                if (n.type === CellType.HEART) fill = "#ef4444";
                if (n.type === CellType.NEURON) fill = "#eab308";
                
                return (
                    <g key={n.key} filter="url(#glow-strong)">
                        {/* Core Node */}
                        <circle 
                            cx={n.x} cy={n.y} r="4"
                            fill={fill}
                            opacity="0.9"
                        />
                        {/* Inner Highlight */}
                        <circle 
                            cx={n.x} cy={n.y} r="2"
                            fill="white"
                            opacity="0.4"
                        />
                    </g>
                );
            })}
         </svg>
      </div>

      <div className="mt-3 text-[10px] font-mono text-slate-400 space-y-1 select-none">
        <div className="flex justify-between border-b border-slate-800 pb-1 mb-1">
            <span>ID</span>
            <span className="text-white font-bold">{genome.id}</span>
        </div>
        <div className="flex justify-between">
            <span>FITNESS</span>
            <span className="text-neon-green">{genome.fitness.toFixed(1)}</span>
        </div>
        <div className="flex justify-between">
            <span>PLASTICITY</span>
            <span className="text-neon-cyan">{genome.bioelectricMemory.toFixed(3)}</span>
        </div>
      </div>
    </div>
  );
};