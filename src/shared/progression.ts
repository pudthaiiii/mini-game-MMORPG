import { JOBS } from './data/jobs';
import { QUESTS } from './data/quests';
import { SKILLS } from './data/skills';
import {
  baseExpToNext,
  CREATION_POINTS,
  CREATION_STAT_CAP,
  deriveFor,
  jobExpToNext,
  MAX_BASE_LEVEL,
  MAX_STAT,
  statCost,
  statPointsForLevel,
} from './formulas';
import { STAT_KEYS, type CharacterState, type ProgressEvent, type StatKey, type Stats } from './types';

export function jobOf(c: CharacterState) {
  return JOBS[c.jobId];
}

export function validateCreation(stats: Stats): string | null {
  let spent = 0;
  for (const k of STAT_KEYS) {
    const v = stats[k];
    if (!Number.isInteger(v) || v < 1 || v > CREATION_STAT_CAP) return `${k} ต้องอยู่ระหว่าง 1–${CREATION_STAT_CAP}`;
    spent += v - 1;
  }
  if (spent !== CREATION_POINTS) return `ต้องลงแต้มให้ครบ ${CREATION_POINTS} แต้ม`;
  return null;
}

export function newCharacter(name: string, stats: Stats, spawn: [number, number]): CharacterState {
  const c: CharacterState = {
    version: 1,
    name: name.trim().slice(0, 16) || 'Novice',
    jobId: 'novice',
    baseLevel: 1,
    jobLevel: 1,
    baseExp: 0,
    jobExp: 0,
    stats: { ...stats },
    statPoints: 0,
    skillPoints: 0,
    skills: { basic_training: 0, storm_gust: 1, meteor_storm: 1 },
    hp: 1,
    sp: 1,
    weapon: 'training_knife',
    armor: 'cotton_shirt',
    quests: {},
    savePoint: null,
    pos: [...spawn],
  };
  const d = deriveFor(c, jobOf(c));
  c.hp = d.maxHp;
  c.sp = d.maxSp;
  return c;
}

/** Adds experience and resolves any level-ups. Mutates `c`. */
export function gainExp(c: CharacterState, base: number, job: number): ProgressEvent[] {
  const events: ProgressEvent[] = [];
  const jobDef = jobOf(c);

  if (c.baseLevel < MAX_BASE_LEVEL) {
    c.baseExp += base;
    while (c.baseLevel < MAX_BASE_LEVEL && c.baseExp >= baseExpToNext(c.baseLevel)) {
      c.baseExp -= baseExpToNext(c.baseLevel);
      c.baseLevel += 1;
      const pts = statPointsForLevel(c.baseLevel);
      c.statPoints += pts;
      events.push({ type: 'baseLevel', level: c.baseLevel, statPoints: pts });
    }
    if (c.baseLevel >= MAX_BASE_LEVEL) c.baseExp = 0;
  }

  if (c.jobLevel < jobDef.maxJobLevel) {
    c.jobExp += job;
    while (c.jobLevel < jobDef.maxJobLevel && c.jobExp >= jobExpToNext(c.jobLevel)) {
      c.jobExp -= jobExpToNext(c.jobLevel);
      c.jobLevel += 1;
      c.skillPoints += 1;
      events.push({ type: 'jobLevel', level: c.jobLevel });
    }
    if (c.jobLevel >= jobDef.maxJobLevel) {
      c.jobExp = 0;
      events.push({ type: 'jobMaxed' });
    }
  }

  if (events.some((e) => e.type === 'baseLevel')) {
    // level-up restores HP/SP, like the classic games
    const d = deriveFor(c, jobDef);
    c.hp = d.maxHp;
    c.sp = d.maxSp;
  }
  return events;
}

export function canRaiseStat(c: CharacterState, key: StatKey) {
  const v = c.stats[key];
  return v < MAX_STAT && c.statPoints >= statCost(v);
}

export function raiseStat(c: CharacterState, key: StatKey): boolean {
  if (!canRaiseStat(c, key)) return false;
  c.statPoints -= statCost(c.stats[key]);
  c.stats[key] += 1;
  return true;
}

export function canRaiseSkill(c: CharacterState, id: string) {
  const def = SKILLS[id];
  if (!def || def.source !== 'points') return false;
  return c.skillPoints > 0 && (c.skills[id] ?? 0) < def.maxLevel;
}

export function raiseSkill(c: CharacterState, id: string): boolean {
  if (!canRaiseSkill(c, id)) return false;
  c.skillPoints -= 1;
  c.skills[id] = (c.skills[id] ?? 0) + 1;
  return true;
}

export function skillLevel(c: CharacterState, id: string) {
  return c.skills[id] ?? 0;
}

export function canChangeJob(c: CharacterState) {
  const rule = jobOf(c).jobChange;
  return c.jobLevel >= rule.jobLevel && skillLevel(c, rule.skill) >= rule.level;
}

// ── Quests ────────────────────────────────────────────────────────────
export function acceptQuest(c: CharacterState, questId: string) {
  if (c.quests[questId]) return false;
  c.quests[questId] = { state: 'active', count: 0 };
  return true;
}

/** Returns quests whose counter moved, with the new count. */
export function recordKill(c: CharacterState, monsterId: string) {
  const moved: { questId: string; count: number; goal: number }[] = [];
  for (const [questId, prog] of Object.entries(c.quests)) {
    const q = QUESTS[questId];
    if (!q || prog.state !== 'active' || q.kill.monster !== monsterId) continue;
    if (prog.count >= q.kill.count) continue;
    prog.count += 1;
    moved.push({ questId, count: prog.count, goal: q.kill.count });
  }
  return moved;
}

export function questReady(c: CharacterState, questId: string) {
  const q = QUESTS[questId];
  const p = c.quests[questId];
  return !!q && !!p && p.state === 'active' && p.count >= q.kill.count;
}

export function completeQuest(c: CharacterState, questId: string) {
  if (!questReady(c, questId)) return false;
  const q = QUESTS[questId];
  c.quests[questId].state = 'done';
  c.skills[q.rewardSkill] = 1;
  return true;
}
