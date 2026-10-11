import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

export type FloatKind = 'dmg' | 'crit' | 'miss' | 'hurt' | 'heal' | 'info' | 'level';

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

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(0.28, 0.4, 24),
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false }),
    );
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.visible = false;
    scene.add(this.marker);
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
