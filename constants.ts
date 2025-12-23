
import { SimulationConfig } from './types';

export const INITIAL_POPULATION_SIZE = 10; 
export const MAX_POPULATION_CAP = 500; 
export const GRID_SIZE = 6; 
export const EVOLUTION_INTERVAL = 60; 

export const DEFAULT_CONFIG: SimulationConfig = {
  populationSize: INITIAL_POPULATION_SIZE,
  maxPopulationSize: MAX_POPULATION_CAP,
  gravity: 0.15, 
  friction: 0.96, // Reduced drag (was 0.92) to allow more gliding/momentum
  muscleStrength: 0.25, 
  muscleSpeed: 0.1, 
  groundHeight: 1200, 
  gridScale: 48, 
  bioelectricDecay: 0.96,
  plasticity: 0.002, 
  syncRate: 0.3, // Increased from 0.2 for snappier visual response to physics
  generationDuration: 0, 
  acousticFreq: 0, // Hz
};

export const COLORS = {
  HEART: '#ef4444', 
  NEURON: '#eab308', 
  EMPTY: 'transparent',
  SPRING_PASSIVE: 'rgba(255, 255, 255, 0.2)',
  SPRING_ACTIVE: 'rgba(239, 68, 68, 0.6)',
  BIO_FIELD: '#00f3ff', 
  FOOD: '#39ff14',
};

export const TIMESTEP = 0.8; // Reduced from 1.0 for better stability
export const CONSTRAINT_ITERATIONS = 6;

// Biological Constants based on papers
export const CILIA_FORCE = 0.4; // Reduced from 0.6 to prevent explosion
export const METABOLIC_DECAY = 0.08; // Increased slightly to make food necessary
export const INITIAL_YOLK_ENERGY = 1200; 
export const SURFACE_TENSION = 0.005; 
export const FOOD_COUNT = 40;
export const FOOD_ENERGY = 600;
export const FOOD_RADIUS = 15;
