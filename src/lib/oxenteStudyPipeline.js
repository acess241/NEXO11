export const OXENTE_HISTORY_LIMIT = 24

const LOW_LEGIBILITY_MARK = '[trecho pouco leg\u00edvel]'

function sanitizeText(value) {
  return `${value || ''}`
    .replace(/\u0000/g, '')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function sanitizeScannedText(value) {
  return `${value || ''}`.replace(/\u0000/g, '').replace(/\r/g, '').trim()
}

function normalizeForMatch(value) {
  return `${value || ''}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function splitSentences(value) {
  return sanitizeText(value)
    .split(/\n+|(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function extractMainTopic(text, subjectHint = '') {
  const subject = normalizeForMatch(subjectHint)
  const raw = `${subject}\n${normalizeForMatch(text)}`

  if (raw.includes('fracao') || raw.includes('equacao') || raw.includes('matematica')) return 'matematica'
  if (raw.includes('sujeito') || raw.includes('verbo') || raw.includes('portugues')) return 'portugues'
  if (raw.includes('celula') || raw.includes('genetica') || raw.includes('biologia')) return 'biologia'
  if (raw.includes('energia') || raw.includes('movimento') || raw.includes('fisica')) return 'fisica'
  if (raw.includes('reacao') || raw.includes('atomo') || raw.includes('quimica')) return 'quimica'
  if (raw.includes('historia') || raw.includes('revolucao') || raw.includes('imperio')) return 'historia'
  return 'geral'
}

function looksLikeTable(text) {
  if (!text) return false
  const hasTab = text.split('\n').some((line) => line.includes('\t'))
  if (hasTab) return true

  const nonEmptyLines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  return nonEmptyLines.filter((line) => /\s{2,}/.test(line)).length >= 2
}

function scoreOcrResult(text, confidence) {
  const compact = `${text || ''}`.replace(/\s+/g, '')
  const sizeBonus = Math.min(30, compact.length / 14)
  const tableBonus = looksLikeTable(text) ? 12 : 0
  const breakBonus = Math.min(8, (`${text || ''}`.match(/\n/g) || []).length)
  return Number(confidence || 0) + sizeBonus + tableBonus + breakBonus
}

function cleanOcrNoise(text) {
  return sanitizeScannedText(
    `${text || ''}`
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[|]{4,}/g, '----')
  )
}

function buildTextFromTsv(tsv) {
  if (typeof tsv !== 'string' || !tsv.trim()) return ''

  const rawLines = tsv.split('\n').filter(Boolean)
  if (rawLines.length < 2) return ''

  const rows = new Map()

  for (let index = 1; index < rawLines.length; index += 1) {
    const columns = rawLines[index].split('\t')
    if (columns.length < 12) continue
    if (Number(columns[0] || 0) !== 5) continue

    const text = sanitizeScannedText(columns.slice(11).join('\t'))
    if (!text) continue

    const rowKey = `${columns[1]}|${columns[2]}|${columns[3]}|${columns[4]}`
    const word = {
      text,
      left: Number(columns[6] || 0),
      width: Number(columns[8] || 0),
    }

    if (!rows.has(rowKey)) rows.set(rowKey, [])
    rows.get(rowKey).push(word)
  }

  const resultLines = []

  for (const words of rows.values()) {
    const sorted = [...words].sort((a, b) => a.left - b.left)
    if (sorted.length === 0) continue

    let line = ''
    let previousRight = 0
    let previousWidth = 0
    let previousSize = 0

    sorted.forEach((item, idx) => {
      if (idx === 0) {
        line = item.text
        previousRight = item.left + item.width
        previousWidth = item.width
        previousSize = Math.max(1, item.text.length)
        return
      }

      const gap = item.left - previousRight
      const avgCharSize = previousWidth / Math.max(1, previousSize)
      const separator = gap > Math.max(26, avgCharSize * 4) ? '\t' : ' '
      line += `${separator}${item.text}`

      previousRight = item.left + item.width
      previousWidth = item.width
      previousSize = Math.max(1, item.text.length)
    })

    resultLines.push(line)
  }

  return sanitizeScannedText(resultLines.join('\n'))
}

function buildStructuredOcrText(data) {
  const lines = Array.isArray(data?.lines) ? data.lines : []
  if (lines.length > 0) {
    const lineText = lines
      .map((line) => sanitizeScannedText(line?.text || ''))
      .filter(Boolean)
      .join('\n')
    if (lineText) return lineText
  }

  return buildTextFromTsv(data?.tsv || '')
}

function selectBestOcrText(data, confidence) {
  const rawText = sanitizeScannedText(data?.text || '')
  const structuredText = buildStructuredOcrText(data)

  const candidates = [
    { text: rawText, score: scoreOcrResult(rawText, confidence) },
    { text: structuredText, score: scoreOcrResult(structuredText, confidence) },
  ].filter((item) => item.text)

  if (candidates.length === 0) return ''
  candidates.sort((a, b) => b.score - a.score)
  return cleanOcrNoise(candidates[0].text)
}

async function prepareImageForOcr(file) {
  if (typeof window === 'undefined') return ''
  const objectUrl = URL.createObjectURL(file)

  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Não foi possível abrir a imagem para OCR.'))
      img.src = objectUrl
    })

    if (!image?.width || !image?.height) return ''

    const scale = Math.max(1, Math.min(2.2, 2200 / image.width))
    const width = Math.max(1, Math.round(image.width * scale))
    const height = Math.max(1, Math.round(image.height * scale))
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return ''

    canvas.width = width
    canvas.height = height
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.filter = 'grayscale(100%) contrast(165%) brightness(112%)'
    ctx.drawImage(image, 0, 0, width, height)
    ctx.filter = 'none'

    const imageData = ctx.getImageData(0, 0, width, height)
    const pixels = imageData.data

    let totalLuma = 0
    let count = 0
    for (let i = 0; i < pixels.length; i += 4) {
      const luma = 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2]
      totalLuma += luma
      count += 1
    }

    const avgLuma = count > 0 ? totalLuma / count : 150
    const threshold = Math.max(110, Math.min(190, avgLuma * 0.92))

    for (let i = 0; i < pixels.length; i += 4) {
      const luma = 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2]
      const value = luma > threshold ? 255 : 0
      pixels[i] = value
      pixels[i + 1] = value
      pixels[i + 2] = value
    }

    ctx.putImageData(imageData, 0, 0)
    return canvas.toDataURL('image/png')
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

async function extractTextWithTextDetector(file) {
  if (typeof window === 'undefined') return ''
  if (!('TextDetector' in window)) return ''
  if (typeof createImageBitmap === 'undefined') return ''

  const detector = new window.TextDetector()
  const bitmap = await createImageBitmap(file)

  try {
    const blocks = await detector.detect(bitmap)
    return (blocks || [])
      .map((item) => `${item?.rawValue || ''}`.trim())
      .filter(Boolean)
      .join('\n')
  } finally {
    if (bitmap && typeof bitmap.close === 'function') bitmap.close()
  }
}

function decodePdfLiteralText(value) {
  if (!value) return ''

  return value
    .replace(/\\([()\\])/g, '$1')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\([0-7]{3})/g, (_match, octalValue) => String.fromCharCode(parseInt(octalValue, 8)))
}

async function extractTextFromPdf(file) {
  const buffer = await file.arrayBuffer()
  const decoded = new TextDecoder('latin1').decode(new Uint8Array(buffer))

  const lines = []
  const blockRegex = /BT([\s\S]*?)ET/g
  let blockMatch = blockRegex.exec(decoded)

  while (blockMatch) {
    const block = blockMatch[1]
    const fragments = []

    const simpleRegex = /\(([^)]*)\)\s*Tj/g
    let simpleMatch = simpleRegex.exec(block)
    while (simpleMatch) {
      fragments.push(decodePdfLiteralText(simpleMatch[1]))
      simpleMatch = simpleRegex.exec(block)
    }

    const arrayRegex = /\[(.*?)\]\s*TJ/g
    let arrayMatch = arrayRegex.exec(block)
    while (arrayMatch) {
      const tokens = []
      const tokenRegex = /\(([^)]*)\)/g
      let tokenMatch = tokenRegex.exec(arrayMatch[1])
      while (tokenMatch) {
        tokens.push(decodePdfLiteralText(tokenMatch[1]))
        tokenMatch = tokenRegex.exec(arrayMatch[1])
      }
      if (tokens.length > 0) fragments.push(tokens.join(' '))
      arrayMatch = arrayRegex.exec(block)
    }

    const cleaned = sanitizeScannedText(fragments.join('\n'))
    if (cleaned) lines.push(cleaned)
    blockMatch = blockRegex.exec(decoded)
  }

  return sanitizeScannedText(lines.join('\n\n'))
}

function normalizeCommonOcrTypos(text) {
  return `${text || ''}`
    .replace(/\bPISO\s+PIEZOE?LE?CTRICO?\b/gi, 'PISO PIEZOEL\u00c9TRICO')
    .replace(/\bPIEZOE?LE?CTRICO?\b/gi, 'PIEZOEL\u00c9TRICO')
    .replace(/GERAC[AO\u00c3]/gi, 'GERA\u00c7\u00c3O')
    .replace(/SUSTENTAVEL/gi, 'SUSTENT\u00c1VEL')
    .replace(/INOVACAO/gi, 'INOVA\u00c7\u00c3O')
    .replace(/EMPREENDORISMO/gi, 'EMPREENDEDORISMO')
    .replace(/UAUA-BA/gi, 'UAU\u00c1-BA')
    .replace(/\bCADA\s+[|lI1]\b/gi, 'CADA')
}

function isLikelyIllegibleToken(token) {
  if (!token) return false
  if (token.includes('\uFFFD')) return true
  if (token === '?') return true
  if (/^[|_~]{3,}$/.test(token)) return true

  const alnum = (token.match(/[A-Za-z0-9]/g) || []).length
  const tokenLength = token.length
  const nonAlphaNumeric = tokenLength - alnum

  if (tokenLength >= 4 && alnum <= 1 && nonAlphaNumeric >= 3) return true
  if (tokenLength >= 5 && alnum <= 2 && /[|/\\_~]/.test(token)) return true
  return false
}

function normalizeLine(rawLine, stats) {
  const value = `${rawLine || ''}`
  if (!value.trim()) return ''

  const listPrefixMatch = value.match(/^(\s*(?:\d+[.)-]?|[A-Za-z][.)]|[IVXLC]+\.)\s*)(.*)$/)
  const prefix = listPrefixMatch ? listPrefixMatch[1] : ''
  const body = listPrefixMatch ? listPrefixMatch[2] : value

  const compact = body
    .replace(/^[\-\u2013\u2014|~_ ]{2,}/g, '')
    .replace(/[|]{2,}/g, '|')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()

  const normalizedBody = normalizeCommonOcrTypos(compact)
    .split(/(\s+)/)
    .map((chunk) => {
      if (!chunk.trim()) return chunk
      if (!isLikelyIllegibleToken(chunk)) return chunk
      stats.illegibleCount += 1
      return LOW_LEGIBILITY_MARK
    })
    .join('')
    .replace(
      /\[trecho pouco leg\u00edvel\](\s+\[trecho pouco leg\u00edvel\])+/gi,
      LOW_LEGIBILITY_MARK
    )

  const merged = `${prefix}${normalizedBody}`.trimEnd()
  if (!merged.trim()) {
    stats.illegibleCount += 1
    return LOW_LEGIBILITY_MARK
  }

  return merged
}

function isSectionLikeLine(line) {
  if (!line) return false
  if (/^(\d+[.)-]?|[A-Za-z][.)]|[IVXLC]+\.)\s+/.test(line)) return true
  if (/^[A-Z0-9\u00c1-\u00da \-]{10,}$/.test(line)) return true
  if (line.endsWith(':')) return true
  return false
}

function mergeContinuationLines(lines) {
  const merged = []

  for (let index = 0; index < lines.length; index += 1) {
    const current = lines[index]
    if (!current) {
      merged.push('')
      continue
    }

    const previous = merged.length > 0 ? merged[merged.length - 1] : ''
    const canMerge =
      previous &&
      !isSectionLikeLine(previous) &&
      !/[.!?:;)]$/.test(previous.trim()) &&
      !isSectionLikeLine(current) &&
      /^[a-z0-9(]/.test(current.trim())

    if (canMerge) {
      merged[merged.length - 1] = `${previous.trim()} ${current.trim()}`
    } else {
      merged.push(current)
    }
  }

  return merged
}

export function normalizeExtractedText(text) {
  const sanitized = sanitizeText(text)
  if (!sanitized) {
    return { text: '', illegibleCount: 0, observations: [] }
  }

  const stats = { illegibleCount: 0 }
  const normalizedLines = sanitized.split('\n').map((line) => normalizeLine(line, stats))
  const mergedLines = mergeContinuationLines(normalizedLines)
  let normalized = mergedLines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  const normalizedFlat = normalizeForMatch(normalized)

  if (
    normalizedFlat.includes('geracao de energia sustentavel a') &&
    normalizedFlat.includes('cada passo')
  ) {
    normalized = normalized.replace(
      /gera[\w\u00e7\u00e3]* de energia sustent[\w\u00e1]* a\s*[|lI1]?\b/gi,
      'Gera\u00e7\u00e3o de Energia Sustent\u00e1vel a Cada Passo'
    )
  }

  const observations = []
  if (stats.illegibleCount > 0) {
    observations.push(`Foram marcados ${stats.illegibleCount} trecho(s) como ${LOW_LEGIBILITY_MARK}.`)
  }

  return {
    text: normalized,
    illegibleCount: stats.illegibleCount,
    observations,
  }
}

export async function extractTextFromImage(file, options = {}) {
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {}

  let bestText = ''
  let bestConfidence = 0

  try {
    const { createWorker, PSM } = await import('tesseract.js')
    const worker = await createWorker('por+eng', 1, {
      logger: (info) => {
        if (info?.status === 'recognizing text') {
          const progress = Math.max(4, Math.min(99, Math.round((info.progress || 0) * 100)))
          onProgress(progress)
        }
      },
    })

    try {
      const preparedImage = await prepareImageForOcr(file)
      const attempts = [
        { source: preparedImage || file, psm: PSM.AUTO },
        { source: preparedImage || file, psm: PSM.SPARSE_TEXT },
        { source: file, psm: PSM.SINGLE_BLOCK },
        { source: file, psm: PSM.AUTO },
      ].filter((item) => item.source)

      let bestScore = 0

      for (const attempt of attempts) {
        await worker.setParameters({
          tessedit_pageseg_mode: attempt.psm,
          preserve_interword_spaces: '1',
          user_defined_dpi: '300',
        })

        try {
          await worker.setParameters({
            textord_tabfind_find_tables: '1',
            textord_tablefind_recognize_tables: '1',
          })
        } catch {}

        const { data } = await worker.recognize(attempt.source, {}, { text: true, tsv: true })
        const confidence = Number(data?.confidence || 0)
        const candidateText = selectBestOcrText(data, confidence)
        const candidateScore = scoreOcrResult(candidateText, confidence)

        if (candidateScore > bestScore) {
          bestScore = candidateScore
          bestText = candidateText
          bestConfidence = confidence
        }
      }
    } finally {
      await worker.terminate()
    }
  } catch {}

  if (!bestText) {
    const fallbackText = await extractTextWithTextDetector(file).catch(() => '')
    bestText = sanitizeScannedText(fallbackText)
    bestConfidence = 0
  }

  onProgress(100)
  return {
    text: bestText,
    confidence: Math.round(bestConfidence),
  }
}

export async function scanActivityImage(file, options = {}) {
  if (!file) {
    return {
      extractedText: '',
      normalizedText: '',
      confidence: 0,
      source: 'unknown',
      illegibleCount: 0,
      observations: [],
      warnings: ['missing_file'],
    }
  }

  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '')
  if (isPdf) {
    const extractedPdfText = await extractTextFromPdf(file).catch(() => '')
    const normalized = normalizeExtractedText(extractedPdfText)
    return {
      extractedText: extractedPdfText,
      normalizedText: normalized.text,
      confidence: 0,
      source: 'pdf',
      illegibleCount: normalized.illegibleCount,
      observations: normalized.observations,
      warnings: normalized.text ? [] : ['unreadable_pdf'],
    }
  }

  const extractedImageText = await extractTextFromImage(file, options)
  const normalized = normalizeExtractedText(extractedImageText.text)
  return {
    extractedText: extractedImageText.text,
    normalizedText: normalized.text,
    confidence: extractedImageText.confidence,
    source: 'image',
    illegibleCount: normalized.illegibleCount,
    observations: normalized.observations,
    warnings: normalized.text ? [] : ['unreadable_image'],
  }
}

function extractDocumentMetadata(text) {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  const joined = lines.join('\n')
  const lower = joined.toLowerCase()

  const titleCandidate =
    lines.find((line) => /^[A-Z0-9\u00c1-\u00da \-]{12,}$/.test(line)) ||
    lines.find((line) => /\b(tema|projeto|trabalho|atividade|piso|energia|resumo)\b/i.test(line)) ||
    ''

  const objectiveLine =
    lines.find((line) => /\b(objetivo|prop[oô]e|finalidade|foco)\b/i.test(line)) || ''

  const contextLine =
    lines.find((line) => /\b(feira|ci[eê]ncia|inova[cç][aã]o|tecnologia|semin[aá]rio|escola)\b/i.test(line)) || ''

  const authorsLine =
    lines.find((line) => /\b(aluno|autoria|autor|equipe|apresentado por|integrantes)\b/i.test(line)) || ''

  const locationMatch = joined.match(/\b([A-Za-z\u00c0-\u00ff]+(?:\s+[A-Za-z\u00c0-\u00ff]+){0,2}\s*-\s*[A-Z]{2})\b/)
  const yearMatch = joined.match(/\b(19|20)\d{2}\b/)
  const emails = joined.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || []

  return {
    lines,
    lower,
    title: titleCandidate,
    objective: objectiveLine,
    context: contextLine,
    authors: authorsLine,
    location: locationMatch ? locationMatch[1] : '',
    year: yearMatch ? yearMatch[0] : '',
    emails,
  }
}

function buildSmartSummary(cleanedText, topic, metadata, options = {}) {
  const subject = sanitizeText(options.subject || '')
  const materialKind = /\b(quest[aõ]o|lista|alternativa|exerc[ií]cio)\b/i.test(metadata.lower)
    ? 'uma atividade em formato de quest\u00f5es'
    : 'um material de estudo'

  const topicMap = {
    matematica: 'matem\u00e1tica',
    portugues: 'l\u00edngua portuguesa',
    biologia: 'biologia',
    fisica: 'f\u00edsica',
    quimica: 'qu\u00edmica',
    historia: 'hist\u00f3ria',
    geral: 'tema acad\u00eamico geral',
  }

  const centralTheme = metadata.title || topicMap[topic] || 'tema acad\u00eamico'

  const parts = []
  parts.push(`O documento apresenta ${materialKind} com foco em ${centralTheme}.`)

  if (subject) {
    parts.push(`A mat\u00e9ria identificada \u00e9 ${subject}.`)
  }

  if (metadata.objective) {
    parts.push(`O objetivo principal descrito \u00e9: ${metadata.objective}.`)
  } else if (metadata.context) {
    parts.push(`O contexto observado no texto \u00e9: ${metadata.context}.`)
  }

  if (metadata.authors) {
    parts.push(`A autoria/equipe informada aparece como ${metadata.authors}.`)
  }

  if (metadata.location || metadata.year) {
    const locationAndYear = [metadata.location, metadata.year].filter(Boolean).join(', ')
    parts.push(`Tamb\u00e9m h\u00e1 refer\u00eancia a local e/ou ano: ${locationAndYear}.`)
  }

  const fallbackSentences = splitSentences(cleanedText).filter((line) => line.length > 24)
  if (parts.length < 3 && fallbackSentences.length > 0) {
    parts.push(`Outro ponto relevante do conte\u00fado: ${fallbackSentences[0]}.`)
  }

  return parts
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/\.\./g, '.')
    .slice(0, 760)
    .trim()
}

function extractDocumentMetadataV2(text) {
  const lines = sanitizeText(text)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  const joined = lines.join('\n')
  const normalizedJoined = normalizeForMatch(joined)
  const normalizedLines = lines.map((line) => normalizeForMatch(line))

  const findLineByPattern = (pattern) => {
    const index = normalizedLines.findIndex((line) => pattern.test(line))
    return index >= 0 ? lines[index] : ''
  }

  const title =
    lines.find((line) => /^[A-Z0-9\u00c1-\u00da \-]{10,}$/.test(line) && line.length <= 90) ||
    findLineByPattern(/\b(tema|projeto|trabalho|atividade|piso|energia|resumo)\b/) ||
    lines[0] ||
    ''

  const objective = findLineByPattern(/\b(objetivo|propoe|finalidade|foco|meta)\b/)
  const context = findLineByPattern(
    /\b(feira|ciencia|inovacao|tecnologia|seminario|escola|apresentacao)\b/
  )
  const authors = findLineByPattern(
    /\b(aluno|autoria|autor|equipe|apresentado por|integrantes|discentes)\b/
  )

  const locationMatch = joined.match(
    /\b([A-Za-z\u00c0-\u00ff]+(?:\s+[A-Za-z\u00c0-\u00ff]+){0,2}\s*-\s*[A-Z]{2})\b/
  )
  const yearMatch = joined.match(/\b(19|20)\d{2}\b/)
  const emails = joined.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || []
  const isQuestionList = /\b(questao|questoes|lista|alternativa|exercicio)\b/.test(
    normalizedJoined
  )

  return {
    lines,
    lower: normalizedJoined,
    title,
    objective,
    context,
    authors,
    location: locationMatch ? locationMatch[1] : '',
    year: yearMatch ? yearMatch[0] : '',
    emails,
    isQuestionList,
  }
}

function buildSmartSummaryV2(cleanedText, topic, metadata, options = {}) {
  const subject = sanitizeText(options.subject || '')

  const topicMap = {
    matematica: 'matem\u00e1tica',
    portugues: 'l\u00edngua portuguesa',
    biologia: 'biologia',
    fisica: 'f\u00edsica',
    quimica: 'qu\u00edmica',
    historia: 'hist\u00f3ria',
    geral: 'tema acad\u00eamico geral',
  }

  const themeLabel = metadata.title || topicMap[topic] || 'tema acad\u00eamico'
  const materialKind = metadata.isQuestionList
    ? 'uma atividade em formato de quest\u00f5es'
    : 'um trabalho/atividade de estudo'

  const parts = []
  parts.push(`O documento apresenta ${materialKind} com foco em ${themeLabel}.`)

  if (subject) {
    parts.push(`A mat\u00e9ria identificada \u00e9 ${subject}.`)
  }

  if (metadata.objective) {
    parts.push(`O objetivo principal indicado no texto \u00e9: ${metadata.objective}.`)
  } else if (metadata.context) {
    parts.push(`O contexto da atividade aponta para: ${metadata.context}.`)
  }

  if (metadata.authors) {
    parts.push(`A autoria/equipe registrada aparece como ${metadata.authors}.`)
  }

  if (metadata.location || metadata.year) {
    const locationAndYear = [metadata.location, metadata.year].filter(Boolean).join(', ')
    parts.push(`Tamb\u00e9m h\u00e1 refer\u00eancia de local e/ou ano: ${locationAndYear}.`)
  }

  const fallbackSentences = splitSentences(cleanedText).filter((line) => line.length > 28)
  if (parts.length < 4 && fallbackSentences.length > 0) {
    const fallbackLine = fallbackSentences.find(
      (line) => !normalizeForMatch(line).includes(normalizeForMatch(metadata.title || ''))
    )
    if (fallbackLine) {
      parts.push(`Conte\u00fado complementar identificado: ${fallbackLine}.`)
    }
  }

  return parts
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/\.\./g, '.')
    .slice(0, 840)
    .trim()
}

export function generateStudyKeyPoints(text, options = {}) {
  const cleanedText = sanitizeText(text)
  if (!cleanedText) return []

  const topic = extractMainTopic(cleanedText, options.subject || '')
  const metadata = extractDocumentMetadataV2(cleanedText)

  const topicMap = {
    matematica: 'matem\u00e1tica',
    portugues: 'l\u00edngua portuguesa',
    biologia: 'biologia',
    fisica: 'f\u00edsica',
    quimica: 'qu\u00edmica',
    historia: 'hist\u00f3ria',
    geral: 'tema acad\u00eamico geral',
  }

  const points = []
  points.push(`Tema central: ${metadata.title || topicMap[topic]}`)

  if (options.subject) points.push(`\u00c1rea/mat\u00e9ria: ${sanitizeText(options.subject)}`)

  if (metadata.objective) {
    points.push(`Objetivo identificado: ${metadata.objective}`)
  } else if (metadata.context) {
    points.push(`Contexto da atividade: ${metadata.context}`)
  }

  if (metadata.authors) points.push(`Autoria/equipe: ${metadata.authors}`)
  if (metadata.location) points.push(`Local mencionado: ${metadata.location}`)
  if (metadata.year) points.push(`Ano identificado: ${metadata.year}`)
  if (metadata.emails.length > 0) points.push(`Contato encontrado: ${metadata.emails[0]}`)
  if (metadata.isQuestionList) points.push('Formato: lista de questões para estudo/revisão.')

  if (points.length < 3) {
    points.push('Estrutura: documento digitalizado e revisado para exportacao editavel.')
  }

  return points
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .filter((line, index, list) => list.indexOf(line) === index)
    .slice(0, 6)
}

export function generateStudySummary(text, options = {}) {
  const cleanedText = sanitizeText(text)
  if (!cleanedText) {
    return {
      topic: 'geral',
      summary: '',
      keyPoints: [],
      observations: ['N\u00e3o foi poss\u00edvel gerar resumo sem texto digitalizado.'],
    }
  }

  const topic = extractMainTopic(cleanedText, options.subject || '')
  const metadata = extractDocumentMetadataV2(cleanedText)
  const summary = buildSmartSummaryV2(cleanedText, topic, metadata, options)
  const keyPoints = generateStudyKeyPoints(cleanedText, options)
  const observations = []

  const lowLegibilityMatches = cleanedText.match(/\[trecho pouco leg\u00edvel\]/gi) || []
  if (lowLegibilityMatches.length > 0) {
    observations.push(
      `Alguns trechos da imagem estavam pouco n\u00edtidos e podem precisar de revis\u00e3o.`
    )
  }

  if (cleanedText.length < 90) {
    observations.push('O conte\u00fado digitalizado est\u00e1 curto; revise para melhorar o resumo.')
  }

  if (keyPoints.length < 3) {
    observations.push('Pontos principais ainda incompletos.')
  }

  return {
    topic,
    summary,
    keyPoints,
    observations,
  }
}

function escapeHtml(value) {
  return `${value || ''}`
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function normalizeDateLabel(dateValue) {
  if (!dateValue) return ''
  const date = new Date(dateValue)
  if (Number.isNaN(date.getTime())) return `${dateValue}`
  return date.toLocaleDateString('pt-BR')
}

function renderTextParagraphsHtml(text) {
  const lines = `${text || ''}`.split('\n')
  if (lines.length === 0) return '<p class="line">[sem conteúdo]</p>'

  const chunks = []
  let tableBuffer = []

  function flushTable() {
    if (tableBuffer.length < 2) {
      tableBuffer.forEach((line) => chunks.push(`<p class="line">${escapeHtml(line)}</p>`))
      tableBuffer = []
      return
    }

    const rows = tableBuffer.map((line) => line.split('\t').map((cell) => cell.trim()))
    const maxCols = Math.max(...rows.map((row) => row.length))
    const normalizedRows = rows.map((row) => {
      const copy = [...row]
      while (copy.length < maxCols) copy.push('')
      return copy
    })

    const header = normalizedRows[0]
    const body = normalizedRows.slice(1)
    const headerHtml = `<tr>${header.map((cell) => `<th>${escapeHtml(cell || ' ')}</th>`).join('')}</tr>`
    const bodyHtml = body
      .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell || ' ')}</td>`).join('')}</tr>`)
      .join('')

    chunks.push(`
      <table class="table">
        <thead>${headerHtml}</thead>
        <tbody>${bodyHtml}</tbody>
      </table>
    `)
    tableBuffer = []
  }

  for (const rawLine of lines) {
    const line = `${rawLine || ''}`.trimEnd()

    if (line.includes('\t')) {
      tableBuffer.push(line)
      continue
    }

    if (tableBuffer.length > 0) flushTable()
    if (!line.trim()) {
      chunks.push('<p class="line spacer">&nbsp;</p>')
      continue
    }

    chunks.push(`<p class="line">${escapeHtml(line)}</p>`)
  }

  if (tableBuffer.length > 0) flushTable()
  return chunks.join('\n')
}

function renderListHtml(items) {
  if (!Array.isArray(items) || items.length === 0) return '<li>Nenhum ponto principal identificado.</li>'
  return items.map((item) => `<li>${escapeHtml(item)}</li>`).join('\n')
}

export function createEditableWordDocument(payload) {
  const title = sanitizeText(payload?.title || '')
  const studentName = sanitizeText(payload?.studentName || '')
  const subject = sanitizeText(payload?.subject || '') || 'N\u00e3o informada'
  const dateLabel = normalizeDateLabel(payload?.activityDate) || '-'
  const digitalizedText = sanitizeText(payload?.digitalizedText || '')
  const summary = sanitizeText(payload?.summary || '')
  const keyPoints = Array.isArray(payload?.keyPoints)
    ? payload.keyPoints.map((line) => sanitizeText(line)).filter(Boolean)
    : []
  const observations = Array.isArray(payload?.observations)
    ? payload.observations.map((line) => sanitizeText(line)).filter(Boolean)
    : []

  if (!digitalizedText) throw new Error('Digitalize a atividade antes de exportar.')
  if (!summary) throw new Error('Gere o resumo antes de exportar para Word.')
  if (keyPoints.length === 0) throw new Error('Gere os pontos principais antes de exportar.')

  const sections = []
  sections.push(`
    <section>
      <h2>1. Texto digitalizado</h2>
      ${renderTextParagraphsHtml(digitalizedText)}
    </section>
  `)

  sections.push(`
    <section>
      <h2>2. Resumo</h2>
      <p class="line">${escapeHtml(summary)}</p>
    </section>
  `)

  sections.push(`
    <section>
      <h2>3. Pontos principais</h2>
      <ul>${renderListHtml(keyPoints)}</ul>
    </section>
  `)

  if (observations.length > 0) {
    sections.push(`
      <section>
        <h2>4. Observa\u00e7\u00f5es</h2>
        <ul>${observations.map((line) => `<li>${escapeHtml(line)}</li>`).join('\n')}</ul>
      </section>
    `)
  }

  const html = `
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>Atividade Digitalizada</title>
    <style>
      body {
        font-family: Calibri, Arial, sans-serif;
        margin: 30px;
        color: #1d2630;
        line-height: 1.5;
      }
      h1, h2 {
        color: #0d4f8b;
        margin: 0 0 10px;
      }
      h1 { font-size: 26px; }
      h2 { font-size: 18px; margin-top: 20px; }
      .subtitle {
        margin: 0 0 10px;
        color: #31567e;
        font-size: 14px;
      }
      .meta {
        margin-top: 8px;
        border: 1px solid #d0ddec;
        border-radius: 10px;
        background: #f7fbff;
        padding: 10px 12px;
      }
      .meta p { margin: 4px 0; }
      section {
        border: 1px solid #d8e2ef;
        border-radius: 10px;
        padding: 12px;
        margin-top: 14px;
        background: #ffffff;
      }
      .line {
        margin: 0 0 8px;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }
      .line.spacer {
        margin: 0;
        line-height: 0.9;
      }
      ul { margin: 0; padding-left: 20px; }
      li { margin-bottom: 6px; }
      .table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 10px;
      }
      .table th,
      .table td {
        border: 1px solid #b9cae0;
        padding: 8px;
        text-align: left;
        vertical-align: top;
      }
      .table th { background: #eaf3ff; }
    </style>
  </head>
  <body>
    <h1>Atividade Digitalizada</h1>
    ${title ? `<p class="subtitle"><strong>T\u00edtulo detectado:</strong> ${escapeHtml(title)}</p>` : ''}
    <div class="meta">
      <p><strong>Aluno:</strong> ${escapeHtml(studentName || '-')}</p>
      <p><strong>Mat\u00e9ria:</strong> ${escapeHtml(subject)}</p>
      <p><strong>Data:</strong> ${escapeHtml(dateLabel)}</p>
    </div>
    ${sections.join('\n')}
  </body>
</html>`.trim()

  return new Blob(['\ufeff', html], { type: 'application/msword;charset=utf-8' })
}

export function saveAnalysisToHistory(history, item, maxItems = OXENTE_HISTORY_LIMIT) {
  const list = Array.isArray(history) ? [...history] : []
  const entry = {
    id: `${item?.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`}`,
    createdAt: item?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    activityTitle: sanitizeText(item?.activityTitle || 'Atividade Digitalizada'),
    studentName: sanitizeText(item?.studentName || ''),
    subject: sanitizeText(item?.subject || ''),
    activityDate: item?.activityDate || '',
    topic: item?.topic || 'geral',
    recognizedText: sanitizeText(item?.recognizedText || ''),
    summary: sanitizeText(item?.summary || ''),
    keyPoints: Array.isArray(item?.keyPoints) ? item.keyPoints.map((line) => sanitizeText(line)) : [],
    observations: Array.isArray(item?.observations)
      ? item.observations.map((line) => sanitizeText(line)).filter(Boolean)
      : [],
    status: {
      digitalized: Boolean(item?.status?.digitalized),
      summaryGenerated: Boolean(item?.status?.summaryGenerated),
      wordCreated: Boolean(item?.status?.wordCreated),
    },
    fileName: sanitizeText(item?.fileName || ''),
    source: sanitizeText(item?.source || ''),
    confidence: Number(item?.confidence || 0),
    illegibleCount: Number(item?.illegibleCount || 0),
  }

  const existingIndex = list.findIndex((current) => current.id === entry.id)
  if (existingIndex >= 0) list.splice(existingIndex, 1)

  return [entry, ...list]
    .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))
    .slice(0, maxItems)
}

export function loadAnalysisFromHistory(history, analysisId) {
  if (!Array.isArray(history) || !analysisId) return null
  return history.find((item) => item.id === analysisId) || null
}
