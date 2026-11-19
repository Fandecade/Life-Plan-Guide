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

async function setHandleValue(handle, value) {
  await handle.evaluate((element, next) => {
    const setter = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(element),
      'value',
    )?.set
    setter?.call(element, next)
    element.dispatchEvent(new Event('input', { bubbles: true }))
    element.dispatchEvent(new Event('change', { bubbles: true }))
  }, value)
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

async function selectByText(page, selector, text) {
  const options = await page.$$eval(`${selector} option`, (nodes) =>
    nodes.map((node) => ({ value: node.value, text: (node.textContent ?? '').trim() })),
  )
  const option = options.find((item) => item.text.includes(text))
  if (!option) throw new Error(`下拉框缺少选项：${text}`)
  await setSelect(page, selector, option.value)
  return option
}

async function waitText(page, text, timeout = 15000) {
  await page.waitForFunction(
    (needle) => document.body.innerText.includes(needle),
    { timeout, polling: 100 },
    text,
  )
}

async function waitSelectorGone(page, selector, timeout = 8000) {
  await page.waitForFunction(
    (needle) => !document.querySelector(needle),
    { timeout },
    selector,
  )
}

async function openCandidate(page, title) {
  await page.waitForFunction(
    (needle) =>
      Array.from(document.querySelectorAll('.candidate-card')).some((node) =>
        (node.textContent ?? '').includes(needle),
      ),
    { timeout: 10000 },
    title,
  )
  await page.evaluate((needle) => {
    const cards = Array.from(document.querySelectorAll('.candidate-card'))
    const card = cards.find((node) => (node.textContent ?? '').includes(needle))
    if (!card) throw new Error(`未找到候选行为卡片：${needle}`)
    card.scrollIntoView({ block: 'center' })
    card.click()
  }, title)
  await page.waitForSelector('.score-drawer', { timeout: 8000 })
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
  await page.waitForSelector('.view-toolbar', { timeout: 15000 })
  await clickText(page, '.view-tab', '焦点地图')
  await page.waitForSelector('.focus-map', { timeout: 15000 })
  await page.waitForFunction(
    () => (document.querySelector('.focus-stat strong')?.textContent ?? '').trim() === '4',
    { timeout: 10000 },
  )
  pass('进入焦点地图')

  const stats = await page.$$eval('.focus-stat strong', (nodes) =>
    nodes.map((node) => node.textContent.trim()),
  )
  assert(stats[0] === '4', `候选行为应为 4，实际 ${stats[0]}`)
  assert(stats[1] === '2', `Golden 应为 2，实际 ${stats[1]}`)
  assert(stats[2] === '0', `已设计应为 0，实际 ${stats[2]}`)
  const goldenCount = await page.$$eval('.quadrant-golden .candidate-card', (nodes) => nodes.length)
  const hardCount = await page.$$eval('.quadrant-hard .candidate-card', (nodes) => nodes.length)
  const easyCount = await page.$$eval('.quadrant-easy .candidate-card', (nodes) => nodes.length)
  assert(goldenCount === 2, `Golden 象限应为 2，实际 ${goldenCount}`)
  assert(hardCount === 1, `高影响较难象限应为 1，实际 ${hardCount}`)
  assert(easyCount === 1, `低影响容易象限应为 1，实际 ${easyCount}`)
  pass('Impact × Ease 分区', `Golden ${goldenCount} · 高影响较难 ${hardCount} · 低影响容易 ${easyCount}`)

  await clickText(page, '.focus-toolbar button', '新增候选行为')
  await page.waitForSelector('#candidate-title', { timeout: 8000 })
  await setInput(page, '#candidate-title', '每天写 100 字')
  await setInput(page, '#candidate-desc', '用很小的输出量维持写作与思考习惯。')
  await selectByText(page, '#candidate-direction', '研究生学业与科研')
  await setInput(page, '#candidate-note', '先以低阻力验证能否持续。')
  await clickText(page, '.modal-actions button', '添加候选')
  await waitText(page, '候选行为已添加', 15000)
  await page.waitForSelector('.score-drawer', { timeout: 8000 })
  await delay(300)
  pass('新增候选行为', '未评分时自动打开评分抽屉')

  const sliders = await page.$$('.score-drawer .slider')
  assert(sliders.length === 2, '评分抽屉应有两个滑块')
  await setHandleValue(sliders[0], '4')
  await setHandleValue(sliders[1], '5')
  await delay(250)
  const previewText = await page.$eval('.score-preview', (node) => node.textContent ?? '')
  assert(previewText.includes('Golden'), '评分预览未识别为 Golden')
  await clickText(page, '.drawer-actions button', '保存评分')

  await waitText(page, '评分已保存', 15000)
  await waitSelectorGone(page, '.drawer-panel')
  await page.waitForFunction(
    () => document.querySelectorAll('.quadrant-golden .candidate-card').length === 3,
    { timeout: 8000 },
  )
  pass('评分并自动定位', 'Impact 4 · Ease 5 → Golden')

  await openCandidate(page, '每天写 100 字')
  await clickText(page, '.drawer-actions button', '进入行为设计')
  await page.waitForSelector('.designer', { timeout: 8000 })
  await setInput(page, '#designer-anchor', '每天坐到书桌前')
  await clickText(page, '.designer-actions button', '下一步')
  await page.waitForSelector('#designer-tiny', { timeout: 8000 })
  await clickText(page, '.designer-actions button', '下一步')
  await page.waitForSelector('#designer-celebration', { timeout: 8000 })
  await setInput(page, '#designer-celebration', '对自己说：今天也有输出了。')
  await clickText(page, '.designer-test', '模拟检查一次')
  await waitText(page, '配方检查通过', 15000)
  await clickText(page, '.designer-actions button', '创建习惯')
  await waitText(page, '行为配方已生成', 20000)
  await waitSelectorGone(page, '.designer')
  await waitText(page, '已转化为习惯')
  const designedCount = await page.$$eval('.focus-stat strong', (nodes) =>
    nodes[2].textContent.trim(),
  )
  assert(designedCount === '1', `已设计习惯应为 1，实际 ${designedCount}`)
  pass('Behavior Designer', 'Prompt → Tiny → Celebration → 创建习惯')

  await clickText(page, '.view-tab', '今日打卡')
  await page.waitForSelector('.habit-grid', { timeout: 8000 })
  await waitText(page, '每天写 100 字')
  const activeCount = await page.$eval('.habit-stat .stat-number', (node) => node.textContent?.trim())
  assert(activeCount === '4', `启用习惯应为 4，实际 ${activeCount}`)
  pass('习惯自动进入今日打卡', '新的微习惯可立即执行')

  await clickText(page, '.view-tab', '焦点地图')
  await page.waitForSelector('.focus-map', { timeout: 8000 })
  await openCandidate(page, '每天写 100 字')
  await clickText(page, '.drawer-actions button', '归档候选')
  await waitText(page, '候选行为已归档', 15000)
  await waitSelectorGone(page, '.drawer-panel')
  await setSelect(page, 'select[aria-label="筛选候选行为状态"]', 'ARCHIVED')
  await delay(300)
  await openCandidate(page, '每天写 100 字')
  await clickText(page, '.drawer-actions button', '恢复候选')
  await waitText(page, '候选行为已恢复', 15000)
  await waitSelectorGone(page, '.drawer-panel')
  await setSelect(page, 'select[aria-label="筛选候选行为状态"]', 'ALL')
  await delay(300)
  await waitText(page, '已转化为习惯')
  pass('候选归档与恢复', '已转化状态不会被恢复成普通候选')

  await page.evaluate(() => {
    const cards = Array.from(
      document.querySelectorAll('.quadrant-easy .candidate-card'),
    )
    const card = cards.find((node) =>
      (node.textContent ?? '').includes('整理桌面 1 分钟'),
    )
    const target = document.querySelector('.quadrant-golden')
    if (!card || !target) throw new Error('拖拽源或目标不存在')
    const transfer = new DataTransfer()
    card.dispatchEvent(
      new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }),
    )
    target.dispatchEvent(
      new DragEvent('dragover', {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer,
      }),
    )
    target.dispatchEvent(
      new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer,
      }),
    )
  })
  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll('.quadrant-golden .candidate-card')).some(
        (node) => (node.textContent ?? '').includes('整理桌面 1 分钟'),
      ),
    { timeout: 8000 },
  )
  const draggedText = await page.evaluate(() => {
    const card = Array.from(
      document.querySelectorAll('.quadrant-golden .candidate-card'),
    ).find((node) => (node.textContent ?? '').includes('整理桌面 1 分钟'))
    return card?.textContent ?? ''
  })
  assert(draggedText.includes('I4'), '拖拽后 Impact 未更新为 4')
  assert(draggedText.includes('E4'), '拖拽后 Ease 未更新为 4')
  pass('拖拽调整象限', '低影响容易 → Golden，评分自动更新')

  await page.screenshot({ path: '/tmp/growth-os-focus-map.png', fullPage: true })
  pass('焦点地图截图', '/tmp/growth-os-focus-map.png')

  await page.reload({ waitUntil: 'networkidle0' })
  await page.waitForSelector('.view-toolbar', { timeout: 15000 })
  await clickText(page, '.view-tab', '焦点地图')
  await page.waitForSelector('.focus-map', { timeout: 15000 })
  await waitText(page, '每天写 100 字')
  await waitText(page, '整理桌面 1 分钟')
  pass('刷新后持久化')

  await page.setViewport({ width: 390, height: 844 })
  await page.goto(`${APP_URL}habits`, { waitUntil: 'networkidle0' })
  await page.waitForSelector('.view-toolbar', { timeout: 15000 })
  await clickText(page, '.view-tab', '焦点地图')
  await page.waitForSelector('.focus-map', { timeout: 8000 })
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  )
  assert(overflow <= 2, `焦点地图移动端横向溢出：${overflow}px`)
  pass('焦点地图移动端', '390px 无横向溢出')

  assert(
    consoleErrors.length === 0,
    `浏览器控制台存在错误：\n${consoleErrors.join('\n')}`,
  )
  pass('控制台无错误')

  console.log('\nUI 阶段 1 验收通过：')
  for (const step of steps) {
    console.log(`- ${step.name}${step.detail ? `：${step.detail}` : ''}`)
  }
} catch (error) {
  await page
    .screenshot({ path: '/tmp/growth-os-ui1-failure.png', fullPage: true })
    .catch(() => {})
  console.error('\nUI 阶段 1 验收失败：', error instanceof Error ? error.message : error)
  if (consoleErrors.length) console.error('控制台错误：\n' + consoleErrors.join('\n'))
  process.exitCode = 1
} finally {
  await browser.close()
}
