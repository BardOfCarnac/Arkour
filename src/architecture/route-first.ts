import type { ScenePlan } from '../run/scene-plan';
import type { RunWorld } from '../run/types';
import type { ArchitectureOptions } from './generate';
import { generateStructuralArchitecture } from './structural';

/**
 * Production composition point for the reconciled Arkour architecture model.
 *
 * Route geometry and keep-out authority live in the runtime, because they must
 * govern every proposed scene piece. The older structural generator is retained
 * here as a builder: it proposes the connected chassis and encounter vocabulary,
 * while the route-first scenery admission pass decides which pieces are legal.
 *
 * Future passes (connectivity-aware node families, vertical-city packing,
 * surface mirror) should be composed here rather than bypassing this seam.
 */
export function generateRouteFirstArchitecture(
  world: RunWorld,
  options: ArchitectureOptions = {},
): ScenePlan {
  return generateStructuralArchitecture(world, options);
}
