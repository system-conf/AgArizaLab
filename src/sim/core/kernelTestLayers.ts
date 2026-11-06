// Test-only: a toy protocol stack for the kernel tests. Hubs repeat; hosts answer ARP requests for their
// address; a 'ping' request broadcasts one ARP request and reports the ARP reply as the echo reply.
import type { NetworkState, Port } from '../../domain'
import { editPort, labHost, labLink } from '../../engine/testLabs'
import {
  BROADCAST_MAC,
  type DeviceChange,
  type DeviceContext,
  type FrameArrival,
  type Ipv4SendResult,
  type LinkLayer,
  type NetworkLayer,
  type NetworkTimer,
  PingTally,
  type SimLayers,
  type ServiceLayer,
  type SimRequest,
  type StateEffect,
  ZERO_MAC,
} from '../contract'

function nic(ctx: DeviceContext): Extract<Port, { role: 'host' }> | undefined {
  return ctx.device.ports.find((port): port is Extract<Port, { role: 'host' }> => port.role === 'host')
}

class ToyLinkLayer implements LinkLayer {
  /** Records the change in the runtime so tests can see the hook ran. */
  onChange(ctx: DeviceContext, change: DeviceChange): void {
    const claim = { interfaceId: 'eth0', address: nic(ctx)?.l3.ipv4.address ?? '', duplicate: change.configChanged, probedAt: ctx.now }
    ctx.updateRuntime((runtime) => ({ ...runtime, link: { ...runtime.link, claims: [claim] } }))
  }
  onTimer(): void {}

  /** Every addressed host announces itself once (start-up traffic for `settle`). */
  onStart(ctx: DeviceContext): void {
    const own = nic(ctx)
    if (!own?.mac || own.l3.ipv4.address === '') return
    const event = ctx.openEvent({ flowId: 'boot', ids: ctx.newPdu('boot') })
    event.transmit(
      { portId: own.id },
      { kind: 'ethernet', src: own.mac, dst: BROADCAST_MAC, payload: { kind: 'arp', operation: 'request', senderMac: own.mac, senderIp: '0.0.0.0', targetMac: ZERO_MAC, targetIp: own.l3.ipv4.address } },
    )
    event.conclude('created', 2)
  }

  onFrame(ctx: DeviceContext, arrival: FrameArrival): void {
    const event = ctx.arrival
    if (!event) throw new Error('arrival without builder')
    if (ctx.device.kind === 'hub') {
      for (const port of ctx.device.ports) {
        if (port.id !== arrival.portId) event.transmit({ portId: port.id }, arrival.frame)
      }
      event.conclude('flooded', 1)
      return
    }
    const own = nic(ctx)
    const frame = arrival.frame
    if (!own?.mac || frame.kind !== 'ethernet' || frame.payload.kind !== 'arp') return event.conclude('dropped', 2, 'unsupported')
    const arp = frame.payload
    if (arp.operation === 'request' && arp.targetIp === own.l3.ipv4.address && arp.senderIp !== '0.0.0.0') {
      event.conclude('replied', 2)
      const reply = ctx.openEvent({ flowId: arrival.ids.flowId, ids: ctx.newPdu(arrival.ids.flowId), causeEventId: event.id })
      reply.transmit(
        { portId: own.id },
        { kind: 'ethernet', src: own.mac, dst: arp.senderMac, payload: { kind: 'arp', operation: 'reply', senderMac: own.mac, senderIp: own.l3.ipv4.address, targetMac: arp.senderMac, targetIp: arp.senderIp } },
      )
      reply.conclude('created', 2)
      return
    }
    if (arp.operation === 'reply' && frame.dst === own.mac) {
      event.conclude('delivered', 2)
      const result = PingTally.of([{ kind: 'reply', sequence: 1, requestPduId: 'p0', fromIp: arp.senderIp, ttl: 128, bytes: 32, rttMs: ctx.now }])
      ctx.report(arrival.ids.flowId, result, true)
      return
    }
    event.conclude('dropped', 2, 'notForThisInterface')
  }

  send(): void {
    throw new Error('not used by the toy stack')
  }

  onRequest(ctx: DeviceContext, requestId: string): void {
    ctx.report(requestId, { kind: 'cleared', entries: 0 }, true)
  }

  interfaceReady(): Ipv4SendResult {
    return { ok: false, reason: 'unsupported' }
  }
}

class ToyNetworkLayer implements NetworkLayer {
  onStart(): void {}
  onChange(): void {}
  onPacket(): void {}
  onUndeliverable(): void {}

  send(): Ipv4SendResult {
    return { ok: false, reason: 'unsupported' }
  }

  onRequest(ctx: DeviceContext, requestId: string, request: SimRequest): void {
    const own = nic(ctx)
    if (request.kind !== 'ping' || !own?.mac) return
    const event = ctx.openEvent({ flowId: requestId, ids: ctx.newPdu(requestId) })
    event.transmit(
      { portId: own.id },
      { kind: 'ethernet', src: own.mac, dst: BROADCAST_MAC, payload: { kind: 'arp', operation: 'request', senderMac: own.mac, senderIp: own.l3.ipv4.address, targetMac: ZERO_MAC, targetIp: request.targetIp } },
    )
    event.conclude('created', 2)
    ctx.schedule(4000, { layer: 'network', kind: 'echoTimeout', requestId, sequence: 1 })
  }

  onTimer(ctx: DeviceContext, timer: NetworkTimer): void {
    if (timer.kind !== 'echoTimeout') return
    ctx.openEvent({ flowId: timer.requestId, protocol: 'icmp' }).conclude('timedOut', 3, 'requestTimedOut')
    ctx.report(timer.requestId, PingTally.of([{ kind: 'timeout', sequence: 1, requestPduId: 'p0' }]), true)
  }
}

/** 'dhcpRelease' clears the NIC address through a configuration effect. */
class ToyServiceLayer implements ServiceLayer {
  onStart(): void {}
  onChange(): void {}
  onTimer(): void {}
  onIcmpError(): void {}
  onDatagram(): void {}

  listens(): boolean {
    return false
  }

  onRequest(ctx: DeviceContext, requestId: string, request: SimRequest): void {
    const effect: StateEffect = { kind: 'dhcpLeaseReleased', clientId: request.deviceId, portId: 'eth0' }
    ctx.applyEffect(effect)
    ctx.report(requestId, { kind: 'dhcp', operation: 'release', adapters: [{ portId: 'eth0', ok: true, released: true }], effects: [effect] }, true)
  }

  applyEffect(state: NetworkState, effect: StateEffect): NetworkState {
    return editPort(state, effect.clientId, effect.portId, (port) =>
      port.role === 'host' ? { ...port, l3: { ...port.l3, ipv4: { addressing: 'dhcp', address: '', mask: '' } } } : port,
    )
  }
}

export const toyLayers: SimLayers = { link: new ToyLinkLayer(), network: new ToyNetworkLayer(), services: new ToyServiceLayer() }

/** pc1 .1, pc2 .2, pc3 .3 on one hub (ports p1–p3). */
export function hubLab(): NetworkState {
  const passive = (id: string): Port => ({ id, medium: 'copper', role: 'passive', adminUp: true })
  return {
    devices: [
      labHost('pc1', '10.0.0.1'),
      labHost('pc2', '10.0.0.2'),
      labHost('pc3', '10.0.0.3'),
      { id: 'hub', kind: 'hub', modelId: 'hub', name: 'hub', powered: true, baseMac: '02:00:00:FF:00:00', ports: ['p1', 'p2', 'p3'].map(passive) },
    ],
    links: [labLink('l1', ['pc1', 'eth0'], ['hub', 'p1']), labLink('l2', ['pc2', 'eth0'], ['hub', 'p2']), labLink('l3', ['pc3', 'eth0'], ['hub', 'p3'])],
  }
}
