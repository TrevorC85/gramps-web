// Collins: the lines of the ancestor tree when each child-parent link is
// drawn on its own (link style by relation and confidence, linkStyle.js).
//
// A child can have up to four parents (two parent families) and a parent can
// be linked to the same child twice (a parent in both families). Each link
// is drawn whole, so its colour and width show along its full length:
//
// - the links of one child leave its card side by side, one `slot` each,
//   in the order of their parents' cards, and the links that end at one
//   parent (a shared parent) arrive side by side, one `targetSlot` each;
// - between the generations each link turns in its own `lane`. Of the links
//   that go up (or left in rows) the one to the nearest parent turns last,
//   and the same for the ones that go down, so no two links of a child cross
//   or run along each other. Links of different children of one generation
//   use the same lanes but different stretches, as the tree layout keeps
//   their parents apart.
import {roundedPath} from './connectors.js'
import {place} from './ChartCanvas.js'

export const slotSpacing = 9
export const laneSpacing = 11

// Returns the coordinates of a point along the generations and across them
// (x, y in columns; y, x in rows). The same swap turns them back.
export const generationAxes = ([x, y], vertical) => (vertical ? [y, x] : [x, y])

const groupBy = (items, key) => {
  const groups = new Map()
  for (const item of items) {
    const k = key(item)
    if (!groups.has(k)) {
      groups.set(k, [])
    }
    groups.get(k).push(item)
  }
  return [...groups.values()]
}

const offsetOf = (index, count) => (index - (count - 1) / 2) * slotSpacing

// Returns the links of a layout, each with the link's `meta` (relation,
// role, family, confidence: from `allParentLinks`), `styled`, `vertical`, the
// `across` offsets of its ends (`sourceOffset`, `targetOffset`) and its
// `lane` and `lanes` count
export function withLanes(links, vertical) {
  const across = node => generationAxes(place(node), vertical)[1]
  const drawn = links.map(link => ({
    ...(link.meta ?? {}),
    ...link,
    styled: true,
    vertical,
    sourceOffset: 0,
    targetOffset: 0,
    lane: 0,
    lanes: 1,
  }))
  // Shared parents: the links to one parent card arrive side by side
  for (const group of groupBy(drawn, link => link.target.key)) {
    group.forEach((link, i) => {
      link.targetOffset = offsetOf(i, group.length)
    })
  }
  for (const group of groupBy(drawn, link => link.source.key)) {
    // Slots in the order of where the links arrive
    group.sort(
      (a, b) =>
        across(a.target) + a.targetOffset - (across(b.target) + b.targetOffset)
    )
    group.forEach((link, i) => {
      link.sourceOffset = offsetOf(i, group.length)
    })
    const start = link => across(link.source) + link.sourceOffset
    const end = link => across(link.target) + link.targetOffset
    // Links going up turn in order from the topmost, links going down from
    // the bottommost: the nearest parent's link turns last
    const up = group.filter(link => end(link) < start(link) - 0.5)
    const down = group.filter(link => end(link) > start(link) + 0.5).reverse()
    const lanes = Math.max(1, up.length, down.length)
    for (const link of group) {
      link.lanes = lanes
    }
    up.forEach((link, i) => {
      link.lane = i
    })
    down.forEach((link, i) => {
      link.lane = i
    })
  }
  return drawn
}

// Returns the corner points of a link from `withLanes`, from the edge of the
// child's card at `source` to the edge of the parent's card at `target`.
// `inset` is how far the line starts inside the cards, which are drawn on
// top.
export function lanePoints(
  [source, target],
  {vertical, sourceOffset, targetOffset, lane, lanes},
  {boxWidth, boxHeight, inset = 10}
) {
  const point = (along, across) => generationAxes([along, across], vertical)
  const [g0, s0] = generationAxes(source, vertical)
  const [g1, s1] = generationAxes(target, vertical)
  const half = (vertical ? boxHeight : boxWidth) / 2 - inset
  const direction = Math.sign(g1 - g0) || 1
  const [a0, a1] = [g0 + direction * half, g1 - direction * half]
  const middle =
    (a0 + a1) / 2 + direction * (lane - (lanes - 1) / 2) * laneSpacing
  return [
    point(a0, s0 + sourceOffset),
    point(middle, s0 + sourceOffset),
    point(middle, s1 + targetOffset),
    point(a1, s1 + targetOffset),
  ]
}

// The SVG path of a link from `withLanes`, with rounded corners
export const lanePath = (ends, link, sizes) =>
  roundedPath(lanePoints(ends, link, sizes))
