
import React, { useMemo } from 'react';
import { GeneticStats } from '../types';

interface GeneticDriftChartProps {
  data: GeneticStats[];
  width?: number;
  height?: number;
}

export const GeneticDriftChart: React.FC<GeneticDriftChartProps> = ({ 
  data, 
  width = 500, 
  height = 300 
}) => {
  const chartData = useMemo(() => {
      // Normalize data to percentages (0-100)
      return data.map(d => {
          const safeTotal = d.total || 1;
          return {
              gen: d.generation,
              skin: (d.skin / safeTotal) * 100,
              heart: (d.heart / safeTotal) * 100,
              neuron: (d.neuron / safeTotal) * 100
          };
      });
  }, [data]);

  if (chartData.length < 2) {
      return (
          <div className="flex items-center justify-center h-full text-xs font-mono text-slate-500">
              GATHERING DATA...
          </div>
      );
  }

  // Calculate SVG paths
  const padding = 20;
  const chartW = width - padding * 2;
  const chartH = height - padding * 2;

  const minGen = chartData[0].gen;
  const maxGen = chartData[chartData.length - 1].gen;
  const genRange = maxGen - minGen || 1;

  const getX = (gen: number) => padding + ((gen - minGen) / genRange) * chartW;
  const getY = (val: number) => height - padding - (val / 100) * chartH;

  // Create paths
  const createPath = (key: 'skin' | 'heart' | 'neuron') => {
      return chartData.map((d, i) => 
          `${i === 0 ? 'M' : 'L'} ${getX(d.gen).toFixed(1)} ${getY(d[key]).toFixed(1)}`
      ).join(' ');
  };

  const skinPath = createPath('skin');
  const heartPath = createPath('heart');
  const neuronPath = createPath('neuron');

  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
       {/* Grid Lines */}
       <g opacity="0.1">
           <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#fff" strokeWidth="1" />
           <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#fff" strokeWidth="1" />
           <line x1={padding} y1={height/2} x2={width - padding} y2={height/2} stroke="#fff" strokeDasharray="4 4" />
       </g>
       
       {/* Areas (Gradient Fill) */}
       <defs>
           <linearGradient id="grad-skin" x1="0" y1="0" x2="0" y2="1">
               <stop offset="0%" stopColor="#00f3ff" stopOpacity="0.2"/>
               <stop offset="100%" stopColor="#00f3ff" stopOpacity="0"/>
           </linearGradient>
           <linearGradient id="grad-heart" x1="0" y1="0" x2="0" y2="1">
               <stop offset="0%" stopColor="#ef4444" stopOpacity="0.2"/>
               <stop offset="100%" stopColor="#ef4444" stopOpacity="0"/>
           </linearGradient>
           <linearGradient id="grad-neuron" x1="0" y1="0" x2="0" y2="1">
               <stop offset="0%" stopColor="#eab308" stopOpacity="0.2"/>
               <stop offset="100%" stopColor="#eab308" stopOpacity="0"/>
           </linearGradient>
       </defs>
       
       <path d={`${skinPath} L ${width-padding} ${height-padding} L ${padding} ${height-padding} Z`} fill="url(#grad-skin)" />
       <path d={`${heartPath} L ${width-padding} ${height-padding} L ${padding} ${height-padding} Z`} fill="url(#grad-heart)" />
       <path d={`${neuronPath} L ${width-padding} ${height-padding} L ${padding} ${height-padding} Z`} fill="url(#grad-neuron)" />

       {/* Lines */}
       <path d={skinPath} stroke="#00f3ff" strokeWidth="2" fill="none" strokeLinecap="round" />
       <path d={heartPath} stroke="#ef4444" strokeWidth="2" fill="none" strokeLinecap="round" />
       <path d={neuronPath} stroke="#eab308" strokeWidth="2" fill="none" strokeLinecap="round" />
       
       {/* Labels at the end */}
       <text x={width - padding + 5} y={getY(chartData[chartData.length-1].skin)} fill="#00f3ff" fontSize="10" fontFamily="monospace">SKIN</text>
       <text x={width - padding + 5} y={getY(chartData[chartData.length-1].heart)} fill="#ef4444" fontSize="10" fontFamily="monospace">HEART</text>
       <text x={width - padding + 5} y={getY(chartData[chartData.length-1].neuron)} fill="#eab308" fontSize="10" fontFamily="monospace">NEURON</text>
    </svg>
  );
};
