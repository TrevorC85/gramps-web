import {describe, it, expect, vi, beforeEach} from 'vitest'

import {
  ANCESTOR_GENERATIONS,
  GENERATION_COLORS,
  ancestorCounts,
  ancestorPins,
  ancestorPlacesUrl,
  generationColor,
  generationLabel,
  pinBounds,
  pinEntryText,
  pinLegend,
} from '../../src/mapAncestors.js'
import {GrampsjsViewMap} from '../../src/views/GrampsjsViewMap.js'
import '../../src/components/GrampsjsPersonBox.js'

const date = year => ({
  _class: 'Date',
  calendar: 0,
  modifier: 0,
  quality: 0,
  dateval: [0, 0, year, false],
  sortval: 1,
})

// A fictional response of /api/people/<handle>/ancestor-places
const DATA = {
  handle: 'I1',
  gramps_id: 'I0001',
  generations: 30,
  max_generation: 2,
  people: [
    {handle: 'I1', gramps_id: 'I0001', name: 'Anna Muster', generation: 0},
    {handle: 'I2', gramps_id: 'I0002', name: 'Otto Muster', generation: 1},
    {handle: 'I3', gramps_id: 'I0003', name: 'Olga Muster', generation: 1},
    {handle: 'I4', gramps_id: 'I0004', name: 'Gus Muster', generation: 2},
    {handle: 'I5', gramps_id: 'I0005', name: 'Mia', generation: 2},
  ],
  events: [
    {
      handle: 'E1',
      type: 'Birth',
      type_label: 'Birth',
      date: date(1950),
      year: 1950,
      place: 'P1',
      people: ['I1'],
      generation: 0,
    },
    {
      handle: 'E2',
      type: 'Marriage',
      type_label: 'Marriage',
      date: date(1945),
      year: 1945,
      place: 'P1',
      people: ['I2', 'I3'],
      generation: 1,
    },
    {
      handle: 'E3',
      type: 'Death',
      type_label: 'Death',
      date: date(1990),
      year: 1990,
      place: 'P3',
      people: ['I2'],
      generation: 1,
    },
    {
      handle: 'E4',
      type: 'Birth',
      type_label: 'Birth',
      date: date(1890),
      year: 1890,
      place: 'P2',
      people: ['I4'],
      generation: 2,
    },
    {
      handle: 'E5',
      type: 'Baptism',
      type_label: 'Baptism',
      date: date(1920),
      year: 1920,
      place: null,
      people: ['I3'],
      generation: 1,
    },
  ],
  places: [
    {
      handle: 'P1',
      name: 'Alpha',
      title: 'Alpha, Region',
      lat: 48.1,
      long: 11.5,
    },
    {handle: 'P2', name: 'Beta', title: 'Beta, Region', lat: -33.9, long: 18.4},
    {
      handle: 'P3',
      name: 'Delta',
      title: 'Delta, Region',
      lat: null,
      long: null,
    },
  ],
  summary: {
    people: 5,
    events: 5,
    events_without_place: 1,
    events_without_coordinates: 1,
    places: 3,
    places_with_coordinates: 2,
    places_without_coordinates: 1,
  },
}

const t = (s, ...args) => args.reduce((acc, a) => acc.replace('%s', a), s)

describe('mapAncestors helpers', () => {
  it('offers 2, 3, 5, 10 and all generations', () => {
    expect(ANCESTOR_GENERATIONS).to.deep.equal([2, 3, 5, 10, 0])
  })

  it('builds the endpoint, all generations as the server maximum', () => {
    expect(ancestorPlacesUrl('I1', 3, 'de')).to.equal(
      '/api/people/I1/ancestor-places?generations=3&locale=de'
    )
    expect(ancestorPlacesUrl('I1', 0)).to.equal(
      '/api/people/I1/ancestor-places?generations=30&locale=en'
    )
  })

  it('colours generations, the last colour for distant ones', () => {
    expect(generationColor(0)).to.equal(GENERATION_COLORS[0])
    expect(generationColor(1)).to.not.equal(generationColor(0))
    expect(generationColor(25)).to.equal(GENERATION_COLORS.at(-1))
    expect(new Set(GENERATION_COLORS).size).to.equal(GENERATION_COLORS.length)
  })

  it('labels generations', () => {
    expect(generationLabel(0, t)).to.equal('Selected person')
    expect(generationLabel(1, t)).to.equal('Parents')
    expect(generationLabel(2, t)).to.equal('Grandparents')
    expect(generationLabel(3, t)).to.equal('Great-grandparents')
    expect(generationLabel(6, t)).to.equal('Generation 6')
    expect(generationLabel(7, t)).to.equal('Generation 7 and beyond')
    expect(generationLabel(12, t)).to.equal('Generation 7 and beyond')
  })

  it('makes one pin per place with coordinates', () => {
    const pins = ancestorPins(DATA)
    expect(pins.map(p => p.handle)).to.have.members(['P1', 'P2'])
    const alpha = pins.find(p => p.handle === 'P1')
    expect(alpha.name).to.equal('Alpha, Region')
    expect(alpha.lat).to.equal(48.1)
    // coloured by the nearest generation there
    expect(alpha.generation).to.equal(0)
    expect(alpha.color).to.equal(generationColor(0))
    expect(alpha.entries.map(pinEntryText)).to.deep.equal([
      'Anna Muster · Birth · 1950',
      'Otto Muster & Olga Muster · Marriage · 1945',
    ])
    const beta = pins.find(p => p.handle === 'P2')
    expect(beta.color).to.equal(generationColor(2))
  })

  it('applies the event type filter', () => {
    const pins = ancestorPins(DATA, {eventTypes: ['Marriage']})
    expect(pins.map(p => p.handle)).to.deep.equal(['P1'])
    expect(pins[0].entries).to.have.length(1)
    // the pin takes the colour of the matching events
    expect(pins[0].color).to.equal(generationColor(1))
  })

  it('applies the time filter', () => {
    const pins = ancestorPins(DATA, {years: {min: 1880, max: 1900}})
    expect(pins.map(p => p.handle)).to.deep.equal(['P2'])
  })

  it('skips places at 0, 0 and handles empty data', () => {
    const data = {
      ...DATA,
      places: [{handle: 'P1', name: 'Null Island', lat: 0, long: 0}],
    }
    expect(ancestorPins(data)).to.deep.equal([])
    expect(ancestorPins(null)).to.deep.equal([])
  })

  it('writes popup lines without missing parts', () => {
    expect(
      pinEntryText({names: ['Mia'], typeLabel: 'Birth', year: null})
    ).to.equal('Mia · Birth')
  })

  it('computes bounds of the pins', () => {
    expect(pinBounds(ancestorPins(DATA))).to.deep.equal([
      [11.5, -33.9],
      [18.4, 48.1],
    ])
    expect(pinBounds([])).to.equal(null)
  })

  it('makes one legend entry per colour shown', () => {
    const legend = pinLegend([
      {generation: 9},
      {generation: 0},
      {generation: 7},
      {generation: 2},
    ])
    expect(legend.map(l => l.generation)).to.deep.equal([0, 2, 7])
    expect(legend[2].color).to.equal(GENERATION_COLORS.at(-1))
  })

  it('counts ancestors, places shown and places left off', () => {
    const pins = ancestorPins(DATA)
    expect(ancestorCounts(DATA, pins)).to.deep.equal({
      ancestors: 4,
      shownPlaces: 2,
      placesWithoutCoordinates: 1,
      eventsWithoutPlace: 1,
    })
  })
})

// ---------------------------------------------------------------- the view

const PLACES = [
  {handle: 'P1', profile: {name: 'Alpha', lat: 48.1, long: 11.5}},
  {handle: 'P9', profile: {name: 'Other', lat: 50, long: 10}},
]
const PERSON = {
  handle: 'I1',
  profile: {name_given: 'Anna', name_surname: 'Muster'},
}
const PERSON_DATA = {handle: 'I1', extended: {events: [{place: 'P1'}]}}

const flushPromises = () => new Promise(resolve => setTimeout(resolve, 0))

function makeView() {
  const view = new GrampsjsViewMap()
  const map = {
    flyTo: vi.fn(),
    fitBounds: vi.fn(),
    jumpTo: vi.fn(),
    _map: {resize: vi.fn()},
  }
  const searchbox = {showDetails: vi.fn(), focus: vi.fn(), clear: vi.fn()}
  Object.defineProperty(view, '_mapEl', {value: map})
  Object.defineProperty(view, '_searchbox', {value: searchbox})
  view.appState = {
    i18n: {lang: 'en', strings: {}},
    apiGet: vi.fn(async url =>
      url.includes('/ancestor-places') ? {data: DATA} : {data: PERSON_DATA}
    ),
    dbInfo: {},
  }
  view._dataPlaces = PLACES
  view._filteredPlaces = PLACES
  return {view, map}
}

async function selectPerson(view) {
  view._handlePersonSelected(PERSON)
  await flushPromises()
  await flushPromises()
}

beforeEach(() => {
  localStorage.removeItem('grampsjs_map_viewport')
  localStorage.removeItem('grampsjs_map_layers')
})

describe('map view: show ancestors', () => {
  it('pads the fit so the search panel does not cover pins', () => {
    const {view} = makeView()
    view._searchbox.getBoundingClientRect = () => ({
      left: 16,
      right: 400,
      top: 70,
      bottom: 500,
      width: 384,
    })
    Object.defineProperty(view, 'renderRoot', {
      value: {
        querySelector: () => ({
          getBoundingClientRect: () => ({
            left: 0,
            top: 0,
            width: 1200,
            height: 800,
          }),
        }),
      },
    })
    expect(view._panelPadding()).to.deep.equal({
      top: 40,
      bottom: 40,
      left: 440,
      right: 40,
    })
    // a phone: the panel spans the width, pad below it
    view._searchbox.getBoundingClientRect = () => ({
      left: 8,
      right: 404,
      top: 60,
      bottom: 400,
      width: 396,
    })
    view.renderRoot.querySelector = () => ({
      getBoundingClientRect: () => ({left: 0, top: 0, width: 412, height: 800}),
    })
    expect(view._panelPadding()).to.deep.equal({
      top: 150,
      bottom: 40,
      left: 40,
      right: 40,
      narrow: true,
    })
    // fitting folds the card away and passes the padding to the map
    view._searchbox.collapse = vi.fn()
    view._ancestorsOn = true
    view._selection = {type: 'person', person: PERSON, placeHandles: []}
    view._ancestorData = DATA
    view._fitAncestorPins()
    expect(view._searchbox.collapse).not.toHaveBeenCalled()
    view._fitAncestorPins({collapse: true})
    expect(view._searchbox.collapse).toHaveBeenCalled()
    expect(view._mapEl.fitBounds.mock.lastCall[1]).to.deep.equal({
      padding: {top: 150, bottom: 40, left: 40, right: 40},
    })
  })

  it("is off by default: only the person's own places", async () => {
    const {view} = makeView()
    await selectPerson(view)
    expect(view._placesForMap.map(p => p.handle)).to.deep.equal(['P1'])
    expect(view._ancestorBoxState.on).to.equal(false)
    expect(
      view.appState.apiGet.mock.calls.some(([u]) => u.includes('ancestor'))
    ).to.equal(false)
  })

  it('switched on: loads all generations, shows coloured pins and fits them', async () => {
    const {view, map} = makeView()
    await selectPerson(view)
    view._handleAncestorsChange({detail: {on: true}})
    await flushPromises()
    expect(view.appState.apiGet).toHaveBeenCalledWith(
      '/api/people/I1/ancestor-places?generations=30&locale=en'
    )
    const places = view._placesForMap
    expect(places.map(p => p.handle)).to.have.members(['P1', 'P2'])
    const alpha = places.find(p => p.handle === 'P1')
    expect(alpha.color).to.equal(generationColor(0))
    expect(alpha.groups.flatMap(g => g.lines)).to.include(
      'Otto Muster & Olga Muster · Marriage · 1945'
    )
    expect(alpha.count).to.equal(
      alpha.groups.reduce((n, g) => n + g.lines.length, 0)
    )
    // no panel size known here: no padding of its own
    expect(map.fitBounds.mock.lastCall[1]).to.deep.equal({})
    expect(map.fitBounds.mock.lastCall[0]).to.deep.equal([
      [11.5, -33.9],
      [18.4, 48.1],
    ])
    const box = view._ancestorBoxState
    expect(box.counts).to.deep.equal({
      ancestors: 4,
      shownPlaces: 2,
      placesWithoutCoordinates: 1,
      eventsWithoutPlace: 1,
    })
    expect(box.legend.map(l => l.generation)).to.deep.equal([0, 2])
  })

  it('the filters apply to the ancestor pins, and are not suspended', async () => {
    const {view} = makeView()
    await selectPerson(view)
    view._handleAncestorsChange({detail: {on: true}})
    await flushPromises()
    view._handleFilterChange({detail: {eventTypes: ['Birth']}})
    expect(view._placesForMap.map(p => p.handle)).to.have.members(['P1', 'P2'])
    view._handleFilterChange({detail: {eventTypes: ['Marriage']}})
    expect(view._placesForMap.map(p => p.handle)).to.deep.equal(['P1'])
    view._handleFilterChange({
      detail: {eventTypes: [], timeFilter: true, yearSpan: 10},
    })
    view._year = 1890
    expect(view._timeFilterActive).to.equal(true)
    expect(view._placesForMap.map(p => p.handle)).to.deep.equal(['P2'])
  })

  it('folds the card (phones) when switched on, not for a generations chip', async () => {
    const {view} = makeView()
    const fit = vi.spyOn(view, '_fitAncestorPins')
    await selectPerson(view)
    view._handleAncestorsChange({detail: {on: true}})
    await flushPromises()
    expect(fit).toHaveBeenLastCalledWith({collapse: true})
    view._handleAncestorsChange({detail: {generations: 3}})
    await flushPromises()
    expect(fit).toHaveBeenLastCalledWith({collapse: false})
  })

  it('a generations choice reloads with that limit', async () => {
    const {view} = makeView()
    await selectPerson(view)
    view._handleAncestorsChange({detail: {on: true}})
    await flushPromises()
    view._handleAncestorsChange({detail: {generations: 2}})
    await flushPromises()
    expect(view.appState.apiGet).toHaveBeenLastCalledWith(
      '/api/people/I1/ancestor-places?generations=2&locale=en'
    )
    expect(view._ancestorBoxState.generations).to.equal(2)
  })

  it("switched off: back to the person's own places", async () => {
    const {view} = makeView()
    await selectPerson(view)
    view._handleAncestorsChange({detail: {on: true}})
    await flushPromises()
    view._handleAncestorsChange({detail: {on: false}})
    expect(view._ancestorData).to.equal(null)
    expect(view._placesForMap.map(p => p.handle)).to.deep.equal(['P1'])
  })

  it('stays on for the next person and reloads for them', async () => {
    const {view} = makeView()
    await selectPerson(view)
    view._handleAncestorsChange({detail: {on: true}})
    await flushPromises()
    const other = {handle: 'I7', profile: {name_given: 'Ben'}}
    view.appState.apiGet.mockImplementation(async url =>
      url.includes('/ancestor-places')
        ? {data: {...DATA, handle: 'I7'}}
        : {data: {handle: 'I7', extended: {events: []}}}
    )
    view._handlePersonSelected(other)
    // the previous person's ancestors are not shown for the new one
    expect(view._ancestorData).to.equal(null)
    await flushPromises()
    await flushPromises()
    expect(view.appState.apiGet).toHaveBeenLastCalledWith(
      '/api/people/I7/ancestor-places?generations=30&locale=en'
    )
    expect(view._ancestorData.handle).to.equal('I7')
  })

  it('ignores a response for a person no longer selected', async () => {
    const {view} = makeView()
    await selectPerson(view)
    let resolveLate
    view.appState.apiGet.mockImplementation(
      () => new Promise(resolve => (resolveLate = resolve))
    )
    view._handleAncestorsChange({detail: {on: true}})
    view._select(null)
    resolveLate({data: DATA})
    await flushPromises()
    expect(view._ancestorData).to.equal(null)
  })

  it('shows an error from the server', async () => {
    const {view} = makeView()
    await selectPerson(view)
    view.appState.apiGet.mockResolvedValue({error: 'Not found'})
    view._handleAncestorsChange({detail: {on: true}})
    await flushPromises()
    expect(view._ancestorBoxState.error).to.equal('Not found')
    expect(view._placesForMap.map(p => p.handle)).to.deep.equal(['P1'])
  })

  it('clearing the selection drops the ancestor places', async () => {
    const {view} = makeView()
    await selectPerson(view)
    view._handleAncestorsChange({detail: {on: true}})
    await flushPromises()
    view._handleSearchClear()
    expect(view._ancestorData).to.equal(null)
    expect(view._ancestorMode).to.equal(false)
  })
})

describe('person card: ancestors section', () => {
  async function renderBox(ancestors) {
    const box = document.createElement('grampsjs-person-box')
    box.appState = {
      i18n: {lang: 'en', strings: {}},
      settings: {},
      apiGet: vi.fn(),
    }
    box.personData = {handle: 'I1', gramps_id: 'I0001', profile: {}}
    box.ancestors = ancestors
    document.body.appendChild(box)
    await box.updateComplete
    return box
  }

  it('has no switch without ancestor state', async () => {
    const box = await renderBox(null)
    expect(box.shadowRoot.querySelector('md-switch')).to.equal(null)
    box.remove()
  })

  it('shows the switch, generations, counts and legend', async () => {
    const box = await renderBox({
      on: true,
      generations: 0,
      loading: false,
      error: '',
      counts: {
        ancestors: 4,
        shownPlaces: 2,
        placesWithoutCoordinates: 1,
        eventsWithoutPlace: 0,
      },
      legend: [
        {generation: 0, color: generationColor(0)},
        {generation: 2, color: generationColor(2)},
      ],
    })
    const text = box.shadowRoot.textContent.replace(/\s+/g, ' ')
    expect(box.shadowRoot.querySelector('md-switch').selected).to.equal(true)
    expect(text).to.contain('Show ancestors')
    expect(text).to.contain('4 ancestors')
    expect(text).to.contain('2 places on the map')
    expect(text).to.contain('1 places left off the map: no coordinates yet')
    expect(text).to.not.contain('events without a place')
    expect(text).to.contain('Grandparents')
    const chips = box.shadowRoot.querySelector('grampsjs-chip-choice')
    expect(chips.options.map(o => o.label)).to.deep.equal([
      '2',
      '3',
      '5',
      '10',
      'All',
    ])
    expect(chips.selected).to.equal(0)
    box.remove()
  })

  it('fires changes for the switch and the generations', async () => {
    const box = await renderBox({on: true, generations: 0, legend: []})
    const events = []
    box.addEventListener('map:ancestors-change', e => events.push(e.detail))
    const sw = box.shadowRoot.querySelector('md-switch')
    sw.selected = false
    sw.dispatchEvent(new Event('change'))
    const chips = box.shadowRoot.querySelector('grampsjs-chip-choice')
    chips.dispatchEvent(
      new CustomEvent('chip-choice:change', {detail: {value: 5}})
    )
    expect(events).to.deep.equal([{on: false}, {generations: 5}])
    box.remove()
  })
})

describe('places layer: coloured pins with details', () => {
  it('passes the pin colour to the map and falls back to the marker colour', async () => {
    await import('../../src/components/GrampsjsMapPlacesLayer.js')
    const layer = document.createElement('grampsjs-map-places-layer')
    layer.places = [
      {handle: 'P1', name: 'Alpha', lat: 1, long: 2, color: '#123456'},
      {handle: 'P2', name: 'Beta', lat: 3, long: 4},
    ]
    const geo = layer._buildGeoJSON()
    expect(geo.features.map(f => f.properties.color)).to.deep.equal([
      '#123456',
      null,
    ])
    expect(layer._paint()['circle-color'][0]).to.equal('coalesce')
  })

  it('lists the details in the popup as text, not HTML', async () => {
    await import('../../src/components/GrampsjsMapPlacesLayer.js')
    const layer = document.createElement('grampsjs-map-places-layer')
    const el = layer._popupContent({
      name: 'Alpha',
      groups: [{lines: ['<b>Anna</b>, Birth, 1950', 'Otto, Death']}],
    })
    expect(el.querySelector('strong').textContent).to.equal('Alpha')
    expect(el.querySelectorAll('div.line')).to.have.length(2)
    expect(el.querySelector('b')).to.equal(null)
    expect(el.textContent).to.contain('<b>Anna</b>, Birth, 1950')
  })
})
