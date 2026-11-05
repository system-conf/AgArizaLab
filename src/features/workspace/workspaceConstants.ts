// Canvas sizes shared by the workspace components and hooks (canvas units = flow px at zoom 1).

/** Snap grid and background dot spacing. */
export const GRID_SIZE = 24
/** Device node box (the icon); the name hangs below it. */
export const DEVICE_NODE_SIZE = 48
/** Arrow-key nudge distance (as React Flow moves a focused node); Shift moves 4 × as far. */
export const NUDGE_STEP = 5
export const NUDGE_FACTOR = 4
/** Drag data type of a palette item (value = DeviceModel id). */
export const MODEL_DRAG_TYPE = 'application/x-agarizalab-model'
/** Prefix of annotation node ids; device ids are camelCase, so they can never collide. */
export const ANNOTATION_NODE_PREFIX = 'note:'
/** Size of a new text note. */
export const NOTE_SIZE = { width: 160, height: 64 }
