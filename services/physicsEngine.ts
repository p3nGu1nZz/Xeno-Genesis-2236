import { Xenobot, Particle, Spring, Genome, CellType, SimulationConfig } from '../types';
import { DEFAULT_CONFIG, TIMESTEP, CONSTRAINT_ITERATIONS } from '../constants';

const uid = () => Math.random().toString(36).substr(2, 9);

export class PhysicsEngine {
  bots: Xenobot[] = [];
  config: SimulationConfig;
  groundY: number;

  constructor(config: SimulationConfig = DEFAULT_CONFIG) {
    this.config = config;
    this.groundY = config.groundHeight;
  }

  createBot(genome: Genome, startX: number, startY: number): Xenobot {
    const particles: Particle[] = [];
    const springs: Spring[] = [];
    const { genes, gridSize } = genome;
    const scale = this.config.gridScale;

    // Use a flat array for particle indices map to avoid array-of-arrays allocation if possible,
    // but here mapped by y/x is fine for init.
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

    // Neighbors definition (static)
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
                
                // ADJUSTED STIFFNESS:
                // Neurons (0.8) act as semi-rigid struts.
                // Skin/Muscle (0.3) are softer for organic movement.
                const stiffness = isNeuron ? 0.8 : 0.3;

                springs.push({
                    p1: p1Idx,
                    p2: p2Idx,
                    restLength: dist * scale,
                    currentRestLength: dist * scale,
                    stiffness,
                    isMuscle,
                    phaseOffset: (x + y) * 0.5
                });
                }
            }
        }
      }
    }

    return {
      id: uid(),
      genome,
      particles,
      springs,
      centerOfMass: { x: startX, y: startY },
      startPosition: { x: startX, y: startY },
      isDead: false,
      totalCharge: 0
    };
  }

  update(time: number) {
    const dt = TIMESTEP;
    const dtSq = dt * dt;
    const botCount = this.bots.length;

    // Optimization: Calculate collective info in a simple loop
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
    // Clamp
    const fluidBaseFriction = collectiveFriction < 0.85 ? 0.85 : (collectiveFriction > 0.995 ? 0.995 : collectiveFriction);
    
    for (let i = 0; i < botCount; i++) {
      const bot = this.bots[i];
      if (bot.isDead) continue;
      this.updateBot(bot, time, dt, dtSq, fluidBaseFriction);
    }
  }

  // Linear interpolation helper for smoothing
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
    const syncRate = this.config.syncRate || 0.2; 
    const groundY = this.groundY;

    const particles = bot.particles;
    const springs = bot.springs;
    const pCount = particles.length;
    const sCount = springs.length;

    // Pre-calc common factors
    const chargeDensity = bot.totalCharge / (pCount || 1);
    const liftFromCharge = chargeDensity * 0.3;
    const baseBuoyancyFactor = 0.85 + liftFromCharge;
    const currentStrength = 0.08;
    const invGroundY = 1.0 / groundY;

    // 1. Particles: Forces
    for (let i = 0; i < pCount; i++) {
      const p = particles[i];
      p.force.x = 0;
      p.force.y = gravity; 

      // Optimized depth
      let depthRatio = p.pos.y * invGroundY;
      if (depthRatio < 0) depthRatio = 0;
      else if (depthRatio > 1) depthRatio = 1;

      // Buoyancy
      const buoyancy = gravity * (baseBuoyancyFactor + depthRatio * 0.1); 
      p.force.y -= buoyancy;

      // Current
      const currentFlow = Math.sin(time * 0.5 + depthRatio * 4.0) * currentStrength;
      p.force.x += currentFlow;

      p.charge *= decay;
    }

    // 2. Springs
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
        // avgCharge inlined
        const avgCharge = (p1.charge + p2.charge) * 0.5;
        const freqMod = 1.0 + avgCharge * 4.0; 
        const contraction = Math.sin(time * mSpeed * freqMod + (s.phaseOffset || 0));
        targetLen = s.currentRestLength * (1 + contraction * mStrength);
      }

      const diff = (dist - targetLen) / dist;
      const forceVal = s.stiffness * diff;

      // Bioelectric generation
      const stress = diff < 0 ? -diff : diff; 
      const chargeGen = stress * 0.6;
      
      if (chargeGen > 0.01) {
        if (p1.charge + chargeGen > 1) p1.charge = 1; else p1.charge += chargeGen;
        if (p2.charge + chargeGen > 1) p2.charge = 1; else p2.charge += chargeGen;
      }
      activeCharge += (p1.charge + p2.charge);

      // Adaptation
      if (stress > 0.15) {
          s.currentRestLength += (dist - s.currentRestLength) * (plasticity * (0.2 + memory));
      } else {
          s.currentRestLength += (s.restLength - s.currentRestLength) * 0.0002;
      }

      const fx = dx * forceVal * 0.5;
      const fy = dy * forceVal * 0.5;

      p1.force.x += fx;
      p1.force.y += fy;
      p2.force.x -= fx;
      p2.force.y -= fy;
    }
    
    bot.totalCharge = activeCharge;

    // 3. Integration & Collision & Visual Smoothing
    let cx = 0, cy = 0;
    
    const chargeDrag = 1.0 - (chargeDensity * 0.15);
    const individualFactor = 1.0 + (memory * 0.005);
    const baseFriction = fluidBaseFriction * individualFactor * chargeDrag;
    
    // Clamp sync rate to prevent instability (0 < syncRate <= 1)
    const smoothing = Math.max(0.01, Math.min(1.0, syncRate));

    for (let i = 0; i < pCount; i++) {
      const p = particles[i];
      
      // Depth Viscosity
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

      // Simple floor constraint here
      
      // Bottom Constraint
      if (p.pos.y > groundY) {
        p.pos.y = groundY;
        const vy_impact = (p.pos.y - p.oldPos.y);
        p.oldPos.y = p.pos.y + vy_impact * 0.6; 
      }
      // Top Constraint
      if (p.pos.y < -2000) {
          p.pos.y = -2000;
          p.oldPos.y = p.pos.y;
      }

      // Visual Smoothing: Apply lerp
      p.renderPos.x = this.lerp(p.renderPos.x, p.pos.x, smoothing);
      p.renderPos.y = this.lerp(p.renderPos.y, p.pos.y, smoothing);

      cx += p.pos.x;
      cy += p.pos.y;
    }

    if (pCount > 0) {
      bot.centerOfMass.x = cx / pCount;
      bot.centerOfMass.y = cy / pCount;
    }
  }

  evaluateFitness(bot: Xenobot): number {
    const dist = bot.centerOfMass.x - bot.startPosition.x;
    return dist < 0 ? 0 : dist; 
  }
}