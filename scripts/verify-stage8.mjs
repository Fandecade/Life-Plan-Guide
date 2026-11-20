import { setTimeout as delay } from 'node:timers/promises'
import puppeteer from 'puppeteer-core'
import { resolveChromePath } from './lib/chrome-path.mjs'

const APP_URL = process.env.APP_URL ?? 'http://localhost:5173/'
const CHROME_PATH = resolveChromePath()

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function clickText(page, selector, text) {
  const elements = await page.$$(selector)
  for (const element of elements) {
    const content = await element.evaluate((node) => (node.textContent ?? '').trim())
    if (content.includes(text)) {
      await element.evaluate((node) => node.scrollIntoView({ block: 'center' }))
      await element.click()
      return
    }
  }
  throw new Error(`未找到包含“${text}”的元素：${selector}`)
}

async function waitText(page, text, timeout = 15000) {
  await page.waitForFunction(
    (needle) => document.body.innerText.includes(needle),
    { timeout, polling: 100 },
    text,
  )
}

async function waitModalClosed(page, timeout = 8000) {
  await page.waitForFunction(() => !document.querySelector('.modal-backdrop'), { timeout })
}

async function openPaletteWithKeyboard(page) {
  await page.keyboard.down('Control')
  await page.keyboard.press('k')
  await page.keyboard.up('Control')
  await page.waitForSelector('.palette', { timeout: 8000 })
}

async function choosePaletteItem(page, text) {
  await page.evaluate((needle) => {
    const items = Array.from(document.querySelectorAll('.palette-item'))
    const item = items.find((node) => (node.textContent ?? '').includes(needle))
    if (!item) throw new Error(`搜索面板中未找到：${needle}`)
    item.click()
  }, text)
}

const browser = await puppeteer.launch({
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

const steps = []
function pass(name, detail = '') {
  steps.push({ name, detail })
  console.log(`✓ ${name}${detail ? ` — ${detail}` : ''}`)
}

try {
  await page.goto(APP_URL, { waitUntil: 'networkidle0', timeout: 30000 })
  await page.waitForSelector('.hero-title', { timeout: 15000 })
  await clickText(page, 'button', '载入演示数据')
  await waitText(page, '演示数据已载入', 20000)
  await page.waitForSelector('.dashboard-grid', { timeout: 15000 })

  await waitText(page, '目标推进')
  await waitText(page, '本周节奏')
  const goalItems = await page.$$eval('.goal-progress-item', (nodes) => nodes.length)
  assert(goalItems === 2, `目标推进卡应有 2 个目标，实际 ${goalItems}`)
  const weekMetrics = await page.$$eval('.week-metric', (nodes) =>
    nodes.map((node) => (node.textContent ?? '').trim()),
  )
  assert(weekMetrics.some((text) => text.includes('2')), '本周节奏缺少习惯执行数据')
  assert(weekMetrics.some((text) => text.includes('45 分钟')), '本周节奏缺少学习时长')
  await waitText(page, '复盘节奏正常')
  pass('Dashboard 完整聚合', `${goalItems} 个目标，本周 ${weekMetrics.join(' / ')}`)

  await page.screenshot({ path: '/tmp/growth-os-dashboard-final.png', fullPage: true })
  pass('Dashboard 截图', '/tmp/growth-os-dashboard-final.png')

  await clickText(page, 'a.nav-item', '学习系统')
  await page.waitForSelector('.start-form', { timeout: 15000 })
  await clickText(page, '.start-form button', '开始学习')
  await page.waitForSelector('.session-shell', { timeout: 15000 })
  await clickText(page, 'a.nav-item', '今日概览')
  await waitText(page, '有进行中的学习会话')
  await clickText(page, '.resume-card button', '继续学习')
  await page.waitForSelector('.session-shell', { timeout: 15000 })
  await clickText(page, '.session-actions button', '中断')
  await waitText(page, '中断学习会话')
  await clickText(page, '.modal-actions button', '确认中断')
  await waitText(page, '学习会话已中断', 15000)
  await waitModalClosed(page)
  pass('进行中会话回到 Dashboard', '可一键继续并处理中断')

  await clickText(page, 'a.nav-item', '今日概览')
  await page.waitForSelector('.hero-title', { timeout: 15000 })
  await openPaletteWithKeyboard(page)
  await waitText(page, '快捷跳转')
  await page.type('.palette-input', 'SAT')
  await waitText(page, '阅读 SAT 局部搜索论文')
  const resultGroups = await page.$$eval('.palette-group', (nodes) => nodes.length)
  assert(resultGroups >= 2, `搜索 SAT 应出现多个分组，实际 ${resultGroups}`)
  await page.screenshot({ path: '/tmp/growth-os-command-palette.png' })
  pass('全局命令面板', `Ctrl+K 呼出，搜索 SAT 得到 ${resultGroups} 个分组`)

  await choosePaletteItem(page, '阅读 SAT 局部搜索论文')
  await page.waitForFunction(() => location.pathname === '/goals', { timeout: 10000 })
  await page.waitForSelector('.goal-tree', { timeout: 15000 })
  pass('搜索结果跳转', '/goals')

  await page.keyboard.press('s')
  await page.waitForSelector('.palette', { timeout: 8000 })
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => !document.querySelector('.palette'), { timeout: 8000 })
  pass('S 快捷搜索与 Esc 关闭')

  await page.click('button[aria-label="提醒中心"]')
  await page.waitForSelector('.reminder-panel', { timeout: 8000 })
  await waitText(page, '今日提醒')
  await waitText(page, '个任务安排在今天')
  await waitText(page, '个任务需要复习')
  await waitText(page, '个微习惯还未打卡')
  await waitText(page, '今天有 1 个任务需要复习')
  const reminderCount = await page.$$eval('.reminder-item', (nodes) => nodes.length)
  assert(reminderCount >= 4, `提醒中心条目偏低：${reminderCount}`)
  pass('提醒中心', `${reminderCount} 条提醒与通知`)

  await page.click('.reminder-item')
  await page.waitForFunction(() => location.pathname === '/goals', { timeout: 10000 })
  await page.waitForFunction(() => !document.querySelector('.reminder-panel'), {
    timeout: 8000,
  })
  pass('提醒跳转到对应模块')

  await page.setViewport({ width: 390, height: 844 })
  await page.goto(APP_URL, { waitUntil: 'networkidle0' })
  await page.waitForSelector('.hero-title', { timeout: 15000 })
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  )
  assert(overflow <= 2, `移动端存在横向溢出：${overflow}px`)
  const menuVisible = await page.$eval('.menu-btn', (element) => {
    const style = window.getComputedStyle(element)
    return style.display !== 'none'
  })
  assert(menuVisible, '移动端菜单按钮未显示')
  await page.click('.menu-btn')
  await delay(300)
  const sidebarOpened = await page.$eval('.sidebar', (element) =>
    element.classList.contains('open'),
  )
  assert(sidebarOpened, '移动端抽屉导航未打开')
  await page.screenshot({ path: '/tmp/growth-os-mobile.png', fullPage: true })
  pass('移动端响应式', '390px 无横向溢出，抽屉导航可用')

  await page.setViewport({ width: 1440, height: 1000 })
  await page.goto(APP_URL, { waitUntil: 'networkidle0' })
  await page.waitForSelector('.hero-title', { timeout: 15000 })
  await waitText(page, '目标推进')
  pass('刷新后持久化')

  assert(
    consoleErrors.length === 0,
    `浏览器控制台存在错误：\n${consoleErrors.join('\n')}`,
  )
  pass('控制台无错误')

  console.log('\n阶段 8 验收通过：')
  for (const step of steps) {
    console.log(`- ${step.name}${step.detail ? `：${step.detail}` : ''}`)
  }
} catch (error) {
  await page
    .screenshot({ path: '/tmp/growth-os-stage8-failure.png', fullPage: true })
    .catch(() => {})
  console.error('\n阶段 8 验收失败：', error instanceof Error ? error.message : error)
  if (consoleErrors.length) console.error('控制台错误：\n' + consoleErrors.join('\n'))
  process.exitCode = 1
} finally {
  await browser.close()
}