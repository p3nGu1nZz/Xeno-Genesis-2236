
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
  uniform vec4 u_particles[${MAX_PARTICLES}]; // x, y, intensity, memory
  uniform int u_count;
  uniform vec2 u_offset; 
  uniform float u_zoom;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    // Optimization: Hermite cubic interpolation for better visuals
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), f.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }

  float fbm(vec2 p) {
      // Optimization: Single iteration noise for performance, but with smooth interpolation
      return noise(p);
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    float aspect = u_resolution.x / u_resolution.y;
    float field = 0.0;
    float weightedMemory = 0.0;
    
    for (int i = 0; i < ${MAX_PARTICLES}; i++) {
        if (i >= u_count) break;
        vec4 p = u_particles[i];
        
        vec2 p_uv = vec2(p.x, u_resolution.y - p.y) / u_resolution.xy; 
        vec2 diff = (uv - p_uv);
        diff.x *= aspect;
        
        // Optimization: Use dot product for squared distance
        float distSq = dot(diff, diff);
        
        // Intensity is pre-calculated in JS to save sin() calls per pixel
        float intensity = p.z; 
        float memory = p.w;
        
        // Optimization: Cull very low intensity influences
        if (intensity > 0.001) {
            // Use distSq directly in falloff calculation
            float contrib = (intensity * 0.002) / (distSq + 0.0001);
            contrib = min(contrib, 0.8); 

            field += contrib;
            weightedMemory += memory * contrib;
        }
    }
    
    float avgMemory = 0.0;
    if (field > 0.0001) {
        avgMemory = weightedMemory / field;
    }
    
    vec2 flowOffset = vec2(
        cos(u_time * 1.5 + field * 15.0),
        sin(u_time * 2.0 + field * 10.0)
    ) * field * 0.15; 

    vec2 worldUV = (gl_FragCoord.xy / u_zoom) - u_offset + flowOffset;
    
    float n = fbm(worldUV * 0.003 + vec2(u_time * 0.1, u_time * 0.05));
    float flow = field * (0.5 + 0.5 * n);
    
    vec4 color = vec4(0.0);
    if (flow > 0.05) {
       vec3 cLow = vec3(0.6, 0.0, 0.9);
       vec3 cHigh = vec3(0.0, 1.0, 0.9);
       vec3 baseColor = mix(cLow, cHigh, smoothstep(0.2, 0.8, avgMemory));
       vec3 cDark = baseColor * 0.2;
       vec3 cMid = baseColor;
       vec3 cBright = vec3(0.9, 1.0, 1.0); 

       float t = smoothstep(0.05, 1.0, flow);
       vec3 rgb = mix(cDark, cMid, smoothstep(0.0, 0.5, t));
       rgb = mix(rgb, cBright, smoothstep(0.5, 1.0, t));
       if (avgMemory < 0.3) rgb += (hash(uv * u_time) * 0.1) * (1.0 - t);
       float alpha = smoothstep(0.02, 0.3, flow);
       alpha = min(alpha, 0.5); 
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
}

const SimulationCanvas: React.FC<SimulationCanvasProps> = ({ botsRef, foodRef, width, height, groundY, camera }) => {
  const canvas2dRef = useRef<HTMLCanvasElement>(null);
  const canvasGlRef = useRef<HTMLCanvasElement>(null);
  const glContextRef = useRef<WebGLRenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const requestRef = useRef<number>(0);

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

      if (groundY < endY && groundY > startY) {
          ctx.strokeStyle = '#00f3ff';
          ctx.lineWidth = 4;
          ctx.shadowColor = '#00f3ff';
          ctx.shadowBlur = 10; // Reduced blur to prevent blowout
          ctx.beginPath();
          ctx.moveTo(startX - 1000, groundY);
          ctx.lineTo(endX + 1000, groundY);
          ctx.stroke();
          ctx.shadowBlur = 0;
      }
      
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
               const intensity = Math.min(1.0, strain * 4.0); 
               ctx.strokeStyle = `rgba(255, 80, 100, ${0.2 + intensity * 0.6})`;
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
        if (chargeDensity > 0.05) {
            const match = genomeColor.match(/hsl\((\d+\.?\d*),\s*(\d+)%,\s*(\d+)%\)/);
            if (match) {
                const h = match[1];
                const s = Math.min(100, parseInt(match[2]) + chargeDensity * 50);
                const l = Math.min(95, parseInt(match[3]) + chargeDensity * 40);
                activeColor = `hsl(${h}, ${s}%, ${l}%)`;
            }
        }

        for (let j = 0; j < pCount; j++) {
            const p = particles[j];
            if (!Number.isFinite(p.renderPos.x) || !Number.isFinite(p.renderPos.y)) continue;
            
            ctx.fillStyle = activeColor;
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
            const pulseFreq = 0.2 + (1.0 - charge) * 4.0;
            const pulseDepth = 0.3 + charge * 0.6;
            const pulse = 1.0 - pulseDepth * (0.5 + 0.5 * Math.sin(time * pulseFreq));
            const intensity = charge * pulse * 0.12;
            
            data[k*4] = screenX;
            data[k*4+1] = screenY;
            data[k*4+2] = intensity; // Pass calculated intensity instead of raw charge
            data[k*4+3] = bot.genome.bioelectricMemory;
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
  }, [width, height, groundY, camera]); 

  return (
    <div className="absolute inset-0 z-0 overflow-hidden" 
         style={{ 
             width, 
             height, 
             background: 'linear-gradient(to bottom, #020617 -50%, #0f172a 50%, #020617 150%)'
         }}>
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

export default SimulationCanvas;
