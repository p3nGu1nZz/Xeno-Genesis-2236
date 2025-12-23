
import { SimulationConfig } from './types';

export const INITIAL_POPULATION_SIZE = 2; 
export const MAX_POPULATION_CAP = 10000; 
export const GRID_SIZE = 6; 
export const EVOLUTION_INTERVAL = 3600; // 60 seconds at 60fps
export const DEFAULT_FOOD_COUNT = 500; // Increased from 50 to 500

export const DEFAULT_CONFIG: SimulationConfig = {
  populationSize: INITIAL_POPULATION_SIZE,
  maxPopulationSize: MAX_POPULATION_CAP,
  foodCount: DEFAULT_FOOD_COUNT,
  gravity: 0.0, // Disabled for Top-Down Orthogonal View
  friction: 0.96, // Reduced drag to allow more gliding/momentum
  muscleStrength: 0.45, // Increased strength for more vigorous movement
  muscleSpeed: 0.1, 
  groundHeight: 0, // Irrelevant in infinite top-down plane
  gridScale: 60, // Reduced from 100 to 60 for more coherent, manageable bot sizes
  bioelectricDecay: 0.98,
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

export const TIMESTEP = 0.8; 
export const CONSTRAINT_ITERATIONS = 8; 

// Biological Constants based on papers
export const CILIA_FORCE = 0.6; // Slight boost
export const METABOLIC_DECAY = 0.01; // Significantly reduced from 0.2 to 0.01 for longevity
export const INITIAL_YOLK_ENERGY = 5000; // Increased from 800 to 5000 for longer lifespan
export const MITOSIS_THRESHOLD = 3500; // Lowered from 25000 to allow reproduction
export const SURFACE_TENSION = 0.005; 
export const FOOD_ENERGY = 600; // Increased from 250 to make feeding meaningful
export const FOOD_RADIUS = 15;
export const BREAKING_THRESHOLD = 150.0; // Tripled to effectively disable accidental breaking
