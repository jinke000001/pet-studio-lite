import { advanceDesktopActor, DEFAULT_DESKTOP_MOTION, type DesktopActor } from './desktop-motion';
import type { DesktopRect, DesktopTerrain } from './desktop-terrain';

export type DesktopRuntimeVisualState = 'idle' | 'walking' | 'jumping';

/**
 * Renderer-facing wrapper around the deterministic motion core. It separates
 * "currently wandering" from physical attachment: an idle pet still follows a
 * moved platform and falls when that platform disappears.
 */
export class DesktopRuntimeSession {
  private actor: DesktopActor;
  private wandering = false;

  constructor(bounds: DesktopRect, facing: 'left' | 'right' = 'right') {
    this.actor = actorFromBounds(bounds, facing);
  }

  get current(): Readonly<DesktopActor> {
    return this.actor;
  }

  get visualState(): DesktopRuntimeVisualState {
    if (this.actor.state === 'falling') return 'jumping';
    return this.wandering || this.actor.state === 'climbing' ? 'walking' : 'idle';
  }

  setWalking(enabled: boolean, facing: 'left' | 'right' = this.actor.facing): void {
    this.wandering = enabled;
    this.actor = {
      ...this.actor,
      facing,
      vx: enabled ? (facing === 'right' ? DEFAULT_DESKTOP_MOTION.walkSpeed : -DEFAULT_DESKTOP_MOTION.walkSpeed) : this.actor.vx,
    };
  }

  reset(bounds: DesktopRect): void {
    this.actor = actorFromBounds(bounds, this.actor.facing);
  }

  advance(terrain: DesktopTerrain, deltaMs: number): Readonly<DesktopActor> {
    const physicallyMoving = this.wandering || this.actor.state !== 'walking';
    let next = advanceDesktopActor(this.actor, terrain, physicallyMoving ? deltaMs : 0);
    // A stationary attached pet must begin falling in the same frame that its
    // support vanishes instead of hovering for one extra update.
    if (!physicallyMoving && next.state === 'falling') {
      next = advanceDesktopActor(next, terrain, deltaMs);
    }
    this.actor = next;
    return this.actor;
  }
}

function actorFromBounds(bounds: DesktopRect, facing: 'left' | 'right'): DesktopActor {
  if (![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)
    || bounds.width <= 0 || bounds.height <= 0) {
    throw new Error('Shimeji actor bounds must be finite and greater than zero');
  }
  return {
    ...bounds,
    state: 'falling',
    facing,
    vx: facing === 'right' ? DEFAULT_DESKTOP_MOTION.walkSpeed : -DEFAULT_DESKTOP_MOTION.walkSpeed,
    vy: 0,
    supportId: null,
    supportOffsetX: null,
    climb: null,
  };
}
