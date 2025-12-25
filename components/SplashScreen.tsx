import React, { useEffect, useState } from 'react';

interface SplashScreenProps {
  onComplete: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onComplete }) => {
  const [opacity, setOpacity] = useState(0);

  useEffect(() => {
    // Trigger fade in
    const fadeScan = requestAnimationFrame(() => setOpacity(1));

    // Start fade out sequence to match 2s total duration roughly
    const timerExit = setTimeout(() => {
      setOpacity(0);
    }, 2000);

    // Complete and unmount
    const timerComplete = setTimeout(() => {
      onComplete();
    }, 2500); // Slightly longer than 2s to allow fade out to finish

    return () => {
      cancelAnimationFrame(fadeScan);
      clearTimeout(timerExit);
      clearTimeout(timerComplete);
    };
  }, [onComplete]);

  return (
    <div 
      className="fixed inset-0 z-[200] bg-black flex flex-col items-center justify-center transition-opacity duration-500 ease-in-out cursor-none"
      style={{ opacity }}
    >
      <div className="flex flex-col items-center justify-center space-y-4">
        <pre className="text-white font-mono text-sm md:text-base text-center tracking-widest leading-loose">
Xeno-Genesis 2236 Copyright 2026
All Rights Reserved - Cat Game Research LLC
        </pre>
        
        {/* Subtle loading indicator */}
        <div className="flex gap-1 mt-8">
            <div className="w-1.5 h-1.5 bg-white animate-pulse"></div>
            <div className="w-1.5 h-1.5 bg-white animate-pulse delay-75"></div>
            <div className="w-1.5 h-1.5 bg-white animate-pulse delay-150"></div>
        </div>
      </div>
    </div>
  );
};