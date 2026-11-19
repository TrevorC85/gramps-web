// Collins: tree lines by relation (colour) and confidence (width)
import {describe, it, expect} from 'vitest'
import {FamilyGraph} from '../../src/charts/model/FamilyGraph.js'
import {
  layoutAncestors,
  treeLayoutDefaults,
} from '../../src/charts/layout/treeLayout.js'
import {allParentLinks} from '../../src/charts/util.js'
import {TreeChart} from '../../src/charts/TreeChart.js'
import {chartSvgDocument} from '../../src/charts/svgExport.js'
import {chartPalette, exportPalette} from '../../src/charts/palette.js'
import {
  legendBox,
  legendEntries,
  levelWidths,
  linkDash,
  linkTitle,
  linkWidth,
  maxWidth,
  minScreenWidths,
  otherRelationColor,
  relationColor,
  shortLabel,
} from '../../src/charts/linkStyle.js'
import {lanePoints, withLanes} from '../../src/charts/linkLanes.js'

const {boxWidth, boxHeight} = treeLayoutDefaults

// ------------------------------------------------------------- fixtures

const fam = (handle, father, mother, child, frel, mrel, gid = handle) => ({
  handle,
  gramps_id: gid,
  father_handle: father,
  mother_handle: mother,
  child_ref_list: [{ref: child, frel, mrel}],
})
const person = (handle, parentFamilies = [], families = []) => ({
  handle,
  gramps_id: `I_${handle}`,
  profile: {
    gramps_id: `I_${handle}`,
    name_given: handle,
    name_surname: 'Synthtest',
    sex: 'U',
  },
  extended: {
    primary_parent_family: parentFamilies[0] ?? {},
    parent_families: parentFamilies.slice(1),
    families,
  },
})

// C: adoptive family first in Gramps' list (primary), birth family second,
// a third (foster) family. BF has a step family too (second family shares
// the father BFF). AF's parents have a custom and an unknown relation.
const fA = fam('fA', 'AF', 'AM', 'C', 'Adopted', 'Stepchild', 'F0002')
const fB = fam('fB', 'BF', 'BM', 'C', 'Birth', 'Birth', 'F0001')
const fX = fam('fX', 'XF', 'XM', 'C', 'Foster', 'Foster', 'F0003')
const fBF1 = fam('fBF1', 'BFF', 'BFM', 'BF', 'Birth', 'Birth')
const fBF2 = fam('fBF2', 'BFF', 'BFS', 'BF', 'Birth', 'Stepchild')
const fAF = fam('fAF', 'AFF', 'AFM', 'AF', 'Guardianship', 'Unknown')
const fBM = fam('fBM', 'BMF', 'BMM', 'BM', 'Sponsored', 'Birth')
const graph = new FamilyGraph([
  person('C', [fA, fB, fX]),
  person('BF', [fBF1, fBF2], [fB]),
  person('BM', [fBM], [fB]),
  person('AF', [fAF], [fA]),
  person('AM', [], [fA]),
  person('XF', [], [fX]),
  person('XM', [], [fX]),
  person('BFF', [], [fBF1, fBF2]),
  person('BFM', [], [fBF1]),
  person('BFS', [], [fBF2]),
  person('AFF', [], [fAF]),
  person('AFM', [], [fAF]),
  person('BMF', [], [fBM]),
  person('BMM', [], [fBM]),
])
const conf = (level, source = 'citation', label = '') => ({
  level,
  source,
  label,
})
const info = new Map([
  ['fB:C', {father: conf(4), mother: conf(4)}],
  [
    'fA:C',
    {father: conf(2, 'note', 'probable'), mother: conf(1, 'note', 'possible')},
  ],
  ['fBF1:BF', {father: conf(0), mother: conf(0)}],
  ['fBF2:BF', {father: conf(3), mother: conf(3)}],
  ['fBM:BM', {father: conf(2), mother: conf(2)}],
  ['fAF:AF', {father: {level: null}, mother: {level: null}}],
])

const layoutOf = (vertical = false) =>
  layoutAncestors(graph, 'C', {
    depth: 3,
    allParents: true,
    linkInfo: info,
    vertical,
    gapX: 70,
  })

// ---------------------------------------------------------------- styles

describe('link style', () => {
  it('colours every relation as specified', () => {
    expect(relationColor('Birth', exportPalette)).toBe('#4d4d4d')
    expect(relationColor('Birth', chartPalette)).toBe(chartPalette.linkBirth)
    expect(relationColor('Adopted')).toBe('#0072B2')
    expect(relationColor('Stepchild')).toBe('#E69F00')
    expect(relationColor('Foster')).toBe('#009E73')
    expect(relationColor('Sponsored')).toBe('#CC79A7')
    expect(relationColor('Unknown')).toBe('#a3a3a3')
    expect(relationColor('Guardianship')).toBe(otherRelationColor)
    expect(otherRelationColor).toBe('#D55E00')
  })

  it('gets wider with every confidence level', () => {
    const widths = [0, 1, 2, 3, 4].map(level => linkWidth({level}))
    expect(widths).toEqual(levelWidths)
    for (let i = 1; i < 5; i += 1) {
      expect(widths[i]).toBeGreaterThan(widths[i - 1])
    }
    for (const level of [0, 1, 2, 3, 4]) {
      expect(linkDash({level})).toBeNull()
    }
  })

  it('draws no confidence as a thin dashed line', () => {
    expect(linkWidth({level: null})).toBeLessThan(levelWidths[1])
    expect(linkDash({level: null})).toBe('6 4')
  })

  it('keeps a minimum width and readable dashes when zoomed out', () => {
    const k = 0.25
    for (const level of [0, 1, 2, 3, 4]) {
      const onScreen = linkWidth({level}, k) * k
      expect(onScreen).toBeGreaterThanOrEqual(
        Math.min(minScreenWidths[level], maxWidth * k) - 1e-9
      )
      expect(linkWidth({level}, k)).toBeLessThanOrEqual(maxWidth)
    }
    const screen = [0, 1, 2, 3, 4].map(level => linkWidth({level}, 0.5) * 0.5)
    for (let i = 1; i < 5; i += 1) {
      expect(screen[i]).toBeGreaterThan(screen[i - 1])
    }
    const [dash, gap] = linkDash({level: null}, k).split(' ').map(Number)
    expect(dash * k).toBeGreaterThanOrEqual(6)
    expect(gap * k).toBeGreaterThanOrEqual(4)
    expect(linkWidth({level: 4}, 2)).toBe(levelWidths[4])
  })

  it('shortens long confidence labels', () => {
    expect(shortLabel('probable (strong) — v63 chart, page 4')).toBe(
      'probable (strong)'
    )
    expect(shortLabel('x'.repeat(50)).length).toBe(32)
    expect(shortLabel(null)).toBe('')
  })

  it('has hover text with relationship, confidence and source', () => {
    expect(
      linkTitle({
        relation: 'Adopted',
        role: 'father',
        familyIndex: 1,
        nFamilies: 2,
        level: 2,
        confSource: 'note',
        label: 'probable',
      })
    ).toBe(
      'Adopted — Father (2nd parent family)\nConfidence: Normal (2/4)\nSource: confidence note “probable”'
    )
    expect(
      linkTitle({
        relation: 'Birth',
        role: 'mother',
        nFamilies: 1,
        level: 3,
        confSource: 'citation',
        label: 'Parish register',
        disagree: true,
      })
    ).toContain('Citations disagree')
    expect(
      linkTitle({relation: 'Foster', role: 'mother', level: null})
    ).toContain('none (no citation or confidence note)')
  })
})

// ------------------------------------------------------------- parents

describe('allParentLinks', () => {
  it('puts the birth family first, shows four parents and counts a third family', () => {
    const {links, shared, more} = allParentLinks(graph, 'C', info)
    expect(links.map(l => [l.handle, l.relation, l.level])).toEqual([
      ['BF', 'Birth', 4],
      ['BM', 'Birth', 4],
      ['AF', 'Adopted', 2],
      ['AM', 'Stepchild', 1],
    ])
    expect(links.map(l => l.familyIndex)).toEqual([0, 0, 1, 1])
    expect(shared).toEqual([])
    expect(more).toEqual([
      {family: 'fX', grampsId: 'F0003', frel: 'Foster', mrel: 'Foster'},
    ])
  })

  it('keeps both relationships of a parent in both families', () => {
    const {links, shared} = allParentLinks(graph, 'BF', info)
    expect(links.map(l => l.handle)).toEqual(['BFF', 'BFM', 'BFS'])
    expect(
      shared.map(l => [l.handle, l.relation, l.level, l.familyIndex])
    ).toEqual([['BFF', 'Birth', 3, 1]])
  })
})

// --------------------------------------------------------------- layout

const segments = points => points.slice(1).map((p, i) => [points[i], p])

// Whether two axis-parallel segments touch
function touch([[ax1, ay1], [ax2, ay2]], [[bx1, by1], [bx2, by2]]) {
  const lo = (a, b) => Math.min(a, b)
  const hi = (a, b) => Math.max(a, b)
  return (
    lo(ax1, ax2) <= hi(bx1, bx2) + 0.5 &&
    lo(bx1, bx2) <= hi(ax1, ax2) + 0.5 &&
    lo(ay1, ay2) <= hi(by1, by2) + 0.5 &&
    lo(by1, by2) <= hi(ay1, ay2) + 0.5
  )
}

function linkPoints(layout) {
  const drawn = withLanes(layout.links, Boolean(layout.vertical))
  return drawn.map(link => ({
    link,
    points: lanePoints(
      [
        [link.source.x, link.source.y],
        [link.target.x, link.target.y],
      ],
      link,
      {boxWidth, boxHeight}
    ),
  }))
}

describe.each([false, true])(
  'styled ancestor layout (vertical: %s)',
  vertical => {
    const layout = layoutOf(vertical)

    it('has the links of four parents, the shared parent and the badge', () => {
      expect(layout.styledLinks).toBe(true)
      const fromC = layout.links.filter(l => l.source.handle === 'C')
      expect(fromC.map(l => l.target.handle)).toEqual(['BF', 'BM', 'AF', 'AM'])
      const toBFF = layout.links.filter(l => l.target.handle === 'BFF')
      expect(toBFF.map(l => l.meta.relation)).toEqual(['Birth', 'Birth'])
      expect(toBFF.map(l => l.meta.level)).toEqual([0, 3])
      expect(layout.nodes.find(n => n.key === 'p').moreFamilies).toHaveLength(1)
    })

    it('places no card on another', () => {
      const {nodes} = layout
      for (const [i, a] of nodes.entries()) {
        for (const b of nodes.slice(i + 1)) {
          const apart =
            Math.abs(a.x - b.x) >= boxWidth || Math.abs(a.y - b.y) >= boxHeight
          expect(apart).toBe(true)
        }
      }
    })

    it('draws no link across or along another', () => {
      const all = linkPoints(layout)
      for (const [i, a] of all.entries()) {
        for (const b of all.slice(i + 1)) {
          for (const sa of segments(a.points)) {
            for (const sb of segments(b.points)) {
              expect(
                touch(sa, sb),
                `${a.link.source.handle}->${a.link.target.handle} / ${b.link.source.handle}->${b.link.target.handle}`
              ).toBe(false)
            }
          }
        }
      }
    })

    it('keeps lines apart by more than the widest line', () => {
      const all = linkPoints(layout)
      for (const [i, a] of all.entries()) {
        for (const b of all.slice(i + 1)) {
          for (const sa of segments(a.points)) {
            for (const sb of segments(b.points)) {
              const parallelH = sa[0][1] === sa[1][1] && sb[0][1] === sb[1][1]
              const parallelV = sa[0][0] === sa[1][0] && sb[0][0] === sb[1][0]
              if (
                parallelH &&
                touch(
                  [
                    [sa[0][0], 0],
                    [sa[1][0], 0],
                  ],
                  [
                    [sb[0][0], 0],
                    [sb[1][0], 0],
                  ]
                )
              ) {
                expect(Math.abs(sa[0][1] - sb[0][1])).toBeGreaterThan(maxWidth)
              }
              if (
                parallelV &&
                touch(
                  [
                    [0, sa[0][1]],
                    [0, sa[1][1]],
                  ],
                  [
                    [0, sb[0][1]],
                    [0, sb[1][1]],
                  ]
                )
              ) {
                expect(Math.abs(sa[0][0] - sb[0][0])).toBeGreaterThan(maxWidth)
              }
            }
          }
        }
      }
    })

    it('has a legend of the styles in use, beside the chart and inside the bounds', () => {
      const {legend, bounds, nodes} = layout
      expect(legend.relations).toEqual([
        'Birth',
        'Adopted',
        'Stepchild',
        'Sponsored',
        'Unknown',
        'Other',
      ])
      expect(legend.levels).toEqual([4, 3, 2, 1, 0])
      expect(legend.none).toBe(true)
      expect(bounds.xMin).toBeLessThanOrEqual(legend.x)
      expect(bounds.yMax).toBeGreaterThanOrEqual(legend.y + legend.height)
      for (const node of nodes) {
        const apart =
          node.x + boxWidth / 2 < legend.x ||
          node.x - boxWidth / 2 > legend.x + legend.width ||
          node.y + boxHeight / 2 < legend.y ||
          node.y - boxHeight / 2 > legend.y + legend.height
        expect(apart).toBe(true)
      }
    })
  }
)

describe('legend', () => {
  it('is hidden when there are no links', () => {
    expect(legendEntries([])).toBeNull()
    expect(legendBox(null, {x: 0, y: 0}, {boxWidth, boxHeight})).toBeNull()
    const alone = new FamilyGraph([person('Z')])
    const layout = layoutAncestors(alone, 'Z', {depth: 3, allParents: true})
    expect(layout.legend).toBeNull()
  })

  it('is not used without the link style', () => {
    const layout = layoutAncestors(graph, 'C', {depth: 3})
    expect(layout.styledLinks).toBeUndefined()
    expect(layout.legend).toBeUndefined()
    expect(layout.links.map(l => l.target.handle)).toEqual(
      ['AF', 'AM'].concat(layout.links.slice(2).map(l => l.target.handle))
    )
  })
})

// ------------------------------------------------------------- drawing

describe('TreeChart with styled links', () => {
  const chart = new TreeChart()
  chart.update(layoutOf(), {bboxWidth: 800, bboxHeight: 600})
  const svg = chart.node
  const paths = [...svg.querySelectorAll('path.link')]

  it('draws every link with its colour, width and hover text', () => {
    expect(paths).toHaveLength(12)
    const adopted = paths.find(
      p => p.getAttribute('data-relation') === 'Adopted'
    )
    expect(adopted.getAttribute('stroke')).toBe('#0072B2')
    expect(Number(adopted.getAttribute('stroke-width'))).toBe(levelWidths[2])
    expect(adopted.querySelector('title').textContent).toContain('Normal (2/4)')
    const none = paths.filter(p => p.getAttribute('data-level') === 'none')
    expect(none).toHaveLength(2)
    expect(none[0].getAttribute('stroke-dasharray')).toBe('6 4')
    expect(paths.filter(p => p.getAttribute('data-shared'))).toHaveLength(1)
  })

  it('draws the legend and the more-families badge', () => {
    const legend = svg.querySelector('.link-legend')
    expect(legend.getAttribute('display')).toBeNull()
    expect(legend.textContent).toContain('Relationship (line colour)')
    expect(legend.textContent).toContain('Very High (4)')
    expect(legend.textContent).toContain('No confidence')
    const badge = svg.querySelector('.more-families')
    expect(badge.textContent).toContain('+1 family')
    expect(badge.querySelector('title').textContent).toContain(
      'F0003: father Foster, mother Foster'
    )
  })

  it('hides the legend for a standard tree', () => {
    chart.update(layoutAncestors(graph, 'C', {depth: 3}), {
      bboxWidth: 800,
      bboxHeight: 600,
    })
    expect(svg.querySelector('.link-legend').getAttribute('display')).toBe(
      'none'
    )
    expect(svg.querySelectorAll('.more-families')).toHaveLength(0)
    const link = svg.querySelector('path.link')
    expect(link.querySelector('title')).toBeNull()
  })

  it('includes the legend in SVG downloads, with opaque colours', async () => {
    const content = await chartSvgDocument(TreeChart, layoutOf(), {})
    expect(content).toContain('link-legend')
    expect(content).toContain('Confidence (line width)')
    expect(content).toContain('stroke="#4d4d4d"')
    expect(content).not.toContain('display="none"')
    const layout = layoutOf()
    const viewBox = content
      .match(/viewBox="([^"]+)"/)[1]
      .split(' ')
      .map(Number)
    expect(viewBox[0]).toBeLessThanOrEqual(layout.legend.x)
  })
})

describe('ancestor chart request', async () => {
  const {chartDefinitions} = await import(
    '../../src/views/treeChartDefinitions.js'
  )
  const {request, settings} = chartDefinitions.ancestor

  it('follows all parent families with the link style, by default', () => {
    expect(settings.find(s => s.name === 'linkStyle').default).toBe('on')
    const on = request('I1', {ancestors: 3, linkStyle: 'on'}, [
      {grampsId: 'I2', direction: 'ancestors'},
    ])
    expect(on.rules.rules.map(r => r.name)).toEqual([
      'IsLessThanNthGenerationAncestorOfAllFamilies',
      'IsLessThanNthGenerationDescendantOf',
      'IsLessThanNthGenerationAncestorOfAllFamilies',
    ])
    expect(on.extend).toContain('parent_family_list')
  })

  it('is the standard request with the setting off', () => {
    const off = request('I1', {ancestors: 3, linkStyle: 'off'}, [])
    expect(off.rules.rules[0].name).toBe('IsLessThanNthGenerationAncestorOf')
    expect(off.extend).not.toContain('parent_family_list')
  })
})
