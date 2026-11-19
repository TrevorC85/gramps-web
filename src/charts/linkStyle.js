// Collins: styling of the child-parent links of the ancestor tree by
// relation (colour) and confidence (width). Everything about how such a link
// looks is in this module; the layout of the lines is in linkLanes.js.
//
// Confidence comes from GET /api/childref-confidence/ (Collins fork of
// gramps-web-api): per child reference and parent, the Gramps confidence
// level 0-4 of the child reference's citations, otherwise the level parsed
// from the child reference's "Parent-child link confidence" note, otherwise
// none (a thin dashed line).

// Colours of the relation of a child to a parent. Birth follows the theme
// (dark grey in the light theme); the others are colour-blind safe.
export const relationColors = {
  Birth: null, // palette.linkBirth
  Adopted: '#0072B2', // blue
  Stepchild: '#E69F00', // orange
  Foster: '#009E73', // green
  Sponsored: '#CC79A7', // pink
  Unknown: '#a3a3a3', // light grey
}
export const otherRelationColor = '#D55E00' // red-orange, custom relations
export const birthFallbackColor = '#4d4d4d'

export const relationColor = (relation, palette = {}) => {
  if (relation === 'Birth') {
    return palette.linkBirth ?? birthFallbackColor
  }
  return relationColors[relation] ?? otherRelationColor
}

export const isKnownRelation = relation => relation in relationColors

// Stroke widths for the Gramps confidence levels 0-4, in chart units
export const levelWidths = [1, 2, 3.25, 4.75, 6.5]
export const levelNames = ['Very Low', 'Low', 'Normal', 'High', 'Very High']
export const unknownWidth = 1.25
export const unknownDash = [6, 4]

// Minimum widths and dash lengths on screen, in pixels, so that thin lines
// stay visible and the levels stay apart when zoomed out
export const minScreenWidths = [1, 1.6, 2.3, 3.1, 4]
export const minScreenUnknownWidth = 1
export const minScreenDash = [6, 4]
// Widest a line gets in chart units, so neighbouring lines (linkLanes.js)
// never touch
export const maxWidth = 7

export const hasLevel = link => Number.isInteger(link.level)

const clampLevel = level => Math.max(0, Math.min(4, level))

// The stroke width of a link at zoom level `k` (1 = no zoom)
export function linkWidth(link, k = 1) {
  const [width, minScreen] = hasLevel(link)
    ? [
        levelWidths[clampLevel(link.level)],
        minScreenWidths[clampLevel(link.level)],
      ]
    : [unknownWidth, minScreenUnknownWidth]
  return Math.min(maxWidth, Math.max(width, minScreen / k))
}

// The dash array of a link at zoom level `k`, or null for a solid line
export function linkDash(link, k = 1) {
  if (hasLevel(link)) {
    return null
  }
  return unknownDash
    .map((length, i) => +Math.max(length, minScreenDash[i] / k).toFixed(2))
    .join(' ')
}

// Reduces a free-text confidence label to a short name
export function shortLabel(label, max = 32) {
  if (!label) {
    return ''
  }
  const first = String(label)
    .split(/\s+[—–-]\s+|\n/)[0]
    .trim()
  return first.length > max ? `${first.slice(0, max - 1)}…` : first
}

const ordinal = ['1st', '2nd']

// Hover text of a link: relationship, confidence and its source
export function linkTitle(link, translate = s => s) {
  const _ = translate
  const role = link.role === 'mother' ? _('Mother') : _('Father')
  const family =
    link.nFamilies > 1
      ? ` (${ordinal[link.familyIndex] ?? ''} ${_('parent family')})`
      : ''
  const lines = [`${_(link.relation)} — ${role}${family}`]
  if (hasLevel(link)) {
    const level = clampLevel(link.level)
    lines.push(`${_('Confidence')}: ${_(levelNames[level])} (${level}/4)`)
    const label = shortLabel(link.label)
    if (link.confSource === 'citation') {
      lines.push(
        `${_('Source')}: ${_('citation')}${label ? ` “${label}”` : ''}`
      )
      if (link.disagree) {
        lines.push(_('Citations disagree; the highest confidence is shown'))
      }
    } else {
      lines.push(
        `${_('Source')}: ${_('confidence note')}${label ? ` “${label}”` : ''}`
      )
    }
  } else {
    lines.push(
      `${_('Confidence')}: ${_('none (no citation or confidence note)')}`
    )
  }
  // A parent in both parent families: one line, styled by the link above
  for (const other of link.others ?? []) {
    lines.push(`${_('Also')}: ${otherSummary(other, _)}`)
  }
  return lines.join('\n')
}

// One line about a parent's link in their other parent family, such as
// "Adopted — 2nd parent family, Normal (2/4), confidence note “probable”"
function otherSummary(link, _) {
  const parts = [
    `${_(link.relation)} — ${ordinal[link.familyIndex] ?? ''} ${_(
      'parent family'
    )}`,
  ]
  if (hasLevel(link)) {
    const level = clampLevel(link.level)
    const label = shortLabel(link.label)
    parts.push(`${_(levelNames[level])} (${level}/4)`)
    parts.push(
      `${
        link.confSource === 'citation' ? _('citation') : _('confidence note')
      }${label ? ` “${label}”` : ''}${
        link.disagree ? ` (${_('citations disagree')})` : ''
      }`
    )
  } else {
    parts.push(_('no confidence'))
  }
  return parts.join(', ')
}

// --------------------------------------------------------------- legend

const legendRow = 18
const legendHeader = 20
const legendPad = 10
export const legendWidth = 230
// Gap between the legend and the root person's card, which leaves room for
// the card's menu button
const legendGap = 60

// The entries of the legend: the relations, confidence levels and "no
// confidence" that occur in `links`, or null if there are no links
export function legendEntries(links) {
  if (!links?.length) {
    return null
  }
  // Links of a layout carry their confidence in `meta`
  links = links.map(link => ({...(link.meta ?? {}), relation: link.relation}))
  const order = Object.keys(relationColors)
  const relations = order.filter(r => links.some(link => link.relation === r))
  if (links.some(link => !isKnownRelation(link.relation))) {
    relations.push('Other')
  }
  const levels = [4, 3, 2, 1, 0].filter(level =>
    links.some(link => hasLevel(link) && clampLevel(link.level) === level)
  )
  const none = links.some(link => !hasLevel(link))
  return {relations, levels, none}
}

// Size and place of the legend, beside the root person's card, away from
// the ancestors: left of it in columns, below it in rows
export function legendBox(entries, root, {vertical, boxWidth, boxHeight}) {
  if (!entries || !root) {
    return null
  }
  const rows =
    entries.relations.length + entries.levels.length + (entries.none ? 1 : 0)
  const height = 2 * legendHeader + rows * legendRow + 2 * legendPad
  const [x, y] = vertical
    ? [root.x - legendWidth / 2, root.y + boxHeight / 2 + legendGap]
    : [root.x - boxWidth / 2 - legendGap - legendWidth, root.y - height / 2]
  return {...entries, x, y, width: legendWidth, height}
}

// Draws the legend `box` (from `legendBox`, or null for none) into the
// d3 selection `group`, in chart units, so that it zooms with the chart and
// is part of SVG downloads
export function drawLegend(group, box, palette, translate = s => s) {
  const _ = translate
  group.selectChildren().remove()
  if (!box) {
    group.attr('display', 'none')
    return
  }
  group
    .attr('display', null)
    .attr('transform', `translate(${box.x},${box.y})`)
    .attr('font-size', 12)
  group
    .append('rect')
    .attr('width', box.width)
    .attr('height', box.height)
    .attr('rx', 8)
    .attr('fill', palette.background ?? 'none')
    .attr('stroke', palette.link)
  let y = legendPad
  const header = text => {
    group
      .append('text')
      .attr('x', legendPad)
      .attr('y', y + 13)
      .attr('font-weight', 600)
      .attr('fill', palette.legendText)
      .text(text)
    y += legendHeader
  }
  const row = (text, stroke, width, dash = null) => {
    group
      .append('line')
      .attr('x1', legendPad)
      .attr('x2', legendPad + 40)
      .attr('y1', y + 9)
      .attr('y2', y + 9)
      .attr('stroke', stroke)
      .attr('stroke-width', width)
      .attr('stroke-dasharray', dash)
    group
      .append('text')
      .attr('x', legendPad + 52)
      .attr('y', y + 13)
      .attr('fill', palette.legendText)
      .text(text)
    y += legendRow
  }
  header(_('Relationship (line colour)'))
  for (const relation of box.relations) {
    row(
      relation === 'Other' ? _('Other / custom') : _(relation),
      relation === 'Other'
        ? otherRelationColor
        : relationColor(relation, palette),
      3
    )
  }
  header(_('Confidence (line width)'))
  const grey = relationColor('Birth', palette)
  for (const level of box.levels) {
    row(`${_(levelNames[level])} (${level})`, grey, levelWidths[level])
  }
  if (box.none) {
    row(_('No confidence'), grey, unknownWidth, unknownDash.join(' '))
  }
}

// ---------------------------------------------------------------- data

// Fetches the link confidence of the child references of the families
// followed from the person with `grampsId` over `generations` (root counts as
// one), in one request. Returns a Map of `${family}:${child}` to the API
// entry, or an empty Map if the API does not offer it.
export async function fetchLinkConfidence(appState, grampsId, generations) {
  const result = new Map()
  const response = await appState.apiGet(
    `/api/childref-confidence/?person=${encodeURIComponent(
      grampsId
    )}&generations=${generations}`
  )
  if (!response || !('data' in response) || !Array.isArray(response.data)) {
    return result
  }
  for (const entry of response.data) {
    result.set(`${entry.family}:${entry.child}`, entry)
  }
  return result
}

// Fetches the link confidence of the child references of `familyHandles`
// (for branches beyond the generations of `fetchLinkConfidence`), in chunks
// that keep the URL short, adding them to the Map `result`
export async function fetchFamilyLinkConfidence(
  appState,
  familyHandles,
  result = new Map()
) {
  const handles = [...new Set(familyHandles)].filter(Boolean)
  for (let i = 0; i < handles.length; i += 200) {
    // eslint-disable-next-line no-await-in-loop
    const response = await appState.apiGet(
      `/api/childref-confidence/?families=${handles
        .slice(i, i + 200)
        .join(',')}`
    )
    if (!response || !Array.isArray(response.data)) {
      return result
    }
    for (const entry of response.data) {
      result.set(`${entry.family}:${entry.child}`, entry)
    }
  }
  return result
}
