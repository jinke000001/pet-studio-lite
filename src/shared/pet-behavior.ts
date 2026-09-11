/**
 * 桌宠自动行为调度（纯逻辑，无 DOM/Electron 依赖，Node 可测）。
 *
 * 语义（与产品约定一致，时间可在体验微调时改动，不影响测试确定性——
 * 测试注入固定 random 序列）：
 *   - waiting：用户一段时间无互动后偶尔播放，持续数秒回到 idle；
 *   - review（思考/观察）：更长时间无互动时更低频播放，持续数秒回到 idle；
 *   - wander：自动游走（由窗口移动逻辑执行），受"自动游走"开关约束；
 *     开关关闭时 waiting/review 这类原地动作仍然低频发生；
 *   - failed / extra1 / extra2 永不自动触发。
 *
 * 竞态约束：
 *   - decide() 只在调用方确认当前是 idle 时才可能返回动作；
 *   - 每次触发后进入 minAutoGapMs 的"冷却"，两个自动动作不会重叠；
 *   - 用户互动调用 recordActivity()，所有阈值重新计时。
 */

export type AutoBehaviorKind = 'waiting' | 'review' | 'wander';

/**
 * 需要"立即停止游走"时的状态收尾（关闭自动游走开关 / 回到右下角复位）：
 * 只有正在进行的游走（walking）要回 idle；waiting/review 等原地动作
 * 不受影响（返回 null = 维持当前状态）。
 */
export function stopWalkingState(current: string): 'idle' | null {
  return current === 'walking' ? 'idle' : null;
}

export interface BehaviorDecision {
  kind: AutoBehaviorKind;
  /** 原地动作（waiting/review）的持续时长；wander 的移动时长由移动逻辑决定。 */
  durationMs: number;
}

export interface BehaviorScheduler {
  recordActivity(now: number): void;
  nextCheckDelay(): number;
  decide(now: number, opts: { canAct: boolean; wanderEnabled: boolean }): BehaviorDecision | null;
}

export interface BehaviorTimings {
  /** 无互动多久后允许 waiting（区间，随机取一个绝对时间点）。 */
  waitingIdleMs: [number, number];
  /** 无互动多久后允许 review（区间，随机取）。 */
  reviewIdleMs: [number, number];
  /** wander 需要的最短无互动时间。 */
  wanderIdleMs: number;
  /** waiting 持续时长区间。 */
  waitingDurationMs: [number, number];
  /** review 持续时长区间。 */
  reviewDurationMs: [number, number];
  /** 任意两个自动动作之间的最短间隔（防重叠/防刷屏）。 */
  minAutoGapMs: number;
  /** 两次 review 之间的最短间隔（review 刻意更低频）。 */
  reviewGapMs: number;
  /** 各动作的通过概率（让节奏自然、不是固定周期）。 */
  waitingChance: number;
  reviewChance: number;
  wanderChance: number;
}

export const DEFAULT_BEHAVIOR_TIMINGS: BehaviorTimings = {
  waitingIdleMs: [40_000, 80_000],
  reviewIdleMs: [150_000, 300_000],
  wanderIdleMs: 20_000,
  waitingDurationMs: [5_000, 8_000],
  reviewDurationMs: [6_000, 9_000],
  minAutoGapMs: 30_000,
  reviewGapMs: 240_000,
  waitingChance: 0.6,
  reviewChance: 0.35,
  wanderChance: 0.5,
};

/** 两次自动行为检查之间的间隔（区间随机，避免机械周期感）。 */
export const CHECK_INTERVAL_MS: [number, number] = [9_000, 16_000];

export class PetBehaviorScheduler {
  private lastActivityAt: number;
  private lastAutoAt = Number.NEGATIVE_INFINITY;
  private lastReviewAt = Number.NEGATIVE_INFINITY;
  private nextWaitingAt: number;
  private nextReviewAt: number;

  constructor(
    private readonly random: () => number = Math.random,
    private readonly timings: BehaviorTimings = DEFAULT_BEHAVIOR_TIMINGS,
    now = 0,
  ) {
    this.lastActivityAt = now;
    this.nextWaitingAt = now + this.randRange(timings.waitingIdleMs);
    this.nextReviewAt = now + this.randRange(timings.reviewIdleMs);
  }

  /** 用户互动（点击/拖动开始等）：重置所有无互动计时。 */
  recordActivity(now: number): void {
    this.lastActivityAt = now;
    this.nextWaitingAt = now + this.randRange(this.timings.waitingIdleMs);
    this.nextReviewAt = now + this.randRange(this.timings.reviewIdleMs);
  }

  /** 下次检查的建议延迟（随机区间）。 */
  nextCheckDelay(): number {
    return this.randRange(CHECK_INTERVAL_MS);
  }

  /**
   * 决定是否触发一个自动动作。
   * @param now            当前时间戳
   * @param opts.canAct    调用方确认当前处于 idle（非点击/拖动/动作中）
   * @param opts.wanderEnabled  配置里的"自动游走"开关
   */
  decide(now: number, opts: { canAct: boolean; wanderEnabled: boolean }): BehaviorDecision | null {
    if (!opts.canAct) return null;
    if (now - this.lastAutoAt < this.timings.minAutoGapMs) return null;

    // review（思考/观察）：最长无互动 + 更低频 + 独立冷却
    if (
      now >= this.nextReviewAt &&
      now - this.lastReviewAt >= this.timings.reviewGapMs &&
      this.random() < this.timings.reviewChance
    ) {
      return this.fire('review', this.randRange(this.timings.reviewDurationMs), now);
    }
    // waiting（等待）：中等无互动
    if (now >= this.nextWaitingAt && this.random() < this.timings.waitingChance) {
      return this.fire('waiting', this.randRange(this.timings.waitingDurationMs), now);
    }
    // wander（自动游走）：受开关约束
    if (
      opts.wanderEnabled &&
      now - this.lastActivityAt >= this.timings.wanderIdleMs &&
      this.random() < this.timings.wanderChance
    ) {
      return this.fire('wander', 0, now);
    }
    return null;
  }

  private fire(kind: AutoBehaviorKind, durationMs: number, now: number): BehaviorDecision {
    this.lastAutoAt = now;
    if (kind === 'review') this.lastReviewAt = now;
    // 只有同类动作触发时才重排自己的时间线：wander（移动）不会把
    // waiting/review（原地动作）的触发点往后推，避免游走频繁时原地动作饿死。
    if (kind === 'waiting') this.nextWaitingAt = now + this.randRange(this.timings.waitingIdleMs);
    if (kind === 'review') this.nextReviewAt = now + this.randRange(this.timings.reviewIdleMs);
    return { kind, durationMs };
  }

  private randRange([min, max]: [number, number]): number {
    return min + this.random() * (max - min);
  }
}

const CLASSIC_FIRST_ACTION_IDLE_MS = 4_000;
const CLASSIC_MIN_ACTION_GAP_MS = 2_000;
const CLASSIC_CHECK_INTERVAL_MS: [number, number] = [1_500, 3_000];

/** Weighted scheduler for the sanitized classic Shimeji behavior subset. */
export class ClassicPetBehaviorScheduler implements BehaviorScheduler {
  private lastActivityAt: number;
  private lastAutoAt = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly plan: readonly import('./shimeji/classic-config').ClassicRuntimeBehavior[],
    private readonly random: () => number = Math.random,
    now = 0,
  ) {
    this.lastActivityAt = now;
  }

  recordActivity(now: number): void {
    this.lastActivityAt = now;
  }

  nextCheckDelay(): number {
    return this.randRange(CLASSIC_CHECK_INTERVAL_MS);
  }

  decide(now: number, opts: { canAct: boolean; wanderEnabled: boolean }): BehaviorDecision | null {
    if (!opts.canAct
      || now - this.lastActivityAt < CLASSIC_FIRST_ACTION_IDLE_MS
      || now - this.lastAutoAt < CLASSIC_MIN_ACTION_GAP_MS) return null;
    const candidates = this.plan.filter((behavior) => opts.wanderEnabled || behavior.kind !== 'wander');
    const total = candidates.reduce((sum, behavior) => sum + behavior.weight, 0);
    if (total <= 0) return null;
    let cursor = Math.max(0, Math.min(0.999999999, this.random())) * total;
    let selected = candidates.at(-1)!;
    for (const candidate of candidates) {
      cursor -= candidate.weight;
      if (cursor < 0) {
        selected = candidate;
        break;
      }
    }
    this.lastAutoAt = now;
    return {
      kind: selected.kind,
      durationMs: selected.durationMs,
    };
  }

  private randRange([min, max]: [number, number]): number {
    return min + this.random() * (max - min);
  }
}
