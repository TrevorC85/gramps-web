import {html, css} from 'lit'

import '@material/web/button/text-button.js'
import '@material/web/switch/switch.js'

import './GrampsjsGallery.js'
import './GrampsjsEvents.js'
import './GrampsjsChipChoice.js'
import {GrampsjsConnectedComponent} from './GrampsjsConnectedComponent.js'
import {fireEvent, personProfileDisplayName} from '../util.js'
import {sharedStyles} from '../SharedStyles.js'
import {getSymbols} from '../symbols.js'
import {ANCESTOR_GENERATIONS, generationLabel} from '../mapAncestors.js'

export class GrampsjsPersonBox extends GrampsjsConnectedComponent {
  static get styles() {
    return [
      sharedStyles,
      css`
        h2,
        h3,
        h4 {
          font-family: var(--grampsjs-body-font-family);
        }

        h2 {
          font-weight: 500;
          font-size: 22px;
          margin-top: 10px;
          margin-bottom: 0;
        }

        h3 {
          font-weight: 400;
          font-size: 18px;
          margin-top: 24px;
          margin-bottom: 7px;
        }

        :host {
          font-size: 16px;
        }

        .right {
          text-align: right;
          position: sticky;
          bottom: 0;
          background: var(--md-sys-color-surface-container-high);
          margin-top: 4px;
        }

        p {
          margin-top: 0.6em;
          margin-bottom: 0.6em;
        }

        .dates {
          font-size: 14px;
          color: var(--md-sys-color-on-surface-variant);
          margin-top: 6px;
        }

        .ancestors {
          margin-top: 12px;
          padding: 10px 12px;
          border-radius: 12px;
          background: var(--md-sys-color-surface-container);
          font-size: 14px;
        }

        .ancestors label.switch {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          font-weight: 500;
          cursor: pointer;
        }

        .ancestors .sub {
          color: var(--md-sys-color-on-surface-variant);
          margin: 10px 0 4px;
        }

        .ancestors .counts p {
          margin: 4px 0;
        }

        .ancestors .warn {
          color: var(--md-sys-color-on-surface-variant);
        }

        .legend {
          display: flex;
          flex-wrap: wrap;
          gap: 4px 12px;
          margin-top: 8px;
          font-size: 13px;
        }

        .legend span.dot {
          display: inline-block;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          margin-right: 5px;
          border: 1px solid #fff;
          box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.25);
          vertical-align: -1px;
        }
      `,
    ]
  }

  static get properties() {
    return {
      handle: {type: String},
      name: {type: String},
      // Pre-fetched person data from parent; when set, skips the internal fetch.
      personData: {type: Object},
      // The map's ancestor places: null hides the switch, otherwise
      // {on, generations, loading, error, counts, legend: [{generation, color}]}
      ancestors: {type: Object},
    }
  }

  constructor() {
    super()
    this.handle = ''
    this.name = ''
    this.personData = null
    this.ancestors = null
  }

  getUrl() {
    if (!this.handle || this.personData) return ''
    const lang = this.appState?.i18n?.lang || 'en'
    return `/api/people/${this.handle}?extend=all&profile=all&locale=${lang}`
  }

  render() {
    if (this.personData) return this.renderContent()
    return super.render()
  }

  renderContent() {
    const person = this.personData || this._data?.data
    if (!person) return ''
    const fullName = personProfileDisplayName(person.profile)
    const birthDate = person.profile?.birth?.date || ''
    const birthPlace = person.profile?.birth?.place_name || ''
    const deathDate = person.profile?.death?.date || ''
    const deathPlace = person.profile?.death?.place_name || ''
    const {birthSymbol, deathSymbol} = getSymbols(this.appState.settings, s =>
      this._(s)
    )
    return html`
      <h2>${fullName || this.name || this._('Person')}</h2>
      <div class="dates">
        ${birthDate || birthPlace
          ? html`<p>
              ${birthSymbol}
              ${[birthDate, birthPlace].filter(Boolean).join(' · ')}
            </p>`
          : ''}
        ${deathDate || deathPlace
          ? html`<p>
              ${deathSymbol}
              ${[deathDate, deathPlace].filter(Boolean).join(' · ')}
            </p>`
          : ''}
      </div>
      ${this._renderAncestors()}
      ${person.media_list?.length
        ? html`
            <h3>${this._('Gallery')}</h3>
            <grampsjs-gallery
              .appState="${this.appState}"
              .media="${person.extended?.media || []}"
              .mediaRef="${person.media_list}"
            ></grampsjs-gallery>
          `
        : ''}
      ${person.extended?.events?.length
        ? html`
            <h3>${this._('Events')}</h3>
            <grampsjs-events
              .appState="${this.appState}"
              .data="${person.extended.events}"
              .profile="${person.profile?.events || []}"
              .eventRef="${person.event_ref_list || []}"
              sorted
              hideAge
              @grampsjs-events:place-hover="${this._handlePlaceHover}"
            ></grampsjs-events>
          `
        : ''}
      <div class="right">
        <md-text-button @click="${this._handleDetailClick}"
          >${this._('Show Details')}</md-text-button
        >
      </div>
    `
  }

  _renderAncestors() {
    const a = this.ancestors
    if (!a) return ''
    return html`
      <div class="ancestors">
        <label class="switch">
          <span>${this._('Show ancestors')}</span>
          <md-switch
            ?selected="${a.on}"
            aria-label="${this._('Show ancestors')}"
            @change="${this._handleAncestorsSwitch}"
          ></md-switch>
        </label>
        ${a.on
          ? html`
              <div class="sub">${this._('Generations')}</div>
              <grampsjs-chip-choice
                .options="${ANCESTOR_GENERATIONS.map(n => ({
                  value: n,
                  label: n > 0 ? `${n}` : this._('All'),
                }))}"
                .selected="${a.generations}"
                ariaLabel="${this._('Generations')}"
                @chip-choice:change="${this._handleAncestorsGenerations}"
              ></grampsjs-chip-choice>
              ${this._renderAncestorCounts(a)}
            `
          : ''}
      </div>
    `
  }

  _renderAncestorCounts(a) {
    if (a.loading) {
      return html`<div class="counts"><p>${this._('Loading...')}</p></div>`
    }
    if (a.error) {
      return html`<div class="counts"><p class="warn">${a.error}</p></div>`
    }
    if (!a.counts) return ''
    const c = a.counts
    return html`
      <div class="counts">
        <p>
          ${this._('%s ancestors', c.ancestors)} ·
          ${this._('%s places on the map', c.shownPlaces)}
        </p>
        ${c.placesWithoutCoordinates > 0
          ? html`<p class="warn">
              ${this._(
                '%s places left off the map: no coordinates yet',
                c.placesWithoutCoordinates
              )}
            </p>`
          : ''}
        ${c.eventsWithoutPlace > 0
          ? html`<p class="warn">
              ${this._('%s events without a place', c.eventsWithoutPlace)}
            </p>`
          : ''}
      </div>
      <div class="legend">
        ${(a.legend ?? []).map(
          item => html`<span
            ><span class="dot" style="background:${item.color}"></span
            >${generationLabel(item.generation, (s, ...args) =>
              this._(s, ...args)
            )}</span
          >`
        )}
      </div>
    `
  }

  _handleAncestorsSwitch(e) {
    fireEvent(this, 'map:ancestors-change', {on: e.target.selected})
  }

  _handleAncestorsGenerations(e) {
    e.stopPropagation()
    fireEvent(this, 'map:ancestors-change', {generations: e.detail.value})
  }

  renderLoading() {
    return html`
      <h2>
        ${this.name || html`<span class="skeleton skeleton-text">&nbsp;</span>`}
      </h2>
      <span class="skeleton skeleton-text" style="width:60%">&nbsp;</span>
      <span class="skeleton skeleton-text" style="width:80%">&nbsp;</span>
    `
  }

  _handleDetailClick() {
    const id = (this.personData || this._data?.data)?.gramps_id
    if (id) fireEvent(this, 'nav', {path: `person/${id}`})
  }

  _handlePlaceHover(e) {
    fireEvent(window, 'map:place-active', {handle: e.detail.handle})
  }
}

window.customElements.define('grampsjs-person-box', GrampsjsPersonBox)
