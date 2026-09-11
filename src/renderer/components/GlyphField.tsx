import React, { useEffect, useRef, useState } from 'react';
import { advanceEstimatedProgress, interpolateProgress } from './progress-motion';

/**
 * 导出等待玩具：符号流点阵。
 * 视觉与算法照搬 docs/design/mockup-v3-blueprint.html 末尾的 IIFE：
 *  - 字形表按密度从疏到浓，单元格 16px，12px 等宽字体绘制；
 *  - 基础场：两层正交正弦叠加的流动伪噪声；
 *  - 鼠标：以光标为中心的高斯隆起（σ≈42px，增益 0.55），离开画布归零；
 *  - 聚形：随进度向爪印目标场收敛（形内压实高浓度字形带，形外退潮保留 10% 流动底纹）。
 * 真实节点来自 App.tsx 已有的 ExportProgressEvent 数组（条数 / 预计总条数），不新增 IPC；
 * 节点间显示值缓慢前进并在 92% 封顶，收到完成结果后才过渡到 100%。
 * prefers-reduced-motion 时不启动 rAF 循环，只静态绘制一帧。
 */

const GLYPHS = ['·', '-', '+', '/', '(', ')', '*', '▲', 'K', '#', '⬡'];
const CELL = 16;
const HEIGHT = 220;

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

function useSmoothProgress(target: number, done: boolean, reducedMotion: boolean): number {
  const [displayed, setDisplayed] = useState(() => Math.min(1, Math.max(0, target)));
  const currentRef = useRef(displayed);

  useEffect(() => {
    const checkpoint = Math.min(1, Math.max(0, target));
    if (reducedMotion) {
      const next = done ? 1 : Math.max(currentRef.current, checkpoint);
      currentRef.current = next;
      setDisplayed(next);
      return;
    }

    let raf = 0;
    let previousFrameAt = performance.now();

    if (!done) {
      const frame = (now: number) => {
        const next = advanceEstimatedProgress(currentRef.current, checkpoint, now - previousFrameAt);
        previousFrameAt = now;
        if (next !== currentRef.current) {
          currentRef.current = next;
          setDisplayed(next);
        }
        raf = requestAnimationFrame(frame);
      };

      raf = requestAnimationFrame(frame);
      return () => cancelAnimationFrame(raf);
    }

    const start = currentRef.current;
    const durationMs = 300 + (1 - start) * 700;
    const startedAt = previousFrameAt;
    const frame = (now: number) => {
      const next = interpolateProgress(start, 1, now - startedAt, durationMs);
      currentRef.current = next;
      setDisplayed(next);
      if (next < 1) raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [target, done, reducedMotion]);

  return displayed;
}

export function GlyphField({ progress, done }: { progress: number; done: boolean }) {
  const reducedMotion = usePrefersReducedMotion();
  const displayedProgress = useSmoothProgress(progress, done, reducedMotion);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // 进度经 ref 传给 rAF 循环：进度变化不需要重建动画
  const progressRef = useRef(displayedProgress);
  progressRef.current = displayedProgress;
  const drawRef = useRef<((now: number) => void) | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const card = cardRef.current;
    if (!canvas || !card) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let cols = 0;
    let rows = 0;
    let target: Float32Array | null = null; // 爪印目标场（0..1）
    const mouse = { x: -9999, y: -9999 };
    let raf = 0;
    const t0 = performance.now();

    /* 用离屏 canvas 按网格分辨率画爪印（掌垫 + 4 趾椭圆），采样成目标强度场 */
    function buildTarget() {
      const off = document.createElement('canvas');
      off.width = cols;
      off.height = rows;
      const c = off.getContext('2d');
      if (!c) return;
      c.fillStyle = '#000';
      c.fillRect(0, 0, cols, rows);
      c.fillStyle = '#fff';
      const cx = cols / 2;
      const cy = rows / 2 + rows * 0.10;
      const ell = (x: number, y: number, rx: number, ry: number, rot?: number) => {
        c.beginPath();
        c.ellipse(x, y, rx, ry, rot ?? 0, 0, Math.PI * 2);
        c.fill();
      };
      const u = cols / 22; // 尺度单位
      ell(cx, cy + u * 1.4, u * 4.2, u * 3.5);                  // 掌垫
      ell(cx - u * 5.4, cy - u * 2.2, u * 1.7, u * 2.2, -0.35); // 趾 1
      ell(cx + u * 5.4, cy - u * 2.2, u * 1.7, u * 2.2, 0.35);  // 趾 2
      ell(cx - u * 2.1, cy - u * 4.8, u * 1.6, u * 2.1, -0.12); // 趾 3
      ell(cx + u * 2.1, cy - u * 4.8, u * 1.6, u * 2.1, 0.12);  // 趾 4
      const data = c.getImageData(0, 0, cols, rows).data;
      target = new Float32Array(cols * rows);
      for (let i = 0; i < cols * rows; i++) target[i] = data[i * 4] / 255;
    }

    function resize() {
      const w = Math.max((card?.clientWidth ?? 0) - 32, 320); // 防御：父容器未布局时取兜底宽
      if (!canvas) return;
      canvas.width = w;
      canvas.height = HEIGHT;
      cols = Math.floor(w / CELL);
      rows = Math.floor(HEIGHT / CELL);
      buildTarget();
    }

    /* 符号配色（藏青底上由暗蓝到亮蓝白，深浅色模式通用：卡片底色固定藏青） */
    function glyphColor(v: number): string {
      if (v < 0.15) return 'rgba(143, 180, 255, 0.18)';
      if (v < 0.35) return 'rgba(143, 180, 255, 0.45)';
      if (v < 0.55) return '#6f9cf0';
      if (v < 0.75) return '#a8c4f8';
      return '#e8effc';
    }

    function draw(now: number) {
      if (!ctx || !canvas) return;
      const t = (now - t0) / 1000;
      const p = progressRef.current;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.font = '12px ui-monospace, Menlo, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          /* 基础流动场：两层正交正弦 */
          const flow = 0.5 + 0.28 * Math.sin(x * 0.32 + t * 0.9) * Math.sin(y * 0.41 - t * 0.7)
                     + 0.22 * Math.sin((x + y) * 0.18 + t * 0.5);
          /* 鼠标隆起 */
          const px = x * CELL + CELL / 2;
          const py = y * CELL + CELL / 2;
          const dx = px - mouse.x;
          const dy = py - mouse.y;
          const boost = 0.55 * Math.exp(-(dx * dx + dy * dy) / (2 * 42 * 42));
          let v = Math.min(1, flow * 0.55 + boost);
          /* 聚形：随进度向爪印收敛；形内压实到高浓度字形带，形外退潮 */
          if (p > 0 && target) {
            const tv = target[y * cols + x];
            const shaped = tv > 0.3 ? 0.78 + 0.22 * tv : 0;
            v = v * (1 - p) + shaped * p + v * 0.10 * p;
          }
          if (v < 0.08) continue;
          const gi = Math.min(GLYPHS.length - 1, Math.floor(v * GLYPHS.length));
          ctx.fillStyle = glyphColor(v);
          ctx.fillText(GLYPHS[gi], px, py);
        }
      }
    }
    drawRef.current = draw;

    function frame(now: number) {
      draw(now);
      raf = requestAnimationFrame(frame);
    }

    const onMove = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      mouse.x = e.clientX - r.left;
      mouse.y = e.clientY - r.top;
    };
    const onLeave = () => {
      mouse.x = -9999;
      mouse.y = -9999;
    };
    const onResize = () => resize();

    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseleave', onLeave);
    window.addEventListener('resize', onResize);

    resize();
    if (reducedMotion) {
      draw(performance.now()); // 减少动态：静态绘制一帧当前状态
    } else {
      raf = requestAnimationFrame(frame);
    }

    return () => {
      cancelAnimationFrame(raf); // 卸载必须取消，不得泄漏动画
      drawRef.current = null;
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mouseleave', onLeave);
      window.removeEventListener('resize', onResize);
    };
  }, [reducedMotion]);

  useEffect(() => {
    if (reducedMotion) drawRef.current?.(performance.now());
  }, [displayedProgress, reducedMotion]);

  const visuallyDone = done && displayedProgress >= 1;
  const pct = visuallyDone ? 100 : Math.floor(displayedProgress * 100);
  return (
    <div className="glyph-field-card" ref={cardRef}>
      <div className="glyph-field-head">
        <span className="eyebrow">GESTURE · WAIT · PLAY</span>
        <span className="glyph-field-hint">动一动鼠标，拨动点阵</span>
      </div>
      <canvas className="glyph-field-canvas" ref={canvasRef} height={HEIGHT} />
      <div className="glyph-field-foot">
        <span className="glyph-progress-label">{visuallyDone ? 'DONE · 已聚形' : `EXPORTING · ${pct}%`}</span>
        <span
          className="glyph-progress-bar"
          role="progressbar"
          aria-label="导出进度"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
        >
          <i style={{ width: `${displayedProgress * 100}%` }} />
        </span>
      </div>
    </div>
  );
}
