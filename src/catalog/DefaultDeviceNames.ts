// Default names of new devices (BACKLOG follow-up of wave 3.1): "<base> <number>". The base is the
// device kind's name (workspace `deviceKinds.<kind>`, "Router 1", "PC 2") unless the model is not what
// its kind's name says: a smart TV reuses the kitchen display kind and the DSL / cable modems the
// wireless router kind, so they get their own base ("Smart TV 1", "DSL modem 1").

/** Models with their own name base; text `catalog:defaultNames.<modelId>`. */
export const MODEL_NAME_BASES: readonly string[] = ['smartTv', 'dslModem', 'cableModem']

export class DefaultDeviceNames {
  /** i18n key of the model's own name base, or null when the kind's name is used. */
  static modelBaseKey(modelId: string): string | null {
    return MODEL_NAME_BASES.includes(modelId) ? `catalog:defaultNames.${modelId}` : null
  }

  /**
   * Lowest number ≥ 1 whose formatted name no device has yet (compared without case and outer
   * spaces), so the first smart TV is "Smart TV 1" even when kitchen displays exist.
   */
  static firstFreeNumber(format: (number: number) => string, takenNames: readonly string[]): number {
    const taken = new Set(takenNames.map(DefaultDeviceNames.normalized))
    let number = 1
    while (taken.has(DefaultDeviceNames.normalized(format(number)))) number += 1
    return number
  }

  private static normalized(name: string): string {
    return name.trim().toLocaleLowerCase()
  }
}
