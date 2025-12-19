
import { Xenobot, Particle, Spring, Genome, CellType, SimulationConfig } from '../types';
import { DEFAULT_CONFIG, TIMESTEP, CONSTRAINT_ITERATIONS, CILIA_FORCE, METABOLIC_DECAY, INITIAL_YOLK_ENERGY, SURFACE_TENSION, WORLD_WIDTH, EDGE_BUFFER, WORLD_HEIGHT_LIMIT } from '../constants';

const uid = () => Math.random().toString(36).substr(2, 9);

export class PhysicsEngine {
  bots: Xenobot[] = [];
  config: SimulationConfig;
  groundY: number;

  constructor(config: SimulationConfig = DEFAULT_CONFIG) {
    this.config = config;
    this.groundY = config.groundHeight;
  }

  addBot(bot: Xenobot) {
      this.bots.push(bot);
  }

  removeBot(id: string) {
      this.bots = this.bots.filter(b => b.id !== id);
  }

  createBot(genome: Genome, startX: number, startY: number): Xenobot {
    const particles: Particle[] = [];
    const springs: Spring[] = [];
    const { genes, gridSize } = genome;
    const scale = this.config.gridScale;

    const particleMap: number[][] = Array(gridSize).fill(null).map(() => Array(gridSize).fill(-1));

    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        if (genes[y][x] !== CellType.EMPTY) {
          const px = startX + x * scale;
          const py = startY + y * scale;
          particleMap[y][x] = particles.length;
          particles.push({
            pos: { x: px, y: py },
            oldPos: { x: px, y: py },
            renderPos: { x: px, y: py }, 
            mass: 1,
            force: { x: 0, y: 0 },
            charge: 0,
          });
        }
      }
    }

    const neighbors = [
      { dx: 1, dy: 0, dist: 1 },       
      { dx: 0, dy: 1, dist: 1 },       
      { dx: 1, dy: 1, dist: 1.414 },   
      { dx: -1, dy: 1, dist: 1.414 }   
    ];

    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        const p1Idx = particleMap[y][x];
        if (p1Idx === -1) continue;

        for (let i = 0; i < neighbors.length; i++) {
            const { dx, dy, dist } = neighbors[i];
            const nx = x + dx;
            const ny = y + dy;
            
            if (nx >= 0 && nx < gridSize && ny >= 0 && ny < gridSize) {
                const p2Idx = particleMap[ny][nx];
                if (p2Idx !== -1) {
                const type1 = genes[y][x];
                const type2 = genes[ny][nx];
                
                const isMuscle = (type1 === CellType.HEART || type2 === CellType.HEART);
                const isNeuron = (type1 === CellType.NEURON || type2 === CellType.NEURON);
                const stiffness = isNeuron ? 0.8 : 0.3;

                // Propulsion Logic:
                // For Bilateral Polarity (Heart at Posterior/Bottom, Neuron at Anterior/Top),
                // we want a propulsion vector that drives the bot forward.
                // A phase offset based on Y creates a metachronal wave along the body length.
                // phaseOffset = y * 0.5 creates a wave traveling top-to-bottom.
                const phaseOffset = y * 0.5;

                springs.push({
                    p1: p1Idx,
                    p2: p2Idx,
                    restLength: dist * scale,
                    currentRestLength: dist * scale,
                    stiffness,
                    isMuscle,
                    phaseOffset
                });
                }
            }
        }
      }
    }

    const match = genome.color.match(/hsl\((\d+\.?\d*)/);
    const hue = match ? parseFloat(match[1]) : 0;
    const isGroupA = (hue > 150 && hue < 230); 
    const groupId = isGroupA ? 0 : 1;

    return {
      id: uid(),
      genome,
      particles,
      springs,
      centerOfMass: { x: startX, y: startY },
      startPosition: { x: startX, y: startY },
      isDead: false,
      totalCharge: 0,
      groupId,
      energy: INITIAL_YOLK_ENERGY,
      age: 0
    };
  }

  update(time: number) {
    const dt = TIMESTEP;
    const dtSq = dt * dt;
    const botCount = this.bots.length;

    let totalMemory = 0;
    let livingCount = 0;
    
    for(let i = 0; i < botCount; i++) {
        const b = this.bots[i];
        if (!b.isDead) {
            totalMemory += b.genome.bioelectricMemory;
            livingCount++;
        }
    }
    
    const avgMemory = livingCount > 0 ? totalMemory / livingCount : 0.5;
    const collectiveFriction = this.config.friction + (avgMemory - 0.5) * 0.08;
    const fluidBaseFriction = collectiveFriction < 0.85 ? 0.85 : (collectiveFriction > 0.995 ? 0.995 : collectiveFriction);
    
    // Apply Social Forces
    if (botCount > 1) {
        this.applySocialForces(botCount);
    }

    for (let i = 0; i < botCount; i++) {
      const bot = this.bots[i];
      if (bot.isDead) continue;
      this.updateBot(bot, time, dt, dtSq, fluidBaseFriction);
    }
    
    // Apply smoothing at the end of the physics step
    this.smoothRenderPositions();
  }
  
  smoothRenderPositions() {
    const smoothing = Math.max(0.01, Math.min(1.0, this.config.syncRate || 0.2));
    
    const botCount = this.bots.length;
    for (let i = 0; i < botCount; i++) {
        const bot = this.bots[i];
        if (bot.isDead) continue;
        
        const particles = bot.particles;
        const pCount = particles.length;
        
        for (let j = 0; j < pCount; j++) {
            const p = particles[j];
            // Linear Interpolation (Lerp) to smooth out high-frequency physics jitter
            p.renderPos.x = this.lerp(p.renderPos.x, p.pos.x, smoothing);
            p.renderPos.y = this.lerp(p.renderPos.y, p.pos.y, smoothing);
        }
    }
  }

  private applySocialForces(botCount: number) {
      const GROUP_REPULSION_RADIUS = 300; 
      const GROUP_FORCE = 0.8; 
      const SELF_REPULSION_RADIUS = 80; 
      const SELF_FORCE = 0.1;

      for (let i = 0; i < botCount; i++) {
          const b1 = this.bots[i];
          if (b1.isDead) continue;

          for (let j = i + 1; j < botCount; j++) {
              const b2 = this.bots[j];
              if (b2.isDead) continue;

              const dx = b1.centerOfMass.x - b2.centerOfMass.x;
              const dy = b1.centerOfMass.y - b2.centerOfMass.y;
              const distSq = dx*dx + dy*dy;

              if (distSq < 0.1) continue; 

              if (b1.groupId !== b2.groupId) {
                  if (distSq < GROUP_REPULSION_RADIUS * GROUP_REPULSION_RADIUS) {
                      const dist = Math.sqrt(distSq);
                      const overlap = GROUP_REPULSION_RADIUS - dist;
                      const f = (overlap / GROUP_REPULSION_RADIUS) * GROUP_FORCE;
                      const fx = (dx / dist) * f;
                      const fy = (dy / dist) * f;
                      this.applyForceToBot(b1, fx, fy);
                      this.applyForceToBot(b2, -fx, -fy);
                  }
              } else {
                   if (distSq < SELF_REPULSION_RADIUS * SELF_REPULSION_RADIUS) {
                      const dist = Math.sqrt(distSq);
                      const overlap = SELF_REPULSION_RADIUS - dist;
                      const f = (overlap / SELF_REPULSION_RADIUS) * SELF_FORCE;
                      const fx = (dx / dist) * f;
                      const fy = (dy / dist) * f;
                      this.applyForceToBot(b1, fx, fy);
                      this.applyForceToBot(b2, -fx, -fy);
                   }
              }
          }
      }
  }

  private applyForceToBot(bot: Xenobot, fx: number, fy: number) {
      const count = bot.particles.length;
      if (count === 0) return;
      const pFx = fx / count;
      const pFy = fy / count;
      for (const p of bot.particles) {
          p.force.x += pFx;
          p.force.y += pFy;
      }
  }

  private lerp(start: number, end: number, t: number): number {
    return start * (1 - t) + end * t;
  }

  private updateBot(bot: Xenobot, time: number, dt: number, dtSq: number, fluidBaseFriction: number) {
    let activeCharge = 0;
    const gravity = this.config.gravity;
    const decay = this.config.bioelectricDecay;
    const mStrength = this.config.muscleStrength;
    const mSpeed = this.config.muscleSpeed;
    const plasticity = this.config.plasticity;
    const memory = bot.genome.bioelectricMemory || 0.5;
    const groundY = this.groundY;
    const acousticActive = this.config.acousticFreq > 100; // Trigger threshold

    // Metabolic cost: Existence consumes energy
    bot.energy -= METABOLIC_DECAY;
    bot.age++;

    if (bot.energy <= 0) {
        bot.isDead = true;
        return; 
    }

    const particles = bot.particles;
    const springs = bot.springs;
    const pCount = particles.length;
    const sCount = springs.length;

    const chargeDensity = bot.totalCharge / (pCount || 1);
    const liftFromCharge = chargeDensity * 0.3;
    const baseBuoyancyFactor = 0.85 + liftFromCharge;
    const currentStrength = 0.08;
    const invGroundY = 1.0 / groundY;

    // Apply Ciliary Forces & Environmental Forces
    for (let i = 0; i < pCount; i++) {
      const p = particles[i];
      
      // Gravity & Buoyancy
      p.force.x = 0;
      p.force.y = gravity; 

      let depthRatio = p.pos.y * invGroundY;
      if (depthRatio < 0) depthRatio = 0;
      else if (depthRatio > 1) depthRatio = 1;

      const buoyancy = gravity * (baseBuoyancyFactor + depthRatio * 0.1); 
      p.force.y -= buoyancy;

      const currentFlow = Math.sin(time * 0.5 + depthRatio * 4.0) * currentStrength;
      p.force.x += currentFlow;
      
      // Brownian Noise
      p.force.x += (Math.random() - 0.5) * 0.5;
      p.force.y += (Math.random() - 0.5) * 0.5;

      // --- WORLD BOUNDARY REPULSION (Avoid Edges) ---
      // Push bot away if it gets too close to the left (0) or right (WORLD_WIDTH) edge
      if (p.pos.x < EDGE_BUFFER) {
          const push = (EDGE_BUFFER - p.pos.x) * 0.005; // Gentle push
          p.force.x += push;
      } else if (p.pos.x > WORLD_WIDTH - EDGE_BUFFER) {
          const push = (p.pos.x - (WORLD_WIDTH - EDGE_BUFFER)) * 0.005;
          p.force.x -= push;
      }

      // --- CILIARY PROPULSION (Basal Motility) ---
      const dx = p.pos.x - bot.centerOfMass.x;

      if (acousticActive) {
          p.force.x += CILIA_FORCE; 
      } else {
          // Peristaltic Wave Motion
          const waveFreq = 3.0 + (memory * 2.0); 
          const phase = (dx * 0.05) - (time * waveFreq * Math.PI * 2);
          const beat = Math.sin(phase);
          
          let thrustX = 0;
          let liftY = 0;
          
          if (beat > 0) {
             thrustX = CILIA_FORCE * 1.5 * beat;
             liftY = CILIA_FORCE * 0.2 * beat;
          } else {
             thrustX = CILIA_FORCE * 0.3 * beat; 
             liftY = CILIA_FORCE * 1.0 * beat;   
          }
          
          if (memory < 0.8) {
              const noiseScale = (0.8 - memory);
              thrustX += (Math.random() - 0.5) * noiseScale * CILIA_FORCE;
              liftY += (Math.random() - 0.5) * noiseScale * CILIA_FORCE;
          }
          
          p.force.x += thrustX;
          p.force.y += liftY;
      }

      // Self-Assembly
      const dxSelf = bot.centerOfMass.x - p.pos.x;
      const dySelf = bot.centerOfMass.y - p.pos.y;
      p.force.x += dxSelf * SURFACE_TENSION;
      p.force.y += dySelf * SURFACE_TENSION;

      p.charge *= decay;
    }

    // Spring Physics
    for (let i = 0; i < sCount; i++) {
      const s = springs[i];
      const p1 = particles[s.p1];
      const p2 = particles[s.p2];

      const dx = p2.pos.x - p1.pos.x;
      const dy = p2.pos.y - p1.pos.y;
      const distSq = dx * dx + dy * dy;

      if (distSq < 0.0001) continue;

      const dist = Math.sqrt(distSq);

      let targetLen = s.currentRestLength;
      
      if (s.isMuscle) {
        bot.energy -= METABOLIC_DECAY * 0.1;

        const avgCharge = (p1.charge + p2.charge) * 0.5;
        const freqMod = 1.0 + avgCharge * 4.0; 
        const contraction = Math.sin(time * mSpeed * freqMod + (s.phaseOffset || 0));
        targetLen = s.currentRestLength * (1 + contraction * mStrength);
      }

      const diff = (dist - targetLen) / dist;
      const forceVal = s.stiffness * diff;

      const stress = diff < 0 ? -diff : diff; 
      const chargeGen = stress * 0.6;
      
      if (chargeGen > 0.01) {
        if (p1.charge + chargeGen > 1) p1.charge = 1; else p1.charge += chargeGen;
        if (p2.charge + chargeGen > 1) p2.charge = 1; else p2.charge += chargeGen;
      }
      activeCharge += (p1.charge + p2.charge);

      if (stress > 0.15) {
          s.currentRestLength += (dist - s.currentRestLength) * (plasticity * (0.2 + memory));
      } else {
          const retention = memory * 0.8;
          const forgettingRate = 0.003 + (1.0 - retention) * 0.005; 
          s.currentRestLength += (s.restLength - s.currentRestLength) * forgettingRate;
      }

      const fx = dx * forceVal * 0.5;
      const fy = dy * forceVal * 0.5;

      p1.force.x += fx;
      p1.force.y += fy;
      p2.force.x -= fx;
      p2.force.y -= fy;
    }
    
    bot.totalCharge = activeCharge;

    // Integration & Friction
    let cx = 0, cy = 0;
    
    const chargeDrag = 1.0 - (chargeDensity * 0.15);
    const individualFactor = 1.0 + (memory * 0.005);
    const baseFriction = fluidBaseFriction * individualFactor * chargeDrag;
    
    const WALL_BOUNCE = 0.3; // Amount of energy kept when hitting wall

    for (let i = 0; i < pCount; i++) {
      const p = particles[i];
      
      let depthVal = p.pos.y * invGroundY;
      if (depthVal < 0) depthVal = 0;
      const depthViscosity = 1.0 - (depthVal * 0.03);
      
      const effectiveFriction = baseFriction * depthViscosity;

      const vx = (p.pos.x - p.oldPos.x) * effectiveFriction;
      const vy = (p.pos.y - p.oldPos.y) * effectiveFriction;

      p.oldPos.x = p.pos.x;
      p.oldPos.y = p.pos.y;

      p.pos.x += vx + p.force.x * dtSq;
      p.pos.y += vy + p.force.y * dtSq;

      // --- WORLD BOUNDARY CONSTRAINTS (Hard Stops) ---
      
      // Floor
      if (p.pos.y > groundY) {
        p.pos.y = groundY;
        const vy_impact = (p.pos.y - p.oldPos.y);
        p.oldPos.y = p.pos.y + vy_impact * 0.6; 
      }
      
      // Ceiling (Height Limit)
      if (p.pos.y < WORLD_HEIGHT_LIMIT) {
          p.pos.y = WORLD_HEIGHT_LIMIT;
          p.oldPos.y = p.pos.y;
      }

      // Left Wall
      if (p.pos.x < 0) {
          p.pos.x = 0;
          const vx_impact = (p.pos.x - p.oldPos.x);
          p.oldPos.x = p.pos.x + vx_impact * WALL_BOUNCE; // Reverse velocity slightly
      }

      // Right Wall
      if (p.pos.x > WORLD_WIDTH) {
          p.pos.x = WORLD_WIDTH;
          const vx_impact = (p.pos.x - p.oldPos.x);
          p.oldPos.x = p.pos.x + vx_impact * WALL_BOUNCE;
      }

      cx += p.pos.x;
      cy += p.pos.y;
    }

    if (pCount > 0) {
      bot.centerOfMass.x = cx / pCount;
      bot.centerOfMass.y = cy / pCount;
    }
  }

  evaluateFitness(bot: Xenobot): number {
    if (bot.isDead) return 0;
    const dist = bot.centerOfMass.x - bot.startPosition.x;
    return dist < 0 ? 0 : dist; 
  }
}
