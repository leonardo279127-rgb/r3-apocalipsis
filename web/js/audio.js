/**
 * ============================================================
 *  R3 APOCALIPSIS — Motor de audio 100% sintetizado
 * ============================================================
 *  Todos los sonidos se generan por código con Web Audio API.
 *  Cero archivos de audio externos: nada que licenciar, nada
 *  que descargar, y pesa prácticamente nada.
 * ============================================================
 */
const R3Audio = (() => {
  let ctx = null;
  let master = null;
  let unlocked = false;

  function ensureCtx() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.55;
      master.connect(ctx.destination);
    }
    return ctx;
  }

  function unlock() {
    ensureCtx();
    if (ctx.state === "suspended") ctx.resume();
    unlocked = true;
  }

  function noiseBuffer(duration = 0.3) {
    const c = ensureCtx();
    const buf = c.createBuffer(1, c.sampleRate * duration, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  function envGain(node, t0, attack, decay, peak = 1) {
    node.gain.cancelScheduledValues(t0);
    node.gain.setValueAtTime(0.0001, t0);
    node.gain.exponentialRampToValueAtTime(peak, t0 + attack);
    node.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  }

  function tone({ freq = 440, type = "sine", dur = 0.2, attack = 0.005, decay = 0.18, gain = 0.35, glideTo = null, delay = 0 }) {
    const c = ensureCtx();
    const t0 = c.currentTime + delay;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
    envGain(g, t0, attack, decay, gain);
    osc.connect(g).connect(master);
    osc.start(t0);
    osc.stop(t0 + attack + decay + 0.05);
  }

  function noiseHit({ dur = 0.15, gain = 0.4, filterFreq = 1200, delay = 0 }) {
    const c = ensureCtx();
    const t0 = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(dur);
    const filt = c.createBiquadFilter();
    filt.type = "bandpass";
    filt.frequency.value = filterFreq;
    const g = c.createGain();
    envGain(g, t0, 0.002, dur, gain);
    src.connect(filt).connect(g).connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  // ---- Efectos concretos del juego -----------------------------------

  function uiClick() {
    if (!unlocked) return;
    tone({ freq: 720, type: "square", dur: 0.05, decay: 0.05, gain: 0.15 });
  }

  function coinPay() {
    if (!unlocked) return;
    [523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, type: "triangle", dur: 0.12, decay: 0.14, gain: 0.25, delay: i * 0.06 }));
  }

  function shoot() {
    if (!unlocked) return;
    tone({ freq: 900, type: "sawtooth", dur: 0.09, decay: 0.08, gain: 0.18, glideTo: 240 });
    noiseHit({ dur: 0.05, gain: 0.08, filterFreq: 2200 });
  }

  // `pitchMult` (por defecto 1, sin cambio) es la "firma de sonido"
  // propia de un legendario en concreto (ver LEGENDARY_AURA_THEMES.pitch
  // en game.js) — pedido explícito: "quiero total personalización... sus
  // sonidos". Se aplica multiplicando todas las frecuencias, así cada
  // personaje suena reconociblemente MÁS agudo o MÁS grave que los
  // demás, sin necesitar una tabla de sonidos aparte por cada uno.
  function hitImpact(tier = "common", pitchMult = 1) {
    if (!unlocked) return;
    const freqBase = ({ common: 300, uncommon: 260, rare: 220, epic: 180, legendary: 140 }[tier] || 300) * pitchMult;
    tone({ freq: freqBase, type: "square", dur: 0.08, decay: 0.09, gain: 0.22, glideTo: freqBase * 0.6 });
    noiseHit({ dur: 0.08, gain: 0.25, filterFreq: 1800 });
  }

  function death(tier = "common", pitchMult = 1) {
    if (!unlocked) return;
    const table = {
      common: { freq: 380, glide: 90, dur: 0.22, gain: 0.3, extra: 0 },
      uncommon: { freq: 420, glide: 80, dur: 0.28, gain: 0.32, extra: 1 },
      rare: { freq: 480, glide: 70, dur: 0.36, gain: 0.36, extra: 2 },
      epic: { freq: 560, glide: 60, dur: 0.5, gain: 0.4, extra: 3 },
      legendary: { freq: 660, glide: 40, dur: 0.9, gain: 0.5, extra: 5 },
    };
    const cfg = table[tier] || table.common;
    const freq = cfg.freq * pitchMult;
    const glide = cfg.glide * pitchMult;
    tone({ freq, type: "sawtooth", dur: cfg.dur, decay: cfg.dur, gain: cfg.gain, glideTo: glide });
    noiseHit({ dur: cfg.dur, gain: cfg.gain * 0.6, filterFreq: 900 });
    for (let i = 0; i < cfg.extra; i++) {
      tone({
        freq: freq * (1 + i * 0.5),
        type: "triangle",
        dur: 0.18,
        decay: 0.2,
        gain: cfg.gain * 0.5,
        delay: 0.05 * (i + 1),
      });
    }
  }

  function rareSpawnAlert() {
    if (!unlocked) return;
    [220, 330, 220, 440].forEach((f, i) => tone({ freq: f, type: "square", dur: 0.14, decay: 0.16, gain: 0.22, delay: i * 0.1 }));
  }

  // Fanfarria especial, mucho más grande, solo para legendarios/1-de-1:
  // arpegio ascendente + un "boom" grave de fondo + una campana final.
  // A propósito suena muy distinto a rareSpawnAlert() — así el jugador
  // sabe de inmediato, sin mirar la pantalla, que algo especial cayó.
  // pitchMult: ver hitImpact/death — cada legendario "anuncia su llegada"
  // con su propio tono de voz, no solo con su propio color de aura.
  function legendarySpawnAlert(pitchMult = 1) {
    if (!unlocked) return;
    noiseHit({ dur: 0.5, gain: 0.5, filterFreq: 90 });
    tone({ freq: 110 * pitchMult, type: "sawtooth", dur: 0.5, decay: 0.55, gain: 0.4, glideTo: 55 * pitchMult });
    [330, 415, 494, 659, 880].forEach((f, i) =>
      tone({ freq: f * pitchMult, type: "sawtooth", dur: 0.22, decay: 0.24, gain: 0.3, delay: 0.05 + i * 0.09 })
    );
    tone({ freq: 1320 * pitchMult, type: "sine", dur: 0.9, decay: 1.0, gain: 0.28, delay: 0.5 });
    tone({ freq: 1980 * pitchMult, type: "sine", dur: 0.9, decay: 1.0, gain: 0.18, delay: 0.52 });
  }

  function missLife() {
    if (!unlocked) return;
    tone({ freq: 200, type: "sawtooth", dur: 0.3, decay: 0.32, gain: 0.3, glideTo: 60 });
  }

  // "Splat" — al jugador le llega un objeto lanzado (plátano, manzana,
  // basura...) desde un épico/legendario. Distinto de missLife (dejar
  // caer uno) y de hitImpact (golpear a uno): un impacto húmedo/sordo.
  function playerHit() {
    if (!unlocked) return;
    noiseHit({ dur: 0.16, gain: 0.4, filterFreq: 700 });
    tone({ freq: 160, type: "sine", dur: 0.18, decay: 0.2, gain: 0.28, glideTo: 70 });
  }

  function waveUp() {
    if (!unlocked) return;
    [392, 494, 587, 784].forEach((f, i) => tone({ freq: f, type: "triangle", dur: 0.14, decay: 0.16, gain: 0.22, delay: i * 0.07 }));
  }

  function gameOver() {
    if (!unlocked) return;
    [392, 349, 294, 220].forEach((f, i) => tone({ freq: f, type: "sawtooth", dur: 0.35, decay: 0.4, gain: 0.3, delay: i * 0.18 }));
  }

  // Fanfarria de victoria (colección completa, los 1033 r3tards) — mucho
  // más grande y alegre que waveUp() (que ahora queda libre para
  // usarse solo como "subiste de nivel"), con una campana final que se
  // sostiene en el aire.
  function victory() {
    if (!unlocked) return;
    [392, 494, 587, 784, 987, 1175].forEach((f, i) =>
      tone({ freq: f, type: "triangle", dur: 0.22, decay: 0.26, gain: 0.32, delay: i * 0.09 })
    );
    tone({ freq: 1568, type: "sine", dur: 1.1, decay: 1.2, gain: 0.3, delay: 0.6 });
    tone({ freq: 2093, type: "sine", dur: 1.1, decay: 1.2, gain: 0.2, delay: 0.62 });
    noiseHit({ dur: 0.6, gain: 0.25, filterFreq: 500, delay: 0.02 });
  }

  // ---- Música de fondo ------------------------------------------------
  // 100% sintetizada igual que los efectos de arriba — cero archivos de
  // audio externos, nada que licenciar ni descargar. Un loop corto de
  // acordes en arpegio que se repite, con un "scheduler con lookahead"
  // (la técnica estándar de Web Audio: en vez de confiar en setInterval
  // para el timing exacto de cada nota — que es impreciso — cada tick
  // agenda por adelantado, con AudioContext.currentTime exacto, todas
  // las notas que caen dentro de una pequeña ventana futura).
  //
  // Pedido explícito: "que pegue y no sea molesto" — por eso el volumen
  // de la música vive en su propio nodo de ganancia, bastante más bajo
  // que los efectos (master), y hay un botón de silenciar que se
  // recuerda entre partidas (localStorage). También "más interactivo":
  // la intensidad (tempo + qué tan cargado suena) sube con la
  // dificultad real de la partida (ver setMusicIntensity/
  // onDifficultyChange en game.js), así que la música responde a cómo
  // va la partida en vez de sonar siempre igual.
  const MUSIC_MUTE_KEY = "r3ap_music_muted";
  let musicGain = null;
  let musicFilter = null;
  let musicMuted = (() => {
    try {
      return localStorage.getItem(MUSIC_MUTE_KEY) === "1";
    } catch {
      return false;
    }
  })();
  let musicTimerId = null;
  let musicNextNoteTime = 0;
  let musicStep = 0;
  let musicBarIndex = 0;
  let musicIntensity = 0;
  let musicPlaying = false;

  // Progresión de 4 acordes menores/relativos (Am - F - C - G), un
  // clásico "loop infinito" que no cansa — cada acorde trae su nota de
  // bajo y 3 notas para el arpegio.
  const MUSIC_CHORDS = [
    { bass: 110.0, notes: [220.0, 261.63, 329.63] }, // Am
    { bass: 87.31, notes: [174.61, 220.0, 261.63] }, // F
    { bass: 65.41, notes: [130.81, 164.81, 196.0] }, // C
    { bass: 98.0, notes: [196.0, 246.94, 293.66] }, // G
  ];

  function ensureMusicNodes() {
    const c = ensureCtx();
    if (!musicGain) {
      musicFilter = c.createBiquadFilter();
      musicFilter.type = "lowpass";
      musicFilter.frequency.value = 2200;
      musicGain = c.createGain();
      musicGain.gain.value = musicMuted ? 0 : 0.16;
      musicFilter.connect(musicGain).connect(master);
    }
  }

  function playMusicTone(freq, t0, dur, gain, type = "triangle") {
    const c = ensureCtx();
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(musicFilter);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function scheduleMusicStep() {
    const c = ensureCtx();
    // El tempo (92-128 BPM) y el brillo del filtro suben con
    // musicIntensity (0 a 1) — así se "siente" más urgente sin cambiar
    // de canción, justo cuando la partida se pone más difícil.
    const bpm = 92 + musicIntensity * 36;
    musicFilter.frequency.setTargetAtTime(2000 + musicIntensity * 2400, c.currentTime, 0.5);
    const eighth = 60 / bpm / 2;
    while (musicNextNoteTime < c.currentTime + 0.15) {
      const chord = MUSIC_CHORDS[musicBarIndex % MUSIC_CHORDS.length];
      if (musicStep === 0 || musicStep === 4) {
        playMusicTone(chord.bass, musicNextNoteTime, eighth * 1.8, 0.22, "sine");
      }
      const arpNote = chord.notes[[0, 1, 2, 1][musicStep % 4]];
      playMusicTone(arpNote, musicNextNoteTime, eighth * 0.9, 0.13, "triangle");
      // Con más intensidad se suma un "eco" agudo cada 2 pasos — le da
      // más textura sin subirle el volumen general.
      if (musicIntensity > 0.55 && (musicStep === 2 || musicStep === 6)) {
        playMusicTone(arpNote * 2, musicNextNoteTime, eighth * 0.7, 0.06, "sine");
      }
      musicNextNoteTime += eighth;
      musicStep = (musicStep + 1) % 8;
      if (musicStep === 0) musicBarIndex = (musicBarIndex + 1) % MUSIC_CHORDS.length;
    }
  }

  function startMusic() {
    if (!unlocked || musicPlaying) return;
    ensureMusicNodes();
    musicPlaying = true;
    musicStep = 0;
    musicBarIndex = 0;
    musicNextNoteTime = ensureCtx().currentTime + 0.1;
    musicTimerId = setInterval(scheduleMusicStep, 40);
  }

  function stopMusic() {
    musicPlaying = false;
    if (musicTimerId) {
      clearInterval(musicTimerId);
      musicTimerId = null;
    }
  }

  function setMusicIntensity(t) {
    musicIntensity = Math.max(0, Math.min(1, t));
  }

  function isMusicMuted() {
    return musicMuted;
  }

  function setMusicMuted(muted) {
    musicMuted = muted;
    try {
      localStorage.setItem(MUSIC_MUTE_KEY, muted ? "1" : "0");
    } catch {}
    if (musicGain) {
      musicGain.gain.setTargetAtTime(muted ? 0 : 0.16, ensureCtx().currentTime, 0.05);
    }
  }

  return {
    unlock,
    uiClick,
    coinPay,
    shoot,
    hitImpact,
    death,
    rareSpawnAlert,
    legendarySpawnAlert,
    missLife,
    playerHit,
    waveUp,
    gameOver,
    victory,
    startMusic,
    stopMusic,
    setMusicIntensity,
    isMusicMuted,
    setMusicMuted,
  };
})();

window.R3Audio = R3Audio;
