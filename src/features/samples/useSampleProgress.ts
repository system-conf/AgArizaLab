import { useCallback, useState } from 'react'
import type { SampleProgressBook } from '../../samples'
import { SampleProgressStore } from './model/SampleProgressStore'

export interface SampleProgressState {
  book: SampleProgressBook
  /** Applies a change to the book (saved in localStorage when it changed anything). */
  update: (change: (book: SampleProgressBook) => SampleProgressBook) => void
}

/** The learner's sample progress for the sample screens (one store per mounted sample module). */
export function useSampleProgress(): SampleProgressState {
  const [store] = useState(() => SampleProgressStore.fromBrowser())
  const [book, setBook] = useState(() => store.read())
  const update = useCallback((change: (book: SampleProgressBook) => SampleProgressBook) => setBook(store.update(change)), [store])
  return { book, update }
}
