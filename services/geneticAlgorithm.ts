
import { Genome, CellType } from '../types';
import { GRID_SIZE } from '../constants';

const MUTATION_RATE = 0.2; 

// "Bilateral Polarity" Template
// Row 0 (Anterior): NEURON
// Row N-1 (Posterior): HEART
// Intermediate: SKIN
const BILATERAL_TEMPLATE: Record<string, CellType> = {};

// Initialize the bilateral map for reference (optional, used if we want to enforce via platonic pull)
for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
        const key = `${x},${y}`;
        if (y === 0) {
            BILATERAL_TEMPLATE[key] = CellType.NEURON;
        } else if (y === GRID_SIZE - 1) {
            BILATERAL_TEMPLATE[key] = CellType.HEART;
        } else {
            BILATERAL_TEMPLATE[key] = CellType.SKIN;
        }
    }
}

export function createRandomGenome(generation: number = 0, targetHue?: number): Genome {
  const genes: CellType[][] = [];
  
  // Enforce Bilateral Polarity Structure
  for (let y = 0; y < GRID_SIZE; y++) {
    const row: CellType[] = [];
    for (let x = 0; x < GRID_SIZE; x++) {
      if (y === 0) {
        // Anterior Edge -> Sensory/Control (Neurons)
        row.push(CellType.NEURON);
      } else if (y === GRID_SIZE - 1) {
        // Posterior Edge -> Propulsion (Heart)
        row.push(CellType.HEART);
      } else {
        // Intermediate -> Structural Chassis (Skin)
        row.push(CellType.SKIN);
      }
    }
    genes.push(row);
  }

  let h: number;
  if (targetHue !== undefined) {
      h = (targetHue + (Math.random() * 40 - 20)) % 360;
  } else {
      h = Math.random() * 360;
  }
  if (h < 0) h += 360;
  
  const color = `hsl(${h.toFixed(0)}, 70%, 60%)`;

  return {
    id: Math.random().toString(36).substr(2, 9),
    gridSize: GRID_SIZE,
    genes,
    fitness: 0,
    generation,
    color,
    bioelectricMemory: Math.random() // High variability in plasticity
  };
}

function crossover(parentA: Genome, parentB: Genome, generation: number): Genome {
  const newGenes: CellType[][] = [];
  const size = parentA.gridSize;

  for (let y = 0; y < size; y++) {
    const row: CellType[] = [];
    for (let x = 0; x < size; x++) {
      row.push(Math.random() > 0.5 ? parentA.genes[y][x] : parentB.genes[y][x]);
    }
    newGenes.push(row);
  }

  const color = Math.random() > 0.5 ? parentA.color : parentB.color;

  const posA = parentA.originX ?? 0;
  const posB = parentB.originX ?? 0;
  
  const dist = Math.abs(posA - posB);
  let originX = posA;
  
  if (dist < 300) {
      originX = (posA + posB) / 2;
  } else {
      originX = (color === parentA.color) ? posA : posB;
  }

  return {
    id: Math.random().toString(36).substr(2, 9),
    gridSize: size,
    genes: newGenes,
    fitness: 0,
    generation,
    color,
    bioelectricMemory: (parentA.bioelectricMemory + parentB.bioelectricMemory) / 2,
    originX
  };
}

function mutate(genome: Genome): Genome {
  const newGenes = genome.genes.map(row => [...row]);
  let mutated = false;
  
  // Mutation Logic with Bilateral Bias
  // We allow mutation, but we bias slightly towards maintaining the polarity
  
  // 1. Random Point Mutation
  for (let y = 0; y < genome.gridSize; y++) {
    for (let x = 0; x < genome.gridSize; x++) {
      if (Math.random() < 0.05) { // 5% chance per cell
        // Bias mutation based on row
        const rand = Math.random();
        if (y === 0) {
            // Anterior: Favor Neurons
            newGenes[y][x] = rand < 0.8 ? CellType.NEURON : CellType.SKIN;
        } else if (y === genome.gridSize - 1) {
            // Posterior: Favor Heart
            newGenes[y][x] = rand < 0.8 ? CellType.HEART : CellType.SKIN;
        } else {
            // Center: Mix
            const types = [CellType.EMPTY, CellType.SKIN, CellType.HEART];
            newGenes[y][x] = types[Math.floor(Math.random() * types.length)];
        }
        mutated = true;
      }
    }
  }

  let newMemory = genome.bioelectricMemory;
  if (Math.random() < 0.2) {
      newMemory += (Math.random() * 0.2 - 0.1);
      newMemory = Math.max(0.01, Math.min(1.0, newMemory));
      mutated = true;
  }

  return {
    ...genome,
    genes: newGenes,
    bioelectricMemory: newMemory,
    color: mutated ? adjustColor(genome.color) : genome.color
  };
}

function adjustColor(hsl: string): string {
    const match = hsl.match(/hsl\((\d+\.?\d*),\s*(\d+)%,\s*(\d+)%\)/);
    if (!match) return hsl;
    let h = parseFloat(match[1]);
    h = (h + (Math.random() * 20 - 10)) % 360; 
    if (h < 0) h += 360;
    return `hsl(${h.toFixed(0)}, ${match[2]}%, ${match[3]}%)`;
}

const isGroupA = (g: Genome) => {
    const match = g.color.match(/hsl\((\d+\.?\d*)/);
    if(!match) return false;
    const h = parseFloat(match[1]);
    return (h > 150 && h < 230);
};

export function evolvePopulation(population: Genome[], generation: number, maxPopulationSize: number): Genome[] {
  const poolA = population.filter(isGroupA);
  const poolB = population.filter(g => !isGroupA(g));

  const maxPerGroup = Math.floor(maxPopulationSize / 2);
  
  const evolveSubPool = (pool: Genome[], currentMax: number): Genome[] => {
      if (pool.length === 0) return [];
      
      const sorted = [...pool].sort((a, b) => b.fitness - a.fitness);
      
      const growthMultiplier = 1.0 + Math.random() * 0.8;
      const rngBonus = Math.floor(Math.random() * 4);
      
      let newSize = Math.floor(pool.length * growthMultiplier) + rngBonus;
      
      if (newSize <= pool.length && pool.length < currentMax) {
          newSize = pool.length + 1;
      }

      if (newSize < 4) newSize = 4;
      if (newSize > currentMax) newSize = currentMax;
      
      const nextGen = [sorted[0]];
      if (sorted.length > 1) nextGen.push(sorted[1]);
      
      while (nextGen.length < newSize) {
          const p1 = tournamentSelect(sorted);
          const p2 = tournamentSelect(sorted);
          let child = crossover(p1, p2, generation + 1);
          child = mutate(child);
          nextGen.push(child);
      }
      return nextGen;
  };

  const nextA = evolveSubPool(poolA, maxPerGroup);
  const nextB = evolveSubPool(poolB, maxPerGroup);

  return [...nextA, ...nextB];
}

function tournamentSelect(pool: Genome[]): Genome {
  const k = 4;
  let best = pool[Math.floor(Math.random() * pool.length)];
  for (let i = 0; i < k; i++) {
    const contender = pool[Math.floor(Math.random() * pool.length)];
    if (contender.fitness > best.fitness) {
      best = contender;
    }
  }
  return best;
}
