import { 
  SimulationConfig, Xenobot, Genome, Particle, Spring, Point, Food, 
  SimulationEventType, GeneticStats, CellType 
} from '../types';
import { 
  GRID_SIZE, COLORS, SUB_STEPS, TIMESTEP, CONSTRAINT_ITERATIONS, 
  CILIA_FORCE, METABOLIC_DECAY, INITIAL_YOLK_ENERGY, MITOSIS_THRESHOLD, 
  SURFACE_TENSION, FOOD_ENERGY, FOOD_RADIUS, BREAKING_THRESHOLD, 
  COLLISION_RADIUS, INITIAL_POPULATION_SIZE 
} from '../constants';
import { evolvePopulation, createRandomGenome, mutate } from './geneticAlgorithm';

export class PhysicsEngine {
  config: SimulationConfig;
  bots: Xenobot[] = [];
  food: Food[] = [];
  events: SimulationEventType[] = [];
  groundY: number;

  constructor(config: SimulationConfig) {
    this.config = config;
    this.groundY = config.groundHeight > 0 ? config.groundHeight : 1000;
    this.generateFood();
  }

  generateFood() {
    const currentFood = this.food.length;
    if (currentFood < this.config.foodCount) {
        const toAdd = this.config.foodCount - currentFood;
        for (let i = 0; i < toAdd; i++) {
            this.food.push({
                id: Math.random().toString(36).substr(2, 9),
                x: (Math.random() - 0.5) * 5000,
                y: (Math.random() * 2000) - 1000, 
                energy: FOOD_ENERGY,
                phase: Math.random() * Math.PI * 2
            });
        }
    }
  }

  createBot(genome: Genome, startX: number, startY: number): Xenobot {
    const particles: Particle[] = [];
    const springs: Spring[] = [];
    const particleMap = new Map<string, number>();

    const gridSize = genome.gridSize;
    const scale = this.config.gridScale;

    // Create particles
    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        const type = genome.genes[y][x];
        if (type !== CellType.EMPTY) {
          const px = startX + (x - gridSize / 2) * scale;
          const py = startY + (y - gridSize / 2) * scale;
          
          const p: Particle = {
            pos: { x: px, y: py },
            oldPos: { x: px, y: py },
            renderPos: { x: px, y: py },
            mass: 1.0,
            force: { x: 0, y: 0 },
            charge: type === CellType.NEURON ? 1.0 : 0.0,
            phase: Math.random() * Math.PI * 2,
            isFixed: false
          };
          
          particles.push(p);
          particleMap.set(`${x},${y}`, particles.length - 1);
        }
      }
    }

    // Create springs (edges)
    const connections = [[1, 0], [0, 1], [1, 1], [-1, 1]];
    
    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        const p1Idx = particleMap.get(`${x},${y}`);
        if (p1Idx === undefined) continue;

        const type1 = genome.genes[y][x];

        for (const [dx, dy] of connections) {
          const nx = x + dx;
          const ny = y + dy;
          const p2Idx = particleMap.get(`${nx},${ny}`);
          
          if (p2Idx !== undefined) {
            const type2 = genome.genes[ny][nx];
            const isMuscle = type1 === CellType.HEART || type2 === CellType.HEART;
            const dist = Math.sqrt(dx * dx + dy * dy) * scale;
            
            springs.push({
              p1: p1Idx,
              p2: p2Idx,
              restLength: dist,
              currentRestLength: dist,
              stiffness: isMuscle ? 0.8 : 0.95,
              isMuscle: isMuscle
            });
          }
        }
      }
    }

    // Center of mass
    const com = { x: startX, y: startY };

    return {
      id: Math.random().toString(36).substr(2, 9),
      genome,
      particles,
      springs,
      centerOfMass: com,
      startPosition: { x: startX, y: startY },
      isDead: false,
      totalCharge: 0,
      groupId: genome.color.includes('190') ? 0 : 1, 
      energy: INITIAL_YOLK_ENERGY,
      age: 0,
      heading: 0,
      irruption: 0,
      absorption: 0
    };
  }

  update(dt: number) {
    this.events = [];
    this.generateFood();

    const subStepDt = dt / SUB_STEPS;
    
    for (let s = 0; s < SUB_STEPS; s++) {
      this.updateBioelectricity(subStepDt);
      this.applyForces(subStepDt);
      
      for(let k=0; k<CONSTRAINT_ITERATIONS; k++) {
          this.solveConstraints();
      }
      
      this.integrate(subStepDt);
      this.checkCollisions();
    }

    this.updateBiologicalFunctions();
    this.cleanup();
  }

  updateBioelectricity(dt: number) {
    for (const bot of this.bots) {
      if (bot.isDead) continue;
      
      const freq = 3.0; // Hz
      let totalCharge = 0;
      for (const p of bot.particles) {
          p.phase += dt * freq;
          totalCharge += p.charge;
      }
      bot.totalCharge = totalCharge;
    }
  }

  applyForces(dt: number) {
    for (const bot of this.bots) {
      if (bot.isDead) continue;

      let comX = 0;
      let comY = 0;

      for (const p of bot.particles) {
        // Gravity
        p.force.y += this.config.gravity * p.mass * 50; 
        
        // Fluid Friction
        const vx = (p.pos.x - p.oldPos.x) / dt;
        const vy = (p.pos.y - p.oldPos.y) / dt;
        p.force.x -= vx * (1 - this.config.friction);
        p.force.y -= vy * (1 - this.config.friction);
        
        comX += p.pos.x;
        comY += p.pos.y;
      }

      if (bot.particles.length > 0) {
        bot.centerOfMass.x = comX / bot.particles.length;
        bot.centerOfMass.y = comY / bot.particles.length;
      }
    }
  }

  solveConstraints() {
    for (const bot of this.bots) {
      if (bot.isDead) continue;

      // 1. Spring Constraints
      for (const s of bot.springs) {
        const p1 = bot.particles[s.p1];
        const p2 = bot.particles[s.p2];
        
        let targetLen = s.restLength;
        
        if (s.isMuscle) {
           const phase = (p1.phase + p2.phase) / 2;
           const contraction = Math.sin(phase);
           if (contraction > 0) {
             targetLen = s.restLength * (1.0 - contraction * 0.2 * this.config.muscleStrength);
           }
        }
        
        const dx = p2.pos.x - p1.pos.x;
        const dy = p2.pos.y - p1.pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist === 0) continue;
        
        const diff = (dist - targetLen) / dist;
        const correction = diff * 0.5 * s.stiffness;
        
        const cx = dx * correction;
        const cy = dy * correction;
        
        if (!p1.isFixed) {
            p1.pos.x += cx;
            p1.pos.y += cy;
        }
        if (!p2.isFixed) {
            p2.pos.x -= cx;
            p2.pos.y -= cy;
        }
      }
      
      // 2. Volume Preservation (Simplified)
      for (let i = 0; i < bot.particles.length; i++) {
        for (let j = i + 1; j < bot.particles.length; j++) {
            const p1 = bot.particles[i];
            const p2 = bot.particles[j];
            const dx = p2.pos.x - p1.pos.x;
            const dy = p2.pos.y - p1.pos.y;
            const d2 = dx*dx + dy*dy;
            const minD = this.config.gridScale * 0.8; 
            
            if (d2 < minD*minD && d2 > 0.0001) {
                const dist = Math.sqrt(d2);
                const overlap = minD - dist;
                const fx = (dx / dist) * overlap * 0.05;
                const fy = (dy / dist) * overlap * 0.05;
                
                p1.pos.x -= fx;
                p1.pos.y -= fy;
                p2.pos.x += fx;
                p2.pos.y += fy;
            }
        }
      }
    }
  }

  integrate(dt: number) {
    for (const bot of this.bots) {
      if (bot.isDead) continue;

      for (const p of bot.particles) {
        if (p.isFixed) continue;

        const vx = (p.pos.x - p.oldPos.x);
        const vy = (p.pos.y - p.oldPos.y);

        p.oldPos.x = p.pos.x;
        p.oldPos.y = p.pos.y;

        p.pos.x += vx + p.force.x * dt * dt;
        p.pos.y += vy + p.force.y * dt * dt;
        
        p.force.x = 0;
        p.force.y = 0;
      }
    }
  }

  checkCollisions() {
    for (const bot of this.bots) {
      if (bot.isDead) continue;
      for (const p of bot.particles) {
        if (p.pos.y > this.groundY) {
             p.pos.y = this.groundY;
             const vx = p.pos.x - p.oldPos.x;
             p.oldPos.y = p.pos.y; 
             p.force.x -= vx * 1.0; // Ground Friction
        }
      }
    }
  }

  checkFoodConsumption(bot: Xenobot): number {
      let energyGained = 0;
      const com = bot.centerOfMass;
      for (let i = this.food.length - 1; i >= 0; i--) {
          const f = this.food[i];
          const dx = f.x - com.x;
          const dy = f.y - com.y;
          if (Math.abs(dx) < 100 && Math.abs(dy) < 100) {
             for (const p of bot.particles) {
                 const distSq = (p.pos.x - f.x)**2 + (p.pos.y - f.y)**2;
                 if (distSq < (FOOD_RADIUS + 10)**2) {
                     this.food.splice(i, 1);
                     energyGained += f.energy;
                     this.events.push('EAT');
                     break; 
                 }
             }
          }
      }
      return energyGained;
  }

  updateBiologicalFunctions() {
      for (const bot of this.bots) {
        if (bot.isDead) continue;

        bot.age++;
        
        const muscleCount = bot.genome.genes.flat().filter(c => c === CellType.HEART).length;
        bot.energy -= METABOLIC_DECAY * (1 + muscleCount * 0.1);

        const energyGained = this.checkFoodConsumption(bot);
        bot.energy += energyGained;

        bot.totalCharge = bot.particles.reduce((sum, p) => sum + p.charge, 0); 
        bot.irruption = Math.min(1.0, bot.totalCharge * 0.1);
        
        bot.absorption = Math.max(0, bot.absorption * 0.96);
        if (energyGained > 0) {
            bot.absorption = Math.min(1.0, bot.absorption + 0.6);
        }

        if (bot.energy > MITOSIS_THRESHOLD && bot.age > 800) {
             this.mitosis(bot);
        }

        if (bot.energy <= 0) {
            bot.isDead = true;
            this.events.push('DEATH');
        }
      }
  }
  
  mitosis(parent: Xenobot) {
      parent.energy /= 2;
      const childGenome = mutate(parent.genome);
      childGenome.generation = parent.genome.generation + 1;
      
      const child = this.createBot(childGenome, parent.centerOfMass.x + 50, parent.centerOfMass.y);
      child.energy = parent.energy; 
      child.groupId = parent.groupId + 2; 
      
      this.bots.push(child);
      this.events.push('MITOSIS');
  }

  cleanup() {
      this.bots = this.bots.filter(b => !b.isDead);
  }

  evolvePopulation(generation: number): boolean {
      const oldPop = this.bots.map(b => b.genome);
      for(const bot of this.bots) {
          const displacement = bot.centerOfMass.x - bot.startPosition.x;
          bot.genome.fitness = displacement;
      }
      
      const newGenomes = evolvePopulation(oldPop, generation, this.config.maxPopulationSize);
      
      if (newGenomes.length > 0) {
        this.bots = newGenomes.map(g => {
            let startX = 0;
            if (typeof g.originX === 'number' && !isNaN(g.originX)) {
                startX = g.originX + (Math.random() - 0.5) * 50; 
            } else {
               startX = (Math.random() - 0.5) * 2000;
            }
            return this.createBot(g, startX, 200);
        });
        return true;
      }
      return false;
  }

  smoothRenderPositions() {
      for(const bot of this.bots) {
          for(const p of bot.particles) {
              p.renderPos.x = p.pos.x;
              p.renderPos.y = p.pos.y;
          }
      }
  }
  
  getPopulationStats(generation: number): GeneticStats {
      let skin = 0, heart = 0, neuron = 0;
      this.bots.forEach(b => {
          b.genome.genes.flat().forEach(c => {
              if (c === CellType.SKIN) skin++;
              if (c === CellType.HEART) heart++;
              if (c === CellType.NEURON) neuron++;
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
}
