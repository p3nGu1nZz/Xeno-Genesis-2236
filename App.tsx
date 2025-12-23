import React, { useState, useEffect, useRef, useCallback } from 'react';
import { analyzeXenobot } from './services/geminiService';
import { SimulationCanvas } from './components/SimulationCanvas';
import { Controls } from './components/Controls';
import { AnalysisPanel } from './components/AnalysisPanel';
import { GenomePanel } from './components/GenomePanel';
import { MomBotPanel } from './components/MomBotPanel';
import { TitleScreen } from './components/TitleScreen';
import { SettingsPanel } from './components/SettingsPanel';
import { HelpModal } from './components/HelpModal';
import { DriftPanel } from './components/DriftPanel';
import { Xenobot, Genome, AnalysisResult, CameraState, SimulationConfig, Food, GeneticStats } from './types';
import { DEFAULT_CONFIG, EVOLUTION_INTERVAL } from './constants';
import { ScanEye, Volume2, VolumeX } from 'lucide-react';
import { PhysicsEngine } from './services/physicsEngine';
import { createRandomGenome } from './services/geneticAlgorithm';
import { AudioManager } from './services/audioManager';

const App: React.FC = () => {
  // Application State
  const [appState, setAppState] = useState<'TITLE' | 'SIMULATION'>('TITLE');
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [config, setConfig] = useState<SimulationConfig>(DEFAULT_CONFIG);
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Audio State
  const audioManagerRef = useRef<AudioManager | null>(null);
  const [isMuted, setIsMuted] = useState(false);

  // Simulation State
  const [generation, setGeneration] = useState(1);
  const [isRunning, setIsRunning] = useState(false);
  const [evolutionProgress, setEvolutionProgress] = useState(0);
  
  // Genome Visibility State
  const [showGenomePanel, setShowGenomePanel] = useState(false);
  const [showDriftPanel, setShowDriftPanel] = useState(false);
  
  // MomBot Interface State
  const [showMomBotPanel, setShowMomBotPanel] = useState(false);
  
  // Genetic History
  const [geneticHistory, setGeneticHistory] = useState<GeneticStats[]>([]);

  // Simulation Engine State (Main Thread)
  const engineRef = useRef<PhysicsEngine | null>(null);
  const populationRef = useRef<Genome[]>([]);
  const evolutionTimerRef = useRef<number>(0);
  const totalTickRef = useRef<number>(0);
  
  // We use a Ref for bots to pass to Canvas to avoid re-renders
  const botsRef = useRef<Xenobot[]>([]); 
  const foodRef = useRef<Food[]>([]);
  
  // Dynamic list of representative genomes for the panel
  // Now includes energy field and botId for camera tracking
  const [activeGenomeGroups, setActiveGenomeGroups] = useState<{name: string, genome: Genome | null, color: string, energy: number, botId?: string}[]>([]);
  
  // Camera State
  const [camera, setCamera] = useState<CameraState>({ x: 0, y: 0, zoom: 0.55 });
  const [followingBotId, setFollowingBotId] = useState<string | null>(null);
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

  // --- Audio Initialization ---
  useEffect(() => {
    if (!audioManagerRef.current) {
        audioManagerRef.current = new AudioManager();
        // Initialize muted state based on manager default
        setIsMuted(audioManagerRef.current.getMuteState());
    }
  }, []);

  const toggleMute = () => {
      if (audioManagerRef.current) {
          const muted = audioManagerRef.current.toggleMute();
          setIsMuted(muted || false);
      }
  };

  // --- Simulation Logic (Main Thread) ---

  const initSimulation = useCallback((cfg: SimulationConfig, startPop?: Genome[], startGen?: number) => {
    const engine = new PhysicsEngine(cfg);
    
    let pop = startPop ? [...startPop] : [];
    const currentGen = startGen || 1;

    // Strict Population Cap Enforcement
    if (pop.length > cfg.populationSize) {
        pop = pop.slice(0, cfg.populationSize);
    }

    // Population Initialization Strategy
    if (pop.length < cfg.populationSize) {
        const totalSize = Math.max(2, cfg.populationSize);
        // Force exactly 2 if config says so, otherwise split evenly
        const sizeA = Math.floor(totalSize / 2);
        const sizeB = totalSize - sizeA;
        
        // Group A: "Natives" (Cyan/Blue range ~190)
        const groupA = Array(sizeA).fill(null).map(() => createRandomGenome(currentGen, 190)); 
        
        // Group B: "Invaders" (Magenta/Red range ~340)
        const groupB = Array(sizeB).fill(null).map(() => createRandomGenome(currentGen, 340)); 
        
        pop = [...pop, ...groupA, ...groupB].slice(0, cfg.populationSize);
    } 

    populationRef.current = pop;
    setGeneration(currentGen);

    // Create Bots with Position Logic
    engine.bots = pop.map((g, i) => {
        let startX = 0;
        let startY = 200 + Math.random() * 100;

        if (typeof g.originX === 'number' && !isNaN(g.originX)) {
             startX = g.originX + (Math.random() - 0.5) * 50; 
        } else {
           const match = g.color.match(/hsl\((\d+\.?\d*)/);
           const hue = match ? parseFloat(match[1]) : 0;
           const isGroupA = (hue > 150 && hue < 230);
           
           // Centered Spawn: Group A at -2400, Group B at +2400 for immense separation
           startX = isGroupA ? -2400 : 2400; 
           startX += (Math.random() - 0.5) * 100; // Reduced spread
           g.originX = startX;
        }
        
        // Use originY if available for vertical positioning
        if (typeof g.originY === 'number' && !isNaN(g.originY)) {
            startY = g.originY + (Math.random() - 0.5) * 50;
        }

        return engine.createBot(g, startX, startY);
    });

    engineRef.current = engine;
    botsRef.current = engine.bots;
    foodRef.current = engine.food;
    evolutionTimerRef.current = 0;
    setEvolutionProgress(0);
    setFollowingBotId(null);
    setGeneticHistory([]); // Reset history on init
  }, []);

  const evolveContinuous = () => {
      const engine = engineRef.current;
      if (!engine) return;
      
      // Capture Stats before mutation for the finishing generation
      const stats = engine.getPopulationStats(generation);
      setGeneticHistory(prev => [...prev, stats]);

      // Perform evolution step
      const evolutionOccurred = engine.evolvePopulation(generation);
  
      // Always increment the cycle counter to reflect the passage of evolutionary epochs
      setGeneration(g => g + 1);

      // Only update population ref if actual changes to gene pool happened (optimization)
      if (evolutionOccurred) {
          populationRef.current = engine.bots.map(b => b.genome);
      }
      
      // Reset cycle timer
      evolutionTimerRef.current = 0;
      setEvolutionProgress(0);
  };

  const updateGenomeGroups = () => {
    const engine = engineRef.current;
    if (!engine) return;

    // Group 0: Cyans (150-230 hue)
    const natives = engine.bots.filter(b => b.groupId === 0);

    // Group 1: Magentas (Everyone else or specifically group 1)
    const invaders = engine.bots.filter(b => b.groupId === 1);
    
    // Group 2+: Mutant Offspring from Mitosis
    const mutants = engine.bots.filter(b => b.groupId > 1);

    const groups = [];

    if (natives.length > 0) {
        const bestNative = natives.reduce((prev, curr) => (curr.energy > prev.energy ? curr : prev));
        const totalEnergy = natives.reduce((sum, b) => sum + b.energy, 0);
        groups.push({
            name: "NATIVE STRAIN (ALPHA)",
            genome: bestNative.genome,
            color: bestNative.genome.color,
            energy: totalEnergy,
            botId: bestNative.id
        });
    }

    if (invaders.length > 0) {
        const bestInvader = invaders.reduce((prev, curr) => (curr.energy > prev.energy ? curr : prev));
        const totalEnergy = invaders.reduce((sum, b) => sum + b.energy, 0);
        groups.push({
            name: "INVASIVE STRAIN (BETA)",
            genome: bestInvader.genome,
            color: bestInvader.genome.color,
            energy: totalEnergy,
            botId: bestInvader.id
        });
    }
    
    // For mutants, we group by ID to avoid clutter if many splits happen
    if (mutants.length > 0) {
        const mutantGroups = new Map<number, Xenobot[]>();
        mutants.forEach(b => {
            if (!mutantGroups.has(b.groupId)) mutantGroups.set(b.groupId, []);
            mutantGroups.get(b.groupId)!.push(b);
        });

        mutantGroups.forEach((bots, gId) => {
            if (bots.length === 0) return;
            const bestMutant = bots.reduce((prev, curr) => (curr.energy > prev.energy ? curr : prev));
            const totalEnergy = bots.reduce((sum, b) => sum + b.energy, 0);
             groups.push({
                name: `MUTANT COLONY ${gId}`,
                genome: bestMutant.genome,
                color: bestMutant.genome.color,
                energy: totalEnergy,
                botId: bestMutant.id
            });
        });
    }

    setActiveGenomeGroups(groups);
  };

  const simulationLoop = (time: number) => {
      const engine = engineRef.current;
      if (!engine) return;

      if (isRunning) {
          engine.update(time / 1000); // Physics Update
          
          // Process Physics Events for Audio
          if (engine.events.length > 0) {
              engine.events.forEach(e => {
                  if (e === 'COLLISION') audioManagerRef.current?.playCollisionSound();
                  if (e === 'EAT') audioManagerRef.current?.playEatSound();
                  if (e === 'MITOSIS') audioManagerRef.current?.playMitosisSound();
                  if (e === 'DEATH') audioManagerRef.current?.playDeathSound();
              });
          }

          // Sync Refs
          botsRef.current = engine.bots; 
          foodRef.current = engine.food;

          totalTickRef.current += 1;
          evolutionTimerRef.current += 1;

          // Update Progress Bar State (Throttled)
          if (totalTickRef.current % 4 === 0) {
              const progress = Math.min(1, evolutionTimerRef.current / EVOLUTION_INTERVAL);
              setEvolutionProgress(progress);
          }

          if (evolutionTimerRef.current >= EVOLUTION_INTERVAL) {
             evolveContinuous();
          }

          if (totalTickRef.current % 30 === 0) {
             updateGenomeGroups();
             // Sync population ref for Save/Load functionality to include new children
             populationRef.current = engine.bots.filter(b => !b.isDead).map(b => b.genome);
          }
      }

      // Camera Handling
      const now = Date.now();
      
      // Auto-re-enable auto-camera after 3 seconds of manual inactivity
      if (!isAutoCameraRef.current && now - lastInputTimeRef.current > 3000) {
          isAutoCameraRef.current = true;
      }

      // Manual Control - Immediate Priority
      if (keysPressed.current.size > 0) {
          isAutoCameraRef.current = false;
          lastInputTimeRef.current = now;
          setFollowingBotId(null);
          
          let dx = 0, dy = 0;
          const speed = 15 / camera.zoom;
          
          if (keysPressed.current.has('a') || keysPressed.current.has('arrowleft')) dx -= speed; 
          if (keysPressed.current.has('d') || keysPressed.current.has('arrowright')) dx += speed; 
          if (keysPressed.current.has('w') || keysPressed.current.has('arrowup')) dy -= speed; 
          if (keysPressed.current.has('s') || keysPressed.current.has('arrowdown')) dy += speed; 
          
          if (dx !== 0 || dy !== 0) {
              setCamera(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
          }
      } 
      // Auto Follow Logic (With Selection Support)
      else if (isAutoCameraRef.current && isRunning) {
          let targetBot: Xenobot | undefined;

          // 1. If following a specific selected bot
          if (followingBotId) {
             targetBot = engine.bots.find(b => b.id === followingBotId && !b.isDead);
             // If selected bot died, fall back to default behavior below
          }
          
          // 2. Default Behavior: Follow Leader of Group A (Natives)
          if (!targetBot) {
              const groupA = engine.bots.filter(b => !b.isDead && b.groupId === 0);
              if (groupA.length > 0) {
                  // Find highest energy bot in Group A
                  targetBot = groupA.reduce((prev, curr) => (curr.energy > prev.energy ? curr : prev));
              } else {
                  // Fallback: Any living bot
                  targetBot = engine.bots.find(b => !b.isDead);
              }
          }

          if (targetBot) {
             // Offset logic: Keep bot in the left ~35% of the screen
             const offsetX = (dimensions.width * 0.15) / camera.zoom;

             const targetCamX = targetBot.centerOfMass.x + offsetX;
             const targetCamY = targetBot.centerOfMass.y;
             
             // SMOOTHER CAMERA TRACKING (Reduced from 0.1)
             const lerp = 0.05; 
             
             setCamera(prev => ({
                 ...prev,
                 x: prev.x + (targetCamX - prev.x) * lerp,
                 y: prev.y + (targetCamY - prev.y) * lerp,
             }));
          }
      }

      requestRef.current = requestAnimationFrame(simulationLoop);
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(simulationLoop);
    return () => cancelAnimationFrame(requestRef.current);
  }, [isRunning, camera, dimensions, followingBotId]);

  // Window Resize
  useEffect(() => {
    const handleResize = () => setDimensions({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Keyboard Input
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          // Prevent arrow keys from scrolling the window
          if(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
              e.preventDefault();
          }
          
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
    // Attempt to start audio context if muted/suspended
    if (audioManagerRef.current && !isMuted) {
        audioManagerRef.current.startDrone();
    }

    if (appState === 'TITLE') {
        initSimulation(config);
        setAppState('SIMULATION');
        setIsRunning(true);
    } else {
        setIsRunning(!isRunning);
    }
  };

  const handleAnalyze = async () => {
     if (isAnalyzing || activeGenomeGroups.length === 0) return;
     setIsAnalyzing(true);
     
     const engine = engineRef.current;
     if (engine) {
         // Analyze the currently followed bot if exists, else the top group
         const targetId = followingBotId || activeGenomeGroups[0]?.botId;
         
         if (targetId) {
            const bot = engine.bots.find(b => b.id === targetId);
            if (bot) {
                const result = await analyzeXenobot(bot);
                setAnalysisResult(result);
            }
         }
     }
     setIsAnalyzing(false);
  };

  return (
    <>
      {appState === 'TITLE' && (
          <TitleScreen 
              onStart={handleStart} 
              isMuted={isMuted} 
              onToggleMute={toggleMute} 
          />
      )}
      
      {appState === 'SIMULATION' && (
        <div className="relative w-full h-full overflow-hidden bg-deep-space">
          <SimulationCanvas 
            botsRef={botsRef}
            foodRef={foodRef}
            width={dimensions.width}
            height={dimensions.height}
            groundY={config.groundHeight}
            camera={camera}
            followingBotId={followingBotId}
          />
          
          <div className="absolute top-0 left-0 bottom-0 z-30">
             <Controls 
                isRunning={isRunning}
                generation={generation}
                timeRemaining={0}
                evolutionProgress={evolutionProgress}
                onTogglePlay={() => setIsRunning(!isRunning)}
                onAnalyze={handleAnalyze}
                onOpenSettings={() => { setShowSettings(true); setIsRunning(false); }}
                isAnalyzing={isAnalyzing}
                isCollapsed={isSidebarCollapsed}
                onToggleCollapse={() => setSidebarCollapsed(!isSidebarCollapsed)}
                // Single toggle for the new panel
                showGenomePanel={showGenomePanel}
                onToggleGenomePanel={() => setShowGenomePanel(!showGenomePanel)}
                onToggleMomBot={() => setShowMomBotPanel(!showMomBotPanel)}
                showDriftPanel={showDriftPanel}
                onToggleDriftPanel={() => setShowDriftPanel(!showDriftPanel)}
             />
          </div>
          
          <AnalysisPanel result={analysisResult} onClose={() => setAnalysisResult(null)} />
          <DriftPanel isOpen={showDriftPanel} onClose={() => setShowDriftPanel(false)} history={geneticHistory} />
          
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
                onClose={() => {
                    // Just close and resume, do NOT reset simulation
                    setShowSettings(false);
                    setIsRunning(true);
                }}
                population={populationRef.current}
                generation={generation}
             />
          )}

          <HelpModal open={showHelp} onClose={() => setShowHelp(false)} />
          <MomBotPanel isOpen={showMomBotPanel} onClose={() => setShowMomBotPanel(false)} />
          
          <div className="absolute bottom-6 right-6 flex gap-4">
              <button 
                onClick={toggleMute} 
                className="p-2 bg-slate-800 rounded-full text-slate-400 hover:text-white border border-slate-600"
                title={isMuted ? "Unmute" : "Mute"}
              >
                  {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
              </button>

              <button onClick={() => setShowHelp(true)} className="p-2 bg-slate-800 rounded-full text-slate-400 hover:text-white border border-slate-600">
                  <ScanEye size={20} />
              </button>
          </div>

          <GenomePanel 
              genomes={activeGenomeGroups}
              hidden={!showGenomePanel}
              onClose={() => setShowGenomePanel(false)}
              onSelect={(botId) => {
                  setFollowingBotId(botId);
                  // Ensure auto camera is on to engage follow logic
                  isAutoCameraRef.current = true;
              }}
          />
        </div>
      )}
    </>
  );
};

export default App;