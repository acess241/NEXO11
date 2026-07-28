function sanitizeText(value) {
  return `${value || ''}`
    .replace(/\u0000/g, '')
    .replace(/\r/g, '')
    .trim()
}

const LOWERCASE_CONNECTORS = new Set(['da', 'de', 'do', 'das', 'dos', 'e'])

export function formatDisplayName(value) {
  const clean = sanitizeText(value).replace(/\s+/g, ' ')
  if (!clean) return ''

  return clean
    .split(' ')
    .map((word, index) => {
      const lower = word.toLocaleLowerCase('pt-BR')
      if (index > 0 && LOWERCASE_CONNECTORS.has(lower)) return lower
      return `${lower.charAt(0).toLocaleUpperCase('pt-BR')}${lower.slice(1)}`
    })
    .join(' ')
}
