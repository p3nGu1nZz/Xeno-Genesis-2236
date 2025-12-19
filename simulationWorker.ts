import { PhysicsEngine } from './services/physicsEngine';
import { createRandomGenome, evolvePopulation } from './services/geneticAlgorithm';
import { SimulationConfig, Xenobot, Genome, WorkerMessage } from './types';
import { DEFAULT_CONFIG, INITIAL_POPULATION_SIZE } from './constants';

// Internal State
let engine: PhysicsEngine | null = null;
let isRunning = false;
let timerId: any = null;
let lastTime = performance.now();
let timeLeft = 0;
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
  
  timeLeft = config.generationDuration || 1000;
  bestGenome = null;
};

const evolve = () => {
  if (!engine) return;

  // 1. Evaluate Fitness
  const currentBots = engine.bots;
  const evaluatedGenomes = population.map(genome => {
    const bot = currentBots.find(b => b.genome.id === genome.id);
    let fitness = 0;
    let originX = genome.originX || 0;
    
    if (bot) {
        fitness = engine!.evaluateFitness(bot);
        originX = bot.centerOfMass.x;
    }
    return { ...genome, fitness, originX };
  });

  // 2. Sort & Pick Best
  const sorted = [...evaluatedGenomes].sort((a, b) => b.fitness - a.fitness);
  bestGenome = sorted[0];

  // 3. Evolve
  const nextGen = evolvePopulation(evaluatedGenomes, generation, engine.config.maxPopulationSize);
  population = nextGen;
  generation++;

  // 4. Rebuild Physics World
  engine.bots = [];
  nextGen.forEach(g => {
    let startX = g.originX || 0;
    startX += (Math.random() - 0.5) * 50;

    const bot = engine!.createBot(g, startX, 200 + Math.random() * 100);
    engine!.bots.push(bot);
  });
  
  // 5. Reset Timer
  timeLeft = engine.config.generationDuration || 1000;
};

const loop = () => {
  if (!isRunning || !engine) return;

  const now = performance.now();
  // const dt = (now - lastTime) / 1000;
  lastTime = now;

  // Update Physics
  engine.update(now / 1000);

  // Update Best Genome Tracking
  updateBestGenome();

  // Handle Training Timer
  timeLeft -= 1;
  if (timeLeft <= 0) {
      evolve();
  }

  // Send Data to Main Thread
  const payload = {
      bots: engine.bots,
      timeLeft,
      generation,
      bestGenome
  };

  self.postMessage({ type: 'TICK', payload });
};

self.onmessage = (e: MessageEvent<WorkerMessage>) => {
  const { type, payload } = e.data;

  switch (type) {
    case 'INIT':
      initSimulation(payload.config, payload.population, payload.generation);
      break;

    case 'START':
      isRunning = true;
      lastTime = performance.now();
      if (!timerId) {
          timerId = setInterval(loop, 16); 
      }
      break;

    case 'STOP':
      isRunning = false;
      if (timerId) {
          clearInterval(timerId);
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
              if (timeLeft > newConfig.generationDuration) {
                  timeLeft = newConfig.generationDuration;
              }
          }
      }
      break;
      
    case 'LOAD_STATE':
       initSimulation(payload.config, payload.population, payload.generation);
       break;
  }
};