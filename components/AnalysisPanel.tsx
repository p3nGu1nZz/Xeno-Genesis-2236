
import React, { useState } from 'react';
import { AnalysisResult } from '../types';
import { X, Share2, Copy, Twitter, Facebook, Linkedin, Mail, Zap, BrainCircuit } from 'lucide-react';

interface AnalysisPanelProps {
  result: AnalysisResult | null;
  onClose: () => void;
}

export const AnalysisPanel: React.FC<AnalysisPanelProps> = ({ result, onClose }) => {
  const [showShare, setShowShare] = useState(false);

  if (!result) return null;

  const handleShare = (platform: string) => {
    const text = encodeURIComponent(`Xenobot Analysis Report:\n\n${result.analysis.substring(0, 100)}...`);
    const url = encodeURIComponent(window.location.href);

    let shareUrl = '';
    switch (platform) {
      case 'twitter':
        shareUrl = `https://twitter.com/intent/tweet?text=${text}&url=${url}`;
        break;
      case 'facebook':
        shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${url}`;
        break;
      case 'linkedin':
        shareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${url}`;
        break;
      case 'email':
        shareUrl = `mailto:?subject=Xenobot Analysis&body=${text}%0A%0A${url}`;
        break;
      case 'copy':
        navigator.clipboard.writeText(`${decodeURIComponent(text)}\n\n${decodeURIComponent(url)}`);
        break;
    }

    if (platform !== 'copy' && shareUrl) {
      window.open(shareUrl, '_blank', 'width=600,height=400');
    }
    setShowShare(false);
  };

  return (
    <div className="absolute top-6 right-6 w-96 bg-slate-950/95 border border-neon-cyan/50 text-slate-100 p-6 rounded-lg shadow-[0_0_30px_rgba(0,243,255,0.2)] backdrop-blur-xl z-50 animate-in fade-in slide-in-from-right-10 duration-300">
      
      {/* Share Modal Overlay */}
      {showShare && (
        <div className="absolute inset-0 z-20 bg-slate-900/95 flex flex-col items-center justify-center p-6 rounded-lg animate-in fade-in duration-200">
           <h3 className="text-neon-cyan font-display text-lg mb-6 tracking-wider">TRANSMIT DATA</h3>
           <div className="grid grid-cols-4 gap-4 mb-6 w-full px-4">
             <button onClick={() => handleShare('twitter')} className="flex flex-col items-center gap-2 group">
                <div className="p-3 bg-slate-800 group-hover:bg-[#1DA1F2] rounded-lg transition-colors border border-slate-700 group-hover:border-[#1DA1F2]">
                    <Twitter size={20} className="text-slate-300 group-hover:text-white" />
                </div>
                <span className="text-[10px] text-slate-500 font-mono">TWITTER</span>
             </button>
             <button onClick={() => handleShare('facebook')} className="flex flex-col items-center gap-2 group">
                <div className="p-3 bg-slate-800 group-hover:bg-[#4267B2] rounded-lg transition-colors border border-slate-700 group-hover:border-[#4267B2]">
                    <Facebook size={20} className="text-slate-300 group-hover:text-white" />
                </div>
                <span className="text-[10px] text-slate-500 font-mono">FACEBOOK</span>
             </button>
             <button onClick={() => handleShare('linkedin')} className="flex flex-col items-center gap-2 group">
                <div className="p-3 bg-slate-800 group-hover:bg-[#0077b5] rounded-lg transition-colors border border-slate-700 group-hover:border-[#0077b5]">
                    <Linkedin size={20} className="text-slate-300 group-hover:text-white" />
                </div>
                <span className="text-[10px] text-slate-500 font-mono">LINKEDIN</span>
             </button>
             <button onClick={() => handleShare('email')} className="flex flex-col items-center gap-2 group">
                <div className="p-3 bg-slate-800 group-hover:bg-emerald-500 rounded-lg transition-colors border border-slate-700 group-hover:border-emerald-500">
                    <Mail size={20} className="text-slate-300 group-hover:text-white" />
                </div>
                <span className="text-[10px] text-slate-500 font-mono">EMAIL</span>
             </button>
           </div>
           
           <button 
              onClick={() => handleShare('copy')}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded border border-slate-700 hover:border-slate-500 transition-all text-xs font-mono text-slate-300 mb-6 w-full justify-center"
           >
              <Copy size={14} /> COPY REPORT TO CLIPBOARD
           </button>

           <button onClick={() => setShowShare(false)} className="text-slate-500 hover:text-white text-xs font-mono border-t border-slate-800 pt-4 w-full">
              CANCEL TRANSMISSION
           </button>
        </div>
      )}

      <div className="flex justify-between items-start mb-4">
        <h2 className="text-xl font-display text-neon-cyan flex items-center gap-2">
          <span className="w-2 h-6 bg-neon-cyan block"></span>
          MORPHOLOGY REPORT
        </h2>
        <div className="flex items-center gap-2">
            <button 
                onClick={() => setShowShare(true)} 
                className="bg-slate-800 text-neon-cyan border border-slate-700 p-2 rounded hover:bg-slate-700 transition-colors"
                title="Share Analysis"
            >
                <Share2 size={18} />
            </button>
            <button 
                onClick={onClose} 
                className="text-slate-400 hover:text-white transition-colors p-2 rounded hover:bg-white/5"
            >
                <X size={20} />
            </button>
        </div>
      </div>
      
      <div className="space-y-4 font-mono text-sm h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
        
        {/* New Mind-Body Section */}
        <div className="bg-slate-900 p-3 rounded border border-slate-800">
            <h3 className="text-xs uppercase tracking-wider mb-2 text-slate-400 flex items-center gap-2">
                Mind-Body Coherence
            </h3>
            <div className="grid grid-cols-2 gap-2 text-center">
                <div className="p-2 bg-slate-950 rounded border border-red-500/20">
                    <div className="text-red-400 text-xs mb-1 flex justify-center"><Zap size={14}/></div>
                    <div className="text-[10px] text-slate-500 uppercase">Mental Cause</div>
                    <div className="text-neon-cyan font-bold">Irruption</div>
                </div>
                <div className="p-2 bg-slate-950 rounded border border-green-500/20">
                    <div className="text-green-400 text-xs mb-1 flex justify-center"><BrainCircuit size={14}/></div>
                    <div className="text-[10px] text-slate-500 uppercase">Conscious Exp.</div>
                    <div className="text-neon-cyan font-bold">Absorption</div>
                </div>
            </div>
        </div>

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
