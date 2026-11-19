import { existsSync, mkdirSync } from 'node:fs'
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
      const target = element
      const setter = Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(target),
        'value',
      )?.set
      setter?.call(target, next)
      target.dispatchEvent(new Event('input', { bubbles: true }))
      target.dispatchEvent(new Event('change', { bubbles: true }))
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
  await page.waitForFunction(() => !document.querySelector('.modal-backdrop'), {
    timeout,
  })
}

async function clickInCard(page, cardSelector, text, actionLabel) {
  const cards = await page.$$(cardSelector)
  for (const card of cards) {
    const content = await card.evaluate((node) => (node.textContent ?? '').trim())
    if (!content.includes(text)) continue
    await card.evaluate((node) => node.scrollIntoView({ block: 'center' }))
    const button = await card.$(`button[aria-label="${actionLabel}"]`)
    if (!button) throw new Error(`卡片中未找到操作按钮：${actionLabel}`)
    await button.click()
    return
  }
  throw new Error(`未找到包含“${text}”的卡片：${cardSelector}`)
}

async function clickVision(page, title) {
  const items = await page.$$('.vision-item')
  for (const item of items) {
    const content = await item.evaluate((node) => (node.textContent ?? '').trim())
    if (content.includes(title)) {
      await item.click()
      return
    }
  }
  throw new Error(`未找到愿景：${title}`)
}

const browser = await puppeteer.launch({
  executablePath: CHROME_PATH,
  headless: true,
  args: ['--no-first-run', '--no-default-browser-check', '--window-size=1440,1000'],
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

mkdirSync('/tmp', { recursive: true })

try {
  await page.goto(APP_URL, { waitUntil: 'networkidle0', timeout: 30000 })
  await page.waitForSelector('.hero-title', { timeout: 15000 })
  await clickText(page, 'button', '载入演示数据')
  await waitText(page, '演示数据已载入', 20000)
  await page.waitForSelector('.dashboard-grid', { timeout: 15000 })
  pass('准备演示数据')

  await clickText(page, 'a.nav-item', '未来自我')
  await page.waitForSelector('.vision-head', { timeout: 15000 })
  await waitText(page, '成为具备独立研究与工程实践能力的技术人才')
  pass('进入未来自我')

  const stats = await page.$$eval('.future-stat-value', (nodes) =>
    nodes.map((node) => node.textContent.trim()),
  )
  assert(stats[0] === '1', `愿景数应为 1，实际 ${stats[0]}`)
  assert(stats[1] === '2', `活跃方向应为 2，实际 ${stats[1]}`)
  assert(stats[2] === '2', `身份数应为 2，实际 ${stats[2]}`)
  assert(stats[3] === '22 小时', `每周预算应为 22 小时，实际 ${stats[3]}`)
  const directionCount = await page.$$eval('.direction-card', (nodes) => nodes.length)
  const identityCount = await page.$$eval('.identity-item', (nodes) => nodes.length)
  assert(directionCount === 2, `方向卡应为 2，实际 ${directionCount}`)
  assert(identityCount === 2, `身份条目应为 2，实际 ${identityCount}`)
  pass('愿景详情与聚合', `统计 ${stats.join(' / ')}，${directionCount} 个方向，${identityCount} 个身份`)

  await clickText(page, '.header-actions button', '新建愿景')
  await page.waitForSelector('#vision-title', { timeout: 8000 })
  await setInput(page, '#vision-title', '测试愿景：成为独立产品开发者')
  await setInput(page, '#vision-area', '职业发展')
  await setInput(page, '#vision-desc', '能够独立完成产品定义、设计、实现与发布。')
  await setInput(page, '#vision-motivation', '希望把自己的想法真正做成可用的产品，并验证判断。')
  await setInput(page, '#vision-success', '至少发布一个真实用户使用的产品，并完成一次迭代。')
  await setInput(page, '#vision-horizon', '2028-12-31')
  await setInput(page, '#vision-review', '2027-01-15')
  await clickText(page, '.modal-actions button', '创建愿景')
  await waitText(page, '愿景已创建', 15000)
  await waitModalClosed(page)
  await waitText(page, '测试愿景：成为独立产品开发者')
  pass('创建愿景', '包含时间范围、动机与成功标准')

  await clickText(page, '.vision-head-actions button', '编辑')
  await page.waitForSelector('#vision-title', { timeout: 8000 })
  await setInput(page, '#vision-title', '测试愿景：成为独立产品开发者（已更新）')
  await clickText(page, '.modal-actions button', '保存修改')
  await waitText(page, '愿景已更新', 15000)
  await waitModalClosed(page)
  await waitText(page, '（已更新）')
  pass('编辑愿景')

  await clickText(page, '.card button', '添加身份')
  await page.waitForSelector('#identity-title', { timeout: 8000 })
  await setInput(page, '#identity-title', '独立产品开发者')
  await setInput(page, '#identity-statement', '我是一个能够把想法变成真实产品的人。')
  await setInput(page, '#identity-desc', '负责从问题定义到产品发布的完整链路。')
  await clickText(page, '.modal-actions button', '添加身份')
  await waitText(page, '未来身份已添加', 15000)
  await waitModalClosed(page)
  await waitText(page, '独立产品开发者')
  pass('添加身份')

  await clickText(page, '.card button', '添加方向')
  await page.waitForSelector('#direction-name', { timeout: 8000 })
  const directionIdentity = await page.$eval(
    '#direction-identity',
    (element) => element.selectedOptions[0]?.textContent?.trim() ?? '',
  )
  assert(
    directionIdentity === '独立产品开发者',
    `新增方向未默认绑定当前身份：${directionIdentity}`,
  )
  await setInput(page, '#direction-name', '产品工程实践')
  await setInput(page, '#direction-desc', '通过真实产品项目训练端到端交付能力。')
  await setSelect(page, '#direction-priority', '2')
  await setSelect(page, '#direction-status', 'ACTIVE')
  await setInput(page, '#direction-start', '2026-12-01')
  await setInput(page, '#direction-target', '2028-06-30')
  await setInput(page, '#direction-hours', '6.5')
  await setInput(page, '#direction-review', '每月')
  await clickText(page, '.modal-actions button', '添加方向')
  await waitText(page, '发展方向已添加', 15000)
  await waitModalClosed(page)
  await waitText(page, '产品工程实践')
  const newCardText = await page.$$eval('.direction-card', (nodes) =>
    nodes.find((node) => (node.textContent ?? '').includes('产品工程实践'))?.textContent ?? '',
  )
  assert(newCardText.includes('6 小时 30 分钟'), '方向每周预算未按分钟存储/显示')
  assert(newCardText.includes('每月'), '方向审视周期未保存')
  assert(
    newCardText.includes('所属身份 · 独立产品开发者'),
    '方向卡未显示所属未来身份',
  )
  pass('添加方向', '每周预算 6.5 小时 · 默认绑定当前身份')

  await clickInCard(page, '.direction-card', '产品工程实践', '编辑方向')
  await page.waitForSelector('#direction-hours', { timeout: 8000 })
  await setInput(page, '#direction-hours', '5')
  await clickText(page, '.modal-actions button', '保存修改')
  await waitText(page, '发展方向已更新', 15000)
  await waitModalClosed(page)
  const editedCard = await page.$$eval('.direction-card', (nodes) =>
    nodes.find((node) => (node.textContent ?? '').includes('产品工程实践'))?.textContent ?? '',
  )
  assert(editedCard.includes('5 小时'), '方向编辑后预算未更新')
  pass('编辑方向')

  await clickInCard(page, '.direction-card', '产品工程实践', '归档方向')
  await waitText(page, '归档内容')
  await clickText(page, '.modal-actions button', '确认归档')
  await waitText(page, '已归档，可随时恢复', 15000)
  await waitModalClosed(page)
  await delay(250)
  const visibleAfterArchive = await page.$$eval('.direction-card', (nodes) =>
    nodes.some((node) => (node.textContent ?? '').includes('产品工程实践')),
  )
  assert(!visibleAfterArchive, '归档方向仍然出现在默认列表')
  pass('归档方向', '默认列表已隐藏')

  await clickText(page, '.header-actions button', '显示已归档')
  await waitText(page, '隐藏已归档')
  await delay(250)
  await clickInCard(page, '.direction-card', '产品工程实践', '恢复方向')
  await waitText(page, '恢复内容')
  await clickText(page, '.modal-actions button', '确认恢复')
  await waitText(page, '已恢复', 15000)
  await waitModalClosed(page)
  await delay(250)
  const restored = await page.$$eval('.direction-card', (nodes) =>
    nodes.find((node) => (node.textContent ?? '').includes('产品工程实践'))?.textContent ?? '',
  )
  assert(!restored.includes('已归档'), '方向恢复后仍带归档标记')
  pass('恢复方向')

  await clickInCard(page, '.identity-item', '独立产品开发者', '归档身份')
  await waitText(page, '归档内容')
  await clickText(page, '.modal-actions button', '确认归档')
  await waitText(page, '已归档，可随时恢复', 15000)
  await waitModalClosed(page)
  await delay(250)
  await clickInCard(page, '.identity-item', '独立产品开发者', '恢复身份')
  await waitText(page, '恢复内容')
  await clickText(page, '.modal-actions button', '确认恢复')
  await waitText(page, '已恢复', 15000)
  await waitModalClosed(page)
  pass('归档与恢复身份')

  await clickText(page, '.header-actions button', '隐藏已归档')
  await waitText(page, '显示已归档')
  await delay(200)

  await clickVision(page, '测试愿景：成为独立产品开发者（已更新）')
  await delay(200)
  await page.click('button[title="归档愿景"]')
  await waitText(page, '归档内容')
  await clickText(page, '.modal-actions button', '确认归档')
  await delay(400)
  await waitModalClosed(page)
  const archivedVisionVisible = await page.$$eval('.vision-item', (nodes) =>
    nodes.some((node) => (node.textContent ?? '').includes('（已更新）')),
  )
  assert(!archivedVisionVisible, '归档愿景仍出现在默认列表')
  pass('归档愿景', '默认列表已隐藏，子对象未被删除')

  await clickText(page, '.header-actions button', '显示已归档')
  await delay(250)
  await clickVision(page, '测试愿景：成为独立产品开发者（已更新）')
  await delay(200)
  const restoreVisible = await page
    .$$eval('.vision-head-actions button', (nodes) =>
      nodes.map((node) => (node.textContent ?? '').trim()),
    )
  assert(restoreVisible.some((text) => text.includes('恢复')), '归档愿景未显示恢复按钮')
  await clickText(page, '.vision-head-actions button', '恢复')
  await waitText(page, '恢复内容')
  await clickText(page, '.modal-actions button', '确认恢复')
  await waitText(page, '已恢复', 15000)
  await waitModalClosed(page)
  pass('恢复愿景')

  await page.screenshot({ path: '/tmp/growth-os-future-self.png', fullPage: true })
  pass('未来自我截图', '/tmp/growth-os-future-self.png')

  await page.reload({ waitUntil: 'networkidle0' })

  await page.waitForSelector('.vision-head', { timeout: 15000 })
  await waitText(page, '（已更新）')
  await waitText(page, '产品工程实践')
  pass('刷新后持久化', '愿景、身份、方向均保留')

  assert(
    consoleErrors.length === 0,
    `浏览器控制台存在错误：\n${consoleErrors.join('\n')}`,
  )
  pass('控制台无错误')

  console.log('\n阶段 2 验收通过：')
  for (const step of steps) {
    console.log(`- ${step.name}${step.detail ? `：${step.detail}` : ''}`)
  }
} catch (error) {
  await page.screenshot({ path: '/tmp/growth-os-stage2-failure.png', fullPage: true }).catch(() => {})
  console.error('\n阶段 2 验收失败：', error instanceof Error ? error.message : error)
  if (consoleErrors.length) {
    console.error('控制台错误：\n' + consoleErrors.join('\n'))
  }
  process.exitCode = 1
} finally {
  await browser.close()
}

if (!existsSync('/tmp/growth-os-future-self.png')) {
  process.exitCode = 1
}