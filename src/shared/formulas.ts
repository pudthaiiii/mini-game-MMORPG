import type { AttackResult, CharacterState, Derived, JobDef, MonsterDef, Stats } from './types';
import { ITEMS } from './data/items';

// ── Character creation ────────────────────────────────────────────────
export const CREATION_POINTS = 45;
/** each stat can go from 1 up to this value on the creation screen */
export const CREATION_STAT_CAP = 10;
export const MAX_STAT = 99;
export const MAX_BASE_LEVEL = 99;

// ── Stat points ───────────────────────────────────────────────────────
/** status points gained on reaching `level` */
export function statPointsForLevel(level: number) {
  return Math.floor(level / 5) + 3;
}

/** cost to raise a stat by one from its current value */
export function statCost(current: number) {
  return Math.floor((current - 1) / 10) + 2;
}

// ── Experience ────────────────────────────────────────────────────────
export function baseExpToNext(level: number) {
  return Math.round(8 + 6 * Math.pow(level, 2.1));
}

export function jobExpToNext(jobLevel: number) {
  return Math.round(10 + 8 * Math.pow(jobLevel, 1.8));
}

// ── Derived stats ─────────────────────────────────────────────────────
export function deriveStats(stats: Stats, baseLevel: number, job: JobDef, weaponAtk: number, armorDef: number): Derived {
  const { str, agi, vit, int, dex, luk } = stats;
  const atk = str + Math.floor(str / 10) ** 2 + Math.floor(dex / 5) + Math.floor(luk / 5) + weaponAtk;
  const matk = int + Math.floor(int / 7) ** 2 + Math.floor(dex / 10) + Math.floor(luk / 10);
  const hit = baseLevel + dex;
  const flee = baseLevel + agi;
  const crit = round1(1 + luk * 0.3);
  const aspd = round1(Math.min(190, job.baseAspd + agi * 0.4 + dex * 0.1));
  const attacksPerSec = 50 / (200 - aspd);
  const maxHp = Math.floor((35 + baseLevel * job.hpFactor) * (1 + vit / 100));
  const maxSp = Math.floor((10 + baseLevel * job.spFactor) * (1 + int / 100));
  return {
    atk,
    matk,
    hit,
    flee,
    crit,
    aspd,
    attacksPerSec,
    attackDelay: 1 / attacksPerSec,
    maxHp,
    maxSp,
    def: armorDef,
    softDef: Math.floor(vit / 2),
  };
}

export function deriveFor(c: CharacterState, job: JobDef): Derived {
  const weaponAtk = ITEMS[c.weapon]?.atk ?? 0;
  const armorDef = ITEMS[c.armor]?.def ?? 0;
  return deriveStats(c.stats, c.baseLevel, job, weaponAtk, armorDef);
}

// ── Combat ────────────────────────────────────────────────────────────
export function hitChance(hit: number, flee: number) {
  return clamp(80 + hit - flee, 5, 95);
}

export type Rng = () => number;

export function playerAttack(d: Derived, m: MonsterDef, rng: Rng = Math.random): AttackResult {
  // a critical always lands and ignores DEF
  if (rng() * 100 < d.crit) {
    return { kind: 'crit', damage: Math.max(1, Math.floor(d.atk * 1.4)) };
  }
  if (rng() * 100 >= hitChance(d.hit, m.flee)) return { kind: 'miss', damage: 0 };
  const variance = 0.9 + rng() * 0.2;
  const raw = d.atk * variance * ((100 - m.def) / 100) - m.softDef;
  return { kind: 'hit', damage: Math.max(1, Math.floor(raw)) };
}

export function monsterAttack(m: MonsterDef, d: Derived, rng: Rng = Math.random): AttackResult {
  if (rng() * 100 >= hitChance(m.hit, d.flee)) return { kind: 'miss', damage: 0 };
  const base = m.atk[0] + rng() * (m.atk[1] - m.atk[0]);
  const raw = base * ((100 - d.def) / 100) - d.softDef;
  return { kind: 'hit', damage: Math.max(1, Math.floor(raw)) };
}

/** AoE spell damage (Storm Gust / Meteor Storm): always lands, DEF still mitigates it. */
export function magicAttack(matk: number, power: number, m: MonsterDef, rng: Rng = Math.random): AttackResult {
  const variance = 0.85 + rng() * 0.3;
  const raw = matk * power * variance * ((100 - m.def) / 100) - m.softDef * 0.5;
  return { kind: 'hit', damage: Math.max(1, Math.floor(raw)) };
}

// ── Regeneration ──────────────────────────────────────────────────────
export const HP_REGEN_INTERVAL = 6;
export const SP_REGEN_INTERVAL = 8;

export function hpRegenAmount(maxHp: number, vit: number) {
  return Math.max(1, Math.floor(maxHp / 200)) + Math.floor(vit / 5);
}

export function spRegenAmount(maxSp: number, int: number) {
  return 1 + Math.floor(maxSp / 100) + Math.floor(int / 6);
}

// ── utils ─────────────────────────────────────────────────────────────
export function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function round1(v: number) {
  return Math.round(v * 10) / 10;
}
