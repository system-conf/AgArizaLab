import { describe, expect, it } from 'vitest'
import type { CliCommandSet } from '../contract'
import { CliParamMatcher } from './CliParamMatcher'
import { keyword } from './CliNodes'
import { CliRegistry } from './CliRegistry'
import { InterfaceNames } from './InterfaceNames'
import { PasswordEncoding } from './PasswordEncoding'
import { testRouter, testSwitch } from './testCli'

describe('InterfaceNames', () => {
  it('normalizes abbreviations to the lab ids and IOS long names', () => {
    expect(InterfaceNames.parse('g0/0')).toMatchObject({ id: 'Gi0/0', longName: 'GigabitEthernet0/0' })
    expect(InterfaceNames.parse('FastEthernet 0/1')).toMatchObject({ id: 'Fa0/1', longName: 'FastEthernet0/1' })
    expect(InterfaceNames.parse('gi0/0.10')).toMatchObject({ id: 'Gi0/0.10', subInterface: 10 })
    expect(InterfaceNames.parse('se0/0/1')).toMatchObject({ id: 'Se0/0/1', longName: 'Serial0/0/1' })
    expect(InterfaceNames.parse('vlan10')).toMatchObject({ id: 'Vlan10', longName: 'Vlan10' })
    expect(InterfaceNames.parse('vlan 5000')).toBeNull()
    expect(InterfaceNames.parse('x0/1')).toBeNull()
    expect(InterfaceNames.longName('Fa0/24')).toBe('FastEthernet0/24')
  })

  it('lists the types a device has', () => {
    expect(InterfaceNames.typesOf(testRouter()).map((type) => type.name)).toEqual(['GigabitEthernet', 'Serial'])
    expect(InterfaceNames.typesOf(testSwitch()).map((type) => type.name)).toEqual(['FastEthernet', 'GigabitEthernet', 'Vlan'])
  })

  it('expands ranges', () => {
    const range = InterfaceNames.parseRange('fa0/1 - 3 , g0/1-2')
    expect(range.ok && range.names.map((name) => name.id)).toEqual(['Fa0/1', 'Fa0/2', 'Fa0/3', 'Gi0/1', 'Gi0/2'])
    expect(InterfaceNames.parseRange('fa0/1 - 3, bogus')).toEqual({ ok: false, errorAt: 11 })
  })
})

describe('CliParamMatcher values', () => {
  it('parses MAC addresses and VLAN lists', () => {
    expect(CliParamMatcher.parseMac('aabb.cc00.0100')).toBe('AA:BB:CC:00:01:00')
    expect(CliParamMatcher.parseMac('aa-bb-cc-00-01-00')).toBe('AA:BB:CC:00:01:00')
    expect(CliParamMatcher.parseMac('aabb.cc00')).toBeNull()
    expect(CliParamMatcher.parseVlanList('30,10-12,10')).toEqual([10, 11, 12, 30])
    expect(CliParamMatcher.parseVlanList('0')).toBeNull()
    expect(CliParamMatcher.parseVlanList('20-10')).toBeNull()
  })
})

describe('PasswordEncoding', () => {
  it('round-trips type 7 and the lab secret', () => {
    for (const text of ['cisco', 'class', 'P@ss w0rd!', '']) {
      expect(PasswordEncoding.decodeType7(PasswordEncoding.type7(text))).toBe(text)
      expect(PasswordEncoding.decodeSecret5(PasswordEncoding.secret5(text))).toBe(text)
    }
    expect(PasswordEncoding.secret5('class')).toMatch(/^\$1\$[./0-9A-Za-z]{4}\$[./0-9A-Za-z]{22}$/)
  })

  it('decodes a type 7 string written by IOS', () => {
    // `password cisco` with service password-encryption on a real router.
    expect(PasswordEncoding.decodeType7('0822455D0A16')).toBe('cisco')
  })
})

describe('CliRegistry', () => {
  it('merges the same keyword from several sets', () => {
    const a: CliCommandSet = { id: 'a', commands: [{ modes: ['privilegedExec'], node: keyword('show', 'Show', { children: [keyword('vlan', 'VLAN', { run: () => ({}) })] }) }] }
    const b: CliCommandSet = { id: 'b', commands: [{ modes: ['privilegedExec'], node: keyword('show', 'Show', { children: [keyword('arp', 'ARP', { run: () => ({}) })] }) }] }
    const show = new CliRegistry([a, b]).roots('privilegedExec').find((node) => node.word === 'show')
    expect(show?.children?.map((node) => (node.kind === 'keyword' ? node.word : node.name))).toEqual(['vlan', 'arp'])
  })

  it('refuses two handlers on one command and duplicate set ids', () => {
    const run = () => ({})
    const a: CliCommandSet = { id: 'a', commands: [{ modes: ['globalConfig'], node: keyword('hostname', 'x', { run }) }] }
    const b: CliCommandSet = { id: 'b', commands: [{ modes: ['globalConfig'], node: keyword('hostname', 'y', { run }) }] }
    expect(() => new CliRegistry([a, b])).toThrow(/two run handlers/)
    expect(() => new CliRegistry([a, a])).toThrow(/registered twice/)
  })

  it('gives interface-range mode the interface commands', () => {
    const set: CliCommandSet = { id: 'a', commands: [{ modes: ['interface'], node: keyword('switchport', 'x', { run: () => ({}) }) }] }
    expect(new CliRegistry([set]).roots('interfaceRange').map((node) => node.word)).toEqual(['switchport'])
  })
})
