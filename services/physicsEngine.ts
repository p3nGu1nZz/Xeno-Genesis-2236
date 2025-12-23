
import { Xenobot, Particle, Spring, Genome, CellType, SimulationConfig, Food } from '../types';
import { DEFAULT_CONFIG, TIMESTEP, CILIA_FORCE, METABOLIC_DECAY, INITIAL_YOLK_ENERGY, SURFACE_TENSION, FOOD_COUNT, FOOD_ENERGY, FOOD_RADIUS, MITOSIS_THRESHOLD } from '../constants';
import { mutate } from './geneticAlgorithm';

const uid = () => Math.random().toString(36).substr(2, 9);
const MAX_FORCE = 15.0;
const MAX_VELOCITY = 20.0;
const PARTICLE_MAINTENANCE_COST = 0.005;
const BOUNDARY_LIMIT = 2500; 
const COLLISION_RADIUS = 12; 
const BREAKING_THRESHOLD = 4.5; 

export class PhysicsEngine {
  bots: Xenobot[] = [];
  food: Food[] = [];
  config: SimulationConfig;
  groundY: number;
  private nextGroupId = 2; // Start after 0 and 1 to ensure unique IDs for new groups

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
     const xRange = BOUNDARY_LIMIT * 2;
     const x = (Math.random() - 0.5) * xRange;
     const deepLimit = -2500;
     const surfaceBuffer = 100;
     const surfaceLimit = this.groundY - surfaceBuffer;
     const y = deepLimit + Math.random() * (surfaceLimit - deepLimit);

     this.food.push({
         id: uid(),
         x,
         y,
         energy: FOOD_ENERGY,
         phase: Math.random() * Math.PI * 2 
     });
  }

  addBot(bot: Xenobot) {
      this.bots.push(bot);
  }

  createBot(genome: Genome, startX: number, startY: number): Xenobot {
    let particles: Particle[] = [];
    let springs: Spring[] = [];
    const { genes, gridSize } = genome;
    const scale = this.config.gridScale;

    // Temporary map to track particle indices during creation
    const particleMap: number[][] = Array(gridSize).fill(null).map(() => Array(gridSize).fill(-1));

    // 1. Create Particles
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
            mass: 1.2, 
            force: { x: 0, y: 0 },
            charge: 0,
            phase: x * 0.6 + y * 0.1
          });
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
                    
                    const stiffness = isNeuron ? 0.98 : 0.7; 

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

    // 3. Prune Orphan Nodes (Ensure fully connected graph)
    if (particles.length > 0) {
        // Build adjacency
        const adj: number[][] = Array(particles.length).fill(null).map(() => []);
        springs.forEach(s => {
            adj[s.p1].push(s.p2);
            adj[s.p2].push(s.p1);
        });

        // Find largest cluster using BFS
        const visited = new Set<number>();
        const clusters: number[][] = [];
        
        for (let i = 0; i < particles.length; i++) {
            if (!visited.has(i)) {
                const cluster: number[] = [];
                const q = [i];
                visited.add(i);
                while (q.length) {
                    const curr = q.shift()!;
                    cluster.push(curr);
                    for (const n of adj[curr]) {
                        if (!visited.has(n)) {
                            visited.add(n);
                            q.push(n);
                        }
                    }
                }
                clusters.push(cluster);
            }
        }

        // Keep only largest cluster
        clusters.sort((a, b) => b.length - a.length);
        const largestCluster = new Set(clusters[0]);

        if (largestCluster.size < particles.length) {
            const newParticles: Particle[] = [];
            const oldToNew = new Map<number, number>();
            
            particles.forEach((p, idx) => {
                if (largestCluster.has(idx)) {
                    oldToNew.set(idx, newParticles.length);
                    newParticles.push(p);
                }
            });

            const newSprings: Spring[] = [];
            springs.forEach(s => {
                if (largestCluster.has(s.p1) && largestCluster.has(s.p2)) {
                    s.p1 = oldToNew.get(s.p1)!;
                    s.p2 = oldToNew.get(s.p2)!;
                    newSprings.push(s);
                }
            });

            particles = newParticles;
            springs = newSprings;
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

  evolvePopulation(currentGeneration: number): boolean {
      return false;
  }

  update(time: number) {
    const dt = TIMESTEP;
    const dtSq = dt * dt;
    const botCount = this.bots.length;
    let livingCount = 0;
    let totalMemory = 0;

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
    
    const avgMemory = livingCount > 0 ? totalMemory / livingCount : 0.5;
    const collectiveFriction = this.config.friction + (avgMemory - 0.5) * 0.08;
    const fluidBaseFriction = Math.max(0.85, Math.min(0.995, collectiveFriction));
    
    if (botCount > 1) {
        this.applySocialForces(botCount);
        this.resolveCollisions(botCount);
    }

    // New Bots Queue (from splitting)
    const newBots: Xenobot[] = [];

    for (let i = 0; i < botCount; i++) {
      const bot = this.bots[i];
      if (bot.isDead) continue;
      
      this.updateBot(bot, time, dt, dtSq, fluidBaseFriction);
      
      // Deliberate Mitosis Logic (Reproduction)
      // When energy exceeds threshold, trigger split into two smaller bots
      if (bot.energy > MITOSIS_THRESHOLD) {
          this.triggerMitosis(bot);
      }

      // Structural Integrity Check (Handles the actual splitting after trigger)
      const splitResult = this.checkStructuralIntegrity(bot);
      if (splitResult) {
          newBots.push(splitResult);
      }
    }
    
    if (newBots.length > 0) {
        this.bots.push(...newBots);
    }
    
    this.smoothRenderPositions();
  }

  private triggerMitosis(bot: Xenobot) {
      if (bot.particles.length < 6) return; // Too small to split

      // 1. Calculate Principal Axis (Line of separation)
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      bot.particles.forEach(p => {
          if (p.pos.x < minX) minX = p.pos.x;
          if (p.pos.x > maxX) maxX = p.pos.x;
          if (p.pos.y < minY) minY = p.pos.y;
          if (p.pos.y > maxY) maxY = p.pos.y;
      });

      const width = maxX - minX;
      const height = maxY - minY;
      const com = bot.centerOfMass;

      // Determine split axis (perpendicular to longest dimension)
      const isHorizontalSplit = width > height;

      // 2. Sever Springs crossing the axis
      for (let i = bot.springs.length - 1; i >= 0; i--) {
          const s = bot.springs[i];
          const p1 = bot.particles[s.p1];
          const p2 = bot.particles[s.p2];

          let shouldCut = false;
          if (isHorizontalSplit) {
              // Cut vertically
              if ((p1.pos.x < com.x && p2.pos.x > com.x) || (p1.pos.x > com.x && p2.pos.x < com.x)) {
                  shouldCut = true;
              }
          } else {
              // Cut horizontally
              if ((p1.pos.y < com.y && p2.pos.y > com.y) || (p1.pos.y > com.y && p2.pos.y < com.y)) {
                  shouldCut = true;
              }
          }

          if (shouldCut) {
              bot.springs.splice(i, 1);
          }
      }

      // Reduce energy to pay for mitosis
      bot.energy -= 400; 
  }
  
  // Returns a new bot if a split occurred, null otherwise
  private checkStructuralIntegrity(bot: Xenobot): Xenobot | null {
      // 1. Check for broken springs (Physics Tearing)
      let brokenIndices: number[] = [];
      for(let i = 0; i < bot.springs.length; i++) {
          const s = bot.springs[i];
          const p1 = bot.particles[s.p1];
          const p2 = bot.particles[s.p2];
          const dx = p1.pos.x - p2.pos.x;
          const dy = p1.pos.y - p2.pos.y;
          const dist = Math.sqrt(dx*dx + dy*dy);
          
          if (dist > s.restLength * BREAKING_THRESHOLD) {
              brokenIndices.push(i);
          }
      }

      for(let i = brokenIndices.length - 1; i >= 0; i--) {
          bot.springs.splice(brokenIndices[i], 1);
      }

      // 2. Connected Components Analysis (BFS)
      const particles = bot.particles;
      const visited = new Set<number>();
      const clusters: number[][] = [];

      const adj: number[][] = Array(particles.length).fill(null).map(() => []);
      for(const s of bot.springs) {
          adj[s.p1].push(s.p2);
          adj[s.p2].push(s.p1);
      }

      for(let i = 0; i < particles.length; i++) {
          if(!visited.has(i)) {
              const cluster: number[] = [];
              const queue = [i];
              visited.add(i);
              
              while(queue.length > 0) {
                  const node = queue.shift()!;
                  cluster.push(node);
                  
                  for(const neighbor of adj[node]) {
                      if(!visited.has(neighbor)) {
                          visited.add(neighbor);
                          queue.push(neighbor);
                      }
                  }
              }
              clusters.push(cluster);
          }
      }

      if (clusters.length <= 1) return null;

      clusters.sort((a, b) => b.length - a.length);
      const mainClusterIndices = new Set(clusters[0]);
      const splitClusterIndices = clusters[1]; 

      if (splitClusterIndices.length < 3) return null; 

      const newBotParticles: Particle[] = [];
      const newBotSprings: Spring[] = [];
      const oldToNewIndexMap = new Map<number, number>();

      splitClusterIndices.forEach((oldIdx, newIdx) => {
          newBotParticles.push(bot.particles[oldIdx]);
          oldToNewIndexMap.set(oldIdx, newIdx);
      });

      for (let i = bot.springs.length - 1; i >= 0; i--) {
          const s = bot.springs[i];
          const p1InSplit = oldToNewIndexMap.has(s.p1);
          const p2InSplit = oldToNewIndexMap.has(s.p2);

          if (p1InSplit && p2InSplit) {
              newBotSprings.push({
                  ...s,
                  p1: oldToNewIndexMap.get(s.p1)!,
                  p2: oldToNewIndexMap.get(s.p2)!
              });
              bot.springs.splice(i, 1);
          } else if (p1InSplit || p2InSplit) {
              bot.springs.splice(i, 1);
          }
      }

      const keptParticles: Particle[] = [];
      const oldBotNewIndexMap = new Map<number, number>();
      
      let keptCount = 0;
      for(let i=0; i<bot.particles.length; i++) {
          if (mainClusterIndices.has(i)) {
              keptParticles.push(bot.particles[i]);
              oldBotNewIndexMap.set(i, keptCount);
              keptCount++;
          }
      }
      bot.particles = keptParticles;

      const validSprings: Spring[] = [];
      for(const s of bot.springs) {
          if(oldBotNewIndexMap.has(s.p1) && oldBotNewIndexMap.has(s.p2)) {
              s.p1 = oldBotNewIndexMap.get(s.p1)!;
              s.p2 = oldBotNewIndexMap.get(s.p2)!;
              validSprings.push(s);
          }
      }
      bot.springs = validSprings;

      // Mutation for offspring
      const newGenome = mutate(bot.genome);
      newGenome.id = uid();

      // IMPORTANT: Assign a new unique Group ID to the offspring
      const newGroupId = this.nextGroupId++;

      const newBot: Xenobot = {
          id: uid(),
          genome: newGenome,
          particles: newBotParticles,
          springs: newBotSprings,
          centerOfMass: { x: 0, y: 0 }, 
          startPosition: { x: 0, y: 0 },
          isDead: false,
          totalCharge: 0,
          groupId: newGroupId, // Separate entity from parent
          energy: bot.energy * 0.5, // Reduced energy
          age: 0, 
          heading: bot.heading + Math.PI + (Math.random() - 0.5), 
          irruption: 0,
          absorption: 0
      };
      
      bot.energy *= 0.5; // Parent energy reduced

      return newBot;
  }
  
  smoothRenderPositions() {
    const alpha = 0.15; 
    const snapThresholdSq = 100 * 100;
    const sleepThresholdSq = 0.001; 

    for (const bot of this.bots) {
        if (bot.isDead) continue;
        for (const p of bot.particles) {
            if (!Number.isFinite(p.renderPos.x) || !Number.isFinite(p.renderPos.y)) {
                p.renderPos.x = p.pos.x;
                p.renderPos.y = p.pos.y;
                continue;
            }

            const dx = p.pos.x - p.renderPos.x;
            const dy = p.pos.y - p.renderPos.y;
            const distSq = dx*dx + dy*dy;
            
            // Snap if distance is huge
            if (distSq > snapThresholdSq) {
                p.renderPos.x = p.pos.x;
                p.renderPos.y = p.pos.y;
            } else if (distSq > sleepThresholdSq) {
                // Lerp: new = current + (target - current) * alpha
                p.renderPos.x += dx * alpha;
                p.renderPos.y += dy * alpha;
            } else {
                p.renderPos.x = p.pos.x;
                p.renderPos.y = p.pos.y;
            }
        }
    }
  }

  private resolveCollisions(botCount: number) {
      const iterations = 4; 
      
      for (let k = 0; k < iterations; k++) {
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
                            
                            const separation = overlap * 0.4;
                            
                            p1.pos.x += nx * separation;
                            p1.pos.y += ny * separation;
                            p2.pos.x -= nx * separation;
                            p2.pos.y -= ny * separation;
                        }
                    }
                }
            }
        }
      }
  }

  private applySocialForces(botCount: number) {
      const GROUP_REPULSION_RADIUS = 500; 
      const GROUP_FORCE = 1.0; 
      const SELF_REPULSION_RADIUS = 150; 
      const SELF_FORCE = 0.3;

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
                  // Strong Inter-group repulsion for distinct entities
                  force = ((GROUP_REPULSION_RADIUS - dist) / GROUP_REPULSION_RADIUS) * GROUP_FORCE;
              } else if (dist < SELF_REPULSION_RADIUS) {
                  // Intra-group spacing
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
      const pFx = Math.max(-5, Math.min(5, fx / count));
      const pFy = Math.max(-5, Math.min(5, fy / count));
      for (const p of bot.particles) {
          p.force.x += pFx;
          p.force.y += pFy;
      }
  }

  private updateBot(bot: Xenobot, time: number, dt: number, dtSq: number, fluidBaseFriction: number) {
    bot.energy -= METABOLIC_DECAY;
    bot.age++;

    if (bot.energy <= 0) {
        bot.isDead = true;
        return; 
    }

    const irruption = this.performIrruption(bot, time);
    bot.irruption = irruption;

    this.performMaterialPhysics(bot, time, dt, dtSq, fluidBaseFriction);

    const absorption = this.performAbsorption(bot);
    bot.absorption = absorption;
    
    bot.irruption *= 0.8;
    bot.absorption *= 0.8;
  }

  private performIrruption(bot: Xenobot, time: number): number {
      const activeCharge = this.updateInternalStructure(bot, time);
      bot.totalCharge = activeCharge;
      return activeCharge;
  }

  private performMaterialPhysics(bot: Xenobot, time: number, dt: number, dtSq: number, fluidBaseFriction: number) {
    const particles = bot.particles;
    const pCount = particles.length;
    const ciliaForcesX = new Float32Array(pCount);
    const ciliaForcesY = new Float32Array(pCount);
    
    let avgVx = 0, avgVy = 0;
    for (let i = 0; i < pCount; i++) {
        avgVx += (particles[i].pos.x - particles[i].oldPos.x);
        avgVy += (particles[i].pos.y - particles[i].oldPos.y);
    }
    avgVx /= (pCount || 1);
    avgVy /= (pCount || 1);

    // FLUID SIMULATION CONSTANTS
    const FLUID_DENSITY = 0.04; 
    const PARTICLE_VOLUME = 30.0;
    const BASE_DRAG = 0.05;

    for (let i = 0; i < pCount; i++) {
        const p = particles[i];
        
        bot.energy -= PARTICLE_MAINTENANCE_COST;
        
        // 1. Gravity (Down)
        const fGravity = p.mass * this.config.gravity;

        // 2. Buoyancy (Up)
        // Density differential drives upward force.
        const fBuoyancy = -1.0 * FLUID_DENSITY * PARTICLE_VOLUME * this.config.gravity;

        // 3. Fluid Drag (Viscous Resistance)
        const vx = (p.pos.x - p.oldPos.x); 
        const vy = (p.pos.y - p.oldPos.y);

        // Charge affects local viscosity/interaction
        const viscosityMod = 1.0 + (p.charge * 5.0);
        const dragFactor = BASE_DRAG * viscosityMod;

        const fDragX = -vx * dragFactor;
        const fDragY = -vy * dragFactor;

        // Apply Fluid Forces
        p.force.x = 0; 
        p.force.y = 0; 

        p.force.y += fGravity + fBuoyancy + fDragY;
        p.force.x += fDragX;

        // Brownian / Turbulence
        p.force.x += (Math.random() - 0.5) * 0.2;
        p.force.y += (Math.random() - 0.5) * 0.2;

        const { cx, cy } = this.calculateCiliaForce(bot, p, time, avgVx, avgVy);
        ciliaForcesX[i] = cx;
        ciliaForcesY[i] = cy;

        const dxSelf = bot.centerOfMass.x - p.pos.x;
        const dySelf = bot.centerOfMass.y - p.pos.y;
        p.force.x += dxSelf * SURFACE_TENSION;
        p.force.y += dySelf * SURFACE_TENSION;

        p.charge *= this.config.bioelectricDecay;
    }

    this.synchronizeCilia(bot, ciliaForcesX, ciliaForcesY);

    for (let i = 0; i < pCount; i++) {
        particles[i].force.x += ciliaForcesX[i];
        particles[i].force.y += ciliaForcesY[i];
    }
    
    this.integrateParticles(bot, dtSq, fluidBaseFriction);
  }

  private performAbsorption(bot: Xenobot): number {
    let absorptionEvent = 0;

    const sensoryStrength = this.updateBotSensory(bot);
    if (sensoryStrength > 0) absorptionEvent += sensoryStrength * 0.5;

    const energyGained = this.checkFoodConsumption(bot);
    if (energyGained > 0) absorptionEvent += 2.0;

    // --- Boundary Stress Logic ---
    const distFromCenter = Math.abs(bot.centerOfMass.x);
    // Boundary zone starts 500 units before the hard limit
    const boundaryZoneStart = BOUNDARY_LIMIT - 500;

    if (distFromCenter > boundaryZoneStart) {
        const penetration = distFromCenter - boundaryZoneStart;
        const stressFactor = penetration / 500; // 0.0 to 1.0+
        
        // Exponential energy cost for staying near edge
        const stressCost = 1.0 + (stressFactor * stressFactor) * 5.0;
        bot.energy -= stressCost;

        // Repulsive force pushing back towards center
        const pushDir = -Math.sign(bot.centerOfMass.x);
        const pushForce = Math.min(4.0, stressFactor * 2.0);
        
        this.distributeForce(bot, pushDir * pushForce, 0);
        absorptionEvent += 0.5; 
    }

    if (distFromCenter > BOUNDARY_LIMIT) {
        // Hard clamp backup (existing logic)
        const pushDir = -Math.sign(bot.centerOfMass.x);
        this.distributeForce(bot, pushDir * 2.0, 0);
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
      const memory = bot.genome.bioelectricMemory || 0.5;
      const relX = (p.pos.x - bot.centerOfMass.x) * 0.05;
      const relY = (p.pos.y - bot.centerOfMass.y) * 0.05;
      const waveFreq = 3.0 + (memory * 2.0);
      
      const spatialPhase = p.phase + relX - relY;
      const beat = Math.sin(spatialPhase - (time * waveFreq * Math.PI * 2));
      
      const thrustMag = beat > 0 
          ? CILIA_FORCE * 2.0 * beat 
          : CILIA_FORCE * 0.5 * beat;

      const hx = Math.cos(bot.heading);
      const hy = Math.sin(bot.heading);
      
      let cx = thrustMag * hx;
      let cy = thrustMag * hy;
      
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

          const stress = Math.abs(diff); 
          const chargeGen = stress * 0.6;
          if (chargeGen > 0.01) {
              p1.charge = Math.min(1, p1.charge + chargeGen);
              p2.charge = Math.min(1, p2.charge + chargeGen);
          }
          activeCharge += (p1.charge + p2.charge);

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

  private integrateParticles(bot: Xenobot, dtSq: number, fluidBaseFriction: number) {
      const particles = bot.particles;
      const invGroundY = 1.0 / (this.groundY || 1);
      let cx = 0, cy = 0;

      for (const p of particles) {
          p.force.x = Math.max(-MAX_FORCE, Math.min(MAX_FORCE, p.force.x));
          p.force.y = Math.max(-MAX_FORCE, Math.min(MAX_FORCE, p.force.y));

          const depthVal = Math.max(0, Math.min(1, p.pos.y * invGroundY));
          const effectiveFriction = fluidBaseFriction * (1.0 - (depthVal * 0.03));

          let vx = (p.pos.x - p.oldPos.x) * effectiveFriction;
          let vy = (p.pos.y - p.oldPos.y) * effectiveFriction;

          vx = Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, vx));
          vy = Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, vy));

          p.oldPos.x = p.pos.x;
          p.oldPos.y = p.pos.y;

          p.pos.x += vx + p.force.x * dtSq;
          p.pos.y += vy + p.force.y * dtSq;

          if (!Number.isFinite(p.pos.x) || !Number.isFinite(p.pos.y)) {
              p.pos.x = p.oldPos.x;
              p.pos.y = p.oldPos.y;
          }

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
