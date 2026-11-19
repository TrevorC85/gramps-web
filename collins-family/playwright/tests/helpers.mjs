import fs from 'node:fs'
import {expect} from '@playwright/test'

export const OUT = '/workspace/gramps-web/build/tree-proto/v2'
export const LOCAL = /^http:\/\/127\.0\.0\.1:505[78]$/

// Credentials come from local files and are never printed
export function synthUser(name) {
  const users = JSON.parse(
    fs.readFileSync('/workspace/gramps-web-proto/synthetic/secrets/users.json', 'utf8')
  )
  return {user: name, pass: users[name]}
}

export function realUser(role) {
  if (role === 'owner') {
    let user
    let pass
    const text = fs.readFileSync('/workspace/gramps-web/.admin_password', 'utf8')
    for (const line of text.split('\n')) {
      const [k, ...v] = line.trim().split('=')
      if (k === 'username' && !user) user = v.join('=')
      else if (k === 'password' && user && !pass) pass = v.join('=')
    }
    return {user, pass}
  }
  const users = JSON.parse(
    fs.readFileSync('/workspace/gramps-web-proto/realcopy/secrets/users.json', 'utf8')
  )
  return {user: `copy_${role}`, pass: users[`copy_${role}`]}
}

export async function login(page, base, {user, pass}) {
  if (!LOCAL.test(base)) throw new Error('only local test instances')
  await page.goto(`${base}/`)
  await page.locator('#username').fill(user)
  await page.locator('#password').fill(pass)
  await page.locator('#password').press('Enter')
  await page.waitForFunction(() => localStorage.getItem('access_token'), null, {
    timeout: 30000,
  })
}

// Opens the ancestor tree of `gid` with chart settings and theme
export async function openTree(
  page,
  base,
  gid,
  {orientation = 'horizontal', linkStyle = 'on', theme = 'light', ancestors = 3, fit = true} = {}
) {
  await page.emulateMedia({colorScheme: theme})
  await page.evaluate(
    s => {
      const old = JSON.parse(localStorage.getItem('grampsjs_settings') || '{}')
      localStorage.setItem('grampsjs_settings', JSON.stringify({...old, ...s}))
    },
    {
      treeChartOrientation: orientation,
      treeChartLinkStyle: linkStyle,
      treeChartAnc: ancestors,
      theme,
    }
  )
  await page.goto(`${base}/tree/ancestor/${gid}`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1500)
  if (fit) {
    await page.locator('#btn-fit').click()
    await page.waitForTimeout(900)
  }
}

// Everything the tests check, read through the shadow roots
export async function chartState(page) {
  return page.evaluate(() => {
    const find = (root, sel, acc = []) => {
      root.querySelectorAll(sel).forEach(e => acc.push(e))
      root.querySelectorAll('*').forEach(e => e.shadowRoot && find(e.shadowRoot, sel, acc))
      return acc
    }
    const rect = e => {
      const r = e.getBoundingClientRect()
      return {x: r.x, y: r.y, w: r.width, h: r.height}
    }
    const content = find(document, '#chart-content')[0]
    const k = content?.transform.baseVal.consolidate()?.matrix.a ?? 1
    const links = find(document, 'path.link').map(p => ({
      relation: p.getAttribute('data-relation'),
      level: p.getAttribute('data-level'),
      families: p.getAttribute('data-families'),
      width: Number(p.getAttribute('stroke-width')),
      dash: p.getAttribute('stroke-dasharray'),
      stroke: getComputedStyle(p).stroke,
      title: p.querySelector('title')?.textContent ?? '',
      box: rect(p),
    }))
    const cards = find(document, '.person-node .person-card').map(rect)
    const legendEl = find(document, '.link-legend')[0]
    const legend =
      legendEl && legendEl.getAttribute('display') !== 'none' && legendEl.childElementCount
        ? {box: rect(legendEl), text: legendEl.textContent}
        : null
    const badges = find(document, '.more-families').map(b => ({
      text: b.querySelector('text')?.textContent,
      title: b.querySelector('title')?.textContent,
    }))
    const text = find(document, '.person-node').map(n => n.textContent).join(' | ')
    const background = getComputedStyle(document.body).backgroundColor
    // Lines that touch or run along each other outside the cards: points
    // along each path (screen pixels) closer than half their widths
    const paths = find(document, 'path.link')
    const cardRects = find(document, '.person-node .person-card').map(rect)
    const inCard = ([x, y]) =>
      cardRects.some(c => x >= c.x - 1 && x <= c.x + c.w + 1 && y >= c.y - 1 && y <= c.y + c.h + 1)
    const samples = paths.map(p => {
      const m = p.getScreenCTM()
      const len = p.getTotalLength()
      const pts = []
      for (let d = 0; d <= len; d += 2) {
        const q = p.getPointAtLength(d)
        const sp = new DOMPoint(q.x, q.y).matrixTransform(m)
        if (!inCard([sp.x, sp.y])) pts.push([sp.x, sp.y])
      }
      return {pts, half: (Number(p.getAttribute('stroke-width')) * k) / 2}
    })
    const clashes = []
    samples.forEach((a, i) =>
      samples.slice(i + 1).forEach((b, j) => {
        const limit = a.half + b.half
        if (a.pts.some(([x1, y1]) => b.pts.some(([x2, y2]) => Math.hypot(x1 - x2, y1 - y2) < limit)))
          clashes.push([i, i + 1 + j])
      })
    )
    return {k, links, cards, legend, badges, text, background, clashes}
  })
}

const overlap = (a, b) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))

export function expectNoCardOverlap(state) {
  state.cards.forEach((a, i) =>
    state.cards.slice(i + 1).forEach(b => expect(overlap(a, b)).toBeLessThan(1))
  )
  if (state.legend) {
    for (const card of state.cards) {
      expect(overlap(card, state.legend.box)).toBeLessThan(1)
    }
  }
}

// No two link lines touch or run along each other outside the cards
export function expectNoLinkOverlap(state) {
  expect(state.clashes, JSON.stringify(state.clashes.map(c => c.map(i => state.links[i].title.split('\n')[0])))).toEqual([])
}

export async function shot(page, name) {
  await page.screenshot({path: `${OUT}/${name}.png`})
}
