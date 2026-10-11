import type { JobDef } from '../types';

export const JOBS: Record<string, JobDef> = {
  novice: {
    id: 'novice',
    name: 'Novice',
    nameTh: 'Novice',
    maxJobLevel: 10,
    hpFactor: 5,
    spFactor: 1,
    baseAspd: 150,
    noExpLossOnDeath: true,
    // Job Lv 1→10 yields exactly 9 skill points = Basic Training Lv 9
    jobChange: { skill: 'basic_training', level: 9, jobLevel: 10 },
  },
};
