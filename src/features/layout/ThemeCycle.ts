import { THEMES, type Theme } from '../../preferences'

/** Order of the header's quick theme button: Light → Dark → System → Light. */
export class ThemeCycle {
  static next(theme: Theme): Theme {
    const index = THEMES.indexOf(theme)
    return THEMES[(index + 1) % THEMES.length] ?? 'light'
  }
}
