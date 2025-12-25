
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
                    
                    // 4-Way Neighbors (Orthogonal Only)
                    const neighbors = [
                        {x: curr.x+1, y: curr.y}, {x: curr.x-1, y: curr.y},
                        {x: curr.x, y: curr.y+1}, {x: curr.x, y: curr.y-1}
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
        const neighbors = [
            {x: seed.x+1, y: seed.y}, {x: seed.x-1, y: seed.y},
            {x: seed.x, y: seed.y+1}, {x: seed.x, y: seed.y-1}
        ];
        
        for (const n of neighbors) {
            if (n.x >= 0 && n.x < size && n.y >= 0 && n.y < size) {
                if (genes[n.y][n.x] === CellType.EMPTY) {
                    genes[n.y][n.x] = CellType.SKIN;
                    largest.push(n);
                    break;
                }
            }
        }
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

/**
 * Shrinks a genome to a target size (or fraction).
 * @param retentionRateOrTarget If < 1, acts as percentage. If >= 1, acts as exact target node count.
 */
export function pruneGenome(genome: Genome, retentionRateOrTarget: number = 0.15): Genome {
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

    // Determine target size
    let targetSize = 0;
    if (retentionRateOrTarget >= 1) {
        targetSize = Math.floor(retentionRateOrTarget);
    } else {
        targetSize = Math.floor(activeCells.length * retentionRateOrTarget);
    }
    
    // Safety clamp (Min 5 to be viable offspring, Max current size)
    targetSize = Math.max(5, Math.min(activeCells.length, targetSize));

    // Pick a random seed cell to keep
    const seedIndex = Math.floor(Math.random() * activeCells.length);
    const seed = activeCells[seedIndex];
    
    // BFS to find connected neighbors to keep (grow seed to target size)
    const toKeep = new Set<string>();
    const queue = [seed];
    const visited = new Set<string>();
    visited.add(`${seed.x},${seed.y}`);
    toKeep.add(`${seed.x},${seed.y}`);

    while (queue.length > 0 && toKeep.size < targetSize) {
        const curr = queue.shift()!;
        
        // 4-Way Neighbors
        const neighbors = [
            {x: curr.x+1, y: curr.y}, {x: curr.x-1, y: curr.y},
            {x: curr.x, y: curr.y+1}, {x: curr.x, y: curr.y-1}
        ];

        // Shuffle neighbors to avoid directional bias in pruning
        for (let i = neighbors.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [neighbors[i], neighbors[j]] = [neighbors[j], neighbors[i]];
        }

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

    return enforceContiguity({ ...genome, genes: newGenes });
}

// Finds a valid empty spot next to existing structure and adds a random cell
export function addStructuralNode(genome: Genome): { newGenome: Genome, addedX: number, addedY: number } | null {
    const newGenes = genome.genes.map(row => [...row]);
    const candidates: {x: number, y: number}[] = [];
    
    for(let y=0; y<genome.gridSize; y++) {
        for(let x=0; x<genome.gridSize; x++) {
            if (newGenes[y][x] === CellType.EMPTY) {
                // Check if neighbor to occupied
                const neighbors = [
                    {x: x+1, y}, {x: x-1, y}, {x, y: y+1}, {x, y: y-1}
                ];
                const hasNeighbor = neighbors.some(n => 
                    n.x >= 0 && n.x < genome.gridSize && n.y >= 0 && n.y < genome.gridSize && 
                    newGenes[n.y][n.x] !== CellType.EMPTY
                );
                
                if (hasNeighbor) {
                    candidates.push({x, y});
                }
            }
        }
    }
    
    if (candidates.length === 0) return null;
    
    const target = candidates[Math.floor(Math.random() * candidates.length)];
    
    // 50% Skin, 30% Muscle, 20% Neuron
    const r = Math.random();
    let type = CellType.SKIN;
    if (r > 0.5) type = CellType.HEART;
    if (r > 0.8) type = CellType.NEURON;
    
    newGenes[target.y][target.x] = type;
    
    return {
        newGenome: { ...genome, genes: newGenes },
        addedX: target.x,
        addedY: target.y
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

  const child = {
    id: Math.random().toString(36).substr(2, 9),
    gridSize: size,
    genes: newGenes,
    fitness: 0,
    generation,
    color,
    bioelectricMemory: (parentA.bioelectricMemory + parentB.bioelectricMemory) / 2,
    originX: parentA.originX,
    originY: parentA.originY
  };

  let processed = enforceContiguity(child);
  // Crossover usually results in large chaotic structures, prune to stable size ~12
  return pruneGenome(processed, 12); 
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
