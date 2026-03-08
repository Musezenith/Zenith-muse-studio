export const RUN_STATE = {
  IDLE: "idle",
  BUILDING: "building",
  GENERATING: "generating",
  SUCCESS: "success",
  ERROR: "error",
  CANCELLED: "cancelled",
};

export function isTerminalRunState(state) {
  return (
    state === RUN_STATE.SUCCESS ||
    state === RUN_STATE.ERROR ||
    state === RUN_STATE.CANCELLED
  );
}
