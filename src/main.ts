import * as THREE from "three";
import "./style.css";

type Tile = 0 | 1;

type Enemy = {
  id: number;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  spawnX: number;
  spawnY: number;
  patrolRadius: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  alerted: boolean;
  patrolDir: number;
};

type Player = {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  stamina: number;
  maxStamina: number;
};

type Room = {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
};

type BoxDecor = {
  x: number;
  y: number;
  h: number;
  variant: number;
};

type ColumnDecor = {
  x: number;
  y: number;
  h: number;
  r: number;
  variant: number;
};

type EnemyHitEvent = {
  enemyId: number;
  x: number;
  y: number;
};

type PlayerHitEvent = {
  enemyId: number;
  x: number;
  y: number;
  damage: number;
};

type WeaponKind = "sword" | "wand";

const MAP_W = 45;
const MAP_H = 45;
const ROOM_ATTEMPTS = 95;
const ROOM_MIN = 5;
const ROOM_MAX = 11;
const ENEMY_COUNT = 7;
const TICK_MS = 360;
const MOVE_SPEED = 2.8;
const SPRINT_MULTIPLIER = 1.65;
const MOUSE_SENSITIVITY = 0.0014;
const MAX_MOUSE_DELTA_PER_EVENT = 30;
const KEYBOARD_TURN_SPEED = 1.9;
const STAMINA_DRAIN_PER_SEC = 28;
const STAMINA_REGEN_PER_SEC = 18;
const BOB_BASE_STEP_HZ = 1.7;
const BOB_SPEED_STEP_HZ = 1.1;
const BOB_MAX_SIDE = 0.0045;
const BOB_MAX_UP = 0.008;
const BOB_SMOOTH_IN = 10.5;
const BOB_SMOOTH_OUT = 7.5;
const SPRINT_WEAPON_WOBBLE_X = 2.05;
const SPRINT_WEAPON_WOBBLE_Y = 2.1;
const SPRINT_WEAPON_WOBBLE_ROT = 1.75;
const ENEMY_SIGHT_RANGE = 9;
const PLAYER_DAMAGE: [number, number] = [8, 14];
const WAND_DAMAGE: [number, number] = [6, 11];
const ENEMY_DAMAGE: [number, number] = [5, 10];
const HIDE_ENEMIES = false;
const SWORD_ATTACK_DURATIONS: [number, number, number] = [0.18, 0.2, 0.24];
const WAND_ATTACK_DURATIONS: [number, number, number] = [0.19, 0.21, 0.25];
const ENEMY_LUNGE_DURATION = 0.22;
const DAMAGE_SHAKE_DURATION = 0.2;
const ENEMY_MOVE_SMOOTH = 8.5;
const ENEMY_HIT_RECOIL_DURATION = 0.18;
const PLAYER_HIT_SHAKE_DURATION = 0.12;
const DEATH_RELOAD_SECONDS = 6;
const DECOR_CLUSTER_COUNT = 26;
const COLUMN_CLUSTER_COUNT = 14;
const PORTRAIT_HIT_DURATION = 0.52;
const PORTRAIT_NORMAL_SRC = "/character.png";
const PORTRAIT_ANGRY_SRC = "/character angry.png";

const DIRS = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function hash2(x: number, y: number): number {
  let h = x * 374761393 + y * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  return (h ^ (h >> 16)) >>> 0;
}

function createWallTexture(kind: number, size = 64): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D context is unavailable for wall texture");

  const palettes = [
    { base: "#17131b", p: "#9c6747", s: "#b98563", n: "#5f402b" },
    { base: "#18131f", p: "#7f5aa2", s: "#9a74c4", n: "#4b3560" },
    { base: "#1b140f", p: "#ad7249", s: "#cb9060", n: "#684427" },
    { base: "#171422", p: "#8c6bc0", s: "#a888d8", n: "#503a70" },
    { base: "#1c1511", p: "#936040", s: "#b47b54", n: "#5f4025" },
    { base: "#161224", p: "#7355a8", s: "#9173c7", n: "#44315f" },
  ];
  const pal = palettes[Math.abs(kind) % palettes.length];
  const base = pal.base;
  const linePrimary = pal.p;
  const lineSecondary = pal.s;
  const noiseColor = pal.n;

  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  const putNoise = (count: number): void => {
    for (let i = 0; i < count; i += 1) {
      ctx.fillStyle = noiseColor;
      const x = randInt(0, size - 1);
      const y = randInt(0, size - 1);
      const s = 1;
      ctx.fillRect(x, y, s, s);
    }
  };

  if (kind % 6 === 0) {
    ctx.strokeStyle = lineSecondary;
    ctx.lineWidth = 2;
    for (let y = 8; y < size; y += 16) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y);
      ctx.stroke();
    }
    for (let y = 0; y < size; y += 16) {
      const shift = ((y / 16) % 2) * 8;
      for (let x = shift; x < size; x += 16) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + 8);
        ctx.stroke();
      }
    }
    putNoise(36);
  } else if (kind % 6 === 1) {
    ctx.strokeStyle = linePrimary;
    ctx.lineWidth = 1;
    for (let x = 0; x < size; x += 6) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, size);
      ctx.stroke();
    }
    putNoise(48);
  } else if (kind % 6 === 2) {
    ctx.strokeStyle = lineSecondary;
    ctx.lineWidth = 1;
    for (let y = 0; y < size; y += 8) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y);
      ctx.stroke();
    }
    putNoise(56);
  } else if (kind % 6 === 3) {
    ctx.strokeStyle = linePrimary;
    ctx.lineWidth = 1;
    for (let x = 0; x < size; x += 10) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, size);
      ctx.stroke();
    }
    for (let y = 6; y < size; y += 14) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y);
      ctx.stroke();
    }
    putNoise(44);
  } else if (kind % 6 === 4) {
    ctx.strokeStyle = lineSecondary;
    ctx.lineWidth = 1;
    for (let y = 0; y < size; y += 12) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y);
      ctx.stroke();
    }
    for (let x = 0; x < size; x += 12) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, size);
      ctx.stroke();
    }
    putNoise(30);
  } else {
    putNoise(62);
    ctx.strokeStyle = linePrimary;
    ctx.lineWidth = 1;
    for (let i = 0; i < 8; i += 1) {
      const isVertical = i % 2 === 0;
      const x0 = randInt(0, size - 1);
      const y0 = randInt(0, size - 1);
      const span = randInt(8, 18);
      const x1 = isVertical ? x0 : clamp(x0 + randInt(-span, span), 0, size - 1);
      const y1 = isVertical ? clamp(y0 + randInt(-span, span), 0, size - 1) : y0;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestMipmapNearestFilter;
  texture.needsUpdate = true;
  return texture;
}

function createGroundTexture(kind: "grass" | "earth" | "stone" | "sand", size = 96): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D context is unavailable for ground texture");

  const palettes: Record<"grass" | "earth" | "stone" | "sand", string[]> = {
    grass: ["#1b2330", "#24313f", "#2d3a48", "#374658", "#2f4d33", "#44664c"],
    earth: ["#2b1e1a", "#3a2923", "#483128", "#56392d", "#5f4133", "#6a4a3a"],
    stone: ["#25293a", "#30364a", "#3b435b", "#474f6b", "#545d7b", "#606a88"],
    sand: ["#312621", "#403028", "#4e3a2f", "#5b4435", "#6a513f", "#78604c"],
  };
  const p = palettes[kind];
  ctx.fillStyle = p[0];
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 2200; i += 1) {
    ctx.fillStyle = p[randInt(1, p.length - 1)];
    const x = randInt(0, size - 1);
    const y = randInt(0, size - 1);
    ctx.fillRect(x, y, 1, 1);
  }
  for (let i = 0; i < 180; i += 1) {
    ctx.fillStyle = p[randInt(2, p.length - 1)];
    const x = randInt(0, size - 2);
    const y = randInt(0, size - 2);
    ctx.fillRect(x, y, 2, 1);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestMipmapNearestFilter;
  texture.needsUpdate = true;
  return texture;
}

function createSkyGradientTexture(size = 512): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D context is unavailable for sky texture");

  const g = ctx.createLinearGradient(0, 0, 0, size);
  g.addColorStop(0, "#0b0a1c");
  g.addColorStop(0.3, "#171436");
  g.addColorStop(0.62, "#2b1f52");
  g.addColorStop(1, "#120f28");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  const glowA = ctx.createRadialGradient(size * 0.18, size * 0.22, 10, size * 0.18, size * 0.22, size * 0.45);
  glowA.addColorStop(0, "rgba(130,95,220,0.34)");
  glowA.addColorStop(1, "rgba(130,95,220,0)");
  ctx.fillStyle = glowA;
  ctx.fillRect(0, 0, size, size);

  const glowB = ctx.createRadialGradient(size * 0.78, size * 0.3, 10, size * 0.78, size * 0.3, size * 0.42);
  glowB.addColorStop(0, "rgba(200,120,180,0.26)");
  glowB.addColorStop(1, "rgba(200,120,180,0)");
  ctx.fillStyle = glowB;
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 2600; i += 1) {
    const y = randInt(0, Math.floor(size * 0.86));
    const alpha = 0.02 + Math.random() * 0.08;
    const c = i % 3 === 0 ? "180,150,245" : i % 3 === 1 ? "130,190,255" : "250,170,220";
    ctx.fillStyle = `rgba(${c},${alpha.toFixed(3)})`;
    const w = randInt(1, 2);
    const h = randInt(1, 2);
    ctx.fillRect(randInt(0, size - w), y, w, h);
  }

  for (let i = 0; i < 28; i += 1) {
    const x = randInt(0, size - 1);
    const y = randInt(Math.floor(size * 0.08), Math.floor(size * 0.74));
    const len = randInt(28, 78);
    const ang = (-20 + randInt(0, 40)) * (Math.PI / 180);
    ctx.strokeStyle = `rgba(190,170,255,${(0.05 + Math.random() * 0.08).toFixed(3)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function tileKey(x: number, y: number): string {
  return `${x},${y}`;
}

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = randInt(0, i);
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
}

function bresenhamLine(x0: number, y0: number, x1: number, y1: number): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  let x = x0;
  let y = y0;

  while (true) {
    points.push({ x, y });
    if (x === x1 && y === y1) break;
    const e2 = err * 2;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }

  return points;
}

function carveRoom(grid: Tile[][], room: Room): void {
  for (let y = room.y; y < room.y + room.h; y += 1) {
    for (let x = room.x; x < room.x + room.w; x += 1) {
      grid[y][x] = 0;
    }
  }
}

function overlaps(a: Room, b: Room): boolean {
  return !(
    a.x + a.w + 2 <= b.x ||
    b.x + b.w + 2 <= a.x ||
    a.y + a.h + 2 <= b.y ||
    b.y + b.h + 2 <= a.y
  );
}

function carveCorridor(grid: Tile[][], x1: number, y1: number, x2: number, y2: number): void {
  let x = x1;
  let y = y1;

  while (x !== x2) {
    grid[y][x] = 0;
    x += x < x2 ? 1 : -1;
  }

  while (y !== y2) {
    grid[y][x] = 0;
    y += y < y2 ? 1 : -1;
  }

  grid[y][x] = 0;
}

function buildDungeon(): { map: Tile[][]; rooms: Room[]; roomIdMap: number[][] } {
  const map: Tile[][] = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(1 as Tile));
  const roomIdMap: number[][] = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(-1));
  const rooms: Room[] = [];

  for (let i = 0; i < ROOM_ATTEMPTS; i += 1) {
    const w = randInt(ROOM_MIN, ROOM_MAX);
    const h = randInt(ROOM_MIN, ROOM_MAX);
    const x = randInt(1, MAP_W - w - 2);
    const y = randInt(1, MAP_H - h - 2);
    const room: Room = {
      id: rooms.length,
      x,
      y,
      w,
      h,
      cx: Math.floor(x + w / 2),
      cy: Math.floor(y + h / 2),
    };

    if (rooms.some((r) => overlaps(r, room))) continue;

    carveRoom(map, room);
    for (let yy = room.y; yy < room.y + room.h; yy += 1) {
      for (let xx = room.x; xx < room.x + room.w; xx += 1) {
        roomIdMap[yy][xx] = room.id;
      }
    }
    rooms.push(room);
  }

  rooms.sort((a, b) => a.cx - b.cx);

  for (let i = 1; i < rooms.length; i += 1) {
    const prev = rooms[i - 1];
    const current = rooms[i];

    if (Math.random() < 0.5) {
      carveCorridor(map, prev.cx, prev.cy, current.cx, prev.cy);
      carveCorridor(map, current.cx, prev.cy, current.cx, current.cy);
    } else {
      carveCorridor(map, prev.cx, prev.cy, prev.cx, current.cy);
      carveCorridor(map, prev.cx, current.cy, current.cx, current.cy);
    }
  }

  for (let i = 0; i < Math.floor(rooms.length * 0.35); i += 1) {
    const a = rooms[randInt(0, rooms.length - 1)];
    const b = rooms[randInt(0, rooms.length - 1)];
    if (a !== b) {
      carveCorridor(map, a.cx, a.cy, b.cx, b.cy);
    }
  }

  for (let i = 0; i < Math.max(8, Math.floor(rooms.length * 0.5)); i += 1) {
    const room = rooms[randInt(0, rooms.length - 1)];
    carveWindingPath(map, room.cx, room.cy, randInt(18, 46));
  }

  erodeWalls(map, 2);

  return { map, rooms, roomIdMap };
}

function carveWindingPath(grid: Tile[][], x0: number, y0: number, steps: number): void {
  let x = x0;
  let y = y0;
  for (let i = 0; i < steps; i += 1) {
    if (x > 1 && y > 1 && x < MAP_W - 2 && y < MAP_H - 2) {
      grid[y][x] = 0;
      if (Math.random() < 0.25) {
        for (const d of DIRS) {
          if (Math.random() < 0.4) {
            const nx = x + d.x;
            const ny = y + d.y;
            if (nx > 1 && ny > 1 && nx < MAP_W - 2 && ny < MAP_H - 2) grid[ny][nx] = 0;
          }
        }
      }
    }
    const d = DIRS[randInt(0, 3)];
    x = clamp(x + d.x, 1, MAP_W - 2);
    y = clamp(y + d.y, 1, MAP_H - 2);
  }
}

function erodeWalls(grid: Tile[][], passes: number): void {
  for (let pass = 0; pass < passes; pass += 1) {
    const toCarve: Array<{ x: number; y: number }> = [];
    for (let y = 2; y < MAP_H - 2; y += 1) {
      for (let x = 2; x < MAP_W - 2; x += 1) {
        if (grid[y][x] !== 1) continue;
        let openNeighbors = 0;
        for (const d of DIRS) {
          if (grid[y + d.y][x + d.x] === 0) openNeighbors += 1;
        }
        if (openNeighbors >= 3 && Math.random() < 0.18) toCarve.push({ x, y });
      }
    }
    for (const p of toCarve) grid[p.y][p.x] = 0;
  }
}

function randomNoRepeat(count: number, previous: number): number {
  if (count <= 1) return 0;
  let pick = randInt(0, count - 1);
  while (pick === previous) {
    pick = randInt(0, count - 1);
  }
  return pick;
}

class RetroHorrorSynth {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private started = false;
  private musicStep = 0;
  private nextMusicAt = 0;
  private nextAmbientAt = 0;

  ensureStarted(): void {
    if (this.started) {
      void this.ctx?.resume();
      return;
    }
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    this.ctx = new AudioCtx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.95;
    this.master.connect(this.ctx.destination);
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = 1.4;
    this.sfxBus.connect(this.master);
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = 0.34;
    this.musicBus.connect(this.master);
    this.startMusic();
    this.started = true;
  }

  private startMusic(): void {
    if (!this.ctx || !this.musicBus) return;
    const now = this.ctx.currentTime;
    const pad = this.ctx.createOscillator();
    pad.type = "triangle";
    pad.frequency.value = 46;
    const padGain = this.ctx.createGain();
    padGain.gain.value = 0.0;
    padGain.gain.linearRampToValueAtTime(0.1, now + 2.5);
    const padFilter = this.ctx.createBiquadFilter();
    padFilter.type = "lowpass";
    padFilter.frequency.value = 430;
    pad.connect(padFilter);
    padFilter.connect(padGain);
    padGain.connect(this.musicBus);
    pad.start();

    const lfo = this.ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.11;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 68;
    lfo.connect(lfoGain);
    lfoGain.connect(padFilter.frequency);
    lfo.start();

    this.nextMusicAt = now + 0.12;
    this.nextAmbientAt = now + 1.8;
    const tick = (): void => {
      if (!this.ctx || !this.musicBus) return;
      const t = this.ctx.currentTime;
      while (this.nextMusicAt < t + 0.32) {
        this.scheduleMusicNote(this.nextMusicAt, this.musicStep);
        this.musicStep = (this.musicStep + 1) % 16;
        this.nextMusicAt += this.musicStep % 4 === 0 ? 0.32 : 0.26;
      }
      while (this.nextAmbientAt < t + 0.25) {
        this.scheduleAmbientEvent(this.nextAmbientAt);
        this.nextAmbientAt += 3.8 + Math.random() * 3.4;
      }
      window.setTimeout(tick, 90);
    };
    tick();
  }

  private scheduleMusicNote(at: number, step: number): void {
    if (!this.ctx || !this.musicBus) return;
    const base = [73.4, 82.4, 98, 110, 123.5, 146.8, 164.8, 196];
    const seq = [0, 2, 3, 5, 4, 3, 2, 1, 0, 3, 6, 5, 4, 2, 1, 0];
    const trans = step % 16 >= 8 ? 2 : 0;
    const f = base[(seq[step % seq.length] + trans) % base.length];

    const osc = this.ctx.createOscillator();
    osc.type = step % 4 === 0 ? "square" : "triangle";
    osc.frequency.setValueAtTime(f, at);
    const amp = this.ctx.createGain();
    amp.gain.setValueAtTime(0.0001, at);
    amp.gain.exponentialRampToValueAtTime(0.085, at + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, at + 0.24);
    const filt = this.ctx.createBiquadFilter();
    filt.type = "bandpass";
    filt.frequency.value = 280 + (step % 6) * 58;
    filt.Q.value = 1.8;
    osc.connect(filt);
    filt.connect(amp);
    amp.connect(this.musicBus);
    osc.start(at);
    osc.stop(at + 0.26);

    if (step % 8 === 0) {
      const sub = this.ctx.createOscillator();
      sub.type = "sine";
      sub.frequency.setValueAtTime(f * 0.5, at);
      const subAmp = this.ctx.createGain();
      subAmp.gain.setValueAtTime(0.0001, at);
      subAmp.gain.exponentialRampToValueAtTime(0.07, at + 0.008);
      subAmp.gain.exponentialRampToValueAtTime(0.0001, at + 0.18);
      sub.connect(subAmp);
      subAmp.connect(this.musicBus);
      sub.start(at);
      sub.stop(at + 0.19);
    }

    if (step % 4 === 2) {
      const harmony = this.ctx.createOscillator();
      harmony.type = "sine";
      harmony.frequency.setValueAtTime(f * 1.5, at + 0.01);
      const hAmp = this.ctx.createGain();
      hAmp.gain.setValueAtTime(0.0001, at + 0.01);
      hAmp.gain.exponentialRampToValueAtTime(0.03, at + 0.03);
      hAmp.gain.exponentialRampToValueAtTime(0.0001, at + 0.18);
      harmony.connect(hAmp);
      hAmp.connect(this.musicBus);
      harmony.start(at + 0.01);
      harmony.stop(at + 0.2);
    }
  }

  private scheduleAmbientEvent(at: number): void {
    if (!this.ctx || !this.musicBus) return;
    const rumble = this.ctx.createOscillator();
    rumble.type = "triangle";
    rumble.frequency.setValueAtTime(42 + Math.random() * 18, at);
    rumble.frequency.exponentialRampToValueAtTime(32 + Math.random() * 12, at + 1.2);
    const rg = this.ctx.createGain();
    rg.gain.setValueAtTime(0.0001, at);
    rg.gain.exponentialRampToValueAtTime(0.04, at + 0.2);
    rg.gain.exponentialRampToValueAtTime(0.0001, at + 1.25);
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 180;
    rumble.connect(lp);
    lp.connect(rg);
    rg.connect(this.musicBus);
    rumble.start(at);
    rumble.stop(at + 1.28);

    this.noiseBurst(0.22, 0.02, 600, 1700, true);
  }

  private pulse(
    freq: number,
    type: OscillatorType,
    duration: number,
    gain: number,
    sweep = 0,
    toMusic = false,
  ): void {
    if (!this.ctx || !this.master) return;
    const out = toMusic ? this.musicBus : this.sfxBus;
    if (!out) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const amp = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = Math.max(90, freq * 1.45);
    filter.Q.value = 1.5;
    amp.gain.setValueAtTime(0.0001, now);
    amp.gain.exponentialRampToValueAtTime(gain, now + 0.008);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (sweep !== 0) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + sweep), now + duration);
    }
    osc.connect(filter);
    filter.connect(amp);
    amp.connect(out);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  private noiseBurst(duration: number, gain: number, hp = 800, lp = 3200, toMusic = false): void {
    if (!this.ctx || !this.master) return;
    const out = toMusic ? this.musicBus : this.sfxBus;
    if (!out) return;
    const now = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * 0.8;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const high = this.ctx.createBiquadFilter();
    high.type = "highpass";
    high.frequency.value = hp;
    const low = this.ctx.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = lp;
    const amp = this.ctx.createGain();
    amp.gain.setValueAtTime(0.0001, now);
    amp.gain.exponentialRampToValueAtTime(gain, now + 0.006);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    src.connect(high);
    high.connect(low);
    low.connect(amp);
    amp.connect(out);
    src.start(now);
  }

  playFootstep(speed: number): void {
    this.ensureStarted();
    const tone = 58 + speed * 26 + randInt(-3, 3);
    this.pulse(tone, "square", 0.09, 0.18, -10);
    this.noiseBurst(0.06, 0.08, 300, 1400);
  }

  playWeaponSwing(weapon: WeaponKind): void {
    this.ensureStarted();
    if (weapon === "sword") {
      this.pulse(142 + randInt(-16, 18), "sawtooth", 0.14, 0.24, 140);
      this.noiseBurst(0.08, 0.11, 900, 3000);
    } else {
      this.pulse(240 + randInt(-20, 20), "triangle", 0.16, 0.22, -80);
      this.pulse(330 + randInt(-18, 18), "sine", 0.1, 0.14, -120);
    }
  }

  playWeaponImpact(weapon: WeaponKind): void {
    this.ensureStarted();
    this.pulse(weapon === "sword" ? 84 : 132, "square", 0.16, 0.28, -35);
    this.noiseBurst(0.09, 0.14, 320, 1800);
  }

  playWeaponMiss(weapon: WeaponKind): void {
    this.ensureStarted();
    this.pulse(weapon === "sword" ? 130 : 230, "triangle", 0.1, 0.14, -55);
  }

  playEnemyHitPlayer(side: number, front: number): void {
    this.ensureStarted();
    const tone = 60 + Math.abs(side) * 16 + Math.max(0, front) * 11;
    this.pulse(tone, "sawtooth", 0.2, 0.34, -40);
    this.noiseBurst(0.13, 0.18, 280, 1600);
  }

  playEnemyDeath(): void {
    this.ensureStarted();
    this.pulse(92, "triangle", 0.24, 0.24, -60);
    this.pulse(68, "sine", 0.3, 0.18, -40);
    this.noiseBurst(0.14, 0.12, 260, 1200);
  }

  playWeaponSwitch(): void {
    this.ensureStarted();
    this.pulse(250, "square", 0.07, 0.16, 60);
    this.pulse(340, "triangle", 0.09, 0.15, -40);
  }
}

function randomWalkableInRoom(map: Tile[][], room: Room): { x: number; y: number } {
  for (let i = 0; i < 120; i += 1) {
    const x = randInt(room.x + 1, room.x + room.w - 2);
    const y = randInt(room.y + 1, room.y + room.h - 2);
    if (map[y][x] === 0) return { x, y };
  }
  return { x: room.cx, y: room.cy };
}

class InputManager {
  private pressed = new Set<string>();
  private attackQueued = false;
  private weaponSwitchQueued: WeaponKind | "toggle" | null = null;
  private lookListener: ((deltaX: number) => void) | null = null;

  constructor() {
    window.addEventListener("keydown", (ev) => {
      this.pressed.add(ev.code);
      if (ev.repeat) return;
      if (ev.code === "KeyQ") {
        this.weaponSwitchQueued = "toggle";
      } else if (ev.code === "Digit1") {
        this.weaponSwitchQueued = "sword";
      } else if (ev.code === "Digit2") {
        this.weaponSwitchQueued = "wand";
      }
    });

    window.addEventListener("keyup", (ev) => {
      this.pressed.delete(ev.code);
    });

    window.addEventListener("mousedown", (ev) => {
      if (ev.button === 0) {
        this.attackQueued = true;
      }
    });

    window.addEventListener("mousemove", (ev) => {
      if (document.pointerLockElement) {
        const dx = ev.movementX;
        if (dx !== 0 && this.lookListener) {
          this.lookListener(dx);
        }
      }
    });

    window.addEventListener("blur", () => {
      this.pressed.clear();
      this.attackQueued = false;
      this.weaponSwitchQueued = null;
    });
  }

  setLookListener(listener: (deltaX: number) => void): void {
    this.lookListener = listener;
  }

  bindPointerLockTarget(target: HTMLElement): void {
    target.addEventListener("click", async () => {
      if (document.pointerLockElement !== target) {
        try {
          const promise = target.requestPointerLock({ unadjustedMovement: true });
          if (promise && typeof (promise as Promise<void>).catch === "function") {
            await (promise as Promise<void>).catch((error: unknown) => {
              if (
                error &&
                typeof error === "object" &&
                "name" in error &&
                (error as { name?: string }).name === "NotSupportedError"
              ) {
                target.requestPointerLock();
                return;
              }
              throw error;
            });
          }
        } catch {
          target.requestPointerLock();
        }
      }
    });
  }

  consumeAttack(): boolean {
    const queued = this.attackQueued;
    this.attackQueued = false;
    return queued;
  }

  consumeWeaponSwitch(): WeaponKind | "toggle" | null {
    const queued = this.weaponSwitchQueued;
    this.weaponSwitchQueued = null;
    return queued;
  }

  getMoveIntent(): {
    forward: boolean;
    back: boolean;
    left: boolean;
    right: boolean;
    turnLeft: boolean;
    turnRight: boolean;
    sprint: boolean;
  } {
    return {
      forward: this.pressed.has("KeyW") || this.pressed.has("ArrowUp"),
      back: this.pressed.has("KeyS") || this.pressed.has("ArrowDown"),
      left: this.pressed.has("KeyA"),
      right: this.pressed.has("KeyD"),
      turnLeft: this.pressed.has("ArrowLeft"),
      turnRight: this.pressed.has("ArrowRight"),
      sprint: this.pressed.has("ShiftLeft") || this.pressed.has("ShiftRight"),
    };
  }
}

class DungeonSimulation {
  map: Tile[][];
  roomIdMap: number[][];
  rooms: Room[];
  explored: boolean[][];
  player: Player;
  enemies: Enemy[];
  boxes: BoxDecor[] = [];
  columns: ColumnDecor[] = [];
  status = "Exploring";
  gameOver = false;
  private pendingHitIndicators: EnemyHitEvent[] = [];
  private pendingPlayerHitEvents: PlayerHitEvent[] = [];
  private blockedTiles = new Set<string>();

  constructor() {
    const { map, rooms, roomIdMap } = buildDungeon();
    this.map = map;
    this.roomIdMap = roomIdMap;
    this.rooms = rooms;
    this.explored = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(false));

    const startRoom = rooms[0] ?? { id: 0, x: 2, y: 2, w: 5, h: 5, cx: 4, cy: 4 };
    const startPos = randomWalkableInRoom(map, startRoom);

    this.player = {
      x: startPos.x,
      y: startPos.y,
      hp: 100,
      maxHp: 100,
      stamina: 100,
      maxStamina: 100,
    };
    this.generateDecorObstacles();
    this.revealAroundPlayer();

    this.enemies = [];
    for (let i = 0; i < ENEMY_COUNT; i += 1) {
      const room = rooms[randInt(Math.min(1, rooms.length - 1), rooms.length - 1)] ?? startRoom;
      let pos = randomWalkableInRoom(map, room);
      let guard = 0;
      while (this.isBlocked(Math.floor(pos.x), Math.floor(pos.y)) && guard < 120) {
        pos = randomWalkableInRoom(map, room);
        guard += 1;
      }
      this.enemies.push({
        id: i + 1,
        x: pos.x,
        y: pos.y,
        prevX: pos.x,
        prevY: pos.y,
        spawnX: pos.x,
        spawnY: pos.y,
        patrolRadius: randInt(3, 5),
        hp: 34,
        maxHp: 34,
        alive: true,
        alerted: false,
        patrolDir: randInt(0, 3),
      });
    }
  }

  private generateDecorObstacles(): void {
    const playerTx = Math.floor(this.player.x);
    const playerTy = Math.floor(this.player.y);

    const canPlace = (x: number, y: number): boolean => {
      if (x <= 1 || y <= 1 || x >= MAP_W - 2 || y >= MAP_H - 2) return false;
      if (this.map[y][x] !== 0) return false;
      if (Math.hypot(x - playerTx, y - playerTy) < 4.2) return false;
      if (this.blockedTiles.has(tileKey(x, y))) return false;
      return true;
    };

    const markBlocked = (x: number, y: number): void => {
      this.blockedTiles.add(tileKey(x, y));
    };

    for (let c = 0; c < DECOR_CLUSTER_COUNT; c += 1) {
      const room = this.rooms[randInt(0, this.rooms.length - 1)];
      if (!room) continue;
      const cx = randInt(room.x + 1, room.x + room.w - 2);
      const cy = randInt(room.y + 1, room.y + room.h - 2);
      const count = Math.random() < 0.45 ? 1 : randInt(3, 9);
      for (let i = 0; i < count; i += 1) {
        const x = clamp(cx + randInt(-2, 2), room.x + 1, room.x + room.w - 2);
        const y = clamp(cy + randInt(-2, 2), room.y + 1, room.y + room.h - 2);
        if (!canPlace(x, y)) continue;
        markBlocked(x, y);
        this.boxes.push({
          x,
          y,
          h: 0.24 + (hash2(x, y) % 52) / 100,
          variant: hash2(x * 3, y * 5) % 4,
        });
      }
    }

    for (let c = 0; c < COLUMN_CLUSTER_COUNT; c += 1) {
      const room = this.rooms[randInt(0, this.rooms.length - 1)];
      if (!room || room.w < 7 || room.h < 7) continue;
      const cx = randInt(room.x + 2, room.x + room.w - 3);
      const cy = randInt(room.y + 2, room.y + room.h - 3);
      const count = Math.random() < 0.55 ? 1 : randInt(2, 4);
      for (let i = 0; i < count; i += 1) {
        const x = clamp(cx + randInt(-3, 3), room.x + 1, room.x + room.w - 2);
        const y = clamp(cy + randInt(-3, 3), room.y + 1, room.y + room.h - 2);
        if (!canPlace(x, y)) continue;
        markBlocked(x, y);
        this.columns.push({
          x,
          y,
          h: 1.18 + (hash2(x * 9, y * 11) % 45) / 100,
          r: 0.14 + (hash2(x * 7, y * 13) % 7) / 100,
          variant: hash2(x * 17, y * 19) % 3,
        });
      }
    }
  }

  step(): void {
    if (this.gameOver || HIDE_ENEMIES) return;

    this.enemyPhase();

    if (this.player.hp <= 0) {
      this.player.hp = 0;
      this.gameOver = true;
      this.status = "You died. Refresh to try again.";
      return;
    }

    if (this.enemies.every((enemy) => !enemy.alive)) {
      this.status = "Victory! All goblins are defeated.";
      this.gameOver = true;
    }
  }

  movePlayer(dx: number, dy: number): boolean {
    const radius = 0.21;
    let moved = false;

    const canOccupy = (px: number, py: number): boolean => {
      const samples = [
        { x: px - radius, y: py - radius },
        { x: px + radius, y: py - radius },
        { x: px - radius, y: py + radius },
        { x: px + radius, y: py + radius },
      ];
      return samples.every((p) => {
        const tx = Math.floor(p.x + 0.5);
        const ty = Math.floor(p.y + 0.5);
        if (!this.isWalkable(tx, ty)) return false;
        if (this.isBlocked(tx, ty)) return false;
        if (this.enemyAt(tx, ty)) return false;
        return true;
      });
    };

    const nextX = this.player.x + dx;
    if (canOccupy(nextX, this.player.y)) {
      this.player.x = nextX;
      moved = true;
    }

    const nextY = this.player.y + dy;
    if (canOccupy(this.player.x, nextY)) {
      this.player.y = nextY;
      moved = true;
    }

    if (moved) {
      this.revealAroundPlayer();
      this.status = "Exploring";
    }

    return moved;
  }

  private enemyPhase(): void {
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;

      if (this.canSeePlayer(enemy)) {
        enemy.alerted = true;
      }

      const dx = this.player.x - enemy.x;
      const dy = this.player.y - enemy.y;
      const manhattan = Math.abs(Math.round(dx)) + Math.abs(Math.round(dy));

      if (manhattan === 1) {
        const damage = randInt(ENEMY_DAMAGE[0], ENEMY_DAMAGE[1]);
        this.player.hp = Math.max(0, this.player.hp - damage);
        this.status = `Goblin hit you for ${damage}`;
        this.pendingHitIndicators.push({ enemyId: enemy.id, x: enemy.x + 0.5, y: enemy.y + 0.5 });
        continue;
      }

      const next = enemy.alerted ? this.findChaseStep(enemy) : this.findPatrolStep(enemy);
      if (next) {
        enemy.prevX = enemy.x;
        enemy.prevY = enemy.y;
        enemy.x = next.x;
        enemy.y = next.y;
      }
    }
  }

  private findPatrolStep(enemy: Enemy): { x: number; y: number } | null {
    const preferred = [enemy.patrolDir];
    const dirs = [0, 1, 2, 3].filter((d) => d !== enemy.patrolDir);
    shuffleInPlace(dirs);
    preferred.push(...dirs);

    let fallback: { x: number; y: number; dir: number } | null = null;
    for (const dirIdx of preferred) {
      const dir = DIRS[dirIdx];
      const pos = { x: enemy.x + dir.x, y: enemy.y + dir.y };
      if (!this.canEnemyOccupy(enemy, pos.x, pos.y, enemy.patrolRadius)) continue;
      if (pos.x === enemy.prevX && pos.y === enemy.prevY) {
        if (!fallback) fallback = { ...pos, dir: dirIdx };
        continue;
      }
      enemy.patrolDir = dirIdx;
      return pos;
    }

    if (fallback) {
      enemy.patrolDir = fallback.dir;
      return { x: fallback.x, y: fallback.y };
    }

    return null;
  }

  private findChaseStep(enemy: Enemy): { x: number; y: number } | null {
    const leash = enemy.patrolRadius + 2;
    const options = DIRS.map((dir) => ({ x: enemy.x + dir.x, y: enemy.y + dir.y }));
    const home = { x: enemy.spawnX, y: enemy.spawnY };
    const playerDistFromHome = Math.hypot(this.player.x - home.x, this.player.y - home.y);
    const anchor = playerDistFromHome <= leash ? this.player : home;
    options.sort((a, b) => {
      const aBacktrack = a.x === enemy.prevX && a.y === enemy.prevY ? 0.45 : 0;
      const bBacktrack = b.x === enemy.prevX && b.y === enemy.prevY ? 0.45 : 0;
      const aDist = Math.abs(anchor.x - a.x) + Math.abs(anchor.y - a.y) + aBacktrack;
      const bDist = Math.abs(anchor.x - b.x) + Math.abs(anchor.y - b.y) + bBacktrack;
      return aDist - bDist;
    });

    for (const pos of options) {
      if (!this.canEnemyOccupy(enemy, pos.x, pos.y, leash)) continue;
      return pos;
    }

    return null;
  }

  playerMeleeAttack(viewAngle: number, weapon: WeaponKind): boolean {
    if (this.gameOver) return false;

    const px = this.player.x + 0.5;
    const py = this.player.y + 0.5;
    const forwardX = -Math.sin(viewAngle);
    const forwardY = -Math.cos(viewAngle);
    const maxRange = weapon === "wand" ? 2.45 : 1.95;
    const maxConeAngle = weapon === "wand" ? Math.PI * 0.23 : Math.PI * 0.28;

    let best: Enemy | null = null;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      const ex = enemy.x + 0.5;
      const ey = enemy.y + 0.5;
      const dx = ex - px;
      const dy = ey - py;
      const dist = Math.hypot(dx, dy);
      if (dist > maxRange || dist < 0.001) continue;

      const dirX = dx / dist;
      const dirY = dy / dist;
      const dot = clamp(forwardX * dirX + forwardY * dirY, -1, 1);
      const angle = Math.acos(dot);
      if (angle > maxConeAngle) continue;

      const line = bresenhamLine(Math.floor(px), Math.floor(py), enemy.x, enemy.y);
      let blocked = false;
      for (let i = 1; i < line.length - 1; i += 1) {
        const p = line[i];
        if (this.map[p.y]?.[p.x] === 1) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;

      const score = angle * 2 + dist;
      if (score < bestScore) {
        best = enemy;
        bestScore = score;
      }
    }

    if (!best) {
      this.status = weapon === "wand" ? "Wand strike missed" : "Sword slash missed";
      return false;
    }

    const damage =
      weapon === "wand"
        ? randInt(WAND_DAMAGE[0], WAND_DAMAGE[1])
        : randInt(PLAYER_DAMAGE[0], PLAYER_DAMAGE[1]);
    best.hp -= damage;
    best.alerted = true;
    this.pendingPlayerHitEvents.push({ enemyId: best.id, x: best.x + 0.5, y: best.y + 0.5, damage });
    if (best.hp <= 0) {
      best.hp = 0;
      best.alive = false;
      this.status = weapon === "wand" ? `You blasted a goblin (${damage})` : `You killed a goblin (${damage})`;
    } else {
      this.status = weapon === "wand" ? `Wand hit goblin for ${damage}` : `You hit goblin for ${damage}`;
    }
    return true;
  }

  private canSeePlayer(enemy: Enemy): boolean {
    const px = Math.floor(this.player.x + 0.5);
    const py = Math.floor(this.player.y + 0.5);
    const dx = px - enemy.x;
    const dy = py - enemy.y;
    const distance = Math.hypot(dx, dy);
    if (distance > ENEMY_SIGHT_RANGE) return false;

    const line = bresenhamLine(enemy.x, enemy.y, px, py);
    for (let i = 1; i < line.length - 1; i += 1) {
      if (this.map[line[i].y]?.[line[i].x] === 1) return false;
    }
    return true;
  }

  private isWalkable(x: number, y: number): boolean {
    return this.map[y]?.[x] === 0;
  }

  private isBlocked(x: number, y: number): boolean {
    return this.blockedTiles.has(tileKey(x, y));
  }

  private enemyAt(x: number, y: number, excludeId?: number): Enemy | undefined {
    return this.enemies.find((enemy) => enemy.alive && enemy.id !== excludeId && enemy.x === x && enemy.y === y);
  }

  private canEnemyOccupy(enemy: Enemy, x: number, y: number, leashRadius: number): boolean {
    if (!this.isWalkable(x, y)) return false;
    if (this.isBlocked(x, y)) return false;
    if (this.enemyAt(x, y, enemy.id)) return false;
    const px = Math.floor(this.player.x + 0.5);
    const py = Math.floor(this.player.y + 0.5);
    if (x === px && y === py) return false;
    const distFromSpawn = Math.hypot(x - enemy.spawnX, y - enemy.spawnY);
    if (distFromSpawn > leashRadius) return false;
    return true;
  }

  consumeHitIndicators(): EnemyHitEvent[] {
    const hits = this.pendingHitIndicators.slice();
    this.pendingHitIndicators.length = 0;
    return hits;
  }

  consumePlayerHitEvents(): PlayerHitEvent[] {
    const hits = this.pendingPlayerHitEvents.slice();
    this.pendingPlayerHitEvents.length = 0;
    return hits;
  }

  private revealAroundPlayer(): void {
    const px = Math.floor(this.player.x + 0.5);
    const py = Math.floor(this.player.y + 0.5);
    const radius = 7;

    for (let y = py - radius; y <= py + radius; y += 1) {
      for (let x = px - radius; x <= px + radius; x += 1) {
        if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) continue;
        const dist = Math.hypot(px - x, py - y);
        if (dist > radius) continue;

        const line = bresenhamLine(px, py, x, y);
        let blocked = false;
        for (let i = 1; i < line.length; i += 1) {
          const p = line[i];
          if (this.map[p.y]?.[p.x] === 1) {
            if (i !== line.length - 1) blocked = true;
            break;
          }
        }

        if (!blocked) {
          this.explored[y][x] = true;
        }
      }
    }
  }
}

class Game3DApp {
  private sim: DungeonSimulation;
  private input: InputManager;
  private synth = new RetroHorrorSynth();
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private playerLight: THREE.PointLight;
  private overheadLight: THREE.DirectionalLight;
  private enemySprites = new Map<number, THREE.Sprite>();
  private hud = {
    hpBar: document.createElement("div"),
    hpText: document.createElement("div"),
    staminaBar: document.createElement("div"),
    staminaText: document.createElement("div"),
    status: document.createElement("div"),
    minimap: document.createElement("canvas"),
    combatFx: document.createElement("div"),
    weaponSprite: document.createElement("img"),
    hitTop: document.createElement("div"),
    hitRight: document.createElement("div"),
    hitBottom: document.createElement("div"),
    hitLeft: document.createElement("div"),
    portrait: document.createElement("img"),
    weaponSlot1: document.createElement("div"),
    weaponSlot2: document.createElement("div"),
    deathOverlay: document.createElement("div"),
    deathCountdown: document.createElement("div"),
  };
  private tickAccumulator = 0;
  private prevTs = performance.now();
  private viewAngle = 0;
  private walkBobPhase = 0;
  private bobIntensity = 0;
  private bobSide = 0;
  private bobUp = 0;
  private attackCooldown = 0;
  private activeWeapon: WeaponKind = "sword";
  private attackWeapon: WeaponKind = "sword";
  private weaponSwayX = 0;
  private weaponSwayY = 0;
  private weaponSwayRot = 0;
  private weaponSwingTimer = 0;
  private weaponSwingDuration = SWORD_ATTACK_DURATIONS[0];
  private attackPattern = 0;
  private lastSwordPattern = -1;
  private lastWandPattern = -1;
  private weaponIdlePhase = 0;
  private weaponSwapTimer = 0;
  private weaponSwapPending: WeaponKind | null = null;
  private weaponSwapSwitched = false;
  private handWeapon: WeaponKind = "sword";
  private enemyRenderPos = new Map<number, { x: number; z: number }>();
  private enemyLungeTimers = new Map<number, number>();
  private enemyHitRecoilTimers = new Map<number, number>();
  private damageShakeTimer = 0;
  private damageShakePower = 0;
  private damageShakeSide = 0;
  private damageShakeFront = 0;
  private playerHitShakeTimer = 0;
  private portraitHitTimer = 0;
  private footstepCooldown = 0;
  private deathSequenceActive = false;
  private deathTimer = DEATH_RELOAD_SECONDS;
  private deathProgress = 0;

  constructor(sim: DungeonSimulation, input: InputManager) {
    this.sim = sim;
    this.input = input;

    const host = document.querySelector<HTMLDivElement>("#game-host");
    if (!host) throw new Error("#game-host not found");

    this.scene = new THREE.Scene();
    this.scene.background = createSkyGradientTexture(512);
    this.scene.fog = new THREE.FogExp2(0x181428, 0.0085);
    this.scene.add(new THREE.AmbientLight(0x8a79ab, 1.02));
    this.overheadLight = new THREE.DirectionalLight(0x8a7fc2, 0.95);
    this.overheadLight.position.set(MAP_W * 0.5, 22, MAP_H * 0.5);
    this.scene.add(this.overheadLight);
    this.playerLight = new THREE.PointLight(0xe5d9ff, 2.2, 13.5, 1.65);
    this.playerLight.position.set(this.sim.player.x + 0.5, 1.1, this.sim.player.y + 0.5);
    this.scene.add(this.playerLight);

    this.camera = new THREE.PerspectiveCamera(72, Math.max(1, host.clientWidth) / Math.max(1, host.clientHeight), 0.02, 120);
    this.camera.rotation.order = "YXZ";

    this.renderer = new THREE.WebGLRenderer({ antialias: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(Math.max(1, host.clientWidth), Math.max(1, host.clientHeight));
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    host.appendChild(this.renderer.domElement);

    const armAudio = (): void => {
      this.synth.ensureStarted();
    };
    window.addEventListener("pointerdown", armAudio, { passive: true });
    window.addEventListener("keydown", armAudio, { passive: true });

    this.input.bindPointerLockTarget(this.renderer.domElement);
    this.input.setLookListener((deltaX) => {
      const dx = clamp(deltaX, -MAX_MOUSE_DELTA_PER_EVENT, MAX_MOUSE_DELTA_PER_EVENT);
      this.viewAngle = THREE.MathUtils.euclideanModulo(this.viewAngle - dx * MOUSE_SENSITIVITY, Math.PI * 2);
    });

    const wallDefs = [
      { height: 1.08, tint: 0x5d4437, textureKind: 0, repeat: 2.0 },
      { height: 1.14, tint: 0x4f3b67, textureKind: 1, repeat: 2.6 },
      { height: 1.2, tint: 0x684c3d, textureKind: 2, repeat: 2.1 },
      { height: 1.26, tint: 0x5c4578, textureKind: 3, repeat: 2.4 },
      { height: 1.32, tint: 0x735542, textureKind: 4, repeat: 2.2 },
      { height: 1.38, tint: 0x695087, textureKind: 5, repeat: 2.7 },
      { height: 1.45, tint: 0x785a45, textureKind: 0, repeat: 3.0 },
      { height: 1.55, tint: 0x6a5188, textureKind: 2, repeat: 3.2 },
    ] as const;
    const wallVariants: Array<Array<{ x: number; z: number }>> = Array.from(
      { length: wallDefs.length },
      () => [],
    );
    const wallPilasters: Array<{ x: number; y: number; z: number; h: number }> = [];
    const wallLedges: Array<{ x: number; y: number; z: number; w: number; d: number; h: number }> = [];
    const roomMaterialPairs = this.sim.rooms.map((room) => {
      const primary = hash2(room.cx, room.cy) % wallDefs.length;
      const secondary = (primary + 1 + (hash2(room.cy, room.cx) % (wallDefs.length - 1))) % wallDefs.length;
      return { primary, secondary };
    });

    const roomFromWall = (x: number, y: number): number => {
      const direct = [
        { x: x - 1, y },
        { x: x + 1, y },
        { x, y: y - 1 },
        { x, y: y + 1 },
      ];
      for (const n of direct) {
        const id = this.sim.roomIdMap[n.y]?.[n.x] ?? -1;
        if (id >= 0) return id;
      }

      const diagonal = [
        { x: x - 1, y: y - 1 },
        { x: x + 1, y: y - 1 },
        { x: x - 1, y: y + 1 },
        { x: x + 1, y: y + 1 },
      ];
      for (const n of diagonal) {
        const id = this.sim.roomIdMap[n.y]?.[n.x] ?? -1;
        if (id >= 0) return id;
      }

      return -1;
    };

    for (let y = 0; y < MAP_H; y += 1) {
      for (let x = 0; x < MAP_W; x += 1) {
        if (this.sim.map[y][x] === 1) {
          const roomId = roomFromWall(x, y);
          let variant = hash2(x, y) % wallDefs.length;
          if (roomId >= 0 && roomId < roomMaterialPairs.length) {
            const pair = roomMaterialPairs[roomId];
            const useSecondary = (hash2(x * 17 + roomId, y * 31 + roomId) % 100) < 15;
            variant = useSecondary ? pair.secondary : pair.primary;
          }
          wallVariants[variant].push({ x: x + 0.5, z: y + 0.5 });

          const north = this.sim.map[y - 1]?.[x] === 1;
          const south = this.sim.map[y + 1]?.[x] === 1;
          const west = this.sim.map[y]?.[x - 1] === 1;
          const east = this.sim.map[y]?.[x + 1] === 1;
          const neighborCount = (north ? 1 : 0) + (south ? 1 : 0) + (west ? 1 : 0) + (east ? 1 : 0);
          if (neighborCount >= 2 && (hash2(x * 13, y * 17) % 100) < 23) {
            const h = wallDefs[variant].height * (1.04 + (hash2(x * 29, y * 31) % 18) / 100);
            wallPilasters.push({ x: x + 0.5, y: h * 0.5, z: y + 0.5, h });
          }
          if ((hash2(x * 37, y * 41) % 100) < 18) {
            const w = north || south ? 0.72 : 0.48;
            const d = north || south ? 0.48 : 0.72;
            const h = 0.08 + (hash2(x * 43, y * 47) % 5) / 100;
            wallLedges.push({ x: x + 0.5, y: wallDefs[variant].height - h * 0.5, z: y + 0.5, w, d, h });
          }
        }
      }
    }
    const matrix = new THREE.Matrix4();
    for (let v = 0; v < wallDefs.length; v += 1) {
      const def = wallDefs[v];
      const positions = wallVariants[v];
      if (positions.length === 0) continue;

      const texture = createWallTexture(def.textureKind);
      texture.repeat.set(def.repeat, def.repeat);
      const wallGeo = new THREE.BoxGeometry(1, def.height, 1);
      const solidMat = new THREE.MeshLambertMaterial({
        color: def.tint,
        map: texture,
      });
      const solidMesh = new THREE.InstancedMesh(wallGeo, solidMat, positions.length);

      for (let i = 0; i < positions.length; i += 1) {
        const p = positions[i];
        matrix.makeTranslation(p.x, def.height * 0.5, p.z);
        solidMesh.setMatrixAt(i, matrix);
      }

      this.scene.add(solidMesh);
    }

    if (wallPilasters.length > 0) {
      const pilasterGeo = new THREE.BoxGeometry(0.36, 1, 0.36);
      const pilasterMat = new THREE.MeshLambertMaterial({ color: 0x3f324f });
      const pilasterMesh = new THREE.InstancedMesh(pilasterGeo, pilasterMat, wallPilasters.length);
      for (let i = 0; i < wallPilasters.length; i += 1) {
        const p = wallPilasters[i];
        matrix.compose(
          new THREE.Vector3(p.x, p.y, p.z),
          new THREE.Quaternion(),
          new THREE.Vector3(1, p.h, 1),
        );
        pilasterMesh.setMatrixAt(i, matrix);
      }
      this.scene.add(pilasterMesh);
    }

    if (wallLedges.length > 0) {
      const ledgeGeo = new THREE.BoxGeometry(1, 1, 1);
      const ledgeMat = new THREE.MeshLambertMaterial({ color: 0x4f3d34 });
      const ledgeMesh = new THREE.InstancedMesh(ledgeGeo, ledgeMat, wallLedges.length);
      for (let i = 0; i < wallLedges.length; i += 1) {
        const l = wallLedges[i];
        matrix.compose(
          new THREE.Vector3(l.x, l.y, l.z),
          new THREE.Quaternion(),
          new THREE.Vector3(l.w, l.h, l.d),
        );
        ledgeMesh.setMatrixAt(i, matrix);
      }
      this.scene.add(ledgeMesh);
    }

    const groundTextures = {
      grass: createGroundTexture("grass", 96),
      earth: createGroundTexture("earth", 96),
      stone: createGroundTexture("stone", 96),
      sand: createGroundTexture("sand", 96),
    };
    groundTextures.grass.repeat.set(1, 1);
    groundTextures.earth.repeat.set(1, 1);
    groundTextures.stone.repeat.set(1, 1);
    groundTextures.sand.repeat.set(1, 1);
    const groundMats = {
      grass: new THREE.MeshLambertMaterial({ color: 0x3a4a5f, map: groundTextures.grass }),
      earth: new THREE.MeshLambertMaterial({ color: 0x5d4439, map: groundTextures.earth }),
      stone: new THREE.MeshLambertMaterial({ color: 0x4a5476, map: groundTextures.stone }),
      sand: new THREE.MeshLambertMaterial({ color: 0x645242, map: groundTextures.sand }),
    };
    const groundCells = {
      grass: [] as Array<{ x: number; z: number; y: number }>,
      earth: [] as Array<{ x: number; z: number; y: number }>,
      stone: [] as Array<{ x: number; z: number; y: number }>,
      sand: [] as Array<{ x: number; z: number; y: number }>,
    };
    const grassPatchPoints: Array<{ x: number; z: number; h: number; s: number }> = [];
    const stonePebbles: Array<{ x: number; z: number; s: number; h: number; r: number }> = [];

    for (let y = 0; y < MAP_H; y += 1) {
      for (let x = 0; x < MAP_W; x += 1) {
        if (this.sim.map[y][x] !== 0) continue;
        const roomId = this.sim.roomIdMap[y]?.[x] ?? -1;
        const noise = hash2(x * 23, y * 29) % 100;
        let kind: "grass" | "earth" | "stone" | "sand";
        if (roomId < 0) {
          kind = noise < 40 ? "stone" : noise < 72 ? "earth" : noise < 88 ? "sand" : "grass";
        } else {
          const seed = hash2(roomId * 31, roomId * 47) % 100;
          if (seed < 35) kind = noise < 72 ? "grass" : noise < 90 ? "earth" : "stone";
          else if (seed < 60) kind = noise < 70 ? "earth" : noise < 88 ? "sand" : "stone";
          else if (seed < 82) kind = noise < 68 ? "stone" : noise < 84 ? "earth" : "sand";
          else kind = noise < 66 ? "sand" : noise < 86 ? "earth" : "grass";
        }
        for (let sy = 0; sy < 2; sy += 1) {
          for (let sx = 0; sx < 2; sx += 1) {
            const subX = x + 0.25 + sx * 0.5;
            const subZ = y + 0.25 + sy * 0.5;
            const subNoise = hash2((x * 2 + sx) * 59, (y * 2 + sy) * 61) % 100;
            let subKind = kind;
            if (subNoise < 12) {
              if (kind === "grass") subKind = subNoise < 6 ? "earth" : "stone";
              else if (kind === "earth") subKind = subNoise < 6 ? "sand" : "grass";
              else if (kind === "stone") subKind = subNoise < 7 ? "earth" : "sand";
              else subKind = subNoise < 7 ? "earth" : "stone";
            }
            groundCells[subKind].push({
              x: subX,
              z: subZ,
              y: (hash2((x * 2 + sx) * 73, (y * 2 + sy) * 79) % 3) * 0.002,
            });
          }
        }

        if (kind === "grass" && (hash2(x * 61, y * 67) % 100) < 52) {
          const clump = 6 + (hash2(x * 5 + 3, y * 7 + 1) % 10);
          for (let i = 0; i < clump; i += 1) {
            grassPatchPoints.push({
              x: x + 0.5 + (randInt(-32, 32) / 160),
              z: y + 0.5 + (randInt(-32, 32) / 160),
              h: 0.1 + (hash2(x * 19 + i, y * 17 + i) % 12) / 100,
              s: 0.019 + (hash2(x * 43 + i, y * 37 + i) % 10) / 1000,
            });
          }
        }

        if (kind === "stone" && (hash2(x * 89, y * 97) % 100) < 56) {
          const pebCount = 2 + (hash2(x * 109, y * 113) % 6);
          for (let i = 0; i < pebCount; i += 1) {
            stonePebbles.push({
              x: x + 0.5 + randInt(-32, 32) / 190,
              z: y + 0.5 + randInt(-32, 32) / 190,
              s: 0.03 + (hash2(x * 131 + i, y * 137 + i) % 8) / 100,
              h: 0.02 + (hash2(x * 149 + i, y * 151 + i) % 5) / 100,
              r: (hash2(x * 163 + i, y * 167 + i) % 628) / 100,
            });
          }
        }
      }
    }

    const groundGeo = new THREE.BoxGeometry(0.5, 0.03, 0.5);
    for (const kind of ["grass", "earth", "stone", "sand"] as const) {
      const cells = groundCells[kind];
      if (cells.length === 0) continue;
      const mesh = new THREE.InstancedMesh(groundGeo, groundMats[kind], cells.length);
      for (let i = 0; i < cells.length; i += 1) {
        const p = cells[i];
        matrix.makeTranslation(p.x, 0.01 + p.y, p.z);
        mesh.setMatrixAt(i, matrix);
      }
      this.scene.add(mesh);
    }

    if (grassPatchPoints.length > 0) {
      const tuftGeo = new THREE.BoxGeometry(1, 1, 1);
      const tuftMat = new THREE.MeshLambertMaterial({ color: 0x2f3a2f });
      const tufts = new THREE.InstancedMesh(tuftGeo, tuftMat, grassPatchPoints.length);
      for (let i = 0; i < grassPatchPoints.length; i += 1) {
        const g = grassPatchPoints[i];
        matrix.compose(
          new THREE.Vector3(g.x, g.h * 0.5 + 0.02, g.z),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0, (hash2(i, i * 3) % 628) / 100, 0)),
          new THREE.Vector3(g.s, g.h, g.s),
        );
        tufts.setMatrixAt(i, matrix);
      }
      this.scene.add(tufts);
    }

    if (stonePebbles.length > 0) {
      const pebbleGeo = new THREE.SphereGeometry(1, 6, 5);
      const pebbleMat = new THREE.MeshLambertMaterial({ color: 0x7d7f90 });
      const pebbles = new THREE.InstancedMesh(pebbleGeo, pebbleMat, stonePebbles.length);
      for (let i = 0; i < stonePebbles.length; i += 1) {
        const p = stonePebbles[i];
        matrix.compose(
          new THREE.Vector3(p.x, 0.02 + p.h * 0.5, p.z),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0, p.r, 0)),
          new THREE.Vector3(p.s, p.h, p.s * 1.08),
        );
        pebbles.setMatrixAt(i, matrix);
      }
      this.scene.add(pebbles);
    }

    const boxGeo = new THREE.BoxGeometry(0.58, 0.58, 0.58);
    const boxMats = [
      new THREE.MeshLambertMaterial({ color: 0x3a2b2f }),
      new THREE.MeshLambertMaterial({ color: 0x463436 }),
      new THREE.MeshLambertMaterial({ color: 0x2f2532 }),
      new THREE.MeshLambertMaterial({ color: 0x4a3b30 }),
    ];
    for (const b of this.sim.boxes) {
      const mat = boxMats[b.variant % boxMats.length];
      const box = new THREE.Mesh(boxGeo, mat);
      box.scale.set(1, b.h, 1);
      box.position.set(b.x + 0.5, (0.58 * b.h) * 0.5, b.y + 0.5);
      this.scene.add(box);
    }

    const columnGeo = new THREE.CylinderGeometry(0.16, 0.18, 1, 10, 1, false);
    const columnMats = [
      new THREE.MeshLambertMaterial({ color: 0x4b3a4e }),
      new THREE.MeshLambertMaterial({ color: 0x5a473b }),
      new THREE.MeshLambertMaterial({ color: 0x51465f }),
    ];
    for (const c of this.sim.columns) {
      const mat = columnMats[c.variant % columnMats.length];
      const col = new THREE.Mesh(columnGeo, mat);
      col.scale.set(c.r / 0.16, c.h, c.r / 0.16);
      col.position.set(c.x + 0.5, c.h * 0.5, c.y + 0.5);
      this.scene.add(col);
      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(c.r * 1.35, c.r * 1.35, 0.08, 10),
        new THREE.MeshLambertMaterial({ color: 0x2a2430 }),
      );
      cap.position.set(c.x + 0.5, c.h + 0.04, c.y + 0.5);
      this.scene.add(cap);
    }

    if (!HIDE_ENEMIES) {
      const goblinTexture = new THREE.TextureLoader().load("/goblin.png");
      goblinTexture.magFilter = THREE.NearestFilter;
      goblinTexture.minFilter = THREE.NearestMipmapNearestFilter;

      for (const enemy of this.sim.enemies) {
        const material = new THREE.SpriteMaterial({
          map: goblinTexture,
          color: new THREE.Color(0x4f4f4f),
          transparent: true,
          alphaTest: 0.8,
          depthWrite: true,
          opacity: 1,
        });
        const sprite = new THREE.Sprite(material);
        sprite.center.set(0.5, 0);
        sprite.scale.set(0.9, 1.1, 1);
        sprite.position.set(enemy.x + 0.5, 0, enemy.y + 0.5);
        this.scene.add(sprite);
        this.enemySprites.set(enemy.id, sprite);
        this.enemyRenderPos.set(enemy.id, { x: enemy.x + 0.5, z: enemy.y + 0.5 });
      }
    }

    this.hud.hpBar = document.querySelector<HTMLDivElement>("#hp-bar") ?? this.hud.hpBar;
    this.hud.hpText = document.querySelector<HTMLDivElement>("#hp-text") ?? this.hud.hpText;
    this.hud.staminaBar = document.querySelector<HTMLDivElement>("#stamina-bar") ?? this.hud.staminaBar;
    this.hud.staminaText = document.querySelector<HTMLDivElement>("#stamina-text") ?? this.hud.staminaText;
    this.hud.status = document.querySelector<HTMLDivElement>("#status") ?? this.hud.status;
    this.hud.minimap = document.querySelector<HTMLCanvasElement>("#minimap") ?? this.hud.minimap;
    this.hud.combatFx = document.querySelector<HTMLDivElement>("#combat-fx") ?? this.hud.combatFx;
    this.hud.weaponSprite = document.querySelector<HTMLImageElement>("#weapon-sprite") ?? this.hud.weaponSprite;
    this.hud.hitTop = document.querySelector<HTMLDivElement>("#hit-top") ?? this.hud.hitTop;
    this.hud.hitRight = document.querySelector<HTMLDivElement>("#hit-right") ?? this.hud.hitRight;
    this.hud.hitBottom = document.querySelector<HTMLDivElement>("#hit-bottom") ?? this.hud.hitBottom;
    this.hud.hitLeft = document.querySelector<HTMLDivElement>("#hit-left") ?? this.hud.hitLeft;
    this.hud.portrait = document.querySelector<HTMLImageElement>("#portrait") ?? this.hud.portrait;
    this.hud.weaponSlot1 = document.querySelector<HTMLDivElement>("#weapon-slot-1") ?? this.hud.weaponSlot1;
    this.hud.weaponSlot2 = document.querySelector<HTMLDivElement>("#weapon-slot-2") ?? this.hud.weaponSlot2;
    this.hud.deathOverlay = document.querySelector<HTMLDivElement>("#death-overlay") ?? this.hud.deathOverlay;
    this.hud.deathCountdown = document.querySelector<HTMLDivElement>("#death-countdown") ?? this.hud.deathCountdown;
    this.hud.portrait.src = PORTRAIT_NORMAL_SRC;
    this.setActiveWeapon("sword");

    this.viewAngle = 0;

    window.addEventListener("resize", () => {
      const w = Math.max(1, host.clientWidth);
      const h = Math.max(1, host.clientHeight);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    });
  }

  start(): void {
    const frame = (ts: number): void => {
      const dtSec = Math.min(0.033, (ts - this.prevTs) / 1000);
      this.prevTs = ts;

      this.update(dtSec);
      this.render();
      requestAnimationFrame(frame);
    };

    requestAnimationFrame(frame);
  }

  private update(dtSec: number): void {
    this.handleWeaponSwitchInput();
    this.handleWeaponInput(dtSec);
    this.weaponSwapTimer = Math.max(0, this.weaponSwapTimer - dtSec);
    this.footstepCooldown = Math.max(0, this.footstepCooldown - dtSec);
    if (this.weaponSwapTimer <= 0 && this.weaponSwapSwitched) {
      this.weaponSwapPending = null;
      this.weaponSwapSwitched = false;
    }

    if (!this.sim.gameOver) {
      const intent = this.input.getMoveIntent();
      const keyboardTurnAxis = (intent.turnRight ? 1 : 0) - (intent.turnLeft ? 1 : 0);
      const totalTurn = keyboardTurnAxis * KEYBOARD_TURN_SPEED * dtSec;
      this.viewAngle = THREE.MathUtils.euclideanModulo(this.viewAngle - totalTurn, Math.PI * 2);
      const forwardX = -Math.sin(this.viewAngle);
      const forwardY = -Math.cos(this.viewAngle);
      const rightX = Math.cos(this.viewAngle);
      const rightY = -Math.sin(this.viewAngle);

      let moveX = 0;
      let moveY = 0;
      const forwardIntent = (intent.forward ? 1 : 0) - (intent.back ? 1 : 0);
      const strafeIntent = (intent.right ? 1 : 0) - (intent.left ? 1 : 0);

      if (intent.forward) {
        moveX += forwardX;
        moveY += forwardY;
      }
      if (intent.back) {
        moveX -= forwardX;
        moveY -= forwardY;
      }
      if (intent.right) {
        moveX += rightX;
        moveY += rightY;
      }
      if (intent.left) {
        moveX -= rightX;
        moveY -= rightY;
      }

      const len = Math.hypot(moveX, moveY);
      let moved = false;
      let moveStrength = 0;
      let sprintingNow = false;
      if (len > 0.0001) {
        moveX /= len;
        moveY /= len;
        const canSprint = intent.sprint && this.sim.player.stamina > 0.5;
        const speedMul = canSprint ? SPRINT_MULTIPLIER : 1;
        moved = this.sim.movePlayer(moveX * MOVE_SPEED * speedMul * dtSec, moveY * MOVE_SPEED * speedMul * dtSec);
        sprintingNow = moved && canSprint;
        if (moved && canSprint) {
          this.sim.player.stamina = clamp(
            this.sim.player.stamina - STAMINA_DRAIN_PER_SEC * dtSec,
            0,
            this.sim.player.maxStamina,
          );
        } else {
          this.sim.player.stamina = clamp(
            this.sim.player.stamina + STAMINA_REGEN_PER_SEC * dtSec,
            0,
            this.sim.player.maxStamina,
          );
        }
        moveStrength = speedMul;
      } else {
        this.sim.player.stamina = clamp(
          this.sim.player.stamina + STAMINA_REGEN_PER_SEC * dtSec,
          0,
          this.sim.player.maxStamina,
        );
      }
      const targetIntensity = moved ? clamp(moveStrength, 0, 1.2) : 0;
      const smooth = 1 - Math.exp(-dtSec * (targetIntensity > this.bobIntensity ? BOB_SMOOTH_IN : BOB_SMOOTH_OUT));
      this.bobIntensity += (targetIntensity - this.bobIntensity) * smooth;

      if (this.bobIntensity > 0.001) {
        const stepHz = BOB_BASE_STEP_HZ + BOB_SPEED_STEP_HZ * this.bobIntensity;
        this.walkBobPhase += dtSec * (Math.PI * 2) * stepHz;

        const sideWave = Math.sin(this.walkBobPhase * 2);
        const upWave = Math.sin(this.walkBobPhase + Math.PI * 0.35);
        this.bobSide = sideWave * BOB_MAX_SIDE * this.bobIntensity;
        this.bobUp = Math.abs(upWave) * BOB_MAX_UP * this.bobIntensity;
      } else {
        this.bobSide = 0;
        this.bobUp = 0;
      }

      if (moved && this.footstepCooldown <= 0) {
        const stepRate = sprintingNow ? 0.21 : 0.29;
        this.footstepCooldown = stepRate;
        this.synth.playFootstep(Math.max(1, moveStrength));
      }

      const sprintSway = sprintingNow ? SPRINT_WEAPON_WOBBLE_X : 1;
      const targetSwayX = (strafeIntent * 22 + this.bobSide * 380) * sprintSway;
      const targetSwayY = (Math.max(0, forwardIntent) * 12 + this.bobUp * 420) * (sprintingNow ? SPRINT_WEAPON_WOBBLE_Y : 1);
      const targetSwayRot = (strafeIntent * 5 + forwardIntent * -2) * (sprintingNow ? SPRINT_WEAPON_WOBBLE_ROT : 1);
      const swayLerp = 1 - Math.exp(-dtSec * 12);
      this.weaponSwayX += (targetSwayX - this.weaponSwayX) * swayLerp;
      this.weaponSwayY += (targetSwayY - this.weaponSwayY) * swayLerp;
      this.weaponSwayRot += (targetSwayRot - this.weaponSwayRot) * swayLerp;
    }

    this.damageShakeTimer = Math.max(0, this.damageShakeTimer - dtSec);
    if (this.damageShakeTimer <= 0) {
      this.damageShakePower = 0;
      this.damageShakeSide = 0;
      this.damageShakeFront = 0;
    } else {
      this.damageShakePower = Math.max(0, this.damageShakePower - dtSec * 1.8);
      const dirDecay = 1 - Math.exp(-dtSec * 9);
      this.damageShakeSide += (0 - this.damageShakeSide) * dirDecay;
      this.damageShakeFront += (0 - this.damageShakeFront) * dirDecay;
    }
    this.playerHitShakeTimer = Math.max(0, this.playerHitShakeTimer - dtSec);
    this.portraitHitTimer = Math.max(0, this.portraitHitTimer - dtSec);
    this.hud.portrait.src = this.portraitHitTimer > 0 ? PORTRAIT_ANGRY_SRC : PORTRAIT_NORMAL_SRC;

    this.tickAccumulator += dtSec * 1000;
    while (this.tickAccumulator >= TICK_MS) {
      this.sim.step();
      this.tickAccumulator -= TICK_MS;
    }

    this.syncCamera();
    this.syncWeaponSprite();
    this.syncEnemySprites(dtSec);
    this.syncHud();
    this.drawMinimap();
    this.consumeAndShowHitIndicators();
    this.consumeAndShowPlayerHitFeedback();
    this.updateDeathSequence(dtSec);
    this.syncDeathOverlay();
  }

  private syncCamera(): void {
    const px = this.sim.player.x + 0.5;
    const pz = this.sim.player.y + 0.5;
    const rightX = Math.cos(this.viewAngle);
    const rightZ = -Math.sin(this.viewAngle);
    const forwardX = -Math.sin(this.viewAngle);
    const forwardZ = -Math.cos(this.viewAngle);
    const shakePhase = performance.now() * 0.028;
    const shakeEnvelope = this.damageShakeTimer > 0 ? this.damageShakeTimer / DAMAGE_SHAKE_DURATION : 0;
    const hurtShakeAmp = 0.028 * this.damageShakePower * shakeEnvelope;
    const hitShakeEnv = this.playerHitShakeTimer > 0 ? this.playerHitShakeTimer / PLAYER_HIT_SHAKE_DURATION : 0;
    const hitShakeAmp = 0.017 * hitShakeEnv;
    const dirKickRight = -this.damageShakeSide * hurtShakeAmp * 0.85;
    const dirKickForward = -this.damageShakeFront * hurtShakeAmp * 0.5;
    const jitterRight = Math.sin(shakePhase * 2.3) * hurtShakeAmp * 0.45 + Math.cos(shakePhase * 4.9) * hitShakeAmp;
    const jitterUp = Math.cos(shakePhase * 3.1) * hurtShakeAmp * 0.7 + Math.sin(shakePhase * 3.7) * hitShakeAmp * 0.45;
    const shakeX = rightX * (dirKickRight + jitterRight) + forwardX * dirKickForward;
    const shakeZ = rightZ * (dirKickRight + jitterRight) + forwardZ * dirKickForward;
    const shakeYaw = (-this.damageShakeSide * hurtShakeAmp * 0.55) + Math.sin(shakePhase * 2.8) * hitShakeAmp * 0.6;
    const deathDrop = this.deathProgress * 0.46;
    const deathRoll = -this.deathProgress * 0.18;

    this.camera.position.set(
      px + rightX * this.bobSide + shakeX,
      0.82 + this.bobUp + jitterUp - deathDrop,
      pz + rightZ * this.bobSide + shakeZ,
    );
    this.camera.rotation.set(0, this.viewAngle + shakeYaw, deathRoll);
    this.playerLight.position.set(
      px - Math.sin(this.viewAngle) * 0.35,
      0.96 + this.bobUp * 0.5,
      pz - Math.cos(this.viewAngle) * 0.35,
    );
  }

  private handleWeaponSwitchInput(): void {
    const cmd = this.input.consumeWeaponSwitch();
    if (!cmd) return;
    if (cmd === "toggle") {
      this.setActiveWeapon(this.activeWeapon === "sword" ? "wand" : "sword");
      return;
    }
    this.setActiveWeapon(cmd);
  }

  private setActiveWeapon(weapon: WeaponKind): void {
    const sameWeapon = weapon === this.activeWeapon;
    this.activeWeapon = weapon;
    this.hud.weaponSlot1.classList.toggle("active", weapon === "sword");
    this.hud.weaponSlot2.classList.toggle("active", weapon === "wand");
    const targetSlot = weapon === "sword" ? this.hud.weaponSlot1 : this.hud.weaponSlot2;
    targetSlot.classList.remove("weapon-bounce");
    void targetSlot.offsetWidth;
    targetSlot.classList.add("weapon-bounce");

    if (sameWeapon) return;
    this.synth.playWeaponSwitch();
    this.weaponSwapPending = weapon;
    this.weaponSwapSwitched = false;
    this.weaponSwapTimer = 0.28;
  }

  private handleWeaponInput(dtSec: number): void {
    this.attackCooldown = Math.max(0, this.attackCooldown - dtSec);
    this.weaponSwingTimer = Math.max(0, this.weaponSwingTimer - dtSec);
    if (this.attackCooldown > 0) return;
    if (!this.input.consumeAttack()) return;
    if (this.sim.gameOver) return;

    this.attackWeapon = this.activeWeapon;
    this.attackCooldown = this.attackWeapon === "wand" ? 0.23 : 0.2;
    const durations = this.attackWeapon === "wand" ? WAND_ATTACK_DURATIONS : SWORD_ATTACK_DURATIONS;
    if (this.attackWeapon === "wand") {
      this.attackPattern = randomNoRepeat(3, this.lastWandPattern);
      this.lastWandPattern = this.attackPattern;
    } else {
      this.attackPattern = randomNoRepeat(3, this.lastSwordPattern);
      this.lastSwordPattern = this.attackPattern;
    }
    this.weaponSwingDuration = durations[this.attackPattern];
    this.weaponSwingTimer = this.weaponSwingDuration;
    this.synth.playWeaponSwing(this.attackWeapon);
    const hit = this.sim.playerMeleeAttack(this.viewAngle, this.attackWeapon);
    if (hit) this.synth.playWeaponImpact(this.attackWeapon);
    else this.synth.playWeaponMiss(this.attackWeapon);
  }

  private syncWeaponSprite(): void {
    this.weaponIdlePhase += 0.013;
    const t = this.weaponSwingTimer > 0 ? 1 - this.weaponSwingTimer / this.weaponSwingDuration : 1;
    const swingCurve = this.weaponSwingTimer > 0 ? Math.sin(t * Math.PI) : 0;
    const swingEase = this.weaponSwingTimer > 0 ? Math.sin(t * Math.PI * 0.5) : 0;

    let swingX = 0;
    let swingY = 0;
    let swingRot = 0;
    const isWand = this.attackWeapon === "wand";
    if (this.weaponSwingTimer > 0) {
      if (!isWand && this.attackPattern === 0) {
        swingX = -42 * swingCurve;
        swingY = 17 * swingCurve;
        swingRot = -30 * swingCurve;
      } else if (!isWand && this.attackPattern === 1) {
        swingX = 36 * swingCurve;
        swingY = 13 * swingCurve;
        swingRot = 26 * swingCurve;
      } else if (!isWand) {
        const thrust = Math.sin(t * Math.PI);
        const recover = Math.sin(t * Math.PI * 2) * 0.34;
        swingX = -9 * thrust + 11 * recover;
        swingY = -33 * swingEase + 12 * thrust;
        swingRot = -10 * thrust + 8 * recover;
      } else if (this.attackPattern === 0) {
        swingX = -18 * swingCurve;
        swingY = -26 * swingEase + 6 * swingCurve;
        swingRot = -20 * swingCurve;
      } else if (this.attackPattern === 1) {
        swingX = 24 * swingCurve;
        swingY = -20 * swingEase + 5 * swingCurve;
        swingRot = 17 * swingCurve;
      } else {
        const pulse = Math.sin(t * Math.PI);
        swingX = -8 * pulse;
        swingY = -34 * pulse + 8 * Math.sin(t * Math.PI * 2);
        swingRot = 10 * Math.sin(t * Math.PI * 2.2);
      }
    }

    const idleX = Math.sin(this.weaponIdlePhase) * (this.handWeapon === "wand" ? 1.8 : 2.6);
    const idleY = Math.sin(this.weaponIdlePhase * 0.58) * (this.handWeapon === "wand" ? 2.8 : 3.9);
    const idleRot = Math.sin(this.weaponIdlePhase * 0.7) * (this.handWeapon === "wand" ? 0.8 : 1.2);

    let swapY = 0;
    if (this.weaponSwapTimer > 0) {
      const swapT = 1 - this.weaponSwapTimer / 0.28;
      if (swapT < 0.5) {
        const down = Math.sin((swapT / 0.5) * (Math.PI * 0.5));
        swapY = 250 * down;
      } else {
        if (!this.weaponSwapSwitched && this.weaponSwapPending) {
          this.handWeapon = this.weaponSwapPending;
          this.hud.weaponSprite.src = this.handWeapon === "sword" ? "/sword.png" : "/wand.png";
          this.hud.weaponSprite.style.transformOrigin = this.handWeapon === "sword" ? "85% 90%" : "82% 88%";
          this.weaponSwapSwitched = true;
        }
        const up = 1 - Math.sin(((swapT - 0.5) / 0.5) * (Math.PI * 0.5));
        swapY = 250 * up;
      }
    } else if (this.weaponSwapPending) {
      this.handWeapon = this.weaponSwapPending;
      this.hud.weaponSprite.src = this.handWeapon === "sword" ? "/sword.png" : "/wand.png";
      this.hud.weaponSprite.style.transformOrigin = this.handWeapon === "sword" ? "85% 90%" : "82% 88%";
      this.weaponSwapPending = null;
      this.weaponSwapSwitched = false;
    }

    const x = this.weaponSwayX + swingX + idleX;
    const y = this.weaponSwayY + swingY + idleY + swapY;
    const rot = this.weaponSwayRot + swingRot + idleRot;
    this.hud.weaponSprite.style.opacity = "1";
    this.hud.weaponSprite.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) rotate(${rot.toFixed(
      2,
    )}deg)`;
  }

  private consumeAndShowHitIndicators(): void {
    const hits = this.sim.consumeHitIndicators();
    if (hits.length === 0) return;

    const px = this.sim.player.x + 0.5;
    const py = this.sim.player.y + 0.5;
    const rightX = Math.cos(this.viewAngle);
    const rightY = -Math.sin(this.viewAngle);
    const forwardX = -Math.sin(this.viewAngle);
    const forwardY = -Math.cos(this.viewAngle);

    for (const hit of hits) {
      this.enemyLungeTimers.set(hit.enemyId, ENEMY_LUNGE_DURATION);
      this.damageShakeTimer = DAMAGE_SHAKE_DURATION;
      this.damageShakePower = clamp(this.damageShakePower + 0.7, 0, 1.5);
      this.portraitHitTimer = PORTRAIT_HIT_DURATION;

      const dx = hit.x - px;
      const dy = hit.y - py;
      const side = dx * rightX + dy * rightY;
      const front = dx * forwardX + dy * forwardY;
      const absSide = Math.abs(side);
      const absFront = Math.abs(front);
      const norm = Math.max(0.001, absSide + absFront);
      this.damageShakeSide = side / norm;
      this.damageShakeFront = front / norm;
      this.synth.playEnemyHitPlayer(this.damageShakeSide, this.damageShakeFront);

      let node: HTMLDivElement;
      if (absFront >= absSide) {
        node = front >= 0 ? this.hud.hitTop : this.hud.hitBottom;
      } else {
        node = side >= 0 ? this.hud.hitRight : this.hud.hitLeft;
      }
      node.classList.remove("hit-pulse");
      void node.offsetWidth;
      node.classList.add("hit-pulse");

      const flash = document.createElement("div");
      flash.className = "enemy-hit-flash";
      this.hud.combatFx.appendChild(flash);
      window.setTimeout(() => flash.remove(), 250);
    }
  }

  private consumeAndShowPlayerHitFeedback(): void {
    const hits = this.sim.consumePlayerHitEvents();
    if (hits.length === 0) return;

    for (const hit of hits) {
      this.enemyHitRecoilTimers.set(hit.enemyId, ENEMY_HIT_RECOIL_DURATION);
      this.playerHitShakeTimer = PLAYER_HIT_SHAKE_DURATION;
      const enemy = this.sim.enemies.find((e) => e.id === hit.enemyId);
      if (enemy && !enemy.alive) {
        this.synth.playEnemyDeath();
      }

      const flash = document.createElement("div");
      flash.className = "attack-flash";
      this.hud.combatFx.appendChild(flash);
      window.setTimeout(() => flash.remove(), 190);

      const pop = document.createElement("div");
      pop.className = "damage-pop";
      pop.textContent = `${hit.damage}`;

      const projected = new THREE.Vector3(hit.x, 0.82, hit.y);
      projected.project(this.camera);
      const px = (projected.x * 0.5 + 0.5) * this.renderer.domElement.clientWidth;
      const py = (-projected.y * 0.5 + 0.5) * this.renderer.domElement.clientHeight;
      pop.style.left = `${clamp(px, 18, this.renderer.domElement.clientWidth - 18)}px`;
      pop.style.top = `${clamp(py, 26, this.renderer.domElement.clientHeight - 26)}px`;
      this.hud.combatFx.appendChild(pop);
      window.setTimeout(() => pop.remove(), 520);
    }
  }

  private syncEnemySprites(dtSec: number): void {
    if (HIDE_ENEMIES) return;
    for (const enemy of this.sim.enemies) {
      const sprite = this.enemySprites.get(enemy.id);
      if (!sprite) continue;
      if (!enemy.alive) {
        sprite.visible = false;
        this.enemyLungeTimers.delete(enemy.id);
        this.enemyRenderPos.delete(enemy.id);
        this.enemyHitRecoilTimers.delete(enemy.id);
        continue;
      }

      const baseX = enemy.x + 0.5;
      const baseZ = enemy.y + 0.5;
      const lungeRemain = this.enemyLungeTimers.get(enemy.id) ?? 0;
      let lungeX = 0;
      let lungeY = 0;
      let lungeZ = 0;
      if (lungeRemain > 0) {
        const next = Math.max(0, lungeRemain - dtSec);
        if (next <= 0) {
          this.enemyLungeTimers.delete(enemy.id);
        } else {
          this.enemyLungeTimers.set(enemy.id, next);
        }

        const progress = 1 - next / ENEMY_LUNGE_DURATION;
        const pulse = Math.sin(progress * Math.PI);
        const towardCamX = this.camera.position.x - baseX;
        const towardCamZ = this.camera.position.z - baseZ;
        const towardLen = Math.hypot(towardCamX, towardCamZ);
        if (towardLen > 0.0001) {
          const nx = towardCamX / towardLen;
          const nz = towardCamZ / towardLen;
          const lungeDist = pulse * 0.34;
          lungeX = nx * lungeDist;
          lungeZ = nz * lungeDist;
          lungeY = pulse * 0.06;
        }
      }

      const recoilRemain = this.enemyHitRecoilTimers.get(enemy.id) ?? 0;
      if (recoilRemain > 0) {
        const next = Math.max(0, recoilRemain - dtSec);
        if (next <= 0) {
          this.enemyHitRecoilTimers.delete(enemy.id);
        } else {
          this.enemyHitRecoilTimers.set(enemy.id, next);
        }

        const progress = 1 - next / ENEMY_HIT_RECOIL_DURATION;
        const pulse = Math.sin(progress * Math.PI);
        const awayX = baseX - (this.sim.player.x + 0.5);
        const awayZ = baseZ - (this.sim.player.y + 0.5);
        const awayLen = Math.hypot(awayX, awayZ);
        if (awayLen > 0.0001) {
          lungeX += (awayX / awayLen) * pulse * 0.18;
          lungeZ += (awayZ / awayLen) * pulse * 0.18;
          lungeY += pulse * 0.08;
        }
      }

      const visual = this.enemyRenderPos.get(enemy.id) ?? { x: baseX, z: baseZ };
      const targetX = baseX + lungeX;
      const targetZ = baseZ + lungeZ;
      const follow = 1 - Math.exp(-dtSec * ENEMY_MOVE_SMOOTH);
      visual.x += (targetX - visual.x) * follow;
      visual.z += (targetZ - visual.z) * follow;
      this.enemyRenderPos.set(enemy.id, visual);

      sprite.visible = true;
      sprite.position.set(visual.x, lungeY, visual.z);
      sprite.scale.set(0.9, 1.1, 1);

      const mat = sprite.material as THREE.SpriteMaterial;
      const lx = this.playerLight.position.x - sprite.position.x;
      const lz = this.playerLight.position.z - sprite.position.z;
      const lightDist = Math.hypot(lx, lz);
      const lightBoost = clamp(1.1 - lightDist / 18, 0.42, 0.9);
      const shade = 0.55 * lightBoost;
      mat.color.setRGB(shade, shade, shade);
    }
  }

  private updateDeathSequence(dtSec: number): void {
    const dead = this.sim.gameOver && this.sim.player.hp <= 0;
    if (!dead) return;
    if (!this.deathSequenceActive) {
      this.deathSequenceActive = true;
      this.synth.playEnemyHitPlayer(0, 1);
      this.deathTimer = DEATH_RELOAD_SECONDS;
      this.deathProgress = 0;
    }

    this.deathTimer = Math.max(0, this.deathTimer - dtSec);
    const t = 1 - this.deathTimer / DEATH_RELOAD_SECONDS;
    this.deathProgress = clamp(t, 0, 1);
    if (this.deathTimer <= 0) {
      window.location.reload();
    }
  }

  private syncDeathOverlay(): void {
    if (!this.deathSequenceActive) {
      this.hud.deathOverlay.classList.remove("active");
      return;
    }

    this.hud.deathOverlay.classList.add("active");
    const pulse = Math.sin(performance.now() * 0.008) * 0.5 + 0.5;
    const alpha = 0.12 + this.deathProgress * 0.52 + pulse * 0.08 * this.deathProgress;
    this.hud.deathOverlay.style.opacity = alpha.toFixed(3);
    this.hud.deathCountdown.textContent = `RELOADING IN ${Math.ceil(this.deathTimer)}`;
  }

  private syncHud(): void {
    const hpRatio = this.sim.player.hp / this.sim.player.maxHp;
    const staminaRatio = this.sim.player.stamina / this.sim.player.maxStamina;
    this.hud.hpBar.style.width = `${clamp(hpRatio, 0, 1) * 100}%`;
    this.hud.hpText.textContent = `${this.sim.player.hp} / ${this.sim.player.maxHp}`;
    this.hud.staminaBar.style.width = `${clamp(staminaRatio, 0, 1) * 100}%`;
    this.hud.staminaText.textContent = `${Math.round(this.sim.player.stamina)} / ${this.sim.player.maxStamina}`;
    this.hud.status.textContent = this.sim.status;
    this.hud.weaponSlot1.classList.toggle("active", this.activeWeapon === "sword");
    this.hud.weaponSlot2.classList.toggle("active", this.activeWeapon === "wand");
  }

  private drawMinimap(): void {
    const canvas = this.hud.minimap;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const cell = canvas.width / MAP_W;
    ctx.fillStyle = "#050505";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let y = 0; y < MAP_H; y += 1) {
      for (let x = 0; x < MAP_W; x += 1) {
        if (!this.sim.explored[y][x]) {
          ctx.fillStyle = "#080808";
        } else {
          ctx.fillStyle = this.sim.map[y][x] === 1 ? "#2d2d2d" : "#d6d6d6";
        }
        ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    }

    if (!HIDE_ENEMIES) {
      for (const enemy of this.sim.enemies) {
        if (!enemy.alive) continue;
        if (!this.sim.explored[enemy.y]?.[enemy.x]) continue;
        ctx.fillStyle = enemy.alerted ? "#ff5f5f" : "#be6767";
        ctx.beginPath();
        ctx.arc((enemy.x + 0.5) * cell, (enemy.y + 0.5) * cell, Math.max(2, cell * 0.26), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const cx = (this.sim.player.x + 0.5) * cell;
    const cy = (this.sim.player.y + 0.5) * cell;
    const tipX = cx - Math.sin(this.viewAngle) * cell * 0.75;
    const tipY = cy - Math.cos(this.viewAngle) * cell * 0.75;

    ctx.fillStyle = "#36d47d";
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(2.5, cell * 0.3), 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#36d47d";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
  }

  private render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}

const mount = document.querySelector<HTMLDivElement>("#app");
if (!mount) throw new Error("No #app mount");

mount.innerHTML = `
  <div class="app-shell">
    <div class="viewport-wrap">
      <div id="game-host"></div>
      <div id="combat-fx"></div>
      <div id="death-overlay" class="death-overlay">
        <div class="death-title">YOU DIED</div>
        <div id="death-countdown" class="death-countdown">RELOADING IN 6</div>
      </div>
      <div id="hit-top" class="hit-indicator hit-top"></div>
      <div id="hit-right" class="hit-indicator hit-right"></div>
      <div id="hit-bottom" class="hit-indicator hit-bottom"></div>
      <div id="hit-left" class="hit-indicator hit-left"></div>
      <img id="weapon-sprite" src="/sword.png" alt="Sword" />
      <div class="hud-bottom">
        <div class="portrait-ring"><img id="portrait" src="/character.png" alt="Hero"/></div>
        <div class="hp-block">
          <div class="hp-label">HP</div>
          <div class="hp-bar-shell"><div id="hp-bar" class="hp-bar-fill"></div></div>
          <div id="hp-text" class="hp-text">100 / 100</div>
          <div class="stamina-label">Stamina</div>
          <div class="stamina-bar-shell"><div id="stamina-bar" class="stamina-bar-fill"></div></div>
          <div id="stamina-text" class="stamina-text">100 / 100</div>
        </div>
        <div class="weapon-slots">
          <div id="weapon-slot-1" class="weapon-slot active"><span class="weapon-key">1</span><img src="/sword icon.png" alt="Sword icon"/></div>
          <div id="weapon-slot-2" class="weapon-slot"><span class="weapon-key">2</span><img src="/wand icon.png" alt="Wand icon"/></div>
        </div>
      </div>
    </div>
    <aside class="side-panel">
      <canvas id="minimap" width="260" height="260"></canvas>
      <div id="status" class="status">Initializing...</div>
      <div class="controls">Click viewport for mouse look<br/>W/↑ forward, S/↓ backward<br/>A strafe left, D strafe right<br/>←/→ turn camera<br/>Hold Shift to sprint<br/>Q: switch weapon, 1: sword, 2: wand<br/>Left Click: attack</div>
    </aside>
  </div>`;

const simulation = new DungeonSimulation();
const input = new InputManager();
const app = new Game3DApp(simulation, input);
app.start();
