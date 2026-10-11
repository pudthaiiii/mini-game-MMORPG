/** Small seeded PRNG so the world layout is the same on every load. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomInCircle(rng: () => number, cx: number, cz: number, r: number): [number, number] {
  const a = rng() * Math.PI * 2;
  const d = Math.sqrt(rng()) * r;
  return [cx + Math.cos(a) * d, cz + Math.sin(a) * d];
}

/** cheap smooth-ish value noise for ground colouring */
export function noise2(x: number, z: number) {
  return (
    Math.sin(x * 0.21 + z * 0.13) * 0.5 +
    Math.sin(x * 0.07 - z * 0.19 + 1.7) * 0.35 +
    Math.sin(x * 0.53 + z * 0.47 + 4.1) * 0.15
  );
}
