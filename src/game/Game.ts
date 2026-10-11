import * as THREE from 'three';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { TRAINING_FIELD } from '../shared/data/maps';
import { MONSTERS } from '../shared/data/monsters';
import { QUESTS } from '../shared/data/quests';
import { FIRST_AID_HEAL, SKILLS } from '../shared/data/skills';
import {
  baseExpToNext,
  deriveFor,
  HP_REGEN_INTERVAL,
  hpRegenAmount,
  jobExpToNext,
  monsterAttack,
  playerAttack,
  SP_REGEN_INTERVAL,
  spRegenAmount,
} from '../shared/formulas';
import {
  acceptQuest,
  canChangeJob,
  completeQuest,
  gainExp,
  jobOf,
  newCharacter,
  questReady,
  raiseSkill,
  raiseStat,
  recordKill,
  skillLevel,
  validateCreation,
} from '../shared/progression';
import type { CharacterState, Derived, ProgressEvent, StatKey, Stats } from '../shared/types';
import { Monster, Npc, Player, type PlayerTarget } from './entities';
import { Fx, Label } from './fx';
import { makeSaveCrystal } from './models';
import { buildWorld } from './world';

export type LogKind = 'sys' | 'exp' | 'level' | 'quest' | 'warn' | 'skill' | 'combat';
export interface LogEntry {
  id: number;
  text: string;
  kind: LogKind;
}
export interface DialogOption {
  label: string;
  action: string;
}
export interface Dialog {
  speaker: string;
  lines: string[];
  options: DialogOption[];
}

const SAVE_KEY = 'game-web/phase0/character';
const EMOTES = ['!', '?', '♥', '♪', '…', '😆'];

export class Game {
  readonly map = TRAINING_FIELD;
  readonly emotes = EMOTES;
  readonly renderer: THREE.WebGLRenderer;
  readonly labels: CSS2DRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly fx: Fx;
  readonly expRate: number;

  player: Player | null = null;
  state: CharacterState | null = null;
  derived: Derived | null = null;
  monsters: Monster[] = [];
  npcs: Npc[] = [];
  log: LogEntry[] = [];
  dialog: Dialog | null = null;

  private viewport: HTMLElement;
  private obstacles: { x: number; z: number; r: number }[];
  private crystal: ReturnType<typeof makeSaveCrystal>;
  private crystalLabel: Label;
  private sun: THREE.DirectionalLight;
  private timer = new THREE.Timer();
  private raf = 0;
  private listeners = new Set<() => void>();
  private version = 0;
  private dirty = false;
  private logId = 0;
  private hpTimer = 0;
  private spTimer = 0;
  private saveTimer = 0;
  private holdTimer = 0;
  private swingTarget: Monster | null = null;
  private hovered: Monster | null = null;

  // camera
  private yaw = 0;
  private pitch = 0.92;
  private dist = 26;
  private camTarget = new THREE.Vector3(0, 0.8, 10);

  // input
  private keys = new Set<string>();
  private pointer = { x: 0, y: 0, inside: false, left: false, right: false, lastX: 0, lastY: 0, groundHold: false };
  private raycaster = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private sphere = new THREE.Sphere();
  private hitPoint = new THREE.Vector3();

  constructor(viewport: HTMLElement) {
    this.viewport = viewport;
    const params = new URLSearchParams(location.search);
    const hashRate = /^#x(\d+)$/.exec(location.hash)?.[1];
    this.expRate = Math.max(1, Math.min(50, Number(params.get('rate') ?? hashRate) || 1));

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    viewport.appendChild(this.renderer.domElement);

    this.labels = new CSS2DRenderer();
    this.labels.domElement.className = 'labels-layer';
    viewport.appendChild(this.labels.domElement);

    this.camera = new THREE.PerspectiveCamera(32, 1, 0.5, 220);
    this.scene.background = new THREE.Color('#bfe3f2');
    this.scene.fog = new THREE.Fog('#bfe3f2', 48, 100);

    const hemi = new THREE.HemisphereLight('#e4f4ff', '#5d7a3a', 1.25);
    this.scene.add(hemi);
    this.sun = new THREE.DirectionalLight('#fff3dc', 2.1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -24;
    sc.right = 24;
    sc.top = 24;
    sc.bottom = -24;
    sc.near = 1;
    sc.far = 80;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);

    const world = buildWorld(this.scene, this.map);
    this.obstacles = world.obstacles;
    this.fx = new Fx(this.scene);

    for (const spawn of this.map.spawns) {
      const def = MONSTERS[spawn.monster];
      for (let i = 0; i < spawn.count; i++) {
        const m = new Monster(def, spawn);
        m.stateTimer = Math.random() * 3;
        this.monsters.push(m);
        this.scene.add(m.object);
      }
    }
    for (const def of this.map.npcs) {
      const n = new Npc(def);
      this.npcs.push(n);
      this.scene.add(n.object);
    }
    this.crystal = makeSaveCrystal();
    this.crystal.root.position.set(this.map.saveCrystal[0], 0, this.map.saveCrystal[1]);
    this.crystalLabel = new Label({ name: 'ศิลาบันทึก', className: 'npc crystal', y: 2.9 });
    this.crystal.root.add(this.crystalLabel.obj);
    this.scene.add(this.crystal.root);

    this.bindInput();
    this.resize();
    window.addEventListener('resize', this.resize);
    window.addEventListener('beforeunload', this.save);

    this.load();
    this.addLog('ยินดีต้อนรับสู่ทุ่งฝึกหัด! คลิกพื้นเพื่อเดิน คลิกมอนสเตอร์เพื่อโจมตี', 'sys');
    if (this.expRate > 1) this.addLog(`โหมดทดสอบ: EXP x${this.expRate}`, 'warn');
    this.refreshMarkers();

    if (import.meta.env.DEV) (window as unknown as { __game: Game }).__game = this;
  }

  // ── store for React ─────────────────────────────────────────────────
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getVersion = () => this.version;
  private touch() {
    this.dirty = true;
  }

  get hasCharacter() {
    return !!this.state;
  }
  get isDead() {
    return !!this.player?.dead;
  }
  get isSitting() {
    return !!this.player?.sitting;
  }
  get isPlayingDead() {
    return !!this.player?.playingDead;
  }
  get baseToNext() {
    return this.state ? baseExpToNext(this.state.baseLevel) : 1;
  }
  get jobToNext() {
    return this.state ? jobExpToNext(this.state.jobLevel) : 1;
  }
  get jobMaxLevel() {
    return this.state ? jobOf(this.state).maxJobLevel : 10;
  }
  get readyForJobChange() {
    return this.state ? canChangeJob(this.state) : false;
  }
  get targetMonster() {
    const t = this.player?.target;
    return t?.kind === 'monster' ? t.monster : null;
  }

  // ── lifecycle ───────────────────────────────────────────────────────
  start() {
    this.timer.connect(document);
    const loop = (time: number) => {
      this.raf = requestAnimationFrame(loop);
      this.timer.update(time);
      const dt = Math.min(0.1, this.timer.getDelta());
      this.update(dt);
    };
    this.raf = requestAnimationFrame(loop);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.timer.dispose();
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('beforeunload', this.save);
    this.renderer.dispose();
  }

  private resize = () => {
    const w = this.viewport.clientWidth || window.innerWidth;
    const h = this.viewport.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.labels.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  // ── character ───────────────────────────────────────────────────────
  createCharacter(name: string, stats: Stats): string | null {
    const err = validateCreation(stats);
    if (err) return err;
    this.state = newCharacter(name, stats, this.map.playerSpawn);
    this.spawnPlayer();
    this.addLog(`${this.state.name} เริ่มต้นการผจญภัยในฐานะ Novice`, 'sys');
    this.addLog('ไปคุยกับ พยาบาลประจำหมู่บ้าน เพื่อเรียนปฐมพยาบาล', 'quest');
    this.save();
    this.touch();
    return null;
  }

  resetCharacter() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      /* storage blocked */
    }
    if (this.player) this.scene.remove(this.player.object);
    this.player = null;
    this.state = null;
    this.derived = null;
    this.dialog = null;
    this.log = [];
    this.refreshMarkers();
    this.touch();
  }

  private spawnPlayer() {
    if (!this.state) return;
    if (this.player) this.scene.remove(this.player.object);
    this.player = new Player(this.state.name);
    this.player.setPosition(this.state.pos[0], this.state.pos[1]);
    this.scene.add(this.player.object);
    this.camTarget.set(this.player.pos.x, 0.8, this.player.pos.z);
    this.yaw = 0;
    this.refreshDerived();
    this.refreshMarkers();
  }

  private refreshDerived() {
    if (!this.state) return;
    this.derived = deriveFor(this.state, jobOf(this.state));
    this.state.hp = Math.min(this.state.hp, this.derived.maxHp);
    this.state.sp = Math.min(this.state.sp, this.derived.maxSp);
    this.touch();
  }

  private load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as CharacterState;
      if (data?.version !== 1 || !data.stats) return;
      this.state = data;
      this.spawnPlayer();
      this.addLog(`โหลดตัวละคร ${data.name} แล้ว`, 'sys');
    } catch {
      /* corrupt or blocked storage — start fresh */
    }
  }

  save = () => {
    if (!this.state) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.state));
    } catch {
      /* storage blocked — progress lives in memory only */
    }
  };

  // ── UI actions ──────────────────────────────────────────────────────
  raiseStat(key: StatKey) {
    if (!this.state || !raiseStat(this.state, key)) return;
    this.refreshDerived();
  }

  raiseSkill(id: string) {
    if (!this.state || !raiseSkill(this.state, id)) return;
    const lv = this.state.skills[id];
    const unlock = SKILLS[id].unlocks?.find((u) => u.level === lv);
    if (unlock) {
      this.addLog(
        `Basic Training Lv ${lv}: ปลดล็อก "${unlock.label}"${unlock.phase > 0 ? ` (ใช้ได้ใน Phase ${unlock.phase})` : ''}`,
        'skill',
      );
    }
    if (canChangeJob(this.state)) this.addLog('พร้อมเปลี่ยนอาชีพแล้ว! ไปหาผู้ดูแลอาชีพในหมู่บ้าน', 'quest');
    this.refreshMarkers();
    this.touch();
  }

  useSkill(id: 'first_aid' | 'play_dead') {
    const s = this.state;
    const p = this.player;
    if (!s || !p || p.dead) return;
    if (skillLevel(s, id) < 1) {
      this.addLog(
        id === 'first_aid' ? 'ยังไม่ได้เรียนปฐมพยาบาล — ไปหาพยาบาลประจำหมู่บ้าน' : 'ยังไม่ได้เรียนแกล้งตาย — ไปหาพรานเฒ่า',
        'warn',
      );
      return;
    }
    const def = SKILLS[id];
    if (id === 'first_aid') {
      if (p.playingDead) return;
      if (s.sp < def.spCost) return this.addLog('SP ไม่พอ', 'warn');
      if (!this.derived || s.hp >= this.derived.maxHp) return this.addLog('HP เต็มอยู่แล้ว', 'warn');
      s.sp -= def.spCost;
      const before = s.hp;
      s.hp = Math.min(this.derived.maxHp, s.hp + FIRST_AID_HEAL);
      this.fx.float(this.headOf(p.pos, 2.2), `+${s.hp - before}`, 'heal');
      this.touch();
      return;
    }
    // play dead toggles
    if (p.playingDead) {
      p.playingDead = false;
      this.addLog('ลุกขึ้นแล้ว', 'skill');
    } else {
      if (s.sp < def.spCost) return this.addLog('SP ไม่พอ', 'warn');
      s.sp -= def.spCost;
      p.playingDead = true;
      p.sitting = false;
      this.setTarget(null);
      p.dest = null;
      for (const m of this.monsters) {
        if (m.aggro) {
          m.aggro = false;
          m.state = 'return';
        }
      }
      this.addLog('แกล้งตาย... มอนสเตอร์เลิกสนใจคุณ (กด 2 อีกครั้งเพื่อลุก)', 'skill');
    }
    this.touch();
  }

  toggleSit() {
    const s = this.state;
    const p = this.player;
    if (!s || !p || p.dead || p.playingDead) return;
    if (skillLevel(s, 'basic_training') < 3) return this.addLog('ต้องมี Basic Training Lv 3 จึงจะนั่งพักได้', 'warn');
    p.sitting = !p.sitting;
    if (p.sitting) {
      this.setTarget(null);
      p.dest = null;
    }
    this.touch();
  }

  emote(e: string) {
    const s = this.state;
    const p = this.player;
    if (!s || !p || p.dead) return;
    if (skillLevel(s, 'basic_training') < 2) return this.addLog('ต้องมี Basic Training Lv 2 จึงจะใช้อีโมตได้', 'warn');
    this.fx.emote(p.object, 1.75, e);
  }

  respawn() {
    const s = this.state;
    const p = this.player;
    if (!s || !p || !p.dead || !this.derived) return;
    const at = s.savePoint ?? this.map.playerSpawn;
    p.dead = false;
    p.setPosition(at[0], at[1]);
    s.hp = Math.max(1, Math.floor(this.derived.maxHp * 0.5));
    s.sp = Math.floor(this.derived.maxSp * 0.5);
    this.camTarget.set(p.pos.x, 0.8, p.pos.z);
    this.addLog(s.savePoint ? 'ฟื้นคืนที่ศิลาบันทึก' : 'ฟื้นคืนที่หมู่บ้าน', 'sys');
    this.touch();
  }

  closeDialog() {
    this.dialog = null;
    this.touch();
  }

  dialogAction(action: string) {
    const s = this.state;
    if (!s) return;
    const [verb, arg] = action.split(':');
    if (verb === 'accept' && arg) {
      if (acceptQuest(s, arg)) this.addLog(`[เควสต์] รับเควสต์ "${QUESTS[arg].nameTh}"`, 'quest');
      this.dialog = null;
    } else if (verb === 'complete' && arg) {
      if (completeQuest(s, arg)) {
        const skill = SKILLS[QUESTS[arg].rewardSkill];
        this.addLog(`[เควสต์] สำเร็จ "${QUESTS[arg].nameTh}" — ได้รับสกิล ${skill.nameTh}`, 'quest');
        if (this.player) this.fx.levelUp(this.player.object, '#9df5c4');
      }
      this.dialog = null;
    } else if (verb === 'save-point') {
      s.savePoint = [this.map.saveCrystal[0], this.map.saveCrystal[1] + 2.2];
      this.addLog('บันทึกจุดเกิดที่ศิลาบันทึกแล้ว', 'sys');
      this.dialog = null;
    } else {
      this.dialog = null;
    }
    this.refreshMarkers();
    this.save();
    this.touch();
  }

  addLog(text: string, kind: LogKind) {
    this.log.push({ id: ++this.logId, text, kind });
    if (this.log.length > 80) this.log.splice(0, this.log.length - 80);
    this.touch();
  }

  // ── input ───────────────────────────────────────────────────────────
  private bindInput() {
    const el = this.labels.domElement;
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', (e) => {
      this.updatePointer(e);
      if (e.button === 0) {
        this.pointer.left = true;
        this.onLeftClick();
      } else {
        this.pointer.right = true;
        this.pointer.lastX = e.clientX;
        this.pointer.lastY = e.clientY;
      }
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      this.updatePointer(e);
      if (this.pointer.right) {
        this.yaw -= (e.clientX - this.pointer.lastX) * 0.008;
        this.pitch = Math.max(0.55, Math.min(1.3, this.pitch + (e.clientY - this.pointer.lastY) * 0.004));
        this.pointer.lastX = e.clientX;
        this.pointer.lastY = e.clientY;
      }
    });
    const release = (e: PointerEvent) => {
      if (e.button === 0) {
        this.pointer.left = false;
        this.pointer.groundHold = false;
      } else this.pointer.right = false;
    };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('pointerleave', () => (this.pointer.inside = false));
    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.dist = Math.max(11, Math.min(38, this.dist * (1 + e.deltaY * 0.0012)));
      },
      { passive: false },
    );
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      this.keys.add(e.key);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key));
    window.addEventListener('blur', () => this.keys.clear());
  }

  private updatePointer(e: PointerEvent) {
    const rect = this.labels.domElement.getBoundingClientRect();
    this.pointer.x = e.clientX - rect.left;
    this.pointer.y = e.clientY - rect.top;
    this.pointer.inside = true;
    this.ndc.set((this.pointer.x / rect.width) * 2 - 1, -(this.pointer.y / rect.height) * 2 + 1);
  }

  private pick():
    | { kind: 'monster'; monster: Monster }
    | { kind: 'npc'; npc: Npc }
    | { kind: 'crystal' }
    | { kind: 'ground'; x: number; z: number }
    | null {
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const ray = this.raycaster.ray;
    let best = Infinity;
    let hit: ReturnType<Game['pick']> = null;
    const test = (x: number, y: number, z: number, r: number) => {
      this.sphere.center.set(x, y, z);
      this.sphere.radius = r;
      if (!ray.intersectSphere(this.sphere, this.hitPoint)) return Infinity;
      return ray.origin.distanceTo(this.hitPoint);
    };
    for (const m of this.monsters) {
      if (!m.alive) continue;
      const d = test(m.pos.x, m.pickHeight, m.pos.z, m.def.radius * 1.25 + 0.15);
      if (d < best) {
        best = d;
        hit = { kind: 'monster', monster: m };
      }
    }
    for (const n of this.npcs) {
      const d = test(n.pos.x, 1, n.pos.z, 0.85);
      if (d < best) {
        best = d;
        hit = { kind: 'npc', npc: n };
      }
    }
    const cp = this.crystal.root.position;
    const dc = test(cp.x, 1.3, cp.z, 1.1);
    if (dc < best) {
      best = dc;
      hit = { kind: 'crystal' };
    }
    if (hit) return hit;
    if (ray.intersectPlane(this.groundPlane, this.hitPoint)) {
      return { kind: 'ground', x: this.hitPoint.x, z: this.hitPoint.z };
    }
    return null;
  }

  private onLeftClick() {
    const p = this.player;
    if (!p || p.dead || !this.state) return;
    if (p.playingDead) {
      this.addLog('กำลังแกล้งตายอยู่ กด 2 เพื่อลุก', 'warn');
      return;
    }
    const hit = this.pick();
    if (!hit) return;
    p.sitting = false;
    if (hit.kind === 'monster') {
      this.setTarget({ kind: 'monster', monster: hit.monster });
      p.dest = null;
    } else if (hit.kind === 'npc') {
      this.setTarget({ kind: 'npc', npc: hit.npc });
      p.dest = null;
    } else if (hit.kind === 'crystal') {
      this.setTarget({ kind: 'crystal' });
      p.dest = null;
    } else {
      this.moveTo(hit.x, hit.z);
      this.pointer.groundHold = true;
      this.holdTimer = 0.15;
      if (this.dialog) this.closeDialog();
    }
    this.touch();
  }

  private moveTo(x: number, z: number) {
    const p = this.player;
    if (!p) return;
    const h = this.map.half;
    x = Math.max(-h, Math.min(h, x));
    z = Math.max(-h, Math.min(h, z));
    this.setTarget(null);
    p.dest = new THREE.Vector3(x, 0, z);
    this.fx.clickMarker(x, z);
  }

  private setTarget(t: PlayerTarget) {
    const p = this.player;
    if (!p) return;
    const prev = p.target;
    if (prev?.kind === 'monster') prev.monster.targeted = false;
    p.target = t;
    if (t?.kind === 'monster') t.monster.targeted = true;
  }

  // ── simulation ──────────────────────────────────────────────────────
  private update(dt: number) {
    this.fx.update(dt);
    if (this.player && this.state && this.derived) this.updatePlayer(dt);
    for (const m of this.monsters) this.updateMonster(m, dt);
    for (const n of this.npcs) n.animate(dt);
    this.crystal.crystal.rotation.y += dt * 0.8;
    this.crystal.crystal.position.y = 1.6 + Math.sin(performance.now() / 600) * 0.12;
    this.updateHover();
    this.updateCamera(dt);

    this.saveTimer += dt;
    if (this.saveTimer > 5) {
      this.saveTimer = 0;
      this.save();
    }

    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);

    if (this.dirty) {
      this.dirty = false;
      this.version++;
      for (const fn of this.listeners) fn();
    }
  }

  private updatePlayer(dt: number) {
    const p = this.player!;
    const s = this.state!;
    const d = this.derived!;

    if (!p.dead) {
      p.attackCooldown = Math.max(0, p.attackCooldown - dt);
      if (p.pendingHit >= 0) {
        p.pendingHit -= dt;
        if (p.pendingHit < 0) this.resolveSwing();
      }

      // RO-style: hold the button to keep walking toward the cursor
      if (this.pointer.left && this.pointer.groundHold && !p.playingDead) {
        this.holdTimer -= dt;
        if (this.holdTimer <= 0) {
          this.holdTimer = 0.12;
          const hit = this.pick();
          if (hit?.kind === 'ground') {
            const h = this.map.half;
            if (!p.dest) p.dest = new THREE.Vector3();
            p.dest.set(Math.max(-h, Math.min(h, hit.x)), 0, Math.max(-h, Math.min(h, hit.z)));
          }
        }
      }

      const t = p.target;
      if (p.playingDead || p.sitting) {
        p.stop();
      } else if (t?.kind === 'monster') {
        const m = t.monster;
        if (!m.alive) {
          this.setTarget(null);
          p.stop();
        } else {
          const reach = 1.15 + m.def.radius;
          const dist = Math.hypot(m.pos.x - p.pos.x, m.pos.z - p.pos.z);
          if (dist > reach) {
            p.stepToward(m.pos.x, m.pos.z, dt, reach - 0.1);
          } else {
            p.stop();
            p.face(m.pos.x, m.pos.z, dt);
            if (p.attackCooldown <= 0) {
              p.startSwing();
              p.pendingHit = 0.13;
              this.swingTarget = m;
              p.attackCooldown = d.attackDelay;
            }
          }
        }
      } else if (t?.kind === 'npc' || t?.kind === 'crystal') {
        const tp = t.kind === 'npc' ? t.npc.pos : this.crystal.root.position;
        const rem = p.stepToward(tp.x, tp.z, dt, 2.0);
        if (rem <= 2.05) {
          p.stop();
          this.setTarget(null);
          if (t.kind === 'npc') this.interactNpc(t.npc);
          else this.interactCrystal();
        }
      } else if (p.dest) {
        const rem = p.stepToward(p.dest.x, p.dest.z, dt);
        if (rem <= 0.06) p.dest = null;
      } else {
        p.stop();
      }

      // obstacles + bounds
      for (const o of this.obstacles) {
        const dx = p.pos.x - o.x;
        const dz = p.pos.z - o.z;
        const dd = Math.hypot(dx, dz);
        const min = o.r + p.radius;
        if (dd < min && dd > 0.0001) {
          p.pos.x = o.x + (dx / dd) * min;
          p.pos.z = o.z + (dz / dd) * min;
        }
      }
      const h = this.map.half;
      p.pos.x = Math.max(-h, Math.min(h, p.pos.x));
      p.pos.z = Math.max(-h, Math.min(h, p.pos.z));
      s.pos = [p.pos.x, p.pos.z];

      // regeneration
      if (!p.playingDead) {
        const rate = p.sitting ? 2 : 1;
        this.hpTimer += dt * rate;
        this.spTimer += dt * rate;
        if (this.hpTimer >= HP_REGEN_INTERVAL) {
          this.hpTimer -= HP_REGEN_INTERVAL;
          if (s.hp < d.maxHp) {
            s.hp = Math.min(d.maxHp, s.hp + hpRegenAmount(d.maxHp, s.stats.vit));
            this.touch();
          }
        }
        if (this.spTimer >= SP_REGEN_INTERVAL) {
          this.spTimer -= SP_REGEN_INTERVAL;
          if (s.sp < d.maxSp) {
            s.sp = Math.min(d.maxSp, s.sp + spRegenAmount(d.maxSp, s.stats.int));
            this.touch();
          }
        }
      }
    }
    p.animate(dt);
    p.label.setBars(s.hp / d.maxHp, s.sp / d.maxSp);
  }

  private resolveSwing() {
    const m = this.swingTarget;
    this.swingTarget = null;
    if (!m || !m.alive || !this.derived || !this.player) return;
    const res = playerAttack(this.derived, m.def);
    const at = this.headOf(m.pos, (m.def.flying ? 1.9 : m.rig.height) * m.def.scale + 0.3);
    if (res.kind === 'miss') {
      this.fx.float(at, 'Miss', 'miss');
    } else {
      m.hp -= res.damage;
      m.hitFlash = 0.15;
      this.fx.float(at, res.kind === 'crit' ? `${res.damage}!` : `${res.damage}`, res.kind === 'crit' ? 'crit' : 'dmg');
    }
    if (!m.aggro) {
      m.aggro = true;
      m.state = 'chase';
      m.attackCooldown = Math.max(m.attackCooldown, 0.5);
    }
    if (m.hp <= 0) this.killMonster(m);
  }

  private killMonster(m: Monster) {
    const s = this.state!;
    m.hp = 0;
    m.aggro = false;
    m.state = 'dying';
    m.stateTimer = 0.5;
    m.targeted = false;
    if (this.player?.target?.kind === 'monster' && this.player.target.monster === m) this.setTarget(null);

    const base = Math.round(m.def.baseExp * this.expRate);
    const job = Math.round(m.def.jobExp * this.expRate);
    const jobCapped = s.jobLevel >= jobOf(s).maxJobLevel;
    const events = gainExp(s, base, job);
    this.addLog(`ปราบ ${m.def.nameTh} — Base EXP +${base}${jobCapped ? '' : ` · Job EXP +${job}`}`, 'exp');
    this.handleProgress(events);

    for (const q of recordKill(s, m.def.id)) {
      const qd = QUESTS[q.questId];
      this.addLog(`[เควสต์] ${qd.nameTh}: ${MONSTERS[qd.kill.monster].nameTh} ${q.count}/${q.goal}`, 'quest');
      if (q.count >= q.goal) {
        const npc = this.map.npcs.find((n) => n.id === qd.npc);
        this.addLog(`[เควสต์] ครบแล้ว! กลับไปหา ${npc?.nameTh ?? 'NPC'}`, 'quest');
      }
    }
    this.refreshMarkers();
    this.touch();
  }

  private handleProgress(events: ProgressEvent[]) {
    const p = this.player;
    const s = this.state!;
    for (const e of events) {
      if (e.type === 'baseLevel') {
        this.addLog(`LEVEL UP! Base Lv ${e.level} — ได้แต้ม stat +${e.statPoints} (กด A)`, 'level');
        if (p) {
          this.fx.levelUp(p.object);
          this.fx.float(this.headOf(p.pos, 2.4), 'LEVEL UP!', 'level');
        }
      } else if (e.type === 'jobLevel') {
        this.addLog(`JOB LEVEL UP! Job Lv ${e.level} — ได้แต้มสกิล +1 (กด S)`, 'level');
        if (p) {
          this.fx.levelUp(p.object, '#8fd3ff');
          this.fx.float(this.headOf(p.pos, 2.9), 'JOB LEVEL UP!', 'level');
        }
      } else if (e.type === 'jobMaxed') {
        this.addLog(`Job Lv ${jobOf(s).maxJobLevel} สูงสุดแล้ว! ลง Basic Training ให้ครบ Lv 9 แล้วไปหาผู้ดูแลอาชีพ`, 'quest');
      }
    }
    if (events.length) {
      this.refreshDerived();
      this.save();
    }
  }

  private updateMonster(m: Monster, dt: number) {
    if (m.state === 'dead') {
      m.respawnTimer -= dt;
      if (m.respawnTimer <= 0) {
        m.hp = m.def.hp;
        m.state = 'idle';
        m.stateTimer = 1 + Math.random() * 2;
        m.aggro = false;
        m.placeRandom();
        m.object.visible = true;
      }
      return;
    }
    if (m.state === 'dying') {
      m.stateTimer -= dt;
      m.animate(dt);
      if (m.stateTimer <= 0) {
        m.state = 'dead';
        m.object.visible = false;
        m.respawnTimer = m.def.respawnSec;
        m.updateLabel();
      }
      return;
    }

    const p = this.player;
    const available = !!p && !p.dead && !p.playingDead && !!this.state;
    m.attackCooldown = Math.max(0, m.attackCooldown - dt);

    if (m.aggro && !available) {
      m.aggro = false;
      m.state = 'return';
    }
    if (!m.aggro && available && m.def.aggressive && m.state !== 'return') {
      const d = Math.hypot(p!.pos.x - m.pos.x, p!.pos.z - m.pos.z);
      if (d < m.def.aggroRange) {
        m.aggro = true;
        m.state = 'chase';
        m.attackCooldown = 0.6;
      }
    }

    if (m.aggro && p) {
      const fromHome = Math.hypot(m.pos.x - m.spawn.center[0], m.pos.z - m.spawn.center[1]);
      if (fromHome > m.spawn.radius + 14) {
        m.aggro = false;
        m.state = 'return';
      } else {
        const reach = m.def.radius + p.radius + 0.45 + (m.def.attackRange - 1.5) * 0.5;
        const d = Math.hypot(p.pos.x - m.pos.x, p.pos.z - m.pos.z);
        if (d > reach) {
          m.stepToward(p.pos.x, p.pos.z, m.def.moveSpeed * 1.15, dt, reach - 0.05);
        } else {
          m.face(p.pos.x, p.pos.z, dt);
          if (m.attackCooldown <= 0) {
            m.attackCooldown = m.def.attackDelay;
            this.monsterHitsPlayer(m);
          }
        }
      }
    } else if (m.state === 'return') {
      const rem = m.stepToward(m.spawn.center[0], m.spawn.center[1], m.def.moveSpeed * 1.4, dt, 1);
      if (rem <= 1.05) {
        m.state = 'idle';
        m.stateTimer = 1;
        m.hp = m.def.hp;
        m.setMoving(false);
      }
    } else {
      m.stateTimer -= dt;
      if (m.state !== 'wander' && m.stateTimer <= 0) {
        m.state = 'wander';
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * m.spawn.radius;
        m.wanderTo.set(m.spawn.center[0] + Math.cos(a) * r, 0, m.spawn.center[1] + Math.sin(a) * r);
        m.stateTimer = 6;
      }
      if (m.state === 'wander') {
        const rem = m.stepToward(m.wanderTo.x, m.wanderTo.z, m.def.moveSpeed * 0.6, dt, 0.1);
        if (rem <= 0.12 || m.stateTimer <= 0) {
          m.state = 'idle';
          m.stateTimer = 2 + Math.random() * 4;
          m.setMoving(false);
        }
      }
    }
    m.animate(dt);
    m.updateLabel();
  }

  private monsterHitsPlayer(m: Monster) {
    const p = this.player!;
    const s = this.state!;
    const d = this.derived!;
    const res = monsterAttack(m.def, d);
    const at = this.headOf(p.pos, 2.1);
    if (res.kind === 'miss') {
      this.fx.float(at, 'Miss', 'miss');
      return;
    }
    s.hp -= res.damage;
    this.fx.float(at, `${res.damage}`, 'hurt');
    p.sitting = false;
    if (s.hp <= 0) this.playerDies(m);
    this.touch();
  }

  private playerDies(by: Monster) {
    const p = this.player!;
    const s = this.state!;
    s.hp = 0;
    p.dead = true;
    p.sitting = false;
    p.playingDead = false;
    p.dest = null;
    this.setTarget(null);
    this.dialog = null;
    for (const m of this.monsters) if (m.aggro) m.aggro = false;
    this.addLog(`คุณหมดสติเพราะ ${by.def.nameTh}`, 'warn');
    const job = jobOf(s);
    if (job.noExpLossOnDeath) {
      this.addLog('Novice ไม่เสีย EXP เมื่อหมดสติ', 'sys');
    } else {
      s.baseExp = Math.max(0, s.baseExp - Math.floor(baseExpToNext(s.baseLevel) * 0.01));
    }
    this.save();
    this.touch();
  }

  // ── NPCs ────────────────────────────────────────────────────────────
  private interactNpc(npc: Npc) {
    const s = this.state!;
    const d = this.derived!;
    switch (npc.def.role) {
      case 'nurse': {
        if (s.hp < d.maxHp || s.sp < d.maxSp) {
          s.hp = d.maxHp;
          s.sp = d.maxSp;
          this.addLog('พยาบาลรักษาให้จน HP/SP เต็ม', 'sys');
        }
        this.dialog = this.questDialog(npc, 'learn_first_aid', ['ดูแลตัวเองด้วยนะ', 'HP น้อยเมื่อไหร่ กด 1 ใช้ปฐมพยาบาลได้เลย']);
        break;
      }
      case 'hunter': {
        if (!s.quests.learn_play_dead && s.baseLevel < 5) {
          this.dialog = {
            speaker: npc.def.nameTh,
            lines: ['เจ้ายังอ่อนนัก ป่าทางตะวันตกไม่ใช่ที่ของมือใหม่', 'กลับมาหาข้าตอน Base Lv 5'],
            options: [{ label: 'ปิด', action: 'close' }],
          };
          break;
        }
        this.dialog = this.questDialog(npc, 'learn_play_dead', ['ยังจำวิชาแกล้งตายได้ใช่ไหม', 'จวนตัวเมื่อไหร่ กด 2']);
        break;
      }
      case 'guide': {
        const bt = skillLevel(s, 'basic_training');
        const max = jobOf(s).maxJobLevel;
        this.dialog = canChangeJob(s)
          ? {
              speaker: npc.def.nameTh,
              lines: [
                'ยอดเยี่ยม! เจ้าพร้อมเปลี่ยนอาชีพแล้ว',
                'อาชีพที่ 1 ทั้ง 6 สายจะเปิดให้เลือกใน Phase 2',
                'ระหว่างนี้ลองไปท้าราชินีด้วงกรวดทางตะวันออกเฉียงเหนือดูไหม?',
              ],
              options: [{ label: 'รับทราบ', action: 'close' }],
            }
          : {
              speaker: npc.def.nameTh,
              lines: [
                'อยากเปลี่ยนอาชีพต้องผ่านเงื่อนไขนี้ก่อน',
                `• Job Lv ${max} (ตอนนี้ ${s.jobLevel})`,
                `• Basic Training Lv 9 (ตอนนี้ ${bt})`,
                'ทุก Job Lv ได้แต้มสกิล 1 แต้ม ลงที่หน้าต่างสกิล (ปุ่ม S)',
              ],
              options: [{ label: 'เข้าใจแล้ว', action: 'close' }],
            };
        break;
      }
    }
    this.refreshMarkers();
    this.touch();
  }

  private questDialog(npc: Npc, questId: string, afterLines: string[]): Dialog {
    const s = this.state!;
    const q = QUESTS[questId];
    const prog = s.quests[questId];
    const speaker = npc.def.nameTh;
    if (!prog) {
      return {
        speaker,
        lines: q.offer,
        options: [
          { label: 'รับเควสต์', action: `accept:${questId}` },
          { label: 'ไว้ก่อน', action: 'close' },
        ],
      };
    }
    if (prog.state === 'active') {
      if (questReady(s, questId)) {
        return { speaker, lines: q.done, options: [{ label: `เรียนสกิล ${SKILLS[q.rewardSkill].nameTh}`, action: `complete:${questId}` }] };
      }
      return {
        speaker,
        lines: [q.progress, `ความคืบหน้า: ${MONSTERS[q.kill.monster].nameTh} ${prog.count}/${q.kill.count}`],
        options: [{ label: 'ปิด', action: 'close' }],
      };
    }
    return { speaker, lines: afterLines, options: [{ label: 'ปิด', action: 'close' }] };
  }

  private interactCrystal() {
    const s = this.state!;
    if (skillLevel(s, 'basic_training') >= 8) {
      this.dialog = {
        speaker: 'ศิลาบันทึก',
        lines: ['ศิลาสีฟ้าส่องแสงวิบวับ...', 'บันทึกที่นี่เป็นจุดเกิดเมื่อหมดสติไหม?'],
        options: [
          { label: 'บันทึกจุดเกิด', action: 'save-point' },
          { label: 'ไม่ล่ะ', action: 'close' },
        ],
      };
    } else {
      this.dialog = {
        speaker: 'ศิลาบันทึก',
        lines: ['ศิลาสีฟ้าส่องแสงวิบวับ...', `ต้องมี Basic Training Lv 8 จึงจะบันทึกจุดเกิดได้ (ตอนนี้ ${skillLevel(s, 'basic_training')})`],
        options: [{ label: 'ปิด', action: 'close' }],
      };
    }
    this.touch();
  }

  private refreshMarkers() {
    const s = this.state;
    for (const n of this.npcs) {
      let mark = '';
      if (s) {
        if (n.def.role === 'nurse') mark = this.questMark(s, 'learn_first_aid', true);
        else if (n.def.role === 'hunter') mark = this.questMark(s, 'learn_play_dead', s.baseLevel >= 5);
        else if (n.def.role === 'guide') mark = canChangeJob(s) ? '!' : '';
      }
      n.label.setMarker(mark);
    }
    this.crystalLabel.setMarker(s && skillLevel(s, 'basic_training') >= 8 && !s.savePoint ? '!' : '');
  }

  private questMark(s: CharacterState, questId: string, available: boolean) {
    const p = s.quests[questId];
    if (!p) return available ? '!' : '';
    if (questReady(s, questId)) return '?';
    return '';
  }

  // ── view ────────────────────────────────────────────────────────────
  private updateHover() {
    let hovered: Monster | null = null;
    let cursor = '';
    if (this.pointer.inside && this.player && !this.pointer.right) {
      const hit = this.pick();
      if (hit?.kind === 'monster') {
        hovered = hit.monster;
        cursor = 'crosshair';
      } else if (hit?.kind === 'npc' || hit?.kind === 'crystal') {
        cursor = 'pointer';
      }
    }
    if (hovered !== this.hovered) {
      if (this.hovered) this.hovered.hovered = false;
      if (hovered) hovered.hovered = true;
      this.hovered = hovered;
    }
    const el = this.labels.domElement;
    if (el.style.cursor !== cursor) el.style.cursor = cursor;
  }

  private updateCamera(dt: number) {
    if (this.keys.has('ArrowLeft')) this.yaw += dt * 1.8;
    if (this.keys.has('ArrowRight')) this.yaw -= dt * 1.8;
    if (this.keys.has('ArrowUp')) this.dist = Math.max(11, this.dist - dt * 14);
    if (this.keys.has('ArrowDown')) this.dist = Math.min(38, this.dist + dt * 14);

    if (this.player) {
      const target = this.player.pos;
      this.camTarget.x += (target.x - this.camTarget.x) * Math.min(1, dt * 8);
      this.camTarget.z += (target.z - this.camTarget.z) * Math.min(1, dt * 8);
    } else {
      // gentle orbit over the village while creating a character
      this.yaw += dt * 0.06;
    }
    const cp = Math.cos(this.pitch);
    this.camera.position.set(
      this.camTarget.x + Math.sin(this.yaw) * cp * this.dist,
      this.camTarget.y + Math.sin(this.pitch) * this.dist,
      this.camTarget.z + Math.cos(this.yaw) * cp * this.dist,
    );
    this.camera.lookAt(this.camTarget);

    this.sun.position.set(this.camTarget.x + 14, 26, this.camTarget.z + 10);
    this.sun.target.position.copy(this.camTarget);
  }

  private headOf(pos: THREE.Vector3, h: number) {
    return new THREE.Vector3(pos.x, h, pos.z);
  }
}
