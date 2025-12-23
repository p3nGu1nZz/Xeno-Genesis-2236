
import { Xenobot, Particle, Spring, Genome, CellType, SimulationConfig, Food, GeneticStats, SimulationEventType } from '../types';
import { DEFAULT_CONFIG, TIMESTEP, CILIA_FORCE, METABOLIC_DECAY, INITIAL_YOLK_ENERGY, SURFACE_TENSION, FOOD_ENERGY, FOOD_RADIUS, MITOSIS_THRESHOLD, BREAKING_THRESHOLD } from '../constants';
import { mutate } from './geneticAlgorithm';

const uid = () => Math.random().toString(36).substr(2, 9);
const MAX_FORCE = 15.0;
const MAX_VELOCITY = 20.0;
const PARTICLE_MAINTENANCE_COST = 0.005;
const COLLISION_RADIUS = 12; 

export class PhysicsEngine {
  bots: Xenobot[] = [];
  food: Food[] = [];
  config: SimulationConfig;
  groundY: number;
  public events: SimulationEventType[] = []; // Event queue for UI/Audio

  private nextGroupId = 2; // Start after 0 and 1 to ensure unique IDs for new groups

  constructor(config: SimulationConfig = DEFAULT_CONFIG) {
    this.config = config;
    this.groundY = config.groundHeight;
    this.initFood();
  }

  initFood() {
    this.food = [];
    const count = this.config.foodCount;
    
    // Guaranteed Starter Food near spawn points
    // Cluster A (-400)
    for(let i=0; i<20; i++) {
        this.food.push({
            id: uid(),
            x: -400 + (Math.random() - 0.5) * 300,
            y: 200 + (Math.random() - 0.5) * 300,
            energy: FOOD_ENERGY,
            phase: Math.random() * Math.PI * 2
        });
    }
    // Cluster B (+400)
    for(let i=0; i<20; i++) {
        this.food.push({
            id: uid(),
            x: 400 + (Math.random() - 0.5) * 300,
            y: 200 + (Math.random() - 0.5) * 300,
            energy: FOOD_ENERGY,
            phase: Math.random() * Math.PI * 2
        });
    }

    // Remaining food random
    for (let i = 40; i < count; i++) {
        this.spawnFood();
    }
  }

  spawnFood() {
     // Spawn food in a wide distribution for top-down open world
     const range = 4000;
     const MIN_SPAWN_DISTANCE = 300; 
     const MAX_RETRIES = 10;

     let x = 0;
     let y = 0;
     let valid = false;

     // Attempt to find a valid position away from bots
     for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
         x = (Math.random() - 0.5) * range * 2;
         y = (Math.random() - 0.5) * range * 2;
         
         valid = true;
         for (const bot of this.bots) {
             if (bot.isDead) continue;
             const dx = x - bot.centerOfMass.x;
             const dy = y - bot.centerOfMass.y;
             if (dx*dx + dy*dy < MIN_SPAWN_DISTANCE * MIN_SPAWN_DISTANCE) {
                 valid = false;
                 break;
             }
         }
         
         if (valid) break;
     }

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
                    
                    // REFINED STIFFNESS: Dynamic material properties for rigid cohesion
                    let stiffness = 2.0; // Base stiffness
                    
                    if (type1 === CellType.NEURON && type2 === CellType.NEURON) {
                        // Added small random factor for organic structural variations
                        const variation = (Math.random() * 2.0 - 1.0);
                        stiffness = 5.0 + variation; 
                    } else if (isNeuron) {
                        stiffness = 3.5; 
                    } else if (isMuscle) {
                        stiffness = 3.0; 
                    } else {
                        stiffness = 2.0; 
                    }

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
  
  getPopulationStats(generation: number): GeneticStats {
      let skin = 0;
      let heart = 0;
      let neuron = 0;
      
      this.bots.forEach(bot => {
          if (bot.isDead) return;
          bot.genome.genes.forEach(row => {
              row.forEach(cell => {
                  if (cell === CellType.SKIN) skin++;
                  else if (cell === CellType.HEART) heart++;
                  else if (cell === CellType.NEURON) neuron++;
              });
          });
      });
      
      const total = skin + heart + neuron;
      return { generation, skin, heart, neuron, total };
  }

  evolvePopulation(currentGeneration: number): boolean {
      return false;
  }

  update(time: number) {
    // Clear previous events
    this.events = [];

    const dt = TIMESTEP;
    const dtSq = dt * dt;
    const botCount = this.bots.length;
    let livingCount = 0;
    let totalMemory = 0;
    let totalEnergy = 0;

    for(let i = 0; i < botCount; i++) {
        const b = this.bots[i];
        if (!b.isDead) {
            totalMemory += b.genome.bioelectricMemory;
            totalEnergy += b.energy;
            livingCount++;
        }
    }
    
    // Dynamic Food Spawning
    const avgEnergy = livingCount > 0 ? totalEnergy / livingCount : 0;
    let dynamicFoodCap = this.config.foodCount;
    
    // Boost food availability if the colony is starving
    if (avgEnergy < 1000) {
        dynamicFoodCap *= 1.5;
    }
    
    // Slight scarcity pressure if population gets very large to prevent overcrowding
    if (livingCount > 100) {
        dynamicFoodCap *= 0.8;
    }

    if (this.food.length < dynamicFoodCap) {
        // Increase spawn probability if energy is low
        const spawnChance = avgEnergy < 1000 ? 0.6 : 0.2; // Significantly increased base spawn rates
        if (Math.random() < spawnChance) this.spawnFood();
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
      // DYNAMIC STRUCTURAL STRENGTH
      // Young bots and low energy bots are much harder to break to preserve the colony.
      
      const ageFactor = Math.max(1.0, 500.0 / (bot.age + 10)); // Strong when young
      const energyFactor = bot.energy < 1000 ? 2.0 : 1.0; // Strong when starving
      
      // Increased multiplier buffer to make them more resilient
      const structureMultiplier = ageFactor * energyFactor * 1.2; 
      
      const dynamicThreshold = BREAKING_THRESHOLD * structureMultiplier;

      // 1. Check for broken springs (Physics Tearing)
      let brokenIndices: number[] = [];
      for(let i = 0; i < bot.springs.length; i++) {
          const s = bot.springs[i];
          const p1 = bot.particles[s.p1];
          const p2 = bot.particles[s.p2];
          const dx = p1.pos.x - p2.pos.x;
          const dy = p1.pos.y - p2.pos.y;
          const dist = Math.sqrt(dx*dx + dy*dy);
          
          if (dist > s.restLength * dynamicThreshold) {
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

      // IMPORTANT: Inherit parent's Group ID to maintain colony cohesion
      // Previously, this created a new ID, causing offspring to be repelled as "enemies".
      const newGroupId = bot.groupId; 

      const newBot: Xenobot = {
          id: uid(),
          genome: newGenome,
          particles: newBotParticles,
          springs: newBotSprings,
          centerOfMass: { x: 0, y: 0 }, 
          startPosition: { x: 0, y: 0 },
          isDead: false,
          totalCharge: 0,
          groupId: newGroupId, // Same family as parent
          energy: bot.energy * 0.5, // Reduced energy
          age: 0, 
          heading: bot.heading + Math.PI + (Math.random() - 0.5), 
          irruption: 0,
          absorption: 0
      };
      
      bot.energy *= 0.5; // Parent energy reduced

      this.events.push('MITOSIS'); // Trigger sound
      return newBot;
  }
  
  smoothRenderPositions() {
    const alpha = 0.1; // Reduced alpha for smoother interpolation
    const snapThresholdSq = 100 * 100;

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
            
            // Snap if distance is huge (teleport/initial spawn)
            if (distSq > snapThresholdSq) {
                p.renderPos.x = p.pos.x;
                p.renderPos.y = p.pos.y;
            } else {
                // Continuous Lerp to smooth out jitter
                p.renderPos.x += dx * alpha;
                p.renderPos.y += dy * alpha;
            }
        }
    }
  }

  private resolveCollisions(botCount: number) {
      const iterations = 4; 
      const now = Date.now();
      
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
                            
                            // Mass-based resolution
                            const totalMass = p1.mass + p2.mass;
                            // Ratio determines how much each particle moves.
                            // Heavier particle moves less.
                            const m1Ratio = p2.mass / totalMass; 
                            const m2Ratio = p1.mass / totalMass;

                            // Stability factor (0.8 prevents jitter in iterative solvers)
                            const responseCoef = 0.8; 
                            
                            const moveX = nx * overlap * responseCoef;
                            const moveY = ny * overlap * responseCoef;

                            p1.pos.x += moveX * m1Ratio;
                            p1.pos.y += moveY * m1Ratio;
                            p2.pos.x -= moveX * m2Ratio;
                            p2.pos.y -= moveY * m2Ratio;

                            // --- NEW ENERGY TRANSFER ---
                            // Metabolic energy flows from high potential to low potential
                            const transferRate = 0.005; // 0.5% of difference per contact point
                            const eDiff = b1.energy - b2.energy;
                            const transfer = eDiff * transferRate;
                            
                            b1.energy -= transfer;
                            b2.energy += transfer;
                            // ---------------------------

                            // Collision Event for Visuals
                            if (!b1.lastCollisionTime || now - b1.lastCollisionTime > 500) {
                                b1.lastCollisionTime = now;
                                b1.lastCollisionPoint = { x: (p1.pos.x + p2.pos.x) / 2, y: (p1.pos.y + p2.pos.y) / 2 };
                                
                                // Trigger sound event for significant collisions only
                                if (Math.abs(transfer) > 1.0) {
                                    this.events.push('COLLISION');
                                }
                            }
                            if (!b2.lastCollisionTime || now - b2.lastCollisionTime > 500) {
                                b2.lastCollisionTime = now;
                                b2.lastCollisionPoint = b1.lastCollisionPoint;
                            }
                        }
                    }
                }
            }
        }
      }
  }

  private applySocialForces(botCount: number) {
      const GROUP_REPULSION_RADIUS = 500; 
      const GROUP_FORCE = 6.0; 
      
      const SELF_REPULSION_RADIUS = 200; 
      // Increased Cohesion Radius to 3000 as requested
      const COHESION_RADIUS = 3000; 
      // Increased Attraction Strength to 0.9 as requested
      const ATTRACTION_STRENGTH = 0.9; 
      const REPULSION_STRENGTH = 1.5; 

      for (let i = 0; i < botCount; i++) {
          const b1 = this.bots[i];
          if (b1.isDead) continue;
          
          // Bio-field intensity derived from active charge (neurons firing, muscles contracting)
          const field1 = 0.5 + Math.min(1.5, b1.totalCharge);

          for (let j = i + 1; j < botCount; j++) {
              const b2 = this.bots[j];
              if (b2.isDead) continue;

              const field2 = 0.5 + Math.min(1.5, b2.totalCharge);
              const interaction = field1 * field2;

              const dx = b1.centerOfMass.x - b2.centerOfMass.x;
              const dy = b1.centerOfMass.y - b2.centerOfMass.y;
              const distSq = dx*dx + dy*dy;

              if (distSq < 0.1 || distSq > COHESION_RADIUS * COHESION_RADIUS) continue; 

              const dist = Math.sqrt(distSq);
              let fx = 0;
              let fy = 0;

              if (b1.groupId !== b2.groupId) {
                  // Enemy Repulsion
                  if (dist < GROUP_REPULSION_RADIUS) {
                      const factor = (GROUP_REPULSION_RADIUS - dist) / GROUP_REPULSION_RADIUS;
                      // Mental Causation (Irruption) acts as a force multiplier in conflict
                      const willPower = (b1.irruption + b2.irruption) * 0.5; 
                      const force = factor * GROUP_FORCE * (1.0 + willPower);
                      
                      fx = (dx / dist) * force;
                      fy = (dy / dist) * force;
                  }
              } else {
                  // Friendly Interaction
                  if (dist < SELF_REPULSION_RADIUS) {
                      // Too Close: Push
                      const factor = (SELF_REPULSION_RADIUS - dist) / SELF_REPULSION_RADIUS;
                      const force = factor * REPULSION_STRENGTH;
                      fx = (dx / dist) * force;
                      fy = (dy / dist) * force;
                  } else {
                      // In Range: Cohesion (Pull)
                      // Normalized distance factor (0 at self-repulsion edge, 1 at cohesion limit)
                      const range = COHESION_RADIUS - SELF_REPULSION_RADIUS;
                      const factor = (dist - SELF_REPULSION_RADIUS) / range;
                      
                      // Pull strength peaks at medium distance, fades at edges
                      // Use a sine hump for organic feel
                      const pullProfile = Math.sin(factor * Math.PI); 
                      
                      // Direction is negative (pulling together)
                      const force = -1.0 * pullProfile * ATTRACTION_STRENGTH * interaction;
                      
                      fx = (dx / dist) * force;
                      fy = (dy / dist) * force;
                  }
              }

              if (Math.abs(fx) > 0.001 || Math.abs(fy) > 0.001) {
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
        if (!bot.isDead) {
            bot.isDead = true;
            this.events.push('DEATH');
        }
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
    const BASE_DRAG = 0.15; // Increased damping for stability

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

        // --- DYNAMIC SURFACE TENSION ---
        // Surface tension adapts to the bot's energy state.
        // Higher Energy = Tauter (holds shape better). Lower Energy = Looser (deforms).
        // Range: 0.5x to 1.5x base tension
        const energyRatio = Math.min(1.0, Math.max(0.1, bot.energy / INITIAL_YOLK_ENERGY));
        // Increased surface tension influence for better cohesion
        const dynamicTension = (SURFACE_TENSION * 3.0) * (0.5 + 0.8 * energyRatio);

        const dxSelf = bot.centerOfMass.x - p.pos.x;
        const dySelf = bot.centerOfMass.y - p.pos.y;
        p.force.x += dxSelf * dynamicTension;
        p.force.y += dySelf * dynamicTension;

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

    // --- Distance-Based Energy Drain (Open World) ---
    // Instead of hard boundaries, the world exerts an entropy tax the further you go.
    // This implements a "soft border" that kills wanderers who go too far.
    const cx = bot.centerOfMass.x;
    const cy = bot.centerOfMass.y;
    const distFromOrigin = Math.sqrt(cx*cx + cy*cy);
    
    // SAFE_RADIUS: Distance from origin (0,0) where standard metabolic decay applies.
    // Beyond this, entropy scales quadratically.
    const SAFE_RADIUS = 4500; 

    if (distFromOrigin > SAFE_RADIUS) {
        const excess = distFromOrigin - SAFE_RADIUS;
        
        // Quadratic Entropy Tax:
        // Penalizes distance heavily. 
        // e.g., 500 units out = 0.2 energy/tick
        // e.g., 1000 units out = 0.8 energy/tick
        const entropyTax = Math.pow(excess / 500.0, 2) * 0.2;
        
        bot.energy -= entropyTax;
        
        // High entropy increases "Absorption" (Conscious Experience of the void)
        // This triggers visual feedback (cyan aura)
        absorptionEvent += Math.min(2.0, entropyTax * 0.2);
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
                   this.events.push('EAT'); // Trigger eat sound
               }
          }
      }
      return energyGained;
  }

  private calculateCiliaForce(bot: Xenobot, p: Particle, time: number, avgVx: number, avgVy: number) {
      const memory = bot.genome.bioelectricMemory || 0.5;
      
      // Calculate Heading Vector
      const hx = Math.cos(bot.heading);
      const hy = Math.sin(bot.heading);

      // Relative position from center
      const relX = (p.pos.x - bot.centerOfMass.x);
      const relY = (p.pos.y - bot.centerOfMass.y);
      
      // COHESION: Increased wavelength to synchronize phase across body better
      // This reduces shearing forces from cilia beating out of phase
      const dotProd = relX * hx + relY * hy;
      const waveLength = 300.0; // Increased from 200
      const spatialPhase = dotProd / waveLength;

      const waveFreq = 3.0 + (memory * 2.0);
      
      // Metachronal Wave Calculation
      const beat = Math.sin(spatialPhase * Math.PI - (time * waveFreq * Math.PI * 2));
      
      const thrustMag = beat > 0 
          ? CILIA_FORCE * 2.0 * beat 
          : CILIA_FORCE * 0.2 * beat; // Reduced drag on recovery stroke

      let cx = thrustMag * hx;
      let cy = thrustMag * hy;
      
      // Cohesion: Align with group velocity strongly
      const pVx = p.pos.x - p.oldPos.x;
      const pVy = p.pos.y - p.oldPos.y;
      
      // Decreased cohesion strength for more independent local motion
      const cohesionStrength = 5.0 * memory; 
      
      cx += (avgVx - pVx) * cohesionStrength;
      cy += (avgVy - pVy) * cohesionStrength;

      // Add slight randomness only for low memory (low plasticity/learning) bots
      if (memory < 0.3) {
          const noiseScale = (0.3 - memory);
          cx += (Math.random() - 0.5) * noiseScale * CILIA_FORCE;
          cy += (Math.random() - 0.5) * noiseScale * CILIA_FORCE;
      }

      return { cx, cy };
  }
  
  private synchronizeCilia(bot: Xenobot, forcesX: Float32Array, forcesY: Float32Array) {
      const springs = bot.springs;
      // Laplacian Smoothing factor for neighbor force alignment
      const syncStrength = this.config.syncRate || 0.5;
      
      for (const s of springs) {
          const i1 = s.p1;
          const i2 = s.p2;

          // Get current forces
          const fx1 = forcesX[i1];
          const fy1 = forcesY[i1];
          const fx2 = forcesX[i2];
          const fy2 = forcesY[i2];

          // Calculate average force vector between neighbors
          const avgX = (fx1 + fx2) * 0.5;
          const avgY = (fy1 + fy2) * 0.5;

          // Blend towards average to reduce local jitter
          forcesX[i1] += (avgX - fx1) * syncStrength;
          forcesY[i1] += (avgY - fy1) * syncStrength;
          forcesX[i2] += (avgX - fx2) * syncStrength;
          forcesY[i2] += (avgY - fy2) * syncStrength;
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
      
      // COHESION: Increased coupling factor.
      // This pulls particles towards their neighbor's average force, simulating a rigid lattice.
      const coupling = 0.9 + (memory * 0.1); 

      // 1. Internal Repulsion (Self-Collision Prevention)
      // Iterate particles to ensure they don't collapse into a singularity
      
      // Decreased radius to allow closer clumping/higher density
      const SELF_NODE_RADIUS_SQ = 10 * 10; 
      
      for (let i = 0; i < particles.length; i++) {
          for (let j = i + 1; j < particles.length; j++) {
              const p1 = particles[i];
              const p2 = particles[j];
              const dx = p1.pos.x - p2.pos.x;
              const dy = p1.pos.y - p2.pos.y;
              const dSq = dx*dx + dy*dy;
              if (dSq < SELF_NODE_RADIUS_SQ && dSq > 0.001) {
                  const dist = Math.sqrt(dSq);
                  const overlap = 10 - dist;
                  const force = overlap * 2.0; // Significantly increased repulsion to prevent clumping
                  const nx = dx / dist;
                  const ny = dy / dist;
                  
                  p1.force.x += nx * force;
                  p1.force.y += ny * force;
                  p2.force.x -= nx * force;
                  p2.force.y -= ny * force;
              }
          }
      }

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

      // **NEW**: Stronger Internal Damping / Velocity Influence
      // This loop adds forces to harmonize velocities of connected nodes
      for (const s of springs) {
          const p1 = particles[s.p1];
          const p2 = particles[s.p2];
          
          const v1x = p1.pos.x - p1.oldPos.x;
          const v1y = p1.pos.y - p1.oldPos.y;
          const v2x = p2.pos.x - p2.oldPos.x;
          const v2y = p2.pos.y - p2.oldPos.y;

          const dvx = v2x - v1x;
          const dvy = v2y - v1y;
          
          // COHESION: Apply full vector damping to enforce rigid body motion
          // UPDATED: Increased to 20.25 (1.5x of 13.5) for maximal organismal integrity
          const dampingCoeff = 20.25; 

          p1.force.x += dvx * dampingCoeff;
          p1.force.y += dvy * dampingCoeff;
          p2.force.x -= dvx * dampingCoeff;
          p2.force.y -= dvy * dampingCoeff;
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
          // UPDATED: Multiplied stiffness by 40.5 (1.5x of 27.0) to enforce rigidity and prevent breaking
          const forceVal = (s.stiffness * 40.5) * diff;

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
      let cx = 0, cy = 0;

      for (const p of particles) {
          p.force.x = Math.max(-MAX_FORCE, Math.min(MAX_FORCE, p.force.x));
          p.force.y = Math.max(-MAX_FORCE, Math.min(MAX_FORCE, p.force.y));

          // Removed depth-based friction
          const effectiveFriction = fluidBaseFriction;

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

          // Removed ground collision logic for top-down infinite plane

          cx += p.pos.x;
          cy += p.pos.y;
      }
      
      if (particles.length > 0) {
          bot.centerOfMass.x = cx / particles.length;
          bot.centerOfMass.y = cy / particles.length;
      }
  }
}
