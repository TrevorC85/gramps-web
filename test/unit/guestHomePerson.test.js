// Collins: home person forced by the server for the Guest role
import {describe, it, expect, beforeEach, afterEach} from 'vitest'
import {
  getForcedSettings,
  getSettings,
  setForcedSettings,
  updateSettings,
} from '../../src/api.js'
import '../../src/components/GrampsjsHomePerson.js'

const storedHome = () =>
  Object.values(
    JSON.parse(localStorage.getItem('grampsjs_settings_tree') || '{}')
  )[0]?.homePerson

describe('guest home person', () => {
  beforeEach(() => {
    localStorage.clear()
    setForcedSettings({})
  })
  afterEach(() => {
    setForcedSettings({})
    localStorage.clear()
  })

  it('leaves the stored home person alone without a forced one', () => {
    updateSettings({homePerson: 'I0006'}, true)
    expect(getSettings().homePerson).toBe('I0006')
    setForcedSettings({object_counts: {people: 3}})
    expect(getForcedSettings()).toEqual({})
    expect(getSettings().homePerson).toBe('I0006')
  })

  it('overrides a stored home person and cannot be changed', () => {
    updateSettings({homePerson: 'I0006'}, true)
    setForcedSettings({guest_home_person: 'I0016'})
    expect(getSettings().homePerson).toBe('I0016')
    updateSettings({homePerson: 'I0001', theme: 'dark'}, true)
    expect(getSettings().homePerson).toBe('I0016')
    // other settings still save; the forced one is never written
    expect(getSettings().theme).toBe('dark')
    expect(storedHome()).toBe('I0006')
    // after logging in as someone else, their own setting is back
    setForcedSettings({})
    expect(getSettings().homePerson).toBe('I0006')
  })

  it('hides the edit controls of the dashboard card for guests', async () => {
    const el = document.createElement('grampsjs-home-person')
    el.appState = {
      i18n: {strings: {}, lang: 'en'},
      dbInfo: {guest_home_person: 'I0016'},
      settings: {},
      permissions: {},
      frontendConfig: {},
    }
    el.homePersonGrampsId = ''
    document.body.appendChild(el)
    await el.updateComplete
    expect(el.renderRoot.querySelector('md-text-button')).toBeNull()
    el.appState = {...el.appState, dbInfo: {}}
    await el.updateComplete
    expect(el.renderRoot.querySelector('md-text-button')).not.toBeNull()
    el.remove()
  })
})
