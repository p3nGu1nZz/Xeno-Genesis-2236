
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { analyzeXenobot } from './services/geminiService';
import SimulationCanvas from './components/SimulationCanvas';
import { Controls } from './components/Controls';
import { AnalysisPanel } from './components/AnalysisPanel';
import { GenomeVisualizer } from './components/GenomeVisualizer';
import { TitleScreen } from './components/TitleScreen';
import { SettingsPanel } from './components/SettingsPanel';
import { HelpModal } from './components/HelpModal';
import { Xenobot, Genome, AnalysisResult, CameraState, SimulationConfig, SaveData, CellType } from './types';
import { DEFAULT_CONFIG, INITIAL_POPULATION_SIZE, EVOLUTION_INTERVAL } from './constants';
import { ScanEye, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { PhysicsEngine } from './services/physicsEngine';
import { createRandomGenome, evolvePopulation } from './services/geneticAlgorithm';

const App: React.FC = () => {
  // Application State
  const [appState, setAppState] = useState<'TITLE' | 'SIMULATION'>('TITLE');
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [config, setConfig] = useState<SimulationConfig>(DEFAULT_CONFIG);
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);
  
  // UI State for Panels
  const [minimizedPanels, setMinimizedPanels] = useState({ A: false, B: false });

  // Simulation State
  const [generation, setGeneration] = useState(1);
  const [isRunning, setIsRunning] = useState(false);
  const [acousticActive, setAcousticActive] = useState(false);
  const [globalTick, setGlobalTick] = useState(0);
  
  // Simulation Engine State (Main Thread)
  const engineRef = useRef<PhysicsEngine | null>(null);
  const populationRef = useRef<Genome[]>([]);
  const evolutionTimerRef = useRef<number>(0);
  const totalTickRef = useRef<number>(0);
  
  // We use a Ref for bots to pass to Canvas to avoid re-renders
  const botsRef = useRef<Xenobot[]>([]); 
  
  // Track best genomes for each group independently
  const [bestGenomeA, setBestGenomeA] = useState<Genome | null>(null);
  const [bestGenomeB, setBestGenomeB] = useState<Genome | null>(null);
  
  // Camera State
  const [camera, setCamera] = useState<CameraState>({ x: 0, y: 0, zoom: 0.55 });
  const keysPressed = useRef<Set<string>>(new Set());
  const lastInputTimeRef = useRef<number>(Date.now());
  const isAutoCameraRef = useRef<boolean>(true);
  
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
    totalTickRef.current = 0;
    setBestGenomeA(null);
    setBestGenomeB(null);
  }, []);

  const evolveContinuous = useCallback(() => {
    if (!engineRef.current) return;
    const engine = engineRef.current;
    
    const groups = [0, 1];
    let evolutionOccurred = false;

    groups.forEach(groupId => {
        const groupBots = engine.bots.filter(b => b.groupId === groupId);
        const targetGroupSize = Math.floor(config.populationSize / 2);
        
        if (groupBots.length === 0) {
            // Extinction event? Reseed immediately
            const newG = createRandomGenome(generation, groupId === 0 ? 190 : 340);
            const parentPos = groupId === 0 ? 0 : 1200;
            const bot = engine.createBot(newG, parentPos, 200);
            engine.addBot(bot);
            return;
        }

        // --- PROBABILISTIC REPRODUCTION ---
        // 0.1% chance per check (running every 1 second)
        if (Math.random() > 0.001) return;

        // Sort by X position (Fitness)
        groupBots.sort((a, b) => b.centerOfMass.x - a.centerOfMass.x);
        
        const needGrowth = groupBots.length < targetGroupSize;
        
        if (!needGrowth) {
             // Remove worst bot (last in sorted list)
             const victim = groupBots[groupBots.length - 1];
             engine.removeBot(victim.id);
        }

        // --- STABILIZED REPRODUCTION (Exact Cloning + Offset) ---
        // As requested: "passed directly to the child without mutation"
        // And "initial position is slightly offset... but maintains parent's originX"
        
        const parent = groupBots[0]; // Best bot reproduces
        
        // Clone the genome DIRECTLY without mutation
        const childGenome: Genome = {
            ...parent.genome,
            id: Math.random().toString(36).substr(2, 9),
            generation: generation + 1,
            // Stabilize bioelectric memory as per request (canalization)
            // If parent has memory, keep it, or strictly set to 0.6 if requested, 
            // but prompt said "Suggest...". For strict cloning we keep parent values.
            bioelectricMemory: parent.genome.bioelectricMemory
        };
        
        // Maintain the lane (Group based positioning)
        childGenome.originX = parent.genome.originX;

        // Spawn logic: Slightly behind (-x) and random Y offset
        // This ensures the clone follows the parent's "stream"
        const spawnX = parent.centerOfMass.x - 60; 
        const spawnY = parent.centerOfMass.y + (Math.random() - 0.5) * 40;
        
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
      totalTickRef.current += 1;
      
      // Update visual stats less frequently
      if (totalTickRef.current % 5 === 0) {
          setGlobalTick(totalTickRef.current);
      }

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
             const isCyan = b.groupId === 0;

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
    const handleKeyDown = (e: KeyboardEvent) => {
        keysPressed.current.add(e.key.toLowerCase());
        // Interaction detected
        lastInputTimeRef.current = Date.now();
        isAutoCameraRef.current = false;
    };
    const handleKeyUp = (e: KeyboardEvent) => {
        keysPressed.current.delete(e.key.toLowerCase());
        lastInputTimeRef.current = Date.now();
    };
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

  const handleMorphologyUpgrade = () => {
    if (!populationRef.current || populationRef.current.length === 0) return;

    // Apply "Bilateral Polarity" Strategy
    // Row 0: Neurons
    // Row 5: Heart
    // Intermediate: Skin Chassis
    // Plasticity: 0.60
    
    const improvedPopulation = populationRef.current.map(g => {
        const newGenes = g.genes.map(row => [...row]);
        const size = g.gridSize;

        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                if (y === 0) {
                    newGenes[y][x] = CellType.NEURON; // Anterior Sensory
                } else if (y === size - 1) {
                    newGenes[y][x] = CellType.HEART; // Posterior Motor
                } else {
                    newGenes[y][x] = CellType.SKIN; // Structural Chassis
                }
            }
        }

        return {
            ...g,
            genes: newGenes,
            bioelectricMemory: 0.60,
            generation: g.generation + 1
        };
    });

    initSimulation(config, improvedPopulation, generation + 1);
    setAnalysisResult(null); // Close panel
  };

  // --- Main Animation Loop ---

  const updateCamera = () => {
      const now = Date.now();
      
      // Auto-Resume Auto Camera after 10s of inactivity
      if (!isAutoCameraRef.current && (now - lastInputTimeRef.current > 10000)) {
          isAutoCameraRef.current = true;
      }

      if (isAutoCameraRef.current && engineRef.current) {
          // Follow Group A (Group 0) - Calculate Center of Mass
          let totalX = 0;
          let totalY = 0;
          let count = 0;
          
          const bots = engineRef.current.bots;
          for (let i = 0; i < bots.length; i++) {
              const b = bots[i];
              // Only track living Group A bots for active following
              if (b.groupId === 0 && !b.isDead) {
                  totalX += b.centerOfMass.x;
                  totalY += b.centerOfMass.y;
                  count++;
              }
          }

          if (count > 0) {
              const avgX = totalX / count;
              const avgY = totalY / count;
              
              // Target Screen Position: 
              // avgX -> 40% Width (bias left)
              // avgY -> 50% Height (centered)
              
              // Canvas Logic: ScreenX = Zoom*(WorldX - Width/2 + CamX) + Width/2
              // Target CamX derived to place avgX at 0.4*Width:
              const targetCamX = (dimensions.width * 0.5) - avgX - (0.1 * dimensions.width) / camera.zoom;
              const targetCamY = (dimensions.height * 0.5) - avgY;

              // Smooth Lerp (0.1 for better tracking response)
              const lerpFactor = 0.1;
              
              setCamera(prev => ({
                  x: prev.x + (targetCamX - prev.x) * lerpFactor,
                  y: prev.y + (targetCamY - prev.y) * lerpFactor, 
                  zoom: prev.zoom
              }));
          }
      }

      // Manual Controls override
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
      isAutoCameraRef.current = false;
      lastInputTimeRef.current = Date.now();
  };
  
  const toggleAcoustic = () => {
      const newState = !acousticActive;
      setAcousticActive(newState);
      const newConfig = { ...config, acousticFreq: newState ? 300 : 0 };
      setConfig(newConfig);
      if (engineRef.current) {
          engineRef.current.config = newConfig;
      }
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

      {/* UI LAYER: Controls Sidebar (Collapsible) */}
      <div className="absolute top-0 left-0 h-full z-30 pointer-events-none">
        <div className="pointer-events-auto h-full flex">
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
                onToggleAcoustic={toggleAcoustic}
                acousticActive={acousticActive}
                isCollapsed={isSidebarCollapsed}
                onToggleCollapse={() => setSidebarCollapsed(!isSidebarCollapsed)}
                minimizedPanels={minimizedPanels}
                onRestorePanel={(id) => setMinimizedPanels(prev => ({ ...prev, [id]: false }))}
                genomeA={bestGenomeA}
                genomeB={bestGenomeB}
            />
        </div>
      </div>
      
      {/* UI LAYER: Top HUD */}
      <div className="absolute top-0 right-0 w-full p-4 pointer-events-none flex justify-end items-start z-20">
            {/* Physics Stats (Positioned away from Reset Button) */}
            <div className={`absolute top-4 ${isSidebarCollapsed ? 'left-20' : 'left-80'} ml-6 transition-all duration-500 bg-slate-900/50 backdrop-blur border border-slate-700 p-2 rounded text-xs text-slate-400`}>
                <div>PHYSICS_ENGINE: MAIN_THREAD_OPTIMIZED</div>
                <div>GRAVITY: {config.gravity.toFixed(2)} m/s²</div>
                <div>POPULATION: {populationRef.current.length} / {config.maxPopulationSize}</div>
                <div>TICK: {globalTick}</div>
                <div className={acousticActive ? "text-neon-magenta animate-pulse" : "text-slate-500"}>
                    STIMULUS: {acousticActive ? '300 Hz (LINEARIZING)' : 'NONE (ROTATIONAL)'}
                </div>
            </div>
            
             <div className="flex gap-2 pointer-events-auto mt-2 mr-2">
                 <button 
                    onClick={resetCamera}
                    className="bg-slate-800 hover:bg-slate-700 text-neon-cyan border border-slate-600 px-3 py-1 rounded text-xs flex items-center gap-2 transition-colors shadow-lg"
                 >
                    <ScanEye size={14} /> RESET CAM
                 </button>
             </div>
      </div>
        
      {/* UI LAYER: Bottom Instructions */}
      <div className={`absolute bottom-6 ${isSidebarCollapsed ? 'left-20' : 'left-80'} ml-6 pointer-events-none text-[10px] text-slate-500 font-mono z-20 transition-all duration-500`}>
            <div>[WASD / ARROWS] PAN CAMERA (AUTO-FOLLOW ACTIVE)</div>
            <div>[Q / E] ZOOM LEVEL</div>
      </div>

      {/* FLOATING PANELS: Draggable Genome Visualizers */}
      <GenomeVisualizer 
        genome={bestGenomeA} 
        label="GROUP A (NATIVES)" 
        borderColor="border-neon-cyan/50" 
        initialPosition={{ x: 400, y: window.innerHeight - 300 }}
        hidden={minimizedPanels.A}
        onMinimize={() => setMinimizedPanels(prev => ({ ...prev, A: true }))}
      />
      
      <GenomeVisualizer 
        genome={bestGenomeB} 
        label="GROUP B (INVADERS)" 
        borderColor="border-neon-magenta/50" 
        initialPosition={{ x: window.innerWidth - 300, y: window.innerHeight - 300 }}
        hidden={minimizedPanels.B}
        onMinimize={() => setMinimizedPanels(prev => ({ ...prev, B: true }))}
      />
      
      <AnalysisPanel 
        result={analysisResult} 
        onClose={() => setAnalysisResult(null)}
        onApplyUpgrade={handleMorphologyUpgrade}
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
