
export class AudioManager {
    private ctx: AudioContext | null = null;
    private masterGain: GainNode | null = null;
    private droneOscillators: OscillatorNode[] = [];
    private droneLFO: OscillatorNode | null = null;
    private droneFilter: BiquadFilterNode | null = null;
    private isMuted: boolean = false;
    private isStarted: boolean = false;

    constructor() {
        this.init();
    }

    private init() {
        if (typeof window !== 'undefined') {
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            this.ctx = new AudioContextClass();
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.value = 0.15; // Initial volume
            this.masterGain.connect(this.ctx.destination);
        }
    }

    public startDrone() {
        if (!this.ctx || !this.masterGain || this.isStarted) return;
        this.ctx.resume();

        // 1. Create Filter for dynamic movement
        this.droneFilter = this.ctx.createBiquadFilter();
        this.droneFilter.type = 'lowpass';
        this.droneFilter.frequency.value = 200;
        this.droneFilter.Q.value = 1.0;
        this.droneFilter.connect(this.masterGain);

        // 2. LFO to modulate filter (The "breathing" space effect)
        this.droneLFO = this.ctx.createOscillator();
        this.droneLFO.type = 'sine';
        this.droneLFO.frequency.value = 0.05; // Very slow cycle (20 seconds)
        const lfoGain = this.ctx.createGain();
        lfoGain.gain.value = 150; // Filter cutoff modulation depth
        this.droneLFO.connect(lfoGain);
        lfoGain.connect(this.droneFilter.frequency);
        this.droneLFO.start();

        // 3. Oscillators (Sawtooth + Sine detuned)
        const freqs = [55, 110.5, 164.8, 220.2]; // A1, A2(detuned), E3, A3(detuned)
        
        freqs.forEach((f, i) => {
            if (!this.ctx) return;
            const osc = this.ctx.createOscillator();
            osc.type = i % 2 === 0 ? 'sawtooth' : 'sine';
            osc.frequency.value = f;
            
            // Stereo panning for width
            const panner = this.ctx.createStereoPanner();
            panner.pan.value = (Math.random() * 2) - 1;

            osc.connect(panner);
            panner.connect(this.droneFilter!);
            osc.start();
            this.droneOscillators.push(osc);
        });

        this.isStarted = true;
    }

    public stopDrone() {
        this.droneOscillators.forEach(o => o.stop());
        this.droneOscillators = [];
        this.droneLFO?.stop();
        this.isStarted = false;
    }

    public toggleMute() {
        if (!this.masterGain || !this.ctx) return;
        if (this.ctx.state === 'suspended') this.ctx.resume();
        
        this.isMuted = !this.isMuted;
        
        // Smooth fade
        const now = this.ctx.currentTime;
        this.masterGain.gain.cancelScheduledValues(now);
        this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
        
        if (this.isMuted) {
            this.masterGain.gain.linearRampToValueAtTime(0, now + 0.5);
        } else {
            this.masterGain.gain.linearRampToValueAtTime(0.15, now + 0.5);
        }
        
        // Ensure drone is running if we unmute
        if (!this.isMuted && !this.isStarted) {
            this.startDrone();
        }

        return this.isMuted;
    }

    public getMuteState() {
        return this.isMuted;
    }

    public playEatSound() {
        if (this.isMuted || !this.ctx || !this.masterGain) return;
        
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = 'sine';
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
        
        gain.gain.setValueAtTime(0.1, now);
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
        osc.frequency.linearRampToValueAtTime(600, now + 0.3);

        gain.gain.setValueAtTime(0.05, now);
        gain.gain.linearRampToValueAtTime(0.1, now + 0.1);
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

        // Lowpass filter for muffled sound
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
