// Synthesised sound effects and a small procedural soundtrack (no audio files,
// nothing to license). Everything is scheduled on the Web Audio clock.
export function createAudio() {
  let ctx = null, master, sfxBus, musicBus, comp, noise;
  const vol = { master: .8, sfx: .9, music: .45 };
  let musicMode = 'off', nextNote = 0, step = 0, timer = null, intensity = 0;

  // Browsers only allow audio after a user gesture; the desktop app allows it
  // immediately (autoplay policy switch in electron/main.cjs).
  let unlocked = typeof window !== 'undefined' && !!window.native;
  function ensure() {
    if (!unlocked) return null;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
      master = ctx.createGain(); sfxBus = ctx.createGain(); musicBus = ctx.createGain();
      sfxBus.connect(master); musicBus.connect(master); master.connect(comp); comp.connect(ctx.destination);
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      applyVolumes();
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }
  function applyVolumes() {
    if (!ctx) return;
    master.gain.value = vol.master; sfxBus.gain.value = vol.sfx; musicBus.gain.value = vol.music * .55;
  }
  const unlock = () => { unlocked = true; ensure(); if (musicMode !== 'off') startMusic(); };
  for (const ev of ['pointerdown', 'keydown', 'touchstart']) addEventListener(ev, unlock, { passive: true });

  function out(pan, bus) {
    if (!pan || !ctx.createStereoPanner) return bus;
    const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); p.connect(bus); return p;
  }
  function tone(freq, dur, o = {}) {
    if (!ctx) return;
    const t = ctx.currentTime + (o.delay || 0), osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = o.type || 'triangle'; osc.frequency.setValueAtTime(freq, t);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.slide), t + dur);
    const peak = o.gain ?? .12, a = o.attack ?? .005;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = g;
    if (o.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; g.connect(f); node = f; }
    osc.connect(g); node.connect(out(o.pan, o.bus || sfxBus));
    osc.start(t); osc.stop(t + dur + .05);
  }
  function hiss(dur, o = {}) {
    if (!ctx) return;
    const t = ctx.currentTime + (o.delay || 0), src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noise; src.loop = true;
    f.type = o.filter || 'bandpass'; f.frequency.setValueAtTime(o.freq || 1200, t); f.Q.value = o.q ?? 1;
    if (o.slide) f.frequency.exponentialRampToValueAtTime(o.slide, t + dur);
    const peak = o.gain ?? .1;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + (o.attack ?? .004)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(out(o.pan, o.bus || sfxBus));
    src.start(t, Math.random() * .5); src.stop(t + dur + .05);
  }

  const sfx = {
    ui: () => tone(880, .06, { type: 'square', gain: .04, lp: 3000 }),
    move: () => tone(660, .04, { type: 'triangle', gain: .03 }),
    back: () => tone(440, .07, { type: 'square', gain: .035, slide: 330, lp: 2500 }),
    push: (pan) => { hiss(.18, { freq: 900, slide: 300, gain: .16, pan }); tone(160, .12, { type: 'sine', gain: .2, slide: 70, pan }); },
    hit: (pan) => { tone(220, .1, { type: 'square', gain: .08, slide: 110, lp: 1600, pan }); hiss(.08, { freq: 2600, gain: .08, pan }); },
    dash: (pan) => hiss(.25, { freq: 500, slide: 2400, gain: .12, q: 2, pan }),
    trapArm: (pan) => { tone(620, .08, { type: 'square', gain: .05, lp: 2400, pan }); tone(930, .1, { type: 'square', gain: .05, lp: 2400, delay: .09, pan }); },
    trapFire: (type, pan) => {
      if (type === 'ice') { for (let i = 0; i < 5; i++) tone(1400 + i * 260, .18, { type: 'sine', gain: .045, delay: i * .035, pan }); hiss(.4, { freq: 5000, filter: 'highpass', gain: .05, pan }); }
      else if (type === 'cage') { tone(180, .25, { type: 'square', gain: .09, lp: 900, pan }); hiss(.2, { freq: 400, gain: .12, pan }); tone(120, .3, { type: 'sine', gain: .15, delay: .05, pan }); }
      else if (type === 'spring') { tone(200, .3, { type: 'triangle', gain: .14, slide: 900, pan }); }
      else { tone(90, .35, { type: 'sine', gain: .22, slide: 40, pan }); hiss(.3, { freq: 1500, slide: 200, gain: .12, pan }); }
    },
    elim: (pan) => { hiss(.35, { freq: 1800, slide: 300, gain: .14, pan }); tone(520, .25, { type: 'triangle', gain: .08, slide: 130, pan }); },
    fall: (pan) => tone(900, .7, { type: 'sine', gain: .07, slide: 180, pan }),
    order: () => { [523, 659, 784, 1046].forEach((f, i) => tone(f, .22, { type: 'square', gain: .06, lp: 3500, delay: i * .07 })); tone(1318, .4, { type: 'triangle', gain: .07, delay: .3 }); },
    lose: () => { tone(300, .2, { type: 'square', gain: .06, slide: 220, lp: 1400 }); tone(220, .35, { type: 'square', gain: .06, slide: 150, lp: 1200, delay: .15 }); },
    respawn: () => { tone(392, .15, { type: 'triangle', gain: .07 }); tone(587, .25, { type: 'triangle', gain: .07, delay: .1 }); },
    mask: (pan) => { hiss(.3, { freq: 700, slide: 3000, gain: .09, pan }); tone(740, .25, { type: 'sine', gain: .06, slide: 1480, pan }); },
    unmask: (pan) => tone(700, .18, { type: 'sine', gain: .05, slide: 350, pan }),
    caught: (pan) => { tone(140, .3, { type: 'square', gain: .08, lp: 700, pan }); },
    slip: (pan) => tone(1200, .4, { type: 'sine', gain: .05, slide: 500, pan }),
    count: () => tone(660, .12, { type: 'square', gain: .07, lp: 2600 }),
    go: () => { tone(990, .3, { type: 'square', gain: .08, lp: 3200 }); tone(1320, .35, { type: 'triangle', gain: .06, delay: .02 }); },
    tick: () => tone(1200, .04, { type: 'square', gain: .025, lp: 3000 }),
    end: (win) => win ? [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, .3, { type: 'square', gain: .06, lp: 3200, delay: i * .1 })) : [392, 349, 311, 262].forEach((f, i) => tone(f, .32, { type: 'triangle', gain: .07, delay: i * .14 })),
    join: () => { tone(523, .1, { type: 'triangle', gain: .06 }); tone(784, .15, { type: 'triangle', gain: .06, delay: .08 }); },
    leave: () => { tone(523, .1, { type: 'triangle', gain: .05 }); tone(392, .15, { type: 'triangle', gain: .05, delay: .08 }); }
  };

  // ---- music: i–VI–III–VII in A minor, 112 BPM, sixteenth-note sequencer -------
  const BPM = 112, STEP = 60 / BPM / 4;
  const CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  function kick(t) { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + .14); g.gain.setValueAtTime(.5, t); g.gain.exponentialRampToValueAtTime(.001, t + .2); o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + .22); }
  function nz(t, dur, freq, gain, type = 'highpass') { const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = noise; f.type = type; f.frequency.value = freq; g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(.001, t + dur); s.connect(f); f.connect(g); g.connect(musicBus); s.start(t, Math.random() * .5); s.stop(t + dur + .02); }
  function note(t, midi, dur, type, gain, lp) { const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter(); o.type = type; o.frequency.value = mtof(midi); f.type = 'lowpass'; f.frequency.value = lp; g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + dur); o.connect(f); f.connect(g); g.connect(musicBus); o.start(t); o.stop(t + dur + .03); }
  function schedule() {
    if (!ctx || musicMode === 'off') return;
    while (nextNote < ctx.currentTime + .12) {
      const s = step % 64, bar = Math.floor(s / 16), beat = s % 16, chord = CHORDS[bar], t = nextNote;
      const match = musicMode === 'match';
      if (match) {
        if (beat % 4 === 0) kick(t);
        if (beat === 4 || beat === 12) nz(t, .12, 1800, .16, 'bandpass');
        if (beat % 2 === 0) nz(t, .03, 7000, intensity > .5 ? .07 : .045);
        if (beat % 2 === 1 && intensity > .5) nz(t, .02, 9000, .03);
      } else if (beat === 0 || beat === 8) nz(t, .5, 5000, .015);
      if (beat % 2 === 0) note(t, chord[0] - 24 + (beat % 8 === 6 ? 12 : 0), STEP * 1.8, 'triangle', match ? .2 : .13, 700);
      if (match ? (beat % 4 === 2) : (beat === 0)) for (const m of chord) note(t, m, match ? STEP * 1.6 : STEP * 14, 'square', match ? .025 : .02, match ? 1800 : 900);
      const arp = match ? beat % 1 === 0 : beat % 2 === 0;
      if (arp && (match || bar % 2 === 0)) note(t, chord[(step * 7) % 3] + 12 + (beat >= 8 ? 12 : 0), STEP * .9, 'sine', match ? .045 : .03, 4000);
      nextNote += STEP; step++;
    }
  }
  function startMusic() {
    if (!ctx || musicMode === 'off') return;
    if (timer) return;
    nextNote = ctx.currentTime + .08; step = 0;
    timer = setInterval(schedule, 40);
  }
  function stopMusic() { clearInterval(timer); timer = null; }

  return {
    sfx: new Proxy(sfx, { get: (o, k) => (...args) => { if (ensure() && vol.master > 0 && vol.sfx > 0) try { o[k]?.(...args); } catch { /* audio is best-effort */ } } }),
    setVolumes(v) { Object.assign(vol, v); applyVolumes(); },
    get volumes() { return { ...vol }; },
    music(mode) {
      if (mode === musicMode) return;
      musicMode = mode; stopMusic();
      if (mode !== 'off' && ensure()) startMusic();
    },
    setIntensity(v) { intensity = v; },
    resume: ensure
  };
}
