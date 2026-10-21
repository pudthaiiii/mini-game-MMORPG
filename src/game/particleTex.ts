import * as THREE from 'three';

// Helpers are lazy: every exported call owns its canvas and texture.
function createSurface(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Particle sprites require a Canvas 2D context');
  return [canvas, context];
}

function finish(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

// White RGB at every gradient stop keeps material tinting predictable.
function glow(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  stops: ReadonlyArray<readonly [number, number]>,
): void {
  const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
  for (const [position, alpha] of stops) {
    gradient.addColorStop(position, `rgba(255, 255, 255, ${alpha})`);
  }
  context.fillStyle = gradient;
  context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

export function makeGlowSprite(): THREE.Texture {
  const [canvas, context] = createSurface();
  glow(context, 64, 64, 61, [
    [0, 1],
    [0.1, 1],
    [0.25, 0.8],
    [0.48, 0.36],
    [0.72, 0.1],
    [0.9, 0.015],
    [1, 0],
  ]);
  return finish(canvas);
}

export function makeRingSprite(): THREE.Texture {
  const [canvas, context] = createSurface();
  // An annular gradient leaves the center completely clear. The narrow
  // bright band spans several texels so it survives downscaling.
  glow(context, 64, 64, 61, [
    [0, 0],
    [0.57, 0],
    [0.66, 0.06],
    [0.73, 0.3],
    [0.77, 0.95],
    [0.81, 1],
    [0.85, 0.3],
    [0.93, 0.06],
    [1, 0],
  ]);
  return finish(canvas);
}

export function makeFrostCrystalSprite(): THREE.Texture {
  const [canvas, context] = createSurface();
  glow(context, 64, 64, 61, [
    [0, 0.8],
    [0.18, 0.55],
    [0.4, 0.2],
    [0.7, 0.05],
    [1, 0],
  ]);

  // Six tapered arms and small swept branches form an ice crystal.
  context.save();
  context.translate(64, 64);
  context.fillStyle = 'white';
  context.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.lineWidth = 2;
  context.shadowColor = 'white';
  context.shadowBlur = 7;
  for (let arm = 0; arm < 6; arm += 1) {
    context.save();
    context.rotate((arm * Math.PI) / 3);
    context.beginPath();
    context.moveTo(0, -53);
    context.lineTo(4, -17);
    context.lineTo(7, 0);
    context.lineTo(-7, 0);
    context.lineTo(-4, -17);
    context.closePath();
    context.fill();
    for (const distance of [24, 35]) {
      context.beginPath();
      context.moveTo(-9, -distance - 7);
      context.lineTo(0, -distance);
      context.lineTo(9, -distance - 7);
      context.stroke();
    }
    context.restore();
  }
  context.restore();
  glow(context, 64, 64, 17, [
    [0, 1],
    [0.3, 1],
    [0.65, 0.55],
    [1, 0],
  ]);
  return finish(canvas);
}

export function makeEmberSprite(): THREE.Texture {
  const [canvas, context] = createSurface();
  glow(context, 64, 64, 59, [
    [0, 1],
    [0.07, 1],
    [0.17, 0.9],
    [0.3, 0.4],
    [0.55, 0.12],
    [0.8, 0.025],
    [1, 0],
  ]);
  context.save();
  context.translate(64, 64);
  context.rotate(-Math.PI / 7);
  context.scale(0.2, 1);
  glow(context, 0, 0, 49, [
    [0, 1],
    [0.12, 0.9],
    [0.35, 0.35],
    [0.7, 0.06],
    [1, 0],
  ]);
  context.restore();
  context.save();
  context.translate(64, 64);
  context.rotate(-Math.PI / 7);
  context.scale(1, 0.18);
  glow(context, 0, 0, 29, [
    [0, 0.8],
    [0.3, 0.4],
    [1, 0],
  ]);
  context.restore();
  return finish(canvas);
}

export function makeSmokeSprite(): THREE.Texture {
  const [canvas, context] = createSurface();
  // Asymmetric, overlapping lobes; all fade before reaching the canvas edge.
  const blobs: ReadonlyArray<readonly [number, number, number, number]> = [
    [57, 66, 43, 0.48],
    [43, 46, 31, 0.42],
    [73, 40, 30, 0.38],
    [87, 62, 32, 0.44],
    [76, 85, 33, 0.4],
    [40, 83, 28, 0.34],
    [59, 57, 27, 0.3],
  ];
  for (const [x, y, radius, alpha] of blobs) {
    glow(context, x, y, radius, [
      [0, alpha],
      [0.25, alpha * 0.92],
      [0.55, alpha * 0.6],
      [0.8, alpha * 0.18],
      [1, 0],
    ]);
  }
  return finish(canvas);
}
