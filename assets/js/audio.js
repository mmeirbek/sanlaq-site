/* SAÑLAQ landing — sound.
 * A browser port of the game's ProceduralAudio.cs: plucked strings (Karplus-Strong) on a pentatonic
 * scale for the music, filtered noise for wind and short tones for interface effects.
 * Nothing is downloaded; every buffer is synthesised the first time it is needed. */
(() => {
  const REST = null;
  const PENTATONIC = [0, 3, 5, 7, 10];
  const PHRASE_A = [0, 2, 3, 2, 4, 3, 2, 0, 2, 3, 4, 5, 4, 3, 2, -1];
  const PHRASE_B = [5, 4, 3, 4, 2, 3, 2, 0, -1, 0, 2, 0, 3, 2, 0, -1];
  const PHRASE_SPARSE = [0, REST, 2, REST, 3, REST, 2, REST, 4, REST, 3, REST, 2, REST, 0, REST];
  const PHRASE_DRIVE = [0, 0, 3, 0, 4, 3, 0, -2, 0, 0, 3, 4, 5, 4, 3, 0];
  const PHRASE_TRAVEL = [0, 2, 4, 5, 7, 5, 4, 2, 0, 2, 4, 2, 3, 2, 0, REST];

  // Same tempos, phrase orders and gallop flags as MusicTrack in the game.
  const TRACKS = {
    menu: { seed: 8, bpm: 72, phrases: [PHRASE_SPARSE, PHRASE_A, PHRASE_SPARSE, PHRASE_B], gallop: false, gain: 0.55 },
    select: { seed: 9, bpm: 88, phrases: [PHRASE_B, PHRASE_A, PHRASE_B, PHRASE_SPARSE], gallop: false, gain: 0.58 },
    aul: { seed: 10, bpm: 104, phrases: [PHRASE_A, PHRASE_A, PHRASE_B, PHRASE_A], gallop: true, gain: 0.6 },
    night: { seed: 11, bpm: 58, phrases: [PHRASE_SPARSE, PHRASE_SPARSE, PHRASE_B, PHRASE_SPARSE], gallop: false, gain: 0.5 },
    battle: { seed: 12, bpm: 132, phrases: [PHRASE_DRIVE, PHRASE_DRIVE, PHRASE_B, PHRASE_DRIVE], gallop: true, gain: 0.62 },
    map: { seed: 13, bpm: 96, phrases: [PHRASE_TRAVEL, PHRASE_A, PHRASE_TRAVEL, PHRASE_B], gallop: true, gain: 0.56 }
  };
  const FEATURED_MUSIC_URL = 'assets/audio/zhailau-kol-keshteri.mp3';
  const FEATURED_MUSIC_VOLUME = 0.65;

  let ctx = null;
  let master, musicBus, sfxBus, windBus;
  let featuredMusic = null;
  let muted = true;
  let current = null;
  let currentName = null;
  let wanted = null;
  const musicCache = {};
  const sfxCache = {};

  function random(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function noteFrequency(index) {
    const octave = Math.floor(index / 5);
    const degree = index - octave * 5;
    return 293.66 * Math.pow(2, (PENTATONIC[degree] + 12 * octave) / 12);
  }

  // Karplus-Strong: a noise burst circulating through a short averaging delay line rings like a plucked string.
  function pluck(buffer, sampleRate, start, frequency, amplitude, rand) {
    const period = Math.max(2, Math.round(sampleRate / frequency));
    const line = new Float32Array(period);
    for (let i = 0; i < period; i++) line[i] = rand() * 2 - 1;
    const length = Math.min(buffer.length, Math.round(sampleRate * 1.6));
    let index = 0;
    for (let i = 0; i < length; i++) {
      const next = (index + 1) % period;
      const value = line[index];
      line[index] = (value + line[next]) * 0.5 * 0.9968;
      index = next;
      buffer[(start + i) % buffer.length] += value * amplitude * Math.min(1, i / 60);
    }
  }

  function normalize(data, peak) {
    let max = 0.0001;
    for (let i = 0; i < data.length; i++) max = Math.max(max, Math.abs(data[i]));
    const scale = peak / max;
    for (let i = 0; i < data.length; i++) data[i] *= scale;
  }

  function toBuffer(data) {
    const buffer = ctx.createBuffer(1, data.length, ctx.sampleRate);
    buffer.copyToChannel(data, 0);
    return buffer;
  }

  function compose(name) {
    const track = TRACKS[name];
    const sr = ctx.sampleRate;
    const rand = random(track.seed);
    const step = Math.round((sr * 60) / track.bpm / 2);
    const stepsPerPhrase = PHRASE_A.length;
    const data = new Float32Array(step * stepsPerPhrase * track.phrases.length);
    for (let p = 0; p < track.phrases.length; p++) {
      for (let s = 0; s < stepsPerPhrase; s++) {
        const start = (p * stepsPerPhrase + s) * step;
        const note = track.phrases[p][s];
        if (note !== REST) pluck(data, sr, start, noteFrequency(note), 0.55, rand);
        // Second string of the dombra: a quiet drone a fourth below, with a galloping accent when requested.
        const beat = s % 8;
        const drone = track.gallop ? beat === 0 || beat === 3 || beat === 4 || beat === 7 : beat === 0;
        if (drone) pluck(data, sr, start, beat === 0 ? 146.83 : 196, track.gallop ? 0.3 : 0.22, rand);
      }
    }
    normalize(data, track.gain);
    return toBuffer(data);
  }

  function wind() {
    const sr = ctx.sampleRate;
    const rand = random(3);
    const length = sr * 10;
    const fade = sr;
    const raw = new Float32Array(length + fade);
    let low = 0;
    for (let i = 0; i < raw.length; i++) {
      low += (rand() * 2 - 1 - low) * 0.02;
      raw[i] = low;
    }
    const data = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      const swell = 0.55 + 0.45 * Math.sin((2 * Math.PI * i) / sr / 5);
      const blend = i < fade ? i / fade : 1;
      const value = i < fade ? raw[length + i] * (1 - blend) + raw[i] * blend : raw[i];
      data[i] = value * swell;
    }
    normalize(data, 0.5);
    return toBuffer(data);
  }

  const sine = (t, f) => Math.sin(2 * Math.PI * f * t);
  const square = (t, f) => (sine(t, f) >= 0 ? 1 : -1);
  const triangle = (t, f) => 2 * Math.abs(2 * (t * f - Math.floor(t * f + 0.5))) - 1;

  function tone(seconds, wave, volume, decay) {
    const sr = ctx.sampleRate;
    const data = new Float32Array(Math.round(sr * seconds));
    for (let i = 0; i < data.length; i++) {
      const t = i / sr;
      data[i] = wave(t) * volume * Math.exp(-decay * t) * Math.min(1, i / 80);
    }
    return toBuffer(data);
  }

  function noise(seconds, rand, volume, decay, smoothing) {
    const sr = ctx.sampleRate;
    const data = new Float32Array(Math.round(sr * seconds));
    let low = 0;
    for (let i = 0; i < data.length; i++) {
      low += (rand() * 2 - 1 - low) * smoothing;
      data[i] = low * volume * Math.exp((-decay * i) / sr);
    }
    return toBuffer(data);
  }

  function arpeggio(notes, spacing) {
    const sr = ctx.sampleRate;
    const rand = random(5);
    const data = new Float32Array(Math.round(sr * (spacing * notes.length + 1)));
    notes.forEach((f, i) => pluck(data, sr, Math.round(sr * spacing * i), f, 0.5, rand));
    normalize(data, 0.55);
    return toBuffer(data);
  }

  function bell() {
    const ratios = [1, 2.76, 5.4, 8.93];
    const levels = [1, 0.5, 0.28, 0.14];
    return tone(0.7, (t) => {
      let sum = 0;
      for (let i = 0; i < ratios.length; i++) sum += sine(t, 1180 * ratios[i]) * levels[i] * Math.exp(-t * (4 + i * 3));
      return sum;
    }, 0.3, 0);
  }

  // Landing-only effect: a short rising noise sweep for the pixel slide transition.
  function whoosh() {
    const sr = ctx.sampleRate;
    const rand = random(21);
    const seconds = 0.5;
    const data = new Float32Array(Math.round(sr * seconds));
    let low = 0;
    for (let i = 0; i < data.length; i++) {
      const t = i / data.length;
      const smoothing = 0.02 + 0.25 * t;
      low += (rand() * 2 - 1 - low) * smoothing;
      data[i] = low * Math.sin(Math.PI * t) * 0.9;
    }
    normalize(data, 0.35);
    return toBuffer(data);
  }

  const EFFECTS = {
    hover: () => tone(0.05, (t) => sine(t, 880), 0.22, 40),
    click: () => tone(0.09, (t) => sine(t, t < 0.04 ? 660 : 990) * 0.8 + sine(t, 1320) * 0.2, 0.35, 30),
    blip: () => tone(0.035, (t) => square(t, 540) * 0.5, 0.18, 60),
    reward: () => arpeggio([293.66, 349.23, 440, 587.33], 0.14),
    fail: () => tone(0.42, (t) => triangle(t, 330 + (196 - 330) * (t / 0.42)), 0.4, 6),
    step: () => noise(0.09, random(19), 0.12, 55, 0.6),
    ring: () => bell(),
    toss: () => noise(0.18, random(18), 0.5, 12, 0.25),
    hit: () => { const r = random(20); return tone(0.16, (t) => sine(t, 90) + r() * 0.4 - 0.2, 0.5, 22); },
    whoosh: () => whoosh()
  };

  function init() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 1;
    master.connect(ctx.destination);
    musicBus = ctx.createGain();
    musicBus.gain.value = 0.5;
    musicBus.connect(master);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.7;
    sfxBus.connect(master);
    windBus = ctx.createGain();
    windBus.gain.value = 0.08;
    windBus.connect(master);
    featuredMusic = new Audio(FEATURED_MUSIC_URL);
    featuredMusic.loop = true;
    featuredMusic.preload = 'auto';
    const featuredSource = ctx.createMediaElementSource(featuredMusic);
    const featuredGain = ctx.createGain();
    featuredGain.gain.value = FEATURED_MUSIC_VOLUME;
    featuredSource.connect(featuredGain).connect(master);
    const w = ctx.createBufferSource();
    w.buffer = wind();
    w.loop = true;
    w.connect(windBus);
    w.start();
    if (wanted) music(wanted);
    return true;
  }

  function music(name) {
    wanted = name;
    if (!ctx || !name || name === currentName) return;
    currentName = name;
    if (current) {
      current.src.stop();
      current = null;
    }
    if (!featuredMusic) return;
    featuredMusic.play().catch(() => {});
  }

  function sfx(name, volume = 1) {
    if (!ctx || muted || !EFFECTS[name]) return;
    const buffer = sfxCache[name] || (sfxCache[name] = EFFECTS[name]());
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    if (volume !== 1) {
      const g = ctx.createGain();
      g.gain.value = volume;
      src.connect(g).connect(sfxBus);
    } else {
      src.connect(sfxBus);
    }
    src.start();
  }

  function setMuted(value) {
    muted = value;
    if (!ctx) return;
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(muted ? 0 : 1, now + 0.3);
    if (!muted && ctx.state === 'suspended') ctx.resume();
  }

  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend();
    else if (!muted) ctx.resume();
  });

  window.SanlaqAudio = {
    init,
    music,
    sfx,
    setMuted,
    isMuted: () => muted,
    isReady: () => !!ctx
  };
})();
