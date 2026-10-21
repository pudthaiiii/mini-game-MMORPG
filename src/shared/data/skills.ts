import type { SkillDef } from '../types';

export const SKILLS: Record<string, SkillDef> = {
  basic_training: {
    id: 'basic_training',
    nameTh: 'Basic Training',
    maxLevel: 9,
    source: 'points',
    spCost: 0,
    description: 'ทักษะพื้นฐานของนักผจญภัย ปลดล็อกฟีเจอร์ทีละขั้น',
    unlocks: [
      { level: 1, label: 'แลกของ', phase: 1 },
      { level: 2, label: 'อีโมต', phase: 0 },
      { level: 3, label: 'นั่งพัก (ฟื้น HP/SP เร็วขึ้น 2 เท่า)', phase: 0 },
      { level: 4, label: 'ห้องแชท', phase: 1 },
      { level: 5, label: 'เข้าปาร์ตี้', phase: 3 },
      { level: 6, label: 'ใช้คลัง', phase: 2 },
      { level: 7, label: 'สร้างปาร์ตี้', phase: 3 },
      { level: 8, label: 'ตั้งจุดเกิด (ที่ศิลาบันทึก)', phase: 0 },
      { level: 9, label: 'เปลี่ยนอาชีพได้', phase: 0 },
    ],
  },
  first_aid: {
    id: 'first_aid',
    nameTh: 'ปฐมพยาบาล',
    maxLevel: 1,
    source: 'quest',
    spCost: 3,
    description: 'ฟื้น HP 5 หน่วย ใช้ 3 SP',
  },
  play_dead: {
    id: 'play_dead',
    nameTh: 'แกล้งตาย',
    maxLevel: 1,
    source: 'quest',
    spCost: 5,
    description: 'นอนนิ่ง มอนสเตอร์เลิกไล่ตาม แต่เดินและโจมตีไม่ได้ กดซ้ำเพื่อลุก',
  },
  storm_gust: {
    id: 'storm_gust',
    nameTh: 'Storm Gust',
    maxLevel: 5,
    source: 'points',
    spCost: 9,
    cooldown: 6,
    castTime: 0.8,
    description: 'พายุน้ำแข็งเป็นวงกว้างรอบเป้าหมาย ตีหลายจังหวะ แช่แข็งมอนที่โดนชั่วครู่',
  },
  meteor_storm: {
    id: 'meteor_storm',
    nameTh: 'Meteor Storm',
    maxLevel: 5,
    source: 'points',
    spCost: 12,
    cooldown: 10,
    castTime: 1.2,
    description: 'เรียกอุกกาบาตตกใส่พื้นที่เป้าหมายหลายลูกติดกัน ดาเมจเวทย์ธาตุไฟ',
  },
};

export const FIRST_AID_HEAL = 5;
