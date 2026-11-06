import type { QueuedTask } from '../contract'

/**
 * The event queue as an immutable array sorted by (time, seq): small (tens of tasks), serializable in
 * the snapshot, and its order is the simulation's total order (docs/SIMULATION.md §3.3).
 */
export class TaskQueue {
  static compare(first: QueuedTask, second: QueuedTask): number {
    return first.time - second.time || first.seq - second.seq
  }

  /** A new queue with `task` inserted in order. */
  static insert(queue: readonly QueuedTask[], task: QueuedTask): readonly QueuedTask[] {
    let low = 0
    let high = queue.length
    while (low < high) {
      const middle = (low + high) >>> 1
      const current = queue[middle]
      if (current !== undefined && TaskQueue.compare(current, task) <= 0) low = middle + 1
      else high = middle
    }
    return [...queue.slice(0, low), task, ...queue.slice(low)]
  }

  static insertAll(queue: readonly QueuedTask[], tasks: readonly QueuedTask[]): readonly QueuedTask[] {
    if (tasks.length === 0) return queue
    return [...queue, ...tasks].sort(TaskQueue.compare)
  }

  static peek(queue: readonly QueuedTask[]): QueuedTask | undefined {
    return queue[0]
  }

  /** The first task and the rest, or null when empty. */
  static pop(queue: readonly QueuedTask[]): { task: QueuedTask; rest: readonly QueuedTask[] } | null {
    const [task, ...rest] = queue
    return task === undefined ? null : { task, rest }
  }
}
