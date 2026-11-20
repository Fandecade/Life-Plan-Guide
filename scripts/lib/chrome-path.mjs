import { existsSync } from 'node:fs'

const DEFAULT_CANDIDATES = [
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
]

/**
 * Resolve an installed Chrome/Chromium binary for puppeteer-core.
 * CHROME_PATH or CHROME_BIN always wins, so CI and other OSes can override it.
 */
export function resolveChromePath() {
  const explicit = process.env.CHROME_PATH?.trim() || process.env.CHROME_BIN?.trim()
  if (explicit) {
    if (!existsSync(explicit)) {
      throw new Error(`CHROME_PATH/CHROME_BIN 指向的浏览器不存在：${explicit}`)
    }
    return explicit
  }

  const executable = DEFAULT_CANDIDATES.find((candidate) => existsSync(candidate))
  if (!executable) {
    throw new Error(
      '未找到 Chrome/Chromium。请安装浏览器，或通过 CHROME_PATH=/path/to/chrome 指定。',
    )
  }
  return executable
}
