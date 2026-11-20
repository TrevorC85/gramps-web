import {LitElement} from 'lit'
import {fireEvent} from '../util.js'
import * as maplibregl from 'maplibre-gl'

class GrampsjsMapPlacesLayer extends LitElement {
  static get properties() {
    return {
      places: {type: Array},
      highlightedHandles: {type: Array},
    }
  }

  constructor() {
    super()
    this.places = []
    this.highlightedHandles = []
    this._map = null
    this._handlersAdded = false
    this._popup = null
    this._clickPopup = null
  }

  // A place can carry `color` (pin colour) and `details` (lines listed in
  // its popup, e.g. who had which event there); such a pin shows the
  // details on hover and, on click, in a popup that stays open, instead of
  // selecting the place.
  _placeByHandle(handle) {
    return (this.places || []).find(p => p.handle === handle)
  }

  // eslint-disable-next-line class-methods-use-this
  _popupContent(place) {
    const root = document.createElement('div')
    root.className = 'grampsjs-place-details'
    const title = document.createElement('strong')
    title.textContent = place.name ?? ''
    root.appendChild(title)
    for (const line of place.details) {
      const div = document.createElement('div')
      div.textContent = line
      root.appendChild(div)
    }
    return root
  }

  // No shadow DOM — this component renders no UI.
  createRenderRoot() {
    return this
  }

  // Called by GrampsjsMap on initial map load.
  addToMap(map) {
    this._map = map
    if (map.getLayer('places-layer')) map.removeLayer('places-layer')
    if (map.getSource('places')) map.removeSource('places')
    map.addSource('places', {type: 'geojson', data: this._buildGeoJSON()})
    map.addLayer({
      id: 'places-layer',
      type: 'circle',
      source: 'places',
      paint: this._paint(),
    })
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
      map.on('click', 'places-layer', e => {
        const feature = e.features?.[0]
        if (!feature) return
        e.originalEvent.stopPropagation()
        const place = this._placeByHandle(feature.properties.handle)
        if (place?.details) {
          this._detailsPopup.remove()
          this._clickPopup?.remove()
          this._clickPopup = new maplibregl.Popup({
            closeButton: true,
            closeOnClick: true,
            offset: 15,
            maxWidth: '320px',
            className: 'grampsjs-place-details-popup',
          })
            .setLngLat(feature.geometry.coordinates.slice())
            .setDOMContent(this._popupContent(place))
            .addTo(map)
          return
        }
        fireEvent(this, 'map:marker-clicked', {
          handle: feature.properties.handle,
        })
      })
      map.on('mouseenter', 'places-layer', e => {
        map.getCanvas().style.cursor = 'pointer'
        const feature = e.features?.[0]
        if (!feature || feature.properties.highlighted) return
        const coords = feature.geometry.coordinates.slice()
        const place = this._placeByHandle(feature.properties.handle)
        if (place?.details) {
          if (this._clickPopup?.isOpen()) return
          this._detailsPopup
            .setLngLat(coords)
            .setDOMContent(this._popupContent(place))
            .addTo(map)
          return
        }
        this._popup
          .setLngLat(coords)
          .setText(feature.properties.name)
          .addTo(map)
      })
      map.on('mouseleave', 'places-layer', () => {
        map.getCanvas().style.cursor = ''
        this._popup.remove()
        this._detailsPopup.remove()
      })
    }
  }

  // Called by GrampsjsMap inside setStyle's transformStyle callback so the
  // places source and layer are part of the new style from its very first frame.
  getTransformStyleContribution(_prev, next) {
    return {
      ...next,
      sources: {
        ...next.sources,
        places: {type: 'geojson', data: this._buildGeoJSON()},
      },
      layers: [
        ...next.layers,
        {
          id: 'places-layer',
          type: 'circle',
          source: 'places',
          paint: this._paint(),
        },
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
    const source = this._map.getSource('places')
    if (source) {
      source.setData(this._buildGeoJSON())
    } else if (this._map.isStyleLoaded()) {
      this.addToMap(this._map)
    }
  }

  _buildGeoJSON() {
    const anyHighlighted = this.highlightedHandles?.length > 0
    return {
      type: 'FeatureCollection',
      features: (this.places || []).map(place => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [parseFloat(place.long), parseFloat(place.lat)],
        },
        properties: {
          handle: place.handle,
          name: place.name,
          color: place.color ?? null,
          highlighted: (this.highlightedHandles || []).includes(place.handle),
          anyHighlighted,
        },
      })),
    }
  }

  _paint() {
    const markerColor =
      getComputedStyle(document.documentElement)
        .getPropertyValue('--grampsjs-map-marker-color')
        .trim() || '#ea4335'
    return {
      'circle-radius': ['case', ['get', 'highlighted'], 14, 9],
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
