import { clear, createStore } from 'idb-keyval'
import { LAB_DATABASE } from '../../../lab/storage/labStorage'
import { LocalDataEraser } from './LocalDataEraser'

function browserStorage(): Storage | null {
  try {
    return window.localStorage
  } catch (error) {
    console.warn('localStorage is not available; only saved labs can be cleared.', error)
    return null
  }
}

/** Clears the labs' object store (the open connection stays usable, unlike deleting the database). */
async function clearLabStore(): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  await clear(createStore(LAB_DATABASE.name, LAB_DATABASE.store))
}

/** The eraser over this browser's localStorage and the labs' IndexedDB store. */
export function browserDataEraser(): LocalDataEraser {
  return new LocalDataEraser(browserStorage(), clearLabStore)
}
