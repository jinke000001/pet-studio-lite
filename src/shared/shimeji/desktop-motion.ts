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
  if (support.id === 'work-area-floor') {
    const minX = terrain.workArea.x;
    const maxX = terrain.workArea.x + terrain.workArea.width - actor.width;
    if (nextX < minX || nextX > maxX) {
      const facing = nextX > maxX ? 'left' : 'right';
      const x = Math.max(minX, Math.min(nextX, maxX));
      return {
        ...attached,
        x,
        facing,
        vx: facing === 'right' ? speed : -speed,
        supportOffsetX: x + actor.width / 2 - support.left,
      };
    }
  }
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
  // 外部拖拽或显示器工作区骤变可能让 actor 的脚底暂时落到地面以下。
  // 连续碰撞只处理“从上向下穿越”，因此先把这种输入恢复到合法地面，
  // 避免 y 持续增长而宿主窗口只能反复夹紧在屏幕底部。
  if (actor.y + actor.height > terrain.floorY) {
    const minX = terrain.workArea.x;
    const maxX = Math.max(minX, terrain.workArea.x + terrain.workArea.width - actor.width);
    const x = Math.max(minX, Math.min(actor.x, maxX));
    const vx = actor.vx || (actor.facing === 'right' ? options.walkSpeed : -options.walkSpeed);
    return {
      ...actor,
      x,
      y: terrain.floorY - actor.height,
      state: 'walking',
      facing: vx < 0 ? 'left' : 'right',
      vx,
      vy: 0,
      supportId: 'work-area-floor',
      supportOffsetX: x + actor.width / 2 - terrain.workArea.x,
      climb: null,
    };
  }
  let nextVy = Math.min(options.maxFallSpeed, actor.vy + options.gravity * dt);
  let nextY = actor.y + nextVy * dt;
  const minX = terrain.workArea.x;
  const maxX = Math.max(minX, terrain.workArea.x + terrain.workArea.width - actor.width);
  let nextX = actor.x + actor.vx * dt;
  let nextVx = actor.vx;
  if (nextY < terrain.workArea.y) {
    nextY = terrain.workArea.y;
    nextVy = 0;
    nextVx = 0;
  }
  if (nextX < minX) {
    nextX = minX;
    nextVx = 0;
    nextVy = Math.max(0, nextVy);
  } else if (nextX > maxX) {
    nextX = maxX;
    nextVx = 0;
    nextVy = Math.max(0, nextVy);
  }
  const footX = nextX + actor.width / 2;
  const landing = findLandingSurface({
    previousFootY: actor.y + actor.height,
    nextFootY: nextY + actor.height,
    footX,
  }, terrain);

  if (!landing) {
    return {
      ...actor,
      x: nextX,
      y: nextY,
      vx: nextVx,
      vy: nextVy,
      facing: nextVx < 0 ? 'left' : nextVx > 0 ? 'right' : actor.facing,
    };
  }
  const landingVx = nextVx || (actor.facing === 'right' ? options.walkSpeed : -options.walkSpeed);
  return {
    ...actor,
    x: nextX,
    y: landing.y - actor.height,
    state: 'walking',
    facing: landingVx < 0 ? 'left' : 'right',
    vx: landingVx,
    vy: 0,
    supportId: landing.id,
    supportOffsetX: footX - landing.left,
    climb: null,
  };
}
