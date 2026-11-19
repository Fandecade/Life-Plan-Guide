import { setTimeout as delay } from 'node:timers/promises'
import puppeteer from 'puppeteer-core'

const APP_URL = process.env.APP_URL ?? 'http://localhost:5173/'
const CHROME_PATH =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

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

async function themeState(page) {
  return page.evaluate(() => {
    const root = getComputedStyle(document.documentElement)
    const card = document.querySelector('.card')
    return {
      theme: document.documentElement.dataset.theme,
      bg: root.getPropertyValue('--bg').trim(),
      surface: root.getPropertyValue('--surface').trim(),
      bodyColor: getComputedStyle(document.body).color,
      cardBackground: card ? getComputedStyle(card).backgroundColor : '',
      stored: localStorage.getItem('growth-os-theme'),
    }
  })
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

  const light = await themeState(page)
  assert(light.theme === 'light', `默认主题应为浅色，实际 ${light.theme}`)
  assert(light.bg === '#f4f6fa', `浅色背景 token 不正确：${light.bg}`)
  pass('浅色设计 token', `bg ${light.bg} · surface ${light.surface}`)

  await page.click('button[aria-label="打开设置"]')
  await page.waitForSelector('.theme-card', { timeout: 15000 })
  await clickText(page, '.theme-option', '深色')
  await waitText(page, '主题已切换', 15000)
  await delay(300)
  const dark = await themeState(page)
  assert(dark.theme === 'dark', `切换后主题应为深色，实际 ${dark.theme}`)
  assert(dark.bg === '#10131a', `深色背景 token 不正确：${dark.bg}`)
  assert(dark.stored === 'dark', `主题未写入 localStorage：${dark.stored}`)
  const darkCardRgb = dark.cardBackground.replace(/rgba?\(|\)/g, '').split(',').map((item) => Number(item.trim()))
  assert(darkCardRgb[0] < 60 && darkCardRgb[1] < 60 && darkCardRgb[2] < 70, `深色卡片背景异常：${dark.cardBackground}`)
  pass('深色主题切换', `${dark.bg} · card ${dark.cardBackground}`)

  await page.screenshot({ path: '/tmp/growth-os-ui2-dark-settings.png', fullPage: true })
  pass('深色设置页截图', '/tmp/growth-os-ui2-dark-settings.png')

  await page.reload({ waitUntil: 'networkidle0' })
  await page.waitForSelector('.theme-card', { timeout: 15000 })
  await delay(300)
  const restored = await themeState(page)
  assert(restored.theme === 'dark', '刷新后深色主题未恢复')
  assert(restored.stored === 'dark', '刷新后 localStorage 主题丢失')
  pass('主题持久化', '刷新后仍为深色')

  await clickText(page, 'a.nav-item', '今日概览')
  await page.waitForSelector('.hero-title', { timeout: 15000 })
  const dashboardTheme = await themeState(page)
  assert(dashboardTheme.theme === 'dark', 'Dashboard 未应用深色主题')
  await page.screenshot({ path: '/tmp/growth-os-ui2-dark-dashboard.png', fullPage: true })
  pass('Dashboard 深色适配', '/tmp/growth-os-ui2-dark-dashboard.png')

  await page.click('button[aria-label="打开设置"]')
  await page.waitForSelector('.theme-card', { timeout: 15000 })
  await clickText(page, '.theme-option', '浅色')
  await waitText(page, '主题已切换', 15000)
  await delay(250)
  const backToLight = await themeState(page)
  assert(backToLight.theme === 'light', '切回浅色失败')
  assert(backToLight.stored === 'light', '切回浅色后 localStorage 不正确')
  pass('切回浅色')

  await clickText(page, 'a.nav-item', '今日概览')
  await page.waitForSelector('.hero-title', { timeout: 15000 })
  await page.screenshot({ path: '/tmp/growth-os-ui2-light-dashboard.png', fullPage: true })
  pass('Dashboard 浅色截图', '/tmp/growth-os-ui2-light-dashboard.png')

  await page.click('button[aria-label="快速创建"]')
  await page.waitForSelector('.quick-panel', { timeout: 8000 })
  await waitText(page, '新建目标')
  await waitText(page, '每日复盘')
  await clickText(page, '.quick-item', '新建任务')
  await page.waitForFunction(() => location.pathname === '/goals', { timeout: 10000 })
  await page.waitForSelector('#task-title', { timeout: 15000 })
  const queryCleared = await page.evaluate(() => location.search)
  assert(queryCleared === '', `快速创建后查询参数未清理：${queryCleared}`)
  pass('快速创建自动打开表单', '任务表单直接打开并清理 URL')
  await clickText(page, '.modal-actions button', '取消')
  await waitModalClosed(page)

  await page.click('button[aria-label="今日日历"]')
  await page.waitForSelector('.calendar-body', { timeout: 10000 })
  await waitText(page, '今日日历')
  await waitText(page, '时间盒')
  await waitText(page, '今日任务')
  pass('日历入口抽屉', '时间盒与今日任务')
  await clickText(page, '.drawer-foot button', '打开时间盒')
  await page.waitForFunction(() => location.pathname === '/goals', { timeout: 10000 })
  await page.waitForFunction(() => !document.querySelector('.drawer-panel'), {
    timeout: 8000,
  })
  pass('日历抽屉跳转时间盒')

  await page.setViewport({ width: 390, height: 844 })
  await page.goto(APP_URL, { waitUntil: 'networkidle0' })
  await page.waitForSelector('.hero-title', { timeout: 15000 })
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  )
  assert(overflow <= 2, `移动端存在横向溢出：${overflow}px`)
  const quickVisible = await page.$eval('button[aria-label="快速创建"]', (element) => {
    const style = window.getComputedStyle(element)
    return style.display !== 'none' && element.getBoundingClientRect().width > 0
  })
  assert(quickVisible, '移动端快速创建按钮不可见')
  await page.click('button[aria-label="快速创建"]')
  await page.waitForSelector('.quick-panel', { timeout: 8000 })
  await page.screenshot({ path: '/tmp/growth-os-ui2-mobile.png', fullPage: true })
  pass('移动端新顶栏', '390px 无溢出，快速创建可用')

  assert(
    consoleErrors.length === 0,
    `浏览器控制台存在错误：\n${consoleErrors.join('\n')}`,
  )
  pass('控制台无错误')

  console.log('\nUI 阶段 2 验收通过：')
  for (const step of steps) {
    console.log(`- ${step.name}${step.detail ? `：${step.detail}` : ''}`)
  }
} catch (error) {
  await page
    .screenshot({ path: '/tmp/growth-os-ui2-failure.png', fullPage: true })
    .catch(() => {})
  console.error('\nUI 阶段 2 验收失败：', error instanceof Error ? error.message : error)
  if (consoleErrors.length) console.error('控制台错误：\n' + consoleErrors.join('\n'))
  process.exitCode = 1
} finally {
  await browser.close()
}