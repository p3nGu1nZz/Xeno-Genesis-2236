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
  FOOD_RADIUS
} from '../constants';
import { evolvePopulation, mutate } from './geneticAlgorithm';

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

    for (let i = 0; i < needed; i++) {
      this.food.push({
        id: Math.random().toString(36).substr(2, 9),
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
    const scale = this.config.gridScale || 40;
    const size = genome.gridSize;

    const particleMap: number[][] = Array(size).fill(null).map(() => Array(size).fill(-1));

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (genome.genes[y][x] !== CellType.EMPTY) {
           const px = startX + (x - size/2) * scale;
           const py = startY + (y - size/2) * scale;
           
           particles.push({
             pos: { x: px, y: py },
             oldPos: { x: px, y: py },
             renderPos: { x: px, y: py },
             mass: 1.0,
             force: { x: 0, y: 0 },
             charge: 0,
             isFixed: false,
             phase: 0 
           });
           particleMap[y][x] = particles.length - 1;
        }
      }
    }

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const p1Idx = particleMap[y][x];
        if (p1Idx === -1) continue;

        const cellType = genome.genes[y][x];

        const neighbors = [
            { dx: 1, dy: 0, dist: 1 },
            { dx: 0, dy: 1, dist: 1 },
            { dx: 1, dy: 1, dist: Math.sqrt(2) },
            { dx: -1, dy: 1, dist: Math.sqrt(2) }
        ];

        neighbors.forEach(n => {
            const nx = x + n.dx;
            const ny = y + n.dy;
            
            if (nx >= 0 && nx < size && ny >= 0 && ny < size) {
                const p2Idx = particleMap[ny][nx];
                if (p2Idx !== -1) {
                    const neighborType = genome.genes[ny][nx];
                    
                    let stiffness = 0.8;
                    let isMuscle = false;

                    if (cellType === CellType.HEART || neighborType === CellType.HEART) {
                        isMuscle = true;
                        stiffness = 0.5; 
                    }
                    
                    if (cellType === CellType.NEURON || neighborType === CellType.NEURON) {
                        stiffness = 0.95;
                        isMuscle = false; 
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
        });
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
        id: Math.random().toString(36).substr(2, 9),
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
    
    this.bots.forEach(bot => {
        if (bot.isDead) return;

        bot.energy -= METABOLIC_DECAY;
        bot.age++;

        if (bot.energy <= 0) {
            bot.isDead = true;
            this.events.push('DEATH');
            return;
        }

        let cx = 0, cy = 0;
        let avgVx = 0, avgVy = 0;
        
        bot.particles.forEach(p => {
            cx += p.pos.x;
            cy += p.pos.y;
            avgVx += (p.pos.x - p.oldPos.x);
            avgVy += (p.pos.y - p.oldPos.y);
        });
        
        const pCount = bot.particles.length;
        if (pCount > 0) {
            cx /= pCount;
            cy /= pCount;
            avgVx /= pCount;
            avgVy /= pCount;
            bot.centerOfMass = { x: cx, y: cy };
            
            const velAngle = Math.atan2(avgVy, avgVx);
            const diff = velAngle - bot.heading;
            let d = diff;
            while (d <= -Math.PI) d += Math.PI*2;
            while (d > Math.PI) d -= Math.PI*2;
            
            bot.heading += d * 0.05; 
        }

        const time = Date.now() / 1000;
        const muscleFreq = 2.0 + (bot.genome.bioelectricMemory * 2.0);
        
        bot.springs.forEach(s => {
            if (s.isMuscle) {
               const contraction = Math.sin(time * muscleFreq + (s.phaseOffset || 0));
               const range = 0.2 * this.config.muscleStrength;
               s.currentRestLength = s.restLength * (1.0 + contraction * range);
            }
        });

        bot.particles.forEach(p => {
             p.force.x = 0;
             p.force.y = this.config.gravity * p.mass;

             const cilia = this.calculateCiliaForce(bot, p, time, avgVx, avgVy);
             p.force.x += cilia.cx;
             p.force.y += cilia.cy;
             
             p.force.x += (Math.random() - 0.5) * 0.1;
             p.force.y += (Math.random() - 0.5) * 0.1;

             p.charge *= this.config.bioelectricDecay;
             if (p.charge < 1.0) p.charge += 0.01; 
        });
        
        bot.totalCharge = bot.particles.reduce((sum, p) => sum + p.charge, 0);
        
        const speed = Math.sqrt(avgVx*avgVx + avgVy*avgVy);
        bot.irruption = Math.min(1.0, speed * 2.0);
    });

    this.bots.forEach(bot => {
        if (bot.isDead) return;
        bot.particles.forEach(p => {
            if (p.isFixed) return;
            
            const vx = (p.pos.x - p.oldPos.x) * this.config.friction;
            const vy = (p.pos.y - p.oldPos.y) * this.config.friction;
            
            p.oldPos.x = p.pos.x;
            p.oldPos.y = p.pos.y;
            
            p.pos.x += vx + p.force.x * dt * dt;
            p.pos.y += vy + p.force.y * dt * dt;
        });
    });

    for (let i = 0; i < CONSTRAINT_ITERATIONS; i++) {
        this.bots.forEach(bot => {
            if (bot.isDead) return;
            
            bot.springs.forEach(s => {
                const p1 = bot.particles[s.p1];
                const p2 = bot.particles[s.p2];
                
                const dx = p2.pos.x - p1.pos.x;
                const dy = p2.pos.y - p1.pos.y;
                const dist = Math.sqrt(dx*dx + dy*dy);
                
                if (dist === 0) return;

                const diff = (dist - s.currentRestLength) / dist;
                const move = diff * 0.5 * s.stiffness;
                
                const offX = dx * move;
                const offY = dy * move;
                
                if (!p1.isFixed) {
                    p1.pos.x += offX;
                    p1.pos.y += offY;
                }
                if (!p2.isFixed) {
                    p2.pos.x -= offX;
                    p2.pos.y -= offY;
                }
            });
        });
    }

    this.bots.forEach(bot => {
        if (bot.isDead) return;
        
        for (let i = this.food.length - 1; i >= 0; i--) {
            const f = this.food[i];
            const dx = bot.centerOfMass.x - f.x;
            const dy = bot.centerOfMass.y - f.y;
            const distSq = dx*dx + dy*dy;
            
            if (distSq < 3600) { 
                let eaten = false;
                for (const p of bot.particles) {
                    const pdx = p.pos.x - f.x;
                    const pdy = p.pos.y - f.y;
                    if (pdx*pdx + pdy*pdy < (FOOD_RADIUS + 5) * (FOOD_RADIUS + 5)) {
                        eaten = true;
                        break;
                    }
                }
                
                if (eaten) {
                    bot.energy += f.energy;
                    bot.absorption += 0.1;
                    this.food.splice(i, 1);
                    this.events.push('EAT');
                }
            }
        }
        
        bot.absorption = Math.max(0, bot.absorption - 0.001);
    });

    const newBots: Xenobot[] = [];
    
    this.bots.forEach(bot => {
        if (!bot.isDead && bot.energy > MITOSIS_THRESHOLD) {
            bot.energy /= 2;
            const childGenome = mutate(bot.genome);
            
            const offset = 60;
            const child = this.createBot(childGenome, bot.centerOfMass.x + offset, bot.centerOfMass.y + offset);
            
            child.groupId = bot.groupId + 1; 
            
            newBots.push(child);
            this.events.push('MITOSIS');
        }
    });

    this.bots.push(...newBots);
    
    if (this.food.length < this.config.foodCount * 0.8) {
        this.spawnFood();
    }
  }

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
      this.bots.forEach(b => {
          b.particles.forEach(p => {
              p.renderPos.x = p.pos.x;
              p.renderPos.y = p.pos.y;
          });
      });
  }
}