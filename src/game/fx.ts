import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { makeEmberSprite, makeFrostCrystalSprite, makeGlowSprite, makeRingSprite, makeSmokeSprite } from './particleTex';

export type FloatKind = 'dmg' | 'crit' | 'miss' | 'hurt' | 'heal' | 'info' | 'level' | 'ice' | 'fire';
export type Element = 'ice' | 'fire';

const ELEMENT_COLOR: Record<Element, { ring: string; glow: string; particle: string }> = {
  ice: { ring: '#8fd6ff', glow: '#bfe9ff', particle: '#eaf8ff' },
  fire: { ring: '#ff8a5c', glow: '#ff8a4a', particle: '#ffd27a' },
};

interface Timed {
  obj: THREE.Object3D;
  life: number;
  max: number;
  tick?: (t: number) => void;
  dispose?: () => void;
}

/** Floating numbers, click markers, level-up pillars, emote bubbles. */
export class Fx {
  private items: Timed[] = [];
  private readonly scene: THREE.Scene;
  private marker: THREE.Mesh;
  private markerLife = 0;
  private readonly ringGeo = new THREE.RingGeometry(0, 1, 40);
  private readonly rockGeo = new THREE.IcosahedronGeometry(0.35, 0);
  private readonly trailGeo = new THREE.ConeGeometry(0.16, 1.5, 6);

  // procedurally-painted soft particle textures (see particleTex.ts), tinted per use via material.color
  private readonly glowTex = makeGlowSprite();
  private readonly ringTex = makeRingSprite();
  private readonly frostTex = makeFrostCrystalSprite();
  private readonly emberTex = makeEmberSprite();
  private readonly smokeTex = makeSmokeSprite();

  private particleTex(element: Element) {
    return element === 'ice' ? this.frostTex : this.emberTex;
  }

  /** A camera-facing glow/particle billboard, tinted and additively blended. */
  private sprite(tex: THREE.Texture, color: string, opacity = 1) {
    const mat = new THREE.SpriteMaterial({
      map: tex,
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      rotation: Math.random() * Math.PI * 2,
    });
    return new THREE.Sprite(mat);
  }

  // ground targeting reticle (RO-style AoE placement circle)
  private readonly targetDisk: THREE.Mesh;
  private readonly targetRing: THREE.Mesh;
  private readonly targetRingInner: THREE.Mesh;
  private targetTicks: THREE.Sprite[] = [];
  private clock = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(0.28, 0.4, 24),
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false }),
    );
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.visible = false;
    scene.add(this.marker);

    const diskMat = new THREE.MeshBasicMaterial({
      map: this.glowTex,
      color: '#ffffff',
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.targetDisk = new THREE.Mesh(this.ringGeo, diskMat);
    this.targetDisk.rotation.x = -Math.PI / 2;
    this.targetDisk.visible = false;
    scene.add(this.targetDisk);

    const ringMat = new THREE.MeshBasicMaterial({
      map: this.ringTex,
      color: '#ffffff',
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.targetRing = new THREE.Mesh(this.ringGeo, ringMat);
    this.targetRing.rotation.x = -Math.PI / 2;
    this.targetRing.visible = false;
    scene.add(this.targetRing);

    const innerMat = ringMat.clone();
    innerMat.opacity = 0.8;
    this.targetRingInner = new THREE.Mesh(this.ringGeo, innerMat);
    this.targetRingInner.rotation.x = -Math.PI / 2;
    this.targetRingInner.visible = false;
    scene.add(this.targetRingInner);

    for (let i = 0; i < 12; i++) {
      const tick = this.sprite(this.glowTex, '#ffffff', 0.9);
      tick.scale.setScalar(0.3);
      tick.visible = false;
      scene.add(tick);
      this.targetTicks.push(tick);
    }
  }

  /** RO-style ground AoE reticle: glowing filled disc + spinning double ring + orbiting motes, following the cursor. */
  setCastIndicator(visible: boolean, x = 0, z = 0, radius = 1, color = '#ffffff', inRange = true) {
    this.targetDisk.visible = visible;
    this.targetRing.visible = visible;
    this.targetRingInner.visible = visible;
    for (const t of this.targetTicks) t.visible = visible;
    if (!visible) return;
    const c = inRange ? color : '#ff5c5c';
    this.targetDisk.position.set(x, 0.025, z);
    this.targetDisk.scale.setScalar(radius);
    (this.targetDisk.material as THREE.MeshBasicMaterial).color.set(c);
    this.targetRing.position.set(x, 0.035, z);
    this.targetRing.scale.setScalar(radius);
    (this.targetRing.material as THREE.MeshBasicMaterial).color.set(c);
    this.targetRingInner.position.set(x, 0.035, z);
    this.targetRingInner.scale.setScalar(radius * 0.82);
    (this.targetRingInner.material as THREE.MeshBasicMaterial).color.set(c);
    this.targetTicks.forEach((tick, i) => {
      const a = (i / this.targetTicks.length) * Math.PI * 2 + this.clock * 0.6;
      tick.position.set(x + Math.cos(a) * radius, 0.12, z + Math.sin(a) * radius);
      tick.scale.setScalar(0.22 + Math.sin(this.clock * 5 + i) * 0.06);
      (tick.material as THREE.SpriteMaterial).color.set(c);
    });
  }

  /** Layered rune circle shown while a spell channels, at (x,z) for `duration` seconds. */
  castGlyph(x: number, z: number, duration: number, element: Element) {
    const { ring: color, glow: glowColor } = ELEMENT_COLOR[element];
    const glowMat = new THREE.MeshBasicMaterial({
      map: this.glowTex,
      color: glowColor,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const glow = new THREE.Mesh(this.ringGeo, glowMat);
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(x, 0.03, z);
    this.scene.add(glow);

    const outerMat = new THREE.MeshBasicMaterial({
      map: this.ringTex,
      color,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const outer = new THREE.Mesh(this.ringGeo, outerMat);
    outer.rotation.x = -Math.PI / 2;
    outer.position.set(x, 0.04, z);
    this.scene.add(outer);

    const innerMat = outerMat.clone();
    const inner = new THREE.Mesh(this.ringGeo, innerMat);
    inner.rotation.x = -Math.PI / 2;
    inner.position.set(x, 0.045, z);
    this.scene.add(inner);

    const tex = this.particleTex(element);
    const ticks: THREE.Sprite[] = [];
    for (let i = 0; i < 8; i++) {
      const tick = this.sprite(tex, color, 0.95);
      this.scene.add(tick);
      ticks.push(tick);
    }

    this.items.push({
      obj: glow,
      life: 0,
      max: duration,
      tick: (t) => {
        const grow = THREE.MathUtils.lerp(0.3, 1.7, Math.min(1, t * 2.2));
        glow.scale.setScalar(grow);
        glowMat.opacity = 0.4 * Math.min(1, t * 3);
        outer.scale.setScalar(grow);
        outer.rotation.z += 0.045;
        inner.scale.setScalar(grow * 0.74);
        inner.rotation.z -= 0.07;
        const flash = 0.6 + 0.4 * Math.sin(t * Math.PI * 5);
        outerMat.opacity = flash;
        innerMat.opacity = flash;
        ticks.forEach((tick, i) => {
          const a = (i / ticks.length) * Math.PI * 2 - t * 2.4;
          const r = grow * 1.7;
          tick.position.set(x + Math.cos(a) * r, 0.15, z + Math.sin(a) * r);
          tick.scale.setScalar(0.35 + Math.sin(t * 20 + i) * 0.05);
        });
        if (t >= 1) {
          for (const tick of ticks) {
            tick.removeFromParent();
            (tick.material as THREE.SpriteMaterial).dispose();
          }
        }
      },
      dispose: () => {
        glowMat.dispose();
        outer.removeFromParent();
        outerMat.dispose();
        inner.removeFromParent();
        innerMat.dispose();
      },
    });
  }

  /** Expanding AoE shockwave + flash + glowing debris, used for Storm Gust ticks and Meteor Storm impacts. */
  burst(x: number, z: number, radius: number, element: Element, shardCount = 8) {
    const { ring: ringColor, glow: glowColor, particle: shardColor } = ELEMENT_COLOR[element];

    // bright core flash — quick pop that sells the "impact"
    const flash = this.sprite(this.glowTex, '#ffffff', 1);
    flash.position.set(x, 0.35, z);
    this.scene.add(flash);
    this.items.push({
      obj: flash,
      life: 0,
      max: 0.22,
      tick: (t) => {
        flash.scale.setScalar(radius * 0.9 * (1 + t * 1.6) * (1 - t));
        (flash.material as THREE.SpriteMaterial).opacity = 1 - t;
      },
      dispose: () => (flash.material as THREE.SpriteMaterial).dispose(),
    });

    // filled glow disc on the ground
    const fillMat = new THREE.MeshBasicMaterial({
      map: this.glowTex,
      color: glowColor,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const fill = new THREE.Mesh(this.ringGeo, fillMat);
    fill.rotation.x = -Math.PI / 2;
    fill.position.set(x, 0.05, z);
    this.scene.add(fill);
    this.items.push({
      obj: fill,
      life: 0,
      max: 0.4,
      tick: (t) => {
        fill.scale.setScalar(radius * (0.2 + t * 0.9));
        fillMat.opacity = 0.8 * (1 - t);
      },
      dispose: () => fillMat.dispose(),
    });

    // crisp expanding shockwave rim
    const rimMat = new THREE.MeshBasicMaterial({
      map: this.ringTex,
      color: ringColor,
      transparent: true,
      opacity: 1,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const rim = new THREE.Mesh(this.ringGeo, rimMat);
    rim.rotation.x = -Math.PI / 2;
    rim.position.set(x, 0.06, z);
    this.scene.add(rim);
    this.items.push({
      obj: rim,
      life: 0,
      max: 0.55,
      tick: (t) => {
        rim.scale.setScalar(radius * (0.15 + t * 1.15));
        rimMat.opacity = (1 - t) * 0.95;
      },
      dispose: () => rimMat.dispose(),
    });

    const tex = this.particleTex(element);
    for (let i = 0; i < shardCount; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = radius * Math.random();
      const shard = this.sprite(tex, shardColor, 0.95);
      const scale = 0.35 + Math.random() * 0.4;
      shard.scale.setScalar(scale);
      shard.position.set(x + Math.cos(a) * d, 0.1, z + Math.sin(a) * d);
      this.scene.add(shard);
      const rise = 0.6 + Math.random() * 1.1;
      const spin = (Math.random() - 0.5) * 4;
      const sm = shard.material as THREE.SpriteMaterial;
      this.items.push({
        obj: shard,
        life: 0,
        max: 0.4 + Math.random() * 0.35,
        tick: (t) => {
          shard.position.y = 0.1 + Math.sin(t * Math.PI) * rise;
          sm.rotation += spin * 0.05;
          sm.opacity = 0.95 * (1 - t);
        },
        dispose: () => sm.dispose(),
      });
    }

    // lingering smoke puffs for fire impacts
    if (element === 'fire') {
      for (let i = 0; i < 3; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = radius * 0.4 * Math.random();
        const puff = this.sprite(this.smokeTex, '#776a62', 0.5);
        puff.position.set(x + Math.cos(a) * d, 0.2, z + Math.sin(a) * d);
        puff.scale.setScalar(radius * 0.5);
        this.scene.add(puff);
        const pm = puff.material as THREE.SpriteMaterial;
        this.items.push({
          obj: puff,
          life: 0,
          max: 0.9 + Math.random() * 0.4,
          tick: (t) => {
            puff.position.y = 0.2 + t * 1.4;
            puff.scale.setScalar(radius * 0.5 * (1 + t * 0.8));
            pm.opacity = 0.5 * (1 - t);
          },
          dispose: () => pm.dispose(),
        });
      }
    }
  }

  /** A glowing rock with a fiery trail falling from the sky onto (x,z) over `duration` seconds. */
  meteorFall(x: number, z: number, duration: number) {
    const rockMat = new THREE.MeshBasicMaterial({ color: '#4a2f22' });
    const rock = new THREE.Mesh(this.rockGeo, rockMat);
    const fromY = 13 + Math.random() * 3;
    rock.position.set(x, fromY, z);
    this.scene.add(rock);

    const core = this.sprite(this.glowTex, '#fff0d8', 1);
    core.scale.setScalar(0.5);
    rock.add(core);
    const spark = this.sprite(this.emberTex, '#ffb25a', 0.9);
    spark.scale.setScalar(0.7);
    rock.add(spark);

    const trailMat = new THREE.MeshBasicMaterial({
      color: '#ffb25a',
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const trail = new THREE.Mesh(this.trailGeo, trailMat);
    trail.rotation.x = Math.PI;
    trail.position.y = 1.0;
    rock.add(trail);
    const trail2Mat = new THREE.MeshBasicMaterial({
      color: '#ffe4a0',
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const trail2 = new THREE.Mesh(this.trailGeo, trail2Mat);
    trail2.rotation.x = Math.PI;
    trail2.position.y = 0.7;
    trail2.scale.set(0.55, 0.65, 0.55);
    rock.add(trail2);

    this.items.push({
      obj: rock,
      life: 0,
      max: duration,
      tick: (t) => {
        rock.position.y = THREE.MathUtils.lerp(fromY, 0.3, t * t);
        rock.rotation.set(t * 9, t * 6, t * 4);
        const flicker = 0.75 + Math.sin(t * 40) * 0.2;
        trailMat.opacity = flicker * (0.5 + 0.5 * (1 - t));
        (spark.material as THREE.SpriteMaterial).opacity = 0.9 * flicker;
      },
      dispose: () => {
        (core.material as THREE.SpriteMaterial).dispose();
        (spark.material as THREE.SpriteMaterial).dispose();
        rockMat.dispose();
        trailMat.dispose();
        trail2Mat.dispose();
      },
    });
  }

  float(pos: THREE.Vector3, text: string, kind: FloatKind) {
    const el = document.createElement('div');
    el.className = `float float-${kind}`;
    const inner = document.createElement('span');
    inner.textContent = text;
    el.appendChild(inner);
    const obj = new CSS2DObject(el);
    obj.position.copy(pos);
    obj.position.x += (Math.random() - 0.5) * 0.4;
    this.scene.add(obj);
    this.items.push({ obj, life: 0, max: kind === 'level' ? 1.8 : 1.0, dispose: () => el.remove() });
  }

  clickMarker(x: number, z: number) {
    this.marker.position.set(x, 0.03, z);
    this.marker.visible = true;
    this.markerLife = 0.5;
  }

  levelUp(target: THREE.Object3D, color = '#ffe27a') {
    const geo = new THREE.CylinderGeometry(0.7, 0.9, 4, 16, 1, true);
    const m = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const pillar = new THREE.Mesh(geo, m);
    pillar.position.y = 2;
    target.add(pillar);
    this.items.push({
      obj: pillar,
      life: 0,
      max: 1.4,
      tick: (t) => {
        pillar.scale.set(1 + t * 0.6, 0.3 + t, 1 + t * 0.6);
        m.opacity = 0.55 * (1 - t);
        pillar.rotation.y += 0.05;
      },
      dispose: () => {
        geo.dispose();
        m.dispose();
      },
    });
  }

  emote(target: THREE.Object3D, height: number, text: string) {
    const el = document.createElement('div');
    el.className = 'emote';
    el.textContent = text;
    const obj = new CSS2DObject(el);
    obj.position.set(0, height + 0.9, 0);
    target.add(obj);
    this.items.push({ obj, life: 0, max: 2.5, dispose: () => el.remove() });
  }

  update(dt: number) {
    this.clock += dt;
    if (this.targetDisk.visible) {
      const pulse = 0.14 + 0.08 * Math.sin(this.clock * 4);
      (this.targetDisk.material as THREE.MeshBasicMaterial).opacity = pulse;
      this.targetRing.rotation.z += dt * 0.6;
      this.targetRingInner.rotation.z -= dt * 0.9;
    }
    if (this.markerLife > 0) {
      this.markerLife -= dt;
      const t = 1 - this.markerLife / 0.5;
      this.marker.scale.setScalar(1 + t * 0.8);
      (this.marker.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - t);
      if (this.markerLife <= 0) this.marker.visible = false;
    }
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life += dt;
      const t = Math.min(1, it.life / it.max);
      it.tick?.(t);
      if (it.life >= it.max) {
        it.obj.removeFromParent();
        it.dispose?.();
        this.items.splice(i, 1);
      }
    }
  }
}

/** A DOM label that follows a 3D object (name + optional HP/SP bars). */
export class Label {
  readonly obj: CSS2DObject;
  readonly el: HTMLDivElement;
  private nameEl: HTMLDivElement;
  private hpFill: HTMLDivElement | null = null;
  private spFill: HTMLDivElement | null = null;
  private bars: HTMLDivElement | null = null;

  constructor(opts: { name: string; className: string; hp?: boolean; sp?: boolean; y: number }) {
    this.el = document.createElement('div');
    this.el.className = `label ${opts.className}`;
    this.nameEl = document.createElement('div');
    this.nameEl.className = 'label-name';
    this.nameEl.textContent = opts.name;
    if (opts.hp) {
      this.bars = document.createElement('div');
      this.bars.className = 'label-bars';
      const hp = document.createElement('div');
      hp.className = 'bar bar-hp';
      this.hpFill = document.createElement('div');
      hp.appendChild(this.hpFill);
      this.bars.appendChild(hp);
      if (opts.sp) {
        const sp = document.createElement('div');
        sp.className = 'bar bar-sp';
        this.spFill = document.createElement('div');
        sp.appendChild(this.spFill);
        this.bars.appendChild(sp);
      }
      this.el.appendChild(this.bars);
    }
    this.el.appendChild(this.nameEl);
    this.obj = new CSS2DObject(this.el);
    this.obj.position.y = opts.y;
  }

  setName(name: string) {
    if (this.nameEl.textContent !== name) this.nameEl.textContent = name;
  }

  setBars(hpRatio: number, spRatio?: number) {
    if (this.hpFill) {
      this.hpFill.style.width = `${Math.max(0, Math.min(1, hpRatio)) * 100}%`;
      this.hpFill.parentElement!.classList.toggle('low', hpRatio < 0.25);
    }
    if (this.spFill && spRatio !== undefined) this.spFill.style.width = `${Math.max(0, Math.min(1, spRatio)) * 100}%`;
  }

  showBars(show: boolean) {
    if (this.bars) this.bars.style.display = show ? '' : 'none';
  }

  setVisible(v: boolean) {
    this.obj.visible = v;
  }

  setMarker(text: string) {
    let m = this.el.querySelector<HTMLDivElement>('.label-marker');
    if (!text) {
      m?.remove();
      return;
    }
    if (!m) {
      m = document.createElement('div');
      m.className = 'label-marker';
      this.el.prepend(m);
    }
    if (m.textContent !== text) m.textContent = text;
  }
}
