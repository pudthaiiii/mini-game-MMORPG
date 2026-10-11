import type { QuestDef } from '../types';

export const QUESTS: Record<string, QuestDef> = {
  learn_first_aid: {
    id: 'learn_first_aid',
    npc: 'nurse',
    nameTh: 'บทเรียนปฐมพยาบาล',
    kill: { monster: 'mossball', count: 5 },
    rewardSkill: 'first_aid',
    offer: [
      'มือใหม่ล้มบ่อยนะ ฉันสอนปฐมพยาบาลให้ได้',
      'แต่ต้องพิสูจน์ก่อนว่าจับดาบเป็น ไปปราบ ม็อสบอล ทางเหนือมา 5 ตัว',
    ],
    progress: 'ม็อสบอลอยู่ทุ่งหญ้าทางเหนือของหมู่บ้าน',
    done: ['เก่งมาก! นี่คือวิธีปฐมพยาบาล', 'ใช้ 3 SP ฟื้น HP ได้นิดหน่อย กดปุ่ม 1 ได้เลย'],
  },
  learn_play_dead: {
    id: 'learn_play_dead',
    npc: 'hunter',
    nameTh: 'ศิลปะการแกล้งตาย',
    kill: { monster: 'leaf_gecko', count: 3 },
    rewardSkill: 'play_dead',
    offer: [
      'จิ้งจกใบไม้ในป่าทางตะวันตกมันตีก่อนนะ ระวังให้ดี',
      'ปราบมา 3 ตัว แล้วข้าจะสอนวิชาเอาตัวรอดให้',
    ],
    progress: 'ป่าทางตะวันตกเฉียงใต้ จิ้งจกใบไม้จะวิ่งเข้าหาเองถ้าเข้าใกล้',
    done: ['รอดกลับมาได้ ใช้ได้!', 'เวลาจวนตัวให้แกล้งตาย มอนจะเลิกสนใจเจ้า กดปุ่ม 2'],
  },
};
