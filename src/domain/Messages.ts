// App message contract: how non-UI layers (engine, session, scenarios) hand text to the UI.
// They never produce prose; they return a message id plus values, and the UI translates it
// (see docs/I18N.md and src/i18n/localizedMessage.ts).

export interface LocalizedMessage {
  /** 'namespace:path.to.key', e.g. 'engine:devicePoweredOff'. Segments are camelCase. */
  key: string
  /** Interpolation values; names must match the {{placeholders}} of the key in every language. */
  params?: Record<string, string | number>
}
