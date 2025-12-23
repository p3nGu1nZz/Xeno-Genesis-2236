import {
  Xenobot,
  Particle,
  Spring,
  Genome,
  SimulationConfig,
  Food,
  GeneticStats,
  CellType,
  SimulationEventType
} from '../types';
import {
  GRID_SIZE,
  COLORS,
  TIMESTEP,
  CONSTRAINT_ITERATIONS,
  CILIA_FORCE,
  METABOLIC_DECAY,
  INITIAL_YOLK_ENERGY,
  MITOSIS_THRESHOLD,
  FOOD_ENERGY,
  FOOD_RADIUS,
  SURFACE_TENSION,
  BREAKING_THRESHOLD
} from '../constants';
import { evolvePopulation, mutate } from './geneticAlgorithm';

const uid = () => Math.random().toString(36).substr(2, 9);
const MAX_FORCE = 15.0;
const MAX_VELOCITY = 20.0;
const PARTICLE_MAINTENANCE_COST = 0.1; // Increased to 0.1 to make large bodies expensive
const COLLISION_RADIUS = 12; 

export class PhysicsEngine {
  public bots: Xenobot[] = [];
  public food: Food[] = [];
  public config: SimulationConfig;
  public events: SimulationEventType[] = [];
  public groundY: number;

  constructor(config: SimulationConfig) {
    this.config = config;
    this.groundY = config.groundHeight;
    this.spawnFood();
  }

  public spawnFood() {
    const currentCount = this.food.length;
    const needed = this.config.foodCount - currentCount;
    const range = 2500; 

    // Uniformly scatter food to avoid confusion with bot clusters
    for (let i = 0; i < needed; i++) {
      this.food.push({
        id: uid(),
        x: (Math.random() - 0.5) * 2 * range,
        y: (Math.random() - 0.5) * 2 * range,
        energy: FOOD_ENERGY,
        phase: Math.random() * Math.PI * 2
      });
    }
  }

  public createBot(genome: Genome, startX: number, startY: number): Xenobot {
    const particles: Particle[] = [];
    const springs: Spring[] = [];
    const scale = this.config.gridScale || 60;
    const size = genome.gridSize;

    // Temporary map to track particle indices during creation
    const particleMap: number[][] = Array(size).fill(null).map(() => Array(size).fill(-1));

    // 1. Create Particles
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (genome.genes[y][x] !== CellType.EMPTY) {
           const px = startX + (x - size/2) * scale;
           const py = startY + (y - size/2) * scale;
           
           particles.push({
             pos: { x: px, y: py },
             oldPos: { x: px, y: py },
             renderPos: { x: px, y: py },
             mass: 1.2,
             force: { x: 0, y: 0 },
             charge: 0,
             isFixed: false,
             phase: x * 0.6 + y * 0.1
           });
           particleMap[y][x] = particles.length - 1;
        }
      }
    }

    // 2. Create Springs
    const neighbors = [
        { dx: 1, dy: 0, dist: 1 },
        { dx: 0, dy: 1, dist: 1 },
        { dx: 1, dy: 1, dist: 1.414 },
        { dx: -1, dy: 1, dist: 1.414 }
    ];

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const p1Idx = particleMap[y][x];
        if (p1Idx === -1) continue;

        for (const n of neighbors) {
            const nx = x + n.dx;
            const ny = y + n.dy;
            
            if (nx >= 0 && nx < size && ny >= 0 && ny < size) {
                const p2Idx = particleMap[ny][nx];
                if (p2Idx !== -1) {
                    const type1 = genome.genes[y][x];
                    const type2 = genome.genes[ny][nx];
                    
                    const isMuscle = (type1 === CellType.HEART || type2 === CellType.HEART);
                    const isNeuron = (type1 === CellType.NEURON || type2 === CellType.NEURON);
                    
                    let stiffness = 2.0;
                    if (type1 === CellType.NEURON && type2 === CellType.NEURON) {
                        stiffness = 5.0 + (Math.random() * 3.0 - 1.5); // Increased variability for organic structure
                    } else if (isNeuron) {
                        stiffness = 3.5;
                    } else if (isMuscle) {
                        stiffness = 3.0;
                    }

                    springs.push({
                        p1: p1Idx,
                        p2: p2Idx,
                        restLength: n.dist * scale,
                        currentRestLength: n.dist * scale,
                        stiffness,
                        isMuscle,
                        phaseOffset: (x + y) * 0.5 
                    });
                }
            }
        }
      }
    }

    let groupId = 1;
    const match = genome.color.match(/hsl\((\d+\.?\d*)/);
    if (match) {
        const h = parseFloat(match[1]);
        if (h > 150 && h < 230) groupId = 0;
    } else {
        groupId = Math.floor(Math.random() * 2);
    }

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
        age: 0,
        heading: Math.random() * Math.PI * 2,
        irruption: 0,
        absorption: 0
    };
  }

  public update(dt: number) {
    this.events = [];
    
    // We use a fixed timestep for physics stability, but the dt passed in is used for scaling if needed.
    // Here we mainly rely on internal force calculations.
    const dtSq = TIMESTEP * TIMESTEP;
    const botCount = this.bots.length;

    // 1. Social Forces & Collisions
    if (botCount > 1) {
        this.resolveCollisions(botCount);
    }

    // 2. Individual Bot Updates
    const newBots: Xenobot[] = [];

    for (let i = 0; i < botCount; i++) {
        const bot = this.bots[i];
        if (bot.isDead) continue;

        bot.energy -= METABOLIC_DECAY;
        bot.age++;

        if (bot.energy <= 0) {
            bot.isDead = true;
            this.events.push('DEATH');
            continue;
        }

        // --- PHYSICS INTEGRATION ---
        
        // A. Internal Structure (Muscles, Stiffness, Damping)
        const activeCharge = this.updateInternalStructure(bot, Date.now() / 1000);
        bot.totalCharge = activeCharge;

        // B. External Forces (Fluid, Cilia, Gravity)
        this.performMaterialPhysics(bot, Date.now() / 1000, TIMESTEP, dtSq);

        // C. Sensory & Consumption
        const sensoryInput = this.updateBotSensory(bot);
        const energyGained = this.checkFoodConsumption(bot);
        
        // Calculate Irruption (Will) and Absorption (Sensation)
        const speed = Math.sqrt(Math.pow(bot.centerOfMass.x - bot.startPosition.x, 2)); // Simplified
        bot.irruption = Math.min(1.0, activeCharge * 0.1);
        bot.absorption = Math.min(1.0, sensoryInput + (energyGained > 0 ? 0.5 : 0));

        // Mitosis Check
        if (bot.energy > MITOSIS_THRESHOLD) {
             const child = this.performMitosis(bot);
             if (child) newBots.push(child);
        }
    }

    if (newBots.length > 0) {
        this.bots.push(...newBots);
    }

    // 3. Render Smoothing
    this.smoothRenderPositions();

    // 4. Food Respawn
    if (this.food.length < this.config.foodCount * 0.8) {
        this.spawnFood();
    }
  }

  private performMitosis(bot: Xenobot): Xenobot | null {
      // Simple splitting logic
      bot.energy /= 2;
      this.events.push('MITOSIS');
      
      const childGenome = mutate(bot.genome);
      const offset = 60;
      const child = this.createBot(childGenome, bot.centerOfMass.x + offset, bot.centerOfMass.y + offset);
      
      // Keep group ID for colony cohesion
      child.groupId = bot.groupId;
      child.energy = bot.energy;
      
      return child;
  }

  // --- RESTORED: Advanced Internal Physics ---
  private updateInternalStructure(bot: Xenobot, time: number): number {
      let activeCharge = 0;
      const particles = bot.particles;
      const springs = bot.springs;
      const memory = bot.genome.bioelectricMemory || 0.5;
      const mStrength = this.config.muscleStrength;
      const mSpeed = this.config.muscleSpeed;
      const plasticity = this.config.plasticity;
      
      // COHESION: High coupling for rigid lattice
      const coupling = 0.9 + (memory * 0.1); 

      // 1. Internal Repulsion (Self-Collision Prevention)
      const SELF_NODE_RADIUS_SQ = 6 * 6; // Reduced from 8 to 6 for tighter packing
      
      for (let i = 0; i < particles.length; i++) {
          for (let j = i + 1; j < particles.length; j++) {
              const p1 = particles[i];
              const p2 = particles[j];
              const dx = p1.pos.x - p2.pos.x;
              const dy = p1.pos.y - p2.pos.y;
              const dSq = dx*dx + dy*dy;
              if (dSq < SELF_NODE_RADIUS_SQ && dSq > 0.001) {
                  const dist = Math.sqrt(dSq);
                  const overlap = 6 - dist; // Adjusted to match new radius
                  const force = overlap * 2.0; 
                  const nx = dx / dist;
                  const ny = dy / dist;
                  
                  p1.force.x += nx * force;
                  p1.force.y += ny * force;
                  p2.force.x -= nx * force;
                  p2.force.y -= ny * force;
              }
          }
      }

      // 2. Force Smoothing (Neighbor Coupling)
      for (const s of springs) {
          const p1 = particles[s.p1];
          const p2 = particles[s.p2];
          
          const avgFx = (p1.force.x + p2.force.x) * 0.5;
          const avgFy = (p1.force.y + p2.force.y) * 0.5;

          p1.force.x += (avgFx - p1.force.x) * coupling;
          p1.force.y += (avgFy - p1.force.y) * coupling;
          p2.force.x += (avgFx - p2.force.x) * coupling;
          p2.force.y += (avgFy - p2.force.y) * coupling;
      }

      // 3. Stronger Internal Damping / Velocity Influence
      for (const s of springs) {
          const p1 = particles[s.p1];
          const p2 = particles[s.p2];
          
          const v1x = p1.pos.x - p1.oldPos.x;
          const v1y = p1.pos.y - p1.oldPos.y;
          const v2x = p2.pos.x - p2.oldPos.x;
          const v2y = p2.pos.y - p2.oldPos.y;

          const dvx = v2x - v1x;
          const dvy = v2y - v1y;
          
          // UPDATED: Increased Damping Coefficient by 1.5x AGAIN
          // Previous: 30.375 -> New: 45.5625
          const dampingCoeff = 45.5625; 

          p1.force.x += dvx * dampingCoeff;
          p1.force.y += dvy * dampingCoeff;
          p2.force.x -= dvx * dampingCoeff;
          p2.force.y -= dvy * dampingCoeff;
      }

      // 4. Spring Forces & Muscle Contraction
      for (const s of springs) {
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
          
          // UPDATED: Increased Stiffness Multiplier by 1.5x AGAIN
          // Previous: 60.75 -> New: 91.125
          const forceVal = (s.stiffness * 91.125) * diff;

          const stress = Math.abs(diff); 
          const chargeGen = stress * 0.6;
          if (chargeGen > 0.01) {
              p1.charge = Math.min(1, p1.charge + chargeGen);
              p2.charge = Math.min(1, p2.charge + chargeGen);
          }
          activeCharge += (p1.charge + p2.charge);

          // Plasticity (Structural Adaptation)
          if (stress > 0.10 && stress < 0.6) {
             const change = (dist - s.currentRestLength) * (plasticity * (0.2 + memory));
             const newLength = s.currentRestLength + change;
             const maxLen = s.restLength * 1.5;
             const minLen = s.restLength * 0.5;
             if (newLength > minLen && newLength < maxLen) {
                 s.currentRestLength = newLength;
             }
          } else {
              const retention = memory * 0.95; 
              const forgettingRate = 0.001 + (1.0 - retention) * 0.002; 
              s.currentRestLength += (s.restLength - s.currentRestLength) * forgettingRate;
          }

          const fx = dx * forceVal * 0.5;
          const fy = dy * forceVal * 0.5;

          p1.force.x += fx;
          p1.force.y += fy;
          p2.force.x -= fx;
          p2.force.y -= fy;
      }
      
      return activeCharge;
  }

  // --- RESTORED: Material Physics (Fluid Dynamics) ---
  private performMaterialPhysics(bot: Xenobot, time: number, dt: number, dtSq: number) {
    const particles = bot.particles;
    const pCount = particles.length;
    const ciliaForcesX = new Float32Array(pCount);
    const ciliaForcesY = new Float32Array(pCount);
    
    // Average velocity for group cohesion
    let avgVx = 0, avgVy = 0;
    for (let i = 0; i < pCount; i++) {
        avgVx += (particles[i].pos.x - particles[i].oldPos.x);
        avgVy += (particles[i].pos.y - particles[i].oldPos.y);
    }
    avgVx /= (pCount || 1);
    avgVy /= (pCount || 1);

    const FLUID_DENSITY = 0.04; 
    const PARTICLE_VOLUME = 30.0;
    const BASE_DRAG = 0.15;

    for (let i = 0; i < pCount; i++) {
        const p = particles[i];
        
        bot.energy -= PARTICLE_MAINTENANCE_COST;
        
        // 1. Gravity & Buoyancy
        const fGravity = p.mass * this.config.gravity;
        const fBuoyancy = -1.0 * FLUID_DENSITY * PARTICLE_VOLUME * this.config.gravity;

        // 2. Fluid Drag
        const vx = (p.pos.x - p.oldPos.x); 
        const vy = (p.pos.y - p.oldPos.y);
        const viscosityMod = 1.0 + (p.charge * 5.0);
        const dragFactor = BASE_DRAG * viscosityMod;
        const fDragX = -vx * dragFactor;
        const fDragY = -vy * dragFactor;

        p.force.y += fGravity + fBuoyancy + fDragY;
        p.force.x += fDragX;

        // Brownian Motion
        p.force.x += (Math.random() - 0.5) * 0.2;
        p.force.y += (Math.random() - 0.5) * 0.2;

        // 3. Cilia Force Calculation
        const { cx, cy } = this.calculateCiliaForce(bot, p, time, avgVx, avgVy);
        ciliaForcesX[i] = cx;
        ciliaForcesY[i] = cy;

        // 4. Dynamic Surface Tension
        const energyRatio = Math.min(1.0, Math.max(0.1, bot.energy / INITIAL_YOLK_ENERGY));
        const dynamicTension = (SURFACE_TENSION * 4.0) * (0.5 + 0.8 * energyRatio);
        const dxSelf = bot.centerOfMass.x - p.pos.x;
        const dySelf = bot.centerOfMass.y - p.pos.y;
        p.force.x += dxSelf * dynamicTension;
        p.force.y += dySelf * dynamicTension;

        p.charge *= this.config.bioelectricDecay;
    }

    // Apply Cilia Forces
    for (let i = 0; i < pCount; i++) {
        particles[i].force.x += ciliaForcesX[i];
        particles[i].force.y += ciliaForcesY[i];
    }
    
    // Integrate (Verlet)
    let cx = 0, cy = 0;
    const friction = this.config.friction;

    for (const p of particles) {
        p.force.x = Math.max(-MAX_FORCE, Math.min(MAX_FORCE, p.force.x));
        p.force.y = Math.max(-MAX_FORCE, Math.min(MAX_FORCE, p.force.y));

        let vx = (p.pos.x - p.oldPos.x) * friction;
        let vy = (p.pos.y - p.oldPos.y) * friction;

        vx = Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, vx));
        vy = Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, vy));

        p.oldPos.x = p.pos.x;
        p.oldPos.y = p.pos.y;

        p.pos.x += vx + p.force.x * dtSq;
        p.pos.y += vy + p.force.y * dtSq;

        // Reset forces
        p.force.x = 0;
        p.force.y = 0;

        cx += p.pos.x;
        cy += p.pos.y;
    }
    
    if (pCount > 0) {
        bot.centerOfMass.x = cx / pCount;
        bot.centerOfMass.y = cy / pCount;
    }
  }

  // --- Refined Cilia Logic (Metachronal Wave) ---
  private calculateCiliaForce(bot: Xenobot, p: Particle, time: number, avgVx: number, avgVy: number) {
      const memory = bot.genome.bioelectricMemory || 0.5;
      
      const hx = Math.cos(bot.heading);
      const hy = Math.sin(bot.heading);

      const relX = (p.pos.x - bot.centerOfMass.x);
      const relY = (p.pos.y - bot.centerOfMass.y);
      
      const longitudinalPhase = (relX * hx + relY * hy);
      const lateralPhase = (relX * -hy + relY * hx);
      
      const waveLength = 150.0 + (memory * 200.0); 
      
      const spatialPhase = (longitudinalPhase + lateralPhase * 0.3) / waveLength;

      const baseFreq = 2.0;
      const memoryFreqMod = memory * 3.0;
      const waveFreq = baseFreq + memoryFreqMod;
      
      const cycle = spatialPhase * Math.PI * 2.0 - (time * waveFreq * Math.PI * 2.0);
      
      const rawBeat = Math.sin(cycle);
      
      let thrustMag = 0;
      let lateralMag = 0;

      if (rawBeat > 0) {
          const power = Math.pow(rawBeat, 1.5); 
          thrustMag = CILIA_FORCE * 2.5 * power;
          lateralMag = CILIA_FORCE * 0.5 * Math.cos(cycle); 
      } else {
          thrustMag = CILIA_FORCE * 0.1 * rawBeat; 
          lateralMag = 0;
      }

      let cx = (thrustMag * hx) + (lateralMag * -hy);
      let cy = (thrustMag * hy) + (lateralMag * hx);
      
      const pVx = p.pos.x - p.oldPos.x;
      const pVy = p.pos.y - p.oldPos.y;
      
      const cohesionStrength = 8.0 * memory; 
      
      cx += (avgVx - pVx) * cohesionStrength;
      cy += (avgVy - pVy) * cohesionStrength;

      if (memory < 0.3) {
          const noiseScale = (0.3 - memory) * 0.5;
          cx += (Math.random() - 0.5) * noiseScale * CILIA_FORCE;
          cy += (Math.random() - 0.5) * noiseScale * CILIA_FORCE;
      }

      return { cx, cy };
  }

  private resolveCollisions(botCount: number) {
      for (let i = 0; i < botCount; i++) {
        const b1 = this.bots[i];
        if (b1.isDead) continue;

        for (let j = i + 1; j < botCount; j++) {
            const b2 = this.bots[j];
            if (b2.isDead) continue;

            const dx = b1.centerOfMass.x - b2.centerOfMass.x;
            const dy = b1.centerOfMass.y - b2.centerOfMass.y;
            const distSq = dx*dx + dy*dy;
            if (distSq > 160000) continue; 

            for (const p1 of b1.particles) {
                for (const p2 of b2.particles) {
                    const pdx = p1.pos.x - p2.pos.x;
                    const pdy = p1.pos.y - p2.pos.y;
                    const pDistSq = pdx*pdx + pdy*pdy;
                    const minDist = COLLISION_RADIUS * 2;
                    
                    if (pDistSq < minDist * minDist && pDistSq > 0.0001) {
                        const pDist = Math.sqrt(pDistSq);
                        const overlap = minDist - pDist;
                        const nx = pdx / pDist;
                        const ny = pdy / pDist;
                        
                        const moveX = nx * overlap * 0.5;
                        const moveY = ny * overlap * 0.5;

                        p1.pos.x += moveX;
                        p1.pos.y += moveY;
                        p2.pos.x -= moveX;
                        p2.pos.y -= moveY;

                        // Calculate impact velocity for kinetic-based metabolic exchange
                        const v1x = p1.pos.x - p1.oldPos.x;
                        const v1y = p1.pos.y - p1.oldPos.y;
                        const v2x = p2.pos.x - p2.oldPos.x;
                        const v2y = p2.pos.y - p2.oldPos.y;
                        
                        // Relative velocity along normal
                        const rvx = v1x - v2x;
                        const rvy = v1y - v2y;
                        const impactVelocity = Math.abs(rvx * nx + rvy * ny);

                        // Metabolic energy transfer logic
                        const baseTransferRate = 0.005;
                        const kineticFactor = impactVelocity * 0.02; // Scale factor for kinetic impact
                        const totalRate = Math.min(0.1, baseTransferRate + kineticFactor);

                        const eDiff = b1.energy - b2.energy;
                        const transfer = eDiff * totalRate;
                        
                        b1.energy -= transfer;
                        b2.energy += transfer;

                        b1.lastCollisionTime = Date.now();
                        b1.lastCollisionPoint = { x: (p1.pos.x + p2.pos.x) / 2, y: (p1.pos.y + p2.pos.y) / 2 };
                        
                        if (Math.abs(transfer) > 1.0 || impactVelocity > 1.0) this.events.push('COLLISION');
                    }
                }
            }
        }
      }
  }

  private checkFoodConsumption(bot: Xenobot): number {
      const com = bot.centerOfMass;
      const botRadius = (bot.genome.gridSize * this.config.gridScale) / 1.5;
      let energyGained = 0;

      for (let i = this.food.length - 1; i >= 0; i--) {
          const f = this.food[i];
          const dx = com.x - f.x;
          const dy = com.y - f.y;
          const distSq = dx*dx + dy*dy;
          
          if (distSq < (botRadius + FOOD_RADIUS) ** 2) {
               let eaten = false;
               for (const p of bot.particles) {
                   const pdx = p.pos.x - f.x;
                   const pdy = p.pos.y - f.y;
                   if (pdx*pdx + pdy*pdy < (FOOD_RADIUS + 10) ** 2) {
                       eaten = true;
                       break;
                   }
               }

               if (eaten) {
                   bot.energy += f.energy;
                   energyGained += f.energy;
                   this.food.splice(i, 1);
                   this.events.push('EAT'); 
               }
          }
      }
      return energyGained;
  }
  
  private updateBotSensory(bot: Xenobot): number {
    let targetHeading = bot.heading;
    let shortestDistSq = Infinity;
    const SENSOR_RADIUS_SQ = 600 * 600;
    let sensation = 0;
    
    for (const f of this.food) {
        const dx = f.x - bot.centerOfMass.x;
        const dy = f.y - bot.centerOfMass.y;
        const dSq = dx*dx + dy*dy;
        if (dSq < SENSOR_RADIUS_SQ && dSq < shortestDistSq) {
            shortestDistSq = dSq;
            targetHeading = Math.atan2(dy, dx);
            sensation = 1.0 - (dSq / SENSOR_RADIUS_SQ);
        }
    }
    
    if (shortestDistSq < Infinity) {
        const angleDiff = targetHeading - bot.heading;
        let dTheta = angleDiff;
        while (dTheta <= -Math.PI) dTheta += Math.PI*2;
        while (dTheta > Math.PI) dTheta -= Math.PI*2;
        bot.heading += dTheta * 0.05; 
    } else {
        bot.heading += (Math.random() - 0.5) * 0.1;
    }
    return sensation;
  }

  public evolvePopulation(generation: number): boolean {
      const currentPop = this.bots.filter(b => !b.isDead).map(b => {
          b.genome.fitness = (b.centerOfMass.x - b.startPosition.x);
          b.genome.fitness += b.energy * 0.1;
          return b.genome;
      });

      if (currentPop.length < 2) return false;

      const nextGenGenomes = evolvePopulation(currentPop, generation, this.config.populationSize);
      
      this.bots = nextGenGenomes.map(g => {
         let startX = 0;
         if (typeof g.originX === 'number') startX = g.originX;
         else startX = (Math.random() - 0.5) * 400;
         
         return this.createBot(g, startX, 200 + Math.random() * 200);
      });

      return true;
  }

  public getPopulationStats(generation: number): GeneticStats {
      let skin = 0, heart = 0, neuron = 0;
      this.bots.forEach(b => {
          if (b.isDead) return;
          b.genome.genes.forEach(row => row.forEach(cell => {
              if (cell === CellType.SKIN) skin++;
              if (cell === CellType.HEART) heart++;
              if (cell === CellType.NEURON) neuron++;
          }));
      });
      
      return {
          generation,
          skin,
          heart,
          neuron,
          total: skin + heart + neuron
      };
  }

  public smoothRenderPositions() {
      const alpha = 0.2;
      this.bots.forEach(b => {
          b.particles.forEach(p => {
              const dx = p.pos.x - p.renderPos.x;
              const dy = p.pos.y - p.renderPos.y;
              if (dx*dx + dy*dy > 40000) {
                  p.renderPos.x = p.pos.x;
                  p.renderPos.y = p.pos.y;
              } else {
                  p.renderPos.x += dx * alpha;
                  p.renderPos.y += dy * alpha;
              }
          });
      });
  }
}