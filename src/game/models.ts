import * as THREE from 'three';

// Procedural low-poly models built from primitives.
// Swap any of these for glTF models from Blender later — entities only need
// the rig parts (root, hips, armR, …) to drive simple animations.

const matCache = new Map<string, THREE.MeshStandardMaterial>();

export function mat(color: string, opts: { emissive?: string; emissiveIntensity?: number; opacity?: number } = {}) {
  const key = `${color}|${opts.emissive ?? ''}|${opts.emissiveIntensity ?? ''}|${opts.opacity ?? ''}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      flatShading: true,
      roughness: 0.85,
      metalness: 0,
      emissive: opts.emissive ?? '#000000',
      emissiveIntensity: opts.emissiveIntensity ?? 1,
      transparent: opts.opacity !== undefined,
      opacity: opts.opacity ?? 1,
      side: opts.opacity !== undefined ? THREE.DoubleSide : THREE.FrontSide,
    });
    matCache.set(key, m);
  }
  return m;
}

function mesh(geo: THREE.BufferGeometry, color: string, cast = true) {
  const m = new THREE.Mesh(geo, mat(color));
  m.castShadow = cast;
  m.receiveShadow = false;
  return m;
}

// ── Humans (player + NPCs) ────────────────────────────────────────────

export interface HumanLook {
  skin: string;
  hair: string;
  shirt: string;
  pants: string;
  shoes: string;
  hat?: 'none' | 'nurse' | 'wide' | 'pointed';
  hatColor?: string;
  /** cone color for a 'pointed' hat, if different from the brim */
  hatColor2?: string;
  cape?: string;
  robe?: boolean;
  weapon?: 'knife' | 'staff' | 'none';
}

export interface HumanRig {
  root: THREE.Group;
  pose: THREE.Group;
  hips: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  height: number;
}

export function makeHuman(look: HumanLook): HumanRig {
  const root = new THREE.Group();
  const pose = new THREE.Group();
  root.add(pose);
  const hips = new THREE.Group();
  hips.position.y = 0.46;
  pose.add(hips);

  // torso
  const torsoGeo = look.robe ? new THREE.CylinderGeometry(0.24, 0.42, 0.62, 8) : new THREE.CylinderGeometry(0.24, 0.3, 0.5, 8);
  const torso = mesh(torsoGeo, look.shirt);
  torso.position.y = look.robe ? 0.19 : 0.25;
  hips.add(torso);
  const belt = mesh(new THREE.CylinderGeometry(0.305, 0.305, 0.07, 8), look.pants);
  belt.position.y = 0.04;
  if (!look.robe) hips.add(belt);

  if (look.cape) {
    const cape = mesh(new THREE.CylinderGeometry(0.3, 0.42, 0.62, 8, 1, true, Math.PI * 0.6, Math.PI * 0.8), look.cape);
    cape.material = mat(look.cape);
    (cape.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    cape.position.set(0, 0.2, -0.02);
    hips.add(cape);
  }

  // head
  const head = new THREE.Group();
  head.position.y = 0.86;
  hips.add(head);
  const skull = mesh(new THREE.IcosahedronGeometry(0.42, 1), look.skin);
  head.add(skull);
  const hairGeo = new THREE.SphereGeometry(0.45, 10, 7, 0, Math.PI * 2, 0, Math.PI * 0.56);
  const hair = mesh(hairGeo, look.hair);
  hair.rotation.x = -0.35;
  hair.position.y = 0.03;
  head.add(hair);
  const fringe = mesh(new THREE.BoxGeometry(0.62, 0.14, 0.12), look.hair);
  fringe.position.set(0, 0.24, 0.32);
  fringe.rotation.x = 0.35;
  head.add(fringe);
  for (const sx of [-1, 1]) {
    const eye = mesh(new THREE.BoxGeometry(0.07, 0.13, 0.04), '#2a1f1a', false);
    eye.position.set(sx * 0.14, 0.0, 0.39);
    head.add(eye);
    const blush = mesh(new THREE.BoxGeometry(0.09, 0.04, 0.02), '#f0a3a0', false);
    blush.position.set(sx * 0.24, -0.1, 0.35);
    head.add(blush);
  }

  if (look.hat === 'nurse') {
    const cap = mesh(new THREE.BoxGeometry(0.42, 0.16, 0.26), look.hatColor ?? '#ffffff');
    cap.position.set(0, 0.42, 0.06);
    cap.rotation.x = -0.2;
    head.add(cap);
  } else if (look.hat === 'wide') {
    const brim = mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.05, 12), look.hatColor ?? '#6b4a2b');
    brim.position.y = 0.3;
    head.add(brim);
    const crown = mesh(new THREE.CylinderGeometry(0.3, 0.38, 0.32, 10), look.hatColor ?? '#6b4a2b');
    crown.position.y = 0.46;
    head.add(crown);
  } else if (look.hat === 'pointed') {
    const brim = mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.05, 12), look.hatColor ?? '#2f4a8a');
    brim.position.y = 0.3;
    head.add(brim);
    const cone = mesh(new THREE.ConeGeometry(0.36, 0.75, 10), look.hatColor2 ?? look.hatColor ?? '#2f4a8a');
    cone.position.set(0, 0.68, -0.05);
    cone.rotation.x = -0.25;
    head.add(cone);
    const tip = mesh(new THREE.IcosahedronGeometry(0.08, 0), look.hatColor ?? '#2f4a8a');
    tip.position.set(0, 1.0, -0.2);
    head.add(tip);
  }

  // arms (pivot at shoulder)
  const makeArm = (side: number) => {
    const g = new THREE.Group();
    g.position.set(side * 0.34, 0.44, 0);
    const arm = mesh(new THREE.CapsuleGeometry(0.075, 0.24, 3, 6), look.shirt);
    arm.position.y = -0.18;
    g.add(arm);
    const hand = mesh(new THREE.IcosahedronGeometry(0.085, 0), look.skin);
    hand.position.y = -0.38;
    g.add(hand);
    hips.add(g);
    return g;
  };
  const armL = makeArm(-1);
  const armR = makeArm(1);

  if (look.weapon === 'knife') {
    const knife = new THREE.Group();
    knife.position.set(0, -0.4, 0.04);
    knife.rotation.x = Math.PI / 2;
    const handle = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.14, 6), '#6b4426');
    knife.add(handle);
    const guard = mesh(new THREE.BoxGeometry(0.14, 0.03, 0.05), '#8a8f99');
    guard.position.y = 0.08;
    knife.add(guard);
    const blade = mesh(new THREE.BoxGeometry(0.06, 0.32, 0.02), '#d9dee6');
    blade.position.y = 0.25;
    knife.add(blade);
    armR.add(knife);
  } else if (look.weapon === 'staff') {
    const staff = new THREE.Group();
    staff.position.set(0, -0.4, 0.05);
    const pole = mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.5, 6), '#7a5532');
    pole.position.y = 0.35;
    staff.add(pole);
    const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 1), mat('#9fe7ff', { emissive: '#4fc3ff', emissiveIntensity: 0.8 }));
    orb.position.y = 1.12;
    staff.add(orb);
    armR.add(staff);
  }

  // legs (pivot at hip)
  const makeLeg = (side: number) => {
    const g = new THREE.Group();
    g.position.set(side * 0.13, 0.02, 0);
    const leg = mesh(new THREE.CapsuleGeometry(0.09, 0.2, 3, 6), look.pants);
    leg.position.y = -0.2;
    g.add(leg);
    const foot = mesh(new THREE.BoxGeometry(0.16, 0.1, 0.24), look.shoes);
    foot.position.set(0, -0.4, 0.04);
    g.add(foot);
    hips.add(g);
    return g;
  };
  const legL = makeLeg(-1);
  const legR = makeLeg(1);
  if (look.robe) {
    legL.visible = true;
    legR.visible = true;
  }

  return { root, pose, hips, head, armL, armR, legL, legR, height: 1.75 };
}

export const NOVICE_LOOK: HumanLook = {
  skin: '#ffe3cf',
  hair: '#f6dd9e',
  shirt: '#fbf4e8',
  pants: '#bcdcf2',
  shoes: '#8fb9dd',
  hat: 'pointed',
  hatColor: '#fbf4e8',
  hatColor2: '#6fa8d8',
  cape: '#cfe6f7',
  robe: true,
  weapon: 'staff',
};

export const NPC_LOOKS: Record<'nurse' | 'hunter' | 'guide', HumanLook> = {
  nurse: { skin: '#f3d2b3', hair: '#7a4a2e', shirt: '#f4dbe6', pants: '#ffffff', shoes: '#e9e9e9', hat: 'nurse', hatColor: '#ffffff', weapon: 'none' },
  hunter: { skin: '#d9a77f', hair: '#9a9a9a', shirt: '#6e5236', pants: '#4b3b2a', shoes: '#2e241a', hat: 'wide', hatColor: '#5b4025', cape: '#3e5a35', weapon: 'none' },
  guide: { skin: '#f0cfae', hair: '#c9c2b8', shirt: '#33508f', pants: '#2a3e6e', shoes: '#22304f', hat: 'pointed', hatColor: '#2a3e6e', robe: true, weapon: 'staff' },
};

// ── Monsters ──────────────────────────────────────────────────────────

export interface MonsterRig {
  root: THREE.Group;
  body: THREE.Group;
  parts: Record<string, THREE.Object3D>;
  height: number;
}

function jitter(geo: THREE.BufferGeometry, amount: number, seed: number) {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  // deterministic noise keyed by rounded vertex position so shared verts stay welded
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const h = Math.sin(v.x * 12.9898 + v.y * 78.233 + v.z * 37.719 + seed) * 43758.5453;
    const n = (h - Math.floor(h) - 0.5) * 2 * amount;
    v.multiplyScalar(1 + n);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

function eyes(parent: THREE.Object3D, y: number, z: number, spread: number, size: number, color = '#1d1a18', white = false) {
  for (const sx of [-1, 1]) {
    if (white) {
      const w = mesh(new THREE.IcosahedronGeometry(size * 1.7, 1), '#fbfbf2', false);
      w.position.set(sx * spread, y, z - size * 0.5);
      parent.add(w);
    }
    const e = mesh(new THREE.IcosahedronGeometry(size, 0), color, false);
    e.position.set(sx * spread, y, z + (white ? size * 0.6 : 0));
    parent.add(e);
  }
}

export function makeMossball(): MonsterRig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const ball = mesh(jitter(new THREE.IcosahedronGeometry(0.55, 1), 0.08, 3), '#79b84a');
  ball.position.y = 0.55;
  body.add(ball);
  const spots: [number, number, number][] = [
    [0.3, 0.75, 0.3],
    [-0.35, 0.45, 0.32],
    [0.1, 0.95, -0.3],
    [-0.2, 0.7, -0.42],
    [0.42, 0.4, -0.2],
  ];
  for (const [x, y, z] of spots) {
    const s = mesh(new THREE.IcosahedronGeometry(0.13, 0), '#3f7a2c');
    s.position.set(x, y, z);
    body.add(s);
    s.material = mat('#4e8a33');
  }
  const stem = mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.22, 5), '#6b8f2f');
  stem.position.y = 1.18;
  body.add(stem);
  for (const sx of [-1, 1]) {
    const leaf = mesh(new THREE.SphereGeometry(0.16, 6, 4), '#9ad35a');
    leaf.scale.set(1, 0.22, 0.55);
    leaf.position.set(sx * 0.14, 1.3, 0);
    leaf.rotation.z = sx * 0.5;
    body.add(leaf);
  }
  eyes(body, 0.66, 0.5, 0.19, 0.075, '#1d1a18', true);
  return { root, body, parts: { ball }, height: 1.4 };
}

export function makeBeetle(queen = false): MonsterRig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const shellColor = queen ? '#7d6a8c' : '#8a8073';
  const shell = mesh(jitter(new THREE.IcosahedronGeometry(0.5, 1), 0.06, 7), shellColor);
  shell.scale.set(1.25, 0.8, 1.55);
  shell.position.y = 0.48;
  body.add(shell);
  const ridge = mesh(new THREE.BoxGeometry(0.06, 0.06, 1.4), queen ? '#4f3f5c' : '#5c544a');
  ridge.position.set(0, 0.86, 0);
  body.add(ridge);
  const pebbles: [number, number, number][] = [
    [0.3, 0.78, 0.25],
    [-0.32, 0.74, -0.15],
    [0.2, 0.7, -0.45],
  ];
  for (const [x, y, z] of pebbles) {
    const p = mesh(new THREE.DodecahedronGeometry(0.12, 0), queen ? '#a493b4' : '#b3aa9c');
    p.position.set(x, y, z);
    body.add(p);
  }
  const head = new THREE.Group();
  head.position.set(0, 0.42, 0.78);
  body.add(head);
  const skull = mesh(new THREE.IcosahedronGeometry(0.26, 0), queen ? '#3d2f48' : '#4a4038');
  head.add(skull);
  for (const sx of [-1, 1]) {
    const mand = mesh(new THREE.ConeGeometry(0.05, 0.22, 4), '#2b2520');
    mand.position.set(sx * 0.1, -0.08, 0.22);
    mand.rotation.x = Math.PI / 2;
    mand.rotation.z = sx * 0.4;
    head.add(mand);
    const ant = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.4, 4), '#2b2520');
    ant.position.set(sx * 0.1, 0.25, 0.12);
    ant.rotation.x = 0.6;
    ant.rotation.z = -sx * 0.3;
    head.add(ant);
  }
  eyes(head, 0.06, 0.2, 0.12, 0.05, '#f2e7c9');
  const legs: THREE.Object3D[] = [];
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const leg = new THREE.Group();
      leg.position.set(sx * 0.48, 0.3, -0.35 + i * 0.4);
      const seg = mesh(new THREE.CylinderGeometry(0.03, 0.025, 0.42, 4), '#3a332c');
      seg.position.set(sx * 0.16, -0.12, 0);
      seg.rotation.z = sx * 1.0;
      leg.add(seg);
      body.add(leg);
      legs.push(leg);
    }
  }
  if (queen) {
    const crown = new THREE.Group();
    crown.position.set(0, 0.28, 0);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.2, 4), mat('#f2c14e', { emissive: '#7a5200', emissiveIntensity: 0.4 }));
      spike.position.set(Math.cos(a) * 0.14, 0, Math.sin(a) * 0.14);
      crown.add(spike);
    }
    head.add(crown);
  }
  return { root, body, parts: { head, legs: legsGroup(legs) }, height: 1.1 };
}

function legsGroup(legs: THREE.Object3D[]) {
  const g = new THREE.Group();
  g.userData.legs = legs;
  return g;
}

export function makeMoth(): MonsterRig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 1.3;
  root.add(body);
  const thorax = mesh(new THREE.CapsuleGeometry(0.17, 0.42, 3, 7), '#cdb994');
  thorax.rotation.x = Math.PI / 2;
  body.add(thorax);
  const fuzz = mesh(new THREE.IcosahedronGeometry(0.2, 0), '#efe4cf');
  fuzz.position.set(0, 0.05, 0.22);
  body.add(fuzz);
  const head = mesh(new THREE.IcosahedronGeometry(0.15, 0), '#a8946f');
  head.position.set(0, 0.04, 0.42);
  body.add(head);
  eyes(body, 0.08, 0.52, 0.08, 0.05);
  for (const sx of [-1, 1]) {
    const ant = mesh(new THREE.ConeGeometry(0.04, 0.32, 4), '#7e6b4c');
    ant.position.set(sx * 0.08, 0.22, 0.5);
    ant.rotation.x = 0.7;
    ant.rotation.z = -sx * 0.35;
    body.add(ant);
  }
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0);
  wingShape.quadraticCurveTo(0.5, 0.35, 0.85, 0.15);
  wingShape.quadraticCurveTo(0.7, -0.35, 0.1, -0.25);
  wingShape.lineTo(0, 0);
  const wingGeo = new THREE.ShapeGeometry(wingShape, 4);
  wingGeo.rotateX(-Math.PI / 2);
  const wings: THREE.Group[] = [];
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * 0.12, 0.08, 0);
    const front = new THREE.Mesh(wingGeo, mat('#e7dcc3', { opacity: 0.92 }));
    front.scale.set(sx, 1, 1);
    front.position.z = 0.05;
    front.castShadow = true;
    const back = new THREE.Mesh(wingGeo, mat('#c9b48e', { opacity: 0.92 }));
    back.scale.set(sx * 0.75, 1, -0.8);
    back.position.z = -0.05;
    back.castShadow = true;
    pivot.add(front, back);
    const dot = mesh(new THREE.CircleGeometry(0.08, 8), '#8a6d48', false);
    dot.rotation.x = -Math.PI / 2;
    dot.position.set(sx * 0.48, 0.01, 0.12);
    pivot.add(dot);
    body.add(pivot);
    wings.push(pivot);
  }
  return { root, body, parts: { wingL: wings[0], wingR: wings[1] }, height: 2.0 };
}

export function makeGecko(): MonsterRig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const torso = mesh(new THREE.CapsuleGeometry(0.26, 0.7, 3, 8), '#4f8a3a');
  torso.rotation.x = Math.PI / 2;
  torso.position.y = 0.36;
  body.add(torso);
  const belly = mesh(new THREE.CapsuleGeometry(0.2, 0.6, 3, 8), '#b9cf7a');
  belly.rotation.x = Math.PI / 2;
  belly.position.set(0, 0.26, 0.02);
  body.add(belly);
  const head = new THREE.Group();
  head.position.set(0, 0.44, 0.66);
  body.add(head);
  const skull = mesh(new THREE.IcosahedronGeometry(0.27, 1), '#4f8a3a');
  skull.scale.set(1, 0.75, 1.25);
  head.add(skull);
  for (const sx of [-1, 1]) {
    const eye = mesh(new THREE.IcosahedronGeometry(0.09, 1), '#f4d03f', false);
    eye.position.set(sx * 0.17, 0.12, 0.12);
    head.add(eye);
    const pupil = mesh(new THREE.BoxGeometry(0.02, 0.1, 0.02), '#111111', false);
    pupil.position.set(sx * 0.2, 0.12, 0.19);
    head.add(pupil);
  }
  const tail = new THREE.Group();
  tail.position.set(0, 0.34, -0.6);
  body.add(tail);
  const tailMesh = mesh(new THREE.ConeGeometry(0.2, 1.0, 6), '#4f8a3a');
  tailMesh.rotation.x = -Math.PI / 2;
  tailMesh.position.z = -0.5;
  tail.add(tailMesh);
  for (let i = 0; i < 3; i++) {
    const leaf = mesh(new THREE.SphereGeometry(0.2, 6, 4), '#8fcf5a');
    leaf.scale.set(0.25, 0.9, 1);
    leaf.position.set(0, 0.62 + (i === 1 ? 0.04 : 0), 0.3 - i * 0.32);
    leaf.rotation.x = -0.4;
    body.add(leaf);
  }
  const feet: THREE.Object3D[] = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const foot = mesh(new THREE.CapsuleGeometry(0.06, 0.2, 2, 5), '#3f6f2f');
      foot.position.set(sx * 0.3, 0.12, sz * 0.32);
      foot.rotation.z = sx * 1.1;
      body.add(foot);
      feet.push(foot);
    }
  }
  return { root, body, parts: { head, tail, feet: legsGroup(feet) }, height: 1.0 };
}

export function makeMonsterModel(id: string): MonsterRig {
  switch (id) {
    case 'mossball':
      return makeMossball();
    case 'pebble_beetle':
      return makeBeetle(false);
    case 'pebble_queen':
      return makeBeetle(true);
    case 'dust_moth':
      return makeMoth();
    case 'leaf_gecko':
      return makeGecko();
    default:
      return makeMossball();
  }
}

// ── Props ─────────────────────────────────────────────────────────────

export function makeSaveCrystal() {
  const root = new THREE.Group();
  const base = mesh(new THREE.CylinderGeometry(0.7, 0.9, 0.35, 6), '#8d8a84');
  base.position.y = 0.17;
  base.receiveShadow = true;
  root.add(base);
  const crystal = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.45, 0),
    mat('#8ff0ff', { emissive: '#2ec4ff', emissiveIntensity: 0.9 }),
  );
  crystal.scale.set(0.8, 1.5, 0.8);
  crystal.position.y = 1.6;
  crystal.castShadow = true;
  root.add(crystal);
  const glow = new THREE.PointLight('#5fd8ff', 6, 7, 2);
  glow.position.y = 1.6;
  root.add(glow);
  return { root, crystal };
}

export function makeHouse(wall: string, roof: string) {
  const g = new THREE.Group();
  const body = mesh(new THREE.BoxGeometry(3, 2.2, 2.6), wall);
  body.position.y = 1.1;
  body.receiveShadow = true;
  g.add(body);
  const r = mesh(new THREE.ConeGeometry(2.6, 1.5, 4), roof);
  r.position.y = 2.95;
  r.rotation.y = Math.PI / 4;
  r.scale.set(1, 1, 0.9);
  g.add(r);
  const door = mesh(new THREE.BoxGeometry(0.7, 1.2, 0.05), '#6b4426', false);
  door.position.set(0, 0.6, 1.31);
  g.add(door);
  for (const sx of [-1, 1]) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 0.05), mat('#ffe9a8', { emissive: '#ffcf6a', emissiveIntensity: 0.35 }));
    win.position.set(sx * 0.95, 1.35, 1.31);
    g.add(win);
  }
  return g;
}

export function makeWell() {
  const g = new THREE.Group();
  const ring = mesh(new THREE.CylinderGeometry(0.9, 1, 0.8, 10, 1, true), '#9a958c');
  (ring.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  ring.position.y = 0.4;
  g.add(ring);
  const water = mesh(new THREE.CircleGeometry(0.85, 10), '#4a8fc4', false);
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.5;
  g.add(water);
  for (const sx of [-1, 1]) {
    const post = mesh(new THREE.BoxGeometry(0.12, 1.6, 0.12), '#6b4426');
    post.position.set(sx * 0.85, 1.2, 0);
    g.add(post);
  }
  const roof = mesh(new THREE.ConeGeometry(1.3, 0.7, 4), '#a8452f');
  roof.position.y = 2.25;
  roof.rotation.y = Math.PI / 4;
  g.add(roof);
  return g;
}

export function makeSign() {
  const g = new THREE.Group();
  const post = mesh(new THREE.BoxGeometry(0.12, 1.4, 0.12), '#6b4426');
  post.position.y = 0.7;
  g.add(post);
  const board = mesh(new THREE.BoxGeometry(1.1, 0.4, 0.08), '#a9824f');
  board.position.y = 1.2;
  g.add(board);
  return g;
}
