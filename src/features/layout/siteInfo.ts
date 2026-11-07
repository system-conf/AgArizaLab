/** Public facts about the site, used by the landing page footer and share buttons. The app name is translated (common:appName). */
export const siteInfo = {
  url: 'https://octetlab.slovveis.workers.dev/',
  repositoryUrl: 'https://github.com/system-conf/Octetlab',
  author: 'Süleyman Talha Duman',
  license: 'MIT',
} as const

/** Site link that opens in the given UI language (`?lang=` is read by the language detector). */
export function siteUrlInLanguage(language: string): string {
  return `${siteInfo.url}?lang=${encodeURIComponent(language)}`
}

/** LinkedIn "share" dialog for the site. */
export function linkedInShareUrl(url: string = siteInfo.url): string {
  return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`
}
