import React, { useState, useEffect, useRef, useCallback } from 'react';
import { analyzeXenobot } from './services/geminiService';
import SimulationCanvas from './components/SimulationCanvas';
import { Controls } from './components/Controls';
import { AnalysisPanel } from './components/AnalysisPanel';
import { GenomeVisualizer } from './components/GenomeVisualizer';
import { TitleScreen } from './components/TitleScreen';
import { SettingsPanel } from './components/SettingsPanel';
import { HelpModal } from './components/HelpModal';
import { Xenobot, Genome, AnalysisResult, CameraState, SimulationConfig, SaveData } from './types';
import { DEFAULT_CONFIG, INITIAL_POPULATION_SIZE, EVOLUTION_INTERVAL } from './constants';
import { ScanEye } from 'lucide-react';
import { PhysicsEngine } from './services/physicsEngine';
import { createRandomGenome, evolvePopulation } from './services/geneticAlgorithm';

// Helper for continuous evolution
// We need access to crossover/mutate from GA but evolvePopulation handles array
// We will replicate single-step evolution here or refactor. 
// For simplicity, we'll re-implement the single step using existing helpers if exported, 
// but since 'crossover' and 'mutate' are not exported, we will rely on a custom logic here 
// or assume we can just use evolvePopulation on a micro-scale.
// Actually, evolvePopulation does tournament selection, so we can pass a small pool.

const App: React.FC = () => {
  // Application State
  const [appState, setAppState] = useState<'TITLE' | 'SIMULATION'>('TITLE');
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [config, setConfig] = useState<SimulationConfig>(DEFAULT_CONFIG);

  // Simulation State
  const [generation, setGeneration] = useState(1);
  const [isRunning, setIsRunning] = useState(false);
  // TimeLeft is removed in favor of continuous flow
  
  // Simulation Engine State (Main Thread)
  const engineRef = useRef<PhysicsEngine | null>(null);
  const populationRef = useRef<Genome[]>([]);
  const evolutionTimerRef = useRef<number>(0);
  
  // We use a Ref for bots to pass to Canvas to avoid re-renders
  const botsRef = useRef<Xenobot[]>([]); 
  
  // Track best genomes for each group independently
  const [bestGenomeA, setBestGenomeA] = useState<Genome | null>(null);
  const [bestGenomeB, setBestGenomeB] = useState<Genome | null>(null);
  
  // Camera State
  const [camera, setCamera] = useState<CameraState>({ x: 0, y: 0, zoom: 0.55 });
  const keysPressed = useRef<Set<string>>(new Set());
  
  // Analysis State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);

  // Refs for loop
  const requestRef = useRef<number>(0);
  
  // Use window dimensions for full screen canvas
  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight });

  // --- Simulation Logic (Main Thread) ---

  const initSimulation = useCallback((cfg: SimulationConfig, startPop?: Genome[], startGen?: number) => {
    const engine = new PhysicsEngine(cfg);
    
    let pop = startPop;
    const currentGen = startGen || 1;

    // Population Initialization Strategy
    if (!pop || pop.length === 0) {
        const totalSize = Math.max(2, cfg.populationSize);
        const sizeA = Math.floor(totalSize / 2);
        const sizeB = totalSize - sizeA;
        
        // Group A: "Natives" (Cyan/Blue range ~190)
        const groupA = Array(sizeA).fill(null).map(() => createRandomGenome(currentGen, 190)); 
        
        // Group B: "Invaders" (Magenta/Red range ~340)
        const groupB = Array(sizeB).fill(null).map(() => createRandomGenome(currentGen, 340)); 
        
        pop = [...groupA, ...groupB];
    } 

    populationRef.current = pop;
    setGeneration(currentGen);

    // Create Bots with Position Logic
    engine.bots = pop.map((g) => {
        let startX = 0;
        
        if (typeof g.originX === 'number' && !isNaN(g.originX)) {
             startX = g.originX + (Math.random() - 0.5) * 50; 
        } 
        else {
           // Fallback / First Gen
           const match = g.color.match(/hsl\((\d+\.?\d*)/);
           const hue = match ? parseFloat(match[1]) : 0;
           const isGroupA = (hue > 150 && hue < 230);
           
           startX = isGroupA ? 0 : 1200; 
           startX += (Math.random() - 0.5) * 150; 
           g.originX = startX;
        }

        const startY = 200 + Math.random() * 100; 
        return engine.createBot(g, startX, startY);
    });
    
    engineRef.current = engine;
    botsRef.current = engine.bots;
    
    evolutionTimerRef.current = 0;
    setBestGenomeA(null);
    setBestGenomeB(null);
  }, []);

  const evolveContinuous = useCallback(() => {
    if (!engineRef.current) return;
    const engine = engineRef.current;
    
    // We process each group independently to maintain diversity and group counts
    const groups = [0, 1];
    let evolutionOccurred = false;

    groups.forEach(groupId => {
        const groupBots = engine.bots.filter(b => b.groupId === groupId);
        
        // Calculate target size for this group (approx half of total config size)
        const targetGroupSize = Math.floor(config.populationSize / 2);
        
        if (groupBots.length === 0) {
            // Extinction event? Reseed.
            const newG = createRandomGenome(generation, groupId === 0 ? 190 : 340);
            const parentPos = groupId === 0 ? 0 : 1200;
            const bot = engine.createBot(newG, parentPos, 200);
            engine.addBot(bot);
            return;
        }

        // Sort by X position (Fitness)
        groupBots.sort((a, b) => b.centerOfMass.x - a.centerOfMass.x);
        
        // Strategy:
        // 1. If population < target, Just Breed (Growth)
        // 2. If population >= target, Kill Worst then Breed (Replacement)
        
        const needGrowth = groupBots.length < targetGroupSize;
        
        if (!needGrowth) {
             // Remove worst bot (last in sorted list)
             const victim = groupBots[groupBots.length - 1];
             engine.removeBot(victim.id);
        }

        // Breed: Pick top performers
        // If we have at least 1 bot, we can clone/mutate. If 2, we crossover.
        const parent1 = groupBots[0];
        const parent2 = groupBots.length > 1 ? groupBots[1] : groupBots[0];
        
        // Use evolvePopulation helper to generate a child
        // We pass a mini-population of the best parents to generate 1 child
        const parents = [parent1.genome, parent2.genome];
        
        // We force generation of 1 child by asking for population size 3 from pool of 2
        // evolvePopulation logic: returns array of genomes. 
        // We'll just grab the new one.
        const nextGenParams = evolvePopulation(parents, generation, 10); // 10 is arbitrary max here
        
        // The function returns parents + children. We want the last one (newest).
        const childGenome = nextGenParams[nextGenParams.length - 1];
        
        // Position child near top parent
        const spawnX = parent1.centerOfMass.x - 50 - Math.random() * 50; // slightly behind leader
        const spawnY = parent1.centerOfMass.y + (Math.random() - 0.5) * 50;
        
        childGenome.originX = spawnX; // Inherit spatial awareness

        const childBot = engine.createBot(childGenome, spawnX, spawnY);
        engine.addBot(childBot);
        
        evolutionOccurred = true;
    });

    if (evolutionOccurred) {
        setGeneration(g => g + 1);
        populationRef.current = engine.bots.map(b => b.genome);
    }

  }, [config.populationSize, generation]);

  const updateSimulation = useCallback(() => {
      if (!engineRef.current) return;
      
      // Update Physics
      engineRef.current.update(performance.now() / 1000);
      botsRef.current = engineRef.current.bots;

      // Continuous Evolution Timer
      evolutionTimerRef.current += 1;
      if (evolutionTimerRef.current >= EVOLUTION_INTERVAL) {
          evolveContinuous();
          evolutionTimerRef.current = 0;
      }

      // Realtime Best Tracking (Every 10 ticks for UI efficiency)
      if (evolutionTimerRef.current % 10 === 0) { 
        let bestA: Genome | null = null;
        let maxFitA = -Infinity;
        let bestB: Genome | null = null;
        let maxFitB = -Infinity;

        engineRef.current.bots.forEach(b => {
             const x = b.centerOfMass.x;
             const match = b.genome.color.match(/hsl\((\d+\.?\d*)/);
             const h = match ? parseFloat(match[1]) : 0;
             const isCyan = (h > 150 && h < 230);

             if (isCyan) {
                 if (x > maxFitA) { maxFitA = x; bestA = b.genome; }
             } else {
                 if (x > maxFitB) { maxFitB = x; bestB = b.genome; }
             }
        });
        
        if (bestA) setBestGenomeA({...bestA, fitness: maxFitA});
        if (bestB) setBestGenomeB({...bestB, fitness: maxFitB});
      }
  }, [evolveContinuous]);

  // --- Helper to extract population for saving ---
  const getPopulationFromBots = (): Genome[] => {
      return populationRef.current;
  };

  const getCenteredCamera = (width: number, height: number, zoom: number = 0.55) => {
    const targetX = 600;
    const targetY = 600; 
    return {
        x: width / 2 - targetX,
        y: height / 2 - targetY,
        zoom
    };
  };

  // --- Initialization Logic ---

  useEffect(() => {
    const handleResize = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => keysPressed.current.add(e.key.toLowerCase());
    const handleKeyUp = (e: KeyboardEvent) => keysPressed.current.delete(e.key.toLowerCase());
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const startNewSimulation = () => {
    setAppState('SIMULATION');
    // Ensure we start fresh
    initSimulation(config, [], 1);
    setCamera(getCenteredCamera(window.innerWidth, window.innerHeight, 0.55));
    setShowHelp(true); 
    setIsRunning(true);
  };

  const handleApplySettings = (newConfig: SimulationConfig) => {
    setConfig(newConfig);
    // When settings change, we usually restart the sim to apply them cleanly
    initSimulation(newConfig, [], 1);
    setShowSettings(false);
    setIsRunning(true);
  };

  const handleLoadSave = (data: SaveData) => {
    setConfig(data.config);
    initSimulation(data.config, data.population, data.generation);
    setShowSettings(false);
    setIsRunning(false); 
    alert(`Simulation loaded: Generation ${data.generation}`);
  };

  const togglePlay = () => {
      setIsRunning(!isRunning);
  };

  // --- Main Animation Loop ---

  const updateCamera = () => {
      const speed = 10 / camera.zoom;
      const keys = keysPressed.current;
      let dx = 0;
      let dy = 0;
      let dZoom = 0;

      if (keys.has('w') || keys.has('arrowup')) dy += speed;
      if (keys.has('s') || keys.has('arrowdown')) dy -= speed;
      if (keys.has('a') || keys.has('arrowleft')) dx += speed;
      if (keys.has('d') || keys.has('arrowright')) dx -= speed;
      if (keys.has('q') || keys.has('-')) dZoom -= 0.02;
      if (keys.has('e') || keys.has('=')) dZoom += 0.02;

      if (dx !== 0 || dy !== 0 || dZoom !== 0) {
          setCamera(prev => ({
              x: prev.x + dx,
              y: prev.y + dy,
              zoom: Math.max(0.1, Math.min(3, prev.zoom + dZoom))
          }));
      }
  };

  const animate = useCallback(() => {
    updateCamera();
    
    if (isRunning) {
        updateSimulation();
    }

    requestRef.current = requestAnimationFrame(animate);
  }, [camera, isRunning, updateSimulation]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [animate]);

  // --- Interactions ---

  const handleAnalyze = async () => {
    const target = bestGenomeA || bestGenomeB;
    if (!target) return;
    setIsAnalyzing(true);
    const result = await analyzeXenobot(target, generation);
    setAnalysisResult(result);
    setIsAnalyzing(false);
  };

  const resetCamera = () => {
      setCamera(getCenteredCamera(window.innerWidth, window.innerHeight, 0.55));
  };

  // --- Render ---

  if (appState === 'TITLE') {
      return <TitleScreen onStart={startNewSimulation} />;
  }

  return (
    <div className="relative w-screen h-screen bg-deep-space text-white overflow-hidden font-mono selection:bg-neon-cyan selection:text-black">
      
      {/* BACKGROUND: Full Screen Simulation Canvas */}
      <SimulationCanvas 
        botsRef={botsRef} 
        width={dimensions.width} 
        height={dimensions.height}
        groundY={config.groundHeight} 
        camera={camera}
      />
      
      {/* BACKGROUND: Grid Pattern Overlay */}
      <div className="absolute inset-0 pointer-events-none opacity-10" 
             style={{
               backgroundImage: `radial-gradient(circle at 50% 50%, #00f3ff 1px, transparent 1px)`,
               backgroundSize: '40px 40px'
             }}>
      </div>

      {/* UI LAYER: Controls Sidebar (Overlay) */}
      <div className="absolute top-0 left-0 h-full z-30 pointer-events-none">
        <div className="pointer-events-auto h-full">
            <Controls 
                isRunning={isRunning} 
                generation={generation}
                timeRemaining={0} 
                onTogglePlay={togglePlay}
                onAnalyze={handleAnalyze}
                onOpenSettings={() => {
                    setIsRunning(false);
                    setShowSettings(true);
                }}
                isAnalyzing={isAnalyzing}
            />
        </div>
      </div>
      
      {/* UI LAYER: Top HUD */}
      <div className="absolute top-0 right-0 w-full p-4 pointer-events-none flex justify-end items-start z-20">
            {/* Physics Stats (Positioned relative to Controls) */}
            <div className="absolute top-4 left-80 ml-6 bg-slate-900/50 backdrop-blur border border-slate-700 p-2 rounded text-xs text-slate-400">
                <div>PHYSICS_ENGINE: MAIN_THREAD_OPTIMIZED</div>
                <div>GRAVITY: {config.gravity.toFixed(2)} m/s²</div>
                <div>POPULATION: {populationRef.current.length} / {config.maxPopulationSize}</div>
                <div>MODE: STEADY_STATE_EVOLUTION</div>
            </div>
            
             <div className="flex gap-2 pointer-events-auto">
                 <button 
                    onClick={resetCamera}
                    className="bg-slate-800 hover:bg-slate-700 text-neon-cyan border border-slate-600 px-3 py-1 rounded text-xs flex items-center gap-2 transition-colors"
                 >
                    <ScanEye size={14} /> RESET CAM
                 </button>
             </div>
      </div>
        
      {/* UI LAYER: Bottom Instructions */}
      <div className="absolute bottom-6 left-80 ml-6 pointer-events-none text-[10px] text-slate-500 font-mono z-20">
            <div>[WASD / ARROWS] PAN CAMERA</div>
            <div>[Q / E] ZOOM LEVEL</div>
      </div>

      {/* FLOATING PANELS: Dual Genome Visualizers */}
      <GenomeVisualizer 
        genome={bestGenomeA} 
        label="GROUP A (NATIVES)" 
        borderColor="border-neon-cyan/50" 
        className="bottom-6 left-96" // Positioned to the right of controls
      />
      
      <GenomeVisualizer 
        genome={bestGenomeB} 
        label="GROUP B (INVADERS)" 
        borderColor="border-neon-magenta/50" 
        className="bottom-6 right-6" // Positioned at far right
      />
      
      <AnalysisPanel 
        result={analysisResult} 
        onClose={() => setAnalysisResult(null)} 
      />

      <HelpModal 
        open={showHelp} 
        onClose={() => setShowHelp(false)} 
      />

      {showSettings && (
            <SettingsPanel 
                config={config} 
                onSave={handleApplySettings}
                onLoad={handleLoadSave}
                onClose={() => setShowSettings(false)}
                population={getPopulationFromBots()}
                generation={generation}
            />
        )}
    </div>
  );
};

export default App;