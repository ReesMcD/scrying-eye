import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { canPlace, distanceFeet, SIZE_SQUARES, tokenAt, type Cell, type MapToken, type TerrainKind } from '../../../src/shared/battlemap';
import { buildScene, cellAt, figureOf, sceneKey, type BoxPart, type MapScene } from '../../../src/shared/mapScene';
import { roomCells } from '../../../src/shared/mapSight';
import type { MapViewProps, TokenInfo } from './BattleMapView';
import { initials, label, paintFog, paintGrid, paintOverlays, paintTerrain, palette, picture, type Palette } from './paint';

/**
 * The 3D battle map (#53), drawn with three.js. The floor is the 2D map painted from above (ground,
 * water, difficult ground, spell areas, fog, art), and on it stand walls, doors, raised ground,
 * cover, objects and the tokens as figures. It draws only when something changes: no render
 * loop, so an idle map costs nothing.
 */

/** Built as boxes and props instead of being painted on the floor. */
const BUILT: ReadonlySet<TerrainKind> = new Set(['wall', 'door', 'cover', 'object']);
const TAP_SLOP = 6;
/** Squares at least this big on screen (CSS px) leave room for every token's name. */
const TAGS_FROM_PX = 22;

const PART_COLOUR: Record<BoxPart, number> = {
  wall: 0x8d8a84,
  secret: 0x8d8a84,
  door: 0x8a5a2b,
  lintel: 0x8d8a84,
  elevation: 0x857a69,
  cover: 0x7a5a3a,
  object: 0x6e6a66,
};

type Drag = { pointer: number; token: MapToken; from: Cell; to: Cell; startX: number; startY: number; moved: boolean };

interface FigureMeshes {
  group: THREE.Group;
  body: THREE.Mesh[];
  turnRing: THREE.Mesh;
  pickRing: THREE.Mesh;
  tag: THREE.Sprite;
  tagKey: string;
  shape: string;
}

export class MapEngine3d {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
  private readonly controls: OrbitControls;
  private readonly sun = new THREE.DirectionalLight(0xffffff, 1.7);
  private readonly world = new THREE.Group();
  private readonly figures = new Map<string, FigureMeshes>();
  private readonly floorCanvas = document.createElement('canvas');
  private readonly floorTexture: THREE.CanvasTexture;
  private readonly observer: ResizeObserver;
  private model: MapScene | null = null;
  private builtKey = '';
  private floorKey = '';
  private drag: Drag | null = null;
  private down: { x: number; y: number; pointer: number } | null = null;
  private frame = 0;
  private animation = 0;
  private colors: Palette;
  private readonly guide: HTMLDivElement;
  /** A touch screen: likely a phone, so lighter shadows and textures. */
  private readonly coarse: boolean;

  constructor(
    private readonly el: HTMLElement,
    private readonly props: () => MapViewProps,
  ) {
    // Throws where WebGL isn't available; the caller falls back to 2D.
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    // Transparent: the map box's own background shows around the board.
    this.renderer.setClearColor(0x000000, 0);
    const coarse = (this.coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.setAttribute('role', 'img');
    this.renderer.domElement.style.touchAction = 'none';
    el.prepend(this.renderer.domElement);
    this.colors = palette(el);

    this.guide = document.createElement('div');
    this.guide.className = 'map3d-guide';
    this.guide.hidden = true;
    el.append(this.guide);

    this.floorTexture = new THREE.CanvasTexture(this.floorCanvas);
    this.floorTexture.colorSpace = THREE.SRGBColorSpace;
    this.floorTexture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());

    this.scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x3a3328, 1.1));
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun, this.sun.target, this.world);

    // Token drags take the pointer before the camera controls see it.
    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.maxPolarAngle = Math.PI * 0.47;
    this.controls.minDistance = 2;
    this.controls.screenSpacePanning = false;
    this.controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    this.controls.addEventListener('change', () => this.render());

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(el);
    this.resize();
  }

  /** Brings the scene up to date with the props; cheap when nothing changed. */
  update(): void {
    const { map } = this.props();
    const key = sceneKey(map);
    if (key !== this.builtKey) {
      const first = !this.builtKey;
      const sized = this.model && this.model.width === map.width && this.model.height === map.height;
      this.builtKey = key;
      this.model = buildScene(map);
      this.buildWorld(this.model);
      if (first || !sized) this.resetView();
    }
    this.paintFloor();
    this.syncFigures();
    this.render();
  }

  /** A fresh look at the palette (light or dark) and the floor. */
  restyle(): void {
    this.colors = palette(this.el);
    this.floorKey = '';
    this.figures.forEach((f) => this.world.remove(f.group));
    this.figures.clear();
    this.update();
  }

  // --- Camera ----------------------------------------------------------------------------------

  /** The whole map from the south, high enough to see into rooms over their walls. */
  resetView(): void {
    const m = this.model;
    if (!m) return;
    this.controls.maxDistance = Math.max(m.width, m.height) * 3 + 20;
    const area = this.viewArea(m);
    const centre = new THREE.Vector3(area.x + area.w / 2, 0, area.z + area.d / 2);
    this.moveCamera(centre, centre.clone().add(new THREE.Vector3(0, 1.05, 0.72).setLength(this.fitDistance(area.w, area.d))));
  }

  /** What's worth framing: the whole map, or for players under fog, what they've seen of it. */
  private viewArea(m: MapScene): { x: number; z: number; w: number; d: number } {
    const fog = this.props().fog;
    if (fog?.solid && fog.revealed.size) {
      const cells = [...fog.revealed].map((k) => k.split(',').map(Number) as [number, number]);
      const xs = cells.map((c) => c[0]);
      const zs = cells.map((c) => c[1]);
      const x = Math.min(...xs);
      const z = Math.min(...zs);
      return { x, z, w: Math.max(...xs) - x + 1, d: Math.max(...zs) - z + 1 };
    }
    return { x: 0, z: 0, w: m.width, d: m.height };
  }

  /** How far back the camera stands to fit an area in the box, whatever its shape. */
  private fitDistance(w: number, d: number): number {
    const v = THREE.MathUtils.degToRad(this.camera.fov) / 2;
    const h = Math.atan(Math.tan(v) * this.camera.aspect);
    return Math.max(w / 2 / Math.tan(h), d / 2 / Math.tan(v)) * 1.08 + 1;
  }

  /** Straight down, as on the 2D map. */
  topView(): void {
    const m = this.model;
    if (!m) return;
    const area = this.viewArea(m);
    const [cx, cz] = [area.x + area.w / 2, area.z + area.d / 2];
    this.moveCamera(new THREE.Vector3(cx, 0, cz), new THREE.Vector3(cx, this.fitDistance(area.w, area.d), cz + 0.01));
  }

  /** Closer, onto a token (whose turn it is, or my own). */
  lookAt(tokenId: string): void {
    const { map } = this.props();
    const t = map.tokens.find((x) => x.id === tokenId);
    if (!t || !this.model) return;
    const f = figureOf(this.model, t, t.at);
    const target = new THREE.Vector3(f.x, f.y, f.z);
    // Keep the direction we're looking from, at a closer distance.
    const offset = this.camera.position.clone().sub(this.controls.target).setLength(Math.max(6, f.height * 5));
    this.moveCamera(target, target.clone().add(offset));
  }

  private moveCamera(target: THREE.Vector3, position: THREE.Vector3): void {
    cancelAnimationFrame(this.animation);
    const fromTarget = this.controls.target.clone();
    const fromPosition = this.camera.position.clone();
    const first = fromPosition.lengthSq() === 0;
    const start = performance.now();
    const duration = first || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 450;
    const step = () => {
      const t = duration ? Math.min(1, (performance.now() - start) / duration) : 1;
      const k = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      this.controls.target.lerpVectors(fromTarget, target, k);
      this.camera.position.lerpVectors(fromPosition, position, k);
      this.controls.update();
      if (t < 1) this.animation = requestAnimationFrame(step);
    };
    step();
  }

  // --- Building --------------------------------------------------------------------------------

  private buildWorld(m: MapScene): void {
    disposeTree(this.world, this.floorTexture);
    this.world.clear();
    this.figures.clear();
    const { showNotes } = this.props();

    // The board: the painted floor on a slab.
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(m.width, m.height), new THREE.MeshStandardMaterial({ map: this.floorTexture, roughness: 0.95 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(m.width / 2, 0, m.height / 2);
    floor.receiveShadow = true;
    floor.name = 'floor';
    const slab = new THREE.Mesh(new THREE.BoxGeometry(m.width + 0.4, 0.5, m.height + 0.4), new THREE.MeshStandardMaterial({ color: 0x2a2621, roughness: 1 }));
    slab.position.set(m.width / 2, -0.26, m.height / 2);
    slab.receiveShadow = true;
    this.world.add(floor, slab);

    // Boxes, one instanced mesh per kind of thing.
    const unit = new THREE.BoxGeometry(1, 1, 1);
    const byPart = new Map<string, typeof m.boxes>();
    for (const b of m.boxes) {
      const k = b.part === 'door' ? `door-${b.state === 'locked' ? 'locked' : 'plain'}` : b.part === 'secret' && !showNotes ? 'wall' : b.part;
      byPart.set(k, [...(byPart.get(k) ?? []), b]);
    }
    const matrix = new THREE.Matrix4();
    for (const [k, boxes] of byPart) {
      const part = k.startsWith('door') ? 'door' : (k as BoxPart);
      const material = new THREE.MeshStandardMaterial({ color: k === 'door-locked' ? 0x5e3b1c : PART_COLOUR[part], roughness: part === 'door' || part === 'cover' ? 0.75 : 0.92 });
      // The DM sees which wall is a secret door.
      if (part === 'secret') material.emissive = new THREE.Color(this.colors.warn).multiplyScalar(0.35);
      const mesh = new THREE.InstancedMesh(unit, material, boxes.length);
      boxes.forEach((b, i) => {
        matrix.compose(new THREE.Vector3(b.x + b.w / 2, b.y + b.h / 2, b.z + b.d / 2), new THREE.Quaternion(), new THREE.Vector3(b.w, b.h, b.d));
        mesh.setMatrixAt(i, matrix);
      });
      mesh.castShadow = part !== 'elevation';
      mesh.receiveShadow = true;
      this.world.add(mesh);
    }

    // Raised ground keeps the floor's picture on top.
    const tops = m.boxes.filter((b) => b.part === 'elevation');
    if (tops.length) this.world.add(this.floorPatches(tops, m));

    this.addProps(m);
    this.addWater(m);
    this.placeSun(m);
  }

  /** Squares of the floor picture lifted to the top of raised ground. */
  private floorPatches(tops: MapScene['boxes'], m: MapScene): THREE.Mesh {
    const positions: number[] = [];
    const uvs: number[] = [];
    for (const b of tops) {
      const y = b.y + b.h + 0.002;
      const corners: Array<[number, number]> = [
        [b.x, b.z],
        [b.x, b.z + b.d],
        [b.x + b.w, b.z + b.d],
        [b.x, b.z],
        [b.x + b.w, b.z + b.d],
        [b.x + b.w, b.z],
      ];
      for (const [x, z] of corners) {
        positions.push(x, y, z);
        uvs.push(x / m.width, 1 - z / m.height);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map: this.floorTexture, roughness: 0.95 }));
    mesh.receiveShadow = true;
    return mesh;
  }

  private addProps(m: MapScene): void {
    const matrix = new THREE.Matrix4();
    const spin = (seed: number) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), seed * Math.PI * 2);
    const make = (geometry: THREE.BufferGeometry, material: THREE.Material, list: Array<{ p: THREE.Vector3; q: THREE.Quaternion; s: THREE.Vector3; color?: THREE.Color }>) => {
      if (!list.length) return;
      const mesh = new THREE.InstancedMesh(geometry, material, list.length);
      list.forEach((x, i) => {
        mesh.setMatrixAt(i, matrix.compose(x.p, x.q, x.s));
        if (x.color) mesh.setColorAt(i, x.color);
      });
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.world.add(mesh);
    };
    const trees = m.props.filter((p) => p.kind === 'tree');
    const bushes = m.props.filter((p) => p.kind === 'bush');
    const leaf = (seed: number) => new THREE.Color().setHSL(0.27 + seed * 0.08, 0.45, 0.24 + seed * 0.08);
    make(
      new THREE.CylinderGeometry(0.08, 0.13, 1, 7),
      new THREE.MeshStandardMaterial({ color: 0x5a4027, roughness: 1 }),
      trees.map((t) => ({ p: new THREE.Vector3(t.x, t.y + t.h * 0.2, t.z), q: spin(t.seed), s: new THREE.Vector3(1, t.h * 0.4, 1) })),
    );
    const crown = new THREE.IcosahedronGeometry(1, 1);
    const leaves = new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true });
    make(crown, leaves, [
      ...trees.map((t) => ({ p: new THREE.Vector3(t.x, t.y + t.h * 0.62, t.z), q: spin(t.seed), s: new THREE.Vector3(0.62, t.h * 0.42, 0.62), color: leaf(t.seed) })),
      ...bushes.map((b) => ({ p: new THREE.Vector3(b.x, b.y + b.h * 0.45, b.z), q: spin(b.seed), s: new THREE.Vector3(0.42, b.h * 0.6, 0.42), color: leaf(b.seed) })),
    ]);
    const pillars = m.props.filter((p) => p.kind === 'pillar');
    make(
      new THREE.CylinderGeometry(0.32, 0.36, 1, 14),
      new THREE.MeshStandardMaterial({ color: PART_COLOUR.wall, roughness: 0.9 }),
      pillars.map((p) => ({ p: new THREE.Vector3(p.x, p.y + p.h / 2, p.z), q: new THREE.Quaternion(), s: new THREE.Vector3(1, p.h, 1) })),
    );
    const rocks = m.props.filter((p) => p.kind === 'rock');
    make(
      new THREE.DodecahedronGeometry(0.3, 0),
      new THREE.MeshStandardMaterial({ color: 0x77736d, roughness: 1, flatShading: true }),
      rocks.flatMap((r) =>
        // A few stones per square of rubble; one boulder otherwise.
        (r.h < 0.5 ? [0, 1, 2] : [0]).map((n) => {
          const a = r.seed * 6.28 + n * 2.1;
          const size = r.h < 0.5 ? 0.35 + ((r.seed * (n + 3)) % 0.4) : r.h * 1.4;
          return { p: new THREE.Vector3(r.x + (r.h < 0.5 ? Math.cos(a) * 0.25 : 0), r.y + size * 0.12, r.z + (r.h < 0.5 ? Math.sin(a) * 0.25 : 0)), q: spin(r.seed + n * 0.3), s: new THREE.Vector3(size, size * 0.7, size) };
        }),
      ),
    );
  }

  private addWater(m: MapScene): void {
    for (const deep of [false, true]) {
      const cells = m.water.filter((w) => w.deep === deep);
      if (!cells.length) continue;
      const mesh = new THREE.InstancedMesh(
        new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: deep ? 0x24548c : 0x4d8cc4, transparent: true, opacity: deep ? 0.7 : 0.45, roughness: 0.15, metalness: 0.1, depthWrite: false }),
        cells.length,
      );
      const matrix = new THREE.Matrix4();
      cells.forEach((w, i) => mesh.setMatrixAt(i, matrix.makeTranslation(w.x + 0.5, 0.04, w.z + 0.5)));
      mesh.receiveShadow = true;
      this.world.add(mesh);
    }
  }

  /** Afternoon light from the south-west, its shadows covering the whole map. */
  private placeSun(m: MapScene): void {
    const size = Math.max(m.width, m.height);
    this.sun.position.set(m.width / 2 - size * 0.45, size * 1.1, m.height / 2 + size * 0.6);
    this.sun.target.position.set(m.width / 2, 0, m.height / 2);
    const cam = this.sun.shadow.camera;
    cam.left = cam.bottom = -size * 0.85;
    cam.right = cam.top = size * 0.85;
    cam.near = 0.5;
    cam.far = size * 3.5;
    cam.updateProjectionMatrix();
  }

  // --- The floor -------------------------------------------------------------------------------

  /** The floor picture: the 2D map without what's built in 3D, repainted when anything on it changes. */
  private paintFloor(): void {
    const { map, art, fog, overlays, showNotes } = this.props();
    const key = JSON.stringify([this.builtKey, fog ? [...fog.revealed].join(';') : null, fog?.solid, overlays, art?.ids.map((id) => !!picture(id)), showNotes, this.colors]);
    if (key === this.floorKey) return;
    this.floorKey = key;
    // Up to 48 px a square, within a texture a phone can hold (an 80-square map at 4096 px is 64 MB).
    const most = Math.min(this.renderer.capabilities.maxTextureSize, this.coarse ? 2048 : 3072);
    const s = Math.max(8, Math.min(48, Math.floor(most / Math.max(map.width, map.height))));
    this.floorCanvas.width = map.width * s;
    this.floorCanvas.height = map.height * s;
    const ctx = this.floorCanvas.getContext('2d');
    if (!ctx) return;
    paintTerrain(ctx, map, s, this.colors, art, BUILT);
    paintGrid(ctx, map, s, this.colors);
    if (showNotes) {
      for (const room of map.rooms ?? []) {
        const cells = roomCells(map, room);
        if (!cells.length) continue;
        label(ctx, room.name ? `${room.id}. ${room.name}` : room.id, Math.min(...cells.map((c) => c[0])) * s + 4, Math.min(...cells.map((c) => c[1])) * s + 13, this.colors, this.colors.warn, 'left');
      }
      // The DM's notes: a dot in the corner of the square, as on the flat map.
      ctx.fillStyle = this.colors.warn;
      for (const n of map.notes) {
        ctx.beginPath();
        ctx.arc((n.at[0] + 0.85) * s, (n.at[1] + 0.15) * s, Math.max(3, s * 0.12), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (fog) paintFog(ctx, map, s, fog, this.colors);
    paintOverlays(ctx, overlays ?? [], s, this.colors);
    this.floorTexture.needsUpdate = true;
  }

  // --- Figures ---------------------------------------------------------------------------------

  private syncFigures(): void {
    const { map, info, selected } = this.props();
    if (!this.model) return;
    const seen = new Set<string>();
    for (const t of map.tokens) {
      seen.add(t.id);
      const ti = info[t.id];
      const shape = `${t.size}|${t.kind}|${!!ti?.hidden}`;
      let fig = this.figures.get(t.id);
      if (fig && fig.shape !== shape) {
        this.world.remove(fig.group);
        disposeTree(fig.group);
        fig = undefined;
      }
      if (!fig) {
        fig = this.makeFigure(t, ti, shape);
        this.figures.set(t.id, fig);
        this.world.add(fig.group);
      }
      const at = this.drag?.token.id === t.id && this.drag.moved ? this.drag.to : t.at;
      const f = figureOf(this.model, t, at);
      fig.group.position.set(f.x, f.y, f.z);
      fig.turnRing.visible = !!ti?.current;
      fig.pickRing.visible = selected === t.id || !!ti?.mine;
      (fig.pickRing.material as THREE.MeshBasicMaterial).color.set(selected === t.id ? this.colors.text : this.colors.accent);
      const tagKey = JSON.stringify([ti?.name ?? t.name, ti?.hp, ti?.maxHp]);
      if (tagKey !== fig.tagKey) {
        fig.tagKey = tagKey;
        this.paintTag(fig.tag, ti?.name ?? t.name, ti);
      }
    }
    for (const [id, fig] of this.figures) {
      if (seen.has(id)) continue;
      this.world.remove(fig.group);
      disposeTree(fig.group);
      this.figures.delete(id);
    }
  }

  private makeFigure(t: MapToken, ti: TokenInfo | undefined, shape: string): FigureMeshes {
    const f = figureOf(this.model!, t, t.at);
    const colour = new THREE.Color(t.kind === 'pc' ? this.colors.accent : t.kind === 'npc' ? this.colors.warn : this.colors.bad);
    const faded = !!ti?.hidden;
    const skin = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.55, transparent: faded, opacity: faded ? 0.4 : 1 });
    const dark = new THREE.MeshStandardMaterial({ color: colour.clone().multiplyScalar(0.45), roughness: 0.7, transparent: faded, opacity: faded ? 0.4 : 1 });
    const group = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(f.radius, f.radius * 1.05, 0.08, 32), dark);
    base.position.y = 0.04;
    const torso = f.height * 0.5;
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(f.radius * 0.5, torso, 4, 14), skin);
    body.position.y = 0.08 + f.radius * 0.5 + torso / 2;
    const head = new THREE.Mesh(new THREE.SphereGeometry(f.radius * 0.42, 18, 14), skin);
    head.position.y = 0.08 + f.radius + torso + f.radius * 0.3;
    for (const m of [base, body, head]) {
      m.castShadow = true;
      m.receiveShadow = true;
      m.userData.tokenId = t.id;
    }
    const ring = (radius: number, colour: string) => {
      const r = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.035, 8, 48), new THREE.MeshBasicMaterial({ color: colour }));
      r.rotation.x = Math.PI / 2;
      r.position.y = 0.06;
      return r;
    };
    const turnRing = ring(f.radius + 0.1, this.colors.text);
    const pickRing = ring(f.radius + 0.2, this.colors.accent);
    // The same size on screen however far the camera is, so names stay readable zoomed out.
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, transparent: true, sizeAttenuation: false }));
    tag.renderOrder = 10;
    // Anchored by its bottom edge, just over the head.
    tag.center.set(0.5, 0);
    tag.position.y = head.position.y + f.radius * 0.42 + 0.15;
    group.add(base, body, head, turnRing, pickRing, tag);
    return { group, body: [base, body, head], turnRing, pickRing, tag, tagKey: '', shape };
  }

  /** The name and HP bar floating over a figure. */
  private paintTag(tag: THREE.Sprite, name: string, ti: TokenInfo | undefined): void {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    const font = '600 30px system-ui, sans-serif';
    ctx.font = font;
    const text = name.length > 18 ? `${initials(name)} · ${name.slice(0, 14)}…` : name;
    const width = Math.ceil(ctx.measureText(text).width) + 28;
    const hasHp = ti?.hp != null && !!ti.maxHp;
    canvas.width = width;
    canvas.height = hasHp ? 58 : 44;
    ctx.font = font;
    ctx.fillStyle = this.colors.surface;
    ctx.globalAlpha = 0.88;
    ctx.beginPath();
    ctx.roundRect(0, 0, width, canvas.height, 10);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.colors.text;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 14, 23);
    if (hasHp) {
      const frac = Math.max(0, Math.min(1, ti!.hp! / ti!.maxHp!));
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(12, 44, width - 24, 7);
      ctx.fillStyle = frac === 0 ? this.colors.muted : frac <= 0.25 ? this.colors.bad : frac <= 0.5 ? this.colors.warn : this.colors.good;
      ctx.fillRect(12, 44, (width - 24) * frac, 7);
    }
    const material = tag.material;
    material.map?.dispose();
    material.map = new THREE.CanvasTexture(canvas);
    material.map.colorSpace = THREE.SRGBColorSpace;
    material.needsUpdate = true;
    const h = hasHp ? 0.034 : 0.026;
    tag.scale.set((h * canvas.width) / canvas.height, h, 1);
  }

  // --- Pointer: drag a token, tap a square -----------------------------------------------------

  private readonly raycaster = new THREE.Raycaster();

  private pointerRay(e: PointerEvent): void {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.raycaster.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera);
  }

  private tokenUnder(e: PointerEvent): MapToken | undefined {
    this.pointerRay(e);
    const meshes = [...this.figures.values()].flatMap((f) => f.body);
    const hit = this.raycaster.intersectObjects(meshes, false)[0];
    const id = hit?.object.userData.tokenId as string | undefined;
    return id ? this.props().map.tokens.find((t) => t.id === id) : undefined;
  }

  /** The square on the ground under the pointer (at a height, for a token standing on a dais). */
  private groundCell(e: PointerEvent, height = 0): Cell | null {
    this.pointerRay(e);
    const point = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -height), point) || !this.model) return null;
    return cellAt(this.model, point.x, point.z);
  }

  private readonly onPointerDown = (e: PointerEvent) => {
    if (!e.isPrimary) {
      // A second finger: the camera's pinch, not a drag.
      this.cancelDrag();
      return;
    }
    this.down = { x: e.clientX, y: e.clientY, pointer: e.pointerId };
    const token = this.tokenUnder(e);
    if (token && this.props().canMove(token.id)) {
      this.controls.enabled = false;
      this.drag = { pointer: e.pointerId, token, from: token.at, to: token.at, startX: e.clientX, startY: e.clientY, moved: false };
      this.renderer.domElement.setPointerCapture(e.pointerId);
    }
  };

  private readonly onPointerMove = (e: PointerEvent) => {
    const d = this.drag;
    if (!d || d.pointer !== e.pointerId) return;
    if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < TAP_SLOP) return;
    d.moved = true;
    const n = SIZE_SQUARES[d.token.size];
    const cell = this.groundCell(e);
    if (cell) {
      const { map } = this.props();
      // Grab it by its middle: the pointer is the centre of its squares.
      d.to = [Math.max(0, Math.min(map.width - n, cell[0] - Math.floor((n - 1) / 2))), Math.max(0, Math.min(map.height - n, cell[1] - Math.floor((n - 1) / 2)))];
      const ok = canPlace(map, d.token.id, d.token.size, d.to).ok;
      this.showGuide(`${distanceFeet(d.from, d.to)} ft`, ok, e);
    }
    this.syncFigures();
    this.render();
  };

  private readonly onPointerUp = (e: PointerEvent) => {
    const d = this.drag;
    const down = this.down;
    this.down = null;
    if (d && d.pointer === e.pointerId) {
      this.drag = null;
      this.controls.enabled = true;
      this.hideGuide();
      const props = this.props();
      if (d.moved) {
        if ((d.to[0] !== d.from[0] || d.to[1] !== d.from[1]) && canPlace(props.map, d.token.id, d.token.size, d.to).ok) props.onMove(d.token.id, d.to);
      } else props.onTap?.(d.token.at, d.token);
      this.syncFigures();
      this.render();
      return;
    }
    // A tap (not a turn of the camera) on a square or a token the viewer can't move.
    if (down && down.pointer === e.pointerId && Math.hypot(e.clientX - down.x, e.clientY - down.y) < TAP_SLOP) {
      const props = this.props();
      const token = this.tokenUnder(e);
      const cell = token ? token.at : this.groundCell(e);
      if (cell) props.onTap?.(cell, token ?? tokenAt(props.map, cell));
    }
  };

  private cancelDrag(): void {
    if (!this.drag) return;
    this.drag = null;
    this.controls.enabled = true;
    this.hideGuide();
    this.syncFigures();
    this.render();
  }

  private showGuide(text: string, ok: boolean, e: PointerEvent): void {
    const r = this.el.getBoundingClientRect();
    this.guide.hidden = false;
    this.guide.textContent = ok ? text : `${text} · can't stand there`;
    this.guide.classList.toggle('bad', !ok);
    this.guide.style.left = `${e.clientX - r.left}px`;
    this.guide.style.top = `${e.clientY - r.top - 44}px`;
  }

  private hideGuide(): void {
    this.guide.hidden = true;
  }

  // --- Drawing ---------------------------------------------------------------------------------

  private resize(): void {
    const w = this.el.clientWidth;
    const h = this.el.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.render();
  }

  /** Draws on the next frame (several changes in one frame draw once). */
  render(): void {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => {
      this.showTags();
      this.renderer.render(this.scene, this.camera);
    });
  }

  /**
   * Zoomed out, squares get too small for every name to fit, and tags pile up: then only whose
   * turn it is, my own and the selected token keep theirs.
   */
  private showTags(): void {
    const distance = this.camera.position.distanceTo(this.controls.target);
    const pxPerSquare = this.el.clientHeight / (2 * distance * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2));
    const roomy = pxPerSquare >= TAGS_FROM_PX;
    const { info, selected } = this.props();
    for (const [id, fig] of this.figures) fig.tag.visible = roomy || !!info[id]?.current || !!info[id]?.mine || selected === id;
  }

  setLabel(text: string): void {
    this.renderer.domElement.setAttribute('aria-label', text);
  }

  dispose(): void {
    cancelAnimationFrame(this.frame);
    cancelAnimationFrame(this.animation);
    this.observer.disconnect();
    this.controls.dispose();
    disposeTree(this.scene, this.floorTexture);
    this.floorTexture.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.guide.remove();
  }
}

/** Frees the GPU memory of everything under an object, except a texture that's kept (the floor). */
function disposeTree(root: THREE.Object3D, keep?: THREE.Texture): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh | THREE.Sprite;
    if ('geometry' in mesh && mesh.geometry) mesh.geometry.dispose();
    const materials = 'material' in mesh ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [];
    for (const m of materials) {
      if (!m) continue;
      const map = (m as THREE.MeshStandardMaterial).map;
      if (map && map !== keep) map.dispose();
      m.dispose();
    }
  });
}
