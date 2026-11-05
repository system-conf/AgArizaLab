import { describe, expect, it } from 'vitest'
import { Ipv4 } from './Ipv4'

describe('Ipv4', () => {
  it('parses and formats dotted quads', () => {
    expect(Ipv4.parse('192.168.1.10')).toBe(3232235786)
    expect(Ipv4.format(3232235786)).toBe('192.168.1.10')
    expect(Ipv4.format(Ipv4.parse('255.255.255.255') ?? -1)).toBe('255.255.255.255')
  })

  it('rejects malformed addresses', () => {
    for (const bad of ['', '1.2.3', '1.2.3.4.5', '256.1.1.1', '01.2.3.4', 'a.b.c.d', '1..2.3']) {
      expect(Ipv4.isValid(bad)).toBe(false)
    }
  })

  it('accepts only contiguous masks', () => {
    expect(Ipv4.isValidMask('255.255.255.0')).toBe(true)
    expect(Ipv4.isValidMask('255.255.240.0')).toBe(true)
    expect(Ipv4.isValidMask('255.255.255.255')).toBe(true)
    expect(Ipv4.isValidMask('128.0.0.0')).toBe(true)
    expect(Ipv4.isValidMask('255.0.255.0')).toBe(false)
    expect(Ipv4.isValidMask('0.0.0.0')).toBe(false)
    expect(Ipv4.isValidMask('255.255.255.1')).toBe(false)
  })

  it('compares subnets', () => {
    expect(Ipv4.sameSubnet('192.168.1.20', '192.168.1.1', '255.255.255.0')).toBe(true)
    expect(Ipv4.sameSubnet('192.168.10.20', '192.168.1.1', '255.255.255.0')).toBe(false)
    expect(Ipv4.sameSubnet('192.168.10.20', '192.168.1.1', '255.255.0.0')).toBe(true)
    expect(Ipv4.sameSubnet('192.168.1.20', '192.168.1.1', '255.0.255.0')).toBe(false)
  })

  it('rejects the network and broadcast address as host addresses', () => {
    expect(Ipv4.isHostAddress('192.168.1.20', '255.255.255.0')).toBe(true)
    expect(Ipv4.isHostAddress('192.168.1.0', '255.255.255.0')).toBe(false)
    expect(Ipv4.isHostAddress('192.168.1.255', '255.255.255.0')).toBe(false)
    expect(Ipv4.isHostAddress('192.168.1.0', '255.255.254.0')).toBe(true)
    expect(Ipv4.isHostAddress('192.168.1.255', '255.255.254.0')).toBe(false)
    expect(Ipv4.isHostAddress('192.168.0.0', '255.255.254.0')).toBe(false)
    expect(Ipv4.isHostAddress('10.0.0.1', '255.255.255.252')).toBe(true)
    expect(Ipv4.isHostAddress('10.0.0.2', '255.255.255.252')).toBe(true)
    expect(Ipv4.isHostAddress('10.0.0.3', '255.255.255.252')).toBe(false)
    expect(Ipv4.isHostAddress('10.0.0.4', '255.255.255.252')).toBe(false)
  })

  it('treats both /31 addresses and the single /32 address as host addresses', () => {
    expect(Ipv4.isHostAddress('10.0.0.0', '255.255.255.254')).toBe(true)
    expect(Ipv4.isHostAddress('10.0.0.1', '255.255.255.254')).toBe(true)
    expect(Ipv4.isHostAddress('10.0.0.0', '255.255.255.255')).toBe(true)
  })

  it('is false for an invalid address or mask', () => {
    expect(Ipv4.isHostAddress('', '255.255.255.0')).toBe(false)
    expect(Ipv4.isHostAddress('192.168.1.20', '255.0.255.0')).toBe(false)
    expect(Ipv4.isHostAddress('192.168.1.20', '')).toBe(false)
  })

  it('detects private and loopback ranges', () => {
    expect(Ipv4.isPrivate('10.1.2.3')).toBe(true)
    expect(Ipv4.isPrivate('172.16.0.1')).toBe(true)
    expect(Ipv4.isPrivate('172.31.255.255')).toBe(true)
    expect(Ipv4.isPrivate('172.32.0.1')).toBe(false)
    expect(Ipv4.isPrivate('192.168.0.1')).toBe(true)
    expect(Ipv4.isPrivate('127.0.0.1')).toBe(true)
    expect(Ipv4.isPrivate('8.8.8.8')).toBe(false)
    expect(Ipv4.isLoopback('127.0.0.1')).toBe(true)
    expect(Ipv4.isLoopback('128.0.0.1')).toBe(false)
  })

  it('treats only internet-routable addresses as public', () => {
    for (const publicIp of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '100.63.255.255', '100.128.0.1', '223.255.255.255']) {
      expect(Ipv4.isPublic(publicIp), publicIp).toBe(true)
    }
    const nonPublic = [
      '192.168.1.1',
      '10.0.0.1',
      '127.0.0.1',
      '0.0.0.0',
      '0.1.2.3',
      '169.254.10.20',
      '100.64.0.1',
      '100.127.255.255',
      '224.0.0.1',
      '239.255.255.250',
      '240.0.0.1',
      '255.255.255.255',
      'bad',
    ]
    for (const ip of nonPublic) {
      expect(Ipv4.isPublic(ip), ip).toBe(false)
    }
  })

  it('iterates address ranges across octet boundaries', () => {
    expect(Ipv4.range('192.168.1.254', '192.168.2.1')).toEqual([
      '192.168.1.254',
      '192.168.1.255',
      '192.168.2.0',
      '192.168.2.1',
    ])
    expect(Ipv4.range('192.168.1.5', '192.168.1.4')).toEqual([])
    expect(Ipv4.range('bad', '192.168.1.4')).toEqual([])
  })
})
