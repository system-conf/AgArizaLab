// Canvas sizes shared by the workspace components and hooks (canvas units = flow px at zoom 1).

/** Snap grid and background dot spacing. */
export const GRID_SIZE = 24
/** Device node box (the icon); the name hangs below it. */
export const DEVICE_NODE_SIZE = 48
/**
 * Minimum distance between two new devices' top-left points: the name label below an icon is
 * 128 px wide and up to two lines high, so 144 × 120 (multiples of the grid) keeps labels apart.
 */
export const DEVICE_SPACING = { x: 144, y: 120 }
/** Arrow-key nudge distance (as React Flow moves a focused node); Shift moves 4 × as far. */
export const NUDGE_STEP = 5
export const NUDGE_FACTOR = 4
/** Drag data type of a palette item (value = DeviceModel id). */
export const MODEL_DRAG_TYPE = 'application/x-octetlab-model'
/** Prefix of annotation node ids; device ids are camelCase, so they can never collide. */
export const ANNOTATION_NODE_PREFIX = 'note:'
/** Size of a new text note. */
export const NOTE_SIZE = { width: 160, height: 64 }
