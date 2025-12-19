import React, { useRef, useEffect } from 'react';
import { Xenobot, CameraState } from '../types';
import { COLORS } from '../constants';

const MAX_PARTICLES = 128; 

const VS_SOURCE = `
  attribute vec2 position;
  void main() {
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

// Updated Shader: Accepts vec4 (x, y, charge, memory)
// Visualizes memory as glow stability/pulsation
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
    
    // Bioelectric Field
    float field = 0.0;
    
    for (int i = 0; i < ${MAX_PARTICLES}; i++) {
        if (i >= u_count) break;
        
        vec4 p = u_particles[i]; // p.xy = pos, p.z = charge, p.w = memory
        
        vec2 p_uv = vec2(p.x, u_resolution.y - p.y) / u_resolution.xy; 
        
        vec2 diff = (uv - p_uv);
        diff.x *= aspect;
        float dist = length(diff);
        
        float charge = p.z;
        float memory = p.w; // 0.0 to 1.0
        
        if (charge > 0.01) {
            float radius = 0.08 * u_zoom; 
            
            // MEMORY VISUALIZATION:
            // High memory (high intelligence) = Stable, constant glow.
            // Low memory (low intelligence) = Erratic, pulsating glow.
            float pulseFrequency = 2.0 + (1.0 - memory) * 8.0; // Fast pulse for low memory
            float pulseDepth = (1.0 - memory) * 0.4; // Deeper pulse for low memory
            
            float pulse = 1.0 - pulseDepth * (0.5 + 0.5 * sin(u_time * pulseFrequency));
            
            // Higher memory also increases the reach/radius slightly
            float intensity = charge * pulse * (0.8 + 0.2 * memory);

            field += (intensity * 0.003) / (dist * dist + 0.00005);
        }
    }
    
    // Background Fluid Texture
    vec2 worldUV = (gl_FragCoord.xy / u_zoom) - u_offset;
    float n = fbm(worldUV * 0.002 + vec2(u_time * 0.1, u_time * 0.05));
    
    float flow = field * (0.5 + 0.5 * n);
    
    vec4 color = vec4(0.0);
    
    if (flow > 0.05) {
       vec3 c1 = vec3(0.0, 0.2, 0.4); 
       vec3 c2 = vec3(0.0, 1.0, 0.8); 
       vec3 c3 = vec3(0.8, 1.0, 1.0); 
       
       float t = smoothstep(0.05, 1.0, flow);
       vec3 rgb = mix(c1, c2, smoothstep(0.0, 0.5, t));
       rgb = mix(rgb, c3, smoothstep(0.5, 1.0, t));
       
       float alpha = smoothstep(0.02, 0.2, flow);
       color = vec4(rgb * alpha, alpha * 0.8);
    }
    
    gl_FragColor = color;
  }
`;

interface SimulationCanvasProps {
  bots: Xenobot[];
  width: number;
  height: number;
  groundY: number;
  camera: CameraState;
}

const SimulationCanvas: React.FC<SimulationCanvasProps> = ({ bots, width, height, groundY, camera }) => {
  const canvas2dRef = useRef<HTMLCanvasElement>(null);
  const canvasGlRef = useRef<HTMLCanvasElement>(null);
  const glContextRef = useRef<WebGLRenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const startTimeRef = useRef<number>(Date.now());

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
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader);
        return null;
      }
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

  useEffect(() => {
    const ctx = canvas2dRef.current?.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, width, height);
      
      ctx.save();
      ctx.translate(width/2, height/2); 
      ctx.scale(camera.zoom, camera.zoom);
      ctx.translate(-width/2 + camera.x, -height/2 + camera.y);

      // --- Draw Environment ---
      const gradient = ctx.createLinearGradient(0, -2000, 0, 4000);
      gradient.addColorStop(0, '#020617'); 
      gradient.addColorStop(0.5, '#0f172a'); 
      gradient.addColorStop(1, '#020617'); 
      ctx.fillStyle = gradient;
      ctx.fillRect(-5000, -5000, 10000, 10000);

      ctx.strokeStyle = 'rgba(0, 243, 255, 0.05)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = -2000; x < 6000; x += 100) {
        ctx.moveTo(x, -2000);
        ctx.lineTo(x, 4000);
      }
      for (let y = -2000; y < 4000; y += 100) {
        ctx.moveTo(-2000, y);
        ctx.lineTo(6000, y);
      }
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

      // --- Draw Bots ---
      bots.forEach(bot => {
        if (bot.isDead) return;

        bot.springs.forEach(s => {
          const p1 = bot.particles[s.p1];
          const p2 = bot.particles[s.p2];
          
          ctx.beginPath();
          ctx.moveTo(p1.pos.x, p1.pos.y);
          ctx.lineTo(p2.pos.x, p2.pos.y);
          
          if (s.isMuscle) {
             const contraction = Math.abs(s.currentRestLength - s.restLength) / s.restLength;
             ctx.strokeStyle = `rgba(239, 68, 68, ${0.6 + contraction})`;
             ctx.lineWidth = 4 + contraction * 6; 
          } else {
             const stress = Math.abs(s.currentRestLength - s.restLength);
             if (s.stiffness > 0.9) { 
                 ctx.strokeStyle = `rgba(234, 179, 8, ${0.6 + stress})`;
                 ctx.lineWidth = 3; 
             } else {
                 ctx.strokeStyle = `rgba(255, 255, 255, 0.15)`;
                 ctx.lineWidth = 2;
             }
          }
          ctx.stroke();
        });

        bot.particles.forEach((p, idx) => {
          let typeColor = bot.genome.color;
          let isMuscle = false;
          let isNeuron = false;
          
          for(const s of bot.springs) {
              if (s.p1 === idx || s.p2 === idx) {
                  if (s.isMuscle) isMuscle = true;
                  if (s.stiffness > 0.9) isNeuron = true;
              }
          }
          
          if (isMuscle) typeColor = COLORS.HEART;
          else if (isNeuron) typeColor = COLORS.NEURON;

          ctx.fillStyle = typeColor;
          ctx.beginPath();
          ctx.arc(p.pos.x, p.pos.y, 8, 0, Math.PI * 2); 
          ctx.fill();

          ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
          ctx.beginPath();
          ctx.arc(p.pos.x - 2, p.pos.y - 2, 3, 0, Math.PI * 2);
          ctx.fill();

          if (p.charge > 0.1) {
              ctx.fillStyle = `rgba(255, 255, 255, ${p.charge})`;
              ctx.shadowColor = '#fff';
              ctx.shadowBlur = 10 * p.charge;
              ctx.beginPath();
              ctx.arc(p.pos.x, p.pos.y, 4, 0, Math.PI * 2);
              ctx.fill();
              ctx.shadowBlur = 0;
          }
        });
      });

      ctx.restore();
    }

    // --- WebGL Rendering ---
    const gl = glContextRef.current;
    const program = programRef.current;
    
    if (gl && program) {
        gl.viewport(0, 0, width, height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        const cx = width / 2;
        const cy = height / 2;

        const allParticles: {x: number, y: number, c: number, m: number}[] = [];
        bots.forEach(b => {
            if(!b.isDead) {
                b.particles.forEach(p => {
                    if (p.charge > 0.01) {
                        const screenX = (p.pos.x - cx + camera.x) * camera.zoom + cx;
                        const screenY = (p.pos.y - cy + camera.y) * camera.zoom + cy;
                        if (screenX > -100 && screenX < width + 100 && screenY > -100 && screenY < height + 100) {
                             // Pass Bioelectric Memory (b.genome.bioelectricMemory) to shader
                             allParticles.push({
                               x: screenX, 
                               y: screenY, 
                               c: p.charge,
                               m: b.genome.bioelectricMemory // NEW
                             });
                        }
                    }
                });
            }
        });
        
        allParticles.sort((a, b) => b.c - a.c);
        const count = Math.min(allParticles.length, MAX_PARTICLES);
        const data = new Float32Array(MAX_PARTICLES * 4); // x, y, charge, memory
        
        for(let i=0; i<count; i++) {
            data[i*4] = allParticles[i].x;
            data[i*4+1] = allParticles[i].y;
            data[i*4+2] = allParticles[i].c;
            data[i*4+3] = allParticles[i].m;
        }

        const uRes = gl.getUniformLocation(program, 'u_resolution');
        const uTime = gl.getUniformLocation(program, 'u_time');
        const uCount = gl.getUniformLocation(program, 'u_count');
        const uParticles = gl.getUniformLocation(program, 'u_particles');
        const uZoom = gl.getUniformLocation(program, 'u_zoom');
        const uOffset = gl.getUniformLocation(program, 'u_offset');

        gl.uniform2f(uRes, width, height);
        gl.uniform1f(uTime, (Date.now() - startTimeRef.current) / 1000);
        gl.uniform1i(uCount, count);
        gl.uniform4fv(uParticles, data); // Changed to 4fv for vec4
        gl.uniform1f(uZoom, camera.zoom);
        gl.uniform2f(uOffset, camera.x, camera.y);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

  }, [bots, width, height, groundY, camera]);

  return (
    <div className="relative border border-slate-800 bg-slate-950 rounded-lg shadow-2xl overflow-hidden" 
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