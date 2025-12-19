export enum CellType {
  EMPTY = 0,
  SKIN = 1,  
  HEART = 2, 
  NEURON = 3, 
}

export interface Point {
  x: number;
  y: number;
}

export interface CameraState {
  x: number;
  y: number;
  zoom: number;
}

export interface Particle {
  pos: Point;
  oldPos: Point;
  mass: number;
  force: Point;
  charge: number; 
  isFixed?: boolean;
}

export interface Spring {
  p1: number; 
  p2: number; 
  restLength: number;
  currentRestLength: number; 
  stiffness: number;
  isMuscle: boolean; 
  phaseOffset?: number; 
}

export interface Genome {
  id: string;
  gridSize: number;
  genes: CellType[][]; 
  fitness: number;
  generation: number;
  color: string; 
  bioelectricMemory: number; 
}

export interface Xenobot {
  id: string;
  genome: Genome;
  particles: Particle[];
  springs: Spring[];
  centerOfMass: Point;
  startPosition: Point;
  isDead: boolean;
  totalCharge: number; 
}

export interface SimulationConfig {
  populationSize: number; // Added
  gravity: number;
  friction: number;
  muscleStrength: number;
  muscleSpeed: number;
  groundHeight: number;
  gridScale: number;
  bioelectricDecay: number; 
  plasticity: number; 
}

export interface AnalysisResult {
  analysis: string;
  suggestion: string;
  biologicalContext: string;
}

export interface SaveData {
  config: SimulationConfig;
  population: Genome[];
  generation: number;
  timestamp: number;
}