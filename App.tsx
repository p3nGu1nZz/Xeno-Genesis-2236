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
import { DEFAULT_CONFIG, INITIAL_POPULATION_SIZE } from './constants';
import { ScanEye } from 'lucide-react';
import { PhysicsEngine } from './services/physicsEngine';
import { createRandomGenome, evolvePopulation } from './services/geneticAlgorithm';

const App: React.FC = () => {
  // Application State
  const [appState, setAppState] = useState<'TITLE' | 'SIMULATION'>('TITLE');
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [config, setConfig] = useState<SimulationConfig>(DEFAULT_CONFIG);

  // Simulation State
  const [generation, setGeneration] = useState(1);
  const [isRunning, setIsRunning] = useState(false);
  const [timeLeft, setTimeLeft] = useState(config.generationDuration || 1000);
  
  // Simulation Engine State (Main Thread)
  const engineRef = useRef<PhysicsEngine | null>(null);
  const populationRef = useRef<Genome[]>([]);
  const timeLeftRef = useRef<number>(config.generationDuration || 1000);
  
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
        // Use the passed configuration for population size. 
        // Default is 10 (5 per group), but if user changed slider, it respects that.
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
        
        // Priority 1: Inherited Position (Evolutionary Continuity)
        if (typeof g.originX === 'number' && !isNaN(g.originX)) {
             startX = g.originX + (Math.random() - 0.5) * 50; 
        } 
        // Priority 2: Gen 1 Split (Initial Setup)
        else {
           // Fallback / First Gen
           const match = g.color.match(/hsl\((\d+\.?\d*)/);
           const hue = match ? parseFloat(match[1]) : 0;
           const isGroupA = (hue > 150 && hue < 230);
           
           startX = isGroupA ? 0 : 1200; 
           // Reduced spread (150) so the 5 bots appear as a tight group
           startX += (Math.random() - 0.5) * 150; 
           
           // IMPORTANT: Save this start position back to the genome so it persists if they don't move
           g.originX = startX;
        }

        const startY = 200 + Math.random() * 100; 
        return engine.createBot(g, startX, startY);
    });
    
    engineRef.current = engine;
    botsRef.current = engine.bots;
    
    timeLeftRef.current = cfg.generationDuration || 1000;
    setTimeLeft(timeLeftRef.current);
    setBestGenomeA(null);
    setBestGenomeB(null);
  }, []);

  const evolve = useCallback(() => {
      if (!engineRef.current) return;

      const currentBots = engineRef.current.bots;
      
      // 1. Evaluate Fitness & Capture Final Positions
      const evaluatedGenomes = populationRef.current.map(genome => {
        const bot = currentBots.find(b => b.genome.id === genome.id);
        let fitness = 0;
        let originX = genome.originX || 0;
        
        if (bot) {
            fitness = engineRef.current!.evaluateFitness(bot);
            // CRITICAL: Capture the final position (Center of Mass) for the next generation
            originX = bot.centerOfMass.x; 
        }
        
        return { ...genome, fitness, originX };
      });

      // 2. Sort & Pick Best
      const sorted = [...evaluatedGenomes].sort((a, b) => b.fitness - a.fitness);
      
      const isCyan = (g: Genome) => {
        const match = g.color.match(/hsl\((\d+\.?\d*)/);
        if(!match) return false;
        const h = parseFloat(match[1]);
        return (h > 150 && h < 230);
      };
      
      const bestCyan = sorted.find(g => isCyan(g)) || null;
      const bestMagenta = sorted.find(g => !isCyan(g)) || null;
      
      setBestGenomeA(bestCyan);
      setBestGenomeB(bestMagenta);

      // 3. Evolve with Speciation (Positions are inherited inside evolvePopulation via crossover)
      const nextGen = evolvePopulation(evaluatedGenomes, generation, config.maxPopulationSize);
      populationRef.current = nextGen;
      
      const nextGenNum = generation + 1;
      setGeneration(nextGenNum);

      // 4. Rebuild Physics World
      // The new genomes in nextGen already have 'originX' set from their parents
      engineRef.current.bots = nextGen.map((g) => {
          let startX = g.originX || 0;
          
          // Add slight scatter so clones don't stack perfectly
          startX += (Math.random() - 0.5) * 50;

          const startY = 200 + Math.random() * 100;
          return engineRef.current!.createBot(g, startX, startY);
      });
      botsRef.current = engineRef.current.bots;

      // 5. Reset Timer
      timeLeftRef.current = config.generationDuration || 1000;
      setTimeLeft(timeLeftRef.current);
  }, [config, generation]);

  const updateSimulation = useCallback(() => {
      if (!engineRef.current) return;
      
      // Update Physics
      engineRef.current.update(performance.now() / 1000);
      botsRef.current = engineRef.current.bots;

      // Update Timer
      timeLeftRef.current -= 1;
      setTimeLeft(timeLeftRef.current);

      // Realtime Best Tracking 
      if (timeLeftRef.current % 10 === 0) { 
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

      if (timeLeftRef.current <= 0) {
          evolve();
      }
  }, [evolve]);

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
                timeRemaining={timeLeft}
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
                <div>TRAINING_DURATION: {config.generationDuration || 1000}</div>
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