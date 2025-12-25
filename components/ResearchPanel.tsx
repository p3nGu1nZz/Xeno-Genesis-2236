
import React from 'react';
import { Upgrade, UpgradeID } from '../types';
import { UPGRADES } from '../constants';
import { X, Lock, Check, FlaskConical, Dna, Wind, Users, Bot, TrendingUp, Leaf } from 'lucide-react';

interface ResearchPanelProps {
  bioData: number;
  unlockedUpgrades: UpgradeID[];
  onPurchase: (upgrade: Upgrade) => void;
  onClose: () => void;
}

const IconMap: Record<string, React.FC<any>> = {
    'Leaf': Leaf,
    'Wind': Wind,
    'Dna': Dna,
    'Users': Users,
    'Bot': Bot,
    'TrendingUp': TrendingUp
};

export const ResearchPanel: React.FC<ResearchPanelProps> = ({ 
  bioData, 
  unlockedUpgrades, 
  onPurchase, 
  onClose 
}) => {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-slate-900 border border-neon-magenta/50 w-[700px] max-h-[80vh] flex flex-col rounded-xl shadow-[0_0_60px_rgba(255,0,255,0.15)] overflow-hidden">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-800 bg-slate-950 flex justify-between items-center">
            <div className="flex items-center gap-3">
                <div className="p-2 bg-neon-magenta/10 rounded border border-neon-magenta/50 text-neon-magenta">
                    <FlaskConical size={24} />
                </div>
                <div>
                    <h2 className="font-display font-bold text-xl text-white tracking-wider">RESEARCH LAB</h2>
                    <div className="text-xs font-mono text-slate-400">AVAILABLE BIO-DATA: <span className="text-neon-cyan font-bold">{Math.floor(bioData)} BD</span></div>
                </div>
            </div>
            <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
                <X size={24} />
            </button>
        </div>

        {/* Upgrades List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3 custom-scrollbar">
            {UPGRADES.map((upgrade) => {
                const isUnlocked = unlockedUpgrades.includes(upgrade.id);
                const canAfford = bioData >= upgrade.cost;
                const Icon = IconMap[upgrade.icon] || FlaskConical;

                return (
                    <div 
                        key={upgrade.id}
                        className={`relative p-4 rounded-lg border flex items-center gap-4 transition-all ${
                            isUnlocked 
                                ? 'bg-slate-900/50 border-neon-green/30 opacity-70' 
                                : canAfford 
                                    ? 'bg-slate-800/80 border-slate-600 hover:border-neon-cyan hover:bg-slate-800' 
                                    : 'bg-slate-950 border-slate-800 opacity-60'
                        }`}
                    >
                        <div className={`p-3 rounded-full border ${isUnlocked ? 'border-neon-green bg-neon-green/10 text-neon-green' : 'border-slate-700 bg-slate-900 text-slate-400'}`}>
                            {isUnlocked ? <Check size={20} /> : <Icon size={20} />}
                        </div>
                        
                        <div className="flex-1">
                            <h3 className={`font-bold font-display ${isUnlocked ? 'text-neon-green' : 'text-white'}`}>{upgrade.name}</h3>
                            <p className="text-xs text-slate-400 font-mono leading-relaxed">{upgrade.description}</p>
                        </div>

                        <div className="flex flex-col items-end gap-1 min-w-[100px]">
                            {isUnlocked ? (
                                <span className="text-xs font-bold text-neon-green border border-neon-green/30 px-2 py-1 rounded bg-neon-green/5">PURCHASED</span>
                            ) : (
                                <button
                                    onClick={() => onPurchase(upgrade)}
                                    disabled={!canAfford}
                                    className={`px-4 py-2 rounded font-mono font-bold text-xs border transition-all ${
                                        canAfford 
                                            ? 'bg-neon-magenta text-white border-neon-magenta hover:bg-fuchsia-500 shadow-[0_0_15px_rgba(255,0,255,0.4)]' 
                                            : 'bg-transparent text-slate-500 border-slate-700 cursor-not-allowed'
                                    }`}
                                >
                                    {upgrade.cost} BD
                                </button>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
        
        <div className="p-4 bg-slate-950 border-t border-slate-800 text-[10px] text-slate-500 font-mono text-center">
            RESEARCH ENABLES NEW MORPHOLOGICAL POSSIBILITIES
        </div>

      </div>
    </div>
  );
};
