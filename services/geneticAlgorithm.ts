import { Genome, CellType } from '../types';
import { GRID_SIZE } from '../constants';

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

  const genome = {
    id: Math.random().toString(36).substr(2, 9),
    gridSize: GRID_SIZE,
    genes,
    fitness: 0,
    generation,
    color,
    bioelectricMemory: Math.random(),
    originX: 0, 
    originY: 200
  };

  // Enforce graph connectivity immediately
  return enforceContiguity(genome);
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

    const genome = {
        id: "PLATONIC-" + Math.random().toString(36).substr(2, 6),
        gridSize: GRID_SIZE,
        genes,
        fitness: 0,
        generation,
        color: `hsl(${h.toFixed(0)}, 80%, 50%)`, 
        bioelectricMemory: 0.8,
        originX: 0,
        originY: 200
    };
    
    // Platonic ring is designed to be connected, but safe to enforce
    return enforceContiguity(genome);
}

// Ensures the genome is a single connected component
// Uses 8-way connectivity (Moore Neighborhood) to match Physics Engine springs
// Removes any disconnected islands, keeping only the largest structure.
export function enforceContiguity(genome: Genome): Genome {
    const genes = genome.genes.map(row => [...row]);
    const size = genome.gridSize;
    const visited = new Set<string>();
    const components: {x:number, y:number}[][] = [];

    // Find all connected components
    for(let y=0; y<size; y++) {
        for(let x=0; x<size; x++) {
            const key = `${x},${y}`;
            if (genes[y][x] !== CellType.EMPTY && !visited.has(key)) {
                const component: {x:number, y:number}[] = [];
                const queue = [{x, y}];
                visited.add(key);
                
                while(queue.length > 0) {
                    const curr = queue.shift()!;
                    component.push(curr);
                    
                    // 8-Way Neighbors (Orthogonal + Diagonal)
                    // This matches the physics engine spring creation logic
                    const neighbors = [
                        {x: curr.x+1, y: curr.y}, {x: curr.x-1, y: curr.y},
                        {x: curr.x, y: curr.y+1}, {x: curr.x, y: curr.y-1},
                        {x: curr.x+1, y: curr.y+1}, {x: curr.x-1, y: curr.y-1},
                        {x: curr.x+1, y: curr.y-1}, {x: curr.x-1, y: curr.y+1}
                    ];
                    
                    for(const n of neighbors) {
                         if (n.x >= 0 && n.x < size && n.y >= 0 && n.y < size) {
                             const nKey = `${n.x},${n.y}`;
                             if (genes[n.y][n.x] !== CellType.EMPTY && !visited.has(nKey)) {
                                 visited.add(nKey);
                                 queue.push(n);
                             }
                         }
                    }
                }
                components.push(component);
            }
        }
    }

    // If empty, seed a minimal 2-node structure
    if (components.length === 0) {
        const mid = Math.floor(size/2);
        genes[mid][mid] = CellType.SKIN;
        if (mid + 1 < size) genes[mid][mid+1] = CellType.SKIN;
        else if (mid - 1 >= 0) genes[mid][mid-1] = CellType.SKIN;
        return { ...genome, genes };
    }

    // Find largest component by node count
    components.sort((a, b) => b.length - a.length);
    const largest = components[0];

    // Ensure at least 2 nodes to guarantee edges (springs) exist
    if (largest.length < 2) {
        const seed = largest[0];
        // Try orthogonal neighbors first for visual cleanliness
        const neighbors = [
            {x: seed.x+1, y: seed.y}, {x: seed.x-1, y: seed.y},
            {x: seed.x, y: seed.y+1}, {x: seed.x, y: seed.y-1}
        ];
        
        let added = false;
        for (const n of neighbors) {
            if (n.x >= 0 && n.x < size && n.y >= 0 && n.y < size) {
                // Only grow into empty space to avoid overwriting logic
                if (genes[n.y][n.x] === CellType.EMPTY) {
                    genes[n.y][n.x] = CellType.SKIN;
                    largest.push(n);
                    added = true;
                    break;
                }
            }
        }
        // If still size 1 (extremely rare trapped case), it might die, but that's acceptable evolution
    }

    const keepSet = new Set(largest.map(c => `${c.x},${c.y}`));

    // Prune everything else
    for(let y=0; y<size; y++) {
        for(let x=0; x<size; x++) {
            if (genes[y][x] !== CellType.EMPTY) {
                if (!keepSet.has(`${x},${y}`)) {
                    genes[y][x] = CellType.EMPTY;
                }
            }
        }
    }

    return { ...genome, genes };
}

// Shrinks a genome to a small fraction of its size, keeping connected components
export function pruneGenome(genome: Genome, retentionRate: number = 0.15): Genome {
    const newGenes = genome.genes.map(row => [...row]);
    const activeCells: {x: number, y: number}[] = [];

    // Find all active cells
    for(let y=0; y<genome.gridSize; y++) {
        for(let x=0; x<genome.gridSize; x++) {
            if (newGenes[y][x] !== CellType.EMPTY) {
                activeCells.push({x, y});
            }
        }
    }

    if (activeCells.length <= 3) return genome; // Already small

    // Target size (Minimum 3 to allow movement physics)
    const targetSize = Math.max(3, Math.floor(activeCells.length * retentionRate));

    // Pick a random seed cell to keep
    const seedIndex = Math.floor(Math.random() * activeCells.length);
    const seed = activeCells[seedIndex];
    
    // BFS to find connected neighbors to keep
    const toKeep = new Set<string>();
    const queue = [seed];
    const visited = new Set<string>();
    visited.add(`${seed.x},${seed.y}`);
    toKeep.add(`${seed.x},${seed.y}`);

    while (queue.length > 0 && toKeep.size < targetSize) {
        const curr = queue.shift()!;
        
        // 8-Way Neighbors for pruning (Consistency with enforceContiguity)
        const neighbors = [
            {x: curr.x+1, y: curr.y}, {x: curr.x-1, y: curr.y},
            {x: curr.x, y: curr.y+1}, {x: curr.x, y: curr.y-1},
            {x: curr.x+1, y: curr.y+1}, {x: curr.x-1, y: curr.y-1},
            {x: curr.x+1, y: curr.y-1}, {x: curr.x-1, y: curr.y+1}
        ];

        for (const n of neighbors) {
            if (n.x >= 0 && n.x < genome.gridSize && n.y >= 0 && n.y < genome.gridSize) {
                if (newGenes[n.y][n.x] !== CellType.EMPTY) {
                    const key = `${n.x},${n.y}`;
                    if (!visited.has(key)) {
                        visited.add(key);
                        toKeep.add(key);
                        queue.push(n);
                        if (toKeep.size >= targetSize) break;
                    }
                }
            }
        }
    }

    // Clear everything not in toKeep
    for(let y=0; y<genome.gridSize; y++) {
        for(let x=0; x<genome.gridSize; x++) {
            const key = `${x},${y}`;
            if (!toKeep.has(key)) {
                newGenes[y][x] = CellType.EMPTY;
            }
        }
    }

    // Safety run to ensure contiguity after pruning
    return enforceContiguity({ ...genome, genes: newGenes });
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

  const posXA = parentA.originX ?? 0;
  const posXB = parentB.originX ?? 0;
  const posYA = parentA.originY ?? 0;
  const posYB = parentB.originY ?? 0;
  
  const dist = Math.sqrt(Math.pow(posXA - posXB, 2) + Math.pow(posYA - posYB, 2));
  
  let originX = posXA;
  let originY = posYA;
  
  if (dist < 300) {
      originX = (posXA + posXB) / 2;
      originY = (posYA + posYB) / 2;
  } else {
      if (color === parentA.color) {
          originX = posXA;
          originY = posYA;
      } else {
          originX = posXB;
          originY = posYB;
      }
  }

  const child = {
    id: Math.random().toString(36).substr(2, 9),
    gridSize: size,
    genes: newGenes,
    fitness: 0,
    generation,
    color,
    bioelectricMemory: (parentA.bioelectricMemory + parentB.bioelectricMemory) / 2,
    originX,
    originY
  };

  // Enforce Contiguity
  let processed = enforceContiguity(child);
  
  // Prune (which also enforces contiguity) to prevent instant large children
  return pruneGenome(processed, 0.25);
}

export function mutate(genome: Genome): Genome {
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

  // 2. Platonic Pull
  if (Math.random() < 0.4) { 
      const x = Math.floor(Math.random() * genome.gridSize);
      const y = Math.floor(Math.random() * genome.gridSize);
      const idealType = PLATONIC_IDEAL_MAP[`${x},${y}`];
      
      if (idealType !== undefined && newGenes[y][x] !== idealType) {
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

  const mutatedGenome = {
    ...genome,
    id: Math.random().toString(36).substr(2, 9),
    genes: newGenes,
    bioelectricMemory: newMemory,
    color: mutated ? adjustColor(genome.color) : genome.color,
  };

  return enforceContiguity(mutatedGenome);
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
      
      const growthTarget = Math.max(1, Math.floor(pool.length * 0.10));
      const limit = Math.min(currentMax, pool.length + growthTarget);
      
      const nextGen = [...sorted];
      
      let attempts = 0;
      while (nextGen.length < limit && attempts < 100) {
          const p1 = tournamentSelect(sorted);
          const p2 = tournamentSelect(sorted);
          let child = crossover(p1, p2, generation + 1);
          child = mutate(child);
          nextGen.push(child);
          attempts++;
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