import { advanceDesktopActor, DEFAULT_DESKTOP_MOTION, type DesktopActor } from './desktop-motion';
import type { DesktopRect, DesktopTerrain } from './desktop-terrain';
import { MAX_THROW_SPEED, type PointerVelocity } from './pointer-velocity';

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

  release(velocity: PointerVelocity): void {
    const vx = Number.isFinite(velocity.vx)
      ? Math.max(-MAX_THROW_SPEED, Math.min(MAX_THROW_SPEED, velocity.vx))
      : 0;
    const vy = Number.isFinite(velocity.vy)
      ? Math.max(-MAX_THROW_SPEED, Math.min(MAX_THROW_SPEED, velocity.vy))
      : 0;
    this.wandering = false;
    this.actor = {
      ...this.actor,
      state: 'falling',
      facing: vx < 0 ? 'left' : vx > 0 ? 'right' : this.actor.facing,
      vx,
      vy,
      supportId: null,
      supportOffsetX: null,
      climb: null,
    };
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
    // 初次出现或尺寸复位属于垂直落地，不应像主动投掷一样横向漂移。
    vx: 0,
    vy: 0,
    supportId: null,
    supportOffsetX: null,
    climb: null,
  };
}
