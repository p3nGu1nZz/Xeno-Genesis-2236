import { Genome, CellType } from '../types';
import { GRID_SIZE } from '../constants';

const MUTATION_RATE = 0.2; 

// "Nervous Ring" Topology Definition
// Central 2x2 Core: NEURON
// Surrounding Ring: Alternating HEART / SKIN
const PLATONIC_IDEAL_MAP: Record<string, CellType> = {};

// Initialize the ideal map
for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
        const key = `${x},${y}`;
        // Center 2x2 (Indices 2,3 for GRID_SIZE 6)
        if (x >= 2 && x <= 3 && y >= 2 && y <= 3) {
            PLATONIC_IDEAL_MAP[key] = CellType.NEURON;
        }
        // Ring 1 (Indices 1 to 4)
        else if (x >= 1 && x <= 4 && y >= 1 && y <= 4) {
            // Alternating pattern for the ring
            if ((x + y) % 2 === 0) {
                PLATONIC_IDEAL_MAP[key] = CellType.HEART;
            } else {
                PLATONIC_IDEAL_MAP[key] = CellType.SKIN;
            }
        } 
        // Outer shell
        else {
            PLATONIC_IDEAL_MAP[key] = CellType.EMPTY;
        }
    }
}

export function createRandomGenome(generation: number = 0, targetHue?: number): Genome {
  // 20% Chance to spawn a "Prophet" bot that adheres to the Nervous Ring topology
  // This helps seed the population with the desired trait if extinction occurs.
  if (Math.random() < 0.2) {
      return createNervousRingGenome(generation, targetHue);
  }

  const genes: CellType[][] = [];
  for (let y = 0; y < GRID_SIZE; y++) {
    const row: CellType[] = [];
    for (let x = 0; x < GRID_SIZE; x++) {
      const rand = Math.random();
      if (rand < 0.5) row.push(CellType.EMPTY);
      else if (rand < 0.7) row.push(CellType.SKIN);
      else if (rand < 0.9) row.push(CellType.HEART);
      else row.push(CellType.NEURON); 
    }
    genes.push(row);
  }
  
  // Ensure center has some structure so it's not empty
  genes[Math.floor(GRID_SIZE/2)][Math.floor(GRID_SIZE/2)] = CellType.SKIN;

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
    bioelectricMemory: Math.random()
  };
}

function createNervousRingGenome(generation: number, targetHue?: number): Genome {
    const genes: CellType[][] = [];
    for (let y = 0; y < GRID_SIZE; y++) {
        const row: CellType[] = [];
        for (let x = 0; x < GRID_SIZE; x++) {
            row.push(PLATONIC_IDEAL_MAP[`${x},${y}`] || CellType.EMPTY);
        }
        genes.push(row);
    }

    let h: number;
    if (targetHue !== undefined) {
        h = (targetHue + (Math.random() * 20 - 10)) % 360;
    } else {
        h = Math.random() * 360;
    }
    if (h < 0) h += 360;

    return {
        id: "PLATONIC-" + Math.random().toString(36).substr(2, 6),
        gridSize: GRID_SIZE,
        genes,
        fitness: 0,
        generation,
        color: `hsl(${h.toFixed(0)}, 80%, 50%)`, // Slightly brighter to indicate special status
        bioelectricMemory: 0.8 // High plasticity to adapt quickly
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
  
  // 1. Structural Growth / Decay
  if (Math.random() < 0.3) {
    for (let y = 1; y < genome.gridSize - 1; y++) {
      for (let x = 1; x < genome.gridSize - 1; x++) {
        if (newGenes[y][x] === CellType.EMPTY && Math.random() < 0.1) {
            const neighbors = [newGenes[y+1][x], newGenes[y-1][x], newGenes[y][x+1], newGenes[y][x-1]];
            if (neighbors.some(n => n !== CellType.EMPTY)) {
                newGenes[y][x] = Math.random() > 0.5 ? CellType.SKIN : CellType.NEURON;
                mutated = true;
            }
        }
      }
    }
  }

  // 2. Platonic Pull (The bias towards Nervous Ring)
  // Small chance for any cell to spontaneously align with the Platonic Ideal
  if (Math.random() < 0.4) { // 40% chance that a mutation event includes a platonic shift
      const x = Math.floor(Math.random() * genome.gridSize);
      const y = Math.floor(Math.random() * genome.gridSize);
      const idealType = PLATONIC_IDEAL_MAP[`${x},${y}`];
      
      if (idealType !== undefined && newGenes[y][x] !== idealType) {
          // 10% chance to flip to ideal if selected
          if (Math.random() < 0.1) {
              newGenes[y][x] = idealType;
              mutated = true;
          }
      }
  }

  // 3. Random Noise Mutation
  for (let y = 0; y < genome.gridSize; y++) {
    for (let x = 0; x < genome.gridSize; x++) {
      if (Math.random() < 0.05) {
        const types = [CellType.EMPTY, CellType.SKIN, CellType.HEART, CellType.NEURON];
        newGenes[y][x] = types[Math.floor(Math.random() * types.length)];
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
      
      // Variable growth
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