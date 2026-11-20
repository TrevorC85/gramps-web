/*
Ancestor places on the map view (Collins family): the event places of the
selected person and their ancestors, from
/api/people/<handle>/ancestor-places, as coloured pins.
*/

import {eventMatches} from './mapFilters.js'

// Generation choices of the picker; 0 means all generations.
export const ANCESTOR_GENERATIONS = [2, 3, 5, 10, 0]
export const ALL_GENERATIONS = 0
// What the server walks at most for "all".
export const MAX_GENERATIONS = 30

// One colour per generation, nearest first; generations past the end share
// the last colour.
export const GENERATION_COLORS = [
  '#d32f2f', // the person
  '#f57c00', // parents
  '#c9a000', // grandparents
  '#388e3c',
  '#00838f',
  '#1976d2',
  '#7b1fa2',
  '#6d4c41',
]

export function generationColor(generation) {
  const i = Math.max(0, Math.min(generation ?? 0, GENERATION_COLORS.length - 1))
  return GENERATION_COLORS[i]
}

// The endpoint for a person and a generation choice (0 = all).
export function ancestorPlacesUrl(handle, generations, lang = 'en') {
  const n = generations > 0 ? generations : MAX_GENERATIONS
  return `/api/people/${handle}/ancestor-places?generations=${n}&locale=${encodeURIComponent(
    lang
  )}`
}

// A label for a generation: translate is the view's `_`.
export function generationLabel(generation, translate) {
  if (generation === 0) return translate('Selected person')
  if (generation === 1) return translate('Parents')
  if (generation === 2) return translate('Grandparents')
  if (generation === 3) return translate('Great-grandparents')
  return translate('Generation %s', generation)
}

function hasCoords(place) {
  const lat = parseFloat(place?.lat)
  const long = parseFloat(place?.long)
  return (
    place?.lat != null &&
    place?.long != null &&
    !Number.isNaN(lat) &&
    !Number.isNaN(long) &&
    !(lat === 0 && long === 0)
  )
}

// Pins for the map: one per place with coordinates that has at least one
// event matching the filters ({years, eventTypes} as in mapFilters.js).
// Each pin is coloured by the nearest generation with a matching event there
// and lists who had which event there, nearest generation and earliest first.
export function ancestorPins(data, {years = null, eventTypes = []} = {}) {
  if (!data?.events) return []
  const types = new Set(eventTypes)
  const people = new Map((data.people ?? []).map(p => [p.handle, p]))
  const places = new Map((data.places ?? []).map(p => [p.handle, p]))
  const byPlace = new Map()
  for (const event of data.events) {
    const place = places.get(event.place)
    if (!place || !hasCoords(place)) continue
    if (!eventMatches(event, {years, eventTypes: types})) continue
    const entries = byPlace.get(place.handle) ?? []
    entries.push({
      names: (event.people ?? []).map(h => people.get(h)?.name).filter(Boolean),
      type: event.type,
      typeLabel: event.type_label || event.type,
      year: event.year ?? null,
      generation: event.generation ?? 0,
    })
    byPlace.set(place.handle, entries)
  }
  const pins = []
  for (const [handle, entries] of byPlace) {
    const place = places.get(handle)
    entries.sort(
      (a, b) =>
        a.generation - b.generation ||
        (a.year ?? Infinity) - (b.year ?? Infinity) ||
        a.typeLabel.localeCompare(b.typeLabel)
    )
    const generation = entries[0].generation
    pins.push({
      handle,
      name: place.title || place.name,
      lat: parseFloat(place.lat),
      long: parseFloat(place.long),
      color: generationColor(generation),
      generation,
      entries,
    })
  }
  return pins
}

// One line of a pin's popup, e.g. "Joy Example, Birth, 1928".
export function pinEntryText(entry) {
  return [entry.names.join(' & '), entry.typeLabel, entry.year]
    .filter(x => x !== null && x !== undefined && x !== '')
    .join(', ')
}

// The generations present in the data, for the legend.
export function generationsPresent(data) {
  const gens = new Set((data?.people ?? []).map(p => p.generation))
  return [...gens].sort((a, b) => a - b)
}

// Bounds [[west, south], [east, north]] of pins, or null without pins.
export function pinBounds(pins) {
  if (!pins?.length) return null
  const lats = pins.map(p => p.lat)
  const lngs = pins.map(p => p.long)
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ]
}

// Counts for the person card.
export function ancestorCounts(data, pins) {
  const s = data?.summary ?? {}
  return {
    ancestors: Math.max(0, (s.people ?? 0) - 1),
    shownPlaces: pins?.length ?? 0,
    placesWithoutCoordinates: s.places_without_coordinates ?? 0,
    eventsWithoutPlace: s.events_without_place ?? 0,
  }
}
