// Device management in global config: hostname, enable secret / password, service password-encryption,
// ip domain-lookup, banner motd (docs/CLI.md §5). Model: Device.features.management.
import type { ManagementSettings } from '../../../domain'
import type { CliCommandRegistration, CliCommandResult, CliContext, CliQuestion } from '../../contract'
import { keyword, param } from '../CliNodes'
import { cliError } from '../CliOutput'
import { CliPrompt } from '../CliPrompt'
import { DeviceEdits } from '../DeviceEdits'
import { PasswordEncoding } from '../PasswordEncoding'
import { BANNER_DELIMITER } from '../coreConfigSections'

const HOSTNAME_PATTERN = /^[A-Za-z](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/

type ManagementKey = keyof ManagementSettings

function setting<Key extends ManagementKey>(ctx: CliContext, key: Key, value: ManagementSettings[Key] | undefined): CliCommandResult {
  const device = DeviceEdits.updateManagement(ctx.device, (management) => {
    const copy = { ...management }
    if (value === undefined) delete copy[key]
    else copy[key] = value
    return copy
  })
  return { device }
}

function hostname(ctx: CliContext): CliCommandResult {
  const name = ctx.args.text('name')
  if (!HOSTNAME_PATTERN.test(name)) return { lines: cliError('% Hostname contains one or more illegal characters.') }
  // The platform default is stored as "not set", so a replayed config equals the original.
  return setting(ctx, 'hostname', CliPrompt.defaultHostname(ctx.device) === name ? undefined : name)
}

/** `enable secret 5 <hash>` (replayed startup-config): only hashes this lab wrote can be read back. */
function secretFromHash(ctx: CliContext): CliCommandResult {
  const secret = PasswordEncoding.decodeSecret5(ctx.args.text('hash'))
  if (secret === null) return { lines: cliError('ERROR: The secret you entered is not a valid encrypted secret.') }
  return setting(ctx, 'enableSecret', secret)
}

function passwordFromType7(ctx: CliContext): CliCommandResult {
  const password = PasswordEncoding.decodeType7(ctx.args.text('encrypted'))
  if (password === null) return { lines: cliError('Invalid encrypted password') }
  return setting(ctx, 'enablePassword', password)
}

/** Delimited text: `banner motd #text#`; without the closing delimiter, more lines are read until it. */
function banner(ctx: CliContext): CliCommandResult {
  const text = ctx.args.text('text')
  const delimiter = text.startsWith(BANNER_DELIMITER) ? BANNER_DELIMITER : text.charAt(0)
  const body = text.slice(delimiter.length)
  const end = body.indexOf(delimiter)
  if (end >= 0) return setting(ctx, 'bannerMotd', body.slice(0, end))
  const lines = body === '' ? [] : [body]
  return {
    lines: [{ kind: 'output', text: `Enter TEXT message.  End with the character '${delimiter}'.` }],
    ask: bannerLines(delimiter, lines),
  }
}

function bannerLines(delimiter: string, lines: readonly string[]): CliQuestion {
  return {
    prompt: '',
    secret: false,
    onAnswer: (answer, ctx) => {
      const end = answer.indexOf(delimiter)
      if (end < 0) return { ask: bannerLines(delimiter, [...lines, answer]) }
      const last = answer.slice(0, end)
      return setting(ctx, 'bannerMotd', [...lines, ...(last === '' ? [] : [last])].join('\n'))
    },
  }
}

const enableSecretNode = keyword('secret', 'Assign the privileged level secret', {
  runNo: (ctx) => setting(ctx, 'enableSecret', undefined),
  children: [
    keyword('0', 'Specifies an UNENCRYPTED password will follow', {
      children: [param('secret', { type: 'line' }, "The UNENCRYPTED (cleartext) 'enable' secret", { run: (ctx) => setting(ctx, 'enableSecret', ctx.args.text('secret')) })],
    }),
    keyword('5', 'Specifies a MD5 HASHED secret will follow', {
      children: [param('hash', { type: 'word' }, "The ENCRYPTED 'enable' secret string", { run: secretFromHash })],
    }),
    param('secret', { type: 'line' }, "The UNENCRYPTED (cleartext) 'enable' secret", {
      run: (ctx) => setting(ctx, 'enableSecret', ctx.args.text('secret')),
    }),
  ],
})

const enablePasswordNode = keyword('password', 'Assign the privileged level password', {
  runNo: (ctx) => setting(ctx, 'enablePassword', undefined),
  children: [
    keyword('0', 'Specifies an UNENCRYPTED password will follow', {
      children: [param('password', { type: 'line' }, "The UNENCRYPTED (cleartext) 'enable' password", { run: (ctx) => setting(ctx, 'enablePassword', ctx.args.text('password')) })],
    }),
    keyword('7', 'Specifies a HIDDEN password will follow', {
      children: [param('encrypted', { type: 'word' }, "The HIDDEN 'enable' password string", { run: passwordFromType7 })],
    }),
    param('password', { type: 'line' }, "The UNENCRYPTED (cleartext) 'enable' password", {
      run: (ctx) => setting(ctx, 'enablePassword', ctx.args.text('password')),
    }),
  ],
})

export const managementCommands: readonly CliCommandRegistration[] = [
  {
    modes: ['globalConfig'],
    node: keyword('hostname', 'Set system\'s network name', {
      runNo: (ctx) => setting(ctx, 'hostname', undefined),
      children: [param('name', { type: 'word' }, "This system's network name", { run: hostname })],
    }),
  },
  {
    modes: ['globalConfig'],
    node: keyword('enable', 'Modify enable password parameters', { children: [enableSecretNode, enablePasswordNode] }),
  },
  {
    modes: ['globalConfig'],
    node: keyword('service', 'Modify use of network based services', {
      children: [
        keyword('password-encryption', 'Encrypt system passwords', {
          run: (ctx) => setting(ctx, 'passwordEncryption', true),
          runNo: (ctx) => setting(ctx, 'passwordEncryption', undefined),
        }),
      ],
    }),
  },
  {
    modes: ['globalConfig'],
    node: keyword('ip', 'Global IP configuration subcommands', {
      children: [
        keyword('domain-lookup', 'Enable IP Domain Name System hostname translation', {
          run: (ctx) => setting(ctx, 'domainLookup', undefined),
          runNo: (ctx) => setting(ctx, 'domainLookup', false),
        }),
      ],
    }),
  },
  {
    modes: ['globalConfig'],
    node: keyword('banner', 'Define a login banner', {
      children: [
        keyword('motd', 'Set Message of the Day banner', {
          runNo: (ctx) => setting(ctx, 'bannerMotd', undefined),
          children: [param('text', { type: 'line' }, 'c banner-text c, where \'c\' is a delimiting character', { run: banner })],
        }),
      ],
    }),
  },
]
