import {
  findLandingSurface,
  findWallContact,
  reconcileSupport,
  type DesktopTerrain,
} from './desktop-terrain';

export type DesktopActorState = 'walking' | 'climbing' | 'falling';

export interface DesktopActor {
  x: number;
  y: number;
  width: number;
  height: number;
  state: DesktopActorState;
  facing: 'left' | 'right';
  vx: number;
  vy: number;
  supportId: string | null;
  /** 宠物脚底中心相对平台左边缘的位置，用于跟随正在移动的窗口。 */
  supportOffsetX: number | null;
  climb: { windowId: string; edge: 'left' | 'right' } | null;
}

export interface DesktopMotionOptions {
  walkSpeed: number;
  climbSpeed: number;
  gravity: number;
  maxFallSpeed: number;
}

export const DEFAULT_DESKTOP_MOTION: DesktopMotionOptions = {
  walkSpeed: 60,
  climbSpeed: 80,
  gravity: 1_200,
  maxFallSpeed: 1_600,
};

function falling(actor: DesktopActor): DesktopActor {
  return { ...actor, state: 'falling', supportId: null, supportOffsetX: null, climb: null };
}

/**
 * 推进一只宠物的桌面运动。调用方提供统一时钟和最新桌面地形，因此窗口
 * 移动/消失与动画帧率都不会藏在模块内部，测试可以完全确定。
 */
export function advanceDesktopActor(
  actor: DesktopActor,
  terrain: DesktopTerrain,
  deltaMs: number,
  options: DesktopMotionOptions = DEFAULT_DESKTOP_MOTION,
): DesktopActor {
  if (!Number.isFinite(deltaMs) || deltaMs < 0) return actor;
  const dt = deltaMs / 1_000;

  if (actor.state === 'climbing') return advanceClimbing(actor, terrain, dt, options);
  if (actor.state === 'falling') return advanceFalling(actor, terrain, dt, options);
  return advanceWalking(actor, terrain, dt, options);
}

function advanceWalking(
  actor: DesktopActor,
  terrain: DesktopTerrain,
  dt: number,
  options: DesktopMotionOptions,
): DesktopActor {
  const support = reconcileSupport(actor, actor.supportId, terrain);
  if (support.kind === 'lost') return falling({ ...actor, vy: Math.max(0, actor.vy) });

  const offset = actor.supportOffsetX ?? actor.x + actor.width / 2 - support.left;
  const attachedX = support.left + offset - actor.width / 2;
  const attachedY = support.y - actor.height;
  const attached = { ...actor, x: attachedX, y: attachedY, supportOffsetX: offset, vy: 0 };
  if (dt === 0) return attached;

  const direction = actor.facing === 'right' ? 1 : -1;
  const speed = Math.abs(actor.vx) || options.walkSpeed;
  const nextX = attached.x + direction * speed * dt;
  const wall = findWallContact(attached, nextX, terrain);
  if (wall) {
    return {
      ...attached,
      x: wall.actorX,
      state: 'climbing',
      vx: 0,
      vy: -options.climbSpeed,
      supportId: null,
      supportOffsetX: null,
      climb: { windowId: wall.windowId, edge: wall.edge },
    };
  }

  const nextFootX = nextX + actor.width / 2;
  if (nextFootX < support.left || nextFootX > support.right) {
    return falling({ ...attached, x: nextX, vx: direction * speed, vy: 0 });
  }

  return {
    ...attached,
    x: nextX,
    vx: direction * speed,
    supportOffsetX: nextFootX - support.left,
  };
}

function advanceClimbing(
  actor: DesktopActor,
  terrain: DesktopTerrain,
  dt: number,
  options: DesktopMotionOptions,
): DesktopActor {
  const target = actor.climb;
  if (!target) return falling(actor);
  const wall = terrain.walls.find((candidate) => (
    candidate.windowId === target.windowId && candidate.edge === target.edge
  ));
  if (!wall) return falling(actor);

  const attachedX = wall.edge === 'left' ? wall.x - actor.width : wall.x;
  const topY = wall.top - actor.height;
  const nextY = actor.y - options.climbSpeed * dt;
  if (nextY <= topY) {
    // 简化的转角：到顶后把身体放到平台内侧。后续动作包会用转角序列
    // 替换瞬时姿态，但支撑/坐标语义保持不变。
    const topX = wall.edge === 'left' ? wall.x : wall.x - actor.width;
    return {
      ...actor,
      x: topX,
      y: topY,
      state: 'walking',
      vx: wall.edge === 'left' ? options.walkSpeed : -options.walkSpeed,
      vy: 0,
      supportId: wall.windowId,
      supportOffsetX: topX + actor.width / 2 - (wall.edge === 'left' ? wall.x : terrain.platforms.find((p) => p.id === wall.windowId)?.left ?? wall.x),
      climb: null,
      facing: wall.edge === 'left' ? 'right' : 'left',
    };
  }

  return { ...actor, x: attachedX, y: nextY, vx: 0, vy: -options.climbSpeed };
}

function advanceFalling(
  actor: DesktopActor,
  terrain: DesktopTerrain,
  dt: number,
  options: DesktopMotionOptions,
): DesktopActor {
  const nextVy = Math.min(options.maxFallSpeed, actor.vy + options.gravity * dt);
  const nextY = actor.y + nextVy * dt;
  const footX = actor.x + actor.width / 2;
  const landing = findLandingSurface({
    previousFootY: actor.y + actor.height,
    nextFootY: nextY + actor.height,
    footX,
  }, terrain);

  if (!landing) return { ...actor, y: nextY, vy: nextVy };
  return {
    ...actor,
    y: landing.y - actor.height,
    state: 'walking',
    vx: actor.vx || (actor.facing === 'right' ? options.walkSpeed : -options.walkSpeed),
    vy: 0,
    supportId: landing.id,
    supportOffsetX: footX - landing.left,
    climb: null,
  };
}
