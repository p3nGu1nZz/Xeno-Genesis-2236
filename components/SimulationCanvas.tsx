import React, { useRef, useEffect } from 'react';
import { Xenobot, CameraState, Food, CellType } from '../types';
import { COLORS } from '../constants';

interface SimulationCanvasProps {
  botsRef: React.MutableRefObject<Xenobot[]>;
  foodRef: React.MutableRefObject<Food[]>;
  width: number;
  height: number;
  groundY: number;
  camera: CameraState;
  followingBotId: string | null;
  isRunning: boolean;
}

export const SimulationCanvas: React.FC<SimulationCanvasProps> = ({
  botsRef,
  foodRef,
  width,
  height,
  groundY,
  camera,
  followingBotId,
  isRunning
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const render = () => {
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      // Background
      ctx.fillStyle = '#020408';
      ctx.fillRect(0, 0, width, height);

      // Camera
      ctx.save();
      ctx.translate(width / 2, height / 2);
      ctx.scale(camera.zoom, camera.zoom);
      ctx.translate(-camera.x, -camera.y);

      // Grid/Ground
      ctx.beginPath();
      ctx.moveTo(-20000, groundY > 0 ? groundY : 1000);
      ctx.lineTo(20000, groundY > 0 ? groundY : 1000);
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Render Food
      for (const f of foodRef.current) {
         ctx.beginPath();
         ctx.arc(f.x, f.y, 4, 0, Math.PI * 2);
         ctx.fillStyle = COLORS.FOOD;
         ctx.shadowColor = COLORS.FOOD;
         ctx.shadowBlur = 10;
         ctx.fill();
         ctx.shadowBlur = 0;
      }

      // Render Bots
      const bots = botsRef.current;
      for (const bot of bots) {
        if (bot.isDead) continue;
        
        // Draw Springs
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        for (const s of bot.springs) {
           const p1 = bot.particles[s.p1];
           const p2 = bot.particles[s.p2];
           
           ctx.beginPath();
           ctx.moveTo(p1.renderPos.x, p1.renderPos.y);
           ctx.lineTo(p2.renderPos.x, p2.renderPos.y);
           
           if (s.isMuscle) {
               ctx.strokeStyle = COLORS.SPRING_ACTIVE;
           } else {
               ctx.strokeStyle = COLORS.SPRING_PASSIVE;
           }
           ctx.stroke();
        }

        // Draw Particles
        for (const p of bot.particles) {
            ctx.beginPath();
            ctx.arc(p.renderPos.x, p.renderPos.y, 5, 0, Math.PI*2);
            if (p.charge > 0) ctx.fillStyle = COLORS.NEURON;
            else ctx.fillStyle = '#ffffff';
            ctx.fill();
        }
        
        // Visualizing Absorption (Conscious Experience)
        if (bot.absorption > 0.01) {
            const com = bot.centerOfMass;
            const time = Date.now() * 0.002;
            
            // Expanding Ripples (Cyan Aura)
            for(let r=0; r<2; r++) {
                const cycle = (time + r * 0.5) % 1.5; 
                const progress = cycle / 1.5; 
                
                const radius = 10 + (60 * bot.absorption) * progress;
                const alpha = (1.0 - progress) * bot.absorption * 0.8;
                
                if (alpha > 0.01) {
                    ctx.beginPath();
                    ctx.arc(com.x, com.y, radius, 0, Math.PI * 2);
                    ctx.strokeStyle = `rgba(0, 243, 255, ${alpha})`;
                    ctx.lineWidth = 1 + bot.absorption;
                    ctx.stroke();
                }
            }
            
            // Core Glow
            ctx.beginPath();
            ctx.arc(com.x, com.y, 8 + 20 * bot.absorption, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(0, 243, 255, ${bot.absorption * 0.15})`;
            ctx.fill();
        }
        
        // Highlight selection
        if (followingBotId === bot.id) {
            const com = bot.centerOfMass;
            ctx.beginPath();
            ctx.arc(com.x, com.y, 60, 0, Math.PI*2);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 5]);
            ctx.stroke();
            ctx.setLineDash([]);
        }
      }

      ctx.restore();
      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [width, height, camera, followingBotId, isRunning, groundY]);

  return <canvas ref={canvasRef} className="block cursor-crosshair" />;
};
