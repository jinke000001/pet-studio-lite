import React, { useEffect, useRef, useState } from 'react';
import type { PetSpriteConfig } from '../../shared/petpack';

/**
 * 桌宠动作状态。idle/walking/dragging/talking 是基础交互；waiting/review
 * 由自动行为调度触发；jumping 是低频点击反馈；failed 永不自动播放；
 * running 保留给高速移动；extra1/extra2（v2）只在制作台动作预览手动播放。
 */
export type PetState =
  | 'idle' | 'walking' | 'dragging' | 'talking' | 'jumping'
  | 'failed' | 'waiting' | 'running' | 'review'
  | 'extra1' | 'extra2';

interface SpriteProps {
  config: PetSpriteConfig;
  spritesheetUrl: string;
  state: PetState;
  facing?: 'left' | 'right';
  zoom?: number;
  /** 制作台逐帧检查；省略时桌宠仍按原有时钟自动播放。 */
  frameIndex?: number;
}

/**
 * 图集精灵播放器：按状态行切帧。左行帧（framesLeft）优先，没有就 CSS
 * 翻转。渲染尺寸 = 单格 × displayScale × zoom，与窗口大小保持一致。
 */
export function Sprite({ config, spritesheetUrl, state, facing = 'right', zoom = 1, frameIndex }: SpriteProps) {
  const stateConfig = config.states[state] ?? config.states.idle!;
  const useLeftFrames = facing === 'left'
    && Array.isArray(stateConfig.framesLeft)
    && stateConfig.framesLeft.length > 0;
  const frames = useLeftFrames ? stateConfig.framesLeft! : stateConfig.frames;
  const shouldFlip = facing === 'left' && !useLeftFrames;
  const fps = Math.max(0.1, stateConfig.fps);
  const automatic = frameIndex === undefined;

  const [tick, setTick] = useState(0);
  const tickRef = useRef(0);

  useEffect(() => {
    setTick(0);
    tickRef.current = 0;
    if (!automatic || frames.length <= 1) return;
    const id = setInterval(() => {
      tickRef.current += 1;
      setTick(tickRef.current);
    }, 1000 / fps);
    return () => clearInterval(id);
  }, [state, frames.length, fps, config, spritesheetUrl, automatic]);

  const position = frameIndex === undefined ? tick : Math.max(0, Math.floor(frameIndex));
  const frameNumber = frames[position % frames.length]!;
  const cols = config.frame.cols;
  const col = frameNumber % cols;
  const row = Math.floor(frameNumber / cols);

  const displayScale = config.displayScale ?? 1;
  const renderedW = config.frame.width * displayScale * zoom;
  const renderedH = config.frame.height * displayScale * zoom;
  const sheetW = cols * renderedW;
  const x = -col * renderedW;
  const y = -row * renderedH;

  // 放大像素画用 pixelated；高分辨率图集缩小显示用平滑。
  const imageRendering = displayScale > 1 ? 'pixelated' : 'auto';

  return (
    <div
      className="sprite"
      style={{
        width: renderedW,
        height: renderedH,
        backgroundImage: `url(${spritesheetUrl})`,
        backgroundPosition: `${x}px ${y}px`,
        backgroundSize: `${sheetW}px auto`,
        backgroundRepeat: 'no-repeat',
        imageRendering,
        transform: shouldFlip ? 'scaleX(-1)' : undefined,
      }}
    />
  );
}
