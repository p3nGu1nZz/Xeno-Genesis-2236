import React, { useState, useEffect, useRef, useCallback } from 'react';
import { analyzeXenobot } from './services/geminiService';
import SimulationCanvas from './components/SimulationCanvas';
import { Controls } from './components/Controls';
import { AnalysisPanel } from './components/AnalysisPanel';
import { GenomeVisualizer } from './components/GenomeVisualizer';
import { TitleScreen } from './components/TitleScreen';
import { SettingsPanel } from './components/SettingsPanel';
import { HelpModal } from './components/HelpModal';
import { Xenobot, Genome, AnalysisResult, CameraState, SimulationConfig, SaveData, TickPayload } from './types';
import { DEFAULT_CONFIG } from './constants';
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
  const [timeLeft, setTimeLeft] = useState(config.generationDuration || 600);
  
  // Simulation Engine State (Main Thread)
  const engineRef = useRef<PhysicsEngine | null>(null);
  const populationRef = useRef<Genome[]>([]);
  const timeLeftRef = useRef<number>(config.generationDuration || 600);
  
  // We use a Ref for bots to pass to Canvas to avoid re-renders
  const botsRef = useRef<Xenobot[]>([]); 
  
  const [bestGenome, setBestGenome] = useState<Genome | null>(null);
  
  // Camera State
  const [camera, setCamera] = useState<CameraState>({ x: 0, y: 0, zoom: 1 });
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
    if (!pop || pop.length === 0) {
        pop = Array(cfg.populationSize).fill(null).map(() => createRandomGenome(1));
    } else {
        // Resize population if config changed
        if (pop.length < cfg.populationSize) {
             const needed = cfg.populationSize - pop.length;
             const extras = Array(needed).fill(null).map(() => createRandomGenome(startGen || 1));
             pop = [...pop, ...extras];
        } else if (pop.length > cfg.populationSize) {
             pop = pop.slice(0, cfg.populationSize);
        }
    }

    populationRef.current = pop;
    const currentGen = startGen || 1;
    setGeneration(currentGen);

    // Create Bots
    engine.bots = pop.map(g => engine.createBot(g, 100, 200));
    
    engineRef.current = engine;
    botsRef.current = engine.bots;
    
    timeLeftRef.current = cfg.generationDuration || 600;
    setTimeLeft(timeLeftRef.current);
    setBestGenome(null);
  }, []);

  const evolve = useCallback(() => {
      if (!engineRef.current) return;

      // 1. Evaluate
      const currentBots = engineRef.current.bots;
      const evaluatedGenomes = populationRef.current.map(genome => {
        const bot = currentBots.find(b => b.genome.id === genome.id);
        const fitness = bot ? engineRef.current!.evaluateFitness(bot) : 0;
        return { ...genome, fitness };
      });

      // 2. Sort & Pick Best
      const sorted = [...evaluatedGenomes].sort((a, b) => b.fitness - a.fitness);
      const best = sorted[0];
      setBestGenome(best);

      // 3. Evolve
      const nextGen = evolvePopulation(evaluatedGenomes, generation);
      populationRef.current = nextGen;
      
      const nextGenNum = generation + 1;
      setGeneration(nextGenNum);

      // 4. Rebuild Physics World
      engineRef.current.bots = nextGen.map(g => engineRef.current!.createBot(g, 100, 200));
      botsRef.current = engineRef.current.bots;

      // 5. Reset Timer
      timeLeftRef.current = config.generationDuration || 600;
      setTimeLeft(timeLeftRef.current);
  }, [config, generation]);

  const updateSimulation = useCallback(() => {
      if (!engineRef.current) return;
      
      // Update Physics
      engineRef.current.update(performance.now() / 1000);
      botsRef.current = engineRef.current.bots;

      // Update Timer
      timeLeftRef.current -= 1;
      
      // Sync UI less frequently to save performance? 
      // For smoothness we do every frame, but we could throttle this.
      setTimeLeft(timeLeftRef.current);

      // Find best for realtime feedback (optional, maybe expensive every frame)
      // let maxFit = -Infinity;
      // let leader = null;
      // engineRef.current.bots.forEach(b => {
      //   if (b.centerOfMass.x > maxFit) { maxFit = b.centerOfMass.x; leader = b; }
      // });
      // if (leader) setBestGenome(leader.genome);

      if (timeLeftRef.current <= 0) {
          evolve();
      }
  }, [evolve]);

  // --- Helper to extract population for saving ---
  const getPopulationFromBots = (): Genome[] => {
      return populationRef.current;
  };

  const getCenteredCamera = (width: number, height: number, zoom: number = 1.0) => {
    const targetX = 250;
    const targetY = 350;
    return {
        x: (width / 2) / zoom - targetX,
        y: (height / 2) / zoom - targetY,
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
    initSimulation(config);
    setCamera(getCenteredCamera(window.innerWidth, window.innerHeight, 1.0));
    setShowHelp(true); 
    setIsRunning(true);
  };

  const handleApplySettings = (newConfig: SimulationConfig) => {
    setConfig(newConfig);
    // Re-init if structural changes, otherwise just update props
    // For simplicity, we restart to apply population/grid changes safely
    initSimulation(newConfig);
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
    if (!bestGenome) return;
    setIsAnalyzing(true);
    const result = await analyzeXenobot(bestGenome, generation);
    setAnalysisResult(result);
    setIsAnalyzing(false);
  };

  const resetCamera = () => {
      setCamera(getCenteredCamera(window.innerWidth, window.innerHeight, 1.0));
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
                <div>PHYSICS_ENGINE: MAIN_THREAD_FALLBACK</div>
                <div>GRAVITY: {config.gravity.toFixed(2)} m/s²</div>
                <div>POPULATION: {config.populationSize}</div>
                <div>TRAINING_DURATION: {config.generationDuration || 600}</div>
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

      {/* FLOATING PANELS */}
      <GenomeVisualizer genome={bestGenome} />
      
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