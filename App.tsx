
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

  // Simulation State
  const [generation, setGeneration] = useState(1);
  const [isRunning, setIsRunning] = useState(false);
  const [acousticActive, setAcousticActive] = useState(false);
  
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
    engine.bots = pop.map((g, i) => {
        let startX = 0;
        if (typeof g.originX === 'number' && !isNaN(g.originX)) {
             startX = g.originX + (Math.random() - 0.5) * 50; 
        } else {
           const match = g.color.match(/hsl\((\d+\.?\d*)/);
           const hue = match ? parseFloat(match[1]) : 0;
           const isGroupA = (hue > 150 && hue < 230);
           // Group A starts at 0, Group B starts further out
           startX = isGroupA ? 0 : 1200; 
           startX += (Math.random() - 0.5) * 150; 
           g.originX = startX;
        }
        return engine.createBot(g, startX, 200 + Math.random() * 100);
    });

    engineRef.current = engine;
    botsRef.current = engine.bots;
  }, []);

  const evolveContinuous = () => {
      const engine = engineRef.current;
      if (!engine) return;
      
      const groups = [0, 1];
      let evolutionOccurred = false;
  
      groups.forEach(groupId => {
          const groupBots = engine.bots.filter(b => b.groupId === groupId);
          const targetGroupSize = Math.floor(engine.config.populationSize / 2);
          
          if (groupBots.length === 0) {
              const newG = createRandomGenome(generation, groupId === 0 ? 190 : 340);
              const parentPos = groupId === 0 ? 0 : 1200;
              const bot = engine.createBot(newG, parentPos, 200);
              engine.addBot(bot);
              return;
          }
  
          // Probabilistic Reproduction Check
          if (Math.random() > 0.005) return;
  
          groupBots.sort((a, b) => b.centerOfMass.x - a.centerOfMass.x);
          
          if (groupBots.length >= targetGroupSize) {
               const victim = groupBots[groupBots.length - 1];
               engine.removeBot(victim.id);
          }
  
          const parent1 = groupBots[0];
          const parent2 = groupBots.length > 1 ? groupBots[1] : groupBots[0];
          
          const parents = [parent1.genome, parent2.genome];
          const nextGenParams = evolvePopulation(parents, generation, 10);
          const childGenome = nextGenParams[nextGenParams.length - 1];
          
          const spawnX = parent1.centerOfMass.x - 50 - Math.random() * 50; 
          const spawnY = parent1.centerOfMass.y + (Math.random() - 0.5) * 50;
          
          childGenome.originX = spawnX; 
  
          const childBot = engine.createBot(childGenome, spawnX, spawnY);
          engine.addBot(childBot);
          
          evolutionOccurred = true;
      });
  
      if (evolutionOccurred) {
          setGeneration(g => g + 1);
          populationRef.current = engine.bots.map(b => b.genome);
      }
  };

  const updateBestGenomes = () => {
    const engine = engineRef.current;
    if (!engine) return;

    // Best A
    const botsA = engine.bots.filter(b => b.groupId === 0);
    if (botsA.length > 0) {
        const bestA = botsA.reduce((prev, curr) => (curr.centerOfMass.x > prev.centerOfMass.x ? curr : prev));
        setBestGenomeA(bestA.genome);
    }

    // Best B
    const botsB = engine.bots.filter(b => b.groupId === 1);
    if (botsB.length > 0) {
        const bestB = botsB.reduce((prev, curr) => (curr.centerOfMass.x > prev.centerOfMass.x ? curr : prev));
        setBestGenomeB(bestB.genome);
    }
  };

  const simulationLoop = (time: number) => {
      const engine = engineRef.current;
      if (!engine) return;

      if (isRunning) {
          engine.update(time / 1000); // Physics Update
          // IMPORTANT: Sync the Ref with the latest array from engine
          // Because engine methods like removeBot might replace the array reference
          botsRef.current = engine.bots; 

          totalTickRef.current += 1;
          evolutionTimerRef.current += 1;

          if (evolutionTimerRef.current >= EVOLUTION_INTERVAL) {
             evolveContinuous();
             evolutionTimerRef.current = 0;
          }

          if (totalTickRef.current % 30 === 0) {
             updateBestGenomes();
          }
      }

      // Camera Handling
      const now = Date.now();
      
      // Auto-re-enable auto-camera after 3 seconds of manual inactivity
      if (!isAutoCameraRef.current && now - lastInputTimeRef.current > 3000) {
          isAutoCameraRef.current = true;
      }

      // Manual Control
      if (keysPressed.current.size > 0) {
          isAutoCameraRef.current = false;
          lastInputTimeRef.current = now;
          
          let dx = 0, dy = 0;
          const speed = 15 / camera.zoom;
          
          if (keysPressed.current.has('a') || keysPressed.current.has('arrowleft')) dx -= speed; // Move camera left
          if (keysPressed.current.has('d') || keysPressed.current.has('arrowright')) dx += speed; // Move camera right
          if (keysPressed.current.has('w') || keysPressed.current.has('arrowup')) dy -= speed; // Move camera up
          if (keysPressed.current.has('s') || keysPressed.current.has('arrowdown')) dy += speed; // Move camera down
          
          if (dx !== 0 || dy !== 0) {
              setCamera(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
          }
      } 
      // Auto Follow Logic (Group A - Natives)
      else if (isAutoCameraRef.current && isRunning) {
          const groupA = engine.bots.filter(b => b.groupId === 0 && !b.isDead);
          
          if (groupA.length > 0) {
              let avgX = 0, avgY = 0;
              let count = 0;
              // Only follow top 50% performers to keep camera moving forward
              const sorted = [...groupA].sort((a,b) => b.centerOfMass.x - a.centerOfMass.x);
              const topHalf = sorted.slice(0, Math.max(1, Math.ceil(sorted.length / 2)));

              topHalf.forEach(b => { 
                  avgX += b.centerOfMass.x; 
                  avgY += b.centerOfMass.y; 
                  count++;
              });
              
              if (count > 0) {
                  avgX /= count;
                  avgY /= count;

                  // Target: Keep swarm center at left 40% of screen to show path ahead
                  // ScreenX = (WorldX - CamX) * Zoom + Width/2
                  // We want ScreenX = 0.4 * Width (left side)
                  // 0.4*W - 0.5*W = (AvgX - CamX) * Zoom
                  // -0.1*W / Zoom = AvgX - CamX
                  // CamX = AvgX + (0.1*W) / Zoom
                  
                  const targetCamX = avgX + (dimensions.width * 0.10 / camera.zoom); 
                  const targetCamY = avgY;

                  // Fine-tuned lerp for smoother follow and reactivation (0.05)
                  const lerp = 0.05; 
                  setCamera(prev => ({
                      ...prev,
                      x: prev.x + (targetCamX - prev.x) * lerp,
                      y: prev.y + (targetCamY - prev.y) * lerp,
                  }));
              }
          }
      }

      requestRef.current = requestAnimationFrame(simulationLoop);
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(simulationLoop);
    return () => cancelAnimationFrame(requestRef.current);
  }, [isRunning, camera, dimensions]);

  // Window Resize
  useEffect(() => {
    const handleResize = () => setDimensions({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Keyboard Input
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          keysPressed.current.add(e.key.toLowerCase());
          if (e.key === 'q' || e.key === '-') setCamera(c => ({...c, zoom: Math.max(0.1, c.zoom * 0.95)}));
          if (e.key === 'e' || e.key === '=') setCamera(c => ({...c, zoom: Math.min(2.0, c.zoom * 1.05)}));
      };
      const handleKeyUp = (e: KeyboardEvent) => {
          keysPressed.current.delete(e.key.toLowerCase());
      };
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);
      return () => {
          window.removeEventListener('keydown', handleKeyDown);
          window.removeEventListener('keyup', handleKeyUp);
      };
  }, []);

  const handleStart = () => {
    if (appState === 'TITLE') {
        initSimulation(config);
        setAppState('SIMULATION');
        setIsRunning(true);
    } else {
        setIsRunning(!isRunning);
    }
  };

  const handleAnalyze = async () => {
     if (isAnalyzing || !bestGenomeA) return;
     setIsAnalyzing(true);
     
     // Find the best bot object
     const engine = engineRef.current;
     if (engine) {
         const bot = engine.bots.find(b => b.genome.id === bestGenomeA.id);
         if (bot) {
             const result = await analyzeXenobot(bot);
             setAnalysisResult(result);
         }
     }
     setIsAnalyzing(false);
  };

  return (
    <>
      {appState === 'TITLE' && <TitleScreen onStart={handleStart} />}
      
      {appState === 'SIMULATION' && (
        <div className="relative w-full h-full overflow-hidden bg-deep-space">
          <SimulationCanvas 
            botsRef={botsRef}
            width={dimensions.width}
            height={dimensions.height}
            groundY={config.groundHeight}
            camera={camera}
          />
          
          <div className="absolute top-0 left-0 bottom-0 z-30">
             <Controls 
                isRunning={isRunning}
                generation={generation}
                timeRemaining={0}
                onTogglePlay={() => setIsRunning(!isRunning)}
                onAnalyze={handleAnalyze}
                onOpenSettings={() => { setShowSettings(true); setIsRunning(false); }}
                isAnalyzing={isAnalyzing}
                onToggleAcoustic={() => {
                    setAcousticActive(!acousticActive);
                    setConfig(prev => ({...prev, acousticFreq: !acousticActive ? 300 : 0}));
                    if (engineRef.current) engineRef.current.config.acousticFreq = !acousticActive ? 300 : 0;
                }}
                acousticActive={acousticActive}
                isCollapsed={isSidebarCollapsed}
                onToggleCollapse={() => setSidebarCollapsed(!isSidebarCollapsed)}
             />
          </div>
          
          <AnalysisPanel result={analysisResult} onClose={() => setAnalysisResult(null)} />
          
          {showSettings && (
             <SettingsPanel 
                config={config} 
                onSave={(newCfg) => {
                    setConfig(newCfg);
                    initSimulation(newCfg, populationRef.current, generation);
                    setShowSettings(false);
                    setIsRunning(true);
                }}
                onLoad={(data) => {
                    setConfig(data.config);
                    initSimulation(data.config, data.population, data.generation);
                    setShowSettings(false);
                }}
                onClose={() => setShowSettings(false)}
                population={populationRef.current}
                generation={generation}
             />
          )}

          <HelpModal open={showHelp} onClose={() => setShowHelp(false)} />
          
          <div className="absolute bottom-6 right-6 flex gap-4">
              <button onClick={() => setShowHelp(true)} className="p-2 bg-slate-800 rounded-full text-slate-400 hover:text-white border border-slate-600">
                  <ScanEye size={20} />
              </button>
          </div>

          <GenomeVisualizer genome={bestGenomeA} label="GROUP A (NATIVE)" borderColor="border-neon-cyan" initialPosition={{x: 350, y: 30}} hidden={isSidebarCollapsed} onMinimize={() => {}} />
          <GenomeVisualizer genome={bestGenomeB} label="GROUP B (INVADER)" borderColor="border-neon-magenta" initialPosition={{x: 350, y: 300}} hidden={isSidebarCollapsed} onMinimize={() => {}} />
        </div>
      )}
    </>
  );
};

export default App;
