import React, { useState, useRef } from 'react';
import { SimulationConfig, SaveData, Genome } from '../types';
import { Save, Upload, RefreshCw, X, Sliders } from 'lucide-react';

interface SettingsPanelProps {
  config: SimulationConfig;
  onSave: (newConfig: SimulationConfig) => void;
  onLoad: (data: SaveData) => void;
  onClose: () => void;
  population: Genome[];
  generation: number;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ 
  config, 
  onSave, 
  onLoad, 
  onClose,
  population,
  generation
}) => {
  const [localConfig, setLocalConfig] = useState<SimulationConfig>({ ...config });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleChange = (key: keyof SimulationConfig, value: number) => {
    setLocalConfig(prev => ({ ...prev, [key]: value }));
  };

  const handleExport = () => {
    const data: SaveData = {
      config: localConfig,
      population,
      generation,
      timestamp: Date.now()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `xenogenesis_save_${generation}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string) as SaveData;
        if (data.config && data.population) {
            onLoad(data);
        } else {
            alert("Invalid save file format.");
        }
      } catch (err) {
        alert("Failed to parse save file.");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-slate-900 border border-neon-cyan/50 w-[500px] max-h-[90vh] overflow-y-auto rounded-xl shadow-[0_0_50px_rgba(0,243,255,0.1)] flex flex-col">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-950">
          <div className="flex items-center gap-2 text-neon-cyan">
            <Sliders size={20} />
            <h2 className="font-display font-bold text-xl">SIMULATION CONFIG</h2>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 font-mono text-sm text-slate-300">
          
          {/* Section: Population */}
          <div className="space-y-3">
             <label className="text-xs uppercase text-slate-500 font-bold tracking-wider">Colony Parameters</label>
             
             <div className="space-y-1">
                <div className="flex justify-between">
                    <span>Initial Population Size</span>
                    <span className="text-neon-cyan">{localConfig.populationSize}</span>
                </div>
                <input 
                    type="range" min="4" max="40" step="2"
                    value={localConfig.populationSize}
                    onChange={(e) => handleChange('populationSize', parseInt(e.target.value))}
                    className="w-full accent-neon-cyan h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                />
             </div>

             <div className="space-y-1">
                <div className="flex justify-between">
                    <span>Max Population Cap</span>
                    <span className="text-neon-cyan">{localConfig.maxPopulationSize || 100}</span>
                </div>
                <input 
                    type="range" min="20" max="500" step="10"
                    value={localConfig.maxPopulationSize || 100}
                    onChange={(e) => handleChange('maxPopulationSize', parseInt(e.target.value))}
                    className="w-full accent-neon-cyan h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                />
                <div className="text-[10px] text-slate-500">
                    Determines maximum growth limit via reproduction. High values affect performance.
                </div>
             </div>

             <div className="space-y-1">
                <div className="flex justify-between">
                    <span>Training Time (Ticks)</span>
                    <span className="text-neon-cyan">{localConfig.generationDuration || 600}</span>
                </div>
                <input 
                    type="range" min="300" max="2000" step="50"
                    value={localConfig.generationDuration || 600}
                    onChange={(e) => handleChange('generationDuration', parseInt(e.target.value))}
                    className="w-full accent-neon-cyan h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                />
             </div>

             <div className="space-y-1">
                <div className="flex justify-between">
                    <span>Xenobot Scale</span>
                    <span className="text-neon-cyan">{localConfig.gridScale}px</span>
                </div>
                <input 
                    type="range" min="20" max="80" step="1"
                    value={localConfig.gridScale}
                    onChange={(e) => handleChange('gridScale', parseInt(e.target.value))}
                    className="w-full accent-neon-cyan h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                />
             </div>
          </div>

          <hr className="border-slate-800" />

          {/* Section: Physics */}
          <div className="space-y-3">
             <label className="text-xs uppercase text-slate-500 font-bold tracking-wider">Fluidic Physics</label>
             
             <div className="space-y-1">
                <div className="flex justify-between">
                    <span>Gravity/Buoyancy</span>
                    <span className="text-neon-cyan">{localConfig.gravity.toFixed(2)}</span>
                </div>
                <input 
                    type="range" min="0.05" max="1.0" step="0.05"
                    value={localConfig.gravity}
                    onChange={(e) => handleChange('gravity', parseFloat(e.target.value))}
                    className="w-full accent-neon-cyan h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                />
             </div>

             <div className="space-y-1">
                <div className="flex justify-between">
                    <span>Fluid Friction (Viscosity)</span>
                    <span className="text-neon-cyan">{localConfig.friction.toFixed(3)}</span>
                </div>
                <input 
                    type="range" min="0.800" max="0.999" step="0.001"
                    value={localConfig.friction}
                    onChange={(e) => handleChange('friction', parseFloat(e.target.value))}
                    className="w-full accent-neon-cyan h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                />
             </div>
             
             <div className="space-y-1">
                <div className="flex justify-between">
                    <span>Plasticity (Adaptation Rate)</span>
                    <span className="text-neon-cyan">{localConfig.plasticity.toFixed(4)}</span>
                </div>
                <input 
                    type="range" min="0.0001" max="0.01" step="0.0001"
                    value={localConfig.plasticity}
                    onChange={(e) => handleChange('plasticity', parseFloat(e.target.value))}
                    className="w-full accent-neon-cyan h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                />
             </div>

             <div className="space-y-1">
                <div className="flex justify-between">
                    <span>Sync Rate / Smoothing (Low = Smooth)</span>
                    <span className="text-neon-cyan">{localConfig.syncRate?.toFixed(2) || '0.50'}</span>
                </div>
                <input 
                    type="range" min="0.01" max="1.0" step="0.01"
                    value={localConfig.syncRate || 0.5}
                    onChange={(e) => handleChange('syncRate', parseFloat(e.target.value))}
                    className="w-full accent-neon-cyan h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                />
             </div>
          </div>

          <hr className="border-slate-800" />

          {/* Section: Save/Load */}
           <div className="space-y-3">
             <label className="text-xs uppercase text-slate-500 font-bold tracking-wider">Data Persistence</label>
             <div className="flex gap-2">
                <button 
                    onClick={handleExport}
                    className="flex-1 flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-white py-2 rounded border border-slate-600 transition-colors"
                >
                    <Save size={16} /> Export Save
                </button>
                <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-white py-2 rounded border border-slate-600 transition-colors"
                >
                    <Upload size={16} /> Load Save
                </button>
                <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleImport} 
                    className="hidden" 
                    accept=".json"
                />
             </div>
           </div>

        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-800 bg-slate-950/50">
            <button 
                onClick={() => onSave(localConfig)}
                className="w-full bg-neon-cyan text-black font-bold font-display py-3 rounded hover:bg-cyan-400 transition-colors flex items-center justify-center gap-2"
            >
                <RefreshCw size={18} className="animate-spin-slow" />
                APPLY & RESTART SIMULATION
            </button>
            <p className="text-center text-[10px] text-slate-500 mt-2">
                Warning: Changing configuration requires reconstructing the physics world.
            </p>
        </div>

      </div>
    </div>
  );
};