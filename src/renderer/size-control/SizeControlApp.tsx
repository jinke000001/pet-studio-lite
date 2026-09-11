import { useEffect, useMemo, useState } from 'react';
import type { PetSizeControlApi, PetSizeControlState } from '../../preload/size-control';

declare global {
  interface Window {
    petSizeControl: PetSizeControlApi;
  }
}

export function SizeControlApp() {
  const [state, setState] = useState<PetSizeControlState | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    const off = window.petSizeControl.onZoomChanged((zoom) => {
      setState((current) => current ? { ...current, zoom } : current);
    });
    window.petSizeControl.getState()
      .then((next) => { if (mounted) setState(next); })
      .catch(() => { if (mounted) setError('无法读取当前尺寸'); });
    return () => {
      mounted = false;
      off();
    };
  }, []);

  const progress = useMemo(() => {
    if (!state) return '50%';
    return `${((state.zoom - state.min) / (state.max - state.min)) * 100}%`;
  }, [state]);

  if (error) return <main className="size-panel size-panel-error">{error}</main>;
  if (!state) return <main className="size-panel size-panel-loading">正在读取尺寸…</main>;

  const percent = Math.round(state.zoom * 100);
  return (
    <main className="size-panel">
      <div className="size-heading">
        <div>
          <label htmlFor="runtime-pet-size">宠物尺寸</label>
          <p id="runtime-pet-size-hint">
            {state.persistent ? '拖动后立即生效，并自动保存' : '拖动后立即生效；预览关闭后不保存'}
          </p>
        </div>
        <output htmlFor="runtime-pet-size" aria-live="polite">{percent}%</output>
      </div>

      <input
        id="runtime-pet-size"
        className="size-slider"
        type="range"
        min={state.min}
        max={state.max}
        step={state.step}
        value={state.zoom}
        aria-describedby="runtime-pet-size-hint"
        style={{ '--size-progress': progress } as React.CSSProperties}
        onChange={(event) => {
          const zoom = Number(event.currentTarget.value);
          setState({ ...state, zoom });
          window.petSizeControl.setZoom(zoom);
        }}
      />
      <div className="size-ticks" aria-hidden="true">
        <span>100%</span><span>200%</span><span>300%</span>
      </div>

      <button type="button" onClick={() => window.petSizeControl.close()}>完成</button>
    </main>
  );
}
