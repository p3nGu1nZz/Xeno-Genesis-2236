
import Matter from 'matter-js';
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
  CILIA_FORCE,
  METABOLIC_DECAY,
  INITIAL_YOLK_ENERGY,
  MITOSIS_THRESHOLD,
  GROWTH_COST,
  MAX_BOT_SIZE,
  FOOD_ENERGY,
  FOOD_RADIUS,
  COLLISION_RADIUS
} from '../constants';
import { evolvePopulation as algoEvolve, mutate, pruneGenome, addStructuralNode } from './geneticAlgorithm';

const uid = () => Math.random().toString(36).substr(2, 9);
const MAX_VELOCITY = 8.0; 

export class PhysicsEngine {
  public bots: Xenobot[] = [];
  public food: Food[] = [];
  public config: SimulationConfig;
  public events: SimulationEventType[] = [];
  public groundY: number;

  // Matter.js Integration
  public engine: Matter.Engine;
  private bodyMap = new Map<number, Matter.Body>(); // Maps ID -> Body
  private constraintMap = new Map<number, Matter.Constraint>(); // Maps ID -> Constraint

  // --- SCALING DIFFICULTY STATE ---
  public groupAGrowthCount = 0;
  public groupAReproductionCount = 0;

  constructor(config: SimulationConfig) {
    this.config = config;
    this.groundY = config.groundHeight;

    // Initialize Matter JS
    this.engine = Matter.Engine.create({
        gravity: { x: 0, y: 0, scale: 0 }, // We apply custom gravity
        positionIterations: 6,
        velocityIterations: 4,
        constraintIterations: 4
    });

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
    // NAN SAFETY CHECK
    if (isNaN(startX)) startX = 0;
    if (isNaN(startY)) startY = 0;

    const scale = this.config.gridScale || 60;
    const size = genome.gridSize;
    const particles: Particle[] = [];
    const springs: Spring[] = [];

    // Matter.js Composite for this Bot
    const botComposite = Matter.Composite.create();
    
    // 1. Create Bodies (Nodes)
    const particleMap: number[][] = Array(size).fill(null).map(() => Array(size).fill(-1));
    const gridToBody = new Map<string, Matter.Body>();

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const cellType = genome.genes[y][x];
        if (cellType !== CellType.EMPTY) {
           const px = startX + (x - size/2) * scale;
           const py = startY + (y - size/2) * scale;
           
           let mass = 1.0; 
           if (cellType === CellType.HEART) mass = 1.2; 
           if (cellType === CellType.NEURON) mass = 1.0; 

           // MATTER JS BODY
           // Swimming Physics: High air friction prevents "sliding"
           // Low restitution prevents bouncing
           const body = Matter.Bodies.circle(px, py, COLLISION_RADIUS, {
               frictionAir: 0.08, // High Drag: Acts like thick fluid
               restitution: 0.1,  // Damped collisions
               friction: 0.0,     // No surface friction
               density: 0.002 * mass,
               label: 'cell'
           });
           
           this.bodyMap.set(body.id, body);
           Matter.Composite.add(botComposite, body);
           gridToBody.set(`${x},${y}`, body);

           // Proxy Particle for rendering
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
             gy: y,
             bodyId: body.id
           });
           particleMap[y][x] = particles.length - 1;
        }
      }
    }

    // 2. Create Constraints (Springs)
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

        const bodyA = gridToBody.get(`${x},${y}`);
        if (!bodyA) continue;

        for (const n of neighbors) {
            const nx = x + n.dx;
            const ny = y + n.dy;
            
            if (nx >= 0 && nx < size && ny >= 0 && ny < size) {
                const p2Idx = particleMap[ny][nx];
                if (p2Idx !== -1) {
                    const bodyB = gridToBody.get(`${nx},${ny}`);
                    if (!bodyB) continue;

                    const type1 = genome.genes[y][x];
                    const type2 = genome.genes[ny][nx];
                    
                    const isMuscle = (type1 === CellType.HEART || type2 === CellType.HEART);
                    
                    // Soft-Body Tuning
                    let stiffness = 0.1; 
                    let damping = 0.05;

                    if (type1 === CellType.NEURON && type2 === CellType.NEURON) {
                        stiffness = 0.3; // Skeleton (stiffer)
                        damping = 0.1;
                    } else if (isMuscle) {
                        stiffness = 0.05; // Muscles (very stretchy)
                        damping = 0.01;   // Low damping for snap
                    }

                    // MATTER JS CONSTRAINT
                    const constraint = Matter.Constraint.create({
                        bodyA,
                        bodyB,
                        length: n.dist * scale,
                        stiffness: stiffness,
                        damping: damping
                    });
                    
                    this.constraintMap.set(constraint.id, constraint);
                    Matter.Composite.add(botComposite, constraint);

                    springs.push({
                        p1: p1Idx,
                        p2: p2Idx,
                        restLength: n.dist * scale,
                        currentRestLength: n.dist * scale,
                        stiffness,
                        isMuscle,
                        phaseOffset: (x + y) * 0.8, // Increased phase difference for peristalsis
                        matterConstraintId: constraint.id
                    });
                }
            }
        }
      }
    }

    Matter.World.add(this.engine.world, botComposite);

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
        absorption: 0,
        matterCompositeId: botComposite.id
    };
  }

  public applyMutagen(botId: string) {
      const bot = this.bots.find(b => b.id === botId);
      if (!bot || bot.isDead) return false;

      // Check against Configurable Max Bot Size
      if (bot.particles.length < this.config.maxBotSize) {
         this.attemptVegetativeGrowth(bot);
      }
      
      bot.genome = mutate(bot.genome);
      bot.energy += 1000;
      
      this.events.push('MITOSIS'); 
      return true;
  }

  public getCosts() {
      return {
          growthCost: GROWTH_COST * Math.pow(1.25, this.groupAGrowthCount),
          mitosisCost: MITOSIS_THRESHOLD * Math.pow(1.25, this.groupAReproductionCount)
      };
  }

  public update(totalTime: number) {
    this.events = [];
    
    // 1. Biological Update (Muscles, Forces)
    this.bots.forEach(bot => {
        if (bot.isDead) return;
        
        // Update Bio-Electricity & Muscle Contraction
        const activeCharge = this.updateInternalBio(bot, totalTime);
        bot.totalCharge = activeCharge;

        // Apply External Forces (Gravity, Cilia)
        this.applyForces(bot, totalTime);
        
        // Global Charge Decay (Simulating Field Dissipation)
        // Slower decay for more persistent visual trails
        bot.particles.forEach(p => {
            p.charge *= 0.995; 
        });
    });

    // 2. Physics Step
    // Using a fixed timestep here for consistency
    Matter.Engine.update(this.engine, 1000/60);

    // 3. Sync & Game Logic
    const newBots: Xenobot[] = [];
    const maxBots = this.config.maxPopulationSize;

    this.bots.forEach(bot => {
        if (bot.isDead) return;

        // Sync Matter Positions to Particles
        this.syncPhysicsState(bot);

        // Metabolism
        bot.energy -= METABOLIC_DECAY;
        bot.age++;

        if (bot.energy <= 0) {
            this.killBot(bot);
            return;
        }

        const energyGained = this.checkFoodConsumption(bot);
        bot.irruption = Math.min(1.0, bot.totalCharge * 0.0002);
        bot.absorption = Math.min(1.0, (energyGained > 0 ? 0.5 : 0));

        // Growth
        let currentGrowthCost = GROWTH_COST;
        if (bot.groupId === 0) {
            currentGrowthCost = GROWTH_COST * Math.pow(1.25, this.groupAGrowthCount);
        }

        // Use Configurable Max Size
        if (bot.energy >= currentGrowthCost && bot.particles.length < this.config.maxBotSize) {
             this.attemptVegetativeGrowth(bot, currentGrowthCost);
        }

        // Reproduction
        let currentMitosisThreshold = MITOSIS_THRESHOLD;
        if (bot.groupId === 0) {
            currentMitosisThreshold = MITOSIS_THRESHOLD * Math.pow(1.25, this.groupAReproductionCount);
        }

        if (bot.energy > currentMitosisThreshold && 
            bot.age > 800 && 
            (this.bots.length + newBots.length) < maxBots &&
            Math.random() < 0.00015) {
             const child = this.performMitosis(bot);
             if (child) newBots.push(child);
        }
    });

    if (newBots.length > 0) {
        this.bots.push(...newBots);
    }

    if (this.food.length < this.config.foodCount * 0.8) {
        this.spawnFood();
    }
    
    // 4. Visual Smoothing Step
    this.smoothRenderPositions();
  }

  private killBot(bot: Xenobot) {
      bot.isDead = true;
      this.events.push('DEATH');
      // Remove from physics world
      if (bot.matterCompositeId) {
          const composite = Matter.Composite.get(this.engine.world, bot.matterCompositeId, null);
          if (composite) {
              Matter.World.remove(this.engine.world, composite);
              // Clean up constraint map
              bot.springs.forEach(s => {
                  if (s.matterConstraintId) this.constraintMap.delete(s.matterConstraintId);
              });
              bot.particles.forEach(p => {
                  if (p.bodyId) this.bodyMap.delete(p.bodyId);
              });
          }
      }
  }

  private applyForces(bot: Xenobot, totalTime: number) {
      const gravity = this.config.gravity * 0.001; 
      
      // Calculate propulsion based on shape change (swimming)
      const { impulseX, impulseY, torque } = this.calculateSwimmingImpulse(bot, totalTime);
      
      // Slow random heading drift
      bot.heading += (Math.random() - 0.5) * 0.05;

      bot.particles.forEach(p => {
          if (p.bodyId) {
              const body = this.bodyMap.get(p.bodyId);
              if (body) {
                  // NAN Safety
                  if (isNaN(body.position.x) || isNaN(body.position.y)) return;

                  // Custom Gravity
                  Matter.Body.applyForce(body, body.position, { x: 0, y: gravity * body.mass });
                  
                  // Metachronal Swimming Physics:
                  // Apply propulsion proportional to position relative to center (Fin effect)
                  // Outer nodes generate more torque/thrust than inner nodes
                  const dx = body.position.x - bot.centerOfMass.x;
                  const dy = body.position.y - bot.centerOfMass.y;
                  
                  // Rotate relative position to align with heading
                  const cosH = Math.cos(-bot.heading);
                  const sinH = Math.sin(-bot.heading);
                  const relX = dx * cosH - dy * sinH;
                  const relY = dx * sinH + dy * cosH;
                  
                  // Wiggle wave propagates along body length (X-axis in local space)
                  const wavePhase = relX * 0.05; 
                  
                  // Apply phase-shifted force
                  // This creates a traveling wave along the body rather than pushing the whole body uniformly
                  const localThrust = Math.max(0, impulseX * Math.cos(wavePhase));
                  
                  // Convert local thrust back to world space
                  const thrustWorldX = localThrust * Math.cos(bot.heading);
                  const thrustWorldY = localThrust * Math.sin(bot.heading);

                  Matter.Body.applyForce(body, body.position, { 
                      x: thrustWorldX * 0.00015, 
                      y: thrustWorldY * 0.00015
                  });
                  
                  // Rotational Torque (Fin / Rudder Effect)
                  // Apply forces perpendicular to the radius to induce rotation
                  if (Math.abs(torque) > 0.01) {
                       Matter.Body.applyForce(body, body.position, {
                          x: -dy * torque * 0.000008, // Increased torque constant
                          y: dx * torque * 0.000008
                      });
                  }

                  // World Bounds (Soft)
                  if (body.position.x < -10000) Matter.Body.setPosition(body, { x: -10000, y: body.position.y });
                  if (body.position.x > 10000) Matter.Body.setPosition(body, { x: 10000, y: body.position.y });
                  if (body.position.y > 10000) Matter.Body.setPosition(body, { x: body.position.x, y: 10000 });
              }
          }
      });
  }

  private syncPhysicsState(bot: Xenobot) {
      let cxSum = 0, cySum = 0;
      let count = 0;

      bot.particles.forEach(p => {
          if (p.bodyId) {
              const body = this.bodyMap.get(p.bodyId);
              if (body) {
                  p.oldPos.x = p.pos.x;
                  p.oldPos.y = p.pos.y;
                  p.pos.x = body.position.x;
                  p.pos.y = body.position.y;
                  
                  // NOTE: Render position is NOT synced here anymore to allow for smoothing.
                  // Smoothing logic in smoothRenderPositions() handles the interpolation.

                  // Limit velocity if things get crazy
                  const speed = Matter.Vector.magnitude(body.velocity);
                  if (speed > MAX_VELOCITY) {
                      Matter.Body.setVelocity(body, Matter.Vector.mult(Matter.Vector.normalise(body.velocity), MAX_VELOCITY));
                  }

                  cxSum += body.position.x;
                  cySum += body.position.y;
                  count++;
              }
          }
      });

      if (count > 0) {
          bot.centerOfMass.x = cxSum / count;
          bot.centerOfMass.y = cySum / count;
          
          if (isNaN(bot.centerOfMass.x) || isNaN(bot.centerOfMass.y)) {
               this.killBot(bot); // Safety kill if physics NaN
          }
      }
  }

  private attemptVegetativeGrowth(bot: Xenobot, cost: number = GROWTH_COST) {
      if (bot.isDead || !bot.matterCompositeId) return;

      const growthResult = addStructuralNode(bot.genome);
      if (!growthResult) return;

      const { newGenome, addedX, addedY } = growthResult;
      const composite = Matter.Composite.get(this.engine.world, bot.matterCompositeId, null) as Matter.Composite;
      if (!composite) return;

      // Find neighbor to attach to
      let referenceBody: Matter.Body | null = null;
      let spawnX = 0, spawnY = 0;
      
      const scale = this.config.gridScale || 60;
      const neighbors = [{dx:1, dy:0}, {dx:-1, dy:0}, {dx:0, dy:1}, {dx:0, dy:-1}];

      // Find a reference particle from existing array based on grid coords
      for (const n of neighbors) {
           const nx = addedX + n.dx;
           const ny = addedY + n.dy;
           const neighborP = bot.particles.find(p => p.gx === nx && p.gy === ny);
           if (neighborP && neighborP.bodyId) {
               referenceBody = this.bodyMap.get(neighborP.bodyId) || null;
               if (referenceBody) {
                   spawnX = referenceBody.position.x - n.dx * scale;
                   spawnY = referenceBody.position.y - n.dy * scale;
                   break;
               }
           }
      }

      if (!referenceBody) return;

      // Create New Matter Body
      const type = newGenome.genes[addedY][addedX];
      let mass = 1.0; 
      if (type === CellType.HEART) mass = 1.2; 

      const body = Matter.Bodies.circle(spawnX, spawnY, COLLISION_RADIUS, {
           frictionAir: 0.08, // Match new fluid settings
           restitution: 0.1,
           density: 0.002 * mass,
           label: 'cell'
      });
      
      this.bodyMap.set(body.id, body);
      Matter.Composite.add(composite, body);

      // Create New Particle
      const newPIdx = bot.particles.length;
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
          gy: addedY,
          bodyId: body.id
      };
      bot.particles.push(newParticle);

      // Create Constraints
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
          const neighborPIdx = bot.particles.findIndex(p => p.gx === nx && p.gy === ny);
          
          if (neighborPIdx !== -1) {
               const neighborP = bot.particles[neighborPIdx];
               const bodyB = this.bodyMap.get(neighborP.bodyId!);
               if (bodyB) {
                    const type2 = newGenome.genes[ny][nx];
                    const isMuscle = (type === CellType.HEART || type2 === CellType.HEART);
                    // Match createBot tuning
                    let stiffness = 0.1;
                    if (type === CellType.NEURON && type2 === CellType.NEURON) stiffness = 0.3;
                    else if (isMuscle) stiffness = 0.05;

                    const constraint = Matter.Constraint.create({
                        bodyA: body,
                        bodyB: bodyB,
                        length: n.dist * scale,
                        stiffness: stiffness,
                        damping: 0.05
                    });
                    this.constraintMap.set(constraint.id, constraint);
                    Matter.Composite.add(composite, constraint);

                    bot.springs.push({
                        p1: newPIdx,
                        p2: neighborPIdx,
                        restLength: n.dist * scale,
                        currentRestLength: n.dist * scale,
                        stiffness,
                        isMuscle,
                        phaseOffset: (addedX + addedY) * 0.8,
                        matterConstraintId: constraint.id
                    });
               }
          }
      }

      bot.genome = newGenome;
      bot.energy -= cost;
      if (bot.groupId === 0) this.groupAGrowthCount++;
      this.events.push('EAT');
  }

  private checkFoodConsumption(bot: Xenobot): number {
      let energyGained = 0;
      const eatDistSq = 900; 

      for (let i = this.food.length - 1; i >= 0; i--) {
          const f = this.food[i];
          const dx = bot.centerOfMass.x - f.x;
          const dy = bot.centerOfMass.y - f.y;
          const dSq = dx*dx + dy*dy;
          
          if (dSq > 100000) continue; // Broadphase check
          
          let consumed = false;
          // Check vs center of mass first
          if (dSq < eatDistSq) {
              consumed = true;
          } else {
              // Check vs individual particles
              for (const p of bot.particles) {
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
      if (bot.groupId === 0) this.groupAReproductionCount++;

      this.events.push('MITOSIS');
      
      let childGenome = mutate(bot.genome);
      childGenome = pruneGenome(childGenome, 6); 
      
      const angle = Math.random() * Math.PI * 2;
      const distance = 120;
      const spawnX = bot.centerOfMass.x + Math.cos(angle) * distance;
      const spawnY = bot.centerOfMass.y + Math.sin(angle) * distance;
      
      const child = this.createBot(childGenome, spawnX, spawnY);
      child.groupId = bot.groupId;
      child.energy = bot.energy;
      
      return child;
  }

  private updateInternalBio(bot: Xenobot, time: number): number {
      let activeCharge = 0;
      const mSpeed = this.config.muscleSpeed;
      
      for(const spring of bot.springs) {
          if (!spring.matterConstraintId) continue;
          
          const constraint = this.constraintMap.get(spring.matterConstraintId);
          if (!constraint) continue;

          if (spring.isMuscle) {
               const p1 = bot.particles[spring.p1];
               const p2 = bot.particles[spring.p2];
               
               const avgCharge = (p1.charge + p2.charge) * 0.5;
               const freqMod = 1.0 + avgCharge * 0.2; 
               
               // Phase-shifted contraction creates Peristalsis
               const contraction = Math.sin(time * mSpeed * freqMod + (spring.phaseOffset || 0));
               
               // Amplitude Logic: Stretches and compresses significantly
               // 1.0 = Rest Length. range: 0.6 to 1.4
               const amplitude = 0.4 * this.config.muscleStrength;
               const targetLen = spring.restLength * (1.0 + contraction * amplitude);
               
               // Actuate Matter.js Constraint
               constraint.length = targetLen;
               spring.currentRestLength = targetLen; // Sync for visual
          }
          
          // Compute Stress/Charge for Visuals
          const currLen = Matter.Vector.magnitude(Matter.Vector.sub(constraint.bodyA!.position, constraint.bodyB!.position));
          const strain = Math.abs(currLen - constraint.length) / (constraint.length || 1);
          
          if (strain > 0.05) {
               // INCREASED: Higher multiplier for stronger visual feedback
               const chargeGen = strain * 85.0; 
               const p1 = bot.particles[spring.p1];
               const p2 = bot.particles[spring.p2];
               p1.charge = Math.min(100, p1.charge + chargeGen);
               p2.charge = Math.min(100, p2.charge + chargeGen);
          }
          activeCharge += (bot.particles[spring.p1].charge + bot.particles[spring.p2].charge);
      }

      return activeCharge;
  }

  private calculateSwimmingImpulse(bot: Xenobot, time: number) {
      const hx = Math.cos(bot.heading);
      const hy = Math.sin(bot.heading);
      const memory = bot.genome.bioelectricMemory || 0.5;
      const waveSpeed = 2.0 + (memory * 2.0);
      
      // Impulse Logic (Improved):
      // More aggressive power stroke curve for sharper movement
      const beat = Math.sin(time * waveSpeed + parseInt(bot.id.substr(0,2), 36));
      
      let strokeIntensity = 0;
      
      // Sharp Power Stroke (Positive Beat)
      if (beat > 0.0) {
          strokeIntensity = Math.pow(beat, 3) * 1.5; // Cubic curve for stronger "kick"
      } 
      // Recovery Stroke (Negative Beat) - Drag Phase
      else {
          strokeIntensity = 0.1 * beat; // Slight drag
      }

      const thrust = CILIA_FORCE * strokeIntensity;

      // Steering (Wander)
      const wander = Math.sin(time * 0.3 + parseInt(bot.id.substr(0,3), 36));
      const turn = wander * 0.8; // Increased turning authority
      
      const impulseX = thrust * (hx - turn * hy);
      const impulseY = thrust * (hy + turn * hx);
      
      // Torque for wiggling body - strongly correlated to the beat for realistic fish-like motion
      const torque = strokeIntensity * wander * 4.0; 

      return { impulseX, impulseY, torque };
  }

  public smoothRenderPositions() {
      // CRITICALLY DAMPED SPRING SMOOTHING (High-Pass Filter)
      // Tuned for stability (no oscillation) and responsiveness
      // stiffness: 1.1 (High stiffness for strong cohesion)
      // damping: 1.05 (Over-damping to eliminate jitter)
      const stiffness = 1.1; 
      const damping = 1.05;

      this.bots.forEach(b => {
          b.particles.forEach(p => {
              if (p.bodyId && this.bodyMap.has(p.bodyId)) {
                  const body = this.bodyMap.get(p.bodyId)!;
                  const targetX = body.position.x;
                  const targetY = body.position.y;
                  
                  if (!p.renderVel) p.renderVel = { x: 0, y: 0 };

                  // 1. Calculate displacement from physical body (Target)
                  const dx = targetX - p.renderPos.x;
                  const dy = targetY - p.renderPos.y;
                  
                  // 2. Spring Force (Hooke's Law): F = k * x
                  // 3. Damping Force: F = -c * v
                  const ax = (dx * stiffness) - (p.renderVel.x * damping);
                  const ay = (dy * stiffness) - (p.renderVel.y * damping);

                  // 4. Update Velocity
                  p.renderVel.x += ax;
                  p.renderVel.y += ay;

                  // 5. Update Render Position
                  p.renderPos.x += p.renderVel.x;
                  p.renderPos.y += p.renderVel.y;
                  
                  // Safety Teleport: If divergence is too high (e.g. initialization or explosion)
                  // prevents "rubber banding" artifacts across screen
                  const distSq = dx*dx + dy*dy;
                  if (distSq > 3000) {
                      p.renderPos.x = targetX;
                      p.renderPos.y = targetY;
                      p.renderVel = { x: 0, y: 0 };
                  }
              } else {
                  // Fallback for particles without bodies
                  p.renderPos.x = p.pos.x;
                  p.renderPos.y = p.pos.y;
              }
          });
      });
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
  
  public evolvePopulation(generation: number): boolean {
    const currentGenomes = this.bots.map(b => {
        const dist = !isNaN(b.centerOfMass.x) ? b.centerOfMass.x - b.startPosition.x : 0;
        b.genome.fitness = b.energy + dist * 2;
        if (!isNaN(b.centerOfMass.x)) {
            b.genome.originX = b.centerOfMass.x;
            b.genome.originY = b.centerOfMass.y;
        }
        return b.genome;
    });
    
    const newGenomes = algoEvolve(currentGenomes, generation, this.config.populationSize);
    if (newGenomes.length === 0) return false;

    // Remove old physics bodies
    Matter.Composite.clear(this.engine.world, false);
    this.bodyMap.clear();
    this.constraintMap.clear();
    
    // Rebuild world
    const nextBots: Xenobot[] = [];
    newGenomes.forEach(g => {
        let startX = 0;
        let startY = 0;
        if (typeof g.originX === 'number' && !isNaN(g.originX)) {
            startX = g.originX + (Math.random()-0.5)*50;
        } else {
            startX = (Math.random()-0.5)*1000;
        }
        startY = 200 + Math.random() * 100;

        const bot = this.createBot(g, startX, startY);
        nextBots.push(bot);
    });

    if (nextBots.length > 0) {
        this.bots = nextBots;
        return true;
    }
    return false;
  }
}
