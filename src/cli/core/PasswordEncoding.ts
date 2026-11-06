// How running-config shows passwords. Type 7 is the real (reversible) Cisco encoding. The "type 5" secret
// only looks like MD5-crypt: it is a reversible lab encoding, so a saved startup-config can be replayed by
// `reload` (labs keep passwords as typed; a lab is no security boundary).

/** Cisco's type 7 key. */
const TYPE7_KEY = 'dsfd;kfoA,.iyewrkldJKDHSUBsgvca69834ncxv9873254k;fg87'
/** crypt(3) alphabet: 64 characters, 6 bits each. */
const CRYPT_ALPHABET = './0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const SALT_LENGTH = 4
/** 16 bytes = 22 characters, the length of a real MD5-crypt hash. */
const SECRET_BYTES = 16
const SEED_RANGE = 16
const BYTE = 0xff

/** 32-bit FNV-1a of the text with a seed (deterministic, not cryptographic). */
function fnv(text: string, seed: number): number {
  let hash = (0x811c9dc5 ^ seed) >>> 0
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash
}

function toCrypt64(bytes: readonly number[]): string {
  let bits = 0
  let width = 0
  let text = ''
  for (const byte of bytes) {
    bits = (bits << 8) | byte
    width += 8
    while (width >= 6) {
      width -= 6
      text += CRYPT_ALPHABET.charAt((bits >> width) & 63)
    }
    bits &= (1 << width) - 1
  }
  return width > 0 ? text + CRYPT_ALPHABET.charAt((bits << (6 - width)) & 63) : text
}

function fromCrypt64(text: string): number[] | null {
  let bits = 0
  let width = 0
  const bytes: number[] = []
  for (const char of text) {
    const value = CRYPT_ALPHABET.indexOf(char)
    if (value < 0) return null
    bits = (bits << 6) | value
    width += 6
    if (width >= 8) {
      width -= 8
      bytes.push((bits >> width) & BYTE)
    }
    bits &= (1 << width) - 1
  }
  return bytes
}

function keyByte(salt: string, index: number): number {
  return fnv(`${salt}${index}`, 5) & BYTE
}

export class PasswordEncoding {
  /** `password 7 <this>`: two-digit seed, then two hex digits per character. */
  static type7(password: string): string {
    const seed = fnv(password, 7) % SEED_RANGE
    let encoded = String(seed).padStart(2, '0')
    for (let index = 0; index < password.length; index += 1) {
      const key = TYPE7_KEY.charCodeAt((seed + index) % TYPE7_KEY.length)
      encoded += ((password.charCodeAt(index) ^ key) & BYTE).toString(16).toUpperCase().padStart(2, '0')
    }
    return encoded
  }

  /** Inverse of type7; null when the text is not a valid type 7 string. */
  static decodeType7(encoded: string): string | null {
    if (!/^\d{2}(?:[0-9A-Fa-f]{2})*$/.test(encoded)) return null
    const seed = Number(encoded.slice(0, 2))
    let decoded = ''
    for (let index = 2; index < encoded.length; index += 2) {
      const key = TYPE7_KEY.charCodeAt((seed + (index - 2) / 2) % TYPE7_KEY.length)
      decoded += String.fromCharCode(Number.parseInt(encoded.slice(index, index + 2), 16) ^ key)
    }
    return decoded
  }

  /** `enable secret 5 <this>`: '$1$<salt>$<22+ chars>'. Characters above U+00FF are not kept. */
  static secret5(secret: string): string {
    const salt = Array.from({ length: SALT_LENGTH }, (_, index) => CRYPT_ALPHABET.charAt(fnv(`${secret}${index}`, 3) % 64)).join('')
    const bytes = [secret.length & BYTE, ...Array.from(secret, (char) => char.charCodeAt(0) & BYTE)]
    while (bytes.length < SECRET_BYTES) bytes.push(fnv(`${secret}${bytes.length}`, 9) & BYTE)
    return `$1$${salt}$${toCrypt64(bytes.map((byte, index) => byte ^ keyByte(salt, index)))}`
  }

  /** Inverse of secret5; null when the text was not made by secret5. */
  static decodeSecret5(text: string): string | null {
    const [, salt, body] = /^\$1\$([./0-9A-Za-z]{4})\$([./0-9A-Za-z]+)$/.exec(text) ?? []
    if (salt === undefined || body === undefined) return null
    const bytes = fromCrypt64(body)?.map((byte, index) => byte ^ keyByte(salt, index))
    const [length, ...chars] = bytes ?? []
    if (length === undefined || length > chars.length) return null
    return String.fromCharCode(...chars.slice(0, length))
  }
}
