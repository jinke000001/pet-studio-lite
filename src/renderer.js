const canvas = document.getElementById('pet');
const context = canvas.getContext('2d', { alpha: true });
const bubble = document.getElementById('bubble');
const sprite = new Image();

let contract;
let state = 'idle';
let frame = 0;
let lastFrameAt = 0;
let nextIdleActionAt = Number.POSITIVE_INFINITY;
let lastInteractionAt = performance.now();
let drag;
let clickTimer;
let clickCount = 0;
let gestureToken = 0;
let oneShot = false;
let longIdle;

function stateMeta(name) {
  return contract.pet.states[name] || contract.pet.states.idle;
}

function syncCanvasSize() {
  const width = Math.max(1, Math.round(canvas.clientWidth));
  const height = Math.max(1, Math.round(canvas.clientHeight));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    context.imageSmoothingEnabled = false;
  }
}

function render() {
  syncCanvasSize();
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (!contract || !sprite.complete || !sprite.naturalWidth) return;
  const meta = stateMeta(state);
  const column = meta.column ?? (frame % meta.frames);
  const { cellWidth, cellHeight } = contract.pet.grid;
  context.drawImage(
    sprite,
    column * cellWidth,
    meta.row * cellHeight,
    cellWidth,
    cellHeight,
    0,
    0,
    canvas.width,
    canvas.height,
  );
}

function frameDuration() {
  if (longIdle) {
    const spec = contract.longIdleContract[longIdle.name];
    return longIdle.phase === 'enter' ? spec.enterFrameMs : spec.loopFrameMs;
  }
  return contract.animationTimings.stateFrameMs[state]
    || contract.animationTimings.defaultFrameMs;
}

function scheduleIdle(now = performance.now()) {
  const { shortIdleMinMs, shortIdleMaxMs } = contract.longIdleContract;
  nextIdleActionAt = now + shortIdleMinMs + Math.random() * (shortIdleMaxMs - shortIdleMinMs);
}

function returnIdle(now = performance.now()) {
  state = 'idle';
  frame = 0;
  lastFrameAt = now;
  oneShot = false;
  longIdle = undefined;
  scheduleIdle(now);
  render();
}

function markInteraction(now = performance.now()) {
  lastInteractionAt = now;
  if (longIdle || oneShot || state !== 'idle') returnIdle(now);
}

function playOneShot(name) {
  if (!contract.pet.states[name]) return;
  state = name;
  frame = 0;
  oneShot = true;
  longIdle = undefined;
  lastFrameAt = performance.now();
  render();
}

function playRandomIdleAction() {
  const actions = contract.idleActionNames;
  if (!actions.length) return;
  playOneShot(actions[Math.floor(Math.random() * actions.length)]);
}

function startLongIdle(name, now) {
  const spec = contract.longIdleContract[name];
  if (!spec || !contract.pet.states[spec.state]) return;
  longIdle = { name, phase: 'enter', index: 0 };
  state = spec.state;
  frame = spec.enterFrames[0];
  oneShot = false;
  lastFrameAt = now;
  render();
}

function maybeStartLongIdle(now) {
  if (drag) return;
  const { meditation, rest } = contract.longIdleContract;
  const inactiveMs = now - lastInteractionAt;
  const target = inactiveMs >= rest.triggerAfterMs
    ? 'rest'
    : inactiveMs >= meditation.triggerAfterMs
      ? 'meditation'
      : undefined;
  if (target && longIdle?.name !== target) startLongIdle(target, now);
}

function advanceLongIdle(steps) {
  const spec = contract.longIdleContract[longIdle.name];
  for (let index = 0; index < steps; index += 1) {
    const sequence = longIdle.phase === 'enter' ? spec.enterFrames : spec.loopFrames;
    longIdle.index += 1;
    if (longIdle.index >= sequence.length) {
      longIdle.phase = 'loop';
      longIdle.index = 0;
    }
    const activeSequence = longIdle.phase === 'enter' ? spec.enterFrames : spec.loopFrames;
    frame = activeSequence[longIdle.index];
  }
}

function advanceNormal(steps, now) {
  frame += steps;
  if (oneShot && frame >= stateMeta(state).frames) {
    returnIdle(now);
    return false;
  }
  return true;
}

function animationLoop(now) {
  if (contract) {
    maybeStartLongIdle(now);
    const duration = frameDuration();
    const elapsed = now - lastFrameAt;
    if (elapsed >= duration) {
      const steps = Math.min(
        Math.floor(elapsed / duration),
        contract.animationTimings.maxCatchUpFrames,
      );
      lastFrameAt += steps * duration;
      if (longIdle) advanceLongIdle(steps);
      else if (!advanceNormal(steps, now)) {
        requestAnimationFrame(animationLoop);
        return;
      }
      render();
    }
    if (!drag && !oneShot && !longIdle && state === 'idle' && now >= nextIdleActionAt) {
      playRandomIdleAction();
    }
  }
  requestAnimationFrame(animationLoop);
}

function say(text) {
  bubble.textContent = text;
  bubble.classList.add('show');
  setTimeout(() => bubble.classList.remove('show'), 1100);
}

function beginMainDrag(token) {
  window.petApi.dragStart().then(() => {
    if (!drag || drag.token !== token) window.petApi.dragStop();
    else drag.mainActive = true;
  });
}

canvas.addEventListener('pointerdown', (event) => {
  if (!contract) return;
  const now = performance.now();
  gestureToken += 1;
  markInteraction(now);
  returnIdle(now);
  drag = {
    token: gestureToken,
    startX: event.screenX,
    startY: event.screenY,
    lastX: event.screenX,
    moved: false,
    mainActive: false,
  };
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener('pointermove', (event) => {
  if (!drag) return;
  lastInteractionAt = performance.now();
  const distance = Math.hypot(event.screenX - drag.startX, event.screenY - drag.startY);
  const stepX = event.screenX - drag.lastX;
  if (distance > 4) {
    if (!drag.moved) {
      drag.moved = true;
      clearTimeout(clickTimer);
      clickCount = 0;
      beginMainDrag(drag.token);
    }
    if (stepX !== 0) {
      const direction = stepX < 0 ? 'running-left' : 'running-right';
      if (state !== direction) {
        state = direction;
        frame = 0;
        oneShot = false;
        longIdle = undefined;
        render();
      }
    }
  }
  drag.lastX = event.screenX;
});

function finishPointer(event, cancelled = false) {
  if (!drag) return;
  const moved = drag.moved;
  lastInteractionAt = performance.now();
  gestureToken += 1;
  if (moved) {
    window.petApi.dragStop();
    returnIdle();
  } else if (!cancelled) {
    clickCount += 1;
    clearTimeout(clickTimer);
    clickTimer = setTimeout(() => {
      if (clickCount >= 2) {
        playOneShot('waving');
        say(contract.product.messages.doubleClick);
      } else {
        say(contract.product.messages.singleClick);
      }
      clickCount = 0;
    }, 220);
  }
  drag = undefined;
  if (event && canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
}

canvas.addEventListener('pointerup', (event) => finishPointer(event));
canvas.addEventListener('pointercancel', (event) => finishPointer(event, true));
canvas.addEventListener('lostpointercapture', (event) => finishPointer(event, true));
window.addEventListener('blur', () => finishPointer(undefined, true));

new ResizeObserver(() => render()).observe(canvas);
sprite.addEventListener('load', render);
window.petApi.onUserActivity(() => {
  lastInteractionAt = performance.now();
  returnIdle(lastInteractionAt);
});

Promise.all([window.petApi.getRuntime(), window.petApi.getSettings()])
  .then(([runtime]) => {
    contract = runtime;
    document.title = contract.product.productName;
    canvas.setAttribute('aria-label', contract.product.productName);
    sprite.src = contract.atlasUrl;
    lastFrameAt = lastInteractionAt = performance.now();
    scheduleIdle();
    render();
    console.log(`renderer-ready product=${contract.product.productId} pet=${contract.pet.id}`);
    requestAnimationFrame(animationLoop);
  })
  .catch((error) => console.error('renderer-init-failed', error));
