import React, { useEffect, useState } from 'react';
import type { PreviewPayload } from '../../shared/types';
import { Sprite, type PetState } from '../pet/Sprite';

/** Only the workbench owns this inspection clock; exported pets keep their own. */
export function AnimationInspector({ payload, state }: { payload: PreviewPayload; state: PetState }) {
  const [playing, setPlaying] = useState(true);
  const [frame, setFrame] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [facing, setFacing] = useState<'left' | 'right'>('right');
  const action = payload.sprite.states[state] ?? payload.sprite.states.idle!;
  const frames = facing === 'left' && action.framesLeft?.length ? action.framesLeft : action.frames;

  useEffect(() => { setFrame(0); }, [state, facing]);
  useEffect(() => {
    if (!playing || frames.length <= 1) return;
    const timer = setInterval(() => setFrame((value) => (value + 1) % frames.length), 1000 / (action.fps * speed));
    return () => clearInterval(timer);
  }, [playing, frames.length, action.fps, speed, state, facing]);

  function move(delta: number) {
    setPlaying(false);
    setFrame((value) => (value + delta + frames.length) % frames.length);
  }

  return <>
    <div className="preview-sprite">
      <Sprite config={payload.sprite} spritesheetUrl={payload.spritesheetDataUrl}
        state={state} facing={facing} zoom={2} frameIndex={frame} />
    </div>
    <div className="animation-toolbar" aria-label="动作检查工具">
      <div className="animation-transport">
        <button className="btn" aria-label="上一帧" onClick={() => move(-1)}>‹</button>
        <button className="btn" onClick={() => setPlaying((value) => !value)}>{playing ? '暂停' : '播放'}</button>
        <button className="btn" aria-label="下一帧" onClick={() => move(1)}>›</button>
        <output className="animation-position" aria-label="当前帧">{(frame % frames.length) + 1} / {frames.length} 帧</output>
      </div>
      <div className="animation-options">
        <label>速度 <select aria-label="播放速度" value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
          <option value={0.25}>0.25×</option><option value={0.5}>0.5×</option><option value={1}>1×</option><option value={2}>2×</option>
        </select></label>
        <label>朝向 <select aria-label="预览朝向" value={facing} onChange={(event) => setFacing(event.target.value as 'left' | 'right')}>
          <option value="right">向右</option><option value="left">向左</option>
        </select></label>
      </div>
    </div>
    <p className="animation-hint">逐帧会暂停播放；速度与朝向仅用于检查，不改变导出的动作。</p>
  </>;
}
