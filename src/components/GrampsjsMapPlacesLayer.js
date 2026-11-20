import {LitElement} from 'lit'
import {fireEvent} from '../util.js'
import * as maplibregl from 'maplibre-gl'
import {
  dotRadius,
  dotLabel,
  sortForDrawing,
  pickTextFont,
  HIGHLIGHT_EXTRA,
} from '../mapDots.js'

const LAYER = 'places-layer'
const COUNT_LAYER = 'places-count-layer'
const SOURCE = 'places'
// Room kept free above an open popup (the search bar) and at the sides.
const TOP_MARGIN = 84
const SIDE_MARGIN = 12

// The places on the map as one dot each. A place can carry:
// - `count`: the number of events there (after the filters); the dot grows
//   with it and shows it from two on,
// - `color`: the dot colour,
// - `groups`: popup lines [{label, color, lines}] (ancestor pins), shown on
//   hover and, on click, in a popup that stays open,
// - `loadDetails`: an async function giving such groups (regular dots); on
//   click a popup opens, loads them and offers the place details.
// Places with neither select the place on click, as before.
class GrampsjsMapPlacesLayer extends LitElement {
  static get properties() {
    return {
      places: {type: Array},
      highlightedHandles: {type: Array},
      // the view's translate function `_`
      translate: {attribute: false},
    }
  }

  constructor() {
    super()
    this.places = []
    this.highlightedHandles = []
    this.translate = s => s
    this._map = null
    this._handlersAdded = false
    this._popup = null
    this._clickPopup = null
    this._detailsToken = 0
  }

  _placeByHandle(handle) {
    return (this.places || []).find(p => p.handle === handle)
  }

  _t(s, ...args) {
    try {
      return this.translate(s, ...args)
    } catch (e) {
      return s
    }
  }

  _countText(count) {
    return count === 1 ? this._t('1 event') : this._t('%s events', count)
  }

  // The popup's DOM: title, count, groups of lines and, for regular dots,
  // a button for the place details.
  _popupContent(
    place,
    {groups = place.groups, loading = false, error = false} = {}
  ) {
    const root = document.createElement('div')
    root.className = 'grampsjs-place-details'
    const title = document.createElement('strong')
    title.textContent = place.name ?? ''
    root.appendChild(title)
    if (place.count > 0) {
      const sub = document.createElement('div')
      sub.className = 'sub'
      sub.textContent = this._countText(place.count)
      root.appendChild(sub)
    }
    if (loading) {
      const div = document.createElement('div')
      div.className = 'sub'
      div.textContent = this._t('Loading...')
      root.appendChild(div)
    } else if (error) {
      const div = document.createElement('div')
      div.className = 'sub'
      div.textContent = this._t('Error')
      root.appendChild(div)
    }
    // the lines scroll, title and button stay
    const list = document.createElement('div')
    list.className = 'lines'
    for (const group of groups ?? []) {
      if (group.label) {
        const head = document.createElement('div')
        head.className = 'group'
        if (group.color) {
          const dot = document.createElement('span')
          dot.className = 'dot'
          dot.style.background = group.color
          head.appendChild(dot)
        }
        head.appendChild(document.createTextNode(group.label))
        list.appendChild(head)
      }
      for (const line of group.lines ?? []) {
        const div = document.createElement('div')
        div.className = 'line'
        div.textContent = line
        list.appendChild(div)
      }
    }
    if (list.childNodes.length) root.appendChild(list)
    if (place.loadDetails) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'place-link'
      button.textContent = this._t('Show place')
      button.addEventListener('click', () => {
        this._clickPopup?.remove()
        fireEvent(this, 'map:marker-clicked', {handle: place.handle})
      })
      root.appendChild(button)
    }
    return root
  }

  // Pans the map so an open popup is fully visible and not under the
  // search bar at the top (TOP_MARGIN).
  _keepPopupInView(popup) {
    const map = this._map
    const el = popup?.getElement?.()
    if (!map || !el || !popup.isOpen()) return
    const box = map.getContainer().getBoundingClientRect()
    const r = el.getBoundingClientRect()
    const top = box.top + TOP_MARGIN
    const bottom = box.bottom - SIDE_MARGIN
    let dy = 0
    if (r.top < top) dy = r.top - top
    else if (r.bottom > bottom) dy = Math.min(r.bottom - bottom, r.top - top)
    let dx = 0
    if (r.left < box.left + SIDE_MARGIN) dx = r.left - box.left - SIDE_MARGIN
    else if (r.right > box.right - SIDE_MARGIN) {
      dx = r.right - box.right + SIDE_MARGIN
    }
    if (dx || dy) map.panBy([dx, dy], {duration: 300})
  }

  _afterLayout(fn) {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => fn())
    } else fn()
  }

  _openClickPopup(place, coords) {
    this._detailsPopup.remove()
    this._popup.remove()
    this._clickPopup?.remove()
    this._clickPopup = new maplibregl.Popup({
      closeButton: true,
      closeOnClick: true,
      // focusing the place button would scroll the list to its end
      focusAfterOpen: false,
      offset: 15,
      maxWidth: '320px',
      className: 'grampsjs-place-details-popup',
    })
      .setLngLat(coords)
      .setDOMContent(
        this._popupContent(place, {loading: Boolean(place.loadDetails)})
      )
      .addTo(this._map)
    const opened = this._clickPopup
    if (!place.loadDetails) {
      this._afterLayout(() => this._keepPopupInView(opened))
      return
    }
    this._detailsToken += 1
    const token = this._detailsToken
    const popup = this._clickPopup
    Promise.resolve()
      .then(() => place.loadDetails())
      .then(groups => {
        if (token !== this._detailsToken || !popup.isOpen()) return
        popup.setDOMContent(this._popupContent(place, {groups}))
        this._afterLayout(() => this._keepPopupInView(popup))
      })
      .catch(() => {
        if (token !== this._detailsToken || !popup.isOpen()) return
        popup.setDOMContent(
          this._popupContent(place, {groups: [], error: true})
        )
      })
  }

  // No shadow DOM — this component renders no UI.
  createRenderRoot() {
    return this
  }

  _layers(style) {
    const layers = [
      {id: LAYER, type: 'circle', source: SOURCE, paint: this._paint()},
    ]
    const font = pickTextFont(style)
    if (font) {
      layers.push({
        id: COUNT_LAYER,
        type: 'symbol',
        source: SOURCE,
        filter: ['>=', ['get', 'count'], 2],
        layout: {
          'text-field': ['get', 'label'],
          'text-font': font,
          'text-size': ['case', ['>=', ['get', 'count'], 100], 10, 11],
          'text-allow-overlap': true,
          'text-ignore-placement': true,
          'text-padding': 0,
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': 'rgba(0, 0, 0, 0.35)',
          'text-halo-width': 0.6,
        },
      })
    }
    return layers
  }

  // Called by GrampsjsMap on initial map load.
  addToMap(map) {
    this._map = map
    for (const id of [COUNT_LAYER, LAYER]) {
      if (map.getLayer(id)) map.removeLayer(id)
    }
    if (map.getSource(SOURCE)) map.removeSource(SOURCE)
    map.addSource(SOURCE, {type: 'geojson', data: this._buildGeoJSON()})
    for (const layer of this._layers(map.getStyle?.())) {
      try {
        map.addLayer(layer)
      } catch (e) {
        // without usable glyphs the dots are still drawn, only no counts
        console.warn('places layer:', e)
      }
    }
    if (!this._handlersAdded) {
      this._handlersAdded = true
      this._popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 15,
        className: 'grampsjs-place-tooltip',
      })
      this._detailsPopup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 15,
        maxWidth: '320px',
        className: 'grampsjs-place-details-popup',
      })
      map.on('click', LAYER, e => {
        // the topmost dot: features come top first, smaller dots are on top
        const feature = e.features?.[0]
        if (!feature) return
        e.originalEvent.stopPropagation()
        const place = this._placeByHandle(feature.properties.handle)
        if (place?.groups || place?.loadDetails) {
          this._openClickPopup(place, feature.geometry.coordinates.slice())
          return
        }
        fireEvent(this, 'map:marker-clicked', {
          handle: feature.properties.handle,
        })
      })
      map.on('mouseenter', LAYER, e => {
        map.getCanvas().style.cursor = 'pointer'
        const feature = e.features?.[0]
        if (!feature || feature.properties.highlighted) return
        const coords = feature.geometry.coordinates.slice()
        const place = this._placeByHandle(feature.properties.handle)
        if (this._clickPopup?.isOpen()) return
        if (place?.groups) {
          this._detailsPopup
            .setLngLat(coords)
            .setDOMContent(this._popupContent(place))
            .addTo(map)
          return
        }
        const count = feature.properties.count ?? 0
        this._popup
          .setLngLat(coords)
          .setText(
            count >= 2
              ? `${feature.properties.name} · ${this._countText(count)}`
              : feature.properties.name
          )
          .addTo(map)
      })
      map.on('mouseleave', LAYER, () => {
        map.getCanvas().style.cursor = ''
        this._popup.remove()
        this._detailsPopup.remove()
      })
    }
  }

  // Called by GrampsjsMap inside setStyle's transformStyle callback so the
  // places source and layers are part of the new style from its first frame.
  getTransformStyleContribution(_prev, next) {
    return {
      ...next,
      sources: {
        ...next.sources,
        [SOURCE]: {type: 'geojson', data: this._buildGeoJSON()},
      },
      layers: [
        ...next.layers.filter(l => l.id !== LAYER && l.id !== COUNT_LAYER),
        ...this._layers(next),
      ],
    }
  }

  updated(changed) {
    if (changed.has('places') || changed.has('highlightedHandles')) {
      if (changed.has('places')) this._clickPopup?.remove()
      this._updateSource()
    }
  }

  _updateSource() {
    if (!this._map) return
    const source = this._map.getSource(SOURCE)
    if (source) {
      source.setData(this._buildGeoJSON())
    } else if (this._map.isStyleLoaded()) {
      this.addToMap(this._map)
    }
  }

  _buildGeoJSON() {
    const highlighted = new Set(this.highlightedHandles || [])
    const anyHighlighted = highlighted.size > 0
    const items = (this.places || []).map(place => {
      const count = Number(place.count) || 0
      return {
        place,
        count,
        highlighted: highlighted.has(place.handle),
      }
    })
    return {
      type: 'FeatureCollection',
      features: sortForDrawing(items).map(
        ({place, count, highlighted: hl}) => ({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [parseFloat(place.long), parseFloat(place.lat)],
          },
          properties: {
            handle: place.handle,
            name: place.name,
            color: place.color ?? null,
            count,
            label: dotLabel(count),
            radius: dotRadius(count),
            highlighted: hl,
            anyHighlighted,
          },
        })
      ),
    }
  }

  // eslint-disable-next-line class-methods-use-this
  _paint() {
    const markerColor =
      getComputedStyle(document.documentElement)
        .getPropertyValue('--grampsjs-map-marker-color')
        .trim() || '#ea4335'
    const radius = ['coalesce', ['get', 'radius'], 9]
    return {
      'circle-radius': [
        'case',
        ['get', 'highlighted'],
        ['+', radius, HIGHLIGHT_EXTRA],
        radius,
      ],
      'circle-color': ['coalesce', ['get', 'color'], markerColor],
      'circle-opacity': [
        'case',
        ['get', 'highlighted'],
        1,
        ['case', ['boolean', ['get', 'anyHighlighted'], false], 0.55, 0.9],
      ],
      'circle-stroke-width': ['case', ['get', 'highlighted'], 3, 1.5],
      'circle-stroke-color': '#ffffff',
    }
  }
}

window.customElements.define(
  'grampsjs-map-places-layer',
  GrampsjsMapPlacesLayer
)
