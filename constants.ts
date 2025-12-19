
import { SimulationConfig } from './types';

export const INITIAL_POPULATION_SIZE = 10; 
export const MAX_POPULATION_CAP = 1000; 
export const GRID_SIZE = 6; 
export const EVOLUTION_INTERVAL = 60; 

// World Dimensions
export const WORLD_WIDTH = 12000; // Increased world size
export const WORLD_HEIGHT_LIMIT = -5000;
export const EDGE_BUFFER = 500; // Distance from wall to start feeling repulsion

export const DEFAULT_CONFIG: SimulationConfig = {
  populationSize: INITIAL_POPULATION_SIZE,
  maxPopulationSize: MAX_POPULATION_CAP,
  gravity: 0.15, 
  friction: 0.96, 
  muscleStrength: 0.25, 
  muscleSpeed: 0.1, 
  groundHeight: 1200, 
  gridScale: 48, 
  bioelectricDecay: 0.96,
  plasticity: 0.002, 
  syncRate: 0.3, 
  generationDuration: 0, 
  acousticFreq: 0, 
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

// Biological Constants based on papers
export const CILIA_FORCE = 0.6; 
export const METABOLIC_DECAY = 0.05; 
export const INITIAL_YOLK_ENERGY = 1000; 
export const SURFACE_TENSION = 0.005; 
