import { PhysicsEngine } from './services/physicsEngine';
import { createRandomGenome, evolvePopulation } from './services/geneticAlgorithm';
import { SimulationConfig, Xenobot, Genome, WorkerMessage } from './types';
import { DEFAULT_CONFIG, INITIAL_POPULATION_SIZE, EVOLUTION_INTERVAL } from './constants';

// Internal State
let engine: PhysicsEngine | null = null;
let isRunning = false;
let timerId: any = null;
let lastTime = performance.now();
let accumulator = 0;
let simulationTime = 0; // Track total simulation time in ms
const FIXED_TIMESTEP = 16; // Target 60fps (approx 16.66ms)

let evolutionTimer = 0;
let generation = 1;
let population: Genome[] = [];
let bestGenome: Genome | null = null;

// Helper to find best genome
const updateBestGenome = () => {
  if (!engine) return;
  let maxFit = -Infinity;
  let leader: Xenobot | null = null;
  
  engine.bots.forEach(b => {
    if (b.centerOfMass.x > maxFit) {
      maxFit = b.centerOfMass.x;
      leader = b;
    }
  });
  
  if (leader) {
    bestGenome = leader.genome;
  }
};

const initSimulation = (config: SimulationConfig, startPop?: Genome[], startGen?: number) => {
  engine = new PhysicsEngine(config);
  
  if (startPop && startPop.length > 0) {
      population = startPop;
      generation = startGen || 1;
      
      // Ensure pop size matches config
      if (population.length < config.populationSize) {
         const needed = config.populationSize - population.length;
         const extras = Array(needed).fill(null).map(() => createRandomGenome(generation));
         population = [...population, ...extras];
      } else if (population.length > config.populationSize) {
         population = population.slice(0, config.populationSize);
      }
  } else {
      generation = 1;
      
      // Initialize with split groups. Respect the config.populationSize!
      const totalSize = Math.max(2, config.populationSize);
      const sizeA = Math.floor(totalSize / 2);
      const sizeB = totalSize - sizeA;
      
      const groupA = Array(sizeA).fill(null).map(() => createRandomGenome(generation, 190)); 
      const groupB = Array(sizeB).fill(null).map(() => createRandomGenome(generation, 340)); 
      
      population = [...groupA, ...groupB];
  }

  // Init Bots
  engine.bots = [];
  population.forEach(g => {
    let startX = 0;
    
    if (typeof g.originX === 'number' && !isNaN(g.originX)) {
         startX = g.originX + (Math.random() - 0.5) * 50; 
    } else {
       const match = g.color.match(/hsl\((\d+\.?\d*)/);
       const hue = match ? parseFloat(match[1]) : 0;
       const isGroupA = (hue > 150 && hue < 230);
       
       startX = isGroupA ? 0 : 1200; 
       startX += (Math.random() - 0.5) * 150; 
       g.originX = startX;
    }

    const bot = engine!.createBot(g, startX, 200 + Math.random() * 100);
    engine!.bots.push(bot);
  });
  
  evolutionTimer = 0;
  bestGenome = null;
  simulationTime = 0;
};

const evolveContinuous = () => {
    if (!engine) return;
    
    const groups = [0, 1];
    let evolutionOccurred = false;

    groups.forEach(groupId => {
        const groupBots = engine!.bots.filter(b => b.groupId === groupId);
        const targetGroupSize = Math.floor(engine!.config.populationSize / 2);
        
        if (groupBots.length === 0) {
            const newG = createRandomGenome(generation, groupId === 0 ? 190 : 340);
            const parentPos = groupId === 0 ? 0 : 1200;
            const bot = engine!.createBot(newG, parentPos, 200);
            engine!.addBot(bot);
            return;
        }

        // --- PROBABILISTIC REPRODUCTION ---
        // 0.1% chance per check (running every 1 second)
        if (Math.random() > 0.001) return;

        groupBots.sort((a, b) => b.centerOfMass.x - a.centerOfMass.x);
        
        const needGrowth = groupBots.length < targetGroupSize;
        
        if (!needGrowth) {
             const victim = groupBots[groupBots.length - 1];
             engine!.removeBot(victim.id);
        }

        const parent1 = groupBots[0];
        const parent2 = groupBots.length > 1 ? groupBots[1] : groupBots[0];
        
        const parents = [parent1.genome, parent2.genome];
        const nextGenParams = evolvePopulation(parents, generation, 10);
        const childGenome = nextGenParams[nextGenParams.length - 1];
        
        // Preserve positions by spawning child near parent and leaving everyone else alone
        const spawnX = parent1.centerOfMass.x - 50 - Math.random() * 50; 
        const spawnY = parent1.centerOfMass.y + (Math.random() - 0.5) * 50;
        
        childGenome.originX = spawnX; 

        const childBot = engine!.createBot(childGenome, spawnX, spawnY);
        engine!.addBot(childBot);
        
        evolutionOccurred = true;
    });

    if (evolutionOccurred) {
        generation++;
        population = engine.bots.map(b => b.genome);
    }
};

const loop = () => {
  if (!isRunning || !engine) return;

  const now = performance.now();
  let frameTime = now - lastTime;
  lastTime = now;

  // Clamp frameTime to avoid spiral of death (e.g. if tab was inactive)
  if (frameTime > 250) frameTime = 250;

  accumulator += frameTime;

  // Fixed Timestep Update Loop
  while (accumulator >= FIXED_TIMESTEP) {
      engine.update(simulationTime / 1000); // Pass time in seconds for muscle phases
      simulationTime += FIXED_TIMESTEP;
      
      updateBestGenome(); // Update stats each tick or just once per frame? Doing it here ensures accuracy.

      // Evolution Check
      evolutionTimer += 1;
      if (evolutionTimer >= EVOLUTION_INTERVAL) {
          evolveContinuous();
          evolutionTimer = 0;
      }
      
      accumulator -= FIXED_TIMESTEP;
  }
  
  // Apply smoothing once per frame for consistent visual output
  engine.smoothRenderPositions();

  // Send Data to Main Thread
  const payload = {
      bots: engine.bots,
      timeLeft: 0, 
      generation,
      bestGenome
  };

  self.postMessage({ type: 'TICK', payload });
  
  if (isRunning) {
      timerId = setTimeout(loop, 16); // Schedule next loop
  }
};

self.onmessage = (e: MessageEvent<WorkerMessage>) => {
  const { type, payload } = e.data;

  switch (type) {
    case 'INIT':
      initSimulation(payload.config, payload.population, payload.generation);
      break;

    case 'START':
      if (!isRunning) {
          isRunning = true;
          lastTime = performance.now();
          accumulator = 0;
          loop();
      }
      break;

    case 'STOP':
      isRunning = false;
      if (timerId) {
          clearTimeout(timerId);
          timerId = null;
      }
      break;

    case 'UPDATE_SETTINGS':
      if (engine) {
          const oldConfig = engine.config;
          const newConfig = payload as SimulationConfig;
          
          if (oldConfig.populationSize !== newConfig.populationSize || 
              oldConfig.gridScale !== newConfig.gridScale) {
              initSimulation(newConfig);
          } else {
              engine.config = newConfig;
              engine.groundY = newConfig.groundHeight;
          }
      }
      break;
      
    case 'LOAD_STATE':
       initSimulation(payload.config, payload.population, payload.generation);
       break;
  }
};