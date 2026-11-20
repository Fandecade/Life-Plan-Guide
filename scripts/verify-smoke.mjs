import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import puppeteer from 'puppeteer-core'
import { resolveChromePath } from './lib/chrome-path.mjs'

const HOST = '127.0.0.1'
const PORT = Number(process.env.SMOKE_PORT ?? 4173)
const APP_URL = process.env.APP_URL ?? `http://${HOST}:${PORT}/`
const CHROME_PATH = resolveChromePath()

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function waitForServer(url, timeout = 30000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // Vite is still starting.
    }
    await delay(180)
  }
  throw new Error(`等待开发服务器超时：${url}`)
}

const server = spawn(
  'pnpm',
  ['exec', 'vite', '--host', HOST, '--port', String(PORT), '--strictPort'],
  { stdio: ['ignore', 'pipe', 'pipe'] },
)
let serverOutput = ''
server.stdout.on('data', (chunk) => {
  serverOutput += chunk.toString()
})
server.stderr.on('data', (chunk) => {
  serverOutput += chunk.toString()
})

let browser
try {
  await waitForServer(APP_URL)
  browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-first-run', '--no-default-browser-check', '--window-size=1440,1000'],
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 1000 })

  const consoleErrors = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => consoleErrors.push(error.message))

  await page.goto(APP_URL, { waitUntil: 'networkidle0', timeout: 30000 })
  await page.waitForSelector('.hero-title', { timeout: 15000 })
  await page.waitForSelector('.sidebar', { timeout: 8000 })

  const title = await page.title()
  const navCount = await page.$$eval('.nav-item', (nodes) => nodes.length)
  const scale = await page.evaluate(
    () => getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim(),
  )
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  )

  assert(title.length > 0, '页面标题为空')
  assert(navCount >= 4, `导航入口异常：${navCount}`)
  assert(scale.length > 0, 'UI 缩放变量未应用')
  assert(overflow <= 2, `桌面端存在横向溢出：${overflow}px`)
  assert(consoleErrors.length === 0, `浏览器控制台错误：\n${consoleErrors.join('\n')}`)

  await page.screenshot({ path: '/tmp/growth-os-smoke.png', fullPage: true })
  console.log(`✓ Smoke 通过：${title}`)
  console.log(`  Chrome：${CHROME_PATH}`)
  console.log(`  导航：${navCount} 项；UI 缩放：${scale}`)
  console.log('  截图：/tmp/growth-os-smoke.png')
} catch (error) {
  console.error('Smoke 验收失败：', error instanceof Error ? error.message : error)
  if (serverOutput.trim()) console.error('\nVite 输出：\n' + serverOutput.trim())
  process.exitCode = 1
} finally {
  await browser?.close().catch(() => {})
  server.kill('SIGTERM')
}
