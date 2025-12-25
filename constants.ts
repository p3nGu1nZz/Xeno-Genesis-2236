
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
  friction: 0.92, // Increased Drag (Lower value = more resistance)
  muscleStrength: 0.7, 
  muscleSpeed: 0.015, // Slower, more organic heartbeat
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
// STABILITY FIX: High precision, lower time delta
export const SUB_STEPS = 8; 
export const TIMESTEP = 0.12; 
export const CONSTRAINT_ITERATIONS = 3; 

// Biological Constants based on papers
export const CILIA_FORCE = 1.2; // Reduced propulsion for slower movement
export const METABOLIC_DECAY = 0.01; 
export const INITIAL_YOLK_ENERGY = 200; // Low start so growth bar is at ~5% initially
export const GROWTH_COST = 3000; // Higher cost so bar fills slowly
export const MAX_BOT_SIZE = 32; // Increased to ensure initial bots (avg 18 nodes) can grow
export const MITOSIS_THRESHOLD = 6000; // Threshold for colony splitting
export const SURFACE_TENSION = 0.005; 
export const FOOD_ENERGY = 150; // Small increment per food
export const FOOD_RADIUS = 12;
export const BREAKING_THRESHOLD = 150.0; 
export const COLLISION_RADIUS = 12.0;

// --- GAMEPLAY CONSTANTS ---

export const BD_REWARD = {
    CLICK_BOT: 1, // Base Manual Scan Value (Starts at 1)
    CLICK_FOOD: 2, // Low active income
    PASSIVE_EAT: 2,
    PASSIVE_MITOSIS: 50,
    // Per Node, Per Frame.
    // 60 frames * 0.002 = 0.12 BD per second per node.
    // A 10-node bot generates 1.2 BD/sec.
    NODE_SURVIVAL_TICK: 0.002 
};

export const TOOL_COSTS = {
    SCANNER: 0,
    INJECTOR: 25, // Cheaper to encourage feeding
    MUTAGEN: 500, // Expensive to make it impactful
    REAPER: 0 
};

export const TOOL_COLORS = {
    SCANNER: '#00f3ff', // Cyan
    INJECTOR: '#39ff14', // Green
    MUTAGEN: '#eab308', // Yellow
    REAPER: '#ef4444', // Red
};

export const UPGRADES: Upgrade[] = [
    {
        id: 'SCAN_AMP_1',
        name: 'Optical Amplifier V1',
        description: 'Doubles Bio-Data gain from manual scanning (2x Multiplier).',
        cost: 100, // Accessible early
        icon: 'ScanEye'
    },
    {
        id: 'NUTRIENT_AGAR',
        name: 'Nutrient Rich Agar',
        description: 'Increases food spawn density by 50%.',
        cost: 250,
        icon: 'Leaf',
        effect: (c) => ({ foodCount: Math.min(10000, c.foodCount * 1.5) })
    },
    {
        id: 'SCAN_AMP_2',
        name: 'Optical Amplifier V2',
        description: 'Doubles scanning efficiency again (4x Multiplier).',
        cost: 600,
        icon: 'Zap'
    },
    {
        id: 'CHEMOSTAT_VAT',
        name: 'Chemostat Bioreactor',
        description: 'Increases passive Bio-Data generation from nodes by 100%.',
        cost: 1200,
        icon: 'FlaskConical'
    },
    {
        id: 'FLUIDIC_SMOOTHING',
        name: 'Fluidic Smoothing',
        description: 'Reduces medium viscosity, allowing 20% faster movement.',
        cost: 2000,
        icon: 'Wind',
        effect: (c) => ({ friction: 0.96 }) 
    },
    {
        id: 'SCAN_AMP_3',
        name: 'Quantum Interferometry',
        description: 'Doubles scanning efficiency again (8x Multiplier).',
        cost: 3500,
        icon: 'Zap'
    },
    {
        id: 'GENOME_SEQUENCER',
        name: 'Genome Sequencer',
        description: 'Unlocks the Genome Database panel to view topology.',
        cost: 5000,
        icon: 'Dna'
    },
    {
        id: 'POPULATION_EXPANSION_1',
        name: 'Bioreactor v2.0',
        description: 'Increases max population cap to 50.',
        cost: 8000,
        icon: 'Users',
        effect: (c) => ({ populationSize: 50 })
    },
    {
        id: 'MITOCHONDRIAL_TUNING',
        name: 'Mitochondrial Tuning',
        description: 'Doubles passive generation again (300% Gain).',
        cost: 15000,
        icon: 'Activity'
    },
    {
        id: 'DRIFT_ANALYSIS',
        name: 'Drift Analytics',
        description: 'Unlocks the Genetic Drift historical graph.',
        cost: 25000,
        icon: 'TrendingUp'
    },
    {
        id: 'MOMBOT_LINK',
        name: 'MomBot Neural Link',
        description: 'Establish connection with the MomBot AI Controller.',
        cost: 50000,
        icon: 'Bot'
    }
];
