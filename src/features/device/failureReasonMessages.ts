import type { FailureReason } from '../../domain'
import type { LocalizedMessage } from '../../domain/Messages'
import { localizedMessage, type AppMessageKey } from '../../i18n/messageKeys'

/**
 * Human text of every engine FailureReason (`device:failureReasons.*`). Exhaustive on purpose:
 * a new failure reason does not compile until it gets a text here. Texts describe what the user
 * would see on a real device (symptom), not the configuration fault behind it.
 */
const failureReasonKeys: Record<FailureReason, Extract<AppMessageKey, `device:failureReasons.${string}`>> = {
  powerOff: 'device:failureReasons.powerOff',
  cableDisconnected: 'device:failureReasons.cableDisconnected',
  portDisabled: 'device:failureReasons.portDisabled',
  noIpAddress: 'device:failureReasons.noIpAddress',
  invalidConfig: 'device:failureReasons.invalidConfig',
  destinationNotInSegment: 'device:failureReasons.destinationNotInSegment',
  gatewayNotSet: 'device:failureReasons.gatewayNotSet',
  gatewayOutsideSubnet: 'device:failureReasons.gatewayOutsideSubnet',
  gatewayUnreachable: 'device:failureReasons.gatewayUnreachable',
  noRouteToDestination: 'device:failureReasons.noRouteToDestination',
  wanDown: 'device:failureReasons.wanDown',
  dnsNotSet: 'device:failureReasons.dnsNotSet',
  dnsUnreachable: 'device:failureReasons.dnsUnreachable',
  dnsNoAnswer: 'device:failureReasons.dnsNoAnswer',
  nameNotFound: 'device:failureReasons.nameNotFound',
  wrongDeviceAtAddress: 'device:failureReasons.wrongDeviceAtAddress',
  dhcpNoServer: 'device:failureReasons.dhcpNoServer',
  dhcpPoolExhausted: 'device:failureReasons.dhcpPoolExhausted',
  ipConflict: 'device:failureReasons.ipConflict',
  invalidHostAddress: 'device:failureReasons.invalidHostAddress',
  ttlExpired: 'device:failureReasons.ttlExpired',
}

/** Message for a failure reason; render it with useMessageTranslator(). */
export function failureReasonMessage(reason: FailureReason): LocalizedMessage {
  return localizedMessage(failureReasonKeys[reason])
}
