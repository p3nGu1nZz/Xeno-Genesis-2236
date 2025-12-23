
import { Xenobot, Particle, Spring, Genome, CellType, SimulationConfig, Food } from '../types';
import { DEFAULT_CONFIG, TIMESTEP, CONSTRAINT_ITERATIONS, CILIA_FORCE, METABOLIC_DECAY, INITIAL_YOLK_ENERGY, SURFACE_TENSION, FOOD_COUNT, FOOD_ENERGY, FOOD_RADIUS } from '../constants';

const uid = () => Math.random().toString(36).substr(2, 9);
const MAX_FORCE = 10.0; // Prevent explosion
const MAX_VELOCITY = 15.0; // Prevent infinite streaks

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
     // Spawn food in a wide area around the center, but dispersed
     const spread = 2500; 
     // REMOVED BIAS: Centered around 0 instead of 600
     const x = (Math.random() - 0.5) * spread; 
     const y = (Math.random() - 0.5) * spread * 0.5;
     
     // Keep within bounds roughly
     const clampedY = Math.max(-1500, Math.min(this.groundY - 50, y));

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
            phase: x * 0.6 + y * 0.1 // Topological phase for synchronized waves
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
      heading: Math.random() * Math.PI * 2 // Initialize random heading
    };
  }

  update(time: number) {
    const dt = TIMESTEP;
    const dtSq = dt * dt;
    const botCount = this.bots.length;

    let totalMemory = 0;
    let livingCount = 0;
    
    // Maintain food count
    if (this.food.length < FOOD_COUNT) {
        if (Math.random() < 0.1) this.spawnFood();
    }

    for(let i = 0; i < botCount; i++) {
        const b = this.bots[i];
        if (!b.isDead) {
            totalMemory += b.genome.bioelectricMemory;
            livingCount++;
            
            // Check Food Collisions
            this.checkFoodConsumption(b);
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
  
  checkFoodConsumption(bot: Xenobot) {
      // Optimization: Check distance from center of mass first
      const com = bot.centerOfMass;
      // Rough bounding circle for bot
      const botRadius = (bot.genome.gridSize * this.config.gridScale) / 1.5;

      for (let i = this.food.length - 1; i >= 0; i--) {
          const f = this.food[i];
          const dx = com.x - f.x;
          const dy = com.y - f.y;
          const distSq = dx*dx + dy*dy;
          
          // Optimization: Check if food is even close to the bot's body
          if (distSq < (botRadius + FOOD_RADIUS) ** 2) {
               // Detailed check against particles
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
                   this.food.splice(i, 1);
                   // Immediate visual feedback or growth could go here
               }
          }
      }
  }
  
  smoothRenderPositions() {
    // Linear Interpolation (Lerp) factor for smoothing
    // Lower value = smoother but more lag. 0.15 is a good balance.
    const alpha = 0.15; 
    const snapThresholdSq = 100 * 100; // Snap immediately if deviation is huge (e.g. teleport)
    
    const botCount = this.bots.length;
    for (let i = 0; i < botCount; i++) {
        const bot = this.bots[i];
        if (bot.isDead) continue;
        
        const particles = bot.particles;
        const pCount = particles.length;
        
        for (let j = 0; j < pCount; j++) {
            const p = particles[j];
            
            // Safety: Handle NaN/Invalid state by resetting to current pos
            if (!Number.isFinite(p.renderPos.x) || !Number.isFinite(p.renderPos.y)) {
                p.renderPos.x = p.pos.x;
                p.renderPos.y = p.pos.y;
                continue;
            }

            const dx = p.pos.x - p.renderPos.x;
            const dy = p.pos.y - p.renderPos.y;
            const distSq = dx*dx + dy*dy;
            
            // If the particle has moved too far in one frame (physics glitch or respawn), snap to it
            if (distSq > snapThresholdSq) {
                p.renderPos.x = p.pos.x;
                p.renderPos.y = p.pos.y;
            } else {
                // Apply Lerp: current = current + (target - current) * alpha
                p.renderPos.x += dx * alpha;
                p.renderPos.y += dy * alpha;
            }
        }
    }
  }

  private applySocialForces(botCount: number) {
      const GROUP_REPULSION_RADIUS = 300; 
      const GROUP_FORCE = 0.5; // Reduced from 0.8
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

              if (distSq < 0.1 || distSq > GROUP_REPULSION_RADIUS * GROUP_REPULSION_RADIUS) continue; 

              if (b1.groupId !== b2.groupId) {
                  const dist = Math.sqrt(distSq);
                  const overlap = GROUP_REPULSION_RADIUS - dist;
                  const f = (overlap / GROUP_REPULSION_RADIUS) * GROUP_FORCE;
                  const fx = (dx / dist) * f;
                  const fy = (dy / dist) * f;
                  this.applyForceToBot(b1, fx, fy);
                  this.applyForceToBot(b2, -fx, -fy);
              } else if (distSq < SELF_REPULSION_RADIUS * SELF_REPULSION_RADIUS) {
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

  private applyForceToBot(bot: Xenobot, fx: number, fy: number) {
      const count = bot.particles.length;
      if (count === 0) return;
      // Distribute force but clamp it per particle to avoid sudden explosions
      const pFx = Math.max(-2, Math.min(2, fx / count));
      const pFy = Math.max(-2, Math.min(2, fy / count));
      for (const p of bot.particles) {
          p.force.x += pFx;
          p.force.y += pFy;
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
    const groundY = this.groundY;
    const acousticActive = this.config.acousticFreq > 100; 
    const syncStrength = this.config.syncRate || 0.3;

    bot.energy -= METABOLIC_DECAY;
    bot.age++;

    if (bot.energy <= 0) {
        bot.isDead = true;
        return; 
    }

    // --- SENSORY SYSTEM & STEERING ---
    // Find closest food to steer towards
    let targetHeading = bot.heading;
    let shortestDistSq = Infinity;
    const SENSOR_RADIUS_SQ = 600 * 600; // Awareness radius
    
    for (const f of this.food) {
        const dx = f.x - bot.centerOfMass.x;
        const dy = f.y - bot.centerOfMass.y;
        const dSq = dx*dx + dy*dy;
        if (dSq < SENSOR_RADIUS_SQ && dSq < shortestDistSq) {
            shortestDistSq = dSq;
            targetHeading = Math.atan2(dy, dx);
        }
    }
    
    // Adjust Heading
    if (shortestDistSq < Infinity) {
        // Steer towards food
        const angleDiff = targetHeading - bot.heading;
        // Normalize angle -PI to PI
        let dTheta = angleDiff;
        while (dTheta <= -Math.PI) dTheta += Math.PI*2;
        while (dTheta > Math.PI) dTheta -= Math.PI*2;
        
        bot.heading += dTheta * 0.05; // Steering speed
    } else {
        // Random Wander
        bot.heading += (Math.random() - 0.5) * 0.1;
    }

    const particles = bot.particles;
    const springs = bot.springs;
    const pCount = particles.length;
    const sCount = springs.length;
    const invGroundY = 1.0 / (groundY || 1);

    // Temp buffers for ciliary force synchronization
    const ciliaForcesX = new Float32Array(pCount);
    const ciliaForcesY = new Float32Array(pCount);

    // Calculate Average Velocity for Hydrodynamic Cohesion 
    let avgVx = 0, avgVy = 0;
    if (pCount > 0) {
        for (let i = 0; i < pCount; i++) {
            avgVx += (particles[i].pos.x - particles[i].oldPos.x);
            avgVy += (particles[i].pos.y - particles[i].oldPos.y);
        }
        avgVx /= pCount;
        avgVy /= pCount;
    }

    // Forces from Particles (Gravity, Cilia, Environment)
    for (let i = 0; i < pCount; i++) {
      const p = particles[i];
      p.force.x = 0;
      p.force.y = gravity; 

      let depthRatio = p.pos.y * invGroundY;
      depthRatio = Math.max(0, Math.min(1, depthRatio));

      const buoyancy = gravity * (0.9 + depthRatio * 0.1); 
      p.force.y -= buoyancy;

      const currentFlow = Math.sin(time * 0.5 + depthRatio * 4.0) * 0.08;
      p.force.x += currentFlow;
      
      // Brownian
      p.force.x += (Math.random() - 0.5) * 0.5;
      p.force.y += (Math.random() - 0.5) * 0.5;

      // Ciliary Propulsion Logic
      let propX = 0;
      let propY = 0;

      if (acousticActive) {
          // Linearizing Stimulus: Force global alignment
          propX = CILIA_FORCE; 
          bot.heading = bot.heading * 0.95; // Decay heading to 0 (right)
      } else {
          // Metachronal Wave Logic
          const relX = (p.pos.x - bot.centerOfMass.x) * 0.05;
          const relY = (p.pos.y - bot.centerOfMass.y) * 0.05;

          const waveFreq = 3.0 + (memory * 2.0);
          
          // Spatial phase shift aligns movement
          const spatialPhase = p.phase + relX - relY;
          const currentPhase = spatialPhase - (time * waveFreq * Math.PI * 2);
          
          const beat = Math.sin(currentPhase);
          
          // Calculate Thrust Magnitude (Asymmetric stroke)
          let thrustMag = 0;
          if (beat > 0) {
             thrustMag = CILIA_FORCE * 2.0 * beat; // Power stroke
          } else {
             thrustMag = CILIA_FORCE * 0.5 * beat; // Recovery stroke (negative)
          }
          
          // Apply thrust ALONG the bot's heading
          const hx = Math.cos(bot.heading);
          const hy = Math.sin(bot.heading);
          
          propX = thrustMag * hx;
          propY = thrustMag * hy;
          
          // Global Hydrodynamic Cohesion (Pull towards group average velocity)
          const pVx = p.pos.x - p.oldPos.x;
          const pVy = p.pos.y - p.oldPos.y;
          const cohesionStrength = 3.0 * memory; 
          
          propX += (avgVx - pVx) * cohesionStrength;
          propY += (avgVy - pVy) * cohesionStrength;

          // Noise reduction for higher memory/plasticity
          if (memory < 0.8) {
              const noiseScale = (0.8 - memory);
              propX += (Math.random() - 0.5) * noiseScale * CILIA_FORCE;
              propY += (Math.random() - 0.5) * noiseScale * CILIA_FORCE;
          }
      }
      
      // Store ciliary force for synchronization (do not add to p.force yet)
      ciliaForcesX[i] = propX;
      ciliaForcesY[i] = propY;

      // Self Assembly / Cohesion
      const dxSelf = bot.centerOfMass.x - p.pos.x;
      const dySelf = bot.centerOfMass.y - p.pos.y;
      p.force.x += dxSelf * SURFACE_TENSION;
      p.force.y += dySelf * SURFACE_TENSION;

      p.charge *= decay;
    }

    // Synchronize Ciliary Forces (Neighbor Smoothing)
    // This allows adjacent cells to coordinate their strokes, creating better waves
    for (let i = 0; i < sCount; i++) {
        const s = springs[i];
        const i1 = s.p1;
        const i2 = s.p2;

        const avgX = (ciliaForcesX[i1] + ciliaForcesX[i2]) * 0.5;
        const avgY = (ciliaForcesY[i1] + ciliaForcesY[i2]) * 0.5;

        const diffX = avgX - ciliaForcesX[i1];
        const diffY = avgY - ciliaForcesY[i1];

        // Blend forces based on sync rate
        ciliaForcesX[i1] += diffX * syncStrength;
        ciliaForcesY[i1] += diffY * syncStrength;
        
        ciliaForcesX[i2] += (avgX - ciliaForcesX[i2]) * syncStrength;
        ciliaForcesY[i2] += (avgY - ciliaForcesY[i2]) * syncStrength;
    }

    // Apply Final Synchronized Ciliary Forces
    for (let i = 0; i < pCount; i++) {
        particles[i].force.x += ciliaForcesX[i];
        particles[i].force.y += ciliaForcesY[i];
    }

    // Neighbor Interaction Force (Viscous Coupling)
    // Synchronize force application across the body structure for unified movement
    for (let i = 0; i < sCount; i++) {
        const s = springs[i];
        const p1 = particles[s.p1];
        const p2 = particles[s.p2];

        // Increased coupling for better cohesion (Low-pass filter on forces)
        const coupling = 0.2 + (memory * 0.3); // Dynamic coupling based on brain plasticity

        // Average forces between neighbors
        const avgFx = (p1.force.x + p2.force.x) * 0.5;
        const avgFy = (p1.force.y + p2.force.y) * 0.5;

        // Apply corrective smoothing force
        const transferX = (avgFx - p1.force.x) * coupling;
        const transferY = (avgFy - p1.force.y) * coupling;
        
        // Push p1 towards avg
        p1.force.x += transferX;
        p1.force.y += transferY;
        
        p2.force.x += (avgFx - p2.force.x) * coupling;
        p2.force.y += (avgFy - p2.force.y) * coupling;
    }

    // Spring Forces (Structural Physics)
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

      // Bio-Electricity Generation
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
    
    bot.totalCharge = activeCharge;

    // Integration
    let cx = 0, cy = 0;
    
    // Safety Clamp for Forces
    for (let i = 0; i < pCount; i++) {
      const p = particles[i];
      
      // Clamp force to prevent explosion
      p.force.x = Math.max(-MAX_FORCE, Math.min(MAX_FORCE, p.force.x));
      p.force.y = Math.max(-MAX_FORCE, Math.min(MAX_FORCE, p.force.y));

      let depthVal = p.pos.y * invGroundY;
      depthVal = Math.max(0, Math.min(1, depthVal));
      const depthViscosity = 1.0 - (depthVal * 0.03);
      
      const effectiveFriction = fluidBaseFriction * depthViscosity;

      let vx = (p.pos.x - p.oldPos.x) * effectiveFriction;
      let vy = (p.pos.y - p.oldPos.y) * effectiveFriction;

      // Clamp Velocity to prevent "infinite lines"
      vx = Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, vx));
      vy = Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, vy));

      p.oldPos.x = p.pos.x;
      p.oldPos.y = p.pos.y;

      p.pos.x += vx + p.force.x * dtSq;
      p.pos.y += vy + p.force.y * dtSq;

      // Nan Check - Prevent poisoning of the simulation
      if (!Number.isFinite(p.pos.x) || !Number.isFinite(p.pos.y)) {
          p.pos.x = p.oldPos.x;
          p.pos.y = p.oldPos.y;
      }

      // Ground Collision
      if (p.pos.y > groundY) {
        p.pos.y = groundY;
        const vy_impact = (p.pos.y - p.oldPos.y);
        p.oldPos.y = p.pos.y + vy_impact * 0.6; 
      }
      // Ceiling
      if (p.pos.y < -3000) {
          p.pos.y = -3000;
          p.oldPos.y = p.pos.y;
      }

      cx += p.pos.x;
      cy += p.pos.y;
    }

    if (pCount > 0) {
      bot.centerOfMass.x = cx / pCount;
      bot.centerOfMass.y = cy / pCount;
    }
  }
