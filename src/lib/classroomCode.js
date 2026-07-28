function sanitizeText(value) {
  return `${value || ''}`
    .replace(/\u0000/g, '')
    .replace(/\r/g, '')
    .trim()
}

function normalizeDashes(value) {
  return `${value || ''}`.replace(/[\u2010-\u2015\u2212_]+/g, '-')
}

export function normalizeClassroomCode(value, options = {}) {
  const forcePrefix = options?.forcePrefix !== false
  const cleaned = normalizeDashes(sanitizeText(value))
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')

  if (!cleaned) return ''

  let normalized = cleaned

  if (normalized.startsWith('NEXO') && !normalized.startsWith('NEXO-')) {
    normalized = `NEXO-${normalized.slice(4)}`
  }

  if (forcePrefix && normalized && !normalized.startsWith('NEXO-')) {
    normalized = `NEXO-${normalized}`
  }

  normalized = normalized
    .replace(/-+/g, '-')
    .replace(/^NEXO--+/, 'NEXO-')
    .replace(/^-+|-+$/g, '')

  if (normalized === 'NEXO') {
    return 'NEXO-'
  }

  return normalized
}

export function normalizeClassroomCodeKey(value) {
  const normalized = normalizeClassroomCode(value, { forcePrefix: false })
  const key = normalized.replace(/[^A-Z0-9]/g, '')
  if (key.startsWith('NEXO') && key.length > 4) return key.slice(4)
  return key
}

export function extractClassroomCode(value) {
  const cleaned = normalizeDashes(sanitizeText(value)).toUpperCase()
  if (!cleaned) return ''

  const compact = cleaned.replace(/\s+/g, ' ')
  const tokenWithNexo = compact.match(/NEXO[\s-]*[A-Z0-9-]+/)
  if (tokenWithNexo?.[0]) {
    return normalizeClassroomCode(tokenWithNexo[0])
  }

  const tokenWithHyphen = compact.match(/[A-Z0-9]+(?:[\s-]*[A-Z0-9]+)+/)
  if (tokenWithHyphen?.[0]) {
    return normalizeClassroomCode(tokenWithHyphen[0].replace(/\s+/g, ''))
  }

  const fallback = compact.match(/[A-Z0-9]{6,}/)
  return normalizeClassroomCode(fallback?.[0] || '')
}
