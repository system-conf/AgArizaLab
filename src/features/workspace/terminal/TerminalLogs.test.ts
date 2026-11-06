import { describe, expect, it } from 'vitest'
import { TerminalLogs } from './TerminalLogs'

describe('TerminalLogs', () => {
  it('keeps lines per device and hides them on cls', () => {
    const empty = TerminalLogs.empty()
    const logs = empty.append('pc1', [{ kind: 'input', text: 'ipconfig' }]).append('pc2', [{ kind: 'output', text: 'x' }])
    expect(empty.linesOf('pc1')).toEqual([])
    expect(logs.linesOf('pc1')).toEqual([{ kind: 'input', text: 'ipconfig' }])
    const cleared = logs.clear('pc1').append('pc1', [{ kind: 'input', text: 'ping 8.8.8.8' }])
    expect(cleared.hiddenCountOf('pc1')).toBe(1)
    expect(cleared.linesOf('pc1')).toHaveLength(2)
    expect(cleared.hiddenCountOf('pc2')).toBe(0)
    expect(logs.hiddenCountOf('pc1')).toBe(0)
  })
})
