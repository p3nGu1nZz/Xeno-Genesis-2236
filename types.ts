
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
  renderPos: Point; 
  mass: number;
  force: Point;
  charge: number; 
  isFixed?: boolean;
  phase: number; // Topological phase for metachronal rhythm
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
  originX?: number; 
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
  groupId: number; // 0 for Group A, 1 for Group B
  energy: number; // Metabolic reserve (Yolk platelets)
  age: number;
  heading: number; // Current movement direction angle
}

export interface Food {
  id: string;
  x: number;
  y: number;
  energy: number;
  phase: number; // For visual pulsing
}

export interface SimulationConfig {
  populationSize: number; 
  maxPopulationSize: number; 
  gravity: number;
  friction: number;
  muscleStrength: number;
  muscleSpeed: number;
  groundHeight: number;
  gridScale: number;
  bioelectricDecay: number; 
  plasticity: number; 
  syncRate: number; 
  generationDuration: number; 
  acousticFreq: number; // 0 = Off, 300 = Linearizing Stimulus
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

// --- Worker Types ---

export type WorkerMessageType = 'INIT' | 'START' | 'STOP' | 'UPDATE_SETTINGS' | 'TICK' | 'LOAD_STATE';

export interface WorkerMessage {
  type: WorkerMessageType;
  payload?: any;
}

export interface TickPayload {
  bots: Xenobot[];
  timeLeft: number;
  generation: number;
  bestGenome: Genome | null;
}
