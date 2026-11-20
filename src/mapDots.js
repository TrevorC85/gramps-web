/*
Place dots on the map view (Collins family): one dot per place, sized by
the number of events there that match the active filters, with the count
drawn on dots of two or more events.
*/

import {eventMatches, eventTypeKey} from './mapFilters.js'
import {getGregorianYears} from './util.js'

// Radius in px of a dot with one event (or none), and the largest radius.
export const BASE_RADIUS = 9
export const MAX_RADIUS = 26
// A dot reaches MAX_RADIUS at this many events and stays there.
export const MAX_RADIUS_COUNT = 100
// How much larger a highlighted (selected or hovered) dot is drawn.
export const HIGHLIGHT_EXTRA = 5
// Events per request when loading the people of a dot's events.
export const DETAILS_CHUNK = 80

// Radius for a number of events: grows with the square root of the count,
// so the area grows about linearly, from BASE_RADIUS at one event to
// MAX_RADIUS at MAX_RADIUS_COUNT events.
export function dotRadius(count) {
  const n = Number(count) || 0
  if (n <= 1) return BASE_RADIUS
  const k = (MAX_RADIUS - BASE_RADIUS) / (Math.sqrt(MAX_RADIUS_COUNT) - 1)
  const r = BASE_RADIUS + k * (Math.sqrt(n) - 1)
  return Math.min(MAX_RADIUS, Math.round(r * 10) / 10)
}

// The text drawn on a dot: its count from two events on, else nothing.
export function dotLabel(count) {
  return count >= 2 ? String(count) : ''
}

// The events per place handle that match the filters ({years, eventTypes}
// as in mapFilters.js).
export function eventsByPlaceMatching(
  eventsByPlace,
  {years = null, eventTypes = []} = {}
) {
  const types = new Set(eventTypes)
  const result = new Map()
  for (const [handle, events] of eventsByPlace ?? new Map()) {
    const matching = (events ?? []).filter(event =>
      eventMatches(event, {years, eventTypes: types})
    )
    if (matching.length) result.set(handle, matching)
  }
  return result
}

// Order for drawing: larger dots first, so they lie under smaller ones and
// the smaller ones stay clickable; highlighted dots last (on top). Stable for
// equal sizes. Items have `count` and `highlighted`.
export function sortForDrawing(items) {
  return (items ?? [])
    .map((item, i) => ({item, i}))
    .sort(
      (a, b) =>
        Number(Boolean(a.item.highlighted)) -
          Number(Boolean(b.item.highlighted)) ||
        (b.item.count ?? 0) - (a.item.count ?? 0) ||
        a.i - b.i
    )
    .map(({item}) => item)
}

// The font for the counts: one the style uses for its own labels (the
// glyphs of the style's font server only cover its fonts), bold if there is
// one. Null if the style has no glyphs, then no counts are drawn.
export function pickTextFont(style) {
  if (!style?.glyphs) return null
  const fonts = []
  for (const layer of style.layers ?? []) {
    const font = layer?.layout?.['text-font']
    if (
      layer.type === 'symbol' &&
      Array.isArray(font) &&
      font.length > 0 &&
      font.every(f => typeof f === 'string')
    ) {
      fonts.push(font)
    }
  }
  if (!fonts.length) return null
  return fonts.find(f => f.some(name => /bold/i.test(name))) ?? fonts[0]
}

export function eventYear(date) {
  return getGregorianYears(date)?.[0] ?? null
}

// The names of the people an event is about, from an event profile with
// participants: the primary people, else the couple of a family event, else
// the names in the summary ("Birth - Name").
export function participantNames(profile) {
  const people = profile?.participants?.people ?? []
  const primary = people
    .filter(p => !p.role || p.role === 'Primary' || p.role === 'Family')
    .map(p => p.person?.name_display)
    .filter(Boolean)
  if (primary.length) return primary
  const couples = []
  for (const f of profile?.participants?.families ?? []) {
    const fam = f.family ?? f
    for (const parent of [fam.father, fam.mother]) {
      if (parent?.name_display) couples.push(parent.name_display)
    }
  }
  if (couples.length) return couples
  const summary = profile?.summary ?? ''
  const i = summary.indexOf(' - ')
  return i >= 0 ? [summary.slice(i + 3)] : []
}

// Popup lines for the events of a regular dot. events are the place's
// matching events (with date, handle, gramps_id, type), profiles the event
// profiles by handle. Earliest first; events without a year last.
export function regularEntries(events, profilesByHandle, typeLabel = t => t) {
  return (events ?? [])
    .map(event => {
      const profile = profilesByHandle?.get(event.handle)
      return {
        names: participantNames(profile),
        type: eventTypeKey(event.type),
        typeLabel: profile?.type || typeLabel(eventTypeKey(event.type)),
        year: eventYear(event.date),
      }
    })
    .sort(
      (a, b) =>
        (a.year ?? Infinity) - (b.year ?? Infinity) ||
        a.typeLabel.localeCompare(b.typeLabel) ||
        (a.names[0] ?? '').localeCompare(b.names[0] ?? '')
    )
}

// URLs that load the profiles (with participants) of events by Gramps ID,
// in chunks so the URLs stay short.
export function eventProfileUrls(events, lang = 'en') {
  const ids = [...new Set((events ?? []).map(e => e.gramps_id).filter(Boolean))]
  const urls = []
  for (let i = 0; i < ids.length; i += DETAILS_CHUNK) {
    const rules = {
      function: 'or',
      rules: ids
        .slice(i, i + DETAILS_CHUNK)
        .map(id => ({name: 'HasIdOf', values: [id]})),
    }
    urls.push(
      `/api/events/?keys=handle,profile&profile=participants&locale=${encodeURIComponent(
        lang
      )}&rules=${encodeURIComponent(JSON.stringify(rules))}`
    )
  }
  return urls
}

// Groups for an ancestor pin's popup: one per generation, nearest first,
// each with its label, colour and lines. labelFor(generation) and
// colorFor(generation) come from mapAncestors.js; lineFor formats an entry.
// Generations from maxGeneration on share one group (and colour).
export function groupByGeneration(
  entries,
  {labelFor, colorFor, lineFor, maxGeneration = Infinity}
) {
  const groups = new Map()
  for (const entry of entries ?? []) {
    const g = Math.min(entry.generation ?? 0, maxGeneration)
    if (!groups.has(g)) {
      groups.set(g, {
        generation: g,
        label: labelFor(g),
        color: colorFor(g),
        lines: [],
      })
    }
    groups.get(g).lines.push(lineFor(entry))
  }
  return [...groups.values()].sort((a, b) => a.generation - b.generation)
}
