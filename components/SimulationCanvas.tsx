import React, { useRef, useEffect, useLayoutEffect } from 'react';
import { Xenobot, CameraState } from '../types';
import { COLORS } from '../constants';

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
  uniform vec4 u_particles[${MAX_PARTICLES}]; // x, y, charge, memory
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
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), f.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }

  float fbm(vec2 p) {
      float v = 0.0;
      float a = 0.5;
      mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
      for (int i = 0; i < 3; i++) {
          v += a * noise(p);
          p = rot * p * 2.0;
          a *= 0.5;
      }
      return v;
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
        float dist = length(diff);
        float charge = p.z;
        float memory = p.w;
        
        if (charge > 0.01) {
            // Pulse Logic based on Memory
            // High Memory (1.0) -> Frequency 2.0, Depth 0.0 -> Stable Glow
            // Low Memory (0.0) -> Frequency 10.0, Depth 0.4 -> Rapid Flicker
            float pulseFrequency = 2.0 + (1.0 - memory) * 8.0; 
            float pulseDepth = (1.0 - memory) * 0.4; 
            float pulse = 1.0 - pulseDepth * (0.5 + 0.5 * sin(u_time * pulseFrequency));
            
            // Intensity Logic
            float intensity = charge * pulse * (0.8 + 0.2 * memory);
            float contrib = (intensity * 0.003) / (dist * dist + 0.00005);
            
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
    float n = fbm(worldUV * 0.002 + vec2(u_time * 0.1, u_time * 0.05));
    float flow = field * (0.5 + 0.5 * n);
    
    vec4 color = vec4(0.0);
    if (flow > 0.05) {
       // Visualizing Memory via Color
       // Low Memory -> Violet/Purple (Unstable)
       vec3 cLow = vec3(0.6, 0.0, 0.9);
       // High Memory -> Cyan/Teal (Stable)
       vec3 cHigh = vec3(0.0, 1.0, 0.9);
       
       vec3 baseColor = mix(cLow, cHigh, smoothstep(0.2, 0.8, avgMemory));
       
       vec3 cDark = baseColor * 0.2;
       vec3 cMid = baseColor;
       vec3 cBright = vec3(0.9, 1.0, 1.0); 

       float t = smoothstep(0.05, 1.0, flow);
       vec3 rgb = mix(cDark, cMid, smoothstep(0.0, 0.5, t));
       rgb = mix(rgb, cBright, smoothstep(0.5, 1.0, t));
       
       // Extra "Electric" jitter for low memory
       if (avgMemory < 0.3) {
           rgb += (hash(uv * u_time) * 0.1) * (1.0 - t);
       }
       
       float alpha = smoothstep(0.02, 0.2, flow);
       color = vec4(rgb * alpha, alpha * 0.85);
    }
    gl_FragColor = color;
  }
`;

interface SimulationCanvasProps {
  botsRef: React.MutableRefObject<Xenobot[]>; // Optimization: Pass Ref instead of data
  width: number;
  height: number;
  groundY: number;
  camera: CameraState;
}

const SimulationCanvas: React.FC<SimulationCanvasProps> = ({ botsRef, width, height, groundY, camera }) => {
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
    if (!bots) {
        requestRef.current = requestAnimationFrame(render);
        return;
    }

    // 2D Canvas Render
    const ctx = canvas2dRef.current?.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.translate(width/2, height/2); 
      ctx.scale(camera.zoom, camera.zoom);
      ctx.translate(-width/2 + camera.x, -height/2 + camera.y);

      // Environment
      const gradient = ctx.createLinearGradient(0, -2000, 0, 4000);
      gradient.addColorStop(0, '#020617'); 
      gradient.addColorStop(0.5, '#0f172a'); 
      gradient.addColorStop(1, '#020617'); 
      ctx.fillStyle = gradient;
      ctx.fillRect(-5000, -5000, 10000, 10000);

      ctx.strokeStyle = 'rgba(0, 243, 255, 0.05)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = -2000; x < 6000; x += 100) { ctx.moveTo(x, -2000); ctx.lineTo(x, 4000); }
      for (let y = -2000; y < 4000; y += 100) { ctx.moveTo(-2000, y); ctx.lineTo(6000, y); }
      ctx.stroke();

      if (groundY < 4000) {
          ctx.strokeStyle = '#00f3ff';
          ctx.lineWidth = 4;
          ctx.shadowColor = '#00f3ff';
          ctx.shadowBlur = 20;
          ctx.beginPath();
          ctx.moveTo(-5000, groundY);
          ctx.lineTo(10000, groundY);
          ctx.stroke();
          ctx.shadowBlur = 0;
      }

      // Draw Bots (Optimized Loop)
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
            ctx.beginPath();
            ctx.moveTo(p1.renderPos.x, p1.renderPos.y);
            ctx.lineTo(p2.renderPos.x, p2.renderPos.y);
            
            if (s.isMuscle) {
               const contraction = Math.abs(s.currentRestLength - s.restLength) / s.restLength;
               ctx.strokeStyle = `rgba(239, 68, 68, ${0.6 + contraction})`;
               ctx.lineWidth = 4 + contraction * 6; 
            } else {
               const stress = Math.abs(s.currentRestLength - s.restLength);
               if (s.stiffness > 0.7) { 
                   ctx.strokeStyle = `rgba(234, 179, 8, ${0.6 + stress})`;
                   ctx.lineWidth = 3; 
               } else {
                   ctx.strokeStyle = `rgba(255, 255, 255, 0.15)`;
                   ctx.lineWidth = 2;
               }
            }
            ctx.stroke();
        }

        const pCount = particles.length;
        const genomeColor = bot.genome.color || '#39ff14';

        // Dynamic Color Logic based on Charge Density
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
            
            ctx.fillStyle = activeColor;
            ctx.beginPath();
            ctx.arc(p.renderPos.x, p.renderPos.y, 8, 0, Math.PI * 2); 
            ctx.fill();

            ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.beginPath();
            ctx.arc(p.renderPos.x - 2, p.renderPos.y - 2, 3, 0, Math.PI * 2);
            ctx.fill();

            if (p.charge > 0.1) {
                ctx.fillStyle = `rgba(255, 255, 255, ${p.charge})`;
                ctx.shadowColor = '#fff';
                ctx.shadowBlur = 10 * p.charge;
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
            const screenX = (p.renderPos.x - cx + camX) * zoom + cx;
            const screenY = (p.renderPos.y - cy + camY) * zoom + cy;
            data[k*4] = screenX;
            data[k*4+1] = screenY;
            data[k*4+2] = p.charge;
            data[k*4+3] = bot.genome.bioelectricMemory;
        }

        const uRes = gl.getUniformLocation(program, 'u_resolution');
        const uTime = gl.getUniformLocation(program, 'u_time');
        const uCount = gl.getUniformLocation(program, 'u_count');
        const uParticles = gl.getUniformLocation(program, 'u_particles');
        const uZoom = gl.getUniformLocation(program, 'u_zoom');
        const uOffset = gl.getUniformLocation(program, 'u_offset');

        gl.uniform2f(uRes, width, height);
        gl.uniform1f(uTime, (Date.now() - startTimeRef.current) / 1000);
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
  }, [width, height, groundY, camera]); // Re-start loop if container changes

  return (
    <div className="absolute inset-0 z-0 bg-slate-950 overflow-hidden" 
         style={{ width, height }}>
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