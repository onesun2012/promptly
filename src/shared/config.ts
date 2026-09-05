/** Product-level constants shared by main and renderer.
 * Placeholder URLs — fill in real ones before release. */

export const DONATE = {
  /** monthly donation (CN) */
  afdian: 'https://afdian.com/a/onesun',
  /** overseas primary */
  sponsors: 'https://github.com/sponsors/onesun2012',
  /** overseas lightweight */
  kofi: 'https://ko-fi.com/onesun'
}

/** Anonymous install ping endpoint (Cloudflare Worker). Only ?v=&os= params. */
export const INSTALL_PING_URL = 'https://promptly-ping.YOUR-SUBDOMAIN.workers.dev/ping'
