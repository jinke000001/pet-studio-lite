/**
 * 可冲刷防抖器（纯逻辑，Node 可测，不依赖 Electron）。
 *
 * 用途：窗口移动等高频事件的防抖保存。与手写 setTimeout 防抖的差别在
 * flush() —— 窗口关闭/进程退出前调用它，立即执行"待保存的最新值"，
 * 避免"复位/拖动后立刻退出、400ms 防抖还没到点"导致最终位置丢失。
 * 正常节奏（防抖时长、合并策略）完全不变。
 */
export class FlushableDebouncer<T> {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending: T | null = null;

  constructor(
    private readonly delayMs: number,
    private readonly save: (value: T) => void,
  ) {}

  /** 高频事件入口：记录最新值并重置防抖计时。 */
  trigger(value: T): void {
    this.pending = value;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.fire(), this.delayMs);
  }

  /**
   * 关闭前刷新：有待保存值时立即保存一次（幂等：已保存/无待保存时是空操作）。
   */
  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.pending !== null) {
      const value = this.pending;
      this.pending = null;
      this.save(value);
    }
  }

  /** 丢弃待保存值（不再需要保存的场景）。 */
  cancel(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.pending = null;
  }

  private fire(): void {
    this.timer = null;
    if (this.pending !== null) {
      const value = this.pending;
      this.pending = null;
      this.save(value);
    }
  }
}
