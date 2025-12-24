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
  BREAKING_THRESHOLD,
  COLLISION_RADIUS
} from '../constants';
import { evolvePopulation as algoEvolve, mutate, pruneGenome } from './geneticAlgorithm';

const uid = () => Math.random().toString(36).substr(2, 9);
const MAX_FORCE = 60.0; 
const MAX_VELOCITY = 40.0;
const PARTICLE_MAINTENANCE_COST = 0.005; 

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
    const range = 8000; 

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

    const particleMap: number[][] = Array(size).fill(null).map(() => Array(size).fill(-1));

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const cellType = genome.genes[y][x];
        if (cellType !== CellType.EMPTY) {
           const px = startX + (x - size/2) * scale;
           const py = startY + (y - size/2) * scale;
           
           // Heavier mass stabilizes PBD jitter
           let mass = 1.0; 
           if (cellType === CellType.HEART) mass = 1.5; 
           if (cellType === CellType.NEURON) mass = 1.2; 

           particles.push({
             pos: { x: px, y: py },
             oldPos: { x: px, y: py },
             renderPos: { x: px, y: py },
             renderVel: { x: 0, y: 0 },
             mass,
             force: { x: 0, y: 0 },
             charge: 0,
             isFixed: false,
             phase: x * 0.6 + y * 0.1
           });
           particleMap[y][x] = particles.length - 1;
        }
      }
    }

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
                    
                    // Balanced Stiffness Settings
                    // 0.3 for muscle (soft but firm)
                    // 0.6 for neuron (structural)
                    let stiffness = 0.3; 
                    
                    if (type1 === CellType.NEURON && type2 === CellType.NEURON) {
                        stiffness = 0.6; // Structural Spine
                    } else if (isNeuron) {
                        stiffness = 0.45;
                    } else if (isMuscle) {
                        stiffness = 0.3; // Active tissue
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

  public update(totalTime: number) {
    this.events = [];
    
    const dtSq = TIMESTEP * TIMESTEP;
    const botCount = this.bots.length;

    // 1. Social Forces & Collisions
    if (botCount > 1) {
        this.resolveCollisions(botCount);
    }

    // 2. Individual Bot Updates
    const newBots: Xenobot[] = [];
    const maxBots = this.config.maxPopulationSize;

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
        
        // A. Update Structure & Apply Internal Damping
        const activeCharge = this.updateInternalStructure(bot, totalTime);
        bot.totalCharge = activeCharge;

        // B. External Forces & Verlet Integration
        this.applyExternalForcesAndIntegrate(bot, totalTime, dtSq);

        // C. PBD Constraint Solving (Shape Retention)
        this.resolveConstraints(bot);

        // D. Sensory & Consumption
        const energyGained = this.checkFoodConsumption(bot);
        
        // Stats
        bot.irruption = Math.min(1.0, activeCharge * 0.1);
        bot.absorption = Math.min(1.0, (energyGained > 0 ? 0.5 : 0));

        // Mitosis
        if (bot.energy > MITOSIS_THRESHOLD && 
            bot.age > 800 && 
            (botCount + newBots.length) < maxBots &&
            Math.random() < 0.00015) {
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

  private checkFoodConsumption(bot: Xenobot): number {
      let energyGained = 0;
      const scale = this.config.gridScale || 60;
      const maxRadius = (GRID_SIZE / 2) * scale * 1.5 + 100;
      const broadphaseSq = maxRadius * maxRadius;
      const eatDistSq = 900; 

      for (let i = this.food.length - 1; i >= 0; i--) {
          const f = this.food[i];
          const dx = bot.centerOfMass.x - f.x;
          const dy = bot.centerOfMass.y - f.y;
          const dSq = dx*dx + dy*dy;
          
          if (dSq > broadphaseSq) continue;
          
          let consumed = false;
          if (dSq < eatDistSq) { 
              consumed = true;
          } else {
              for (let j = 0; j < bot.particles.length; j++) {
                  const p = bot.particles[j];
                  const pdx = p.pos.x - f.x;
                  const pdy = p.pos.y - f.y;
                  if (pdx*pdx + pdy*pdy < eatDistSq) {
                      consumed = true;
                      break;
                  }
              }
          }
          
          if (consumed) { 
              bot.energy += f.energy;
              energyGained += f.energy;
              this.food.splice(i, 1);
              this.events.push('EAT');
          }
      }
      return energyGained;
  }

  private performMitosis(bot: Xenobot): Xenobot | null {
      bot.energy /= 2;
      this.events.push('MITOSIS');
      let childGenome = mutate(bot.genome);
      childGenome = pruneGenome(childGenome, 0.15);
      const offset = 60;
      const child = this.createBot(childGenome, bot.centerOfMass.x + offset, bot.centerOfMass.y + offset);
      child.groupId = bot.groupId;
      child.energy = bot.energy; 
      return child;
  }

  private updateInternalStructure(bot: Xenobot, time: number): number {
      let activeCharge = 0;
      const springs = bot.springs;
      const particles = bot.particles;
      const mStrength = this.config.muscleStrength;
      const mSpeed = this.config.muscleSpeed;
      const chargeLimit = 200.0; // Increased limit for more intense fields
      
      const decayFactor = METABOLIC_DECAY * 0.1;

      for (const s of springs) {
          const p1 = particles[s.p1];
          const p2 = particles[s.p2];

          // 1. Update Resting Length (Muscle Actuation)
          if (s.isMuscle) {
              bot.energy -= decayFactor;
              const avgCharge = (p1.charge + p2.charge) * 0.5;
              const freqMod = 1.0 + avgCharge * 4.0; 
              
              const contraction = Math.sin(time * mSpeed * freqMod + (s.phaseOffset || 0));
              
              // Modulate rest length
              s.currentRestLength = s.restLength * (1.0 + contraction * mStrength * 0.4);
          } else {
              s.currentRestLength = s.restLength;
          }

          // 2. Charge Generation (Piezoelectric)
          const dx = p1.pos.x - p2.pos.x;
          const dy = p1.pos.y - p2.pos.y;
          const distSq = dx*dx + dy*dy;
          const currLen = Math.sqrt(distSq);
          
          const strain = Math.abs(currLen - s.currentRestLength) / s.currentRestLength;
          if (strain > 0.05) {
             const chargeGen = strain * 10.0; // Increased generation for more visual impact
             p1.charge = Math.min(chargeLimit, p1.charge + chargeGen);
             p2.charge = Math.min(chargeLimit, p2.charge + chargeGen);
          }
          activeCharge += (p1.charge + p2.charge);

          // 3. Internal Damping (Shock Absorber)
          // Prevents PBD jitter by applying velocity-based resistance
          if (distSq > 0.0001) {
              const v1x = p1.pos.x - p1.oldPos.x;
              const v1y = p1.pos.y - p1.oldPos.y;
              const v2x = p2.pos.x - p2.oldPos.x;
              const v2y = p2.pos.y - p2.oldPos.y;
              
              const nx = dx / currLen;
              const ny = dy / currLen;

              // Relative velocity projected onto spring axis
              const vRel = (v2x - v1x) * nx + (v2y - v1y) * ny;
              
              // Damping coefficient (0.5 is moderate damping)
              const damping = 0.5;
              const fDamp = vRel * damping;
              
              const fx = nx * fDamp;
              const fy = ny * fDamp;

              p1.force.x += fx;
              p1.force.y += fy;
              p2.force.x -= fx;
              p2.force.y -= fy;
          }
      }
      return activeCharge;
  }

  private resolveConstraints(bot: Xenobot) {
      const iterations = CONSTRAINT_ITERATIONS;
      const springs = bot.springs;
      const particles = bot.particles;

      for (let i = 0; i < iterations; i++) {
          for (const s of springs) {
              const p1 = particles[s.p1];
              const p2 = particles[s.p2];

              const dx = p1.pos.x - p2.pos.x;
              const dy = p1.pos.y - p2.pos.y;
              const dist = Math.sqrt(dx*dx + dy*dy);
              
              if (dist < 0.0001) continue; 

              const diff = (dist - s.currentRestLength) / dist;
              
              // Stiffness Rate
              // Increased to 0.7 for better structural hold
              const rate = s.stiffness * 0.7; 

              const moveX = dx * diff * rate;
              const moveY = dy * diff * rate;

              const w1 = (1 / p1.mass) / ((1 / p1.mass) + (1 / p2.mass));
              const w2 = (1 / p2.mass) / ((1 / p1.mass) + (1 / p2.mass));

              p1.pos.x -= moveX * w1;
              p1.pos.y -= moveY * w1;
              p2.pos.x += moveX * w2;
              p2.pos.y += moveY * w2;
          }
      }
  }

  private applyExternalForcesAndIntegrate(bot: Xenobot, time: number, dtSq: number) {
    const particles = bot.particles;
    const pCount = particles.length;
    
    // Calculate Group Heading (approximate)
    let avgVx = 0, avgVy = 0;
    for (let i = 0; i < pCount; i++) {
        avgVx += (particles[i].pos.x - particles[i].oldPos.x);
        avgVy += (particles[i].pos.y - particles[i].oldPos.y);
    }
    avgVx /= (pCount || 1);
    avgVy /= (pCount || 1);
    
    // Update Heading Smoothed
    const speedSq = avgVx*avgVx + avgVy*avgVy;
    if (speedSq > 0.1) {
        const targetHeading = Math.atan2(avgVy, avgVx);
        let diff = targetHeading - bot.heading;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        bot.heading += diff * 0.05;
    }

    const FLUID_DRAG = 0.015;
    
    // Pre-calc Cilia Force
    const { cx, cy } = this.calculateCiliaForce(bot, time);

    for (let i = 0; i < pCount; i++) {
        const p = particles[i];
        bot.energy -= PARTICLE_MAINTENANCE_COST;
        
        // 1. Fluid Drag
        const vx = (p.pos.x - p.oldPos.x); 
        const vy = (p.pos.y - p.oldPos.y);
        
        const dragFactor = FLUID_DRAG * (1.0 + p.charge * 0.5);
        p.force.x -= vx * dragFactor;
        p.force.y -= vy * dragFactor;

        // 2. Cilia Propulsion
        p.force.x += cx * p.mass;
        p.force.y += cy * p.mass;

        // 3. Surface Tension
        const dxSelf = bot.centerOfMass.x - p.pos.x;
        const dySelf = bot.centerOfMass.y - p.pos.y;
        p.force.x += dxSelf * SURFACE_TENSION;
        p.force.y += dySelf * SURFACE_TENSION;

        // Decay
        // Very slow decay for persistent bio-electric trails
        p.charge *= 0.999995; 
    }

    // Integrate (Verlet)
    let centerX = 0, centerY = 0;
    const globalFriction = this.config.friction; // 0.99

    for (const p of particles) {
        p.force.x = Math.max(-MAX_FORCE, Math.min(MAX_FORCE, p.force.x));
        p.force.y = Math.max(-MAX_FORCE, Math.min(MAX_FORCE, p.force.y));

        const vx = (p.pos.x - p.oldPos.x) * globalFriction;
        const vy = (p.pos.y - p.oldPos.y) * globalFriction;

        p.oldPos.x = p.pos.x;
        p.oldPos.y = p.pos.y;

        p.pos.x += vx + p.force.x * dtSq;
        p.pos.y += vy + p.force.y * dtSq;

        p.force.x = 0;
        p.force.y = 0;

        centerX += p.pos.x;
        centerY += p.pos.y;
    }
    
    if (pCount > 0) {
        bot.centerOfMass.x = centerX / pCount;
        bot.centerOfMass.y = centerY / pCount;
    }
  }

  private calculateCiliaForce(bot: Xenobot, time: number) {
      const hx = Math.cos(bot.heading);
      const hy = Math.sin(bot.heading);

      const memory = bot.genome.bioelectricMemory || 0.5;
      const waveSpeed = 2.0 + (memory * 2.0);
      const beat = Math.sin(time * waveSpeed);

      let thrust = 0;
      if (beat > 0.2) {
          thrust = CILIA_FORCE * beat; 
      } else {
          thrust = CILIA_FORCE * 0.1 * beat; 
      }

      const wander = Math.sin(time * 0.5 + parseInt(bot.id.substr(0,3), 36));
      const turn = wander * 0.5;

      const cx = thrust * (hx - turn * hy);
      const cy = thrust * (hy + turn * hx);
      
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

                        // Energy Transfer
                        const transfer = (b1.energy - b2.energy) * 0.01;
                        b1.energy -= transfer;
                        b2.energy += transfer;

                        b1.lastCollisionTime = Date.now();
                        b1.lastCollisionPoint = { x: (p1.pos.x + p2.pos.x) * 0.5, y: (p1.pos.y + p2.pos.y) * 0.5 };
                    }
                }
            }
        }
      }
  }

  public evolvePopulation(generation: number): boolean {
    const currentGenomes = this.bots.map(b => {
        const dist = b.centerOfMass.x - b.startPosition.x;
        b.genome.fitness = b.energy + dist * 2;
        // IMPORTANT: Persist current position so the next generation starts nearby
        b.genome.originX = b.centerOfMass.x;
        b.genome.originY = b.centerOfMass.y;
        return b.genome;
    });
    
    const newGenomes = algoEvolve(currentGenomes, generation, this.config.populationSize);
    if (newGenomes.length === 0) return false;

    const nextBots: Xenobot[] = [];
    newGenomes.forEach(g => {
        const existing = this.bots.find(b => b.id === g.id);
        if (existing && !existing.isDead) {
            nextBots.push(existing);
        } else {
            // FIXED: Respect the genome's inherited position logic from geneticAlgorithm
            let startX = 0;
            let startY = 0;

            if (typeof g.originX === 'number' && !isNaN(g.originX)) {
                startX = g.originX + (Math.random()-0.5)*50;
            } else {
                startX = (Math.random()-0.5)*1000;
            }

            if (typeof g.originY === 'number' && !isNaN(g.originY)) {
                startY = g.originY + (Math.random()-0.5)*50;
            } else {
                startY = 200 + Math.random() * 100;
            }

            const bot = this.createBot(g, startX, startY);
            nextBots.push(bot);
        }
    });

    this.bots = nextBots;
    return true;
  }

  public getPopulationStats(generation: number): GeneticStats {
      let skin = 0, heart = 0, neuron = 0;
      this.bots.forEach(b => {
          b.genome.genes.forEach(row => {
              row.forEach(cell => {
                  if (cell === CellType.SKIN) skin++;
                  if (cell === CellType.HEART) heart++;
                  if (cell === CellType.NEURON) neuron++;
              });
          });
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
      const tension = 0.25; 
      const damping = 0.85;   

      this.bots.forEach(b => {
          b.particles.forEach(p => {
              if (!p.renderVel) p.renderVel = { x: 0, y: 0 };

              const dx = p.pos.x - p.renderPos.x;
              const dy = p.pos.y - p.renderPos.y;
              const distSq = dx*dx + dy*dy;

              if (distSq > 4000) {
                  p.renderPos.x = p.pos.x;
                  p.renderPos.y = p.pos.y;
                  p.renderVel.x = 0;
                  p.renderVel.y = 0;
              } else {
                  const ax = dx * tension;
                  const ay = dy * tension;
                  p.renderVel.x = (p.renderVel.x + ax) * damping;
                  p.renderVel.y = (p.renderVel.y + ay) * damping;
                  p.renderPos.x += p.renderVel.x;
                  p.renderPos.y += p.renderVel.y;
              }
          });
      });
  }
}