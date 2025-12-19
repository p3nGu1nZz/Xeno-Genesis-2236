import { PhysicsEngine } from './services/physicsEngine';
import { createRandomGenome, evolvePopulation } from './services/geneticAlgorithm';
import { SimulationConfig, Xenobot, Genome, WorkerMessage } from './types';
import { DEFAULT_CONFIG } from './constants';

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
      population = Array(config.populationSize).fill(null).map(() => createRandomGenome(1));
  }

  // Init Bots
  engine.bots = [];
  population.forEach(g => {
    const bot = engine!.createBot(g, 100, 200);
    engine!.bots.push(bot);
  });
  
  timeLeft = config.generationDuration || 600;
  bestGenome = null;
};

const evolve = () => {
  if (!engine) return;

  // 1. Evaluate Fitness
  const currentBots = engine.bots;
  const evaluatedGenomes = population.map(genome => {
    const bot = currentBots.find(b => b.genome.id === genome.id);
    const fitness = bot ? engine!.evaluateFitness(bot) : 0;
    return { ...genome, fitness };
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
    const bot = engine!.createBot(g, 100, 200);
    engine!.bots.push(bot);
  });
  
  // 5. Reset Timer
  timeLeft = engine.config.generationDuration || 600;
};

const loop = () => {
  if (!isRunning || !engine) return;

  // We run a fixed timestep for consistency, but we calculate delta for smooth wall-clock mapping if needed.
  // Currently PhysicsEngine.update uses a fixed constant TIMESTEP, so we just call it once per tick.
  const now = performance.now();
  // const dt = (now - lastTime) / 1000;
  lastTime = now;

  // Update Physics
  // We can perform multiple sub-steps here if we want faster simulation
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
          timerId = setInterval(loop, 16); // ~60 FPS Target
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
          // If critical physics params change, we might need full re-init, 
          // but for things like gravity/friction we can just update config.
          // For simplicity, we re-init if grid/pop changes, or update inplace otherwise.
          const oldConfig = engine.config;
          const newConfig = payload as SimulationConfig;
          
          if (oldConfig.populationSize !== newConfig.populationSize || 
              oldConfig.gridScale !== newConfig.gridScale) {
              initSimulation(newConfig);
          } else {
              engine.config = newConfig;
              engine.groundY = newConfig.groundHeight;
              // Update duration if changed
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