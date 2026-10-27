import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KIT_MODELS, type KitModel, type KitPlan } from '../../../src/shared/kitPlan';

/**
 * KayKit's Dungeon models (CC0, bundled in web/public/kaykit/): loaded once per page, then drawn as
 * instanced meshes, one per part of each model, so a dungeon of thousands of tiles stays cheap.
 * The models' geometry and materials are shared and never disposed.
 */

type Kit = Map<KitModel, THREE.Object3D>;
let loaded: Kit | null = null;
let loading: Promise<Kit> | null = null;

/** The models, once they've loaded (null until then). */
export const kitModels = (): Kit | null => loaded;

/** Loads every model; resolves when all are in (a failure leaves the plain boxes in place). */
export function loadKit(): Promise<Kit> {
  loading ??= (async () => {
    const loader = new GLTFLoader();
    const base = `${import.meta.env.BASE_URL}kaykit/`;
    const entries = await Promise.all(KIT_MODELS.map(async (name) => [name, (await loader.loadAsync(`${base}${name}.glb`)).scene] as const));
    loaded = new Map(entries);
    return loaded;
  })();
  return loading;
}

/** The plan's pieces as instanced meshes, marked `kit` so the engine never disposes the shared models. */
export function buildKit(plan: KitPlan, kit: Kit): THREE.Group {
  const group = new THREE.Group();
  const byModel = new Map<KitModel, KitPlan['pieces']>();
  for (const p of plan.pieces) byModel.set(p.model, [...(byModel.get(p.model) ?? []), p]);
  const place = new THREE.Matrix4();
  const up = new THREE.Vector3(0, 1, 0);
  for (const [name, pieces] of byModel) {
    const model = kit.get(name);
    if (!model) continue;
    model.updateMatrixWorld(true);
    const floor = name.startsWith('floor_');
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const instanced = new THREE.InstancedMesh(mesh.geometry, mesh.material, pieces.length);
      pieces.forEach((p, i) => {
        place.compose(new THREE.Vector3(p.x, p.y, p.z), new THREE.Quaternion().setFromAxisAngle(up, p.turn), new THREE.Vector3(p.sx, p.sy, p.sz));
        instanced.setMatrixAt(i, place.clone().multiply(mesh.matrixWorld));
      });
      instanced.castShadow = !floor;
      instanced.receiveShadow = true;
      instanced.userData.kit = true;
      group.add(instanced);
    });
  }
  return group;
}
