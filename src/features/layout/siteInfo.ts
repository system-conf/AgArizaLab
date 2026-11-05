/** Public facts about the site, used by the landing page footer and share buttons. */
export const siteInfo = {
  name: 'Ağ Arıza Laboratuvarı',
  url: 'https://agarizalab.slovveis.workers.dev/',
  repositoryUrl: 'https://github.com/system-conf/AgArizaLab',
  author: 'Süleyman Talha Duman',
  license: 'MIT',
} as const

/** LinkedIn "share" dialog for the site. */
export function linkedInShareUrl(url: string = siteInfo.url): string {
  return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`
}
