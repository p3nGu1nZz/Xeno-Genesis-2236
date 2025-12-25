
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { analyzeXenobot } from './services/geminiService';
import { SimulationCanvas } from './components/SimulationCanvas';
import { Controls } from './components/Controls';
import { AnalysisPanel } from './components/AnalysisPanel';
import { GenomePanel } from './components/GenomePanel';
import { MomBotPanel } from './components/MomBotPanel';
import { TitleScreen } from './components/TitleScreen';
import { SplashScreen } from './components/SplashScreen';
import { SettingsPanel } from './components/SettingsPanel';
import { HelpModal } from './components/HelpModal';
import { DriftPanel } from './components/DriftPanel';
import { ResearchPanel } from './components/ResearchPanel';
import { Xenobot, Genome, AnalysisResult, CameraState, SimulationConfig, Food, GeneticStats, ResearchState, Upgrade, UpgradeID, ToolMode, FloatingText, GlobalEvent } from './types';
import { DEFAULT_CONFIG, EVOLUTION_INTERVAL, BD_REWARD, TOOL_COSTS, TOOL_COLORS, GROWTH_COST, MITOSIS_THRESHOLD, MAX_BOT_SIZE, FOOD_ENERGY } from './constants';
import { ScanEye, Volume2, VolumeX, AlertTriangle } from 'lucide-react';
import { PhysicsEngine } from './services/physicsEngine';
import { createRandomGenome } from './services/geneticAlgorithm';
import { AudioManager } from './services/audioManager';

const App: React.FC = () => {
  // Application State
  const [appState, setAppState] = useState<'SPLASH' | 'TITLE' | 'SIMULATION'>('SPLASH');
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
  
  // Progress States (Throttled update for UI)
  const [evolutionProgress, setEvolutionProgress] = useState(0);
  const [growthProgress, setGrowthProgress] = useState(0);
  const [reproductionProgress, setReproductionProgress] = useState(0);

  const [showEvolutionFlash, setShowEvolutionFlash] = useState(false);
  
  // Gamification State
  const [activeTool, setActiveTool] = useState<ToolMode>('SCANNER');
  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([]);
  const [globalEvent, setGlobalEvent] = useState<GlobalEvent | null>(null);
  
  // Genome Visibility State
  const [showGenomePanel, setShowGenomePanel] = useState(false);
  const [showDriftPanel, setShowDriftPanel] = useState(false);
  
  // MomBot Interface State
  const [showMomBotPanel, setShowMomBotPanel] = useState(false);

  // Research / Game State
  const [showResearchPanel, setShowResearchPanel] = useState(false);
  const [bioData, setBioData] = useState(0);
  const [unlockedUpgrades, setUnlockedUpgrades] = useState<UpgradeID[]>([]);
  const [clickMultiplier, setClickMultiplier] = useState(1);
  const [passiveMultiplier, setPassiveMultiplier] = useState(1);
  
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
  const cameraVelRef = useRef({ x: 0, y: 0 });
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

  // --- Helper: Floating Text ---
  const spawnFloatingText = (x: number, y: number, text: string, color: string) => {
      // Find canvas screen coords for text if needed, but we do simple screen space overlay inside canvas
      setFloatingTexts(prev => [
          ...prev, 
          { 
              id: Math.random().toString(36).substr(2, 9),
              x, y, text, color, life: 1.0, velocity: 1.0 
          }
      ]);
  };

  // --- Helper: Global Events ---
  const triggerRandomEvent = () => {
      if (globalEvent) return; // One at a time

      const events: GlobalEvent[] = [
          { 
              id: 'EVT_BLOOM', 
              name: 'ALGAL BLOOM', 
              description: 'Nutrient density increased by 300%.',
              duration: 900, 
              isActive: true, 
              type: 'ALGAL_BLOOM'
          }
      ];

      const evt = events[Math.floor(Math.random() * events.length)];
      setGlobalEvent(evt);
      
      // Apply Event Logic
      if (engineRef.current) {
          if (evt.type === 'ALGAL_BLOOM') {
              engineRef.current.spawnFood();
              engineRef.current.spawnFood();
          }
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

        // Force rigorous separation for Generation 1 to ensure colonies don't touch
        if (currentGen === 1) {
            const match = g.color.match(/hsl\((\d+\.?\d*)/);
            const hue = match ? parseFloat(match[1]) : 0;
            // Native Strain is Cyan (~180), Invaders are Red/Magenta (~340 or ~0)
            const isGroupA = (hue > 100 && hue < 260);

            // 5000 unit gap total
            const baseOffset = 2500; 
            startX = isGroupA ? -baseOffset : baseOffset;
            
            // Large vertical variance to prevent horizontal line clumping
            startY = 200 + (Math.random() - 0.5) * 1200; 
            
            // Random scatter within the colony area
            startX += (Math.random() - 0.5) * 600; 
            
            // Update genome origin to persist this separation
            g.originX = startX;
            g.originY = startY;
        } else {
            // For subsequent generations or loaded saves, check for valid existing position
            const hasValidOrigin = typeof g.originX === 'number' && !isNaN(g.originX) && Math.abs(g.originX) > 1;
            
            if (hasValidOrigin) {
                startX = g.originX! + (Math.random() - 0.5) * 50; 
                if (typeof g.originY === 'number') startY = g.originY + (Math.random() - 0.5) * 50;
            } else {
                // Fallback separation just in case
                startX = (Math.random() > 0.5 ? -2500 : 2500) + (Math.random() - 0.5) * 500;
            }
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

      // Trigger Evolution FX
      setShowEvolutionFlash(true);
      setTimeout(() => setShowEvolutionFlash(false), 1500);
      audioManagerRef.current?.playEvolutionSound();

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
          
          // Process Physics Events for Audio AND Gameplay Awards
          if (engine.events.length > 0) {
              let passiveBDGain = 0;
              let hasDeath = false;

              engine.events.forEach(e => {
                  if (e === 'COLLISION') audioManagerRef.current?.playCollisionSound();
                  if (e === 'EAT') {
                      audioManagerRef.current?.playEatSound();
                      passiveBDGain += (BD_REWARD.PASSIVE_EAT * passiveMultiplier);
                  }
                  if (e === 'MITOSIS') {
                      audioManagerRef.current?.playMitosisSound();
                      passiveBDGain += (BD_REWARD.PASSIVE_MITOSIS * passiveMultiplier);
                  }
                  if (e === 'DEATH') {
                      audioManagerRef.current?.playDeathSound();
                      hasDeath = true;
                  }
              });
              
              if (passiveBDGain > 0) {
                  setBioData(prev => prev + passiveBDGain);
              }
          }

          // Passive Income: Based on TOTAL NODES in the colony
          // Reward: NODE_SURVIVAL_TICK per node per frame
          const totalNodes = engine.bots.reduce((sum, b) => !b.isDead ? sum + b.particles.length : sum, 0);
          const survivalIncome = totalNodes * BD_REWARD.NODE_SURVIVAL_TICK * passiveMultiplier;
          setBioData(prev => prev + survivalIncome);

          // Global Event Management
          if (globalEvent) {
               setGlobalEvent(prev => {
                   if (!prev) return null;
                   const nextDuration = prev.duration - 1;
                   if (nextDuration <= 0) return null; // Event Over
                   return { ...prev, duration: nextDuration };
               });
          } else {
              // Randomly trigger new event (approx once every 2 mins at 60fps)
              if (Math.random() < 0.0002) {
                   triggerRandomEvent();
              }
          }

          // Dynamic Ambient Audio Update
          // Pass the raw event list and bot state to the audio manager every frame
          // The audio manager handles the smoothing and logic
          if (audioManagerRef.current) {
              audioManagerRef.current.updateAmbience(engine.events, engine.bots);
          }
          
          // Floating Text Update (Physics Step)
          setFloatingTexts(prev => prev
              .map(ft => ({
                  ...ft,
                  y: ft.y - ft.velocity,
                  life: ft.life - 0.015
              }))
              .filter(ft => ft.life > 0)
          );

          // Sync Refs
          botsRef.current = engine.bots; 
          foodRef.current = engine.food;

          totalTickRef.current += 1;
          evolutionTimerRef.current += 1;

          // Update UI Status Bars (Throttled for performance)
          if (totalTickRef.current % 4 === 0) {
              const evoProg = Math.min(1, evolutionTimerRef.current / EVOLUTION_INTERVAL);
              setEvolutionProgress(evoProg);

              // Update Group Stats (Growth/Reproduction)
              // Logic: Find the LEADER (highest energy) of Group A (Natives)
              // Calculate their progress against the DYNAMIC SCALED COSTS in engine
              const groupA = engine.bots.filter(b => b.groupId === 0 && !b.isDead);
              
              if (groupA.length > 0) {
                  const leader = groupA.reduce((prev, curr) => (curr.energy > prev.energy ? curr : prev));
                  const { growthCost, mitosisCost } = engine.getCosts();

                  // Growth Bar (Yellow)
                  const isMaxSize = leader.particles.length >= MAX_BOT_SIZE;
                  const growthRatio = isMaxSize ? 1.0 : Math.min(1.0, leader.energy / growthCost);
                  setGrowthProgress(growthRatio);

                  // Reproduction Bar (White)
                  const energyRatio = Math.min(1.0, leader.energy / mitosisCost);
                  const ageRatio = Math.min(1.0, leader.age / 800);
                  const reproductionRatio = Math.min(energyRatio, ageRatio);
                  setReproductionProgress(reproductionRatio);
              } else {
                  setGrowthProgress(0);
                  setReproductionProgress(0);
              }
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
          // Reset velocity
          cameraVelRef.current = { x: 0, y: 0 };
          
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
             // Calculate Visual Center of Mass from smoothed render positions
             let visualX = 0, visualY = 0;
             const pCount = targetBot.particles.length;
             
             if (pCount > 0) {
                 for(let i=0; i<pCount; i++) {
                     visualX += targetBot.particles[i].renderPos.x;
                     visualY += targetBot.particles[i].renderPos.y;
                 }
                 visualX /= pCount;
                 visualY /= pCount;
             } else {
                 visualX = targetBot.centerOfMass.x;
                 visualY = targetBot.centerOfMass.y;
             }

             // Offset logic: Keep bot in the left ~35% of the screen
             const offsetX = (dimensions.width * 0.15) / camera.zoom;

             const targetCamX = visualX + offsetX;
             const targetCamY = visualY;
             
             const dx = targetCamX - camera.x;
             const dy = targetCamY - camera.y;
             const distSq = dx*dx + dy*dy;

             // Teleport if distance is too massive (e.g. init or respawn)
             if (distSq > 1000000) {
                 setCamera(prev => ({...prev, x: targetCamX, y: targetCamY}));
                 cameraVelRef.current = { x: 0, y: 0 };
             } else {
                 // Hybrid Smoothing: Use simple LERP for camera to ensure stability and no overshoot
                 const lerpBase = 0.08;
                 const distFactor = Math.min(1.0, Math.sqrt(distSq) / 500.0); // Increase speed if far away
                 const alpha = lerpBase + distFactor * 0.2; // 0.08 to 0.28 range

                 setCamera(prev => ({
                     ...prev,
                     x: prev.x + dx * alpha,
                     y: prev.y + dy * alpha,
                 }));
                 cameraVelRef.current = { x: 0, y: 0 };
             }
          }
      }

      requestRef.current = requestAnimationFrame(simulationLoop);
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(simulationLoop);
    return () => cancelAnimationFrame(requestRef.current);
  }, [isRunning, camera, dimensions, followingBotId, globalEvent, clickMultiplier, passiveMultiplier]); 

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

  // Interaction Handler for Canvas Clicks (Gamified)
  const handleInteraction = (type: 'BOT' | 'FOOD' | 'EMPTY', id: string, x: number, y: number) => {
      const engine = engineRef.current;
      if (!engine) return;

      const cost = TOOL_COSTS[activeTool];
      
      // Cost Check (Except Reaper which gains money)
      if (activeTool !== 'REAPER' && bioData < cost) {
          spawnFloatingText(x, y, "NO FUNDS", "#ff0000");
          return;
      }

      let success = false;
      let reward = 0;

      if (activeTool === 'SCANNER') {
          if (type === 'BOT') {
              // Clicked a bot: Award RP
              const bot = engine.bots.find(b => b.id === id);
              if (bot) {
                  bot.energy += 20; 
                  // APPLY CLICK MULTIPLIER HERE
                  reward = BD_REWARD.CLICK_BOT * clickMultiplier;
                  spawnFloatingText(x, y, `+${Math.floor(reward)} BD`, TOOL_COLORS.SCANNER);
                  success = true;
                  // Audio
                  audioManagerRef.current?.playMitosisSound(); // Reusing pleasant chime
              }
          } else if (type === 'FOOD') {
              // APPLY CLICK MULTIPLIER HERE
              reward = BD_REWARD.CLICK_FOOD * clickMultiplier;
              spawnFloatingText(x, y, `+${Math.floor(reward)} BD`, TOOL_COLORS.SCANNER);
              success = true;
              audioManagerRef.current?.playEatSound();
          }
      } 
      else if (activeTool === 'INJECTOR') {
          // Spawn food at click location
          const safeZoom = Math.max(0.1, Math.min(5.0, camera.zoom)) || 1.0;
          const worldX = (x - dimensions.width/2) / safeZoom + camera.x;
          const worldY = (y - dimensions.height/2) / safeZoom + camera.y;
          
          // Spawn cluster with scatter
          for(let i=0; i<3; i++) {
              engine.food.push({
                  id: Math.random().toString(36).substr(2, 9),
                  x: worldX + (Math.random()-0.5)*120, // Increased scatter
                  y: worldY + (Math.random()-0.5)*120,
                  energy: FOOD_ENERGY, // Uses constant to align with economy
                  phase: Math.random() * Math.PI * 2
              });
          }
          spawnFloatingText(x, y, `-${cost} BD`, TOOL_COLORS.INJECTOR);
          success = true;
          // Reuse eat sound for squishy injection feel
          audioManagerRef.current?.playEatSound();
      }
      else if (activeTool === 'MUTAGEN') {
          if (type === 'BOT') {
             const result = engine.applyMutagen(id);
             if (result) {
                 spawnFloatingText(x, y, "MUTATED", TOOL_COLORS.MUTAGEN);
                 spawnFloatingText(x, y - 20, `-${cost} BD`, "#fff");
                 success = true;
                 audioManagerRef.current?.playEvolutionSound(); // Big sound for big action
             }
          }
      }
      else if (activeTool === 'REAPER') {
          if (type === 'BOT') {
              const botIndex = engine.bots.findIndex(b => b.id === id);
              if (botIndex !== -1) {
                  const bot = engine.bots[botIndex];
                  const reclaimValue = Math.floor(bot.energy * 0.15); // Increased to 15%
                  reward = reclaimValue;
                  
                  // Kill bot
                  bot.isDead = true;
                  engine.events.push('DEATH');
                  
                  spawnFloatingText(x, y, `+${reward} BD`, TOOL_COLORS.REAPER);
                  spawnFloatingText(x, y - 20, "RECLAIMED", "#fff");
                  success = true; // No cost, but success flag for state update
                  audioManagerRef.current?.playDeathSound();
              }
          }
      }

      if (success) {
          if (activeTool !== 'REAPER') setBioData(prev => prev - cost + reward);
          else setBioData(prev => prev + reward);
      }
  };

  const handlePurchase = (upgrade: Upgrade) => {
      if (bioData >= upgrade.cost && !unlockedUpgrades.includes(upgrade.id)) {
          setBioData(prev => prev - upgrade.cost);
          setUnlockedUpgrades(prev => [...prev, upgrade.id]);
          
          // Apply META upgrades (Multipliers) logic
          if (upgrade.id.startsWith('SCAN_AMP')) {
              // Any scan amp upgrade DOUBLES the current multiplier
              setClickMultiplier(prev => prev * 2);
          } else if (upgrade.id === 'CHEMOSTAT_VAT') {
              setPassiveMultiplier(prev => prev + 1); // +100%
          } else if (upgrade.id === 'MITOCHONDRIAL_TUNING') {
              setPassiveMultiplier(prev => prev + 2); // +200%
          }

          // Apply Config Effects
          if (upgrade.effect) {
              const newConfig = { ...config, ...upgrade.effect(config) };
              setConfig(newConfig);
              // Live update the engine
              if (engineRef.current) {
                  engineRef.current.config = newConfig;
                  
                  // Specific logic updates
                  if (upgrade.id === 'NUTRIENT_AGAR') {
                      engineRef.current.spawnFood(); 
                  }
              }
          }
      }
  };

  return (
    <>
      {appState === 'SPLASH' && (
        <SplashScreen onComplete={() => setAppState('TITLE')} />
      )}

      {appState === 'TITLE' && (
          <TitleScreen 
              onStart={handleStart} 
              isMuted={isMuted} 
              onToggleMute={toggleMute} 
          />
      )}
      
      {appState === 'SIMULATION' && (
        <div className="relative w-full h-full overflow-hidden bg-deep-space">
          {/* Evolution Flash Effect */}
          <div 
             className={`absolute inset-0 z-[100] bg-white pointer-events-none transition-opacity duration-1000 ease-out mix-blend-overlay ${showEvolutionFlash ? 'opacity-30' : 'opacity-0'}`}
          />
          <div 
             className={`absolute inset-0 z-[100] bg-neon-cyan/20 pointer-events-none transition-opacity duration-1000 ease-out mix-blend-screen ${showEvolutionFlash ? 'opacity-40' : 'opacity-0'}`}
          />

          {/* Global Event Warning Banner */}
          {globalEvent && (
              <div className="absolute top-8 left-1/2 -translate-x-1/2 z-50 bg-red-500/20 border border-red-500 text-red-500 px-6 py-2 rounded-full flex items-center gap-3 animate-pulse shadow-[0_0_20px_rgba(239,68,68,0.5)]">
                  <AlertTriangle size={20} />
                  <div className="flex flex-col items-center">
                      <span className="font-bold font-display tracking-widest">{globalEvent.name} ACTIVE</span>
                      <span className="text-[10px] font-mono text-red-300">{globalEvent.description}</span>
                  </div>
              </div>
          )}

          <SimulationCanvas 
            botsRef={botsRef}
            foodRef={foodRef}
            width={dimensions.width}
            height={dimensions.height}
            groundY={config.groundHeight}
            camera={camera}
            followingBotId={followingBotId}
            isRunning={isRunning}
            onInteract={handleInteraction}
            floatingTexts={floatingTexts}
            activeTool={activeTool}
          />
          
          <div className="absolute top-0 left-0 bottom-0 z-30">
             <Controls 
                isRunning={isRunning}
                generation={generation}
                timeRemaining={0}
                evolutionProgress={evolutionProgress}
                growthProgress={growthProgress}
                reproductionProgress={reproductionProgress}
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
                // Game Props
                bioData={bioData}
                unlockedUpgrades={unlockedUpgrades}
                onOpenResearch={() => setShowResearchPanel(true)}
                // Tools
                activeTool={activeTool}
                onSelectTool={setActiveTool}
             />
          </div>
          
          <AnalysisPanel result={analysisResult} onClose={() => setAnalysisResult(null)} />
          <DriftPanel isOpen={showDriftPanel} onClose={() => setShowDriftPanel(false)} history={geneticHistory} />
          
          {showResearchPanel && (
              <ResearchPanel 
                  bioData={bioData}
                  unlockedUpgrades={unlockedUpgrades}
                  onPurchase={handlePurchase}
                  onClose={() => setShowResearchPanel(false)}
              />
          )}

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
                    // Load Research State
                    if (data.researchState) {
                        setBioData(data.researchState.bioData);
                        setUnlockedUpgrades(data.researchState.unlockedUpgrades);
                        // Restore Multipliers
                        setClickMultiplier(data.researchState.clickMultiplier);
                        setPassiveMultiplier(data.researchState.passiveMultiplier);
                    }
                }}
                onClose={() => {
                    // Just close and resume, do NOT reset simulation
                    setShowSettings(false);
                    setIsRunning(true);
                }}
                population={populationRef.current}
                generation={generation}
                researchState={{
                    bioData,
                    unlockedUpgrades,
                    clickMultiplier,
                    passiveMultiplier
                }}
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
