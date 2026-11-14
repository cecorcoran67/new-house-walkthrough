// Every sound is synthesised with Web Audio, so there are no audio files to download:
// a breeze, leaves, insects and birdsong outdoors, and an engine, tyres and wind in the cars.

const GEARS = [5, 9.5, 15, 22]; // road speed (m/s) at which each gear runs out of revs
const ENGINES = {
  Tahoe: { cyl: 8, idle: 650, span: 2300, burble: 0.9, buzz: 0 },
  BJ30: { cyl: 4, idle: 850, span: 2900, burble: 0.3, buzz: 0.5 },
};
const rand = (a, b) => a + Math.random() * (b - a);

function gain(ctx, value, to) {
  const g = ctx.createGain();
  g.gain.value = value;
  g.connect(to);
  return g;
}
function filter(ctx, type, freq, q, to) {
  const f = ctx.createBiquadFilter();
  Object.assign(f, { type });
  f.frequency.value = freq;
  f.Q.value = q;
  f.connect(to);
  return f;
}
function osc(ctx, type, freq, to) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  o.connect(to);
  o.start();
  return o;
}

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.car = null;
    this.gear = 0;
    this.rpm = 0;
    this.nextGust = 0;
    this.nextBird = 0;
  }

  /** Browsers only let sound start from a tap, click or key press, so this is called from those. */
  unlock() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!this.ctx && AC) this.build(new AC());
    if (this.ctx && this.ctx.state !== 'running' && !document.hidden) this.ctx.resume();
  }

  setMuted(on) {
    this.muted = on;
    this.master?.gain.setTargetAtTime(on ? 0 : 1, this.ctx.currentTime, 0.05);
  }

  /** Silence a tab that is in the background. */
  pause(on) {
    if (!this.ctx) return;
    if (on) this.ctx.suspend();
    else this.ctx.resume();
  }

  build(ctx) {
    this.ctx = ctx;
    // iPhones otherwise silence Web Audio whenever the ringer switch is off
    if (navigator.audioSession) navigator.audioSession.type = 'playback';
    const limiter = ctx.createDynamicsCompressor();
    limiter.connect(ctx.destination);
    this.master = gain(ctx, this.muted ? 0 : 1, limiter);

    const hiss = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const data = hiss.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.hiss = hiss;
    const noise = (to) => {
      const s = ctx.createBufferSource();
      s.buffer = hiss;
      s.loop = true;
      s.connect(to);
      s.start(0, Math.random() * 3);
      return s;
    };

    // ---- Nature: faded in outdoors, muffled behind the car's glass
    this.nature = gain(ctx, 0, this.master);
    this.muffle = filter(ctx, 'lowpass', 18000, 0.5, this.nature);
    this.breeze = gain(ctx, 0.15, this.muffle);
    noise(filter(ctx, 'lowpass', 420, 0.5, this.breeze));
    this.leaves = gain(ctx, 0.05, this.muffle);
    noise(filter(ctx, 'bandpass', 3200, 0.5, this.leaves));
    // Insects: two narrow bands of hiss, each pulsing at its own rate
    for (const [pitch, rate, level] of [[5600, 41, 0.3], [7300, 67, 0.16]]) {
      const pulse = gain(ctx, 0.5, gain(ctx, level, this.muffle));
      osc(ctx, 'sine', rate, gain(ctx, 0.5, pulse.gain));
      noise(filter(ctx, 'bandpass', pitch, 14, pulse));
    }
    this.birds = gain(ctx, 0.13, this.muffle);

    // ---- Car: engine (two sawtooths and a buzz through a throttle-opened filter), tyres, wind
    this.motor = gain(ctx, 0, this.master);
    this.engine = gain(ctx, 0.2, this.motor);
    this.tone = filter(ctx, 'lowpass', 350, 2, this.engine);
    const grit = ctx.createWaveShaper();
    grit.curve = Float32Array.from({ length: 257 }, (_, i) => Math.tanh((i / 128 - 1) * 2));
    grit.connect(this.tone);
    const mix = gain(ctx, 0.5, grit);
    this.fire = osc(ctx, 'sawtooth', 40, mix); // one pulse per cylinder firing
    this.burble = gain(ctx, 0, mix);
    this.half = osc(ctx, 'sawtooth', 20, this.burble); // uneven half-speed lope
    this.buzz = gain(ctx, 0, mix);
    this.twice = osc(ctx, 'square', 80, this.buzz);
    this.breath = gain(ctx, 0, this.engine); // intake and exhaust rush
    this.breathTone = filter(ctx, 'bandpass', 300, 1.2, this.breath);
    noise(this.breathTone);
    this.tyres = gain(ctx, 0, this.motor);
    this.tyreTone = filter(ctx, 'bandpass', 800, 0.7, this.tyres);
    noise(this.tyreTone);
    this.rush = gain(ctx, 0, this.motor);
    noise(filter(ctx, 'highpass', 1800, 0.5, this.rush));
  }

  /** Call once a frame. `outside` is whether the listener is outdoors; `garage` says what is being driven. */
  update(dt, outside, garage) {
    const { ctx } = this;
    if (!ctx) return;
    const t = ctx.currentTime;
    const set = (param, value, lag = 0.06) => param.setTargetAtTime(value, t, lag);
    const car = garage.car;
    const cabin = car && !garage.chase;

    set(this.nature.gain, !outside ? 0 : cabin ? 0.4 : car ? 0.7 : 1, 0.35);
    set(this.muffle.frequency, cabin ? 1400 : 18000, 0.2);
    if (t > this.nextGust) {
      const gust = Math.random();
      this.breeze.gain.setTargetAtTime(0.08 + gust * 0.24, t, 1.5);
      this.leaves.gain.setTargetAtTime(0.03 + gust * gust * 0.14, t, 1.2);
      this.nextGust = t + rand(2.5, 6.5);
    }
    if (outside && t > this.nextBird) {
      this.bird(t + 0.05);
      this.nextBird = t + 0.4 + Math.random() ** 2 * 5;
    }

    if (car !== this.car) {
      // Door shuts; the engine catches with a flare of revs, or dies away
      this.thump(0.5);
      this.car = car;
      this.gear = 0;
      if (car) this.rpm = ENGINES[car.name].idle + 900;
    }
    set(this.motor.gain, car ? 0.55 : 0, 0.12);
    if (!car) return;

    const e = ENGINES[car.name];
    const v = Math.abs(car.speed);
    if (this.gear < GEARS.length - 1 && v > GEARS[this.gear] * 0.9) this.gear++;
    else if (this.gear > 0 && v < GEARS[this.gear - 1] * 0.55) this.gear--;
    const target = e.idle + e.span * Math.min(1, v / GEARS[this.gear]) + car.load * 250;
    this.rpm += (target - this.rpm) * Math.min(1, dt * 7);
    const rev = (this.rpm - e.idle) / e.span;
    const f = (this.rpm / 60) * (e.cyl / 2); // firing frequency

    set(this.fire.frequency, f, 0.03);
    set(this.half.frequency, f * 0.502, 0.03);
    set(this.twice.frequency, f * 2, 0.03);
    set(this.burble.gain, e.burble);
    set(this.buzz.gain, e.buzz);
    set(this.tone.frequency, 450 + rev * 600 + car.load * 700);
    set(this.engine.gain, 0.16 + rev * 0.1 + car.load * 0.16);
    set(this.breathTone.frequency, f * 3);
    set(this.breath.gain, 0.15 + car.load * 0.6);

    const pace = Math.min(1, v / 20);
    set(this.tyres.gain, pace ** 1.5 * (car.paved ? 0.45 : 0.8));
    set(this.tyreTone.frequency, car.paved ? 800 : 300, 0.2); // grass is a lower, rougher rumble
    set(this.rush.gain, pace * pace * 0.12);

    if (car.bump > 1) this.thump(Math.min(1, car.bump / 6));
    car.bump = 0;
  }

  /** A dull knock: a car door, or the bumper meeting a wall. */
  thump(strength) {
    const { ctx } = this;
    const t = ctx.currentTime;
    const env = gain(ctx, strength * 0.7, this.master);
    env.gain.setValueAtTime(strength * 0.7, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.16);
    o.connect(env);
    const n = ctx.createBufferSource();
    n.buffer = this.hiss;
    n.connect(filter(ctx, 'lowpass', 600, 0.5, gain(ctx, 0.6, env)));
    for (const src of [o, n]) {
      src.start(t);
      src.stop(t + 0.22);
    }
    o.onended = () => env.disconnect();
  }

  /** One bird call: a string of short gliding notes, somewhere off to one side. */
  bird(t) {
    const { ctx } = this;
    const notes = []; // [from Hz, to Hz, length s, gap s]
    const kind = Math.random();
    let level = 0.15 + Math.random() ** 2 * 0.85; // most are far off
    if (kind < 0.4) {
      // A few quick chirps
      const f = rand(2800, 5200);
      const bend = Math.random() < 0.5 ? 0.85 : 1.25;
      for (let i = 2 + Math.floor(Math.random() * 5); i > 0; i--) notes.push([f * bend, f * rand(0.95, 1.05), rand(0.05, 0.1), rand(0.04, 0.12)]);
    } else if (kind < 0.6) {
      // A falling trill
      const f = rand(3800, 6000);
      const n = 8 + Math.floor(Math.random() * 10);
      for (let i = 0; i < n; i++) notes.push([f * (1 - i * 0.008), f * (1 - i * 0.008) * 1.12, 0.03, 0.022]);
    } else if (kind < 0.85) {
      // A whistled phrase, like the yigüirro (clay-coloured thrush)
      const f = rand(1900, 3000);
      for (let i = 2 + Math.floor(Math.random() * 4); i > 0; i--) notes.push([f * rand(0.8, 1.25), f * rand(0.8, 1.25), rand(0.14, 0.3), rand(0.05, 0.15)]);
    } else {
      // A dove cooing
      const f = rand(430, 560);
      notes.push([f, f * 1.04, 0.22, 0.1], [f * 1.08, f, 0.5, 0.12], [f * 0.97, f * 0.93, 0.3, 0]);
      level *= 1.6;
    }

    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
    if (pan.pan) pan.pan.value = rand(-0.9, 0.9);
    pan.connect(this.birds);
    const env = gain(ctx, 0.0001, pan);
    const o = ctx.createOscillator();
    o.connect(env);
    let at = t;
    for (const [from, to, len, gap] of notes) {
      o.frequency.setValueAtTime(from, at);
      o.frequency.exponentialRampToValueAtTime(to, at + len);
      env.gain.setValueAtTime(0.0001, at);
      env.gain.exponentialRampToValueAtTime(level, at + Math.min(0.06, len * 0.25));
      env.gain.exponentialRampToValueAtTime(0.0001, at + len);
      at += len + gap;
    }
    o.start(t);
    o.stop(at + 0.05);
    o.onended = () => pan.disconnect();
  }
}
