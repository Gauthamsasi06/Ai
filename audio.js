// Web Audio API Synthesizer for Traffic Pulse Command Center
// 100% self-contained, zero external audio asset dependencies

class TrafficAudio {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.volume = 0.25;
    this.ambientGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.isSirenPlaying = false;
  }

  init() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.ctx = new AudioContext();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleSound(state) {
    this.enabled = state !== undefined ? state : !this.enabled;
    if (this.enabled) {
      this.init();
      this.playBlip(600, 0.05);
    } else {
      this.stopSiren();
    }
    return this.enabled;
  }

  setVolume(val) {
    this.volume = Math.max(0, Math.min(1, val));
  }

  playBlip(freq = 440, duration = 0.06, type = 'sine') {
    if (!this.enabled || !this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.5, this.ctx.currentTime + duration);

      gain.gain.setValueAtTime(this.volume * 0.3, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {
      // Audio fallback
    }
  }

  playSignalChange() {
    if (!this.enabled || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.setValueAtTime(659.25, now + 0.06); // E5
      gain.gain.setValueAtTime(this.volume * 0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.22);
    } catch (e) {}
  }

  playAlert(type = 'warning') {
    if (!this.enabled || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type === 'warning' ? 'sawtooth' : 'sine';
      osc.frequency.setValueAtTime(type === 'warning' ? 330 : 880, now);
      osc.frequency.exponentialRampToValueAtTime(type === 'warning' ? 220 : 440, now + 0.3);

      gain.gain.setValueAtTime(this.volume * 0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.35);
    } catch (e) {}
  }

  startSiren() {
    if (!this.enabled || !this.ctx || this.isSirenPlaying) return;
    try {
      this.isSirenPlaying = true;
      const now = this.ctx.currentTime;
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenGain = this.ctx.createGain();
      const lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();

      this.sirenOsc.type = 'sawtooth';
      this.sirenOsc.frequency.setValueAtTime(700, now);

      lfo.type = 'triangle';
      lfo.frequency.setValueAtTime(1.8, now); // 1.8 Hz wailing
      lfoGain.gain.setValueAtTime(250, now);

      lfo.connect(this.sirenOsc.frequency);
      this.sirenGain.gain.setValueAtTime(this.volume * 0.15, now);

      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.ctx.destination);

      lfo.start(now);
      this.sirenOsc.start(now);
      this.sirenLfo = lfo;
    } catch (e) {}
  }

  stopSiren() {
    if (!this.isSirenPlaying) return;
    try {
      if (this.sirenGain && this.ctx) {
        this.sirenGain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.3);
      }
      setTimeout(() => {
        if (this.sirenOsc) {
          try { this.sirenOsc.stop(); } catch(e){}
          this.sirenOsc.disconnect();
          this.sirenOsc = null;
        }
        if (this.sirenLfo) {
          try { this.sirenLfo.stop(); } catch(e){}
          this.sirenLfo.disconnect();
          this.sirenLfo = null;
        }
        this.isSirenPlaying = false;
      }, 350);
    } catch (e) {
      this.isSirenPlaying = false;
    }
  }
}

window.trafficAudio = new TrafficAudio();
