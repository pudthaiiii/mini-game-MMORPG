import * as THREE from 'three';
import type { MapDef } from '../shared/data/maps';
import { makeHouse, makeSign, makeWell, mat } from './models';
import { mulberry32, noise2 } from './rand';

const GRASS = new THREE.Color('#7fb069');
const GRASS_DARK = new THREE.Color('#5d8f4e');
const GRASS_LIGHT = new THREE.Color('#a3c97a');
const DIRT = new THREE.Color('#c9a874');
const STONE = new THREE.Color('#b9b2a3');
const ROCKY = new THREE.Color('#9aa585');
const WOODS = new THREE.Color('#4f7d43');

function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax;
  const dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)));
  const x = ax + dx * t;
  const z = az + dz * t;
  return Math.hypot(px - x, pz - z);
}

export function buildWorld(scene: THREE.Scene, map: MapDef) {
  const size = map.half * 2 + 40;
  const seg = 140;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const [tx, tz] = map.town.center;
  const paths = map.zones.map((z) => z.center);

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const n = noise2(x, z);
    c.copy(GRASS).lerp(n > 0 ? GRASS_LIGHT : GRASS_DARK, Math.abs(n) * 0.45);

    for (const zone of map.zones) {
      const d = Math.hypot(x - zone.center[0], z - zone.center[1]);
      const k = THREE.MathUtils.smoothstep(zone.radius + 4, zone.radius - 2, d);
      if (k <= 0) continue;
      if (zone.kind === 'rocks') c.lerp(ROCKY, k * 0.7);
      else if (zone.kind === 'woods') c.lerp(WOODS, k * 0.75);
      else if (zone.kind === 'flowers') c.lerp(GRASS_LIGHT, k * 0.5);
      else if (zone.kind === 'clearing') c.lerp(DIRT, k * 0.35);
    }

    // dirt paths from town to each zone
    let pd = Infinity;
    for (const [px, pz] of paths) pd = Math.min(pd, distToSegment(x, z, tx, tz, px, pz));
    const wobble = Math.sin(x * 0.4) * 0.3 + Math.cos(z * 0.35) * 0.3;
    c.lerp(DIRT, THREE.MathUtils.smoothstep(1.9 + wobble, 1.0 + wobble, pd) * 0.85);

    // town plaza
    const td = Math.hypot(x - tx, z - tz);
    c.lerp(STONE, THREE.MathUtils.smoothstep(map.town.radius - 1, map.town.radius - 3, td) * 0.9);

    // fade the far edge out of the playable area
    const edge = Math.max(Math.abs(x), Math.abs(z));
    c.lerp(GRASS_DARK, THREE.MathUtils.smoothstep(map.half - 4, map.half + 6, edge) * 0.6);

    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }));
  ground.receiveShadow = true;
  scene.add(ground);

  const rng = mulberry32(1337);
  const blocked = (x: number, z: number, pad = 0) => {
    if (Math.hypot(x - tx, z - tz) < map.town.radius + 2 + pad) return true;
    for (const [px, pz] of paths) if (distToSegment(x, z, tx, tz, px, pz) < 2.6 + pad) return true;
    for (const s of map.spawns) if (s.monster === 'pebble_queen' && Math.hypot(x - s.center[0], z - s.center[1]) < 7) return true;
    if (Math.hypot(x - map.saveCrystal[0], z - map.saveCrystal[1]) < 3) return true;
    return false;
  };

  // ── trees ──
  const treePos: { x: number; z: number; s: number; kind: 0 | 1 }[] = [];
  const tryTree = (x: number, z: number, kind: 0 | 1) => {
    if (Math.abs(x) > map.half + 14 || Math.abs(z) > map.half + 14) return;
    if (blocked(x, z)) return;
    for (const t of treePos) if (Math.hypot(t.x - x, t.z - z) < 2.2) return;
    treePos.push({ x, z, s: 0.8 + rng() * 0.6, kind });
  };
  const woods = map.zones.find((z) => z.kind === 'woods');
  if (woods) {
    for (let i = 0; i < 140; i++) {
      const a = rng() * Math.PI * 2;
      const d = Math.sqrt(rng()) * (woods.radius + 6);
      const x = woods.center[0] + Math.cos(a) * d;
      const z = woods.center[1] + Math.sin(a) * d;
      // keep the middle of the woods open enough to fight in
      if (d < woods.radius * 0.55 && rng() < 0.75) continue;
      tryTree(x, z, rng() < 0.6 ? 0 : 1);
    }
  }
  // border forest ring
  for (let i = 0; i < 420; i++) {
    const side = Math.floor(rng() * 4);
    const t = (rng() * 2 - 1) * (map.half + 12);
    const depth = map.half + 2 + rng() * 12;
    const x = side === 0 ? t : side === 1 ? t : side === 2 ? depth : -depth;
    const z = side === 0 ? depth : side === 1 ? -depth : t;
    tryTree(x, z, rng() < 0.5 ? 0 : 1);
  }
  // sparse field trees
  for (let i = 0; i < 70; i++) {
    const x = (rng() * 2 - 1) * map.half;
    const z = (rng() * 2 - 1) * map.half;
    let inZone = false;
    for (const zone of map.zones) if (Math.hypot(x - zone.center[0], z - zone.center[1]) < zone.radius) inZone = true;
    if (!inZone) tryTree(x, z, rng() < 0.4 ? 0 : 1);
  }

  const dummy = new THREE.Object3D();
  const pines = treePos.filter((t) => t.kind === 0);
  const rounds = treePos.filter((t) => t.kind === 1);
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.24, 1.2, 6);
  trunkGeo.translate(0, 0.6, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, mat('#6b4a2f'), treePos.length);
  treePos.forEach((t, i) => {
    dummy.position.set(t.x, 0, t.z);
    dummy.scale.setScalar(t.s);
    dummy.rotation.y = rng() * Math.PI;
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
  });
  trunks.castShadow = true;
  scene.add(trunks);

  const pineGeo = new THREE.ConeGeometry(1.1, 1.8, 7);
  const pineLayers = [
    { y: 1.6, s: 1 },
    { y: 2.5, s: 0.78 },
    { y: 3.3, s: 0.55 },
  ];
  for (const layer of pineLayers) {
    const im = new THREE.InstancedMesh(pineGeo, mat('#3f7a4a'), pines.length);
    pines.forEach((t, i) => {
      dummy.position.set(t.x, layer.y * t.s, t.z);
      dummy.scale.setScalar(t.s * layer.s);
      dummy.rotation.y = i;
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
    });
    im.castShadow = true;
    scene.add(im);
  }
  const blobGeo = new THREE.IcosahedronGeometry(1.25, 0);
  const blobColors = ['#5f9a45', '#6fa94e', '#558c3f'];
  blobColors.forEach((col, ci) => {
    const subset = rounds.filter((_, i) => i % blobColors.length === ci);
    const im = new THREE.InstancedMesh(blobGeo, mat(col), subset.length);
    subset.forEach((t, i) => {
      dummy.position.set(t.x, 2.0 * t.s, t.z);
      dummy.scale.set(t.s, t.s * 0.9, t.s);
      dummy.rotation.set(0, i * 1.7, 0);
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
    });
    im.castShadow = true;
    scene.add(im);
  });

  // ── rocks ──
  const rockZone = map.zones.find((z) => z.kind === 'rocks');
  const rockGeo = new THREE.DodecahedronGeometry(0.6, 0);
  const rockList: [number, number, number][] = [];
  for (let i = 0; i < 90; i++) {
    let x: number;
    let z: number;
    if (rockZone && i < 55) {
      const a = rng() * Math.PI * 2;
      const d = Math.sqrt(rng()) * (rockZone.radius + 3);
      x = rockZone.center[0] + Math.cos(a) * d;
      z = rockZone.center[1] + Math.sin(a) * d;
    } else {
      x = (rng() * 2 - 1) * map.half;
      z = (rng() * 2 - 1) * map.half;
    }
    if (blocked(x, z, -1)) continue;
    rockList.push([x, z, 0.4 + rng() * (i < 55 ? 1.1 : 0.6)]);
  }
  const rocks = new THREE.InstancedMesh(rockGeo, mat('#9c968b'), rockList.length);
  rockList.forEach(([x, z, s], i) => {
    dummy.position.set(x, s * 0.25, z);
    dummy.scale.set(s, s * 0.7, s * 0.9);
    dummy.rotation.set(rng(), rng() * 3, rng());
    dummy.updateMatrix();
    rocks.setMatrixAt(i, dummy.matrix);
  });
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  scene.add(rocks);

  // ── flowers + grass tufts ──
  const flowerZone = map.zones.find((z) => z.kind === 'flowers');
  const petalGeo = new THREE.IcosahedronGeometry(0.12, 0);
  const flowerColors = ['#f7d154', '#f28ab2', '#ffffff', '#b59cf2'];
  flowerColors.forEach((col, ci) => {
    const pts: [number, number][] = [];
    for (let i = 0; i < 160; i++) {
      let x: number;
      let z: number;
      if (flowerZone && i < 120) {
        const a = rng() * Math.PI * 2;
        const d = Math.sqrt(rng()) * (flowerZone.radius + 2);
        x = flowerZone.center[0] + Math.cos(a) * d;
        z = flowerZone.center[1] + Math.sin(a) * d;
      } else {
        x = (rng() * 2 - 1) * map.half;
        z = (rng() * 2 - 1) * map.half;
      }
      if (Math.hypot(x - tx, z - tz) < map.town.radius) continue;
      pts.push([x, z]);
    }
    const im = new THREE.InstancedMesh(petalGeo, mat(col), pts.length);
    pts.forEach(([x, z], i) => {
      dummy.position.set(x, 0.18, z);
      dummy.scale.setScalar(0.8 + ((i * 7 + ci) % 5) * 0.12);
      dummy.rotation.set(0, i, 0);
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
    });
    scene.add(im);
  });

  const tuftGeo = new THREE.ConeGeometry(0.08, 0.45, 3);
  tuftGeo.translate(0, 0.22, 0);
  const tufts: [number, number][] = [];
  for (let i = 0; i < 1400; i++) {
    const x = (rng() * 2 - 1) * (map.half + 6);
    const z = (rng() * 2 - 1) * (map.half + 6);
    if (Math.hypot(x - tx, z - tz) < map.town.radius) continue;
    tufts.push([x, z]);
  }
  const tuftMesh = new THREE.InstancedMesh(tuftGeo, mat('#5f9a45'), tufts.length * 3);
  let ti = 0;
  for (const [x, z] of tufts) {
    for (let k = 0; k < 3; k++) {
      dummy.position.set(x + (k - 1) * 0.09, 0, z + ((k * 13) % 3) * 0.05);
      dummy.rotation.set((k - 1) * 0.35, k, 0);
      dummy.scale.setScalar(0.8 + k * 0.2);
      dummy.updateMatrix();
      tuftMesh.setMatrixAt(ti++, dummy.matrix);
    }
  }
  scene.add(tuftMesh);

  // ── town ──
  const obstacles: { x: number; z: number; r: number }[] = [];
  const town = new THREE.Group();
  const houses: [number, number, string, string][] = [
    [-12, 3, '#efe3c8', '#b8553a'],
    [12, 15, '#e9dcc0', '#3f6aa0'],
    [-9, 20, '#f1e6cf', '#7a8f3a'],
    [7, 21, '#eadfca', '#b8553a'],
  ];
  for (const [x, z, wall, roof] of houses) {
    const h = makeHouse(wall, roof);
    h.position.set(x, 0, z);
    h.rotation.y = Math.atan2(tx - x, tz - z); // door faces the plaza
    town.add(h);
    obstacles.push({ x, z, r: 1.9 });
  }
  const well = makeWell();
  well.position.set(tx + 3, 0, tz + 3.5);
  obstacles.push({ x: tx + 3, z: tz + 3.5, r: 1.2 });
  obstacles.push({ x: map.saveCrystal[0], z: map.saveCrystal[1], r: 0.9 });
  town.add(well);
  const signs: [number, number][] = [
    [2.6, -1.5],
    [9.5, 8],
    [-9.5, 12],
  ];
  for (const [x, z] of signs) {
    const s = makeSign();
    s.position.set(x, 0, z);
    s.rotation.y = Math.atan2(-x, -z);
    town.add(s);
  }
  // little fence segments around the plaza
  const postGeo = new THREE.BoxGeometry(0.14, 0.8, 0.14);
  const railGeo = new THREE.BoxGeometry(0.08, 0.08, 1.3);
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const r = map.town.radius + 0.8;
    const x = tx + Math.cos(a) * r;
    const z = tz + Math.sin(a) * r;
    // leave gaps where paths leave town
    let onPath = false;
    for (const [px, pz] of paths) if (distToSegment(x, z, tx, tz, px, pz) < 2.4) onPath = true;
    if (onPath) continue;
    const post = new THREE.Mesh(postGeo, mat('#8a6440'));
    post.position.set(x, 0.4, z);
    post.castShadow = true;
    town.add(post);
    const rail = new THREE.Mesh(railGeo, mat('#9c7650'));
    rail.position.set(tx + Math.cos(a + Math.PI / 40) * r, 0.62, tz + Math.sin(a + Math.PI / 40) * r);
    rail.rotation.y = -a;
    town.add(rail);
  }
  town.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  scene.add(town);

  return { ground, obstacles };
}
