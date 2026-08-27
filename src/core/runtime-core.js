const { stateMeta } = require('./pet-package');

const ANIMATION_TIMINGS = Object.freeze({
  defaultFrameMs: 120,
  stateFrameMs: Object.freeze({
    'running-right': 1000 / 24,
    'running-left': 1000 / 24,
  }),
  maxCatchUpFrames: 4,
});

const LONG_IDLE_CONTRACT = Object.freeze({
  shortIdleMinMs: 30000,
  shortIdleMaxMs: 90000,
  meditation: Object.freeze({
    state: 'waiting',
    triggerAfterMs: 120000,
    enterFrames: Object.freeze([0, 1]),
    loopFrames: Object.freeze([1, 2, 3, 4, 5, 4, 3, 2]),
    enterFrameMs: 240,
    loopFrameMs: 650,
  }),
  rest: Object.freeze({
    state: 'failed',
    triggerAfterMs: 480000,
    enterFrames: Object.freeze([0, 1, 2]),
    loopFrames: Object.freeze([2, 3, 4, 5, 6, 7, 6, 5, 4, 3]),
    enterFrameMs: 260,
    loopFrameMs: 800,
  }),
});

const IDLE_ACTION_NAMES = Object.freeze(['waving', 'jumping', 'running', 'review']);

function createRuntimeContract(pet, product) {
  const idleActionNames = IDLE_ACTION_NAMES.filter((name) => pet.states[name]);
  return Object.freeze({
    pet,
    product,
    idleActionNames: Object.freeze(idleActionNames),
    animationTimings: ANIMATION_TIMINGS,
    longIdleContract: LONG_IDLE_CONTRACT,
  });
}

function normalizeSettings(profile, input = {}) {
  const scale = Number(input.scale);
  return {
    scale: Number.isFinite(scale)
      ? Math.min(1.5, Math.max(0.5, scale))
      : profile.defaultScale,
    launchAtStartup: Boolean(input.launchAtStartup),
  };
}

function framePosition(pet, state, frame) {
  const meta = stateMeta(pet, state);
  const column = meta.column ?? (frame % meta.frames);
  return {
    x: -column * pet.grid.cellWidth,
    y: -meta.row * pet.grid.cellHeight,
  };
}

function resizeAroundAnchor(oldBounds, grid, scale) {
  const width = Math.round(grid.cellWidth * scale);
  const height = Math.round(grid.cellHeight * scale);
  return {
    x: Math.round(oldBounds.x + oldBounds.width / 2 - width / 2),
    y: Math.round(oldBounds.y + oldBounds.height - height),
    width,
    height,
  };
}

function clampBounds(bounds, workArea) {
  const maxX = Math.max(workArea.x, workArea.x + workArea.width - bounds.width);
  const maxY = Math.max(workArea.y, workArea.y + workArea.height - bounds.height);
  return {
    ...bounds,
    x: Math.min(maxX, Math.max(workArea.x, bounds.x)),
    y: Math.min(maxY, Math.max(workArea.y, bounds.y)),
  };
}

function dragState(stepX, previous = 'running-right') {
  if (stepX < 0) return 'running-left';
  if (stepX > 0) return 'running-right';
  return previous;
}

function dragUpdateInterval(displayFrequency) {
  const frequency = Number(displayFrequency);
  const safeFrequency = Number.isFinite(frequency) && frequency > 0 ? frequency : 60;
  return Math.max(4, Math.min(16, Math.round(1000 / safeFrequency)));
}

module.exports = {
  ANIMATION_TIMINGS,
  LONG_IDLE_CONTRACT,
  createRuntimeContract,
  normalizeSettings,
  framePosition,
  resizeAroundAnchor,
  clampBounds,
  dragState,
  dragUpdateInterval,
};
