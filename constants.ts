import { SimulationConfig } from './types';

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
  friction: 0.99, // High friction (0.99) per sub-step to prevent velocity explosion
  muscleStrength: 0.8, 
  muscleSpeed: 0.12, 
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
export const SUB_STEPS = 4; // Number of physics steps per render frame
export const TIMESTEP = 0.25; // Smaller timestep for stability (was 0.6)
export const CONSTRAINT_ITERATIONS = 4; // Lower iterations per sub-step is fine (total 16/frame)

// Biological Constants based on papers
export const CILIA_FORCE = 2.5; // Slightly reduced for sub-stepping accumulation
export const METABOLIC_DECAY = 0.01; 
export const INITIAL_YOLK_ENERGY = 3000; 
export const MITOSIS_THRESHOLD = 8000; 
export const SURFACE_TENSION = 0.005; 
export const FOOD_ENERGY = 500; 
export const FOOD_RADIUS = 15;
export const BREAKING_THRESHOLD = 150.0; 
export const COLLISION_RADIUS = 12.0;