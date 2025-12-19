import { Xenobot, Particle, Spring, Genome, CellType, SimulationConfig } from '../types';
import { DEFAULT_CONFIG, TIMESTEP } from '../constants';

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
            mass: 1,
            force: { x: 0, y: 0 },
            charge: 0,
          });
        }
      }
    }

    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        const p1Idx = particleMap[y][x];
        if (p1Idx === -1) continue;

        const neighbors = [
          { dx: 1, dy: 0, dist: 1 },       
          { dx: 0, dy: 1, dist: 1 },       
          { dx: 1, dy: 1, dist: 1.414 },   
          { dx: -1, dy: 1, dist: 1.414 }   
        ];

        neighbors.forEach(({ dx, dy, dist }) => {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < gridSize && ny >= 0 && ny < gridSize) {
            const p2Idx = particleMap[ny][nx];
            if (p2Idx !== -1) {
              const type1 = genes[y][x];
              const type2 = genes[ny][nx];
              
              const isMuscle = (type1 === CellType.HEART || type2 === CellType.HEART);
              const isNeuron = (type1 === CellType.NEURON || type2 === CellType.NEURON);
              
              // STIFFNESS LOGIC:
              // Neurons are structural struts.
              const stiffness = isNeuron ? 0.95 : 0.4;

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
        });
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

    // COLLECTIVE AWARENESS CALCULATION:
    // Calculate the average bioelectric memory of the active population.
    let totalMemory = 0;
    let livingCount = 0;
    this.bots.forEach(b => {
        if (!b.isDead) {
            totalMemory += b.genome.bioelectricMemory;
            livingCount++;
        }
    });
    
    // Higher average memory implies the environment "recognizes" the lifeforms, reducing resistance.
    // 0.5 is baseline. Range of adjustment is +/- 0.04.
    const avgMemory = livingCount > 0 ? totalMemory / livingCount : 0.5;
    const collectiveFriction = this.config.friction + (avgMemory - 0.5) * 0.08;
    
    // Clamp friction to prevent instability (max 0.995) or too much drag (min 0.85)
    const fluidBaseFriction = Math.min(0.995, Math.max(0.85, collectiveFriction));
    
    for (let i = 0; i < this.bots.length; i++) {
      const bot = this.bots[i];
      if (bot.isDead) continue;
      this.updateBot(bot, time, dt, dtSq, fluidBaseFriction);
    }
  }

  private updateBot(bot: Xenobot, time: number, dt: number, dtSq: number, fluidBaseFriction: number) {
    let activeCharge = 0;
    const gravity = this.config.gravity;
    const decay = this.config.bioelectricDecay;
    const mStrength = this.config.muscleStrength;
    const mSpeed = this.config.muscleSpeed;
    const plasticity = this.config.plasticity;
    const memory = bot.genome.bioelectricMemory || 0.5;
    
    // 1. Particles: Gravity, Buoyancy & Fluid Dynamics
    for (let i = 0; i < bot.particles.length; i++) {
      const p = bot.particles[i];
      p.force.x = 0;
      p.force.y = gravity; 

      // DEPTH CALCULATIONS
      // Normalize depth: 0 at surface (y=0 approx), 1 at ground.
      const depthRatio = Math.max(0, Math.min(1, p.pos.y / this.groundY));

      // FLUID DYNAMICS:
      // 1. Variable Buoyancy: Density increases with depth, increasing upward force.
      // Base buoyancy is 85% of gravity, increasing to 95% at bottom.
      const buoyancy = gravity * (0.85 + depthRatio * 0.1); 
      p.force.y -= buoyancy;

      // 2. Fluid Currents:
      // Simulating a sinusoidal horizontal current that varies with depth and time.
      const currentStrength = 0.08;
      const currentFlow = Math.sin(time * 0.5 + depthRatio * 4.0) * currentStrength;
      p.force.x += currentFlow;

      p.charge *= decay;
    }

    // 2. Springs: Forces & Bioelectricity
    for (let i = 0; i < bot.springs.length; i++) {
      const s = bot.springs[i];
      const p1 = bot.particles[s.p1];
      const p2 = bot.particles[s.p2];

      const dx = p2.pos.x - p1.pos.x;
      const dy = p2.pos.y - p1.pos.y;
      const distSq = dx * dx + dy * dy;

      if (distSq < 0.0001) continue;

      const dist = Math.sqrt(distSq);

      // Muscle Logic
      let targetLen = s.currentRestLength;
      if (s.isMuscle) {
        const avgCharge = (p1.charge + p2.charge) * 0.5;
        const freqMod = 1.0 + avgCharge * 4.0; 
        const contraction = Math.sin(time * mSpeed * freqMod + (s.phaseOffset || 0));
        targetLen = s.currentRestLength * (1 + contraction * mStrength);
      }

      const diff = (dist - targetLen) / dist;
      const forceVal = s.stiffness * diff;

      // Bioelectric generation
      const stress = Math.abs(diff);
      const chargeGen = stress * 0.6;
      
      if (chargeGen > 0.01) {
        p1.charge = Math.min(1, p1.charge + chargeGen);
        p2.charge = Math.min(1, p2.charge + chargeGen);
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

    // 3. Integration & Collision
    let cx = 0, cy = 0;
    for (let i = 0; i < bot.particles.length; i++) {
      const p = bot.particles[i];
      
      // DYNAMIC VISCOSITY:
      // Depth increases viscosity slightly (fluid gets "thicker").
      const depthViscosity = 1.0 - (Math.max(0, p.pos.y / this.groundY) * 0.03);
      
      // Individual streamlining: Higher memory acts as better "swimming technique".
      const individualFactor = 1.0 + (memory * 0.005);

      const effectiveFriction = fluidBaseFriction * depthViscosity * individualFactor;

      const vx = (p.pos.x - p.oldPos.x) * effectiveFriction;
      const vy = (p.pos.y - p.oldPos.y) * effectiveFriction;

      p.oldPos.x = p.pos.x;
      p.oldPos.y = p.pos.y;

      p.pos.x += vx + p.force.x * dtSq;
      p.pos.y += vy + p.force.y * dtSq;

      // Bottom of Tank (Soft Bounce)
      if (p.pos.y > this.groundY) {
        p.pos.y = this.groundY;
        const vy_impact = (p.pos.y - p.oldPos.y);
        p.oldPos.y = p.pos.y + vy_impact * 0.6; // Slightly more bounce on floor
      }

      // Surface Tension (Top)
      if (p.pos.y < -2000) {
          p.pos.y = -2000;
          p.oldPos.y = p.pos.y;
      }

      cx += p.pos.x;
      cy += p.pos.y;
    }

    if (bot.particles.length > 0) {
      bot.centerOfMass.x = cx / bot.particles.length;
      bot.centerOfMass.y = cy / bot.particles.length;
    }
  }

  evaluateFitness(bot: Xenobot): number {
    const dist = bot.centerOfMass.x - bot.startPosition.x;
    return Math.max(0, dist);
  }
}