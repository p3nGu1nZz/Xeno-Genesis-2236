import { SimulationConfig } from './types';

export const INITIAL_POPULATION_SIZE = 10; // Explicitly 5 bots per group (2 groups)
export const MAX_POPULATION_CAP = 500; // Updated to 500 per user request
export const GRID_SIZE = 6; 
export const EVOLUTION_INTERVAL = 300; // Ticks between continuous evolution steps (approx 5 seconds)

export const DEFAULT_CONFIG: SimulationConfig = {
  populationSize: INITIAL_POPULATION_SIZE,
  maxPopulationSize: MAX_POPULATION_CAP,
  gravity: 0.15, 
  friction: 0.92, 
  muscleStrength: 0.25, 
  muscleSpeed: 0.1, 
  groundHeight: 1200, 
  gridScale: 48, // Updated to 48px per user request
  bioelectricDecay: 0.96,
  plasticity: 0.002, 
  syncRate: 0.2, 
  generationDuration: 0, // Unused in continuous mode
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
export const CONSTRAINT_ITERATIONS = 6;