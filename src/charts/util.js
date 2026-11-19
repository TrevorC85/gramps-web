// Utility functions for d3.js charts.

import {range} from 'd3-array'
import {select} from 'd3-selection'
import {scaleSequential} from 'd3-scale'
import {interpolateWarm} from 'd3-scale-chromatic'
import {getThumbnailUrl, getThumbnailUrlCropped} from '../api.js'
import {chartNameDisplayFormat, normalizeRect} from '../util.js'

// Returns the name of a person profile in a chart name display format
export function formatChartName(profile, nameDisplayFormat) {
  const given = profile?.name_given || '…'
  const surname = profile?.name_surname || '…'
  return nameDisplayFormat === chartNameDisplayFormat.givenThenSurname
    ? `${given} ${surname}`
    : `${surname}, ${given}`
}
export const getImageUrl = (person, size, square = true) => {
  if (!person.media_list || person.media_list.length === 0) {
    return ''
  }
  const [mediaRef] = person.media_list
  const rect = normalizeRect(mediaRef.rect)
  if (!rect) {
    return getThumbnailUrl(mediaRef.ref, size, square)
  }
  return getThumbnailUrlCropped(mediaRef.ref, rect, size, square)
}

// Returns whether the pointer can hover, so hover previews are shown
export function isHoverDevice() {
  return !window.matchMedia('(hover: none)').matches
}

// Returns the duration of a chart animation in milliseconds, which is 0 when
// the user prefers reduced motion
export function chartTransitionDuration(duration = 400) {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ? 0
    : duration
}

// Returns the node of the tree builders for the person with `handle`, who
// may not have been fetched, with the path `id` and the generation `depth`
const treeNode = (graph, handle, id, depth) => {
  const person = graph.person(handle) ?? {}
  return {
    name_given: person?.profile ? person?.profile?.name_given : null,
    name_surname: person?.profile ? person?.profile?.name_surname : null,
    id,
    depth,
    person,
  }
}

// Returns the generations to build from a node of the person with `handle`
// at the last generation of `depth`, one more for a person in `expanded`, and
// the expanded people on the path to the node's relatives. A person is
// expanded once on a path, which ends a loop of people who are their own
// ancestors. Otherwise the node gets `expandable` when it has relatives who
// are not shown.
const branchDepth = (tree, handle, depth, hasRelatives, expanded, onPath) => {
  if (depth !== 1 || !hasRelatives) {
    return [depth, onPath]
  }
  if (expanded.has(handle) && !onPath.has(handle)) {
    return [2, new Set([...onPath, handle])]
  }
  tree.expandable = true
  return [depth, onPath]
}

// Returns the ancestors of the person with `handle` as a tree of `depth`
// generations, with the father and the mother as the children of each node.
// A node's `id` is its path from the root, such as `pfm` for the father's
// mother. Without `includeEmpty`, unknown parents are left out. The people
// with a handle in `expanded` get one more generation of ancestors.
export const getTree = (
  graph,
  handle,
  depth,
  includeEmpty = true,
  {expanded = new Set(), allParents = false, linkInfo = null} = {}
) => {
  const build = (personHandle, generations, i, label, onPath) => {
    if (generations === 0) {
      return {}
    }
    const tree = treeNode(graph, personHandle, label, i)
    const parentLinks = allParents
      ? allParentLinks(graph, personHandle, linkInfo)
      : null
    const {father, mother} = graph.parents(personHandle)
    const hasParents = parentLinks
      ? parentLinks.links.length > 0
      : Boolean(father || mother)
    const [depthHere, path] = branchDepth(
      tree,
      personHandle,
      generations,
      Boolean(personHandle && hasParents),
      expanded,
      onPath
    )
    if (parentLinks?.more.length) {
      tree.moreFamilies = parentLinks.more
    }
    if (depthHere === 1) {
      return tree
    }
    if (parentLinks) {
      tree.children = parentLinks.links.map(link => ({
        ...build(link.handle, depthHere - 1, i + 1, `${label}${link.id}`, path),
        relation: link.relation,
        link,
      }))
      return tree
    }
    const relations = graph.parentRelations(personHandle)
    tree.children = []
    if (father || includeEmpty) {
      tree.children.push({
        ...build(father, depthHere - 1, i + 1, `${label}f`, path),
        relation: relations.father,
      })
    }
    if (mother || includeEmpty) {
      tree.children.push({
        ...build(mother, depthHere - 1, i + 1, `${label}m`, path),
        relation: relations.mother,
      })
    }
    return tree
  }
  return build(handle, depth, 0, 'p', new Set())
}

// Collins: the parent links of a person for the relation/confidence link
// style. Returns `{links, more}`:
//
// - `links`: the father and mother of up to two parent families (such as
//   birth and adoptive parents), the family whose links are all Birth first,
//   one link per parent. A parent in both families gets one link, styled by
//   their Birth link if they have one (else by the first family's), with the
//   other family's relationship and confidence in `others`;
// - `more`: the parent families beyond the second, which are not shown, each
//   with its `family` handle, `grampsId`, `frel` and `mrel`.
//
// Each link has the parent's `handle`, an `id` for the tree path, the
// `relation` (frel/mrel) of the child to the parent, the `role`, the
// `family` handle, the family's index and count, and the confidence `level`
// (0-4 or null), its source (`confSource`, as links have a `source` node),
// `label` and `disagree` from `linkInfo`.
export function allParentLinks(graph, personHandle, linkInfo) {
  const none = {links: [], more: []}
  if (!personHandle) {
    return none
  }
  const childRefOf = family =>
    family.child_ref_list?.find(({ref}) => ref === personHandle) ?? {}
  const isBirthFamily = family => {
    const ref = childRefOf(family)
    return (
      (ref.frel || 'Birth') === 'Birth' && (ref.mrel || 'Birth') === 'Birth'
    )
  }
  const sorted = graph
    .parentFamilies(personHandle)
    .map((family, index) => ({family, index}))
    .sort(
      (a, b) =>
        Number(isBirthFamily(b.family)) - Number(isBirthFamily(a.family)) ||
        a.index - b.index
    )
    .map(({family}) => family)
  const families = sorted.slice(0, 2)
  const more = sorted.slice(2).map(family => ({
    family: family.handle,
    grampsId: family.gramps_id ?? '',
    frel: childRefOf(family).frel || 'Birth',
    mrel: childRefOf(family).mrel || 'Birth',
  }))
  // The links of each parent, in the order the parents first appear
  const byParent = new Map()
  families.forEach((family, familyIndex) => {
    const ref = childRefOf(family)
    const info = linkInfo?.get(`${family.handle}:${personHandle}`)
    for (const role of ['father', 'mother']) {
      const parent = family[`${role}_handle`]
      if (!parent) {
        continue
      }
      const conf = info?.[role] ?? {}
      const link = {
        handle: parent,
        id: `${role[0]}${familyIndex || ''}`,
        relation:
          (role === 'father' ? ref.frel : ref.mrel) ||
          (role === 'father' ? info?.frel : info?.mrel) ||
          'Birth',
        role,
        family: family.handle,
        familyIndex,
        nFamilies: families.length,
        level: Number.isInteger(conf.level) ? conf.level : null,
        confSource: conf.source ?? null,
        label: conf.label ?? '',
        disagree: Boolean(conf.disagree),
        known: Boolean(info),
      }
      if (!byParent.has(parent)) {
        byParent.set(parent, [])
      }
      byParent.get(parent).push(link)
    }
  })
  const links = [...byParent.values()].map(all => {
    if (all.length === 1) {
      return all[0]
    }
    const main = all.find(link => link.relation === 'Birth') ?? all[0]
    return {
      ...main,
      // The card keeps the place of the parent's first appearance
      id: all[0].id,
      others: all.filter(link => link !== main),
    }
  })
  return {links, more}
}

// Returns the descendants of the person with `handle` as a tree of `depth`
// generations. A node's `id` is its path from the root, such as `pc0c2` for
// the third child of the first child. The people with a handle in `expanded`
// get one more generation of descendants.
export const getDescendantTree = (
  graph,
  handle,
  depth,
  {expanded = new Set()} = {}
) => {
  const build = (personHandle, generations, i, label, onPath) => {
    if (generations === 0) {
      return {}
    }
    const tree = treeNode(graph, personHandle, label, i)
    const children = graph.childRelations(personHandle)
    const [depthHere, path] = branchDepth(
      tree,
      personHandle,
      generations,
      children.length > 0,
      expanded,
      onPath
    )
    if (depthHere === 1) {
      return tree
    }
    tree.children = children.map(
      ({handle: childHandle, relation}, childInd) => ({
        ...build(
          childHandle,
          depthHere - 1,
          i + 1,
          `${label}c${childInd}`,
          path
        ),
        relation,
      })
    )
    return tree
  }
  return build(handle, depth, 0, 'p', new Set())
}

export const LegendCategorical = (
  legend,
  legendData,
  {
    legendItemHeight = 15,
    legendItemWidth = 15,
    legendItemMargin = 5,
    opacity = 1,
    textColor = 'var(--grampsjs-body-font-color)',
  } = {}
) => {
  legend
    .selectAll('rect')
    .data(legendData)
    .enter()
    .append('rect')
    .attr('x', 0)
    .attr('y', (d, i) => i * (legendItemHeight + legendItemMargin))
    .attr('width', legendItemWidth)
    .attr('height', legendItemHeight)
    .attr('fill', d => d.color)
    .attr('fill-opacity', opacity)

  legend
    .selectAll('text')
    .data(legendData)
    .enter()
    .append('text')
    .attr('x', legendItemWidth + 8)
    .attr('fill', textColor)
    .attr('text-anchor', 'start')
    .attr('font-family', 'Inter var')
    .attr('font-weight', 350)
    .attr('font-size', 13)
    .attr(
      'y',
      (d, i) => i * (legendItemHeight + legendItemMargin) + legendItemHeight / 2
    )
    .attr('dy', '0.35em')
    .text(d => d.label)
}

export const LegendColorBar = (
  legend,
  {
    opacity = 1,
    minColorValue = 0,
    maxColorValue = 100,
    colorBarWidth = 20,
    colorBarHeight = 200,
    textColor = 'var(--grampsjs-body-font-color)',
  } = {}
) => {
  const numColorTicks = 5 // Number of legend ticks

  if (
    minColorValue === Infinity ||
    maxColorValue === -Infinity ||
    minColorValue === maxColorValue
  ) {
    return
  }

  // Create a color scale
  const colorScale = scaleSequential(interpolateWarm).domain([
    maxColorValue,
    minColorValue,
  ])

  // Create legend gradient
  legend
    .append('linearGradient')
    .attr('id', 'color-gradient')
    .attr('gradientUnits', 'userSpaceOnUse')
    .attr('x1', 0)
    .attr('y1', 0)
    .attr('x2', 0)
    .attr('y2', 200)
    .selectAll('stop')
    .data(range(0, 1.1, 0.1))
    .enter()
    .append('stop')
    .attr('offset', d => `${d * 100}%`)
    .attr('stop-color', d =>
      colorScale(d * (maxColorValue - minColorValue) + minColorValue)
    )

  // Create legend rectangle
  legend
    .append('rect')
    .attr('width', colorBarWidth) // Adjust the width as needed
    .attr('height', colorBarHeight) // Adjust the height as needed
    .style('fill', 'url(#color-gradient)')
    .style('fill-opacity', opacity)

  const colorbarTicks = colorScale.ticks(numColorTicks)

  legend
    .selectAll('.colorbar-tick')
    .data(colorbarTicks)
    .enter()
    .append('g')
    .attr('class', 'colorbar-tick')
    .attr(
      'transform',
      d =>
        `translate(30, ${
          (1 - (d - minColorValue) / (maxColorValue - minColorValue)) *
          colorBarHeight
        })`
    )
    .each(function () {
      const tickGroup = select(this)
      tickGroup
        .append('line')
        .attr('x1', -4)
        .attr('x2', -10) // Adjust the length of the tick mark
        .attr('stroke', textColor)
    })
    .append('text')
    .attr('class', 'colorbar-tick')
    .attr('fill', textColor)
    .attr('x', 4)
    .attr('text-anchor', 'start')
    .attr('dy', '0.4em')
    .text(d => `${d}`)
}
