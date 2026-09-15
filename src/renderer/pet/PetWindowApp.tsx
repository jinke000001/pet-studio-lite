import React, { useEffect, useRef, useState } from 'react';
import type { PetWindowPayload } from '../../shared/types';
import type { PetWindowApi } from '../../preload/petwin';
import { PetBehaviorScheduler, stopWalkingState } from '../../shared/pet-behavior';
import { computeWorkAreaHomePosition } from '../../shared/geometry';
import { Sprite, type PetState } from './Sprite';
import lines from './lines.json';

declare global {
  interface Window {
    pet: PetWindowApi;
  }
}

const DRAG_THRESHOLD_PX = 4;
const WANDER_DISTANCE_MIN = 60;
const WANDER_SPEED_PX_PER_SEC = 60;
/** 点击反馈：大部分时间说话/挥手，低频跳跃（不是每次都跳）。 */
const CLICK_JUMP_CHANCE = 0.2;
const TALK_MS = 1400;
const JUMP_MS = 1000;
/** 气泡与宠物头顶的间距（px，屏幕像素）。 */
const BUBBLE_GAP_PX = 4;

function pickFrom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

/**
 * 桌宠窗口（工作室预览 + 导出运行时共用）。全部本地行为：拖动、单击
 * 出动作 + 本地台词气泡、自动行为调度（等待/思考/游走，见
 * shared/pet-behavior.ts）。不访问网络。
 */
export function PetWindowApp() {
  const [payload, setPayload] = useState<PetWindowPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [bubble, setBubble] = useState<{ header: string; body: string } | null>(null);
  const [petState, setPetState] = useState<PetState>('idle');
  const [facing, setFacing] = useState<'left' | 'right'>('right');
  const [zoom, setZoom] = useState(1);

  const petStateRef = useRef<PetState>('idle');
  const bubbleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoCheckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoActionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wanderRafRef = useRef<number | null>(null);
  const wanderEnabledRef = useRef<boolean>(true);
  const schedulerRef = useRef<PetBehaviorScheduler | null>(null);

  function transition(next: PetState) {
    petStateRef.current = next;
    setPetState(next);
  }

  function showBubble(header: string, body: string, ms = 3000) {
    setBubble({ header, body });
    if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current);
    bubbleTimerRef.current = setTimeout(() => {
      bubbleTimerRef.current = null;
      setBubble(null);
    }, ms);
  }

  function recordActivity() {
    schedulerRef.current?.recordActivity(Date.now());
  }

  function cancelWander() {
    if (wanderRafRef.current !== null) {
      cancelAnimationFrame(wanderRafRef.current);
      wanderRafRef.current = null;
    }
  }

  /** 中断一切自动动作（等待/思考/游走），回到 idle。 */
  function cancelAutoActions() {
    cancelWander();
    if (autoActionTimerRef.current) {
      clearTimeout(autoActionTimerRef.current);
      autoActionTimerRef.current = null;
    }
    if (petStateRef.current === 'waiting' || petStateRef.current === 'review' || petStateRef.current === 'walking') {
      transition('idle');
    }
  }

  /**
   * 右键菜单切换"自动游走"：即时更新调度开关；关闭时立即停止正在进行的
   * 游走并回 idle。等待/思考这类原地动作不受影响（stopWalkingState 只收
   * walking）。
   */
  function applyWanderEnabled(enabled: boolean) {
    wanderEnabledRef.current = enabled;
    if (enabled) return;
    cancelWander();
    const next = stopWalkingState(petStateRef.current);
    if (next) transition(next);
  }

  /** 右键菜单"回到屏幕右下角"：停下游走，按当前显示器 workArea 安全复位。 */
  async function goHome() {
    cancelWander();
    const next = stopWalkingState(petStateRef.current);
    if (next) transition(next);
    const bounds = await window.pet.getWindowBounds();
    if (!bounds) return;
    const home = computeWorkAreaHomePosition(bounds.workArea, bounds.win.w);
    window.pet.moveWindowTo(home.x, home.y);
  }

  function armAutoCheck() {
    if (autoCheckTimerRef.current) clearTimeout(autoCheckTimerRef.current);
    const scheduler = schedulerRef.current;
    if (!scheduler) return;
    autoCheckTimerRef.current = setTimeout(onAutoCheck, scheduler.nextCheckDelay());
  }

  function onAutoCheck() {
    autoCheckTimerRef.current = null;
    const scheduler = schedulerRef.current;
    if (scheduler) {
      const decision = scheduler.decide(Date.now(), {
        canAct: petStateRef.current === 'idle',
        wanderEnabled: wanderEnabledRef.current,
      });
      if (decision) {
        if (decision.kind === 'wander') {
          void startWander();
        } else {
          // waiting / review：原地播放数秒后回到 idle（单一 timer，无竞态）
          transition(decision.kind);
          autoActionTimerRef.current = setTimeout(() => {
            autoActionTimerRef.current = null;
            if (petStateRef.current === decision.kind) transition('idle');
          }, decision.durationMs);
        }
      }
    }
    armAutoCheck();
  }

  useEffect(() => {
    window.pet.getPayload()
      .then((p) => {
        setPayload(p);
        setZoom(p.config.zoom);
        wanderEnabledRef.current = p.config.wanderEnabled;
        schedulerRef.current = new PetBehaviorScheduler(Math.random, undefined, Date.now());
        armAutoCheck();
        // 启动问候：说话/挥手 + 气泡
        setTimeout(() => {
          if (petStateRef.current !== 'idle') return;
          transition('talking');
          if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
          clickTimerRef.current = setTimeout(() => {
            clickTimerRef.current = null;
            if (petStateRef.current === 'talking') transition('idle');
          }, TALK_MS);
          showBubble('打招呼', pickFrom(lines.greeting), 3000);
        }, 800);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : String(err)));
    const offZoom = window.pet.onZoomChanged(setZoom);
    const offWander = window.pet.onWanderChanged(applyWanderEnabled);
    const offGoHome = window.pet.onGoHome(() => { void goHome(); });
    return () => {
      offZoom();
      offWander();
      offGoHome();
      if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current);
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
      if (autoCheckTimerRef.current) clearTimeout(autoCheckTimerRef.current);
      if (autoActionTimerRef.current) clearTimeout(autoActionTimerRef.current);
      cancelWander();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 自动游走（决策由调度器做出，这里只负责移动动画）。 */
  async function startWander() {
    if (petStateRef.current !== 'idle') return;

    const bounds = await window.pet.getWindowBounds();
    if (!bounds || petStateRef.current !== 'idle') return;

    const { win, workArea } = bounds;
    const minX = workArea.x;
    const maxX = workArea.x + workArea.width - win.w;
    const minY = workArea.y;
    const maxY = workArea.y + workArea.height - win.h;
    if (maxX <= minX || maxY <= minY) return;

    // 目标点偏向屏幕下方 60%，偶尔（25%）爬到上方歇脚。
    const goingHigh = Math.random() < 0.25;
    const yLo = goingHigh ? minY : minY + (maxY - minY) * 0.4;
    const targetY = yLo + Math.random() * (maxY - yLo);
    const targetX = minX + Math.random() * (maxX - minX);

    const startX = win.x;
    const startY = win.y;
    const dx = targetX - startX;
    const dy = targetY - startY;
    const dist = Math.hypot(dx, dy);
    if (dist < WANDER_DISTANCE_MIN) return;

    const durationMs = (dist / WANDER_SPEED_PX_PER_SEC) * 1000;
    const startTime = performance.now();

    if (dx > 1) setFacing('right');
    else if (dx < -1) setFacing('left');
    transition('walking');

    function step() {
      if (petStateRef.current !== 'walking') {
        wanderRafRef.current = null;
        return;
      }
      const t = Math.min(1, (performance.now() - startTime) / durationMs);
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      window.pet.moveWindowTo(
        Math.round(startX + dx * eased),
        Math.round(startY + dy * eased),
      );
      if (t < 1) {
        wanderRafRef.current = requestAnimationFrame(step);
      } else {
        wanderRafRef.current = null;
        transition('idle');
      }
    }
    wanderRafRef.current = requestAnimationFrame(step);
  }

  function onPetMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    // 点击/拖动立即中断自动动作，并重置无互动计时
    cancelAutoActions();
    recordActivity();

    const startX = e.screenX;
    const startY = e.screenY;
    let dragging = false;
    let lastX = startX;
    window.pet.dragBegin(startX, startY);

    function onMove(ev: MouseEvent) {
      const dx = ev.screenX - startX;
      const dy = ev.screenY - startY;
      if (!dragging && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
        dragging = true;
        transition('dragging');
      }
      if (dragging) {
        const stepDx = ev.screenX - lastX;
        if (stepDx > 1) setFacing('right');
        else if (stepDx < -1) setFacing('left');
        lastX = ev.screenX;
        window.pet.dragMove(ev.screenX, ev.screenY);
      }
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.pet.dragEnd();
      if (dragging) {
        transition('idle');
        recordActivity();
      } else {
        onPetClick();
      }
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function onPetClick() {
    recordActivity();
    // 低频跳跃（20%），其余时间说话/挥手
    const next: PetState = Math.random() < CLICK_JUMP_CHANCE ? 'jumping' : 'talking';
    transition(next);
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    clickTimerRef.current = setTimeout(() => {
      clickTimerRef.current = null;
      if (petStateRef.current === next) transition('idle');
    }, next === 'jumping' ? JUMP_MS : TALK_MS);
    showBubble(payload?.config.petName ?? '桌宠', pickFrom(lines.click));
  }

  if (loadError) {
    return (
      <div className="pet-error" role="alert">
        <div className="pet-error-title">桌宠加载失败</div>
        <div className="pet-error-line">{loadError}</div>
      </div>
    );
  }
  if (!payload) return null;

  // 气泡锚定在宠物头顶正上方（宠物在窗口内底边居中），带小箭头指向宠物。
  const petRenderedH = payload.sprite.frame.height * (payload.sprite.displayScale ?? 1) * zoom;

  return (
    <div className="container">
      {bubble && (
        <div className="bubble" style={{ bottom: Math.round(petRenderedH + BUBBLE_GAP_PX) }}>
          <div className="bubble-header">{bubble.header}</div>
          <div className="bubble-body">{bubble.body}</div>
        </div>
      )}
      <div className={`pet pet--${petState}`} onMouseDown={onPetMouseDown}>
        <Sprite
          config={payload.sprite}
          spritesheetUrl={payload.spritesheetDataUrl}
          state={petState}
          facing={facing}
          zoom={zoom}
        />
      </div>
    </div>
  );
}
