
import { SimulationConfig } from './types';

export const INITIAL_POPULATION_SIZE = 10; 
export const MAX_POPULATION_CAP = 1000; 
export const GRID_SIZE = 6; 
export const EVOLUTION_INTERVAL = 3600; // 60 seconds at 60fps

export const DEFAULT_CONFIG: SimulationConfig = {
  populationSize: INITIAL_POPULATION_SIZE,
  maxPopulationSize: MAX_POPULATION_CAP,
  gravity: 0.15, 
  friction: 0.96, // Reduced drag to allow more gliding/momentum
  muscleStrength: 0.35, // Increased strength
  muscleSpeed: 0.1, 
  groundHeight: 1200, 
  gridScale: 85, // Increased from 65 to 85 for wider node spacing
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
export const CILIA_FORCE = 0.5; 
export const METABOLIC_DECAY = 0.08; 
export const INITIAL_YOLK_ENERGY = 1200; 
export const MITOSIS_THRESHOLD = 2000; // Energy required to trigger deliberate splitting
export const SURFACE_TENSION = 0.005; 
export const FOOD_COUNT = 40;
export const FOOD_ENERGY = 600;
export const FOOD_RADIUS = 15;
