export const STEP_MOVE_TRAVEL_MS = 400;
export const STEP_MOVE_WAIT_MIN_MS = 100;
export const STEP_MOVE_WAIT_MAX_MS = 1000;
export const STEP_MOVE_WAIT_BONUS_MS = 120;
export const STEP_MOVE_SPEED_MIN = 0.1;

export function clampStepMoveSpeed(value) {
  return Math.max(STEP_MOVE_SPEED_MIN, Number(value ?? 1));
}

export function getStepMoveWaitMs(moveSpeed, speedScale = 1) {
  const effectiveSpeed = clampStepMoveSpeed(moveSpeed) * Math.max(STEP_MOVE_SPEED_MIN, Number(speedScale ?? 1));
  const legacyStepMs = 1000 / effectiveSpeed;
  const rawWaitMs = legacyStepMs - STEP_MOVE_TRAVEL_MS + STEP_MOVE_WAIT_BONUS_MS;
  return Math.max(
    STEP_MOVE_WAIT_MIN_MS,
    Math.min(STEP_MOVE_WAIT_MAX_MS, Math.round(rawWaitMs)),
  );
}

export function getStepMoveTimings(moveSpeed, speedScale = 1) {
  const waitMs = getStepMoveWaitMs(moveSpeed, speedScale);
  return {
    travelMs: STEP_MOVE_TRAVEL_MS,
    waitMs,
    cycleMs: STEP_MOVE_TRAVEL_MS + waitMs,
  };
}
