export interface SpawnDef {
  monster: string;
  count: number;
  center: [number, number];
  radius: number;
}

export interface NpcDef {
  id: string;
  nameTh: string;
  role: 'nurse' | 'hunter' | 'guide';
  pos: [number, number];
  facing: number;
}

export interface MapDef {
  id: string;
  nameTh: string;
  half: number;
  playerSpawn: [number, number];
  town: { center: [number, number]; radius: number };
  spawns: SpawnDef[];
  npcs: NpcDef[];
  saveCrystal: [number, number];
  /** decorative zones, used by the world builder */
  zones: { kind: 'meadow' | 'rocks' | 'flowers' | 'woods' | 'clearing'; center: [number, number]; radius: number }[];
}

// -z is "north" (away from the default camera)
export const TRAINING_FIELD: MapDef = {
  id: 'training_field',
  nameTh: 'ทุ่งฝึกหัด',
  half: 56,
  playerSpawn: [0, 10],
  town: { center: [0, 10], radius: 9 },
  spawns: [
    { monster: 'mossball', count: 12, center: [0, -10], radius: 11 },
    { monster: 'pebble_beetle', count: 8, center: [28, 4], radius: 10 },
    { monster: 'dust_moth', count: 8, center: [-4, -36], radius: 12 },
    { monster: 'leaf_gecko', count: 6, center: [-30, 22], radius: 10 },
    { monster: 'pebble_queen', count: 1, center: [40, -32], radius: 4 },
  ],
  npcs: [
    { id: 'nurse', nameTh: 'พยาบาลประจำหมู่บ้าน', role: 'nurse', pos: [-4, 6], facing: 0.4 },
    { id: 'hunter', nameTh: 'พรานเฒ่า', role: 'hunter', pos: [-6, 13], facing: 1.2 },
    { id: 'guide', nameTh: 'ผู้ดูแลอาชีพ', role: 'guide', pos: [5, 7], facing: -0.4 },
  ],
  saveCrystal: [32, -24],
  zones: [
    { kind: 'meadow', center: [0, -10], radius: 13 },
    { kind: 'rocks', center: [28, 4], radius: 12 },
    { kind: 'flowers', center: [-4, -36], radius: 14 },
    { kind: 'woods', center: [-30, 22], radius: 14 },
    { kind: 'clearing', center: [40, -32], radius: 8 },
  ],
};
