import type { QueuedTask } from '../contract'
import { TaskQueue } from './TaskQueue'

/**
 * The kernel's working event queue: a binary min-heap on (time, seq), so pushing and popping a task
 * costs O(log n) however many frames are in flight (a broadcast in a big segment queues thousands).
 * `seq` is unique, so the order is total and the same as the sorted snapshot queue (TaskQueue).
 */
export class TaskHeap {
  private readonly items: QueuedTask[]

  /** `sorted` must be ordered by (time, seq) — a sorted array is already a valid heap. */
  private constructor(sorted: readonly QueuedTask[]) {
    this.items = [...sorted]
  }

  static fromSorted(queue: readonly QueuedTask[]): TaskHeap {
    return new TaskHeap(queue)
  }

  get size(): number {
    return this.items.length
  }

  peek(): QueuedTask | undefined {
    return this.items[0]
  }

  push(task: QueuedTask): void {
    const { items } = this
    items.push(task)
    let index = items.length - 1
    while (index > 0) {
      const parent = (index - 1) >>> 1
      const above = items[parent]
      if (above === undefined || TaskQueue.compare(above, task) <= 0) break
      items[index] = above
      index = parent
    }
    items[index] = task
  }

  pop(): QueuedTask | undefined {
    const { items } = this
    const top = items[0]
    const last = items.pop()
    if (top === undefined || last === undefined || items.length === 0) return top
    let index = 0
    for (;;) {
      const left = index * 2 + 1
      if (left >= items.length) break
      const right = left + 1
      const leftItem = items[left]
      const rightItem = items[right]
      if (leftItem === undefined) break
      const child = rightItem !== undefined && TaskQueue.compare(rightItem, leftItem) < 0 ? right : left
      const childItem = child === right ? rightItem : leftItem
      if (childItem === undefined || TaskQueue.compare(last, childItem) <= 0) break
      items[index] = childItem
      index = child
    }
    items[index] = last
    return top
  }

  /** The queue as the snapshot keeps it: sorted by (time, seq). */
  toSorted(): readonly QueuedTask[] {
    return [...this.items].sort(TaskQueue.compare)
  }
}
