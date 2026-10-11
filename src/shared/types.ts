// Pure game types — no DOM, no Three.js.
// Everything under src/shared is meant to move into a shared package in Phase 1
// so the client and the authoritative server run the exact same rules.

export type StatKey = 'str' | 'agi' | 'vit' | 'int' | 'dex' | 'luk';
export const STAT_KEYS: StatKey[] = ['str', 'agi', 'vit', 'int', 'dex', 'luk'];
export type Stats = Record<StatKey, number>;

export const STAT_LABEL: Record<StatKey, string> = {
  str: 'STR',
  agi: 'AGI',
  vit: 'VIT',
  int: 'INT',
  dex: 'DEX',
  luk: 'LUK',
};

export const STAT_HINT: Record<StatKey, string> = {
  str: 'พลังโจมตีระยะใกล้',
  agi: 'หลบหลีก (FLEE) และความเร็วตี',
  vit: 'HP สูงสุด ลดดาเมจ ฟื้น HP',
  int: 'SP สูงสุด ฟื้น SP',
  dex: 'ความแม่นยำ (HIT) และความเร็วตีเล็กน้อย',
  luk: 'โอกาสคริติคอล',
};

export interface JobDef {
  id: string;
  name: string;
  nameTh: string;
  maxJobLevel: number;
  hpFactor: number;
  spFactor: number;
  /** ASPD before AGI/DEX bonuses, with the job's starter weapon */
  baseAspd: number;
  noExpLossOnDeath: boolean;
  jobChange: { skill: string; level: number; jobLevel: number };
}

export interface SkillLevelUnlock {
  level: number;
  label: string;
  /** which phase actually makes this unlock usable; 0 = playable now */
  phase: number;
}

export interface SkillDef {
  id: string;
  nameTh: string;
  maxLevel: number;
  source: 'points' | 'quest';
  spCost: number;
  description: string;
  unlocks?: SkillLevelUnlock[];
}

export interface MonsterDef {
  id: string;
  nameTh: string;
  name: string;
  level: number;
  hp: number;
  atk: [number, number];
  /** hard DEF in percent */
  def: number;
  softDef: number;
  hit: number;
  flee: number;
  /** seconds between attacks */
  attackDelay: number;
  attackRange: number;
  moveSpeed: number;
  aggressive: boolean;
  aggroRange: number;
  baseExp: number;
  jobExp: number;
  respawnSec: number;
  boss?: boolean;
  flying?: boolean;
  /** model scale multiplier */
  scale: number;
  /** collision / click radius in world units */
  radius: number;
  lesson: string;
}

export interface ItemDef {
  id: string;
  nameTh: string;
  slot: 'weapon' | 'armor';
  atk?: number;
  def?: number;
}

export interface QuestDef {
  id: string;
  npc: string;
  nameTh: string;
  kill: { monster: string; count: number };
  rewardSkill: string;
  offer: string[];
  progress: string;
  done: string[];
}

export interface QuestProgress {
  state: 'active' | 'done';
  count: number;
}

export interface CharacterState {
  version: 1;
  name: string;
  jobId: string;
  baseLevel: number;
  jobLevel: number;
  baseExp: number;
  jobExp: number;
  stats: Stats;
  statPoints: number;
  skillPoints: number;
  skills: Record<string, number>;
  hp: number;
  sp: number;
  weapon: string;
  armor: string;
  quests: Record<string, QuestProgress>;
  savePoint: [number, number] | null;
  pos: [number, number];
}

export interface Derived {
  atk: number;
  hit: number;
  flee: number;
  crit: number;
  aspd: number;
  attacksPerSec: number;
  attackDelay: number;
  maxHp: number;
  maxSp: number;
  def: number;
  softDef: number;
}

export type ProgressEvent =
  | { type: 'baseLevel'; level: number; statPoints: number }
  | { type: 'jobLevel'; level: number }
  | { type: 'jobMaxed' };

export type AttackResult =
  | { kind: 'miss'; damage: 0 }
  | { kind: 'hit'; damage: number }
  | { kind: 'crit'; damage: number };
