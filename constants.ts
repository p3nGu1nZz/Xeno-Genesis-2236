
import { SimulationConfig, Upgrade } from './types';

export const INITIAL_POPULATION_SIZE = 2; 
export const MAX_POPULATION_CAP = 10000; 
export const GRID_SIZE = 6; 
export const EVOLUTION_INTERVAL = 3600; // 60 seconds at 60fps
export const DEFAULT_FOOD_COUNT = 4000; 

export const DEFAULT_CONFIG: SimulationConfig = {
  populationSize: INITIAL_POPULATION_SIZE,
  maxPopulationSize: MAX_POPULATION_CAP,
  foodCount: DEFAULT_FOOD_COUNT,
  gravity: 0.0, 
  friction: 0.98, // Increased friction for stability with lower sub-steps
  muscleStrength: 0.7, // Slightly reduced to prevent violent pulsing
  muscleSpeed: 0.02, // Slower, more organic beat
  groundHeight: 0, 
  gridScale: 60, 
  bioelectricDecay: 0.999, 
  plasticity: 0.0005, 
  syncRate: 0.4, 
  generationDuration: 0, 
};

export const COLORS = {
  HEART: '#ef4444', 
  NEURON: '#eab308', 
  EMPTY: 'transparent',
  SPRING_PASSIVE: 'rgba(255, 255, 255, 0.4)',
  SPRING_ACTIVE: 'rgba(239, 68, 68, 0.8)',
  BIO_FIELD: '#00f3ff', 
  FOOD: '#39ff14',
};

// Sub-stepping configuration
export const SUB_STEPS = 4; // Optimized: Reduced from 6 to 4 for performance
export const TIMESTEP = 0.2; // Slightly higher dt to compensate for fewer steps
export const CONSTRAINT_ITERATIONS = 3; 

// Biological Constants based on papers
export const CILIA_FORCE = 2.0; 
export const METABOLIC_DECAY = 0.01; 
export const INITIAL_YOLK_ENERGY = 3000; 
export const GROWTH_COST = 2000; // Cost to add one node to body
export const MAX_BOT_SIZE = 16; // Max nodes a single bot can grow to
export const MITOSIS_THRESHOLD = 8000; // Cost to reproduce a new child
export const SURFACE_TENSION = 0.005; 
export const FOOD_ENERGY = 500; 
export const FOOD_RADIUS = 15;
export const BREAKING_THRESHOLD = 150.0; 
export const COLLISION_RADIUS = 12.0;

// --- GAMEPLAY CONSTANTS ---

export const BD_REWARD = {
    CLICK_BOT: 15,
    CLICK_FOOD: 2,
    PASSIVE_EAT: 5,
    PASSIVE_MITOSIS: 150,
    SURVIVAL_TICK: 0.1
};

export const UPGRADES: Upgrade[] = [
    {
        id: 'NUTRIENT_AGAR',
        name: 'Nutrient Rich Agar',
        description: 'Increases food spawn density by 50%.',
        cost: 250,
        icon: 'Leaf',
        effect: (c) => ({ foodCount: Math.min(10000, c.foodCount * 1.5) })
    },
    {
        id: 'FLUIDIC_SMOOTHING',
        name: 'Fluidic Smoothing',
        description: 'Reduces medium viscosity, allowing 20% faster movement.',
        cost: 600,
        icon: 'Wind',
        effect: (c) => ({ friction: 0.99 }) // Less friction
    },
    {
        id: 'GENOME_SEQUENCER',
        name: 'Genome Sequencer',
        description: 'Unlocks the Genome Database panel to view topology.',
        cost: 1200,
        icon: 'Dna'
    },
    {
        id: 'POPULATION_EXPANSION_1',
        name: 'Bioreactor v2.0',
        description: 'Increases max population cap to 50.',
        cost: 2500,
        icon: 'Users',
        effect: (c) => ({ populationSize: 50 })
    },
    {
        id: 'DRIFT_ANALYSIS',
        name: 'Drift Analytics',
        description: 'Unlocks the Genetic Drift historical graph.',
        cost: 3500,
        icon: 'TrendingUp'
    },
    {
        id: 'MOMBOT_LINK',
        name: 'MomBot Neural Link',
        description: 'Establish connection with the MomBot AI Controller.',
        cost: 10000,
        icon: 'Bot'
    }
];
