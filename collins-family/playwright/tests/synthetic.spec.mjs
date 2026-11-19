// Link lines on the synthetic, fictional test tree (127.0.0.1:5057)
import fs from 'node:fs'
import {test, expect} from '@playwright/test'
import {
  chartState,
  expectNoCardOverlap, expectNoLinkOverlap,
  login,
  openTree,
  shot,
  synthUser,
  OUT,
} from './helpers.mjs'

const BASE = 'http://127.0.0.1:5057'
const ALL_RELATIONS = ['Birth', 'Adopted', 'Stepchild', 'Sponsored', 'Unknown', 'Guardianship']

test.describe.serial('synthetic tree as owner', () => {
  let page
  test.beforeAll(async ({browser}) => {
    page = await browser.newPage({viewport: {width: 1600, height: 1000}})
    await login(page, BASE, synthUser('synth_owner'))
  })
  test.afterAll(async () => page.close())

  for (const orientation of ['horizontal', 'vertical']) {
    for (const theme of ['light', 'dark']) {
      test(`Ava: four parents, every relation and level (${orientation}, ${theme})`, async () => {
        await openTree(page, BASE, 'ST0001', {orientation, theme})
        const s = await chartState(page)
        await shot(page, `synth_owner_ST0001_${orientation}_${theme}`)
        expect(s.links).toHaveLength(12)
        expect(new Set(s.links.map(l => l.relation))).toEqual(new Set(ALL_RELATIONS))
        // level 3 is on the hidden third family here (and on Ben's links)
        expect(new Set(s.links.map(l => l.level))).toEqual(
          new Set(['0', '1', '2', '4', 'none'])
        )
        expect(s.legend.text).toContain('Relationship (line colour)')
        expect(s.legend.text).toContain('Very High (4)')
        expect(s.legend.text).toContain('No confidence')
        expect(s.badges).toEqual([
          expect.objectContaining({text: '+1 family'}),
        ])
        expect(s.badges[0].title).toContain('F003: father Foster, mother Foster')
        expect(s.text).toContain('Percy') // private, visible to the owner
        expectNoCardOverlap(s)
        expectNoLinkOverlap(s)
        const birth = s.links.find(l => l.relation === 'Birth')
        const [r, g, b] = birth.stroke.match(/\d+/g).map(Number)
        // dark grey in light mode, light grey in dark mode
        if (theme === 'light') expect(r + g + b).toBeLessThan(3 * 120)
        else expect(r + g + b).toBeGreaterThan(3 * 120)
        const adopted = s.links.find(l => l.relation === 'Adopted')
        expect(adopted.title).toBe(
          'Adopted — Father (2nd parent family)\nConfidence: Normal (2/4)\nSource: confidence note “probable”'
        )
      })
    }
  }

  test('Ben: a parent in both families gets one line', async () => {
    await openTree(page, BASE, 'ST0002')
    const s = await chartState(page)
    await shot(page, 'synth_owner_ST0002_shared_parent')
    expect(s.links).toHaveLength(3)
    const both = s.links.filter(l => l.families)
    expect(both).toHaveLength(1)
    expect(both[0].families).toBe('2')
    // styled by the birth family's link (citations 3 and 1: highest shown)
    expect(both[0].relation).toBe('Birth')
    expect(both[0].level).toBe('3')
    expect(both[0].title).toContain('Birth — Father (1st parent family)')
    expect(both[0].title).toContain('Also: Birth — 2nd parent family, Low (1/4)')
    expect(s.links.find(l => l.relation === 'Stepchild').level).toBe('1')
    expect(s.links.filter(l => l.level === '3')).toHaveLength(2) // High
    expect(s.links.filter(l => l.title.includes('Citations disagree'))).toHaveLength(2)
    expectNoCardOverlap(s)
    expectNoLinkOverlap(s)
  })

  test('Cara as owner: private family and private child ref are shown', async () => {
    await openTree(page, BASE, 'ST0003')
    const s = await chartState(page)
    await shot(page, 'synth_owner_ST0003_private_links')
    expect(s.text).toContain('Hal')
    expect(s.links.find(l => l.title.includes('Birth — Father')).level).toBe('4')
  })

  test('edit mode keeps the styled links', async () => {
    await openTree(page, BASE, 'ST0001')
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('edit-mode:toggle')))
    await page.waitForTimeout(1200)
    const s = await chartState(page)
    await shot(page, 'synth_owner_ST0001_edit_mode')
    expect(s.links).toHaveLength(12)
    expect(s.legend).not.toBeNull()
    expectNoCardOverlap(s)
    expectNoLinkOverlap(s)
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('edit-mode:off')))
  })

  test('zoomed out: minimum widths and readable dashes', async () => {
    await openTree(page, BASE, 'ST0001')
    // zoom out with the view's '-' key from the fitted view
    for (let i = 0; i < 4; i += 1) {
      await page.keyboard.press('-')
      await page.waitForTimeout(400)
    }
    await page.waitForTimeout(600)
    const s = await chartState(page)
    await shot(page, 'synth_owner_ST0001_zoomed_out')
    expect(s.k).toBeLessThan(0.6)
    const floors = {0: 1, 1: 1.6, 2: 2.3, 3: 3.1, 4: 4, none: 1}
    for (const link of s.links) {
      const onScreen = link.width * s.k
      expect(onScreen).toBeGreaterThanOrEqual(Math.min(floors[link.level], 7 * s.k) - 0.01)
      if (link.level === 'none') {
        const [dash, gap] = link.dash.split(' ').map(Number)
        expect(dash * s.k).toBeGreaterThanOrEqual(5.99)
        expect(gap * s.k).toBeGreaterThanOrEqual(3.99)
      }
    }
  })

  test('SVG download contains the legend and the styled links', async () => {
    await openTree(page, BASE, 'ST0001')
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('grampsjs-svg-download-button').click(),
    ])
    const file = `${OUT}/synth_owner_ST0001_download.svg`
    await download.saveAs(file)
    const svg = fs.readFileSync(file, 'utf8')
    expect(svg).toContain('class="link-legend"')
    expect(svg).toContain('Confidence (line width)')
    expect(svg).toContain('data-relation="Adopted"')
    expect(svg).toContain('stroke="#4d4d4d"')
    expect(svg).not.toContain('var(--')
  })

  test('setting off: the standard tree', async () => {
    await openTree(page, BASE, 'ST0001', {linkStyle: 'off'})
    const s = await chartState(page)
    await shot(page, 'synth_owner_ST0001_style_off')
    expect(s.legend).toBeNull()
    expect(s.badges).toHaveLength(0)
    expect(s.links.every(l => l.relation === null)).toBe(true)
    expect(s.text).not.toContain('Adam') // adoptive family not followed
  })
})

for (const role of ['member', 'guest']) {
  test.describe.serial(`synthetic tree as ${role}`, () => {
    let page
    test.beforeAll(async ({browser}) => {
      page = await browser.newPage({viewport: {width: 1600, height: 1000}})
      await login(page, BASE, synthUser(`synth_${role}`))
    })
    test.afterAll(async () => page.close())

    test(`Ava as ${role}`, async () => {
      await openTree(page, BASE, 'ST0001')
      const s = await chartState(page)
      await shot(page, `synth_${role}_ST0001`)
      if (role === 'guest') {
        expect(s.text).not.toContain('Percy')
        expect(s.links).toHaveLength(11)
        expect(s.links.map(l => l.title).join()).not.toContain('Percy')
      } else {
        expect(s.text).toContain('Percy')
        expect(s.links).toHaveLength(12)
      }
      expectNoCardOverlap(s)
    })

    test(`Cara as ${role}`, async () => {
      await openTree(page, BASE, 'ST0003')
      const s = await chartState(page)
      await shot(page, `synth_${role}_ST0003_private_links`)
      if (role === 'guest') {
        for (const name of ['Hal', 'Hana', 'Rex', 'Rita']) {
          expect(s.text).not.toContain(name)
        }
        expect(s.links).toHaveLength(2)
        // private citation hidden: the public note's level is shown
        expect(s.links[0].level).toBe('2')
        expect(s.links[0].title).toContain('confidence note')
      } else {
        expect(s.text).toContain('Hal')
        expect(s.links[0].title).toContain('citation')
      }
    })
  })
}
