// Device name: user content in labs (exercises localize it from `exercises:<id>.devices`).
import type { LocalizedMessage } from '../../../domain/Messages'
import { localizedMessage } from '../../../i18n/messageKeys'

export const MAX_DEVICE_NAME = 40

export class GeneralFormModel {
  static nameError(name: string): LocalizedMessage | undefined {
    const value = name.trim()
    if (value === '') return localizedMessage('deviceConfig:errors.required')
    if (value.length > MAX_DEVICE_NAME) return localizedMessage('deviceConfig:errors.tooLong', { max: MAX_DEVICE_NAME })
    return undefined
  }
}
