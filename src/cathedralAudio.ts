// Procedural Web Audio API sound effects & Gothic cathedral ambiance
// 100% client-side synthesis — zero external audio assets or API keys required.

const MUTE_STORAGE_KEY = 'wizard_chess_sound_muted';

type AudioPieceType = 'pawn' | 'rook' | 'knight' | 'bishop' | 'queen' | 'king';

class CathedralAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private dryGain: GainNode | null = null;
  private reverbSend: GainNode | null = null;
  private convolver: ConvolverNode | null = null;
  private ambientGain: GainNode | null = null;
  private ambientNodes: AudioNode[] = [];
  private crackleTimer: number | null = null;
  private whiteNoiseBuf: AudioBuffer | null = null;
  private brownNoiseBuf: AudioBuffer | null = null;
  private muted: boolean = false;
  private unlocked: boolean = false;
  private ambientStarted: boolean = false;
  private listeners: Set<(muted: boolean) => void> = new Set();

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_STORAGE_KEY) === 'true';
    } catch {
      this.muted = false;
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public onMuteChange(cb: (muted: boolean) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private notifyListeners(): void {
    for (const cb of this.listeners) {
      try {
        cb(this.muted);
      } catch {
        // ignore listener errors
      }
    }
  }

  public setMuted(nextMuted: boolean): boolean {
    this.muted = Boolean(nextMuted);
    try {
      localStorage.setItem(MUTE_STORAGE_KEY, String(this.muted));
    } catch {
      // ignore storage errors
    }

    if (!this.muted) {
      this.unlock();
    }

    if (this.ctx && this.masterGain) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
      this.masterGain.gain.linearRampToValueAtTime(this.muted ? 0 : 0.85, now + 0.08);
    }

    if (this.ctx && this.ambientGain) {
      const now = this.ctx.currentTime;
      this.ambientGain.gain.cancelScheduledValues(now);
      this.ambientGain.gain.setValueAtTime(this.ambientGain.gain.value, now);
      this.ambientGain.gain.linearRampToValueAtTime(this.muted ? 0 : 1, now + 0.25);
    }

    this.notifyListeners();
    return this.muted;
  }

  public toggleMute(): boolean {
    return this.setMuted(!this.muted);
  }

  public unlock(): void {
    if (typeof window === 'undefined') return;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    if (!this.ctx) {
      try {
        this.ctx = new AudioCtx();
        this.setupGraph(this.ctx);
      } catch {
        return;
      }
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    this.unlocked = true;
    if (!this.ambientStarted) {
      this.startAmbientSoundscape();
    }
  }

  private setupGraph(ctx: AudioContext): void {
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.knee.value = 18;
    compressor.ratio.value = 6;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.2;

    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : 0.85;

    const dry = ctx.createGain();
    dry.gain.value = 0.88;

    const reverbSend = ctx.createGain();
    reverbSend.gain.value = 0.36;

    const convolver = ctx.createConvolver();
    convolver.buffer = this.createCathedralImpulse(ctx, 2.35, 3.1);

    const reverbFilter = ctx.createBiquadFilter();
    reverbFilter.type = 'lowpass';
    reverbFilter.frequency.value = 2600;

    dry.connect(compressor);
    reverbSend.connect(convolver);
    convolver.connect(reverbFilter);
    reverbFilter.connect(compressor);
    compressor.connect(master);
    master.connect(ctx.destination);

    this.masterGain = master;
    this.dryGain = dry;
    this.reverbSend = reverbSend;
    this.convolver = convolver;

    this.whiteNoiseBuf = this.createWhiteNoiseBuffer(ctx, 2.5);
    this.brownNoiseBuf = this.createBrownNoiseBuffer(ctx, 4.0);
  }

  private createWhiteNoiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  private createBrownNoiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let lastOut = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      lastOut = (lastOut + 0.022 * white) / 1.022;
      data[i] = lastOut * 3.2;
    }
    return buffer;
  }

  private createCathedralImpulse(ctx: AudioContext, durationSec: number, decay: number): AudioBuffer {
    const sampleRate = ctx.sampleRate;
    const length = Math.floor(sampleRate * durationSec);
    const impulse = ctx.createBuffer(2, length, sampleRate);
    const earlyEchoMs = [17, 31, 49, 73, 108];

    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < length; i++) {
        const t = i / length;
        const env = Math.pow(1 - t, decay);
        const white = (Math.random() * 2 - 1) * env;
        lp = lp * 0.68 + white * 0.32;
        data[i] = lp * 0.45;
      }
      // Subtle early stone pillar reflections
      for (let e = 0; e < earlyEchoMs.length; e++) {
        const idx = Math.floor(((earlyEchoMs[e] + ch * 5) / 1000) * sampleRate);
        if (idx < length) {
          data[idx] += (0.28 / (e + 1)) * (ch === 0 ? 1 : -1);
        }
      }
    }
    return impulse;
  }

  private canPlay(): boolean {
    if (this.muted || !this.unlocked || !this.ctx || !this.dryGain || !this.reverbSend) {
      return false;
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx.state === 'running';
  }

  private connectVoice(node: AudioNode, dryAmount = 1.0, wetAmount = 0.35): void {
    if (!this.ctx || !this.dryGain || !this.reverbSend) return;
    if (dryAmount > 0) {
      const d = this.ctx.createGain();
      d.gain.value = dryAmount;
      node.connect(d);
      d.connect(this.dryGain);
    }
    if (wetAmount > 0) {
      const w = this.ctx.createGain();
      w.gain.value = wetAmount;
      node.connect(w);
      w.connect(this.reverbSend);
    }
  }

  private startAmbientSoundscape(): void {
    if (this.ambientStarted || !this.ctx || !this.brownNoiseBuf || !this.dryGain || !this.reverbSend) {
      return;
    }
    this.ambientStarted = true;
    const ctx = this.ctx;

    const ambGain = ctx.createGain();
    ambGain.gain.value = this.muted ? 0 : 1;
    ambGain.connect(this.dryGain);
    this.ambientGain = ambGain;

    // 1. Warm brazier hearth rumble (brown noise lowpassed)
    const hearthSrc = ctx.createBufferSource();
    hearthSrc.buffer = this.brownNoiseBuf;
    hearthSrc.loop = true;

    const hearthFilter = ctx.createBiquadFilter();
    hearthFilter.type = 'lowpass';
    hearthFilter.frequency.value = 210;

    const hearthGain = ctx.createGain();
    hearthGain.gain.value = 0.045;

    hearthSrc.connect(hearthFilter);
    hearthFilter.connect(hearthGain);
    hearthGain.connect(ambGain);
    hearthSrc.start();

    // 2. Subtle deep Gothic sanctum organ-like air drone (C2 + G2)
    const droneOsc1 = ctx.createOscillator();
    droneOsc1.type = 'sine';
    droneOsc1.frequency.value = 65.41; // C2

    const droneOsc2 = ctx.createOscillator();
    droneOsc2.type = 'triangle';
    droneOsc2.frequency.value = 98.0; // G2

    const droneFilter = ctx.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = 155;

    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.015;

    droneOsc1.connect(droneFilter);
    droneOsc2.connect(droneFilter);
    droneFilter.connect(droneGain);
    droneGain.connect(ambGain);
    droneGain.connect(this.reverbSend);

    droneOsc1.start();
    droneOsc2.start();

    this.ambientNodes.push(hearthSrc, droneOsc1, droneOsc2);

    // 3. Delicate randomized brazier ember crackle
    if (this.crackleTimer === null && typeof window !== 'undefined') {
      this.crackleTimer = window.setInterval(() => {
        if (!this.canPlay()) return;
        if (Math.random() > 0.42) return;
        this.triggerEmberCrackle();
      }, 280);
    }
  }

  private triggerEmberCrackle(): void {
    if (!this.ctx || !this.whiteNoiseBuf || !this.ambientGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime + Math.random() * 0.08;

    const src = ctx.createBufferSource();
    src.buffer = this.whiteNoiseBuf;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2400 + Math.random() * 3400;
    bp.Q.value = 3.2;

    const g = ctx.createGain();
    const peak = 0.008 + Math.random() * 0.015;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(peak, now + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.018 + Math.random() * 0.025);

    src.connect(bp);
    bp.connect(g);
    g.connect(this.ambientGain);
    src.start(now, Math.random() * 1.5, 0.06);
  }

  // =========================================================================
  // Piece & Board Interaction SFX
  // =========================================================================

  public playSelectPiece(pieceType: AudioPieceType = 'pawn'): void {
    if (!this.canPlay() || !this.ctx || !this.whiteNoiseBuf) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const pitchMap: Record<AudioPieceType, number> = {
      pawn: 523.25,
      knight: 587.33,
      bishop: 659.25,
      rook: 440.0,
      queen: 783.99,
      king: 392.0
    };
    const freq = pitchMap[pieceType] || 523.25;

    // Arcane harmonic ping
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.02, now + 0.14);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.055, now + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

    osc.connect(g);
    this.connectVoice(g, 0.7, 0.45);
    osc.start(now);
    osc.stop(now + 0.25);

    // Subtle marble tap
    const tap = ctx.createBufferSource();
    tap.buffer = this.whiteNoiseBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1150;
    bp.Q.value = 2.4;

    const tapG = ctx.createGain();
    tapG.gain.setValueAtTime(0.05, now);
    tapG.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);

    tap.connect(bp);
    bp.connect(tapG);
    this.connectVoice(tapG, 0.85, 0.25);
    tap.start(now, Math.random(), 0.06);
  }

  public playDeselect(): void {
    if (!this.canPlay() || !this.ctx || !this.whiteNoiseBuf) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const tap = ctx.createBufferSource();
    tap.buffer = this.whiteNoiseBuf;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 650;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.035, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);

    tap.connect(lp);
    lp.connect(g);
    this.connectVoice(g, 0.8, 0.2);
    tap.start(now, Math.random(), 0.07);
  }

  public playCameraSwitch(): void {
    if (!this.canPlay() || !this.ctx || !this.brownNoiseBuf) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = this.brownNoiseBuf;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(280, now);
    bp.frequency.exponentialRampToValueAtTime(720, now + 0.14);
    bp.frequency.exponentialRampToValueAtTime(220, now + 0.34);
    bp.Q.value = 1.1;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.075, now + 0.09);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.36);

    src.connect(bp);
    bp.connect(g);
    this.connectVoice(g, 0.65, 0.45);
    src.start(now, Math.random() * 1.5, 0.38);
  }

  // =========================================================================
  // Piece Movement & Landing SFX
  // =========================================================================

  public playMoveStart(opts: {
    pieceType?: AudioPieceType;
    distanceSq?: number;
    isCastling?: boolean;
    isCapture?: boolean;
  }): void {
    if (!this.canPlay() || !this.ctx || !this.brownNoiseBuf || !this.whiteNoiseBuf) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const dist = Math.max(1, Math.min(8, opts.distanceSq || 1));
    const dur = Math.min(0.95, 0.26 + dist * 0.085);

    if (opts.pieceType === 'knight') {
      // Magical vaulting wind arc for jumping Knight
      const whoosh = ctx.createBufferSource();
      whoosh.buffer = this.whiteNoiseBuf;

      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(260, now);
      bp.frequency.exponentialRampToValueAtTime(980, now + dur * 0.48);
      bp.frequency.exponentialRampToValueAtTime(280, now + dur);
      bp.Q.value = 1.6;

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(0.095, now + dur * 0.38);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);

      whoosh.connect(bp);
      bp.connect(g);
      this.connectVoice(g, 0.6, 0.5);
      whoosh.start(now, Math.random(), dur + 0.05);
      return;
    }

    // Heavy carved-stone sliding grind along marble altar
    const grind = ctx.createBufferSource();
    grind.buffer = this.brownNoiseBuf;
    grind.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(opts.isCastling ? 170 : 210, now);
    filter.frequency.linearRampToValueAtTime(290, now + dur * 0.5);
    filter.frequency.linearRampToValueAtTime(150, now + dur);
    filter.Q.value = 1.9;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(opts.isCastling ? 0.14 : 0.10, now + 0.06);
    g.gain.setValueAtTime(opts.isCastling ? 0.12 : 0.085, Math.max(now + 0.07, now + dur - 0.08));
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    grind.connect(filter);
    filter.connect(g);
    this.connectVoice(g, 0.78, 0.35);
    grind.start(now, Math.random() * 1.5);
    grind.stop(now + dur + 0.05);

    if (opts.isCastling) {
      // Solemn low stone chime for Royal Castling
      const chime = ctx.createOscillator();
      chime.type = 'triangle';
      chime.frequency.setValueAtTime(196, now + 0.05);
      const cg = ctx.createGain();
      cg.gain.setValueAtTime(0.0001, now + 0.05);
      cg.gain.linearRampToValueAtTime(0.05, now + 0.08);
      cg.gain.exponentialRampToValueAtTime(0.0001, now + 0.65);
      chime.connect(cg);
      this.connectVoice(cg, 0.5, 0.65);
      chime.start(now + 0.05);
      chime.stop(now + 0.7);
    }
  }

  public playMoveLand(opts: { pieceType?: AudioPieceType; isCastling?: boolean } = {}): void {
    if (!this.canPlay() || !this.ctx || !this.whiteNoiseBuf) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const weightMap: Record<AudioPieceType, number> = {
      pawn: 118,
      bishop: 102,
      knight: 96,
      rook: 82,
      queen: 88,
      king: 76
    };
    const baseHz = weightMap[opts.pieceType || 'pawn'] || 105;

    const playThud = (offset: number, amp: number, pitchMul = 1) => {
      const t = now + offset;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(baseHz * pitchMul * 1.45, t);
      osc.frequency.exponentialRampToValueAtTime(baseHz * pitchMul * 0.55, t + 0.11);

      const og = ctx.createGain();
      og.gain.setValueAtTime(amp, t);
      og.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);

      osc.connect(og);
      this.connectVoice(og, 0.85, 0.35);
      osc.start(t);
      osc.stop(t + 0.16);

      // Stone contact transient
      const click = ctx.createBufferSource();
      click.buffer = this.whiteNoiseBuf!;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 900;

      const cg = ctx.createGain();
      cg.gain.setValueAtTime(amp * 0.65, t);
      cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);

      click.connect(lp);
      lp.connect(cg);
      this.connectVoice(cg, 0.8, 0.25);
      click.start(t, Math.random(), 0.06);
    };

    if (opts.pieceType === 'knight') {
      playThud(0, 0.12, 1.08);
      playThud(0.075, 0.15, 0.92);
    } else if (opts.isCastling) {
      playThud(0, 0.16, 0.9);
      playThud(0.09, 0.14, 1.05);
    } else {
      playThud(0, 0.14, 1.0);
    }
  }

  // =========================================================================
  // Melee Capture & Stone Shatter SFX
  // =========================================================================

  public playCaptureSwing(pieceType: AudioPieceType = 'pawn'): void {
    if (!this.canPlay() || !this.ctx || !this.whiteNoiseBuf) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = this.whiteNoiseBuf;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    const highStart = pieceType === 'queen' || pieceType === 'bishop' ? 1400 : 950;
    bp.frequency.setValueAtTime(280, now);
    bp.frequency.exponentialRampToValueAtTime(highStart, now + 0.18);
    bp.frequency.exponentialRampToValueAtTime(340, now + 0.34);
    bp.Q.value = 1.4;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.14, now + 0.14);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.36);

    src.connect(bp);
    bp.connect(g);
    this.connectVoice(g, 0.72, 0.45);
    src.start(now, Math.random(), 0.38);
  }

  public playCaptureStrike(pieceType: AudioPieceType = 'pawn'): void {
    if (!this.canPlay() || !this.ctx || !this.whiteNoiseBuf) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Metallic blade / stone weapon ring
    const freqs = pieceType === 'queen' || pieceType === 'bishop' ? [740, 1180, 1790] : [520, 890, 1410];
    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      osc.type = idx === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(f, now);
      osc.frequency.exponentialRampToValueAtTime(f * 0.94, now + 0.24);

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.08 / (idx + 1), now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.26);

      osc.connect(g);
      this.connectVoice(g, 0.65, 0.55);
      osc.start(now);
      osc.stop(now + 0.28);
    });

    // Hard impact punch
    const punch = ctx.createOscillator();
    punch.type = 'sine';
    punch.frequency.setValueAtTime(160, now);
    punch.frequency.exponentialRampToValueAtTime(42, now + 0.14);

    const pg = ctx.createGain();
    pg.gain.setValueAtTime(0.24, now);
    pg.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
    punch.connect(pg);
    this.connectVoice(pg, 0.9, 0.3);
    punch.start(now);
    punch.stop(now + 0.18);
  }

  public playStoneShatter(intensity = 1.0): void {
    if (!this.canPlay() || !this.ctx || !this.whiteNoiseBuf || !this.brownNoiseBuf) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const scale = Math.max(0.6, Math.min(1.5, intensity));

    // 1. Deep granite detonation sub-boom
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(115, now);
    sub.frequency.exponentialRampToValueAtTime(32, now + 0.35);

    const subG = ctx.createGain();
    subG.gain.setValueAtTime(0.32 * scale, now);
    subG.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);
    sub.connect(subG);
    this.connectVoice(subG, 0.85, 0.45);
    sub.start(now);
    sub.stop(now + 0.4);

    // 2. Sharp stone fracture crack
    const crack = ctx.createBufferSource();
    crack.buffer = this.whiteNoiseBuf;

    const hp = ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.setValueAtTime(1850, now);
    hp.frequency.exponentialRampToValueAtTime(520, now + 0.25);
    hp.Q.value = 0.85;

    const crackG = ctx.createGain();
    crackG.gain.setValueAtTime(0.28 * scale, now);
    crackG.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);

    crack.connect(hp);
    hp.connect(crackG);
    this.connectVoice(crackG, 0.75, 0.55);
    crack.start(now, Math.random(), 0.32);

    // 3. Cascading shattered stone shards bouncing on the altar
    const shardCount = 9;
    for (let i = 0; i < shardCount; i++) {
      const delay = 0.04 + Math.pow(i / shardCount, 1.15) * 0.52 + Math.random() * 0.05;
      const t = now + delay;

      const shard = ctx.createBufferSource();
      shard.buffer = this.whiteNoiseBuf;

      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1300 + Math.random() * 2800;
      bp.Q.value = 2.8 + Math.random() * 2.5;

      const sg = ctx.createGain();
      const amp = (0.11 - i * 0.008) * scale * (0.7 + Math.random() * 0.5);
      sg.gain.setValueAtTime(Math.max(0.015, amp), t);
      sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.06 + Math.random() * 0.05);

      shard.connect(bp);
      bp.connect(sg);

      if (typeof ctx.createStereoPanner === 'function') {
        const pan = ctx.createStereoPanner();
        pan.pan.value = (Math.random() - 0.5) * 1.2;
        sg.connect(pan);
        this.connectVoice(pan, 0.78, 0.4);
      } else {
        this.connectVoice(sg, 0.78, 0.4);
      }

      shard.start(t, Math.random() * 1.2, 0.12);
    }
  }

  // =========================================================================
  // Chess State & Cathedral Bell Cues
  // =========================================================================

  public playCheckWarning(): void {
    if (!this.canPlay() || !this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Resonant bronze cathedral warning bell (minor tension partials)
    const partials = [
      { freq: 311.13, amp: 0.12, dur: 1.1 }, // Eb4
      { freq: 466.16, amp: 0.07, dur: 0.9 }, // Bb4
      { freq: 622.25, amp: 0.045, dur: 0.7 }, // Eb5
      { freq: 932.33, amp: 0.025, dur: 0.45 }
    ];

    for (const p of partials) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(p.freq, now);

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(p.amp, now + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, now + p.dur);

      osc.connect(g);
      this.connectVoice(g, 0.55, 0.75);
      osc.start(now);
      osc.stop(now + p.dur + 0.05);
    }
  }

  public playPawnPromotion(): void {
    if (!this.canPlay() || !this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Ascending golden harmonic arpeggio (C5 - E5 - G5 - C6)
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      const t = now + idx * 0.075;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.08, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);

      osc.connect(g);
      this.connectVoice(g, 0.5, 0.72);
      osc.start(t);
      osc.stop(t + 0.6);
    });
  }

  public playKingStagger(): void {
    if (!this.canPlay() || !this.ctx || !this.brownNoiseBuf) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Deep tectonic stone groan before King topples
    const rumble = ctx.createBufferSource();
    rumble.buffer = this.brownNoiseBuf;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(140, now);
    lp.frequency.linearRampToValueAtTime(240, now + 0.55);
    lp.frequency.linearRampToValueAtTime(110, now + 1.05);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.18, now + 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 1.08);

    rumble.connect(lp);
    lp.connect(g);
    this.connectVoice(g, 0.75, 0.55);
    rumble.start(now, Math.random(), 1.15);

    // Somber low cathedral toll (C3)
    const bell = ctx.createOscillator();
    bell.type = 'sine';
    bell.frequency.setValueAtTime(130.81, now);
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(0.0001, now);
    bg.gain.linearRampToValueAtTime(0.14, now + 0.02);
    bg.gain.exponentialRampToValueAtTime(0.0001, now + 1.6);

    bell.connect(bg);
    this.connectVoice(bg, 0.45, 0.85);
    bell.start(now);
    bell.stop(now + 1.65);
  }

  public playKingFallImpact(): void {
    if (!this.canPlay() || !this.ctx) return;
    // Heavy stone smash + crown debris
    this.playStoneShatter(1.35);

    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Deep monumental bell impact (G2 + D3 + G3)
    const chord = [98.0, 146.83, 196.0, 293.66];
    chord.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      osc.type = idx === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, now + 0.03);

      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 950;

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now + 0.03);
      g.gain.linearRampToValueAtTime(0.14 / (idx + 1), now + 0.06);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 2.2);

      osc.connect(lp);
      lp.connect(g);
      this.connectVoice(g, 0.45, 0.85);
      osc.start(now + 0.03);
      osc.stop(now + 2.3);
    });
  }

  public playStalemateBell(): void {
    if (!this.canPlay() || !this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const notes = [261.63, 392.0]; // C4 + G4 neutral fifth
    notes.forEach((freq) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(0.09, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 1.5);

      osc.connect(g);
      this.connectVoice(g, 0.5, 0.78);
      osc.start(now);
      osc.stop(now + 1.55);
    });
  }
}

export const cathedralAudio = new CathedralAudioEngine();
