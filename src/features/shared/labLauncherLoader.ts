// The lab storage / import entry points, loaded on demand: zod and IndexedDB code are not part of
// the landing chunk (the workspace chunk already contains them, so there it costs nothing).
export type LabLauncher = typeof import('../../lab/labLauncher')

export function loadLabLauncher(): Promise<LabLauncher> {
  return import('../../lab/labLauncher')
}
