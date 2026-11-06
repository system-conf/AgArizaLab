// Test-only (O3): the addressing plan of generated labs (see LabBuilder).

export const LAN_MASK = '255.255.255.0'

export function routerId(index: number): string {
  return `router${index + 1}`
}

/** '10.<router>.<subnetIndex + 1>' (first three octets of a LAN subnet). */
export function subnet(index: number, subnetIndex: number): string {
  return `10.${index + 1}.${subnetIndex + 1}`
}

/** Router / SVI address of a LAN subnet, e.g. 10.1.1.1. */
export function gatewayIp(index: number, subnetIndex: number): string {
  return `${subnet(index, subnetIndex)}.1`
}
