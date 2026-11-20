import {describe, it, expect, vi, beforeEach} from 'vitest'

import {
  BASE_RADIUS,
  MAX_RADIUS,
  HIGHLIGHT_EXTRA,
  DETAILS_CHUNK,
  dotRadius,
  dotLabel,
  eventsByPlaceMatching,
  sortForDrawing,
  pickTextFont,
  participantNames,
  regularEntries,
  eventProfileUrls,
  groupByGeneration,
} from '../../src/mapDots.js'
import {GrampsjsViewMap} from '../../src/views/GrampsjsViewMap.js'
import '../../src/components/GrampsjsMapPlacesLayer.js'

const date = year => ({
  _class: 'Date',
  calendar: 0,
  modifier: 0,
  quality: 0,
  dateval: [0, 0, year, false],
  sortval: 1,
})

const flushPromises = () => new Promise(resolve => setTimeout(resolve, 0))

describe('dot size and label', () => {
  it('is the base size for 0 or 1 event and grows with sqrt(count)', () => {
    expect(dotRadius(0)).to.equal(BASE_RADIUS)
    expect(dotRadius(1)).to.equal(BASE_RADIUS)
    expect(dotRadius(undefined)).to.equal(BASE_RADIUS)
    const r = [2, 4, 9, 15, 50].map(dotRadius)
    for (let i = 1; i < r.length; i += 1) expect(r[i]).to.be.above(r[i - 1])
    expect(dotRadius(2)).to.be.above(BASE_RADIUS)
    // area about linear: 4x the events ~ 2x the radius above the base
    expect(dotRadius(4) - BASE_RADIUS).to.be.closeTo(
      (dotRadius(16) - BASE_RADIUS) / 3,
      0.2
    )
  })

  it('is capped so places with 100+ events do not swamp the map', () => {
    expect(dotRadius(100)).to.equal(MAX_RADIUS)
    expect(dotRadius(500)).to.equal(MAX_RADIUS)
    expect(dotRadius(99)).to.be.below(MAX_RADIUS)
  })

  it('labels dots from two events on', () => {
    expect(dotLabel(0)).to.equal('')
    expect(dotLabel(1)).to.equal('')
    expect(dotLabel(2)).to.equal('2')
    expect(dotLabel(128)).to.equal('128')
  })
})

describe('counting events per place with the filters', () => {
  const byPlace = new Map([
    [
      'P1',
      [
        {handle: 'E1', type: 'Birth', date: date(1850)},
        {handle: 'E2', type: 'Death', date: date(1900)},
        {handle: 'E3', type: 'Birth', date: date(1950)},
      ],
    ],
    ['P2', [{handle: 'E4', type: 'Marriage', date: date(1880)}]],
    ['P3', []],
  ])

  it('counts all events without filters, leaves out places without', () => {
    const m = eventsByPlaceMatching(byPlace)
    expect(m.get('P1')).to.have.length(3)
    expect(m.get('P2')).to.have.length(1)
    expect(m.has('P3')).to.equal(false)
  })

  it('applies the event type and year filters', () => {
    const births = eventsByPlaceMatching(byPlace, {eventTypes: ['Birth']})
    expect(births.get('P1').map(e => e.handle)).to.deep.equal(['E1', 'E3'])
    expect(births.has('P2')).to.equal(false)
    const years = eventsByPlaceMatching(byPlace, {
      years: {min: 1870, max: 1910},
    })
    expect(years.get('P1').map(e => e.handle)).to.deep.equal(['E2'])
    expect(years.get('P2').map(e => e.handle)).to.deep.equal(['E4'])
  })
})

describe('drawing order', () => {
  it('draws larger dots first (under smaller ones), highlighted last', () => {
    const items = [
      {h: 'a', count: 1},
      {h: 'b', count: 30},
      {h: 'c', count: 5, highlighted: true},
      {h: 'd', count: 5},
      {h: 'e', count: 0},
      {h: 'f', count: 5},
    ]
    expect(sortForDrawing(items).map(i => i.h)).to.deep.equal([
      'b',
      'd',
      'f',
      'a',
      'e',
      'c',
    ])
    expect(items[0].h).to.equal('a') // input untouched
  })
})

describe('font for the counts', () => {
  const style = (glyphs, fonts) => ({
    glyphs,
    layers: fonts.map((f, i) => ({
      id: `l${i}`,
      type: 'symbol',
      layout: {'text-font': f},
    })),
  })

  it('uses a bold font of the style if there is one', () => {
    expect(
      pickTextFont(
        style('https://g/{fontstack}/{range}.pbf', [
          ['Noto Sans Regular'],
          ['Noto Sans Bold'],
        ])
      )
    ).to.deep.equal(['Noto Sans Bold'])
    // OpenHistoricalMap
    expect(
      pickTextFont(
        style('https://o/{fontstack}/{range}.pbf', [
          ['OpenHistorical'],
          ['OpenHistorical Bold'],
        ])
      )
    ).to.deep.equal(['OpenHistorical Bold'])
  })

  it('else the first literal font, skipping expressions', () => {
    expect(
      pickTextFont(
        style('g', [
          ['step', ['zoom'], ['literal', ['A']]],
          ['Noto Sans Regular'],
        ])
      )
    ).to.deep.equal(['Noto Sans Regular'])
  })

  it('is null without glyphs or fonts: no counts drawn', () => {
    expect(pickTextFont(style(undefined, [['Noto Sans Bold']]))).to.equal(null)
    expect(pickTextFont(style('g', []))).to.equal(null)
    expect(pickTextFont(null)).to.equal(null)
  })
})

describe('popup lines of a regular dot', () => {
  it('names the primary people, else the couple, else the summary', () => {
    expect(
      participantNames({
        participants: {
          people: [
            {role: 'Primary', person: {name_display: 'Muster, Anna'}},
            {role: 'Witness', person: {name_display: 'Witness, Will'}},
          ],
        },
      })
    ).to.deep.equal(['Muster, Anna'])
    expect(
      participantNames({
        participants: {
          people: [],
          families: [
            {
              family: {
                father: {name_display: 'Muster, Otto'},
                mother: {name_display: 'Muster, Olga'},
              },
            },
          ],
        },
      })
    ).to.deep.equal(['Muster, Otto', 'Muster, Olga'])
    expect(participantNames({summary: 'Birth - Mia'})).to.deep.equal(['Mia'])
    expect(participantNames(undefined)).to.deep.equal([])
  })

  it('lists every matching event, earliest first, with type and year', () => {
    const events = [
      {handle: 'E2', type: 'Death', date: date(1900)},
      {handle: 'E1', type: 'Birth', date: date(1850)},
      {handle: 'E3', type: 'Birth', date: {dateval: [0, 0, 0, false]}},
    ]
    const profiles = new Map([
      ['E1', {type: 'Birth', summary: 'Birth - Anna'}],
      ['E2', {type: 'Death', summary: 'Death - Anna'}],
    ])
    const entries = regularEntries(events, profiles)
    expect(entries.map(e => [e.names, e.typeLabel, e.year])).to.deep.equal([
      [['Anna'], 'Birth', 1850],
      [['Anna'], 'Death', 1900],
      [[], 'Birth', null],
    ])
  })

  it('loads the event profiles by Gramps ID in chunks', () => {
    const events = Array.from({length: DETAILS_CHUNK + 3}, (_, i) => ({
      gramps_id: `E${i}`,
    }))
    const urls = eventProfileUrls(events, 'de')
    expect(urls).to.have.length(2)
    expect(urls[0]).to.contain('profile=participants')
    expect(urls[0]).to.contain('locale=de')
    const rules = JSON.parse(decodeURIComponent(urls[1].split('rules=')[1]))
    expect(rules.function).to.equal('or')
    expect(rules.rules.map(r => r.values[0])).to.deep.equal([
      `E${DETAILS_CHUNK}`,
      `E${DETAILS_CHUNK + 1}`,
      `E${DETAILS_CHUNK + 2}`,
    ])
  })
})

describe('popup line text', () => {
  it('drops the comma of a missing surname or given name', async () => {
    const {pinEntryText, cleanName} = await import('../../src/mapAncestors.js')
    expect(cleanName(', Elizabeth')).to.equal('Elizabeth')
    expect(cleanName('Muster, ')).to.equal('Muster')
    expect(cleanName('Muster, Anna')).to.equal('Muster, Anna')
    expect(
      pinEntryText({names: [', Marie', ''], typeLabel: 'Birth', year: null})
    ).to.equal('Marie · Birth')
  })
})

describe('ancestor popup groups', () => {
  it('groups lines by generation, nearest first, far ones together', () => {
    const groups = groupByGeneration(
      [
        {generation: 2, t: 'c'},
        {generation: 0, t: 'a'},
        {generation: 9, t: 'x'},
        {generation: 2, t: 'd'},
        {generation: 8, t: 'y'},
      ],
      {
        labelFor: g => `G${g}`,
        colorFor: g => `#${g}`,
        lineFor: e => e.t,
        maxGeneration: 7,
      }
    )
    expect(groups.map(g => [g.label, g.color, g.lines])).to.deep.equal([
      ['G0', '#0', ['a']],
      ['G2', '#2', ['c', 'd']],
      ['G7', '#7', ['x', 'y']],
    ])
  })
})

describe('places layer: sized dots with counts', () => {
  it('sizes and labels features and sorts them for drawing', () => {
    const layer = document.createElement('grampsjs-map-places-layer')
    layer.places = [
      {handle: 'A', name: 'Ort', lat: 1, long: 2, count: 1},
      {handle: 'G', name: 'Germany', lat: 51, long: 9, count: 15},
      {handle: 'E', name: 'Empty', lat: 3, long: 4},
    ]
    layer.highlightedHandles = ['A']
    const f = layer._buildGeoJSON().features
    expect(f.map(x => x.properties.handle)).to.deep.equal(['G', 'E', 'A'])
    const g = f[0].properties
    expect(g.count).to.equal(15)
    expect(g.label).to.equal('15')
    expect(g.radius).to.equal(dotRadius(15))
    expect(f[1].properties).to.include({
      count: 0,
      label: '',
      radius: BASE_RADIUS,
    })
    expect(f[2].properties.highlighted).to.equal(true)
  })

  it('draws highlighted dots larger and outlined', () => {
    const layer = document.createElement('grampsjs-map-places-layer')
    const paint = layer._paint()
    expect(JSON.stringify(paint['circle-radius'])).to.contain(
      String(HIGHLIGHT_EXTRA)
    )
    expect(paint['circle-stroke-width']).to.deep.equal([
      'case',
      ['get', 'highlighted'],
      3,
      1.5,
    ])
  })

  it('adds a count layer above the dots only if the style has glyphs', () => {
    const layer = document.createElement('grampsjs-map-places-layer')
    const withGlyphs = {
      glyphs: 'https://g/{fontstack}/{range}.pbf',
      sources: {},
      layers: [{id: 'x', type: 'symbol', layout: {'text-font': ['F Bold']}}],
    }
    const s = layer.getTransformStyleContribution(null, withGlyphs)
    const ids = s.layers.map(l => l.id)
    expect(ids).to.deep.equal(['x', 'places-layer', 'places-count-layer'])
    const count = s.layers[2]
    expect(count.layout['text-font']).to.deep.equal(['F Bold'])
    expect(count.layout['text-allow-overlap']).to.equal(true)
    expect(count.filter).to.deep.equal(['>=', ['get', 'count'], 2])
    expect(count.paint['text-color']).to.equal('#ffffff')
    const without = layer.getTransformStyleContribution(null, {
      sources: {},
      layers: [],
    })
    expect(without.layers.map(l => l.id)).to.deep.equal(['places-layer'])
  })

  it('handles clicks only on the dot layer, so the numbers do not block them', () => {
    const layer = document.createElement('grampsjs-map-places-layer')
    const handlers = {}
    const map = {
      getLayer: () => null,
      getSource: () => null,
      addSource: vi.fn(),
      addLayer: vi.fn(),
      getStyle: () => ({
        glyphs: 'g',
        layers: [{type: 'symbol', layout: {'text-font': ['F']}}],
      }),
      on: (ev, id, fn) => {
        handlers[`${ev}:${id}`] = fn
      },
      getCanvas: () => ({style: {}}),
    }
    layer.addToMap(map)
    expect(map.addLayer.mock.calls.map(c => c[0].id)).to.deep.equal([
      'places-layer',
      'places-count-layer',
    ])
    expect(
      Object.keys(handlers).every(k => k.endsWith(':places-layer'))
    ).to.equal(true)
  })

  it('pans the map so an open popup is not under the search bar or cut off', () => {
    const layer = document.createElement('grampsjs-map-places-layer')
    const rect = (top, bottom, left = 100, right = 300) => ({
      top,
      bottom,
      left,
      right,
    })
    const map = {
      panBy: vi.fn(),
      getContainer: () => ({getBoundingClientRect: () => rect(0, 800, 0, 400)}),
    }
    layer._map = map
    const popup = r => ({
      isOpen: () => true,
      getElement: () => ({getBoundingClientRect: () => r}),
    })
    layer._keepPopupInView(popup(rect(20, 300)))
    expect(map.panBy.mock.lastCall[0]).to.deep.equal([0, 20 - 84])
    layer._keepPopupInView(popup(rect(500, 850)))
    expect(map.panBy.mock.lastCall[0]).to.deep.equal([0, 850 - 788])
    layer._keepPopupInView(popup(rect(200, 400, 250, 450)))
    expect(map.panBy.mock.lastCall[0]).to.deep.equal([450 - 400 + 12, 0])
    map.panBy.mockClear()
    layer._keepPopupInView(popup(rect(200, 400)))
    expect(map.panBy).not.toHaveBeenCalled()
  })

  it('popup: count, groups with colour dots, place button for regular dots', () => {
    const layer = document.createElement('grampsjs-map-places-layer')
    layer.translate = (s, n) => s.replace('%s', n)
    const fired = []
    layer.addEventListener('map:marker-clicked', e => fired.push(e.detail))
    const el = layer._popupContent(
      {handle: 'G', name: 'Germany', count: 3, loadDetails: () => {}},
      {
        groups: [
          {label: 'Parents', color: '#f57c00', lines: ['A · Birth · 1900']},
          {
            label: 'Grandparents',
            color: '#c9a000',
            lines: ['B · Birth · 1870', 'C · Death · 1930'],
          },
        ],
      }
    )
    expect(el.querySelector('.sub').textContent).to.equal('3 events')
    expect(
      [...el.querySelectorAll('.group')].map(g => g.textContent)
    ).to.deep.equal(['Parents', 'Grandparents'])
    expect(el.querySelectorAll('.group .dot')).to.have.length(2)
    expect(el.querySelectorAll('.line')).to.have.length(3)
    el.querySelector('button.place-link').click()
    expect(fired).to.deep.equal([{handle: 'G'}])
    const loading = layer._popupContent(
      {handle: 'G', name: 'Germany', count: 1, loadDetails: () => {}},
      {loading: true}
    )
    expect(loading.textContent).to.contain('1 event')
    expect(loading.textContent).to.contain('Loading...')
  })
})

// A map view that is never attached to the document; map and search box are stubs.
const PLACES = [
  {handle: 'P1', profile: {name: 'Germany', lat: 51, long: 9}},
  {handle: 'P2', profile: {name: 'Berlin', lat: 52.5, long: 13.4}},
  {handle: 'P3', profile: {name: 'Empty', lat: 10, long: 10}},
]
const EVENTS = [
  {
    handle: 'E1',
    gramps_id: 'E0001',
    place: 'P1',
    type: 'Birth',
    date: date(1850),
  },
  {
    handle: 'E2',
    gramps_id: 'E0002',
    place: 'P1',
    type: 'Birth',
    date: date(1860),
  },
  {
    handle: 'E3',
    gramps_id: 'E0003',
    place: 'P1',
    type: 'Death',
    date: date(1920),
  },
  {
    handle: 'E4',
    gramps_id: 'E0004',
    place: 'P2',
    type: 'Birth',
    date: date(1900),
  },
]

function makeView() {
  const view = new GrampsjsViewMap()
  Object.defineProperty(view, '_mapEl', {
    value: {
      flyTo: vi.fn(),
      fitBounds: vi.fn(),
      jumpTo: vi.fn(),
      _map: {resize: vi.fn()},
    },
  })
  Object.defineProperty(view, '_searchbox', {
    value: {
      showDetails: vi.fn(),
      focus: vi.fn(),
      clear: vi.fn(),
      collapse: vi.fn(),
    },
  })
  view.appState = {
    i18n: {lang: 'en', strings: {}},
    apiGet: vi.fn(async url => {
      if (url.startsWith('/api/events/?keys=date')) return {data: EVENTS}
      if (url.startsWith('/api/events/?keys=handle,profile')) {
        return {
          data: [
            {handle: 'E1', profile: {type: 'Birth', summary: 'Birth - Anna'}},
            {handle: 'E2', profile: {type: 'Birth', summary: 'Birth - Otto'}},
            {handle: 'E3', profile: {type: 'Death', summary: 'Death - Anna'}},
          ],
        }
      }
      return {data: []}
    }),
    dbInfo: {},
  }
  view._dataPlaces = PLACES
  view._filteredPlaces = PLACES
  return view
}

beforeEach(() => {
  localStorage.removeItem('grampsjs_map_viewport')
})

describe('map view: counts on the regular map', () => {
  it('counts the events per place that the API returned', async () => {
    const view = makeView()
    await view._fetchEvents()
    expect(view.appState.apiGet).toHaveBeenCalledWith(
      '/api/events/?keys=date,gramps_id,handle,place,type'
    )
    const places = view._placesForMap
    const by = Object.fromEntries(places.map(p => [p.handle, p]))
    expect(by.P1.count).to.equal(3)
    expect(by.P2.count).to.equal(1)
    // a place with coordinates but no events: base size, no number, no popup
    expect(by.P3.count).to.equal(0)
    expect(by.P3.loadDetails).to.equal(undefined)
    expect(typeof by.P1.loadDetails).to.equal('function')
  })

  it('recounts when the filters change', async () => {
    const view = makeView()
    await view._fetchEvents()
    view._handleFilterChange({detail: {eventTypes: ['Birth']}})
    let by = Object.fromEntries(view._placesForMap.map(p => [p.handle, p]))
    expect(by.P1.count).to.equal(2)
    expect(by.P2.count).to.equal(1)
    expect(by.P3).to.equal(undefined)
    view._handleFilterChange({detail: {eventTypes: []}})
    view._year = 1915
    view._handleFilterChange({detail: {timeFilter: true, yearSpan: 10}})
    by = Object.fromEntries(view._placesForMap.map(p => [p.handle, p]))
    expect(by.P1.count).to.equal(1) // the death in 1920
    expect(by.P2).to.equal(undefined) // birth in 1900, outside 1905-1925
  })

  it('keeps the same places array across unrelated re-renders', async () => {
    const view = makeView()
    await view._fetchEvents()
    const a = view._placesForMap
    expect(view._placesForMap).to.equal(a)
    view._handleFilterChange({detail: {eventTypes: ['Death']}})
    expect(view._placesForMap).not.to.equal(a)
  })

  it('the popup lists the matching events with names, type and year', async () => {
    const view = makeView()
    await view._fetchEvents()
    view._handleFilterChange({detail: {eventTypes: ['Birth']}})
    const germany = view._placesForMap.find(p => p.handle === 'P1')
    const groups = await germany.loadDetails()
    expect(groups).to.deep.equal([
      {lines: ['Anna · Birth · 1850', 'Otto · Birth · 1860']},
    ])
    const url = view.appState.apiGet.mock.calls
      .map(c => c[0])
      .find(u => u.includes('profile=participants'))
    const rules = JSON.parse(decodeURIComponent(url.split('rules=')[1]))
    // only the matching events are asked for
    expect(rules.rules.map(r => r.values[0])).to.deep.equal(['E0001', 'E0002'])
  })

  it('a failed load rejects (the popup shows an error)', async () => {
    const view = makeView()
    await view._fetchEvents()
    view.appState.apiGet = vi.fn().mockResolvedValue({error: 'nope'})
    const germany = view._placesForMap.find(p => p.handle === 'P1')
    let failed = false
    await germany.loadDetails().catch(() => {
      failed = true
    })
    await flushPromises()
    expect(failed).to.equal(true)
  })
})
