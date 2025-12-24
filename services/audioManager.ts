import { GeneticStats, Xenobot } from '../types';

export class AudioManager {
    private ctx: AudioContext | null = null;
    private masterGain: GainNode | null = null;
    
    // Generative Engine Nodes
    private droneOscillators: OscillatorNode[] = [];
    private droneLFO: OscillatorNode | null = null;
    private droneFilter: BiquadFilterNode | null = null;
    private delayNode: DelayNode | null = null;
    private feedbackNode: GainNode | null = null;
    
    // Dynamic Ambience State
    private chaosMetric = 0; // 0 (Calm) to 1 (Apocalyptic)
    private harmonyMetric = 1; // 0 (Dissonant) to 1 (Consonant)
    
    // Tension Layer (For high chaos)
    private tensionOscillator: OscillatorNode | null = null;
    private tensionGain: GainNode | null = null;
    private tensionLFO: OscillatorNode | null = null;

    // State
    private isMuted: boolean = false;
    private isStarted: boolean = false;
    private generativeTimer: any = null;
    
    // Musical Parameters
    // Lydian Mode (Hopeful, Sci-fi)
    private scaleHarmonious = [196.00, 220.00, 246.94, 277.18, 293.66, 329.63, 369.99, 440.00, 554.37]; 
    // Locrian/Diminished (Unstable, Biological Horror)
    private scaleChaotic = [196.00, 207.65, 233.08, 246.94, 277.18, 311.13, 349.23, 392.00, 415.30]; 
    
    private activeNoteCount = 0;

    constructor() {
        this.init();
    }

    private init() {
        if (typeof window !== 'undefined') {
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            this.ctx = new AudioContextClass();
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.value = 0.2; 
            
            // Create Delay Line for "Space" effect
            this.delayNode = this.ctx.createDelay();
            this.delayNode.delayTime.value = 0.5; // 500ms
            this.feedbackNode = this.ctx.createGain();
            this.feedbackNode.gain.value = 0.4;
            
            this.delayNode.connect(this.feedbackNode);
            this.feedbackNode.connect(this.delayNode);
            this.delayNode.connect(this.masterGain);
            
            this.masterGain.connect(this.ctx.destination);
        }
    }

    public startDrone() {
        if (!this.ctx || !this.masterGain || this.isStarted) return;
        this.ctx.resume();

        // 1. Atmosphere Filter
        this.droneFilter = this.ctx.createBiquadFilter();
        this.droneFilter.type = 'lowpass';
        this.droneFilter.frequency.value = 150;
        this.droneFilter.Q.value = 0.5;
        this.droneFilter.connect(this.masterGain);
        this.droneFilter.connect(this.delayNode!);

        // 2. LFO for Filter (Breathing)
        this.droneLFO = this.ctx.createOscillator();
        this.droneLFO.type = 'sine';
        this.droneLFO.frequency.value = 0.03; 
        const lfoGain = this.ctx.createGain();
        lfoGain.gain.value = 100;
        this.droneLFO.connect(lfoGain);
        lfoGain.connect(this.droneFilter.frequency);
        this.droneLFO.start();

        // 3. Deep Binaural Drone (Base Layer)
        const freqs = [55, 55.5]; // A1 + detune for binaural beat
        freqs.forEach((f) => {
            if (!this.ctx) return;
            const osc = this.ctx.createOscillator();
            osc.type = 'sawtooth';
            osc.frequency.value = f;
            
            // Soften sawtooth
            const lowpass = this.ctx.createBiquadFilter();
            lowpass.type = 'lowpass';
            lowpass.frequency.value = 120;
            
            const panner = this.ctx.createStereoPanner();
            panner.pan.value = Math.random() * 2 - 1;

            const oscGain = this.ctx.createGain();
            oscGain.gain.value = 0.4;

            osc.connect(lowpass);
            lowpass.connect(oscGain);
            oscGain.connect(panner);
            panner.connect(this.droneFilter!);
            osc.start();
            this.droneOscillators.push(osc);
        });

        // 4. Tension Layer (Dynamic Dissonance)
        this.tensionOscillator = this.ctx.createOscillator();
        this.tensionOscillator.type = 'sawtooth';
        this.tensionOscillator.frequency.value = 110; // A2 Base
        
        // Detune LFO for unsettling drift
        this.tensionLFO = this.ctx.createOscillator();
        this.tensionLFO.frequency.value = 0.2; // Slow drift
        const tLfoGain = this.ctx.createGain();
        tLfoGain.gain.value = 15; // +/- 15 cents
        this.tensionLFO.connect(tLfoGain);
        tLfoGain.connect(this.tensionOscillator.detune);
        this.tensionLFO.start();

        this.tensionGain = this.ctx.createGain();
        this.tensionGain.gain.value = 0; // Starts silent

        // Highpass to keep it thin/eerie
        const tensionFilter = this.ctx.createBiquadFilter();
        tensionFilter.type = 'highpass';
        tensionFilter.frequency.value = 400;

        const tensionPanner = this.ctx.createStereoPanner();
        // Auto-pan
        const panOsc = this.ctx.createOscillator();
        panOsc.frequency.value = 0.1;
        const panGain = this.ctx.createGain();
        panGain.gain.value = 0.8;
        panOsc.connect(panGain);
        panGain.connect(tensionPanner.pan);
        panOsc.start();

        this.tensionOscillator.connect(tensionFilter);
        tensionFilter.connect(this.tensionGain);
        this.tensionGain.connect(tensionPanner);
        tensionPanner.connect(this.delayNode!); // Wash it out
        tensionPanner.connect(this.masterGain);
        
        this.tensionOscillator.start();


        // 5. Start Generative Loop
        this.startGenerativeLoop();

        this.isStarted = true;
    }

    private startGenerativeLoop() {
        if (this.generativeTimer) clearInterval(this.generativeTimer);
        
        // Loop runs frequently; probability determines note trigger
        this.generativeTimer = setInterval(() => {
            if (this.isMuted) return;
            
            // Chaos increases note density
            const baseProb = 0.15 + (this.chaosMetric * 0.25);
            const maxNotes = 4 + Math.floor(this.chaosMetric * 4);

            if (Math.random() < baseProb && this.activeNoteCount < maxNotes) {
                this.playGenerativeNote();
            }
        }, 200);
    }

    private playGenerativeNote() {
        if (!this.ctx || !this.masterGain || !this.delayNode) return;
        
        this.activeNoteCount++;
        const now = this.ctx.currentTime;
        
        // Dynamic Scale Selection
        // As chaos rises, probability of chaotic scale increases
        const useChaosScale = Math.random() < this.chaosMetric;
        const scale = useChaosScale ? this.scaleChaotic : this.scaleHarmonious;
        
        // Pick note
        let noteFreq = scale[Math.floor(Math.random() * scale.length)];
        // Chaos tends to push pitch higher
        if (Math.random() < this.chaosMetric) noteFreq *= 2; 
        
        const osc = this.ctx.createOscillator();
        // Harmony = Sine/Triangle, Chaos = Sawtooth/Square
        const isHarsh = Math.random() < this.chaosMetric;
        osc.type = isHarsh ? (Math.random() > 0.5 ? 'sawtooth' : 'square') : (Math.random() > 0.5 ? 'sine' : 'triangle');
        osc.frequency.setValueAtTime(noteFreq, now);

        const env = this.ctx.createGain();
        env.gain.setValueAtTime(0, now);
        
        // Envelope Shaping
        // Harmony = Slow Attack, Long Release
        // Chaos = Fast Attack, Short Release
        const attack = isHarsh ? 0.05 : (0.5 + Math.random() * 2.0);
        const release = isHarsh ? 0.5 : 3.0;
        
        env.gain.linearRampToValueAtTime(isHarsh ? 0.05 : 0.05, now + attack);
        env.gain.exponentialRampToValueAtTime(0.001, now + attack + release);

        const panner = this.ctx.createStereoPanner();
        panner.pan.value = Math.random() * 2 - 1;

        osc.connect(env);
        env.connect(panner);
        panner.connect(this.delayNode); 
        panner.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + attack + release + 0.5);

        osc.onended = () => {
            this.activeNoteCount--;
        };
    }

    // Called every frame-ish from App.tsx
    public updateAmbience(events: string[], bots: Xenobot[]) {
        if (!this.ctx || !this.isStarted) return;
        
        // 1. Calculate Instant Metrics
        const deathCount = events.filter(e => e === 'DEATH').length;
        const totalEnergy = bots.reduce((sum, b) => sum + b.energy, 0);
        const avgEnergy = bots.length > 0 ? totalEnergy / bots.length : 0;
        
        // Activity Proxy: Total Charge (Bio-electricity intensity)
        const totalCharge = bots.reduce((sum, b) => sum + b.totalCharge, 0);
        // Normalize activity: 100 bots * 2.0 charge avg ~ 200
        const activity = Math.min(1, totalCharge / (Math.max(1, bots.length) * 4.0));

        // 2. Update Chaos Metric (0 to 1)
        // Deaths cause immediate spikes. Low energy causes creeping dread.
        // Chaos decays naturally if things are stable.
        let targetChaos = (deathCount * 0.4); 
        if (avgEnergy < 800) targetChaos += 0.3; // Low energy anxiety
        if (avgEnergy < 400) targetChaos += 0.5; // Critical anxiety
        
        targetChaos = Math.min(1, targetChaos);
        
        // Smooth transition: Fast attack for death, slow decay for calm
        if (targetChaos > this.chaosMetric) {
            this.chaosMetric = this.chaosMetric * 0.9 + targetChaos * 0.1;
        } else {
            this.chaosMetric = this.chaosMetric * 0.995 + targetChaos * 0.005;
        }

        // 3. Update Audio Parameters based on Metrics
        const now = this.ctx.currentTime;

        // A. Base Drone Filter (Opens up with activity and chaos)
        if (this.droneFilter) {
            const baseFreq = 150;
            // Activity brightens the sound (more neurons firing)
            // Chaos opens it up to noise
            const targetCutoff = baseFreq + (activity * 600) + (this.chaosMetric * 800);
            this.droneFilter.frequency.setTargetAtTime(targetCutoff, now, 0.5);
        }

        // B. Drone Breathing (LFO)
        if (this.droneLFO) {
            // Calm = 0.03Hz (Deep breaths)
            // Panic = 0.5Hz (Hyperventilation)
            const targetRate = 0.03 + (this.chaosMetric * 0.6);
            this.droneLFO.frequency.setTargetAtTime(targetRate, now, 2.0);
        }

        // C. Tension Layer (The "Fear" Drone)
        // Fades in when chaos > 0.2
        if (this.tensionGain) {
            const tensionVol = Math.max(0, (this.chaosMetric - 0.2) * 0.2); // Cap at 0.2 gain
            this.tensionGain.gain.setTargetAtTime(tensionVol, now, 1.0);
        }
        
        // D. Tension Modulation
        if (this.tensionLFO) {
             // Warble faster when chaotic
             const warbleSpeed = 0.2 + (this.chaosMetric * 5.0);
             this.tensionLFO.frequency.setTargetAtTime(warbleSpeed, now, 1.0);
        }
    }

    public playEvolutionSound() {
        if (this.isMuted || !this.ctx || !this.masterGain) return;
        const now = this.ctx.currentTime;

        // Swelling Chord - More complex
        // Uses scale based on current harmony state
        const scale = this.chaosMetric > 0.5 ? this.scaleChaotic : this.scaleHarmonious;
        // Pick 4 notes from scale
        const chordIndices = [0, 2, 4, 6]; 
        const chord = chordIndices.map(i => scale[i % scale.length]);
        
        chord.forEach((freq, i) => {
            const osc = this.ctx!.createOscillator();
            osc.type = 'triangle';
            osc.frequency.value = freq;
            
            const gain = this.ctx!.createGain();
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.08, now + 1.0); // Slow swell
            gain.gain.exponentialRampToValueAtTime(0.001, now + 5.0); // Long tail

            const panner = this.ctx!.createStereoPanner();
            panner.pan.value = (i / chord.length) * 2 - 1;

            osc.connect(gain);
            gain.connect(panner);
            panner.connect(this.delayNode!); 
            panner.connect(this.masterGain!);
            
            osc.start(now);
            osc.stop(now + 6.0);
        });
    }

    public stopDrone() {
        this.droneOscillators.forEach(o => o.stop());
        this.droneOscillators = [];
        this.droneLFO?.stop();
        this.tensionOscillator?.stop();
        this.tensionLFO?.stop();
        if (this.generativeTimer) clearInterval(this.generativeTimer);
        this.isStarted = false;
    }

    public toggleMute() {
        if (!this.masterGain || !this.ctx) return;
        if (this.ctx.state === 'suspended') this.ctx.resume();
        
        this.isMuted = !this.isMuted;
        
        const now = this.ctx.currentTime;
        this.masterGain.gain.cancelScheduledValues(now);
        this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
        
        if (this.isMuted) {
            this.masterGain.gain.linearRampToValueAtTime(0, now + 0.5);
        } else {
            this.masterGain.gain.linearRampToValueAtTime(0.2, now + 0.5);
        }
        
        if (!this.isMuted && !this.isStarted) {
            this.startDrone();
        }

        return this.isMuted;
    }

    public getMuteState() {
        return this.isMuted;
    }

    // --- SFX ---

    public playEatSound() {
        if (this.isMuted || !this.ctx || !this.masterGain) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(1200, now + 0.1);
        gain.gain.setValueAtTime(0.05, now); // Quiet
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.1);
    }

    public playCollisionSound() {
        if (this.isMuted || !this.ctx || !this.masterGain) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(100, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.2);
        gain.gain.setValueAtTime(0.03, now); // Very Quiet
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.2);
    }

    public playMitosisSound() {
        if (this.isMuted || !this.ctx || !this.masterGain) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.linearRampToValueAtTime(800, now + 0.1);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.4);
    }

    public playDeathSound() {
         if (this.isMuted || !this.ctx || !this.masterGain) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.5);
        gain.gain.setValueAtTime(0.08, now); // Slightly louder
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 300;
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.5);
    }
    
    // Legacy support to prevent build errors, though functionality is moved to updateAmbience
    public updateGenerativeParams(stats: GeneticStats) {
        // No-op or minor tweak, logic is now real-time in updateAmbience
    }
}
