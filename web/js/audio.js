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

  function hitImpact(tier = "common") {
    if (!unlocked) return;
    const freqBase = { common: 300, uncommon: 260, rare: 220, epic: 180, legendary: 140 }[tier] || 300;
    tone({ freq: freqBase, type: "square", dur: 0.08, decay: 0.09, gain: 0.22, glideTo: freqBase * 0.6 });
    noiseHit({ dur: 0.08, gain: 0.25, filterFreq: 1800 });
  }

  function death(tier = "common") {
    if (!unlocked) return;
    const table = {
      common: { freq: 380, glide: 90, dur: 0.22, gain: 0.3, extra: 0 },
      uncommon: { freq: 420, glide: 80, dur: 0.28, gain: 0.32, extra: 1 },
      rare: { freq: 480, glide: 70, dur: 0.36, gain: 0.36, extra: 2 },
      epic: { freq: 560, glide: 60, dur: 0.5, gain: 0.4, extra: 3 },
      legendary: { freq: 660, glide: 40, dur: 0.9, gain: 0.5, extra: 5 },
    };
    const cfg = table[tier] || table.common;
    tone({ freq: cfg.freq, type: "sawtooth", dur: cfg.dur, decay: cfg.dur, gain: cfg.gain, glideTo: cfg.glide });
    noiseHit({ dur: cfg.dur, gain: cfg.gain * 0.6, filterFreq: 900 });
    for (let i = 0; i < cfg.extra; i++) {
      tone({
        freq: cfg.freq * (1 + i * 0.5),
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
  function legendarySpawnAlert() {
    if (!unlocked) return;
    noiseHit({ dur: 0.5, gain: 0.5, filterFreq: 90 });
    tone({ freq: 110, type: "sawtooth", dur: 0.5, decay: 0.55, gain: 0.4, glideTo: 55 });
    [330, 415, 494, 659, 880].forEach((f, i) =>
      tone({ freq: f, type: "sawtooth", dur: 0.22, decay: 0.24, gain: 0.3, delay: 0.05 + i * 0.09 })
    );
    tone({ freq: 1320, type: "sine", dur: 0.9, decay: 1.0, gain: 0.28, delay: 0.5 });
    tone({ freq: 1980, type: "sine", dur: 0.9, decay: 1.0, gain: 0.18, delay: 0.52 });
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

  return { unlock, uiClick, coinPay, shoot, hitImpact, death, rareSpawnAlert, legendarySpawnAlert, missLife, playerHit, waveUp, gameOver };
})();

window.R3Audio = R3Audio;
