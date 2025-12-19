import React, { useState, useEffect, useRef, useCallback } from 'react';
import { PhysicsEngine } from './services/physicsEngine';
import { createRandomGenome, evolvePopulation } from './services/geneticAlgorithm';
import { analyzeXenobot } from './services/geminiService';
import SimulationCanvas from './components/SimulationCanvas';
import { Controls } from './components/Controls';
import { AnalysisPanel } from './components/AnalysisPanel';
import { GenomeVisualizer } from './components/GenomeVisualizer';
import { TitleScreen } from './components/TitleScreen';
import { SettingsPanel } from './components/SettingsPanel';
import { Xenobot, Genome, AnalysisResult, CameraState, SimulationConfig, SaveData } from './types';
import { GENERATION_TIME, DEFAULT_CONFIG } from './constants';
import { ScanEye } from 'lucide-react';

const App: React.FC = () => {
  // Application State
  const [appState, setAppState] = useState<'TITLE' | 'SIMULATION'>('TITLE');
  const [showSettings, setShowSettings] = useState(false);
  const [config, setConfig] = useState<SimulationConfig>(DEFAULT_CONFIG);

  // Simulation State
  const [generation, setGeneration] = useState(1);
  const [isRunning, setIsRunning] = useState(false);
  const [timeLeft, setTimeLeft] = useState(GENERATION_TIME);
  const [population, setPopulation] = useState<Genome[]>([]);
  const [bots, setBots] = useState<Xenobot[]>([]);
  const [bestGenome, setBestGenome] = useState<Genome | null>(null);
  
  // Camera State
  const [camera, setCamera] = useState<CameraState>({ x: 0, y: 0, zoom: 1 });
  const keysPressed = useRef<Set<string>>(new Set());
  
  // Analysis State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);

  // Refs for loop
  const requestRef = useRef<number>(0);
  const physicsRef = useRef<PhysicsEngine>(new PhysicsEngine(DEFAULT_CONFIG));
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 1000, height: 600 });

  // --- Initialization Logic ---

  // Handle Resize
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight
        });
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize(); // Initial call
    return () => window.removeEventListener('resize', handleResize);
  }, [appState]);

  // Keyboard Inputs
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

  const initializeSimulation = (cfg: SimulationConfig, startingPopulation?: Genome[]) => {
    // 1. Reset Physics Engine with new Config
    physicsRef.current = new PhysicsEngine(cfg);
    
    // 2. Create Population
    let pop = startingPopulation;
    if (!pop || pop.length === 0) {
        pop = Array(cfg.populationSize).fill(null).map(() => createRandomGenome(1));
    } else {
        // Adjust population size if config changed but we are carrying over old pop
        if (pop.length < cfg.populationSize) {
            const needed = cfg.populationSize - pop.length;
            const extras = Array(needed).fill(null).map(() => createRandomGenome(generation));
            pop = [...pop, ...extras];
        } else if (pop.length > cfg.populationSize) {
            pop = pop.slice(0, cfg.populationSize);
        }
    }

    setPopulation(pop);
    
    // 3. Create Bots
    physicsRef.current.bots = [];
    pop.forEach((g) => {
        const bot = physicsRef.current.createBot(g, 100, 200);
        physicsRef.current.bots.push(bot);
    });
    setBots([...physicsRef.current.bots]);
    setBestGenome(null);
  };

  const startNewSimulation = () => {
    setAppState('SIMULATION');
    setGeneration(1);
    setTimeLeft(GENERATION_TIME);
    initializeSimulation(config);
    setIsRunning(true);
  };

  const handleApplySettings = (newConfig: SimulationConfig) => {
    setConfig(newConfig);
    setGeneration(1);
    setTimeLeft(GENERATION_TIME);
    initializeSimulation(newConfig); // Re-roll random population
    setShowSettings(false);
    setIsRunning(true);
  };

  const handleLoadSave = (data: SaveData) => {
    setConfig(data.config);
    setGeneration(data.generation);
    // Restore population
    initializeSimulation(data.config, data.population);
    setShowSettings(false);
    setIsRunning(false); // Let user start it
    alert(`Simulation loaded: Generation ${data.generation}`);
  };

  const evolve = useCallback(() => {
    const currentBots = physicsRef.current.bots;
    const evaluatedGenomes = population.map(genome => {
        const bot = currentBots.find(b => b.genome.id === genome.id);
        const fitness = bot ? physicsRef.current.evaluateFitness(bot) : 0;
        return { ...genome, fitness };
    });

    const sorted = [...evaluatedGenomes].sort((a, b) => b.fitness - a.fitness);
    setBestGenome(sorted[0]);

    const nextGen = evolvePopulation(evaluatedGenomes, generation);
    setPopulation(nextGen);
    setGeneration(g => g + 1);
    
    // Re-init physics objects
    physicsRef.current.bots = [];
    nextGen.forEach(g => {
        const bot = physicsRef.current.createBot(g, 100, 200);
        physicsRef.current.bots.push(bot);
    });
    setBots([...physicsRef.current.bots]);
    setTimeLeft(GENERATION_TIME);
  }, [population, generation]);

  // --- Animation Loop ---

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

  const animate = useCallback((time: number) => {
    updateCamera();

    // Pause physics if settings are open
    if (isRunning && !showSettings && appState === 'SIMULATION') {
        physicsRef.current.update(time / 1000); 
        
        if (!bestGenome) {
            let maxFit = -Infinity;
            let leader: Xenobot | null = null;
            physicsRef.current.bots.forEach(b => {
                if (b.centerOfMass.x > maxFit) {
                    maxFit = b.centerOfMass.x;
                    leader = b;
                }
            });
            if (leader) setBestGenome((leader as Xenobot).genome);
        }

        setTimeLeft(prev => {
        if (prev <= 1) {
            evolve();
            return GENERATION_TIME;
        }
        return prev - 1;
        });
    }
    
    if (appState === 'SIMULATION') {
        setBots([...physicsRef.current.bots]); 
    }
    requestRef.current = requestAnimationFrame(animate);
  }, [isRunning, evolve, bestGenome, camera, showSettings, appState]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isRunning, animate]);

  // --- Interactions ---

  const handleAnalyze = async () => {
    if (!bestGenome) return;
    setIsAnalyzing(true);
    const result = await analyzeXenobot(bestGenome, generation);
    setAnalysisResult(result);
    setIsAnalyzing(false);
  };

  const resetCamera = () => setCamera({ x: 0, y: 0, zoom: 1 });

  // --- Render ---

  if (appState === 'TITLE') {
      return <TitleScreen onStart={startNewSimulation} />;
  }

  return (
    <div className="flex h-screen bg-deep-space text-white overflow-hidden font-mono selection:bg-neon-cyan selection:text-black">
      <Controls 
        isRunning={isRunning} 
        generation={generation}
        timeRemaining={timeLeft}
        onTogglePlay={() => setIsRunning(!isRunning)}
        onAnalyze={handleAnalyze}
        onOpenSettings={() => {
            setIsRunning(false);
            setShowSettings(true);
        }}
        isAnalyzing={isAnalyzing}
      />
      
      <div className="flex-1 relative flex flex-col" ref={containerRef}>
        {/* HUD Header */}
        <div className="absolute top-0 left-0 w-full p-4 pointer-events-none flex justify-between items-start z-10">
            <div className="bg-slate-900/50 backdrop-blur border border-slate-700 p-2 rounded text-xs text-slate-400">
                <div>PHYSICS_ENGINE: OPTIMIZED_VERLET</div>
                <div>GRAVITY: {config.gravity.toFixed(2)} m/s²</div>
                <div>POPULATION: {population.length}</div>
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
        
        {/* Instructions Overlay */}
        <div className="absolute bottom-6 left-6 pointer-events-none text-[10px] text-slate-500 font-mono z-10">
            <div>[WASD / ARROWS] PAN CAMERA</div>
            <div>[Q / E] ZOOM LEVEL</div>
        </div>

        <SimulationCanvas 
          bots={bots} 
          width={dimensions.width} 
          height={dimensions.height}
          groundY={config.groundHeight} 
          camera={camera}
        />
        
        {/* Background Grid Pattern */}
        <div className="absolute inset-0 pointer-events-none opacity-10" 
             style={{
               backgroundImage: `radial-gradient(circle at 50% 50%, #00f3ff 1px, transparent 1px)`,
               backgroundSize: '40px 40px'
             }}>
        </div>

        <GenomeVisualizer genome={bestGenome} />
        
        <AnalysisPanel 
          result={analysisResult} 
          onClose={() => setAnalysisResult(null)} 
        />

        {showSettings && (
            <SettingsPanel 
                config={config} 
                onSave={handleApplySettings}
                onLoad={handleLoadSave}
                onClose={() => setShowSettings(false)}
                population={population}
                generation={generation}
            />
        )}
      </div>
    </div>
  );
};

export default App;