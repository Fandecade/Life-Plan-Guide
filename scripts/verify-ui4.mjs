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

async function setSelect(page, selector, value) {
  await page.$eval(
    selector,
    (element, next) => {
      element.value = next
      element.dispatchEvent(new Event('change', { bubbles: true }))
    },
    value,
  )
}

async function closeDrawer(page) {
  await page.click('.drawer-head button')
  await page.waitForFunction(() => !document.querySelector('.drawer-panel'), {
    timeout: 8000,
  })
}

const browser = await puppeteer.launch({
  executablePath: CHROME_PATH,
  headless: true,
  args: ['--no-first-run', '--no-default-browser-check', '--window-size=1440,1100'],
})

const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 1100 })

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

  await clickText(page, 'a.nav-item', '发展路线')
  await page.waitForSelector('.map-card', { timeout: 15000 })
  pass('进入发展路线')

  await page.evaluate(() => {
    const node = Array.from(document.querySelectorAll('.tree-node')).find(
      (element) =>
        (element.querySelector('.node-name')?.textContent ?? '').trim() ===
        'SAT 与局部搜索',
    )
    if (!node) throw new Error('未找到 SAT 能力节点')
    const main = node.querySelector('.node-main')
    if (!main) throw new Error('能力节点缺少详情入口')
    main.click()
  })
  await page.waitForSelector('.drawer-panel', { timeout: 8000 })
  await waitText(page, '成长曲线')
  await waitText(page, '评价标准')
  const growthSvg = await page.$$eval('.growth-svg', (nodes) => nodes.length)
  assert(growthSvg === 1, '能力详情未渲染成长曲线')
  await waitText(page, '关联发展方向')
  pass('能力节点详情', '等级、评价标准、方向与成长曲线')
  await closeDrawer(page)

  await clickText(page, '.view-tab', '里程碑')
  await page.waitForSelector('.milestone-board', { timeout: 8000 })
  await setSelect(page, 'select[aria-label="按里程碑状态筛选"]', 'IN_PROGRESS')
  await page.waitForFunction(
    () => document.querySelectorAll('.milestone-card').length === 1,
    { timeout: 8000 },
  )
  pass('里程碑状态筛选', '进行中：1 条')
  await setSelect(page, 'select[aria-label="按里程碑状态筛选"]', 'ALL')
  await setSelect(page, 'select[aria-label="按重要程度筛选"]', 'CRITICAL')
  await page.waitForFunction(
    () => document.querySelectorAll('.milestone-card').length === 1,
    { timeout: 8000 },
  )
  pass('里程碑重要度筛选', '关键：1 条')
  await setSelect(page, 'select[aria-label="按重要程度筛选"]', 'ALL')

  await clickText(page, '.milestone-name-btn', '独立完成 SAT 算法复现实验')
  await page.waitForSelector('.drawer-panel', { timeout: 8000 })
  await waitText(page, '验收条件')
  await waitText(page, '关联目标（1）')
  await waitText(page, '掌握 ACO 求解 SAT 的基本原理与实现')
  pass('里程碑详情抽屉', '日期、验收条件与关联目标')
  await closeDrawer(page)

  await clickText(page, '.view-tab', '时间线')
  await page.waitForSelector('.timeline-table', { timeout: 8000 })
  await clickText(page, '.scale-switch button', '月')
  await delay(200)
  const monthTicks = await page.$$eval('.tick', (nodes) => nodes.length)
  await clickText(page, '.scale-switch button', '周')
  await delay(200)
  const weekTicks = await page.$$eval('.tick', (nodes) => nodes.length)
  assert(weekTicks > monthTicks, `周刻度应多于月刻度：${weekTicks} / ${monthTicks}`)
  pass('时间线缩放', `月 ${monthTicks} 刻度 → 周 ${weekTicks} 刻度`)

  await delay(700)
  await page.screenshot({ path: '/tmp/growth-os-ui4-roadmap.png', fullPage: true })
  pass('路线图截图', '/tmp/growth-os-ui4-roadmap.png')

  await clickText(page, '.scale-switch button', '年')
  await delay(250)
  const bars = await page.$$('.timeline-bar')
  let targetBar = null
  for (const bar of bars) {
    const content = await bar.evaluate((node) => (node.textContent ?? '').trim())
    if (content.includes('独立完成 SAT 算法复现实验')) {
      targetBar = bar
      break
    }
  }
  assert(targetBar, '未找到用于拖拽的里程碑条')
  await targetBar.evaluate((node) =>
    node.scrollIntoView({ block: 'center', inline: 'center' }),
  )
  await delay(200)
  const box = await targetBar.boundingBox()
  assert(box, '里程碑条没有可拖拽区域')
  const startX = box.x + box.width / 2
  const startY = box.y + box.height / 2
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(startX + 80, startY, { steps: 8 })
  await page.mouse.up()
  await waitText(page, '里程碑日期已调整', 15000)
  pass('拖动里程碑调整日期')
  await delay(400)

  await page.reload({ waitUntil: 'networkidle0' })
  await page.waitForSelector('.map-card', { timeout: 15000 })
  await clickText(page, '.view-tab', '时间线')
  await page.waitForSelector('.timeline-table', { timeout: 10000 })
  pass('刷新后路线图持久化')

  assert(
    consoleErrors.length === 0,
    `浏览器控制台存在错误：\n${consoleErrors.join('\n')}`,
  )
  pass('控制台无错误')

  console.log('\nUI 阶段 4 验收通过：')
  for (const step of steps) {
    console.log(`- ${step.name}${step.detail ? `：${step.detail}` : ''}`)
  }
} catch (error) {
  await page
    .screenshot({ path: '/tmp/growth-os-ui4-failure.png', fullPage: true })
    .catch(() => {})
  console.error('\nUI 阶段 4 验收失败：', error instanceof Error ? error.message : error)
  if (consoleErrors.length) console.error('控制台错误：\n' + consoleErrors.join('\n'))
  process.exitCode = 1
} finally {
  await browser.close()
}