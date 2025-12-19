import { SimulationConfig } from './types';

export const INITIAL_POPULATION_SIZE = 20; // Start small
export const MAX_POPULATION_CAP = 100; // Default limit
export const GRID_SIZE = 6; 
export const GENERATION_TIME = 600; 

export const DEFAULT_CONFIG: SimulationConfig = {
  populationSize: INITIAL_POPULATION_SIZE,
  maxPopulationSize: MAX_POPULATION_CAP,
  gravity: 0.15, 
  friction: 0.92, 
  muscleStrength: 0.25, 
  muscleSpeed: 0.1, 
  groundHeight: 1200, 
  gridScale: 50, 
  bioelectricDecay: 0.96,
  plasticity: 0.002, 
  syncRate: 0.2, // Default smoothing factor
  generationDuration: GENERATION_TIME,
};

export const COLORS = {
  HEART: '#ef4444', 
  NEURON: '#eab308', 
  EMPTY: 'transparent',
  SPRING_PASSIVE: 'rgba(255, 255, 255, 0.2)',
  SPRING_ACTIVE: 'rgba(239, 68, 68, 0.6)',
  BIO_FIELD: '#00f3ff', 
};

export const TIMESTEP = 1;
// Optimized: Reduced from 8 to 6 for better performance while maintaining stability
export const CONSTRAINT_ITERATIONS = 6;