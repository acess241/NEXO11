import schoolsCatalog from '../data/schoolsCatalog.json'

function normalizeText(value) {
  return `${value || ''}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function makeCityKey(city, uf) {
  return `${normalizeText(city)}::${normalizeText(uf)}`
}

export const SCHOOL_CATALOG = Array.isArray(schoolsCatalog) ? schoolsCatalog : []

const cityMap = new Map()
const schoolsByCity = new Map()

for (const school of SCHOOL_CATALOG) {
  const city = `${school?.city || ''}`.trim()
  const uf = `${school?.uf || ''}`.trim().toUpperCase()
  const name = `${school?.name || ''}`.trim()

  if (!city || !uf || !name) continue

  const cityKey = makeCityKey(city, uf)

  if (!cityMap.has(cityKey)) {
    cityMap.set(cityKey, {
      key: cityKey,
      city,
      uf,
      label: `${city}/${uf}`,
      schoolCount: 0,
    })
    schoolsByCity.set(cityKey, [])
  }

  const cityEntry = cityMap.get(cityKey)
  cityEntry.schoolCount += 1
  schoolsByCity.get(cityKey).push(school)
}

for (const [cityKey, list] of schoolsByCity.entries()) {
  list.sort((a, b) => `${a.name || ''}`.localeCompare(`${b.name || ''}`, 'pt-BR'))
  schoolsByCity.set(cityKey, list)
}

export const SCHOOL_CITY_OPTIONS = Array.from(cityMap.values()).sort((a, b) =>
  a.city.localeCompare(b.city, 'pt-BR')
)

export function listSchoolsByCity(cityKey) {
  return schoolsByCity.get(cityKey) || []
}

export function getCityKeyFromSchoolName(name) {
  const wanted = normalizeText(name)
  if (!wanted) return ''

  for (const [cityKey, list] of schoolsByCity.entries()) {
    if (list.some((item) => normalizeText(item.name) === wanted)) {
      return cityKey
    }
  }

  return ''
}

export function isSchoolInCity(schoolName, cityKey) {
  const list = listSchoolsByCity(cityKey)
  const wanted = normalizeText(schoolName)
  if (!wanted) return false
  return list.some((item) => normalizeText(item.name) === wanted)
}
