
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
import { DEFAULT_CONFIG, INITIAL_POPULATION_SIZE, EVOLUTION_INTERVAL, WORLD_WIDTH } from './constants';
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

  // Audio Context Ref & Nodes
  const audioContextRef = useRef<AudioContext | null>(null);
  const droneNodesRef = useRef<{
      oscillators: OscillatorNode[],
      gain: GainNode,
      filter: BiquadFilterNode,
      shimmerGain: GainNode
  } | null>(null);

  // Refs for loop
  const requestRef = useRef<number>(0);
  
  // Use window dimensions for full screen canvas
  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight });

  // --- AUDIO FX SYSTEM (Ambient Drone) ---
  useEffect(() => {
    return () => {
        if (audioContextRef.current) {
            audioContextRef.current.close();
        }
    };
  }, []);

  const updateAudio = useCallback((isActive: boolean) => {
      if (!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
          const ctx = audioContextRef.current;

          // Master Chain: Limiter/Compressor to glue sounds
          const masterGain = ctx.createGain();
          masterGain.gain.value = 0.0; 
          
          const compressor = ctx.createDynamicsCompressor();
          compressor.threshold.value = -30;
          compressor.ratio.value = 12;
          compressor.attack.value = 0.05;
          compressor.release.value = 0.2;

          masterGain.connect(compressor);
          compressor.connect(ctx.destination);

          // 1. Deep Sub-Bass Drone (Binaural)
          // Fundamental A1 (55Hz) + Detuned neighbor for slow beating
          const oscBass1 = ctx.createOscillator();
          oscBass1.type = 'sine';
          oscBass1.frequency.value = 55; 
          const gBass1 = ctx.createGain();
          gBass1.gain.value = 0.4;
          oscBass1.connect(gBass1);
          gBass1.connect(masterGain);
          oscBass1.start();

          const oscBass2 = ctx.createOscillator();
          oscBass2.type = 'sine';
          oscBass2.frequency.value = 55.2; // 0.2Hz beat frequency (Very slow)
          const gBass2 = ctx.createGain();
          gBass2.gain.value = 0.3;
          oscBass2.connect(gBass2);
          gBass2.connect(masterGain);
          oscBass2.start();

          // 2. Atmospheric Pad (Filtered)
          // A2 (110Hz) Triangle wave for texture
          const oscPad = ctx.createOscillator();
          oscPad.type = 'triangle';
          oscPad.frequency.value = 110; 
          
          const filterPad = ctx.createBiquadFilter();
          filterPad.type = 'lowpass';
          filterPad.frequency.value = 150; // Starts very closed
          filterPad.Q.value = 0.5;

          // Subtle LFO modulation on Filter to simulate fluid movement
          const lfo = ctx.createOscillator();
          lfo.type = 'sine';
          lfo.frequency.value = 0.08; // ~12s cycle
          const lfoGain = ctx.createGain();
          lfoGain.gain.value = 30; // +/- 30Hz modulation
          lfo.connect(lfoGain);
          lfoGain.connect(filterPad.frequency);
          lfo.start();

          const gPad = ctx.createGain();
          gPad.gain.value = 0.15;
          
          oscPad.connect(filterPad);
          filterPad.connect(gPad);
          gPad.connect(masterGain);
          oscPad.start();

          // 3. High Harmonic "Shimmer" (Active State Indicator)
          // E4 (329.63Hz) - Perfect Fifth harmonic 
          const oscShimmer = ctx.createOscillator();
          oscShimmer.type = 'sine';
          oscShimmer.frequency.value = 329.63; 
          const gShimmer = ctx.createGain();
          gShimmer.gain.value = 0.0; // Start silent
          oscShimmer.connect(gShimmer);
          gShimmer.connect(masterGain);
          oscShimmer.start();
          
          droneNodesRef.current = { 
              oscillators: [oscBass1, oscBass2, oscPad, oscShimmer, lfo], 
              gain: masterGain, 
              filter: filterPad,
              shimmerGain: gShimmer
          };
      }

      const nodes = droneNodesRef.current;
      const ctx = audioContextRef.current;

      if (ctx && nodes) {
          const now = ctx.currentTime;
          
          if (isActive) {
              // ACTIVE: Acoustic Stimulus (Linearizing)
              // Open filter, increase volume, add upper harmonic
              nodes.gain.gain.setTargetAtTime(0.35, now, 1.0);
              nodes.filter.frequency.setTargetAtTime(500, now, 1.5); // Open filter
              nodes.shimmerGain.gain.setTargetAtTime(0.1, now, 2.0); // Fade in shimmer
          } else {
              // INACTIVE: Ambient Background
              // Closed filter, deep bass focus
              nodes.gain.gain.setTargetAtTime(0.2, now, 3.0);
              nodes.filter.frequency.setTargetAtTime(150, now, 3.0); // Close filter
              nodes.shimmerGain.gain.setTargetAtTime(0.0, now, 1.0); // Fade out shimmer
          }
      }
  }, []);

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

    const placedBots: {x: number, y: number, r: number}[] = [];
    
    // Create Bots with Collision-Free Distribution
    engine.bots = pop.map((g) => {
        let startX = 0;
        let startY = 0;
        const botRadius = 300; 
        
        // Cloud Parameters - Tighter Clusters for initial spawn
        const CLOUD_RADIUS = 350; 
        let validPosition = false;
        let attempts = 0;

        if (typeof g.originX === 'number' && !isNaN(g.originX)) {
             // Offspring logic: Try to stay near parent
             while (!validPosition && attempts < 20) {
                 startX = g.originX + (Math.random() - 0.5) * 150;
                 startY = 600 + (Math.random() - 0.5) * 200;
                 
                 const collision = placedBots.some(p => {
                     const dx = p.x - startX;
                     const dy = p.y - startY;
                     return (dx*dx + dy*dy) < (botRadius + p.r) ** 2;
                 });
                 
                 if (!collision) validPosition = true;
                 attempts++;
             }
        } 
        else {
           // New Spawn Logic
           const match = g.color.match(/hsl\((\d+\.?\d*)/);
           const hue = match ? parseFloat(match[1]) : 0;
           const isGroupA = (hue > 150 && hue < 230);
           
           // Start with two groups clustered together, separated by a small distance.
           // World Center approx 6000.
           const worldCenter = WORLD_WIDTH / 2;
           // Tighter clustering: +/- 300 instead of 400
           const centerBase = isGroupA ? worldCenter - 300 : worldCenter + 300; 
           
           while (!validPosition && attempts < 50) {
               const angle = Math.random() * Math.PI * 2;
               const dist = Math.sqrt(Math.random()) * CLOUD_RADIUS;
               
               startX = centerBase + Math.cos(angle) * dist;
               startY = 800 + Math.sin(angle) * (dist * 0.7); 

               // Check collision
               const collision = placedBots.some(p => {
                   const dx = p.x - startX;
                   const dy = p.y - startY;
                   return (dx*dx + dy*dy) < (botRadius + p.r) ** 2;
               });
               
               if (!collision) validPosition = true;
               attempts++;
           }
        }
        
        if (!validPosition) {
            startX += (Math.random() - 0.5) * 500;
            startY += (Math.random() - 0.5) * 500;
        }

        placedBots.push({x: startX, y: startY, r: botRadius});
        g.originX = startX;

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
            const parentPos = groupId === 0 ? WORLD_WIDTH/2 - 400 : WORLD_WIDTH/2 + 400;
            const bot = engine.createBot(newG, parentPos, 800);
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

        const parent = groupBots[0]; 
        
        const childGenome: Genome = {
            ...parent.genome,
            id: Math.random().toString(36).substr(2, 9),
            generation: generation + 1,
            bioelectricMemory: parent.genome.bioelectricMemory
        };
        
        childGenome.originX = parent.genome.originX;

        // Spawn child in the cloud of the parent
        const spawnX = parent.centerOfMass.x - 80 + (Math.random() - 0.5) * 40; 
        const spawnY = parent.centerOfMass.y + (Math.random() - 0.5) * 80;
        
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
    // Initial centering on the clustered groups
    const targetX = WORLD_WIDTH / 2; 
    const targetY = 800; 
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
    
    // IMPORTANT: Start paused, wait for user to click Start in HelpModal
    setShowHelp(true); 
    setIsRunning(false); 
    
    // Resume audio context if strictly suspended
    if (audioContextRef.current?.state === 'suspended') {
        audioContextRef.current.resume();
    }
    updateAudio(false); // Start ambient drone
  };

  const handleStartSim = () => {
      setIsRunning(true);
      setShowHelp(false);
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

  const handleQuit = () => {
    setIsRunning(false);
    setAppState('TITLE');
    setShowSettings(false);
    // Stop Audio
    if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
    }
  };

  const togglePlay = () => {
      setIsRunning(!isRunning);
  };

  const handleMorphologyUpgrade = () => {
    if (!populationRef.current || populationRef.current.length === 0) return;
    
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
              
              // LEFT 40% RULE:
              // We want avgX (World) to be positioned at roughly 40% of the screen width from the left.
              // Canvas Logic: ScreenX = (WorldX - W/2 + CamX) * Zoom + W/2
              // TargetScreenX = 0.4 * W
              // CamX = (TargetScreenX - W/2) / Zoom + W/2 - WorldX
              
              const targetScreenX = dimensions.width * 0.4;
              const targetScreenY = dimensions.height * 0.5; // Center Vertically

              const targetCamX = (targetScreenX - dimensions.width / 2) / camera.zoom + dimensions.width / 2 - avgX;
              const targetCamY = (targetScreenY - dimensions.height / 2) / camera.zoom + dimensions.height / 2 - avgY;

              // Smooth Lerp (0.12 for faster but smooth tracking to prevent floating off screen)
              const lerpFactor = 0.12;
              
              setCamera(prev => ({
                  x: prev.x + (targetCamX - prev.x) * lerpFactor,
                  y: prev.y + (targetCamY - prev.y) * lerpFactor, 
                  zoom: prev.zoom
              }));
          }
      } else {
          // Manual Camera Logic
          setCamera(prev => {
              if (isAutoCameraRef.current) return prev; 
              
              const speed = 15 / prev.zoom;
              let dx = 0;
              let dy = 0;
              let dZoom = 0;

              // WASD + Arrow Keys
              if (keysPressed.current.has('w') || keysPressed.current.has('arrowup')) dy += speed;
              if (keysPressed.current.has('s') || keysPressed.current.has('arrowdown')) dy -= speed;
              if (keysPressed.current.has('a') || keysPressed.current.has('arrowleft')) dx += speed;
              if (keysPressed.current.has('d') || keysPressed.current.has('arrowright')) dx -= speed;
              
              // Q/E + -/= for Zoom
              if (keysPressed.current.has('q') || keysPressed.current.has('-')) dZoom -= 0.01;
              if (keysPressed.current.has('e') || keysPressed.current.has('=')) dZoom += 0.01;

              if (dx === 0 && dy === 0 && dZoom === 0) return prev;

              return {
                   x: prev.x + dx,
                   y: prev.y + dy,
                   zoom: Math.max(0.1, Math.min(2.0, prev.zoom + dZoom))
              };
          });
      }
  };

  const loop = useCallback(() => {
    if (isRunning) {
        updateSimulation();
    }
    updateCamera();
    requestRef.current = requestAnimationFrame(loop);
  }, [isRunning, updateSimulation]); 
  
  useEffect(() => {
    requestRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(requestRef.current);
  }, [loop]);

  const resetCamera = () => {
    setCamera(getCenteredCamera(window.innerWidth, window.innerHeight, 0.55));
    isAutoCameraRef.current = false;
    lastInputTimeRef.current = Date.now();
  };

  return (
    <div className="relative w-full h-full bg-slate-950 overflow-hidden font-sans select-none text-white">
      {appState === 'TITLE' && <TitleScreen onStart={startNewSimulation} />}
      
      {appState === 'SIMULATION' && (
          <>
             <SimulationCanvas 
                 botsRef={botsRef}
                 width={dimensions.width}
                 height={dimensions.height}
                 groundY={config.groundHeight}
                 camera={camera}
             />
             
             {/* Top Right HUD Area */}
             <div className="absolute top-0 right-0 w-full p-4 pointer-events-none flex justify-end items-start z-20">
                {/* Physics Stats */}
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

            {/* Bottom Left Instructions */}
            <div className={`absolute bottom-6 ${isSidebarCollapsed ? 'left-20' : 'left-80'} ml-6 pointer-events-none text-[10px] text-slate-500 font-mono z-20 transition-all duration-500`}>
                <div>[WASD / ARROWS] PAN CAMERA (AUTO-FOLLOW ACTIVE)</div>
                <div>[Q / E / - / =] ZOOM LEVEL</div>
                <div className="text-neon-cyan mt-1">[MOUSE HOVER] INSPECT CELLULAR NODE</div>
            </div>
             
             <Controls 
                isRunning={isRunning}
                generation={generation}
                timeRemaining={0}
                onTogglePlay={togglePlay}
                onAnalyze={async () => {
                     setIsAnalyzing(true);
                     const target = bestGenomeA || (populationRef.current.length > 0 ? populationRef.current[0] : null);
                     if (target) {
                         const res = await analyzeXenobot(target, generation);
                         setAnalysisResult(res);
                     }
                     setIsAnalyzing(false);
                }}
                onOpenSettings={() => setShowSettings(true)}
                isAnalyzing={isAnalyzing}
                onToggleAcoustic={() => {
                    const active = !acousticActive;
                    setAcousticActive(active);
                    if (engineRef.current) {
                        engineRef.current.config.acousticFreq = active ? 300 : 0;
                    }
                    updateAudio(active);
                }}
                acousticActive={acousticActive}
                isCollapsed={isSidebarCollapsed}
                onToggleCollapse={() => setSidebarCollapsed(!isSidebarCollapsed)}
                minimizedPanels={minimizedPanels}
                onRestorePanel={(id) => setMinimizedPanels(prev => ({...prev, [id]: false}))}
                genomeA={bestGenomeA}
                genomeB={bestGenomeB}
             />

             {bestGenomeA && (
                 <GenomeVisualizer 
                     genome={bestGenomeA}
                     label="GROUP A (CYAN) // LEADER"
                     borderColor="border-neon-cyan/50"
                     initialPosition={{ x: 340, y: 20 }}
                     hidden={minimizedPanels.A}
                     onMinimize={() => setMinimizedPanels(prev => ({...prev, A: true}))}
                 />
             )}

             {bestGenomeB && (
                 <GenomeVisualizer 
                     genome={bestGenomeB}
                     label="GROUP B (MAGENTA) // LEADER"
                     borderColor="border-neon-magenta/50"
                     initialPosition={{ x: 340, y: 300 }}
                     hidden={minimizedPanels.B}
                     onMinimize={() => setMinimizedPanels(prev => ({...prev, B: true}))}
                 />
             )}

             <AnalysisPanel 
                 result={analysisResult} 
                 onClose={() => setAnalysisResult(null)}
                 onApplyUpgrade={handleMorphologyUpgrade} 
             />

             <HelpModal 
                 open={showHelp} 
                 onClose={handleStartSim} 
                 onStart={handleStartSim} 
             />

             {showSettings && (
                 <SettingsPanel 
                     config={config}
                     onSave={handleApplySettings}
                     onLoad={handleLoadSave}
                     onClose={() => setShowSettings(false)}
                     onQuit={handleQuit}
                     population={getPopulationFromBots()}
                     generation={generation}
                 />
             )}
          </>
      )}
    </div>
  );
};

export default App;
