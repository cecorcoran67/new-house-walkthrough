import natureUrl from './audio/nature.mp3';
import roadUrl from './audio/road.mp3';
import v8IdleUrl from './audio/v8-idle.mp3';
import v8RevsUrl from './audio/v8-revs.mp3';
import i4IdleUrl from './audio/i4-idle.mp3';
import i4RevsUrl from './audio/i4-revs.mp3';
import doorUrl from './audio/door.mp3';
import thudUrl from './audio/thud.mp3';

// Real recordings, all public domain (CC0) from freesound.org, trimmed and levelled:
//   nature  "Tropical Birds" by dubminister (#214676), from a balcony in Jacó, Costa Rica
//   road    "Car interior driving 02" by Daphne_in_Wonderland (#383476)
//   v8Idle  "F150-Startup-idle" by Therancher01 (#610773), a Ford 4.6 V8
//   v8Revs  "med" by cr4sht3st (#157144), a GM LS6 V8 held near 2900 rpm
//   i4Idle  "Peugeot 308 Idle Interior Loop" by Nox_Sound (#522223)
//   i4Revs  "412_midhigh" by Mihacappy (#872218), a four-cylinder held near 3200 rpm
//   door    "Peugeot 106 Door Close" by Nox_Sound (#465611)
//   thud    "Thud1" by nebulasnails (#405539)
// [file, seconds in one seamless cycle]. A loop file runs a little past its cycle at both ends,
// so playback can wrap anywhere without a click whatever padding the MP3 decoder adds.
const SOUNDS = {
  nature: [natureUrl, 60],
  road: [roadUrl, 20],
  v8Idle: [v8IdleUrl, 6.0285],
  v8Revs: [v8RevsUrl, 4.1244],
  i4Idle: [i4IdleUrl, 5.934],
  i4Revs: [i4RevsUrl, 2.9441],
  door: [doorUrl],
  thud: [thudUrl],
};
const LEAD = 0.15; // where in the file a loop's cycle is taken to start

// Each engine is two recordings, one idling and one revving, played faster or slower to follow
// the revs and crossfaded between. The rpm figures are what the recordings were made at.
const ENGINES = {
  v8: { idle: 'v8Idle', revs: 'v8Revs', idleRpm: 675, revsRpm: 2870, span: 2250 },
  i4: { idle: 'i4Idle', revs: 'i4Revs', idleRpm: 750, revsRpm: 3220, span: 2500 },
};
const GEARS = [5, 9.5, 15, 22]; // road speed (m/s) at which each gear runs out of revs
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function gain(ctx, value, to) {
  const g = ctx.createGain();
  g.gain.value = value;
  g.connect(to);
  return g;
}
function lowpass(ctx, to) {
  const f = ctx.createBiquadFilter();
  f.frequency.value = 18000; // wide open until something muffles it
  f.Q.value = 0.5;
  f.connect(to);
  return f;
}

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.car = null;
    this.craft = null;
    this.gear = 0;
    this.rpm = 0;
    // Downloading can start straight away; decoding has to wait for the audio context.
    this.files = Object.fromEntries(Object.entries(SOUNDS).map(([name, [url]]) => [name, fetch(url).then((r) => r.arrayBuffer())]));
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

    this.nature = gain(ctx, 0, this.master); // faded in outdoors
    this.muffle = lowpass(ctx, this.nature); // closed down behind the car's glass
    this.motor = gain(ctx, 0, this.master); // everything the car makes
    this.road = gain(ctx, 0, this.motor);
    this.cabin = lowpass(ctx, this.motor); // the engine as heard from the driver's seat
    this.engine = gain(ctx, 0.5, this.cabin);
    this.buildRotor(ctx);

    // Every loop plays all the time; these gains decide which are heard.
    const into = { nature: this.muffle, road: this.road };
    this.level = {};
    this.source = {};
    this.shots = {};
    for (const name in SOUNDS) if (SOUNDS[name][1]) this.level[name] = gain(ctx, into[name] ? 1 : 0, into[name] ?? this.engine);
    this.ready = Promise.all(
      Object.entries(SOUNDS).map(async ([name, [, cycle]]) => {
        const buffer = await ctx.decodeAudioData(await this.files[name]);
        if (!cycle) return void (this.shots[name] = buffer);
        const src = ctx.createBufferSource();
        Object.assign(src, { buffer, loop: true, loopStart: LEAD, loopEnd: LEAD + cycle });
        src.connect(this.level[name]);
        src.start(0, LEAD);
        this.source[name] = src;
      }),
    ).catch(() => {}); // a recording that fails to load just stays silent
  }

  /** Rotor wash is synthesized so the helicopter does not need its own recording. */
  buildRotor(ctx) {
    const n = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, n, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 90;
    bp.Q.value = 0.7;
    this.rotorGain = gain(ctx, 0, this.master);
    src.connect(bp);
    bp.connect(this.rotorGain);
    src.start();
    this.rotorFilter = bp;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 24;
    this.thumpGain = gain(ctx, 0, this.rotorGain);
    osc.connect(this.thumpGain);
    osc.start();
    this.rotorOsc = osc;
  }

  /** Call once a frame. `outside` is whether the listener is outdoors; `garage` / `heli` say what is being flown. */
  update(dt, outside, garage, heli) {
    const { ctx } = this;
    if (!ctx) return;
    const t = ctx.currentTime;
    const set = (param, value, lag = 0.06) => param.setTargetAtTime(value, t, lag);
    const rate = (name, value) => this.source[name] && set(this.source[name].playbackRate, value, 0.03);
    const craft = heli?.craft;
    const car = craft ? null : garage.car;
    const cabin = (car && !garage.chase) || (craft && !heli.chase);

    set(this.nature.gain, !outside ? 0 : cabin ? 0.3 : car ? 0.55 : 0.8, 0.35);
    set(this.muffle.frequency, cabin ? 1400 : 18000, 0.2);

    if (car !== this.car || craft !== this.craft) {
      this.play('door', 0.6);
      this.car = car;
      this.craft = craft;
      this.gear = 0;
      if (car) this.rpm = ENGINES[car.spec.engine].idleRpm + 500;
    }
    if (this.rotorGain) {
      const rpm = craft ? craft.rotor : 0;
      set(this.rotorGain.gain, rpm > 0.04 ? 0.08 + rpm * 0.45 : 0, 0.1);
      if (this.thumpGain) set(this.thumpGain.gain, rpm * 0.22, 0.1);
      if (this.rotorOsc) set(this.rotorOsc.frequency, 18 + rpm * 16, 0.08);
      if (this.rotorFilter) set(this.rotorFilter.frequency, 70 + rpm * 50, 0.1);
    }
    set(this.motor.gain, car ? 0.6 : 0, 0.12);
    if (!car) return;

    const e = ENGINES[car.spec.engine];
    const v = Math.abs(car.speed);
    if (this.gear < GEARS.length - 1 && v > GEARS[this.gear] * 0.9) this.gear++;
    else if (this.gear > 0 && v < GEARS[this.gear - 1] * 0.55) this.gear--;
    const target = e.idleRpm + e.span * Math.min(1, v / GEARS[this.gear]) + car.load * 200;
    this.rpm += (target - this.rpm) * Math.min(1, dt * 7);

    // From the idling recording to the revving one over the first few hundred rpm above idle
    const blend = clamp((this.rpm - e.idleRpm * 1.15) / e.idleRpm, 0, 1) * (Math.PI / 2);
    for (const other of Object.values(ENGINES)) {
      set(this.level[other.idle].gain, other === e ? Math.cos(blend) : 0);
      set(this.level[other.revs].gain, other === e ? Math.sin(blend) : 0);
    }
    rate(e.idle, clamp(this.rpm / e.idleRpm, 0.8, 2.2));
    rate(e.revs, clamp(this.rpm / e.revsRpm, 0.4, 1.3));
    set(this.engine.gain, 0.5 + car.load * 0.5); // louder when it is pulling
    set(this.cabin.frequency, cabin ? 1600 : 18000, 0.2);

    const pace = Math.min(1, v / 20);
    set(this.road.gain, pace ** 1.3 * (car.paved ? 0.9 : 1.1));
    rate('road', (0.75 + pace * 0.5) * (car.paved ? 1 : 0.8)); // grass is a lower rumble

    if (car.bump > 1) this.play('thud', Math.min(1, car.bump / 6) * 0.8);
    car.bump = 0;
  }

  /** Play a one-off recording: the car door, or the bumper meeting a wall. */
  play(name, level) {
    const buffer = this.shots[name];
    if (!buffer) return;
    const src = this.ctx.createBufferSource();
    const out = gain(this.ctx, level, this.master);
    src.buffer = buffer;
    src.connect(out);
    src.onended = () => out.disconnect();
    src.start();
  }
}
