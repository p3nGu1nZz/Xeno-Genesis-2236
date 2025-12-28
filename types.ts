
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
  renderVel?: Point; // Velocity for visual smoothing
  mass: number;
  force: Point;
  charge: number; 
  isFixed?: boolean;
  phase: number; // Topological phase for metachronal rhythm
  gx?: number; // Grid X coordinate in genome
  gy?: number; // Grid Y coordinate in genome
  bodyId?: number; // Link to Matter.js Body ID
}

export interface Spring {
  p1: number; 
  p2: number; 
  restLength: number;
  currentRestLength: number; 
  stiffness: number;
  isMuscle: boolean; 
  phaseOffset?: number; 
  matterConstraintId?: number; // Link to Matter.js Constraint ID
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
  originY?: number;
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
  irruption: number; // Mental Causation: Magnitude of internal will exerted on matter
  absorption: number; // Conscious Experience: Magnitude of material events integrated into mind
  lastCollisionTime?: number;
  lastCollisionPoint?: Point;
  matterCompositeId?: number; // Link to Matter.js Composite
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
  maxBotSize: number; // Dynamic max size limit
  foodCount: number;
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
  researchState: ResearchState;
}

export interface GeneticStats {
  generation: number;
  skin: number;
  heart: number;
  neuron: number;
  total: number;
}

export type SimulationEventType = 'COLLISION' | 'EAT' | 'MITOSIS' | 'DEATH';

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

// --- Research / Game Types ---

export type UpgradeID = 
  | 'NUTRIENT_AGAR' 
  | 'SCAN_AMP_1' 
  | 'CHEMOSTAT_VAT'
  | 'FLUIDIC_SMOOTHING' 
  | 'GENOME_SEQUENCER' 
  | 'SCAN_AMP_2'
  | 'SCAN_AMP_3'
  | 'MITOCHONDRIAL_TUNING'
  | 'MOMBOT_LINK' 
  | 'POPULATION_EXPANSION_1'
  | 'POPULATION_EXPANSION_2'
  | 'CILIA_OVERCLOCK'
  | 'DRIFT_ANALYSIS'
  | 'AUTOCLAVE_PROTOCOL'
  | 'STRUCTURAL_FRAMEWORK_1'
  | 'STRUCTURAL_FRAMEWORK_2';

export type UpgradeCategory = 'BIOLOGY' | 'COLONY' | 'TECH';

export interface Upgrade {
  id: UpgradeID;
  name: string;
  description: string;
  cost: number;
  icon: string; // Lucide icon name mapping
  category: UpgradeCategory;
  effect?: (config: SimulationConfig) => Partial<SimulationConfig>;
}

export interface ResearchState {
  bioData: number;
  unlockedUpgrades: UpgradeID[];
  clickMultiplier: number;
  passiveMultiplier: number;
}

// --- Gamification Types ---

export type ToolMode = 'SCANNER' | 'INJECTOR' | 'MUTAGEN' | 'REAPER';

export interface FloatingText {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
  life: number; // 0 to 1
  velocity: number;
}

export interface GlobalEvent {
  id: string;
  name: string;
  description: string;
  duration: number; // ticks
  isActive: boolean;
  type: 'RADIATION' | 'ALGAL_BLOOM' | 'STAGNATION';
}
