// Link lines on a COPY of the real local tree (127.0.0.1:5058)
import fs from 'node:fs'
import {test, expect} from '@playwright/test'
import {chartState, expectNoCardOverlap, expectNoLinkOverlap, login, openTree, realUser, shot} from './helpers.mjs'

const BASE = 'http://127.0.0.1:5058'
const PRIVATE = JSON.parse(
  fs.readFileSync('/workspace/gramps-web-proto/realcopy/secrets/private_ids.json', 'utf8')
)
const PRIVATE_NAMES = JSON.parse(
  fs.readFileSync('/workspace/gramps-web-proto/realcopy/secrets/private_names.json', 'utf8')
)

// Records the gramps IDs and timing of the chart's API responses
function recordApi(page) {
  const log = []
  page.on('response', async response => {
    const url = response.url()
    if (url.includes('/api/people/?rules') || url.includes('/api/childref-confidence/')) {
      const timing = response.request().timing()
      let body = ''
      try {
        body = await response.text()
      } catch (e) {
        body = ''
      }
      log.push({
        kind: url.includes('childref') ? 'confidence' : 'people',
        status: response.status(),
        ms: Math.round(timing.responseEnd),
        ids: [...body.matchAll(/"gramps_id":\s*"([^"]+)"/g)].map(m => m[1]),
        bytes: body.length,
      })
    }
  })
  return log
}

test.describe.serial('real tree copy as owner', () => {
  let page
  let api
  test.beforeAll(async ({browser}) => {
    page = await browser.newPage({viewport: {width: 1600, height: 1000}})
    api = recordApi(page)
    await login(page, BASE, realUser('owner'))
  })
  test.afterAll(async () => page.close())

  for (const [orientation, theme] of [
    ['horizontal', 'light'],
    ['vertical', 'dark'],
  ]) {
    test(`I0009: birth and adoptive parents (${orientation}, ${theme})`, async () => {
      api.length = 0
      await openTree(page, BASE, 'I0009', {orientation, theme})
      const s = await chartState(page)
      await shot(page, `real_owner_I0009_${orientation}_${theme}`)
      expect(s.links.some(l => l.relation === 'Adopted')).toBe(true)
      // Mike to Donna (in both parent families): one line, birth family's style
      const both = s.links.filter(l => l.families)
      expect(both).toHaveLength(1)
      expect(both[0].relation).toBe('Birth')
      expect(both[0].level).toBe('4')
      expect(both[0].title).toContain('Birth — Mother (1st parent family)')
      expect(both[0].title).toContain('Also: Birth — 2nd parent family, Very High (4/4), citation')
      expectNoLinkOverlap(s)
      expect(s.links.filter(l => l.relation).length).toBe(s.links.length)
      expect(s.legend).not.toBeNull()
      expectNoCardOverlap(s)
      expect(api.filter(a => a.kind === 'people' && a.bytes > 0)).toHaveLength(1) // aborted requests of the page before have no body
      expect(api.filter(a => a.kind === 'confidence').length).toBeLessThanOrEqual(2)
    })
  }

  test('I0006: deepest public line, 5 generations, request count and time', async () => {
    api.length = 0
    const start = Date.now()
    await openTree(page, BASE, 'I0006', {ancestors: 4})
    const s = await chartState(page)
    await shot(page, 'real_owner_I0006_5_generations')
    expectNoCardOverlap(s)
    const levels = {}
    for (const l of s.links) levels[l.level] = (levels[l.level] ?? 0) + 1
    fs.writeFileSync(
      '/workspace/gramps-web/build/tree-proto/v2/real_owner_I0006_stats.json',
      JSON.stringify(
        {links: s.links.length, levels, cards: s.cards.length, pageMs: Date.now() - start, api: api.map(({ids, ...rest}) => ({...rest, people: ids.length}))},
        null,
        1
      )
    )
    expect(api.filter(a => a.kind === 'people' && a.bytes > 0)).toHaveLength(1) // aborted requests of the page before have no body
  })

  test('I1003 (links without confidence: dashed)', async () => {
    await openTree(page, BASE, 'I1003')
    const s = await chartState(page)
    await shot(page, 'real_owner_I1003')
    expectNoCardOverlap(s)
  })
})

for (const role of ['member', 'guest']) {
  test.describe.serial(`real tree copy as ${role}`, () => {
    let page
    let api
    test.beforeAll(async ({browser}) => {
      page = await browser.newPage({viewport: {width: 1600, height: 1000}})
      api = recordApi(page)
      await login(page, BASE, realUser(role))
    })
    test.afterAll(async () => page.close())

    for (const gid of ['I0835', 'I0006']) {
      test(`${gid} as ${role}`, async () => {
        api.length = 0
        await openTree(page, BASE, gid)
        const s = await chartState(page)
        await shot(page, `real_${role}_${gid}`)
        expectNoCardOverlap(s)
        const ids = api.flatMap(a => a.ids)
        const leaked = ids.filter(id => PRIVATE.people.includes(id) || PRIVATE.families.includes(id))
        if (role === 'guest') {
          expect(leaked).toEqual([])
          for (const name of PRIVATE_NAMES) {
            const [given, ...rest] = name.split(' ')
            const surname = rest.join(' ')
            if (given && surname) {
              // cards show "Surname,Given"
              expect(s.text).not.toContain(`${surname},${given}`)
              expect(s.text).not.toContain(`${surname}, ${given}`)
              expect(s.text).not.toContain(`${given} ${surname}`)
            }
          }
        } else if (gid === 'I0835') {
          expect(leaked.length).toBeGreaterThan(0) // members may view private records
        }
      })
    }
  })
}
