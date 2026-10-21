import * as THREE from 'three';
import type { MonsterDef } from '../shared/types';
import type { NpcDef, SpawnDef } from '../shared/data/maps';
import { Label } from './fx';
import { makeHuman, makeMonsterModel, NOVICE_LOOK, NPC_LOOKS, type HumanRig, type MonsterRig } from './models';
import { randomInCircle } from './rand';

const tmp = new THREE.Vector3();

function angleLerp(a: number, b: number, t: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// ── Player ────────────────────────────────────────────────────────────

export type PlayerTarget =
  | { kind: 'monster'; monster: Monster }
  | { kind: 'npc'; npc: Npc }
  | { kind: 'crystal' }
  | null;

export class Player {
  readonly rig: HumanRig;
  readonly label: Label;
  readonly pos = new THREE.Vector3();
  dest: THREE.Vector3 | null = null;
  target: PlayerTarget = null;
  facing = 0;
  speed = 4.6;
  radius = 0.4;
  attackCooldown = 0;
  attackAnim = 0; // 0..1 progress, 0 = idle
  pendingHit = -1; // seconds until the queued swing lands
  sitting = false;
  playingDead = false;
  dead = false;
  private walkPhase = 0;
  private moving = false;
  private idleT = 0;

  constructor(name: string) {
    this.rig = makeHuman(NOVICE_LOOK);
    this.label = new Label({ name, className: 'below player', hp: true, sp: true, y: 0 });
    this.rig.root.add(this.label.obj);
  }

  get object() {
    return this.rig.root;
  }

  setPosition(x: number, z: number) {
    this.pos.set(x, 0, z);
    this.rig.root.position.copy(this.pos);
  }

  /** move toward a point; returns remaining distance */
  stepToward(x: number, z: number, dt: number, stopAt = 0.05) {
    tmp.set(x - this.pos.x, 0, z - this.pos.z);
    const dist = tmp.length();
    if (dist <= stopAt) {
      this.moving = false;
      return dist;
    }
    const step = Math.min(dist - stopAt, this.speed * dt);
    tmp.normalize();
    this.pos.addScaledVector(tmp, step);
    this.facing = angleLerp(this.facing, Math.atan2(tmp.x, tmp.z), Math.min(1, dt * 14));
    this.moving = true;
    return dist - step;
  }

  face(x: number, z: number, dt: number) {
    this.facing = angleLerp(this.facing, Math.atan2(x - this.pos.x, z - this.pos.z), Math.min(1, dt * 14));
  }

  stop() {
    this.moving = false;
  }

  startSwing() {
    this.attackAnim = 0.0001;
  }

  animate(dt: number) {
    const r = this.rig;
    r.root.position.copy(this.pos);
    r.root.rotation.y = this.facing;
    this.idleT += dt;

    // reset pose
    r.pose.rotation.set(0, 0, 0);
    r.pose.position.set(0, 0, 0);
    r.hips.position.y = 0.46;

    if (this.dead || this.playingDead) {
      r.pose.rotation.x = -Math.PI / 2;
      r.pose.position.set(0, 0.42, 0.85);
      r.armL.rotation.set(0, 0, 0.5);
      r.armR.rotation.set(0, 0, -0.5);
      r.legL.rotation.set(0, 0, 0.1);
      r.legR.rotation.set(0, 0, -0.1);
      return;
    }

    if (this.sitting) {
      r.hips.position.y = 0.2;
      r.legL.rotation.set(-1.45, 0, 0.12);
      r.legR.rotation.set(-1.45, 0, -0.12);
      r.armL.rotation.set(-0.5, 0, 0.15);
      r.armR.rotation.set(-0.5, 0, -0.15);
      r.head.rotation.x = Math.sin(this.idleT * 1.5) * 0.04;
      return;
    }

    if (this.moving) {
      this.walkPhase += dt * this.speed * 2.4;
      const s = Math.sin(this.walkPhase);
      r.legL.rotation.set(s * 0.7, 0, 0);
      r.legR.rotation.set(-s * 0.7, 0, 0);
      r.armL.rotation.set(-s * 0.6, 0, 0.08);
      r.armR.rotation.set(s * 0.6, 0, -0.08);
      r.hips.position.y = 0.46 + Math.abs(Math.cos(this.walkPhase)) * 0.06;
    } else {
      r.legL.rotation.set(0, 0, 0.03);
      r.legR.rotation.set(0, 0, -0.03);
      r.armL.rotation.set(0, 0, 0.1 + Math.sin(this.idleT * 2) * 0.03);
      r.armR.rotation.set(-0.2, 0, -0.1);
      r.hips.position.y = 0.46 + Math.sin(this.idleT * 2) * 0.012;
    }

    if (this.attackAnim > 0) {
      this.attackAnim += dt / 0.32;
      const t = Math.min(1, this.attackAnim);
      // wind up then slash down
      const swing = t < 0.35 ? THREE.MathUtils.lerp(-0.2, -2.5, t / 0.35) : THREE.MathUtils.lerp(-2.5, 0.7, (t - 0.35) / 0.65);
      r.armR.rotation.set(swing, 0, -0.25);
      r.hips.rotation.y = t < 0.35 ? -0.25 * (t / 0.35) : -0.25 + 0.45 * ((t - 0.35) / 0.65);
      if (t >= 1) {
        this.attackAnim = 0;
        r.hips.rotation.y = 0;
      }
    } else {
      r.hips.rotation.y = 0;
    }
    r.head.rotation.x = 0;
  }
}

// ── Monster ───────────────────────────────────────────────────────────

export type MonsterState = 'idle' | 'wander' | 'chase' | 'return' | 'dying' | 'dead';

export class Monster {
  readonly def: MonsterDef;
  readonly spawn: SpawnDef;
  readonly rig: MonsterRig;
  readonly label: Label;
  readonly pos = new THREE.Vector3();
  hp: number;
  state: MonsterState = 'idle';
  aggro = false;
  facing = Math.random() * Math.PI * 2;
  attackCooldown = 0;
  stateTimer = 0;
  respawnTimer = 0;
  wanderTo = new THREE.Vector3();
  hitFlash = 0;
  frozenTimer = 0;
  hovered = false;
  targeted = false;
  private t = Math.random() * 10;
  private moving = false;

  constructor(def: MonsterDef, spawn: SpawnDef) {
    this.def = def;
    this.spawn = spawn;
    this.hp = def.hp;
    this.rig = makeMonsterModel(def.id);
    this.rig.root.scale.setScalar(def.scale);
    this.label = new Label({ name: `${def.nameTh} Lv.${def.level}`, className: `below monster${def.boss ? ' boss' : ''}`, hp: true, y: 0 });
    this.label.setVisible(false);
    this.rig.root.add(this.label.obj);
    // keep the label readable regardless of model scale
    this.label.obj.scale.setScalar(1 / def.scale);
    this.placeRandom();
  }

  get object() {
    return this.rig.root;
  }

  get alive() {
    return this.state !== 'dead' && this.state !== 'dying';
  }

  get pickHeight() {
    return (this.def.flying ? 1.3 : this.rig.height * 0.5) * this.def.scale;
  }

  placeRandom() {
    const [x, z] = randomInCircle(Math.random, this.spawn.center[0], this.spawn.center[1], this.spawn.radius);
    this.pos.set(x, 0, z);
    this.rig.root.position.copy(this.pos);
  }

  stepToward(x: number, z: number, speed: number, dt: number, stopAt: number) {
    tmp.set(x - this.pos.x, 0, z - this.pos.z);
    const dist = tmp.length();
    if (dist <= stopAt) {
      this.moving = false;
      return dist;
    }
    tmp.normalize();
    this.pos.addScaledVector(tmp, Math.min(dist - stopAt, speed * dt));
    this.facing = angleLerp(this.facing, Math.atan2(tmp.x, tmp.z), Math.min(1, dt * 8));
    this.moving = true;
    return dist;
  }

  face(x: number, z: number, dt: number) {
    this.facing = angleLerp(this.facing, Math.atan2(x - this.pos.x, z - this.pos.z), Math.min(1, dt * 8));
    this.moving = false;
  }

  setMoving(v: boolean) {
    this.moving = v;
  }

  updateLabel() {
    const show = this.alive && (this.hovered || this.targeted || this.aggro || this.def.boss === true);
    this.label.setVisible(show);
    this.label.showBars(this.targeted || this.aggro || this.hp < this.def.hp);
    this.label.setBars(this.hp / this.def.hp);
  }

  animate(dt: number) {
    this.t += dt;
    const r = this.rig;
    r.root.position.copy(this.pos);
    r.root.rotation.y = this.facing;
    const id = this.def.id;

    if (this.state === 'dying') {
      const k = Math.max(0, this.stateTimer / 0.5);
      r.body.scale.set(1 + (1 - k) * 0.3, k, 1 + (1 - k) * 0.3);
      return;
    }
    r.body.scale.setScalar(1);

    if (this.hitFlash > 0) {
      this.hitFlash -= dt;
      const p = Math.max(0, this.hitFlash / 0.15);
      r.body.scale.set(1 + p * 0.12, 1 - p * 0.12, 1 + p * 0.12);
    }

    if (id === 'mossball') {
      if (this.moving) {
        r.body.rotation.x = Math.sin(this.t * 9) * 0.28;
        r.body.position.y = Math.abs(Math.sin(this.t * 9)) * 0.1;
      } else {
        r.body.rotation.x *= 0.9;
        r.body.position.y = 0;
        const b = 1 + Math.sin(this.t * 2.2) * 0.03;
        if (this.hitFlash <= 0) r.body.scale.set(b, 2 - b, b);
      }
    } else if (id === 'pebble_beetle' || id === 'pebble_queen') {
      const legs = (r.parts.legs.userData.legs ?? []) as THREE.Object3D[];
      legs.forEach((leg, i) => {
        leg.rotation.y = this.moving ? Math.sin(this.t * 12 + i * 1.6) * 0.45 : 0;
      });
      r.body.position.y = this.moving ? Math.abs(Math.sin(this.t * 12)) * 0.03 : 0;
      (r.parts.head as THREE.Object3D).rotation.y = Math.sin(this.t * 1.3) * 0.15;
    } else if (id === 'dust_moth') {
      const flap = Math.sin(this.t * 16) * 0.65;
      r.parts.wingL.rotation.z = flap;
      r.parts.wingR.rotation.z = -flap;
      r.body.position.y = 1.3 + Math.sin(this.t * 3) * 0.18;
      r.body.rotation.x = this.moving ? 0.25 : 0;
    } else if (id === 'leaf_gecko') {
      const w = this.moving ? 10 : 2;
      (r.parts.tail as THREE.Object3D).rotation.y = Math.sin(this.t * w) * (this.moving ? 0.5 : 0.15);
      r.body.rotation.y = this.moving ? Math.sin(this.t * w) * 0.12 : 0;
      (r.parts.head as THREE.Object3D).rotation.y = Math.sin(this.t * 0.9) * 0.25;
    }
  }
}

// ── NPC ───────────────────────────────────────────────────────────────

export class Npc {
  readonly def: NpcDef;
  readonly rig: HumanRig;
  readonly label: Label;
  readonly pos: THREE.Vector3;
  private t = Math.random() * 5;

  constructor(def: NpcDef) {
    this.def = def;
    this.rig = makeHuman(NPC_LOOKS[def.role]);
    this.pos = new THREE.Vector3(def.pos[0], 0, def.pos[1]);
    this.rig.root.position.copy(this.pos);
    this.rig.root.rotation.y = def.facing;
    this.label = new Label({ name: def.nameTh, className: 'npc', y: 2.55 });
    this.rig.root.add(this.label.obj);
  }

  get object() {
    return this.rig.root;
  }

  animate(dt: number) {
    this.t += dt;
    const r = this.rig;
    r.hips.position.y = 0.46 + Math.sin(this.t * 1.8) * 0.012;
    r.armL.rotation.z = 0.1 + Math.sin(this.t * 1.8) * 0.03;
    r.armR.rotation.set(this.def.role === 'guide' ? -0.3 : 0, 0, -0.1);
    r.head.rotation.y = Math.sin(this.t * 0.5) * 0.25;
  }
}
