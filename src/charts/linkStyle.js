// Collins prototype: styling of child-parent links by relation (colour) and
// confidence (thickness).
//
// Confidence comes from GET /api/childref-confidence/ (Collins fork of
// gramps-web-api): per child reference and parent, the Gramps confidence
// level 0-4 of the child reference's citations, otherwise the level parsed
// from the child reference's "Parent-child link confidence" note, otherwise
// none.

// Colours of the relation of a child to a parent (Okabe-Ito, colour-blind
// safe). Birth uses a theme colour so it works in light and dark mode.
export const relationColors = {
  Birth: 'var(--grampsjs-body-font-color-70, #4d4d4d)',
  Adopted: '#0072B2',
  Stepchild: '#E69F00',
  Foster: '#009E73',
  Sponsored: '#CC79A7',
  Unknown: '#8c8c8c',
}
export const otherRelationColor = '#D55E00'

export const relationColor = relation =>
  relationColors[relation] ?? otherRelationColor

// Stroke widths for the Gramps confidence levels
export const levelWidths = [1, 1.75, 2.75, 3.75, 5]
export const levelLabels = ['Very Low', 'Low', 'Normal', 'High', 'Very High']
export const unknownWidth = 1.25
export const unknownDash = '5 4'

export const hasLevel = link => Number.isInteger(link.level)

export const linkWidth = link =>
  hasLevel(link)
    ? levelWidths[Math.max(0, Math.min(4, link.level))]
    : unknownWidth

export const linkDash = link => (hasLevel(link) ? null : unknownDash)

export function linkTitle(link) {
  const role = link.role === 'mother' ? 'mother' : 'father'
  const level = hasLevel(link)
    ? `${levelLabels[link.level]} (${link.level}/4) from ${
        link.source === 'citation' ? 'citation' : 'confidence note'
      }${link.label ? `: ${link.label}` : ''}`
    : 'no citation or confidence note'
  return `${link.relation} — ${role} link; confidence ${level}`
}

// Fetches the link confidence of the child references of `familyHandles`,
// in chunks that keep the URL short. Returns a Map of `${family}:${child}`
// to the API entry, or an empty Map if the API does not offer it.
export async function fetchLinkConfidence(appState, familyHandles) {
  const result = new Map()
  const handles = [...new Set(familyHandles)].filter(Boolean)
  for (let i = 0; i < handles.length; i += 150) {
    const chunk = handles.slice(i, i + 150)
    // eslint-disable-next-line no-await-in-loop
    const response = await appState.apiGet(
      `/api/childref-confidence/?families=${chunk.join(',')}`
    )
    if (!response || !('data' in response)) {
      return result
    }
    for (const entry of response.data) {
      result.set(`${entry.family}:${entry.child}`, entry)
    }
  }
  return result
}
