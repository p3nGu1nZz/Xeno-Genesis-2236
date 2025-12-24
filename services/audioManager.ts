import { GeneticStats } from '../types';

export class AudioManager {
    private ctx: AudioContext | null = null;
    private masterGain: GainNode | null = null;
    
    // Generative Engine Nodes
    private droneOscillators: OscillatorNode[] = [];
    private droneLFO: OscillatorNode | null = null;
    private droneFilter: BiquadFilterNode | null = null;
    private delayNode: DelayNode | null = null;
    private feedbackNode: GainNode | null = null;
    
    // State
    private isMuted: boolean = false;
    private isStarted: boolean = false;
    private generativeTimer: any = null;
    
    // Musical Parameters
    private scale = [220.00, 246.94, 277.18, 329.63, 369.99, 440.00, 493.88, 554.37]; // C Lydian ish (A B C# E F# A) normalized to A3
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

        // 3. Deep Binaural Drone
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

        // 4. Start Generative Loop
        this.startGenerativeLoop();

        this.isStarted = true;
    }

    private startGenerativeLoop() {
        if (this.generativeTimer) clearInterval(this.generativeTimer);
        
        // Loop runs every 200ms but probability determines play
        this.generativeTimer = setInterval(() => {
            if (this.isMuted) return;
            // Base probability
            if (Math.random() < 0.15 && this.activeNoteCount < 4) {
                this.playGenerativeNote();
            }
        }, 200);
    }

    private playGenerativeNote() {
        if (!this.ctx || !this.masterGain || !this.delayNode) return;
        
        this.activeNoteCount++;
        const now = this.ctx.currentTime;
        
        // Pick random note from scale
        const noteFreq = this.scale[Math.floor(Math.random() * this.scale.length)] * (Math.random() > 0.8 ? 2 : 1);
        
        const osc = this.ctx.createOscillator();
        osc.type = Math.random() > 0.5 ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(noteFreq, now);

        const env = this.ctx.createGain();
        env.gain.setValueAtTime(0, now);
        
        // Slow attack
        const attack = 0.5 + Math.random() * 2.0;
        env.gain.linearRampToValueAtTime(0.05, now + attack);
        env.gain.exponentialRampToValueAtTime(0.001, now + attack + 3.0); // Long tail

        const panner = this.ctx.createStereoPanner();
        panner.pan.value = Math.random() * 2 - 1;

        osc.connect(env);
        env.connect(panner);
        panner.connect(this.delayNode); // Send to delay for space
        panner.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + attack + 3.5);

        osc.onended = () => {
            this.activeNoteCount--;
        };
    }

    // Called by App to update musical parameters based on colony
    public updateGenerativeParams(stats: GeneticStats) {
        if (!this.droneFilter || !this.ctx) return;
        
        // Example: More Neurons = Open Filter (Brighter sound)
        const density = stats.neuron / (stats.total || 1);
        const targetFreq = 150 + density * 800; // 150Hz to 950Hz range
        
        // Smooth transition
        this.droneFilter.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 2.0);
    }

    public playEvolutionSound() {
        if (this.isMuted || !this.ctx || !this.masterGain) return;
        const now = this.ctx.currentTime;

        // Swelling Chord
        const chord = [220, 277.18, 329.63, 440]; // A Major 7 ish
        
        chord.forEach((freq, i) => {
            const osc = this.ctx!.createOscillator();
            osc.type = 'triangle';
            osc.frequency.value = freq;
            
            const gain = this.ctx!.createGain();
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.08, now + 1.0); // Slow swell
            gain.gain.exponentialRampToValueAtTime(0.001, now + 4.0);

            const panner = this.ctx!.createStereoPanner();
            panner.pan.value = (i / chord.length) * 2 - 1;

            osc.connect(gain);
            gain.connect(panner);
            panner.connect(this.delayNode!); // Add heavy reverb/delay
            panner.connect(this.masterGain!);
            
            osc.start(now);
            osc.stop(now + 4.5);
        });
    }

    public stopDrone() {
        this.droneOscillators.forEach(o => o.stop());
        this.droneOscillators = [];
        this.droneLFO?.stop();
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
        gain.gain.setValueAtTime(0.1, now);
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
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
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
        gain.gain.setValueAtTime(0.05, now);
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
}