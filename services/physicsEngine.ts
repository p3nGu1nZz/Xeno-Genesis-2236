
import { Xenobot, Particle, Spring, Genome, CellType, SimulationConfig, Food } from '../types';
import { DEFAULT_CONFIG, TIMESTEP, CILIA_FORCE, METABOLIC_DECAY, INITIAL_YOLK_ENERGY, SURFACE_TENSION, FOOD_COUNT, FOOD_ENERGY, FOOD_RADIUS } from '../constants';
import { mutate } from './geneticAlgorithm';

const uid = () => Math.random().toString(36).substr(2, 9);
const MAX_FORCE = 10.0;
const MAX_VELOCITY = 15.0;
const PARTICLE_MAINTENANCE_COST = 0.005;
const BOUNDARY_LIMIT = 2000; // Edge of the safe zone
const COLLISION_RADIUS = 9; // Slightly larger than render radius (8)

export class PhysicsEngine {
  bots: Xenobot[] = [];
  food: Food[] = [];
  config: SimulationConfig;
  groundY: number;

  constructor(config: SimulationConfig = DEFAULT_CONFIG) {
    this.config = config;
    this.groundY = config.groundHeight;
    this.initFood();
  }

  initFood() {
    this.food = [];
    for (let i = 0; i < FOOD_COUNT; i++) {
        this.spawnFood();
    }
  }

  spawnFood() {
     // Expand spread to cover entire arena
     const spreadX = 4000; 
     const spreadY = 3000;

     const x = (Math.random() - 0.5) * spreadX; 
     // Allow food to spawn higher up but keep it below a certain ceiling and above ground
     const y = (Math.random() - 0.5) * spreadY;
     
     const clampedY = Math.max(-2000, Math.min(this.groundY - 50, y));

     this.food.push({
         id: uid(),
         x,
         y: clampedY,
         energy: FOOD_ENERGY,
         phase: Math.random() * Math.PI * 2
     });
  }

  addBot(bot: Xenobot) {
      this.bots.push(bot);
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
            phase: x * 0.6 + y * 0.1
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
      age: 0,
      heading: Math.random() * Math.PI * 2,
      irruption: 0,
      absorption: 0
    };
  }

  // Refactored: More deterministic evolution based on energy thresholds ("Selfish Gene")
  evolvePopulation(currentGeneration: number): boolean {
      const MAX_SPAWNS = 3; 
      let spawnCount = 0;
      let evolutionOccurred = false;
      const bots = this.bots;
      
      const REPRODUCTION_THRESHOLD = 800; // Energy required to consider reproduction
      const REPRODUCTION_COST = 400;

      // Filter healthy bots
      const candidates = bots.filter(b => !b.isDead && b.energy > REPRODUCTION_THRESHOLD);
      
      // Shuffle candidates to prevent bias
      for (let i = candidates.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
      }

      for (const parent of candidates) {
          if (spawnCount >= MAX_SPAWNS) break;
          if (this.bots.length >= this.config.maxPopulationSize) break;

          // Probability increases with excess energy
          const excessEnergy = parent.energy - REPRODUCTION_THRESHOLD;
          const chance = excessEnergy / 2000; // e.g. 2000 excess = 100% chance
          
          // Base mutation chance of 5% for anyone above threshold, plus bonus
          if (Math.random() < Math.max(0.05, chance)) {
             const childGenome = mutate(parent.genome);
             childGenome.generation = currentGeneration + 1;
             
             const spawnX = parent.centerOfMass.x + (Math.random() - 0.5) * 50;
             const spawnY = parent.centerOfMass.y + (Math.random() - 0.5) * 50;
             childGenome.originX = spawnX;
             
             const childBot = this.createBot(childGenome, spawnX, spawnY);
             this.addBot(childBot);
             
             parent.energy -= REPRODUCTION_COST;
             spawnCount++;
             evolutionOccurred = true;
          }
      }
      return evolutionOccurred;
  }

  update(time: number) {
    const dt = TIMESTEP;
    const dtSq = dt * dt;
    const botCount = this.bots.length;
    let livingCount = 0;
    let totalMemory = 0;

    // Maintenance & cleanup
    if (this.food.length < FOOD_COUNT) {
        if (Math.random() < 0.1) this.spawnFood();
    }

    for(let i = 0; i < botCount; i++) {
        const b = this.bots[i];
        if (!b.isDead) {
            totalMemory += b.genome.bioelectricMemory;
            livingCount++;
        }
    }
    
    // Global parameters based on collective consciousness
    const avgMemory = livingCount > 0 ? totalMemory / livingCount : 0.5;
    const collectiveFriction = this.config.friction + (avgMemory - 0.5) * 0.08;
    const fluidBaseFriction = Math.max(0.85, Math.min(0.995, collectiveFriction));
    
    // Optimized: Apply social forces
    if (botCount > 1) {
        this.applySocialForces(botCount);
        this.resolveCollisions(botCount);
    }

    // Update each bot
    for (let i = 0; i < botCount; i++) {
      const bot = this.bots[i];
      if (bot.isDead) continue;
      this.updateBot(bot, time, dt, dtSq, fluidBaseFriction);
    }
    
    this.smoothRenderPositions();
  }
  
  smoothRenderPositions() {
    // Implement Lerp (Linear Interpolation) for smoother rendering
    // Alpha determines how quickly renderPos catches up to physics pos
    const alpha = 0.2; 
    const snapThresholdSq = 100 * 100; // Snap if distance is large (e.g. initial spawn)
    const sleepThresholdSq = 0.01; // Avoid micro-jitter updates

    for (const bot of this.bots) {
        if (bot.isDead) continue;
        for (const p of bot.particles) {
            // Safety check
            if (!Number.isFinite(p.renderPos.x) || !Number.isFinite(p.renderPos.y)) {
                p.renderPos.x = p.pos.x;
                p.renderPos.y = p.pos.y;
                continue;
            }

            const dx = p.pos.x - p.renderPos.x;
            const dy = p.pos.y - p.renderPos.y;
            const distSq = dx*dx + dy*dy;
            
            if (distSq > snapThresholdSq) {
                p.renderPos.x = p.pos.x;
                p.renderPos.y = p.pos.y;
            } else if (distSq > sleepThresholdSq) {
                // Apply Lerp
                p.renderPos.x += dx * alpha;
                p.renderPos.y += dy * alpha;
            } else {
                p.renderPos.x = p.pos.x;
                p.renderPos.y = p.pos.y;
            }
        }
    }
  }

  // Basic Collider Implementation to prevent overlap
  private resolveCollisions(botCount: number) {
      for (let i = 0; i < botCount; i++) {
          const b1 = this.bots[i];
          if (b1.isDead) continue;

          for (let j = i + 1; j < botCount; j++) {
              const b2 = this.bots[j];
              if (b2.isDead) continue;

              // Broad Phase: AABB / Bounding Circle
              const dx = b1.centerOfMass.x - b2.centerOfMass.x;
              const dy = b1.centerOfMass.y - b2.centerOfMass.y;
              const distSq = dx*dx + dy*dy;
              const combinedRadius = 300; // Approximate radius of a bot

              if (distSq > combinedRadius * combinedRadius) continue;

              // Narrow Phase: Particle vs Particle
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

                          // Apply impulse to separate
                          const separation = overlap * 0.5;
                          
                          // Position Correction
                          p1.pos.x += nx * separation;
                          p1.pos.y += ny * separation;
                          p2.pos.x -= nx * separation;
                          p2.pos.y -= ny * separation;

                          // Velocity damping (friction)
                          const kFriction = 0.9;
                          p1.oldPos.x = p1.pos.x - (p1.pos.x - p1.oldPos.x) * kFriction;
                          p1.oldPos.y = p1.pos.y - (p1.pos.y - p1.oldPos.y) * kFriction;
                          p2.oldPos.x = p2.pos.x - (p2.pos.x - p2.oldPos.x) * kFriction;
                          p2.oldPos.y = p2.pos.y - (p2.pos.y - p2.oldPos.y) * kFriction;
                      }
                  }
              }
          }
      }
  }

  private applySocialForces(botCount: number) {
      const GROUP_REPULSION_RADIUS = 300; 
      const GROUP_FORCE = 0.5;
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

              if (distSq < 0.1 || distSq > GROUP_REPULSION_RADIUS ** 2) continue; 

              const dist = Math.sqrt(distSq);
              let force = 0;

              if (b1.groupId !== b2.groupId) {
                  // Inter-group repulsion
                  force = ((GROUP_REPULSION_RADIUS - dist) / GROUP_REPULSION_RADIUS) * GROUP_FORCE;
              } else if (dist < SELF_REPULSION_RADIUS) {
                  // Intra-group repulsion
                  force = ((SELF_REPULSION_RADIUS - dist) / SELF_REPULSION_RADIUS) * SELF_FORCE;
              }

              if (force > 0) {
                 const fx = (dx / dist) * force;
                 const fy = (dy / dist) * force;
                 this.distributeForce(b1, fx, fy);
                 this.distributeForce(b2, -fx, -fy);
              }
          }
      }
  }

  private distributeForce(bot: Xenobot, fx: number, fy: number) {
      const count = bot.particles.length;
      if (count === 0) return;
      // Clamp to prevent physics explosion from single large impulse
      const pFx = Math.max(-2, Math.min(2, fx / count));
      const pFy = Math.max(-2, Math.min(2, fy / count));
      for (const p of bot.particles) {
          p.force.x += pFx;
          p.force.y += pFy;
      }
  }

  // --- Decomposed Update Logic with Mind-Body Operators ---

  private updateBot(bot: Xenobot, time: number, dt: number, dtSq: number, fluidBaseFriction: number) {
    bot.energy -= METABOLIC_DECAY;
    bot.age++;

    if (bot.energy <= 0) {
        bot.isDead = true;
        return; 
    }

    // ARCHITECTURE PHASE A: Mental Causation (Irruption)
    // The "Unobservable Mental Cause" (Genome/Phase) exerts "Irruption" into the material world via muscle forces.
    const irruption = this.performIrruption(bot, time);
    bot.irruption = irruption;

    // PHYSICS PHASE: Material Event
    // Calculate environmental forces (Fluid dynamics, cilia) and integrate positions
    this.performMaterialPhysics(bot, time, dt, dtSq, fluidBaseFriction);

    // ARCHITECTURE PHASE B: Conscious Experience (Absorption)
    // The "Unintelligible Material Event" (Collisions, Stress) causes "Absorption" into the mental state (Energy, Memory).
    const absorption = this.performAbsorption(bot);
    bot.absorption = absorption;
    
    // Decay values for visualization
    bot.irruption *= 0.8;
    bot.absorption *= 0.8;
  }

  // Corresponds to "Mental Causation -> Irruption"
  private performIrruption(bot: Xenobot, time: number): number {
      // 1. Internal Structure Updates (Springs/Muscles)
      // This function returns the total active charge generated by muscles/structure
      const activeCharge = this.updateInternalStructure(bot, time);
      bot.totalCharge = activeCharge;
      
      // Irruption is proportional to the active charge (effort) being exerted
      return activeCharge;
  }

  // Corresponds to "Physics Integration"
  private performMaterialPhysics(bot: Xenobot, time: number, dt: number, dtSq: number, fluidBaseFriction: number) {
    const particles = bot.particles;
    const pCount = particles.length;

    // Temporary buffers for cilia sync
    const ciliaForcesX = new Float32Array(pCount);
    const ciliaForcesY = new Float32Array(pCount);
    
    // Cilia Cohesion Calculation
    let avgVx = 0, avgVy = 0;
    for (let i = 0; i < pCount; i++) {
        avgVx += (particles[i].pos.x - particles[i].oldPos.x);
        avgVy += (particles[i].pos.y - particles[i].oldPos.y);
    }
    avgVx /= (pCount || 1);
    avgVy /= (pCount || 1);

    // 1. Calculate Particle Forces (Gravity, Fluid, Cilia)
    for (let i = 0; i < pCount; i++) {
        const p = particles[i];
        
        // Structure cost
        bot.energy -= PARTICLE_MAINTENANCE_COST;
        
        // Gravity / Buoyancy
        p.force.x = 0;
        p.force.y = this.config.gravity; 
        const invGroundY = 1.0 / (this.groundY || 1);
        let depthRatio = Math.max(0, Math.min(1, p.pos.y * invGroundY));
        p.force.y -= this.config.gravity * (0.9 + depthRatio * 0.1);

        // Fluid Current
        p.force.x += Math.sin(time * 0.5 + depthRatio * 4.0) * 0.08;
        
        // Brownian Motion
        p.force.x += (Math.random() - 0.5) * 0.5;
        p.force.y += (Math.random() - 0.5) * 0.5;

        // Cilia Calculation
        const { cx, cy } = this.calculateCiliaForce(bot, p, time, avgVx, avgVy);
        ciliaForcesX[i] = cx;
        ciliaForcesY[i] = cy;

        // Surface Tension
        const dxSelf = bot.centerOfMass.x - p.pos.x;
        const dySelf = bot.centerOfMass.y - p.pos.y;
        p.force.x += dxSelf * SURFACE_TENSION;
        p.force.y += dySelf * SURFACE_TENSION;

        p.charge *= this.config.bioelectricDecay;
    }

    // 2. Synchronize Cilia
    this.synchronizeCilia(bot, ciliaForcesX, ciliaForcesY);

    // Apply Synced Cilia Forces
    for (let i = 0; i < pCount; i++) {
        particles[i].force.x += ciliaForcesX[i];
        particles[i].force.y += ciliaForcesY[i];
    }
    
    // 3. Integrate
    this.integrateParticles(bot, dtSq, fluidBaseFriction);
  }

  // Corresponds to "Material Event -> Absorption -> Conscious Experience"
  private performAbsorption(bot: Xenobot): number {
    let absorptionEvent = 0;

    // 1. Sensory Input (Navigational Absorption)
    // The bot "senses" food and adjusts heading. This is information absorption.
    const sensoryStrength = this.updateBotSensory(bot);
    if (sensoryStrength > 0) absorptionEvent += sensoryStrength * 0.5;

    // 2. Consumption (Energy Absorption)
    // Physical contact with food results in energy gain.
    const energyGained = this.checkFoodConsumption(bot);
    if (energyGained > 0) absorptionEvent += 2.0; // High spike for eating

    // 3. Environmental Stress (Pain Absorption)
    // Hitting boundaries causes stress absorption.
    const distFromCenter = Math.abs(bot.centerOfMass.x);
    if (distFromCenter > BOUNDARY_LIMIT) {
        bot.energy -= 0.8; // High environmental stress
        
        const pushDir = -Math.sign(bot.centerOfMass.x);
        const overlap = distFromCenter - BOUNDARY_LIMIT;
        const pushForce = Math.min(2.0, overlap * 0.01);
        
        this.distributeForce(bot, pushDir * pushForce, 0);
        absorptionEvent += 1.0; // Stress spike
    }

    return absorptionEvent;
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
               }
          }
      }
      return energyGained;
  }

  private calculateCiliaForce(bot: Xenobot, p: Particle, time: number, avgVx: number, avgVy: number) {
      if (this.config.acousticFreq > 100) {
          // Acoustic alignment override
          return { cx: CILIA_FORCE, cy: 0 };
      }

      const memory = bot.genome.bioelectricMemory || 0.5;
      const relX = (p.pos.x - bot.centerOfMass.x) * 0.05;
      const relY = (p.pos.y - bot.centerOfMass.y) * 0.05;
      const waveFreq = 3.0 + (memory * 2.0);
      
      const spatialPhase = p.phase + relX - relY;
      const beat = Math.sin(spatialPhase - (time * waveFreq * Math.PI * 2));
      
      // Asymmetric Stroke
      const thrustMag = beat > 0 
          ? CILIA_FORCE * 2.0 * beat 
          : CILIA_FORCE * 0.5 * beat;

      const hx = Math.cos(bot.heading);
      const hy = Math.sin(bot.heading);
      
      let cx = thrustMag * hx;
      let cy = thrustMag * hy;
      
      // Hydrodynamic Cohesion
      const pVx = p.pos.x - p.oldPos.x;
      const pVy = p.pos.y - p.oldPos.y;
      const cohesionStrength = 3.0 * memory; 
      
      cx += (avgVx - pVx) * cohesionStrength;
      cy += (avgVy - pVy) * cohesionStrength;

      if (memory < 0.8) {
          const noiseScale = (0.8 - memory);
          cx += (Math.random() - 0.5) * noiseScale * CILIA_FORCE;
          cy += (Math.random() - 0.5) * noiseScale * CILIA_FORCE;
      }

      return { cx, cy };
  }

  private synchronizeCilia(bot: Xenobot, forcesX: Float32Array, forcesY: Float32Array) {
      const springs = bot.springs;
      const syncStrength = this.config.syncRate || 0.3;
      
      // Neighbor Smoothing
      for (const s of springs) {
          const i1 = s.p1;
          const i2 = s.p2;

          const avgX = (forcesX[i1] + forcesX[i2]) * 0.5;
          const avgY = (forcesY[i1] + forcesY[i2]) * 0.5;

          const diffX1 = avgX - forcesX[i1];
          const diffY1 = avgY - forcesY[i1];
          const diffX2 = avgX - forcesX[i2];
          const diffY2 = avgY - forcesY[i2];

          forcesX[i1] += diffX1 * syncStrength;
          forcesY[i1] += diffY1 * syncStrength;
          forcesX[i2] += diffX2 * syncStrength;
          forcesY[i2] += diffY2 * syncStrength;
      }
  }

  private updateInternalStructure(bot: Xenobot, time: number): number {
      let activeCharge = 0;
      const particles = bot.particles;
      const springs = bot.springs;
      const memory = bot.genome.bioelectricMemory || 0.5;
      const mStrength = this.config.muscleStrength;
      const mSpeed = this.config.muscleSpeed;
      const plasticity = this.config.plasticity;
      
      // 1. Viscous Coupling (Unified movement)
      const coupling = 0.2 + (memory * 0.3);
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

      // 2. Spring Physics
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
          const forceVal = s.stiffness * diff;

          // Bio-Electricity
          const stress = Math.abs(diff); 
          const chargeGen = stress * 0.6;
          if (chargeGen > 0.01) {
              p1.charge = Math.min(1, p1.charge + chargeGen);
              p2.charge = Math.min(1, p2.charge + chargeGen);
          }
          activeCharge += (p1.charge + p2.charge);

          // Plasticity
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
      
      return activeCharge;
  }

  private integrateParticles(bot: Xenobot, dtSq: number, fluidBaseFriction: number) {
      const particles = bot.particles;
      const invGroundY = 1.0 / (this.groundY || 1);
      let cx = 0, cy = 0;

      for (const p of particles) {
          // Force Clamping
          p.force.x = Math.max(-MAX_FORCE, Math.min(MAX_FORCE, p.force.x));
          p.force.y = Math.max(-MAX_FORCE, Math.min(MAX_FORCE, p.force.y));

          // Depth-based viscosity
          const depthVal = Math.max(0, Math.min(1, p.pos.y * invGroundY));
          const effectiveFriction = fluidBaseFriction * (1.0 - (depthVal * 0.03));

          // Verlet Integration
          let vx = (p.pos.x - p.oldPos.x) * effectiveFriction;
          let vy = (p.pos.y - p.oldPos.y) * effectiveFriction;

          // Velocity Clamping
          vx = Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, vx));
          vy = Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, vy));

          p.oldPos.x = p.pos.x;
          p.oldPos.y = p.pos.y;

          p.pos.x += vx + p.force.x * dtSq;
          p.pos.y += vy + p.force.y * dtSq;

          // NaN Safety
          if (!Number.isFinite(p.pos.x) || !Number.isFinite(p.pos.y)) {
              p.pos.x = p.oldPos.x;
              p.pos.y = p.oldPos.y;
          }

          // Boundary Constraints
          if (p.pos.y > this.groundY) {
              p.pos.y = this.groundY;
              const vy_impact = (p.pos.y - p.oldPos.y);
              p.oldPos.y = p.pos.y + vy_impact * 0.6; 
          }
          if (p.pos.y < -3000) {
              p.pos.y = -3000;
              p.oldPos.y = p.pos.y;
          }

          cx += p.pos.x;
          cy += p.pos.y;
      }
      
      if (particles.length > 0) {
          bot.centerOfMass.x = cx / particles.length;
          bot.centerOfMass.y = cy / particles.length;
      }
  }
}
