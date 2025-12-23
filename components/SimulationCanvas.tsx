
import React, { useRef, useEffect, useLayoutEffect } from 'react';
import { Xenobot, CameraState, Food } from '../types';
import { COLORS, FOOD_RADIUS } from '../constants';

const MAX_PARTICLES = 128; 

const VS_SOURCE = `
  attribute vec2 position;
  void main() {
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

const FS_SOURCE = `
  precision mediump float;
  uniform vec2 u_resolution;
  uniform float u_time;
  uniform vec4 u_particles[${MAX_PARTICLES}]; // x, y, intensity, irruption
  uniform int u_count;
  uniform vec2 u_offset; 
  uniform float u_zoom;

  // Pseudo-random hash
  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  // 2D Noise
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    // Cubic Hermite Interpolation
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), f.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }

  // Fractional Brownian Motion
  float fbm(vec2 p) {
      float v = 0.0;
      float a = 0.5;
      mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
      for (int i = 0; i < 3; i++) {
          v += a * noise(p);
          p = rot * p * 2.0 + vec2(u_time * 0.1);
          a *= 0.5;
      }
      return v;
  }

  void main() {
    vec2 pixelCoord = gl_FragCoord.xy;
    
    // Scale field physics with zoom
    // We want the field radius to look consistent relative to the bot size
    float zoomScale = max(0.1, u_zoom);
    // Base radius reduced for tighter, sharper field visualization
    float radiusBase = 50.0 * zoomScale; 
    float radiusSq = radiusBase * radiusBase;
    
    float field = 0.0;
    float weightedIrruption = 0.0;
    
    for (int i = 0; i < ${MAX_PARTICLES}; i++) {
        if (i >= u_count) break;
        vec4 p = u_particles[i];
        
        // Convert JS screen coords (Top-Left 0,0) to GL coords (Bottom-Left 0,0)
        vec2 pPos = vec2(p.x, u_resolution.y - p.y);
        
        vec2 diff = pixelCoord - pPos;
        float distSq = dot(diff, diff);
        
        // Inverse square law for electric field
        // Add epsilon related to zoom to prevent singularity and aliasing at center
        float epsilon = 5.0 * zoomScale;
        float contrib = (p.z * radiusSq) / (distSq + epsilon); 
        
        field += contrib;
        weightedIrruption += p.w * contrib;
    }
    
    float avgIrruption = 0.0;
    if (field > 0.001) {
        avgIrruption = weightedIrruption / field;
    }
    
    // Calculate world space coordinates for consistent noise texture regardless of camera
    vec2 worldUV = (gl_FragCoord.xy / u_zoom) + u_offset;

    // Distortion Effect
    // Use the field strength to distort the UVs for the noise function
    // This creates a "heat shimmer" or "electric distortion" around active bots
    float distortNoise = noise(worldUV * 0.02 + vec2(u_time * 0.2));
    vec2 distortedUV = worldUV + vec2(distortNoise) * field * 10.0; // Distortion intensity scales with field

    // Electric arcs / filaments
    float n = fbm(distortedUV * 0.01 + vec2(0.0, u_time * 0.2));
    
    // Make arcs sharper
    float electricity = smoothstep(0.4, 0.45, n * field);
    
    // Dynamic Flow
    float flow = field * (0.5 + 0.6 * n);
    
    vec4 color = vec4(0.0);
    
    if (flow > 0.02) {
       // Color Gradient
       // Low Irruption: Deep Blue/Cyan
       // High Irruption: Magenta/Electric White
       
       vec3 cCalm = vec3(0.0, 0.5, 1.0); // Cyan/Blue
       vec3 cActive = vec3(1.0, 0.0, 0.8); // Magenta
       
       vec3 baseColor = mix(cCalm, cActive, clamp(avgIrruption * 1.5, 0.0, 1.0));
       
       // Core brightness
       vec3 cCore = mix(baseColor, vec3(1.0), 0.5);
       
       // Filament color
       vec3 cElec = vec3(0.8, 0.9, 1.0);

       // Composition
       float alpha = smoothstep(0.02, 0.2, flow);
       alpha = clamp(alpha, 0.0, 0.6); // Max opacity

       vec3 rgb = baseColor * flow * 1.5;
       
       // Add electric filaments
       rgb += cElec * electricity * 2.0;
       
       // Highlight centers
       rgb += cCore * smoothstep(0.8, 1.5, flow);

       color = vec4(rgb * alpha, alpha);
    }
    
    gl_FragColor = color;
  }
`;

interface SimulationCanvasProps {
  botsRef: React.MutableRefObject<Xenobot[]>; 
  foodRef: React.MutableRefObject<Food[]>;
  width: number;
  height: number;
  groundY: number;
  camera: CameraState;
  followingBotId: string | null;
}

export const SimulationCanvas: React.FC<SimulationCanvasProps> = ({ botsRef, foodRef, width, height, groundY, camera, followingBotId }) => {
  const canvas2dRef = useRef<HTMLCanvasElement>(null);
  const canvasGlRef = useRef<HTMLCanvasElement>(null);
  const glContextRef = useRef<WebGLRenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const requestRef = useRef<number>(0);
  const mouseRef = useRef<{x: number, y: number} | null>(null);

  // Buffers for WebGL
  const particleBufferRef = useRef<Float32Array>(new Float32Array(MAX_PARTICLES * 4));
  const candidateIndicesRef = useRef<Int32Array>(new Int32Array(1000));
  const candidateChargesRef = useRef<Float32Array>(new Float32Array(1000));

  // --- WebGL Setup ---
  useEffect(() => {
    const canvas = canvasGlRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false });
    if (!gl) return;
    glContextRef.current = gl;

    const createShader = (gl: WebGLRenderingContext, type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return null;
      return shader;
    };

    const vs = createShader(gl, gl.VERTEX_SHADER, VS_SOURCE);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, FS_SOURCE);
    if (!vs || !fs) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.useProgram(program);
    programRef.current = program;

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1.0, -1.0, 1.0, -1.0, -1.0, 1.0,
      -1.0, 1.0, 1.0, -1.0, 1.0, 1.0,
    ]), gl.STATIC_DRAW);

    const positionLocation = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
  }, []);

  const handleMouseMove = (e: React.MouseEvent) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      mouseRef.current = { x, y };
  };

  const handleMouseLeave = () => {
      mouseRef.current = null;
  };

  // --- Main Render Loop (Decoupled from React State) ---
  const render = () => {
    const bots = botsRef.current;
    const food = foodRef.current;
    
    if (!bots) {
        requestRef.current = requestAnimationFrame(render);
        return;
    }

    // 2D Canvas Render
    const ctx = canvas2dRef.current?.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, width, height);
      ctx.save();
      
      const safeZoom = Math.max(0.1, Math.min(5.0, camera.zoom)) || 1.0;
      
      ctx.translate(width/2, height/2); 
      ctx.scale(safeZoom, safeZoom);
      ctx.translate(-camera.x, -camera.y);

      // Determine Hovered Bot
      let hoveredBotId: string | null = null;
      if (mouseRef.current) {
          const worldMx = (mouseRef.current.x - width/2) / safeZoom + camera.x;
          const worldMy = (mouseRef.current.y - height/2) / safeZoom + camera.y;
          
          // Simple proximity check for hover
          let minDistSq = Infinity;
          for(const b of bots) {
              if (b.isDead) continue;
              const dx = b.centerOfMass.x - worldMx;
              const dy = b.centerOfMass.y - worldMy;
              const dSq = dx*dx + dy*dy;
              if (dSq < 2500 && dSq < minDistSq) { // 50px radius
                  minDistSq = dSq;
                  hoveredBotId = b.id;
              }
          }
      }

      // Grid
      ctx.strokeStyle = 'rgba(0, 243, 255, 0.05)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      // Expanded grid rendering area
      const startX = Math.floor((camera.x - width/2/safeZoom) / 100) * 100 - 200;
      const endX = Math.ceil((camera.x + width/2/safeZoom) / 100) * 100 + 200;
      const startY = Math.floor((camera.y - height/2/safeZoom) / 100) * 100 - 200;
      const endY = Math.ceil((camera.y + height/2/safeZoom) / 100) * 100 + 200;

      for (let x = startX; x < endX; x += 100) { ctx.moveTo(x, startY); ctx.lineTo(x, endY); }
      for (let y = startY; y < endY; y += 100) { ctx.moveTo(startX, y); ctx.lineTo(endX, y); }
      ctx.stroke();

      // Render Food
      if (food && food.length > 0) {
          const time = Date.now() * 0.003;
          ctx.fillStyle = COLORS.FOOD;
          ctx.shadowColor = COLORS.FOOD;
          ctx.shadowBlur = 15;
          
          for (const f of food) {
              // Safety check
              if (!Number.isFinite(f.x) || !Number.isFinite(f.y)) continue;
              
              // Only draw if visible
              if (f.x < startX || f.x > endX || f.y < startY || f.y > endY) continue;

              const pulse = Math.sin(time + f.phase) * 2;
              const radius = Math.max(2, FOOD_RADIUS + pulse);

              ctx.beginPath();
              ctx.arc(f.x, f.y, radius, 0, Math.PI * 2);
              ctx.fill();
          }
          ctx.shadowBlur = 0;
      }

      const botCount = bots.length;
      for (let i = 0; i < botCount; i++) {
        const bot = bots[i];
        if (bot.isDead) continue;
        
        const springs = bot.springs;
        const sCount = springs.length;
        const particles = bot.particles;

        // Collision Visual Effect
        if (bot.lastCollisionTime && Date.now() - bot.lastCollisionTime < 200 && bot.lastCollisionPoint) {
            const p = bot.lastCollisionPoint;
            const progress = (Date.now() - bot.lastCollisionTime) / 200;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 5 + progress * 30, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 255, 255, ${1.0 - progress})`;
            ctx.fill();
        }

        // Visualizing Absorption (Conscious Experience)
        if (bot.absorption > 0.1) {
            const com = bot.centerOfMass;
            ctx.beginPath();
            ctx.arc(com.x, com.y, 40 * bot.absorption, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(0, 255, 200, ${bot.absorption * 0.8})`;
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        for (let j = 0; j < sCount; j++) {
            const s = springs[j];
            const p1 = particles[s.p1];
            const p2 = particles[s.p2];
            
            // Safety: Skip invalid particles - stricter checks
            if (!p1 || !p2 || !Number.isFinite(p1.renderPos.x) || !Number.isFinite(p1.renderPos.y) || 
                !Number.isFinite(p2.renderPos.x) || !Number.isFinite(p2.renderPos.y)) continue;

            // Visual Artifact Prevention: Don't draw lines stretched to infinity
            const dx = p1.renderPos.x - p2.renderPos.x;
            const dy = p1.renderPos.y - p2.renderPos.y;
            const distSq = dx*dx + dy*dy;
            
            if (distSq > 800 * 800) continue; // Skip huge lines

            const dist = Math.sqrt(distSq);

            ctx.beginPath();
            ctx.moveTo(p1.renderPos.x, p1.renderPos.y);
            ctx.lineTo(p2.renderPos.x, p2.renderPos.y);
            
            if (s.isMuscle) {
               const strain = Math.abs(dist - s.currentRestLength) / (s.currentRestLength || 1);
               // Add Irruption visualization to muscles
               const intensity = Math.min(1.0, strain * 4.0 + bot.irruption * 0.5); 
               
               // Shift to hot pink/red on high irruption
               const r = 255;
               const g = Math.max(0, 80 - bot.irruption * 80);
               const b = Math.max(100, 100 - bot.irruption * 100);

               ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${0.2 + intensity * 0.6})`;
               ctx.lineWidth = Math.min(4, 1.5 + intensity * 2.5); // Clamp max width
            } else {
               const strain = Math.abs(dist - s.currentRestLength) / (s.currentRestLength || 1);
               if (s.stiffness > 0.7) { 
                   const intensity = Math.min(1.0, strain * 3.0);
                   ctx.strokeStyle = `rgba(234, 179, 8, ${0.15 + intensity * 0.5})`;
                   ctx.lineWidth = Math.min(3, 1 + intensity); 
               } else {
                   ctx.strokeStyle = `rgba(255, 255, 255, 0.08)`;
                   ctx.lineWidth = 0.8;
               }
            }
            ctx.stroke();
        }

        const pCount = particles.length;
        const genomeColor = bot.genome.color || '#39ff14';

        let activeColor = genomeColor;
        const chargeDensity = bot.totalCharge / (pCount || 1);
        
        const match = genomeColor.match(/hsl\((\d+\.?\d*),\s*(\d+)%,\s*(\d+)%\)/);
        if (match) {
            const h = match[1];
            let s = Math.min(100, parseInt(match[2]) + chargeDensity * 50);
            let l = Math.min(95, parseInt(match[3]) + chargeDensity * 40);
            
            // Visual Cue: Aging / Dying
            // If energy is low (< 800), desaturate and darken
            if (bot.energy < 800) {
                 const deathFactor = 1.0 - (Math.max(0, bot.energy) / 800);
                 s = s * (1.0 - deathFactor); 
                 l = l * (1.0 - deathFactor * 0.5);
            }

            activeColor = `hsl(${h}, ${s}%, ${l}%)`;
        }

        for (let j = 0; j < pCount; j++) {
            const p = particles[j];
            if (!Number.isFinite(p.renderPos.x) || !Number.isFinite(p.renderPos.y)) continue;
            
            ctx.fillStyle = activeColor;
            
            // Visual Cue: Pulsating effect for critical energy (< 300)
            if (bot.energy < 300) {
                 const pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.01);
                 ctx.globalAlpha = 0.5 + pulse * 0.5;
            } else {
                 ctx.globalAlpha = 1.0;
            }
            
            ctx.beginPath();
            ctx.arc(p.renderPos.x, p.renderPos.y, 8, 0, Math.PI * 2); 
            ctx.fill();

            // Inner Highlight
            ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.beginPath();
            ctx.arc(p.renderPos.x - 2, p.renderPos.y - 2, 3, 0, Math.PI * 2);
            ctx.fill();

            if (p.charge > 0.1) {
                ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(0.8, p.charge)})`; 
                // Reduced shadow blur
                ctx.shadowColor = '#fff';
                ctx.shadowBlur = Math.min(10, 5 * p.charge); 
                ctx.beginPath();
                ctx.arc(p.renderPos.x, p.renderPos.y, 4, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;
            }
            
            // Reset Alpha
            ctx.globalAlpha = 1.0;
        }

        // Render Age Text (Visible if selected or hovered)
        if (bot.id === followingBotId || bot.id === hoveredBotId) {
            ctx.save();
            ctx.translate(bot.centerOfMass.x, bot.centerOfMass.y - 60);
            ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
            ctx.beginPath();
            ctx.roundRect(-40, -15, 80, 26, 4);
            ctx.fill();
            
            ctx.font = "12px monospace";
            ctx.fillStyle = "#fff";
            ctx.textAlign = "center";
            ctx.fillText(`AGE: ${bot.age}`, 0, 0);
            
            ctx.font = "10px monospace";
            ctx.fillStyle = bot.energy < 500 ? "#ef4444" : "#39ff14";
            ctx.fillText(`${Math.floor(bot.energy)}J`, 0, 12); // Reduced from "NRG"
            
            ctx.restore();
        }
      }
      ctx.restore();
    }

    // WebGL Render
    const gl = glContextRef.current;
    const program = programRef.current;
    
    if (gl && program) {
        gl.viewport(0, 0, width, height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        const cx = width / 2;
        const cy = height / 2;
        const zoom = camera.zoom;
        const camX = camera.x;
        const camY = camera.y;
        
        // Calculate Time for Pulse
        const time = (Date.now() - startTimeRef.current) / 1000;

        const candIndices = candidateIndicesRef.current;
        const candCharges = candidateChargesRef.current;
        let candCount = 0;
        const MAX_CAND = candIndices.length;

        const botCount = bots.length;
        for(let i=0; i<botCount; i++) {
            const bot = bots[i];
            if(bot.isDead) continue;
            const particles = bot.particles;
            const pCount = particles.length;
            
            for(let j=0; j<pCount; j++) {
                const p = particles[j];
                // Check safety again
                if (!Number.isFinite(p.renderPos.x) || !Number.isFinite(p.renderPos.y)) continue;
                
                if (p.charge > 0.01) {
                    if (candCount < MAX_CAND) {
                        candIndices[candCount] = (i << 16) | j;
                        candCharges[candCount] = p.charge;
                        candCount++;
                    }
                }
            }
        }
        if (candCount > MAX_PARTICLES) candCount = MAX_PARTICLES;

        const data = particleBufferRef.current;
        for(let k=0; k<candCount; k++) {
            const encoded = candIndices[k];
            const bIdx = encoded >> 16;
            const pIdx = encoded & 0xFFFF;
            const bot = bots[bIdx];
            const p = bot.particles[pIdx];
            
            const screenX = (p.renderPos.x - camX) * zoom + cx;
            const screenY = (p.renderPos.y - camY) * zoom + cy;
            
            // Calculate pulse intensity on CPU to save GPU cycles in the loop
            const charge = p.charge;
            
            // Refined Pulse Logic
            // Higher charge = Slower frequency (Concentration)
            const pulseFreq = 0.5 + (1.0 - charge) * 3.0;
            
            // Higher charge = Deeper pulse (Heavy breathing/thinking)
            const pulseDepth = 0.2 + charge * 0.6;
            
            const pulse = 1.0 - pulseDepth * (0.5 + 0.5 * Math.sin(time * pulseFreq));
            
            // Intensity passed to shader
            const intensity = charge * pulse;
            
            data[k*4] = screenX;
            data[k*4+1] = screenY;
            data[k*4+2] = intensity; // Pass calculated intensity
            data[k*4+3] = bot.irruption; // Pass Irruption level to shader
        }

        const uRes = gl.getUniformLocation(program, 'u_resolution');
        const uTime = gl.getUniformLocation(program, 'u_time');
        const uCount = gl.getUniformLocation(program, 'u_count');
        const uParticles = gl.getUniformLocation(program, 'u_particles');
        const uZoom = gl.getUniformLocation(program, 'u_zoom');
        const uOffset = gl.getUniformLocation(program, 'u_offset');

        gl.uniform2f(uRes, width, height);
        gl.uniform1f(uTime, time);
        gl.uniform1i(uCount, candCount);
        gl.uniform4fv(uParticles, data); 
        gl.uniform1f(uZoom, camera.zoom);
        gl.uniform2f(uOffset, camera.x, camera.y);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    requestRef.current = requestAnimationFrame(render);
  };

  useLayoutEffect(() => {
    requestRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(requestRef.current);
  }, [width, height, groundY, camera, followingBotId]); 

  return (
    <div className="absolute inset-0 z-0 overflow-hidden" 
         style={{ 
             width, 
             height, 
             background: 'linear-gradient(to bottom, #020617 -50%, #0f172a 50%, #020617 150%)'
         }}
         onMouseMove={handleMouseMove}
         onMouseLeave={handleMouseLeave}
    >
       <canvas 
          ref={canvasGlRef}
          width={width}
          height={height}
          className="absolute inset-0 z-0 pointer-events-none mix-blend-screen"
       />
       <canvas 
          ref={canvas2dRef}
          width={width}
          height={height}
          className="absolute inset-0 z-10"
       />
       
       <div className="absolute top-4 right-4 z-20 pointer-events-none flex flex-col gap-1 text-[10px] text-neon-cyan font-mono opacity-60">
          <div>ENV: FLUIDIC_MEDIUM</div>
          <div>CAM_X: {camera.x.toFixed(0)}</div>
          <div>CAM_Y: {camera.y.toFixed(0)}</div>
          <div>ZOOM:  {camera.zoom.toFixed(2)}x</div>
       </div>
    </div>
  );
};
