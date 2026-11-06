import { describe, expect, it } from 'vitest'
import { RouteResolver, type RouteContext } from './RouteResolver'

const context: RouteContext = { exerciseIds: ['posGateway', 'wrongDns'], reportExerciseId: null, hasShareHash: false }

describe('RouteResolver', () => {
  it('renders the known screens', () => {
    for (const route of [{ name: 'landing' }, { name: 'lab' }, { name: 'exercises' }] as const) {
      expect(RouteResolver.resolve(route, context)).toEqual({ kind: 'render' })
    }
    expect(RouteResolver.resolve({ name: 'exercise', exerciseId: 'wrongDns' }, context)).toEqual({ kind: 'render' })
  })

  it('sends unknown paths to the landing page', () => {
    expect(RouteResolver.resolve({ name: 'notFound', path: '/x' }, context)).toEqual({
      kind: 'redirect',
      to: { name: 'landing' },
      keepHash: false,
    })
  })

  it('sends unknown exercises to the list', () => {
    expect(RouteResolver.resolve({ name: 'exercise', exerciseId: 'ghost' }, context)).toMatchObject({ to: { name: 'exercises' } })
    expect(RouteResolver.resolve({ name: 'exerciseReport', exerciseId: 'ghost' }, context)).toMatchObject({ to: { name: 'exercises' } })
  })

  it('shows a report only right after a verified attempt of that exercise', () => {
    const report = { name: 'exerciseReport', exerciseId: 'posGateway' } as const
    expect(RouteResolver.resolve(report, context)).toEqual({
      kind: 'redirect',
      to: { name: 'exercise', exerciseId: 'posGateway' },
      keepHash: false,
    })
    expect(RouteResolver.resolve(report, { ...context, reportExerciseId: 'wrongDns' })).toMatchObject({ kind: 'redirect' })
    expect(RouteResolver.resolve(report, { ...context, reportExerciseId: 'posGateway' })).toEqual({ kind: 'render' })
  })

  it('forwards a share hash to the workspace, keeping the hash', () => {
    const shared = { ...context, hasShareHash: true }
    expect(RouteResolver.resolve({ name: 'landing' }, shared)).toEqual({ kind: 'redirect', to: { name: 'lab' }, keepHash: true })
    expect(RouteResolver.resolve({ name: 'lab' }, shared)).toEqual({ kind: 'render' })
  })
})
