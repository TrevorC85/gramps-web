// Collins prototype: four parents and link styling in the ancestor tree
import {describe, it, expect} from 'vitest'
import {FamilyGraph} from '../../src/charts/model/FamilyGraph.js'
import {layoutAncestors} from '../../src/charts/layout/treeLayout.js'
import {allParentLinks} from '../../src/charts/util.js'
import {TreeChart} from '../../src/charts/TreeChart.js'
import {linkWidth, linkDash} from '../../src/charts/linkStyle.js'

// C is the birth child of BF x BM and the adopted child of AF x BM's sister
// AM, whose family is C's primary parent family.
const fBirth = {
  handle: 'fB',
  father_handle: 'BF',
  mother_handle: 'BM',
  child_ref_list: [{ref: 'C', frel: 'Birth', mrel: 'Birth'}],
}
const fAdopt = {
  handle: 'fA',
  father_handle: 'AF',
  mother_handle: 'AM',
  child_ref_list: [{ref: 'C', frel: 'Adopted', mrel: 'Adopted'}],
}
const person = (handle, extended = {}) => ({
  handle,
  gramps_id: `I_${handle}`,
  profile: {gramps_id: `I_${handle}`, sex: 'U'},
  extended,
})
const graph = new FamilyGraph([
  person('C', {primary_parent_family: fAdopt, parent_families: [fBirth]}),
  person('BF', {families: [fBirth]}),
  person('BM', {families: [fBirth]}),
  person('AF', {families: [fAdopt]}),
  person('AM', {families: [fAdopt]}),
])
const info = new Map([
  [
    'fB:C',
    {
      father: {level: 4, source: 'citation'},
      mother: {level: 2, source: 'note', label: 'probable'},
    },
  ],
])

describe('allParentLinks', () => {
  it('lists birth parents first, then adoptive parents, with confidence', () => {
    const links = allParentLinks(graph, 'C', info)
    expect(links.map(l => [l.handle, l.relation, l.level])).toEqual([
      ['BF', 'Birth', 4],
      ['BM', 'Birth', 2],
      ['AF', 'Adopted', null],
      ['AM', 'Adopted', null],
    ])
    expect(links.map(l => l.familyIndex)).toEqual([0, 0, 1, 1])
  })

  it('shows a parent who is in both families once', () => {
    const g = new FamilyGraph([
      person('C', {
        primary_parent_family: fBirth,
        parent_families: [{...fAdopt, mother_handle: 'BM'}],
      }),
    ])
    expect(allParentLinks(g, 'C', null).map(l => l.handle)).toEqual([
      'BF',
      'BM',
      'AF',
    ])
  })
})

describe('styled ancestor layout', () => {
  it('lays out four parents without overlapping cards', () => {
    const layout = layoutAncestors(graph, 'C', {
      depth: 2,
      allParents: true,
      linkInfo: info,
    })
    expect(layout.styledLinks).toBe(true)
    const parents = layout.nodes.filter(n => n.generation === 1)
    expect(parents).toHaveLength(4)
    const ys = parents.map(n => n.y).sort((a, b) => a - b)
    for (let i = 1; i < ys.length; i += 1) {
      expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(90)
    }
    const chart = new TreeChart()
    const drawn = chart.drawnLinks(layout)
    expect(drawn.map(l => l.slot)).toEqual([0, 1, 2, 3])
    // Each link is drawn whole
    for (const link of drawn) {
      expect(
        chart.linkPath(
          [
            [0, 0],
            [260, link.target.y],
          ],
          link
        )
      ).toMatch(/^M/)
    }
  })

  it('maps confidence to width and missing confidence to a dashed line', () => {
    expect(linkWidth({level: 4})).toBeGreaterThan(linkWidth({level: 2}))
    expect(linkWidth({level: 2})).toBeGreaterThan(linkWidth({level: 0}))
    expect(linkDash({level: null})).toBeTruthy()
    expect(linkDash({level: 3})).toBeNull()
  })

  it('keeps the standard tree unchanged when off', () => {
    const layout = layoutAncestors(graph, 'C', {depth: 2})
    expect(layout.styledLinks).toBeUndefined()
    expect(layout.nodes.filter(n => n.generation === 1)).toHaveLength(2)
  })
})
