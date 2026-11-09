import { describe, expect, it } from 'vitest'
import { isDarkSky, isLateNight, phaseOf, skyAt } from './sky'

const at = (h: number, m = 0) => h * 60 + m

describe('the sky', () => {
  it('names the parts of the day', () => {
    expect(phaseOf(at(2))).toBe('night')
    expect(phaseOf(at(6))).toBe('dawn')
    expect(phaseOf(at(9))).toBe('morning')
    expect(phaseOf(at(13))).toBe('midday')
    expect(phaseOf(at(16))).toBe('afternoon')
    expect(phaseOf(at(18))).toBe('golden')
    expect(phaseOf(at(19))).toBe('sunset')
    expect(phaseOf(at(20, 30))).toBe('dusk')
    expect(phaseOf(at(23))).toBe('night')
  })

  it('melts colour smoothly, with no jump at midnight', () => {
    expect(skyAt(at(0)).top).toBe(skyAt(at(24)).top)
    expect(skyAt(at(12)).top).toBe('#ffd84d')
    const between = skyAt(at(10)).top
    expect(between).not.toBe(skyAt(at(8)).top)
    expect(between).not.toBe(skyAt(at(12)).top)
  })

  it('moves the sun across the day and the moon across the night', () => {
    expect(skyAt(at(7)).orb).toBe('sun')
    expect(skyAt(at(12, 30)).y).toBeGreaterThan(skyAt(at(7)).y)
    expect(skyAt(at(7)).x).toBeLessThan(skyAt(at(17)).x)
    expect(skyAt(at(0)).orb).toBe('moon')
    expect(skyAt(at(1)).stars).toBe(1)
    expect(skyAt(at(12)).stars).toBe(0)
  })

  it('goes dark after dusk, and asks for rest in the small hours', () => {
    expect(isDarkSky(at(12))).toBe(false)
    expect(isDarkSky(at(20))).toBe(true)
    expect(isDarkSky(at(5))).toBe(true)
    expect(isLateNight(at(0))).toBe(true)
    expect(isLateNight(at(22, 59))).toBe(false)
    expect(isLateNight(at(5))).toBe(false)
  })
})
