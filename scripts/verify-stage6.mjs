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

async function setInput(page, selector, value) {
  await page.$eval(
    selector,
    (element, next) => {
      const setter = Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(element),
        'value',
      )?.set
      setter?.call(element, next)
      element.dispatchEvent(new Event('input', { bubbles: true }))
      element.dispatchEvent(new Event('change', { bubbles: true }))
    },
    value,
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

async function clickHabitCardAction(page, cardSelector, name, label) {
  await page.evaluate(
    ({ selector, needle, action }) => {
      const cards = Array.from(document.querySelectorAll(selector))
      const card = cards.find((node) => (node.textContent ?? '').includes(needle))
      if (!card) throw new Error(`未找到习惯卡片：${needle}`)
      const button = card.querySelector(`button[aria-label="${action}"]`)
      if (!button) throw new Error(`习惯卡片缺少操作：${action}`)
      button.scrollIntoView({ block: 'center' })
      button.click()
    },
    { selector: cardSelector, needle: name, action: label },
  )
}

async function clickHabitCardButton(page, cardSelector, name, buttonText) {
  await page.evaluate(
    ({ selector, needle, text }) => {
      const cards = Array.from(document.querySelectorAll(selector))
      const card = cards.find((node) => (node.textContent ?? '').includes(needle))
      if (!card) throw new Error(`未找到习惯卡片：${needle}`)
      const button = Array.from(card.querySelectorAll('button')).find((node) =>
        (node.textContent ?? '').includes(text),
      )
      if (!button) throw new Error(`习惯卡片缺少按钮：${text}`)
      button.scrollIntoView({ block: 'center' })
      button.click()
    },
    { selector: cardSelector, needle: name, text: buttonText },
  )
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

  await clickText(page, 'a.nav-item', '行为习惯')
  await page.waitForSelector('.habit-grid', { timeout: 15000 })
  pass('进入行为习惯')

  const stats = await page.$$eval('.habit-stat .stat-number', (nodes) =>
    nodes.map((node) => node.textContent.trim()),
  )
  assert(stats[0] === '3', `启用习惯应为 3，实际 ${stats[0]}`)
  assert(stats[1] === '2 / 3', `今日完成应为 2/3，实际 ${stats[1]}`)
  assert(stats[2] === '2', `近 7 天执行应为 2，实际 ${stats[2]}`)
  assert(stats[3] === '1 天', `最长连续应为 1 天，实际 ${stats[3]}`)
  const cards = await page.$$eval('.habit-card', (nodes) => nodes.length)
  assert(cards === 3, `今日习惯卡应为 3，实际 ${cards}`)
  pass('习惯概览', `${stats.join(' / ')}，${cards} 个习惯`)

  await clickHabitCardButton(page, '.habit-card', '每天独立学习 25 分钟', '完成微行为')
  await page.waitForSelector('#log-difficulty', { timeout: 8000 })
  await setSelect(page, '#log-difficulty', '4')
  await setInput(page, '#log-obstacle', '今天有点累，但仍然开始')
  await clickText(page, '.modal-actions button', '保存记录')
  await waitText(page, '今日微习惯已完成', 15000)
  await waitModalClosed(page)
  const statsAfterLog = await page.$$eval('.habit-stat .stat-number', (nodes) =>
    nodes.map((node) => node.textContent.trim()),
  )
  assert(statsAfterLog[1] === '3 / 3', `完成打卡后应为 3/3，实际 ${statsAfterLog[1]}`)
  assert(statsAfterLog[2] === '3', `完成打卡后近 7 天应为 3，实际 ${statsAfterLog[2]}`)
  pass('微习惯打卡', '锚点、微行为、庆祝与难度')

  await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.habit-card'))
    const card = cards.find((node) =>
      (node.textContent ?? '').includes('每天独立学习 25 分钟'),
    )
    if (!card) throw new Error('未找到习惯卡片')
    const check = card.querySelector('.micro-check')
    if (!check) throw new Error('习惯卡片缺少打卡按钮')
    check.click()
  })
  await page.waitForSelector('#log-difficulty', { timeout: 8000 })
  const savedDifficulty = await page.$eval('#log-difficulty', (element) => element.value)
  assert(savedDifficulty === '4', `编辑记录应回填难度 4，实际 ${savedDifficulty}`)
  await setSelect(page, '#log-difficulty', '2')
  await setInput(page, '#log-note', '开始时有些抗拒，开始后进入状态。')
  await clickText(page, '.modal-actions button', '保存记录')
  await waitText(page, '今日微习惯已完成', 15000)
  await waitModalClosed(page)
  pass('编辑今日记录', '回填并更新难度与备注')

  await clickText(page, '.header-actions button', '新建习惯')
  await page.waitForSelector('#habit-name', { timeout: 8000 })
  await setInput(page, '#habit-name', '睡前整理明天的第一个任务')
  await setInput(page, '#habit-desc', '降低第二天开始工作的心理阻力。')
  await setSelect(page, '#habit-category', 'SUPPORT')
  await setSelect(page, '#habit-anchor-type', 'EVENT')
  await setInput(page, '#habit-anchor', '睡前关灯前')
  await setInput(page, '#habit-tiny', '写下明天最重要的第一个任务')
  await setInput(page, '#habit-celebration', '对自己说：明天已经开始了。')
  await setSelect(page, '#habit-motivation', '3')
  await setSelect(page, '#habit-ability', '5')
  await setSelect(page, '#habit-prompt-status', 'CLEAR')
  await setSelect(page, '#habit-status', 'ACTIVE')
  const preview = await page.$eval('.formula-preview p', (element) => element.textContent ?? '')
  assert(preview.includes('睡前关灯前'), '配方预览缺少锚点')
  assert(preview.includes('写下明天最重要的第一个任务'), '配方预览缺少微行为')
  await clickText(page, '.modal-actions button', '创建习惯')
  await waitText(page, '习惯配方已创建', 15000)
  await waitModalClosed(page)
  await waitText(page, '睡前整理明天的第一个任务')
  const statsAfterCreate = await page.$$eval('.habit-stat .stat-number', (nodes) =>
    nodes.map((node) => node.textContent.trim()),
  )
  assert(statsAfterCreate[1] === '3 / 4', `新习惯后应为 3/4，实际 ${statsAfterCreate[1]}`)
  pass('创建支持性习惯', 'B=MAP 配方与预览')

  await clickText(page, '.view-tab', '配方库')
  await page.waitForSelector('.library-grid', { timeout: 8000 })
  await clickHabitCardAction(page, '.library-card', '睡前整理明天的第一个任务', '编辑配方')
  await page.waitForSelector('#habit-tiny', { timeout: 8000 })
  await setInput(page, '#habit-tiny', '写下明天第一个任务并放在桌上')
  await clickText(page, '.modal-actions button', '保存修改')
  await waitText(page, '习惯配方已更新', 15000)
  await waitModalClosed(page)
  await waitText(page, '写下明天第一个任务并放在桌上')
  pass('编辑习惯配方')

  await clickHabitCardAction(page, '.library-card', '睡前整理明天的第一个任务', '暂停习惯')
  await waitText(page, '习惯已暂停', 15000)
  const pausedBadge = await page.$$eval('.library-card', (nodes) =>
    nodes.find((node) => (node.textContent ?? '').includes('睡前整理明天的第一个任务'))?.textContent ?? '',
  )
  assert(pausedBadge.includes('暂停'), '暂停后状态未更新')
  const activeAfterPause = await page.$eval('.habit-stat .stat-number', (element) => element.textContent?.trim())
  assert(activeAfterPause === '3', `暂停后启用习惯应为 3，实际 ${activeAfterPause}`)
  await clickHabitCardAction(page, '.library-card', '睡前整理明天的第一个任务', '启用习惯')
  await waitText(page, '习惯已启用', 15000)
  pass('暂停与启用习惯')

  await clickText(page, '.view-tab', '今日打卡')
  await delay(200)
  await clickHabitCardButton(page, '.habit-card', '每天独立学习 25 分钟', '历史记录')
  await page.waitForSelector('.history-list', { timeout: 8000 })
  await waitText(page, '开始时有些抗拒，开始后进入状态。')
  await waitText(page, '难度 2/5')
  pass('查看习惯历史', '记录保留难度、阻碍与备注')
  await page.click('.modal-head button')
  await waitModalClosed(page)

  await clickText(page, '.view-tab', '趋势与诊断')
  await page.waitForSelector('.heatmap', { timeout: 8000 })
  const heatmapRows = await page.$$eval('.heatmap-row', (nodes) => nodes.length)
  const heatmapCells = await page.$$eval('.heatmap-cell', (nodes) => nodes.length)
  assert(heatmapRows === 4, `热力图行数应为 4，实际 ${heatmapRows}`)
  assert(heatmapCells === 56, `热力图格子应为 56，实际 ${heatmapCells}`)
  const diagnosisCount = await page.$$eval('.diagnosis-item', (nodes) => nodes.length)
  assert(diagnosisCount >= 2, `行为诊断条目偏低：${diagnosisCount}`)
  await waitText(page, '动机连接不足')
  pass('执行热力图与 M/A/P 诊断', `${heatmapRows} 行 × 14 天，${diagnosisCount} 个待观察习惯`)

  await clickText(page, '.diagnosis-item button', '调整配方')
  await page.waitForSelector('#habit-name', { timeout: 8000 })
  const diagnosisHabitName = await page.$eval('#habit-name', (element) => element.value)
  assert(diagnosisHabitName.length > 0, '诊断调整未打开配方编辑器')
  pass('诊断建议回到配方编辑', diagnosisHabitName)
  await clickText(page, '.modal-actions button', '取消')
  await waitModalClosed(page)

  await clickText(page, '.view-tab', '配方库')
  await delay(200)
  await clickHabitCardAction(page, '.library-card', '睡前整理明天的第一个任务', '归档习惯')
  await waitText(page, '归档习惯')
  await clickText(page, '.modal-actions button', '确认归档')
  await waitText(page, '已归档，历史记录保留', 15000)
  await waitModalClosed(page)
  await delay(250)
  const hidden = await page.$$eval('.library-card', (nodes) =>
    nodes.some((node) => (node.textContent ?? '').includes('睡前整理明天的第一个任务')),
  )
  assert(!hidden, '归档习惯仍显示在默认列表')
  await clickText(page, '.toolbar-actions button', '显示已归档')
  await delay(250)
  await clickHabitCardAction(page, '.library-card', '睡前整理明天的第一个任务', '恢复习惯')
  await waitText(page, '恢复习惯')
  await clickText(page, '.modal-actions button', '确认恢复')
  await waitText(page, '已恢复', 15000)
  await waitModalClosed(page)
  pass('归档与恢复习惯', '历史记录保留')

  await clickText(page, '.view-tab', '今日打卡')
  await delay(200)
  await page.screenshot({ path: '/tmp/growth-os-habits.png', fullPage: true })
  pass('行为习惯截图', '/tmp/growth-os-habits.png')

  await page.reload({ waitUntil: 'networkidle0' })
  await page.waitForSelector('.habit-grid', { timeout: 15000 })
  await waitText(page, '睡前整理明天的第一个任务')
  await waitText(page, '写下明天第一个任务并放在桌上')
  const finalStats = await page.$$eval('.habit-stat .stat-number', (nodes) =>
    nodes.map((node) => node.textContent.trim()),
  )
  assert(finalStats[1] === '3 / 4', `刷新后今日完成应为 3/4，实际 ${finalStats[1]}`)
  pass('刷新后持久化')

  assert(
    consoleErrors.length === 0,
    `浏览器控制台存在错误：\n${consoleErrors.join('\n')}`,
  )
  pass('控制台无错误')

  console.log('\n阶段 6 验收通过：')
  for (const step of steps) {
    console.log(`- ${step.name}${step.detail ? `：${step.detail}` : ''}`)
  }
} catch (error) {
  await page
    .screenshot({ path: '/tmp/growth-os-stage6-failure.png', fullPage: true })
    .catch(() => {})
  console.error('\n阶段 6 验收失败：', error instanceof Error ? error.message : error)
  if (consoleErrors.length) console.error('控制台错误：\n' + consoleErrors.join('\n'))
  process.exitCode = 1
} finally {
  await browser.close()
}