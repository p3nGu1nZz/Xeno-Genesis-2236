
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
  SUB_STEPS,
  CONSTRAINT_ITERATIONS,
  CILIA_FORCE,
  METABOLIC_DECAY,
  INITIAL_YOLK_ENERGY,
  MITOSIS_THRESHOLD,
  GROWTH_COST,
  MAX_BOT_SIZE,
  FOOD_ENERGY,
  FOOD_RADIUS,
  SURFACE_TENSION,
  BREAKING_THRESHOLD,
  COLLISION_RADIUS
} from '../constants';
import { evolvePopulation as algoEvolve, mutate, pruneGenome, addStructuralNode } from './geneticAlgorithm';

const uid = () => Math.random().toString(36).substr(2, 9);
const MAX_FORCE = 40.0; 
const MAX_VELOCITY = 6.0; // Hard speed limit to prevent explosion
const PARTICLE_MAINTENANCE_COST = 0.005; 

export class PhysicsEngine {
  public bots: Xenobot[] = [];
  public food: Food[] = [];
  public config: SimulationConfig;
  public events: SimulationEventType[] = [];
  public groundY: number;

  // --- SCALING DIFFICULTY STATE ---
  public groupAGrowthCount = 0;
  public groupAReproductionCount = 0;

  constructor(config: SimulationConfig) {
    this.config = config;
    this.groundY = config.groundHeight;
    this.spawnFood()
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

    // NAN SAFETY CHECK: Ensure spawn coordinates are valid
    if (isNaN(startX)) startX = 0;
    if (isNaN(startY)) startY = 0;

    const particleMap: number[][] = Array(size).fill(null).map(() => Array(size).fill(-1));

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const cellType = genome.genes[y][x];
        if (cellType !== CellType.EMPTY) {
           const px = startX + (x - size/2) * scale;
           const py = startY + (y - size/2) * scale;
           
           let mass = 1.0; 
           if (cellType === CellType.HEART) mass = 1.2; 
           if (cellType === CellType.NEURON) mass = 1.0; 

           particles.push({
             pos: { x: px, y: py },
             oldPos: { x: px, y: py },
             renderPos: { x: px, y: py },
             renderVel: { x: 0, y: 0 },
             mass,
             force: { x: 0, y: 0 },
             charge: 0,
             isFixed: false,
             phase: x * 0.6 + y * 0.1,
             gx: x,
             gy: y
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
                    
                    // RESTORED: Higher stiffness for better swimming
                    let stiffness = 1.0; 
                    
                    if (type1 === CellType.NEURON && type2 === CellType.NEURON) {
                        stiffness = 1.25; 
                    } else if (isNeuron) {
                        stiffness = 1.15;
                    } else if (isMuscle) {
                        stiffness = 0.9; 
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

  // --- NEW: Forced Mutagen Application ---
  public applyMutagen(botId: string) {
      const bot = this.bots.find(b => b.id === botId);
      if (!bot || bot.isDead) return false;

      // 1. Force Growth
      if (bot.particles.length < MAX_BOT_SIZE) {
         this.attemptVegetativeGrowth(bot);
      }
      
      // 2. Force Genetic Shift (Color/Structure)
      bot.genome = mutate(bot.genome);
      
      // 3. Energy Boost to survive change
      bot.energy += 1000;
      
      this.events.push('MITOSIS'); // Use sound effect
      return true;
  }

  // Helper to get current costs
  public getCosts() {
      return {
          growthCost: GROWTH_COST * Math.pow(1.25, this.groupAGrowthCount),
          mitosisCost: MITOSIS_THRESHOLD * Math.pow(1.25, this.groupAReproductionCount)
      };
  }

  public update(totalTime: number) {
    this.events = [];
    const botCount = this.bots.length;

    // --- PHYSICS SUB-STEPPING ---
    const subSteps = SUB_STEPS;
    const dt = TIMESTEP; 
    const dtSq = dt * dt;

    for (let s = 0; s < subSteps; s++) {
        // 1. Resolve Collisions (Optimized)
        if (botCount > 1) {
            this.resolveCollisions(botCount);
        }

        // 2. Step Bots
        for (let i = 0; i < botCount; i++) {
            const bot = this.bots[i];
            if (bot.isDead) continue;

            const activeCharge = this.updateInternalStructure(bot, totalTime);
            this.applyExternalForcesAndIntegrate(bot, totalTime, dtSq);
            this.resolveConstraints(bot);

            if (s === 0) bot.totalCharge = activeCharge;
        }
    }

    // --- ONCE PER FRAME LOGIC ---
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

        const energyGained = this.checkFoodConsumption(bot);
        
        bot.irruption = Math.min(1.0, bot.totalCharge * 0.0002);
        bot.absorption = Math.min(1.0, (energyGained > 0 ? 0.5 : 0));

        // 1. VEGETATIVE GROWTH (Internal Node Mitosis)
        // Calculate dynamic cost
        let currentGrowthCost = GROWTH_COST;
        // Apply scaling difficulty ONLY to Group A (Native)
        if (bot.groupId === 0) {
            currentGrowthCost = GROWTH_COST * Math.pow(1.25, this.groupAGrowthCount);
        }

        // Deterministic check
        if (bot.energy >= currentGrowthCost && bot.particles.length < MAX_BOT_SIZE) {
             this.attemptVegetativeGrowth(bot, currentGrowthCost);
        }

        // 2. REPRODUCTION (Colony Mitosis)
        let currentMitosisThreshold = MITOSIS_THRESHOLD;
        if (bot.groupId === 0) {
            currentMitosisThreshold = MITOSIS_THRESHOLD * Math.pow(1.25, this.groupAReproductionCount);
        }

        if (bot.energy > currentMitosisThreshold && 
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

    this.smoothRenderPositions();

    if (this.food.length < this.config.foodCount * 0.8) {
        this.spawnFood();
    }
  }

  private applyExternalForcesAndIntegrate(bot: Xenobot, totalTime: number, dtSq: number) {
      const gravity = this.config.gravity * 20.0;
      const friction = this.config.friction;
      const groundY = this.groundY;

      // Cilia propulsion
      const { cx, cy } = this.calculateCiliaForce(bot, totalTime);
      bot.heading += (Math.random() - 0.5) * 0.1; // Wander

      for (const p of bot.particles) {
          if (p.isFixed) continue;

          // Add Gravity
          p.force.y += gravity * p.mass;

          // Add Propulsion
          p.force.x += cx;
          p.force.y += cy;

          // Verlet Integration
          // x_new = x + (x - x_old) * friction + a * dt^2
          let vx = (p.pos.x - p.oldPos.x) * friction;
          let vy = (p.pos.y - p.oldPos.y) * friction;

          // NAN SAFETY CHECK
          if (isNaN(vx) || isNaN(vy)) {
             vx = 0; vy = 0;
             p.pos.x = p.oldPos.x;
             p.pos.y = p.oldPos.y;
          }

          // --- FIX: Velocity Clamping to prevent jitter/explosion ---
          const currentSpeed = Math.sqrt(vx*vx + vy*vy);
          if (currentSpeed > MAX_VELOCITY) {
              const scale = MAX_VELOCITY / currentSpeed;
              vx *= scale;
              vy *= scale;
          }

          p.oldPos.x = p.pos.x;
          p.oldPos.y = p.pos.y;

          const ax = p.force.x / p.mass;
          const ay = p.force.y / p.mass;

          p.pos.x += vx + ax * dtSq;
          p.pos.y += vy + ay * dtSq;

          // NAN SAFETY CHECK #2 (Post-Integration)
          if (isNaN(p.pos.x) || isNaN(p.pos.y)) {
              p.pos.x = p.oldPos.x;
              p.pos.y = p.oldPos.y;
          }

          // Reset Force
          p.force.x = 0;
          p.force.y = 0;

          // Ground Collision
          if (p.pos.y > groundY) {
              p.pos.y = groundY;
              const vTangent = (p.pos.x - p.oldPos.x) * friction;
              const impact = p.pos.y - p.oldPos.y;
              p.oldPos.y = p.pos.y + impact * 0.5; // Bounce
              p.oldPos.x = p.pos.x - vTangent; // Friction
          }
      }

      // Update Center of Mass
      let cxSum = 0, cySum = 0;
      const count = bot.particles.length;
      if (count > 0) {
        for(const p of bot.particles) {
            cxSum += p.pos.x;
            cySum += p.pos.y;
        }
        bot.centerOfMass.x = cxSum / count;
        bot.centerOfMass.y = cySum / count;
        
        // NAN SAFETY CHECK #3 (Center of Mass)
        if (isNaN(bot.centerOfMass.x) || isNaN(bot.centerOfMass.y)) {
             bot.centerOfMass.x = 0;
             bot.centerOfMass.y = 0;
             // Something catastrophic happened, reset particles to 0
             bot.particles.forEach(p => { p.pos.x = 0; p.pos.y = 0; p.oldPos.x = 0; p.oldPos.y = 0; });
        }
      }
  }

  private resolveConstraints(bot: Xenobot) {
      // Placeholder for rigid constraints if needed.
      // Springs are handled via forces in updateInternalStructure.
      
      // World Bounds Check (Prevent floating off too far horizontally)
      const worldLimit = 10000;
      for (const p of bot.particles) {
          if (p.pos.x < -worldLimit) {
              p.pos.x = -worldLimit;
              p.oldPos.x = p.pos.x;
          }
          if (p.pos.x > worldLimit) {
              p.pos.x = worldLimit;
              p.oldPos.x = p.pos.x;
          }
      }
  }

  // Attempts to add a physical node to the running bot
  private attemptVegetativeGrowth(bot: Xenobot, cost: number = GROWTH_COST) {
      const growthResult = addStructuralNode(bot.genome);
      if (!growthResult) return;

      const { newGenome, addedX, addedY } = growthResult;
      
      // Build a map of actual "gx,gy" -> particleIndex from the RUNNING particles array
      const gridToActualIndex = new Map<string, number>();
      bot.particles.forEach((p, i) => {
          if (p.gx !== undefined && p.gy !== undefined) {
             gridToActualIndex.set(`${p.gx},${p.gy}`, i);
          }
      });

      // Calculate physics position based on a neighbor
      const neighbors = [
          {dx:1, dy:0}, {dx:-1, dy:0}, {dx:0, dy:1}, {dx:0, dy:-1}
      ];
      
      let referenceParticle: Particle | null = null;
      let dx = 0, dy = 0;

      for (const n of neighbors) {
          const nx = addedX + n.dx;
          const ny = addedY + n.dy;
          const neighborKey = `${nx},${ny}`;
          
          if (gridToActualIndex.has(neighborKey)) {
               const pIdx = gridToActualIndex.get(neighborKey)!;
               if (bot.particles[pIdx]) {
                   referenceParticle = bot.particles[pIdx];
                   dx = -n.dx; // Direction FROM neighbor TO new node
                   dy = -n.dy;
                   break;
               }
          }
      }

      if (!referenceParticle) return;

      // Create Physical Particle
      const scale = this.config.gridScale || 60;
      const spawnX = referenceParticle.pos.x + dx * scale;
      const spawnY = referenceParticle.pos.y + dy * scale;
      
      const type = newGenome.genes[addedY][addedX];
      let mass = 1.0; 
      if (type === CellType.HEART) mass = 1.2; 
      if (type === CellType.NEURON) mass = 1.0; 

      const newParticle: Particle = {
          pos: { x: spawnX, y: spawnY },
          oldPos: { x: spawnX, y: spawnY },
          renderPos: { x: spawnX, y: spawnY },
          renderVel: { x: 0, y: 0 },
          mass,
          force: { x: 0, y: 0 },
          charge: 0,
          isFixed: false,
          phase: addedX * 0.6 + addedY * 0.1,
          gx: addedX,
          gy: addedY
      };

      bot.particles.push(newParticle);
      const newPIdx = bot.particles.length - 1;
      
      gridToActualIndex.set(`${addedX},${addedY}`, newPIdx);

      // Update Genome Reference
      bot.genome = newGenome;
      bot.energy -= cost;

      // Update Scaling Difficulty if Group A
      if (bot.groupId === 0) {
          this.groupAGrowthCount++;
      }

      // Add Springs (Connect to all valid neighbors)
      const springNeighbors = [
        { dx: 1, dy: 0, dist: 1 },
        { dx: 0, dy: 1, dist: 1 },
        { dx: 1, dy: 1, dist: 1.414 },
        { dx: -1, dy: 1, dist: 1.414 },
        { dx: -1, dy: 0, dist: 1 },
        { dx: 0, dy: -1, dist: 1 },
        { dx: -1, dy: -1, dist: 1.414 },
        { dx: 1, dy: -1, dist: 1.414 }
      ];

      for (const n of springNeighbors) {
          const nx = addedX + n.dx;
          const ny = addedY + n.dy;
          const neighborKey = `${nx},${ny}`;
          
          if (gridToActualIndex.has(neighborKey)) {
               const neighborPIdx = gridToActualIndex.get(neighborKey)!;
               
               const type1 = type;
               const type2 = newGenome.genes[ny][nx]; 
               const isMuscle = (type1 === CellType.HEART || type2 === CellType.HEART);
               const isNeuron = (type1 === CellType.NEURON || type2 === CellType.NEURON);
               
               let stiffness = 1.0; 
               if (type1 === CellType.NEURON && type2 === CellType.NEURON) stiffness = 1.25; 
               else if (isNeuron) stiffness = 1.15;
               else if (isMuscle) stiffness = 0.9; 

               bot.springs.push({
                    p1: newPIdx,
                    p2: neighborPIdx,
                    restLength: n.dist * scale,
                    currentRestLength: n.dist * scale,
                    stiffness,
                    isMuscle,
                    phaseOffset: (addedX + addedY) * 0.5 
               });
          }
      }
      this.events.push('EAT'); // Reuse sound for growth pop
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
      // Scale energy cost/division
      bot.energy /= 2;
      
      // Update Scaling Difficulty if Group A
      if (bot.groupId === 0) {
          this.groupAReproductionCount++;
      }

      this.events.push('MITOSIS');
      
      let childGenome = mutate(bot.genome);
      
      // REVISED: Specific logic for "Offspring Colonies"
      childGenome = pruneGenome(childGenome, 6); 
      
      const angle = Math.random() * Math.PI * 2;
      const distance = 100 + Math.random() * 50;
      const ox = Math.cos(angle) * distance;
      const oy = Math.sin(angle) * distance;
      
      // Safety calculation for spawn coordinates
      let spawnX = bot.centerOfMass.x + ox;
      let spawnY = bot.centerOfMass.y + oy;
      if (isNaN(spawnX)) spawnX = 0;
      if (isNaN(spawnY)) spawnY = 0;
      
      const child = this.createBot(childGenome, spawnX, spawnY);
      child.groupId = bot.groupId;
      child.energy = bot.energy; 
      
      // Impulse to separate
      child.particles.forEach(p => {
          p.pos.x += ox * 0.1;
          p.pos.y += oy * 0.1;
      });

      return child;
  }

  private updateInternalStructure(bot: Xenobot, time: number): number {
      let activeCharge = 0;
      const springs = bot.springs;
      const particles = bot.particles;
      const mStrength = this.config.muscleStrength;
      const mSpeed = this.config.muscleSpeed;
      
      // FIX: Lowered charge limit significantly to prevent "blob" rendering
      const chargeLimit = 100.0; 
      
      const decayFactor = METABOLIC_DECAY * 0.05; 
      // BALANCED DAMPING: Higher to prevent jitter
      const dampingCoefficient = 2.0; 
      
      // Force limit
      const maxSpringForce = 50.0;

      for (const s of springs) {
          const p1 = particles[s.p1];
          const p2 = particles[s.p2];

          // 1. Muscle Actuation
          if (s.isMuscle) {
              bot.energy -= decayFactor;
              const avgCharge = (p1.charge + p2.charge) * 0.5;
              const freqMod = 1.0 + avgCharge * 0.2; 
              
              const contraction = Math.sin(time * mSpeed * freqMod + (s.phaseOffset || 0));
              s.currentRestLength = s.restLength * (1.0 + contraction * mStrength * 0.35);
          } else {
              s.currentRestLength = s.restLength;
          }

          // 2. Geometry & Forces
          const dx = p1.pos.x - p2.pos.x;
          const dy = p1.pos.y - p2.pos.y;
          const distSq = dx*dx + dy*dy;
          const currLen = Math.sqrt(distSq);
          
          // FIX: Reduced charge generation to scale with new limit
          const strain = Math.abs(currLen - s.currentRestLength) / s.currentRestLength;
          if (strain > 0.05) { 
             const chargeGen = strain * 50.0; 
             p1.charge = Math.min(chargeLimit, p1.charge + chargeGen);
             p2.charge = Math.min(chargeLimit, p2.charge + chargeGen);
          }
          activeCharge += (p1.charge + p2.charge);

          if (distSq > 0.0001) {
              const v1x = p1.pos.x - p1.oldPos.x;
              const v1y = p1.pos.y - p1.oldPos.y;
              const v2x = p2.pos.x - p2.oldPos.x;
              const v2y = p2.pos.y - p2.oldPos.y;
              
              const nx = dx / currLen;
              const ny = dy / currLen;

              const vRel = (v2x - v1x) * nx + (v2y - v1y) * ny;
              const displacement = currLen - s.currentRestLength;
              
              const fSpring = displacement * s.stiffness;
              const fDamp = vRel * dampingCoefficient;
              
              // Force clamping
              let fTotal = -(fSpring + fDamp);
              fTotal = Math.max(-maxSpringForce, Math.min(maxSpringForce, fTotal));

              const fx = nx * fTotal;
              const fy = ny * fTotal;

              p1.force.x += fx;
              p1.force.y += fy;
              p2.force.x -= fx;
              p2.force.y -= fy;
          }
      }
      return activeCharge;
  }

  // Optimized Spatial Hash Collision Detection
  private resolveCollisions(botCount: number) {
      const GRID_CELL_SIZE = 400; // Broadphase cell size
      const grid = new Map<string, Xenobot[]>();

      // 1. Build Grid
      for (let i = 0; i < botCount; i++) {
          const bot = this.bots[i];
          if (bot.isDead) continue;
          
          const gx = Math.floor(bot.centerOfMass.x / GRID_CELL_SIZE);
          const gy = Math.floor(bot.centerOfMass.y / GRID_CELL_SIZE);
          const key = `${gx},${gy}`;
          
          if (!grid.has(key)) grid.set(key, []);
          grid.get(key)!.push(bot);
      }

      // 2. Query Neighbors (3x3 grid)
      const neighborOffsets = [
          [0,0], [1,0], [-1,0], [0,1], [0,-1],
          [1,1], [1,-1], [-1,1], [-1,-1]
      ];

      for (let i = 0; i < botCount; i++) {
          const b1 = this.bots[i];
          if (b1.isDead) continue;
          
          const gx = Math.floor(b1.centerOfMass.x / GRID_CELL_SIZE);
          const gy = Math.floor(b1.centerOfMass.y / GRID_CELL_SIZE);

          for (const offset of neighborOffsets) {
              const nKey = `${gx + offset[0]},${gy + offset[1]}`;
              const neighbors = grid.get(nKey);
              
              if (!neighbors) continue;

              for (const b2 of neighbors) {
                  // Avoid duplicate checks (id comparison ensures only checking pair once)
                  if (b1.id >= b2.id) continue;
                  
                  // Optimized Broadphase
                  const dx = b1.centerOfMass.x - b2.centerOfMass.x;
                  const dy = b1.centerOfMass.y - b2.centerOfMass.y;
                  const distSq = dx*dx + dy*dy;
                  
                  if (distSq > 160000) continue; // Broadphase rejection

                  // Particle-Particle Narrowphase
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
                              
                              const moveX = nx * overlap * 0.15; 
                              const moveY = ny * overlap * 0.15;

                              p1.pos.x += moveX;
                              p1.pos.y += moveY;
                              p2.pos.x -= moveX;
                              p2.pos.y -= moveY;

                              b1.lastCollisionTime = Date.now();
                              b1.lastCollisionPoint = { x: (p1.pos.x + p2.pos.x) * 0.5, y: (p1.pos.y + p2.pos.y) * 0.5 };

                              // === REFINED Energy Transfer based on Mind-Body Operators ===
                              
                              // 1. Structural Stress (Increased Friction for crowding)
                              const stress = overlap * 0.5; 
                              b1.energy = Math.max(0, b1.energy - stress);
                              b2.energy = Math.max(0, b2.energy - stress);

                              // 2. Absorption (Experience)
                              // Only gain energy if survival instinct (energy) is high enough to process
                              if (b1.absorption > 0) b1.energy += overlap * b1.absorption * 1.0;
                              if (b2.absorption > 0) b2.energy += overlap * b2.absorption * 1.0;

                              // 3. Irruption (Dominance/Will)
                              // Winner takes energy from loser based on delta
                              // Also weighted by total charge (biological intensity)
                              const power1 = b1.irruption * (1 + b1.totalCharge/1000);
                              const power2 = b2.irruption * (1 + b2.totalCharge/1000);
                              
                              const diff = power1 - power2;
                              const transfer = diff * overlap * 5.0; // Higher transfer rate
                              
                              // Apply transfer (Zero-sum game between agents)
                              if (diff > 0) {
                                  // b1 wins
                                  const amount = Math.min(b2.energy, transfer);
                                  b1.energy += amount;
                                  b2.energy -= amount;
                              } else {
                                  // b2 wins
                                  const amount = Math.min(b1.energy, -transfer);
                                  b2.energy += amount;
                                  b1.energy -= amount;
                              }
                              // === End Energy Transfer ===
                          }
                      }
                  }
              }
          }
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

  public evolvePopulation(generation: number): boolean {
    const currentGenomes = this.bots.map(b => {
        // Safe distance check (handle NaN)
        const dist = !isNaN(b.centerOfMass.x) ? b.centerOfMass.x - b.startPosition.x : 0;
        b.genome.fitness = b.energy + dist * 2;
        
        // SAFE ORIGIN UPDATE
        if (!isNaN(b.centerOfMass.x) && !isNaN(b.centerOfMass.y)) {
            b.genome.originX = b.centerOfMass.x;
            b.genome.originY = b.centerOfMass.y;
        }
        
        return b.genome;
    });
    
    const newGenomes = algoEvolve(currentGenomes, generation, this.config.populationSize);
    if (newGenomes.length === 0) return false;

    const nextBots: Xenobot[] = [];
    newGenomes.forEach(g => {
        // MATCH BY GENOME ID to preserve existing living bots
        const existing = this.bots.find(b => b.genome.id === g.id);
        
        if (existing && !existing.isDead) {
            nextBots.push(existing);
        } else {
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

    // SAFETY CHECK: Don't wipe the population if something went wrong
    if (nextBots.length > 0) {
        this.bots = nextBots;
        return true;
    }
    return false;
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
      // FIX: Tuned damping to be more critical (less jittery)
      // INCREASED TENSION to reduce lag distance
      const tension = 60.0; 
      // Critical damping for tension 60 is 2 * sqrt(60) ≈ 15.5
      const damping = 16.0;   
      const dt = 0.016;      

      this.bots.forEach(b => {
          b.particles.forEach(p => {
              // Ensure render velocity is initialized
              if (!p.renderVel) p.renderVel = { x: 0, y: 0 };

              // Calculate displacement from physics body to visual skin
              const dx = p.pos.x - p.renderPos.x;
              const dy = p.pos.y - p.renderPos.y;
              const distSq = dx*dx + dy*dy;

              // Teleport if too far (e.g. init or world wrap)
              // Threshold increased from 100px (10000) to 500px (250000) to prevent snapping during fast movement
              if (distSq > 250000 || isNaN(p.renderPos.x) || isNaN(p.renderPos.y)) {
                  p.renderPos.x = p.pos.x;
                  p.renderPos.y = p.pos.y;
                  p.renderVel = { x: 0, y: 0 };
              } else {
                  // Apply Spring Force: F = -kx - cv
                  // Acceleration = Force / Mass (Mass assumed 1 for visual skin)
                  const ax = (tension * dx) - (damping * p.renderVel.x);
                  const ay = (tension * dy) - (damping * p.renderVel.y);

                  // Semi-implicit Euler Integration for stability
                  p.renderVel.x += ax * dt;
                  p.renderVel.y += ay * dt;

                  p.renderPos.x += p.renderVel.x * dt;
                  p.renderPos.y += p.renderVel.y * dt;
              }
          });
      });
  }
}
