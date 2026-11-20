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

async function waitModalClosed(page, timeout = 8000) {
  await page.waitForFunction(() => !document.querySelector('.modal-backdrop'), { timeout })
}

async function clickReviewAction(page, text, label) {
  await page.evaluate(
    ({ needle, action }) => {
      const cards = Array.from(document.querySelectorAll('.review-card'))
      const card = cards.find((node) => (node.textContent ?? '').includes(needle))
      if (!card) throw new Error(`未找到复盘卡片：${needle}`)
      const button = card.querySelector(`button[aria-label="${action}"]`)
      if (!button) throw new Error(`复盘卡片缺少操作：${action}`)
      button.scrollIntoView({ block: 'center' })
      button.click()
    },
    { needle: text, action: label },
  )
}

async function openReviewDetail(page, text) {
  await page.evaluate((needle) => {
    const cards = Array.from(document.querySelectorAll('.review-card'))
    const card = cards.find((node) => (node.textContent ?? '').includes(needle))
    if (!card) throw new Error(`未找到复盘卡片：${needle}`)
    const button = Array.from(card.querySelectorAll('button')).find((node) =>
      (node.textContent ?? '').includes('查看复盘'),
    )
    if (!button) throw new Error('复盘卡片缺少查看按钮')
    button.click()
  }, text)
}

async function fillFinding(page, index, values) {
  const editors = await page.$$('.finding-editor')
  const editor = editors[index]
  if (!editor) throw new Error(`未找到第 ${index + 1} 条发现`)
  const textareas = await editor.$$('textarea')
  await setHandleValue(textareas[0], values.description)
  if (values.rootCause !== undefined) await setHandleValue(textareas[1], values.rootCause)
  if (values.action !== undefined) {
    const input = await editor.$('input.input')
    if (input) await setHandleValue(input, values.action)
  }
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

  await clickText(page, 'a.nav-item', '复盘与洞察')
  await page.waitForSelector('.review-stats', { timeout: 15000 })
  pass('进入复盘与洞察')

  const stats = await page.$$eval('.review-stat .stat-number', (nodes) =>
    nodes.map((node) => node.textContent.trim()),
  )
  assert(stats[0] === '1', `近 7 天复盘应为 1，实际 ${stats[0]}`)
  assert(stats[1] === '0', `近 7 天完成任务应为 0，实际 ${stats[1]}`)
  assert(stats[2] === '2', `近 7 天习惯执行应为 2，实际 ${stats[2]}`)
  assert(stats[3] === '45 分钟', `近 7 天学习时长应为 45 分钟，实际 ${stats[3]}`)
  const initialCards = await page.$$eval('.review-card', (nodes) => nodes.length)
  assert(initialCards === 1, `初始复盘卡应为 1，实际 ${initialCards}`)
  pass('复盘概览', `${stats.join(' / ')}，${initialCards} 条复盘`)

  await openReviewDetail(page, '周复盘')
  await page.waitForSelector('.review-detail', { timeout: 8000 })
  await waitText(page, '发现（')
  await waitText(page, '计划调整')
  await waitText(page, '白纸输出能有效暴露理解偏差')
  pass('查看已有复盘', '发现与调整记录分离')
  await clickText(page, '.modal-actions button', '关闭')
  await waitModalClosed(page)

  await clickText(page, '.header-actions button', '开始复盘')
  await page.waitForSelector('#review-type', { timeout: 8000 })
  const dailyType = await page.$eval('#review-type', (element) => element.value)
  assert(dailyType === 'DAILY', `默认复盘类型应为每日，实际 ${dailyType}`)
  await setInput(page, '#review-section-0', '完成了 SAT 论文白纸输出，并发现了噪声参数的理解偏差。')
  await setInput(page, '#review-section-1', '下午注意力下降，实验实现没有开始。')
  await setInput(page, '#review-section-4', '明天上午先补齐噪声参数，再实现变量选择函数。')
  await setSelect(page, '#review-energy', '4')
  await clickText(page, '.findings-editor button', '添加发现')
  await delay(250)
  await fillFinding(page, 0, {
    description: '实验实现任务再次被推迟。',
    rootCause: '低估了补齐概率论基础需要的时间，且把实现放在精力最低的时段。',
    action: '把实现任务拆成两个 30 分钟步骤，并安排在上午。',
  })
  await clickText(page, '.modal-actions button', '保存复盘')
  await waitText(page, '复盘已保存', 20000)
  await page.waitForSelector('.review-detail', { timeout: 8000 })
  await waitText(page, '实验实现任务再次被推迟')
  pass('创建每日复盘', '成果、阻碍、反思、明日重点与发现')
  await clickText(page, '.modal-actions button', '关闭')
  await waitModalClosed(page)
  await delay(250)
  const afterDaily = await page.$$eval('.review-card', (nodes) => nodes.length)
  assert(afterDaily === 2, `新增每日复盘后应为 2 条，实际 ${afterDaily}`)
  pass('复盘列表更新')

  await openReviewDetail(page, '每日复盘')
  await page.waitForSelector('.review-detail', { timeout: 8000 })
  await clickText(page, '.review-detail button', '新增调整')
  await page.waitForSelector('#adjustment-type', { timeout: 8000 })
  await page.waitForFunction(
    () => document.querySelectorAll('#adjustment-target option').length > 1,
    { timeout: 8000 },
  )
  const chosenTarget = await selectByText(page, '#adjustment-target', '阅读 SAT 局部搜索论文')
  assert(chosenTarget.value, '目标对象选项值不应为空')
  await delay(150)
  await setSelect(page, '#adjustment-field', 'estimatedDuration')
  await delay(150)

  const oldValue = await page.$eval('.old-value-box', (element) => element.textContent ?? '')
  assert(oldValue.includes('45 分钟'), `旧值应为 45 分钟，实际 ${oldValue}`)
  await setInput(page, '#adjustment-new', '60')
  await setInput(page, '#adjustment-reason', '实际阅读与输出需要更多时间，避免计划持续失真。')
  await clickText(page, '.modal-actions button', '生成调整提案')
  await waitText(page, '调整已生成', 15000)
  await waitText(page, '待确认')
  pass('生成计划调整提案', '不直接修改计划')

  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('.adjustment-actions button'))
    const button = buttons.find((node) => (node.textContent ?? '').includes('预览并应用'))
    if (!button) throw new Error('未找到预览并应用按钮')
    button.scrollIntoView({ block: 'center' })
    button.click()
  })
  await delay(400)

  await page.waitForSelector('.apply-preview', { timeout: 8000 })
  const applyText = await page.$eval('.apply-preview', (element) => element.textContent ?? '')
  assert(applyText.includes('45 分钟'), '调整预览缺少旧值')
  assert(applyText.includes('60'), '调整预览缺少新值')
  await clickText(page, '.modal-actions button', '确认应用调整')
  await waitText(page, '调整已应用', 15000)
  await page.waitForFunction(
    () => !document.querySelector('.apply-preview'),
    { timeout: 8000 },
  )
  await delay(250)
  await waitText(page, '已应用')
  pass('预览并应用调整', '任务预计耗时 45 → 60 分钟')
  await clickText(page, '.modal-actions button', '关闭')
  await waitModalClosed(page)

  await clickText(page, 'a.nav-item', '目标与任务')
  await page.waitForSelector('.goal-tree', { timeout: 15000 })
  await clickText(page, '.view-tab', '任务')
  await page.waitForSelector('.task-tree', { timeout: 8000 })
  const taskText = await page.$$eval('.task-tree-node', (nodes) => {
    const node = nodes.find(
      (element) =>
        (element.querySelector('.task-title')?.textContent ?? '').trim() ===
        '阅读 SAT 局部搜索论文',
    )
    return node?.textContent ?? ''
  })
  assert(taskText.includes('1 小时'), '调整后任务预计耗时应为 1 小时')
  pass('调整写入真实计划', '任务预计耗时已更新')
  await clickText(page, 'a.nav-item', '复盘与洞察')
  await page.waitForSelector('.review-stats', { timeout: 15000 })

  await clickText(page, '.start-chip', '周复盘')
  await page.waitForSelector('#review-type', { timeout: 8000 })
  await setInput(page, '#review-section-0', '本周计划完成论文阅读与白纸输出。')
  await setInput(page, '#review-section-1', '完成了阅读与一次用户需求拆解；实验实现仍未开始。')
  await setInput(page, '#review-section-2', '白纸输出能帮助发现理解偏差，但实现时间仍不足。')
  await setInput(page, '#review-section-3', '下周减少并行任务，优先推进一个可运行成果。')
  await clickText(page, '.findings-editor button', '添加发现')
  await delay(250)
  await fillFinding(page, 0, {
    description: '并行安排过多，导致关键实现任务持续延后。',
  })
  await clickText(page, '.finding-editor .why-btn', '用 5Why 找根因')
  await page.waitForSelector('#why-0', { timeout: 8000 })
  const whyAnswers = [
    '因为实验实现没有排进上午的高精力时段',
    '因为上午被论文阅读和临时事务占满',
    '因为任务优先级没有按里程碑倒排',
    '因为周计划只是列出任务，没有核对时间预算',
    '因为没有把关键成果映射到每周可用时间',
  ]
  for (let index = 0; index < whyAnswers.length; index += 1) {
    await setInput(page, `#why-${index}`, whyAnswers[index])
  }
  await clickText(page, '.modal-actions button', '写入根因')
  await page.waitForFunction(() => !document.querySelector('#why-0'), { timeout: 8000 })
  await delay(200)
  const rootCause = await page.$$eval('.finding-editor textarea', (nodes) => nodes[1]?.value ?? '')
  assert(rootCause.includes('5Why 分析'), '5Why 未写入根因')
  await clickText(page, '.modal-actions button', '保存复盘')
  await waitText(page, '复盘已保存', 20000)
  await page.waitForSelector('.review-detail', { timeout: 8000 })
  await waitText(page, '5Why 分析')
  pass('PDCA 周复盘与 5Why', '根因链保存到发现')
  await clickText(page, '.modal-actions button', '关闭')
  await waitModalClosed(page)

  await clickText(page, '.view-tab', '成长洞察')
  await page.waitForSelector('.trend-table', { timeout: 8000 })
  const trendRows = await page.$$eval('.trend-table .trend-row', (nodes) => nodes.length)
  assert(trendRows === 5, `趋势表应为 4 周 + 表头，实际 ${trendRows}`)
  const insightCount = await page.$$eval('.insight-item', (nodes) => nodes.length)
  assert(insightCount >= 1, '成长洞察缺少系统观察')
  const coverageItems = await page.$$eval('.coverage-item', (nodes) => nodes.length)
  assert(coverageItems === 5, `复盘覆盖应为 5 类，实际 ${coverageItems}`)
  pass('成长洞察', `${trendRows - 1} 周趋势，${insightCount} 条观察`)

  await clickText(page, '.view-tab', '复盘记录')
  await delay(250)
  await clickReviewAction(page, '每日复盘', '归档复盘')
  await waitText(page, '归档复盘')
  await clickText(page, '.modal-actions button', '确认归档')
  await waitText(page, '已归档，历史内容保留', 15000)
  await waitModalClosed(page)
  await delay(250)
  const hidden = await page.$$eval('.review-card', (nodes) =>
    nodes.some((node) => (node.textContent ?? '').includes('每日复盘')),
  )
  assert(!hidden, '归档复盘仍出现在默认列表')
  await clickText(page, '.toolbar-actions button', '显示已归档')
  await delay(250)
  await clickReviewAction(page, '每日复盘', '恢复复盘')
  await waitText(page, '恢复复盘')
  await clickText(page, '.modal-actions button', '确认恢复')
  await waitText(page, '已恢复', 15000)
  await waitModalClosed(page)
  pass('归档与恢复复盘', '内容、发现与调整保留')

  await page.screenshot({ path: '/tmp/growth-os-review.png', fullPage: true })
  pass('复盘与洞察截图', '/tmp/growth-os-review.png')

  await page.reload({ waitUntil: 'networkidle0' })
  await page.waitForSelector('.review-stats', { timeout: 15000 })
  await waitText(page, '每日复盘')
  await waitText(page, '周复盘')
  await clickText(page, '.view-tab', '成长洞察')
  await waitText(page, '最近 4 周趋势')
  pass('刷新后持久化')

  assert(
    consoleErrors.length === 0,
    `浏览器控制台存在错误：\n${consoleErrors.join('\n')}`,
  )
  pass('控制台无错误')

  console.log('\n阶段 7 验收通过：')
  for (const step of steps) {
    console.log(`- ${step.name}${step.detail ? `：${step.detail}` : ''}`)
  }
} catch (error) {
  await page
    .screenshot({ path: '/tmp/growth-os-stage7-failure.png', fullPage: true })
    .catch(() => {})
  console.error('\n阶段 7 验收失败：', error instanceof Error ? error.message : error)
  if (consoleErrors.length) console.error('控制台错误：\n' + consoleErrors.join('\n'))
  process.exitCode = 1
} finally {
  await browser.close()
}