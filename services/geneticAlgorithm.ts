import { Genome, CellType } from '../types';
import { GRID_SIZE } from '../constants';

const MUTATION_RATE = 0.2; // Higher rate for dynamic evolution

export function createRandomGenome(generation: number = 0): Genome {
  const genes: CellType[][] = [];
  for (let y = 0; y < GRID_SIZE; y++) {
    const row: CellType[] = [];
    for (let x = 0; x < GRID_SIZE; x++) {
      const rand = Math.random();
      if (rand < 0.5) row.push(CellType.EMPTY);
      else if (rand < 0.7) row.push(CellType.SKIN);
      else if (rand < 0.9) row.push(CellType.HEART);
      else row.push(CellType.NEURON); // Rare conductive cells
    }
    genes.push(row);
  }
  
  // Ensure center is solid
  genes[Math.floor(GRID_SIZE/2)][Math.floor(GRID_SIZE/2)] = CellType.SKIN;

  return {
    id: Math.random().toString(36).substr(2, 9),
    gridSize: GRID_SIZE,
    genes,
    fitness: 0,
    generation,
    color: `hsl(${Math.random() * 360}, 70%, 60%)`,
    bioelectricMemory: Math.random()
  };
}

function crossover(parentA: Genome, parentB: Genome, generation: number): Genome {
  const newGenes: CellType[][] = [];
  const size = parentA.gridSize;

  for (let y = 0; y < size; y++) {
    const row: CellType[] = [];
    for (let x = 0; x < size; x++) {
      // Inherit cell state from one parent or other
      row.push(Math.random() > 0.5 ? parentA.genes[y][x] : parentB.genes[y][x]);
    }
    newGenes.push(row);
  }

  return {
    id: Math.random().toString(36).substr(2, 9),
    gridSize: size,
    genes: newGenes,
    fitness: 0,
    generation,
    color: Math.random() > 0.5 ? parentA.color : parentB.color,
    bioelectricMemory: (parentA.bioelectricMemory + parentB.bioelectricMemory) / 2
  };
}

function mutate(genome: Genome): Genome {
  const newGenes = genome.genes.map(row => [...row]);
  let mutated = false;

  // Topological Mutation (NEAT-style intuition)
  // Instead of just flipping types, we might "grow" or "prune"
  // Grow: Find an empty spot next to a cell and fill it
  // Prune: Remove an exposed cell
  
  if (Math.random() < 0.3) {
    // Structural growth
    for (let y = 1; y < genome.gridSize - 1; y++) {
      for (let x = 1; x < genome.gridSize - 1; x++) {
        if (newGenes[y][x] === CellType.EMPTY && Math.random() < 0.1) {
            // Check neighbors
            const neighbors = [newGenes[y+1][x], newGenes[y-1][x], newGenes[y][x+1], newGenes[y][x-1]];
            if (neighbors.some(n => n !== CellType.EMPTY)) {
                newGenes[y][x] = Math.random() > 0.5 ? CellType.SKIN : CellType.NEURON;
                mutated = true;
            }
        }
      }
    }
  }

  // Standard Mutation
  for (let y = 0; y < genome.gridSize; y++) {
    for (let x = 0; x < genome.gridSize; x++) {
      if (Math.random() < 0.05) {
        const types = [CellType.EMPTY, CellType.SKIN, CellType.HEART, CellType.NEURON];
        newGenes[y][x] = types[Math.floor(Math.random() * types.length)];
        mutated = true;
      }
    }
  }

  // Mutate Bioelectric Memory
  let newMemory = genome.bioelectricMemory;
  if (Math.random() < 0.2) {
      // Drift the memory value
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
    h = (h + (Math.random() * 40 - 20)) % 360;
    if (h < 0) h += 360;
    return `hsl(${h.toFixed(0)}, ${match[2]}%, ${match[3]}%)`;
}

export function evolvePopulation(population: Genome[], generation: number): Genome[] {
  const sorted = [...population].sort((a, b) => b.fitness - a.fitness);
  const nextGen = [sorted[0], sorted[1]]; // Elitism

  while (nextGen.length < population.length) {
    const p1 = tournamentSelect(sorted);
    const p2 = tournamentSelect(sorted);
    let child = crossover(p1, p2, generation + 1);
    child = mutate(child);
    nextGen.push(child);
  }

  return nextGen;
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