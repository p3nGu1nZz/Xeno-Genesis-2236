
import { Genome, CellType } from '../types';
import { GRID_SIZE } from '../constants';

const MUTATION_RATE = 0.2; 

export function createRandomGenome(generation: number = 0, targetHue?: number): Genome {
  const genes: CellType[][] = [];
  
  // Organic/Fuzzy Generation Logic (Probabilistic)
  // Instead of forced rows, we use probabilities to create a random distribution
  for (let y = 0; y < GRID_SIZE; y++) {
    const row: CellType[] = [];
    for (let x = 0; x < GRID_SIZE; x++) {
       const rand = Math.random();
       
       // Probability Distribution:
       // 15% Empty (Gaps for shape variation)
       // 55% Skin (Structural)
       // 20% Heart (Muscle/Motor) - Scattered
       // 10% Neuron (Sensory) - Scattered
       
       if (rand < 0.15) {
           row.push(CellType.EMPTY);
       } else if (rand < 0.70) {
           row.push(CellType.SKIN);
       } else if (rand < 0.90) {
           row.push(CellType.HEART);
       } else {
           row.push(CellType.NEURON);
       }
    }
    genes.push(row);
  }

  // Ensure at least some structure exists (not all empty)
  // We can inject a small core of skin to ensure viability
  const mid = Math.floor(GRID_SIZE/2);
  if (genes[mid][mid] === CellType.EMPTY) genes[mid][mid] = CellType.SKIN;

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
  
  // Mutation Logic
  for (let y = 0; y < genome.gridSize; y++) {
    for (let x = 0; x < genome.gridSize; x++) {
      if (Math.random() < 0.05) { // 5% chance per cell
        const types = [CellType.EMPTY, CellType.SKIN, CellType.HEART, CellType.NEURON];
        // Weighted random for mutation
        const r = Math.random();
        let type = CellType.SKIN;
        if (r < 0.1) type = CellType.EMPTY;
        else if (r < 0.6) type = CellType.SKIN;
        else if (r < 0.85) type = CellType.HEART;
        else type = CellType.NEURON;

        newGenes[y][x] = type;
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
