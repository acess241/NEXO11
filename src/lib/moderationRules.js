const LEET = Object.freeze({ '0': 'o', '1': 'i', '2': 'z', '3': 'e', '4': 'a', '5': 's', '6': 'g', '7': 't', '8': 'b', '9': 'g' })

function semAcentos(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function reduzirRepeticoes(value) {
  return value.replace(/([a-z0-9])\1{2,}/g, '$1')
}

export function normalizeModerationText(value) {
  const base = semAcentos(String(value || '').normalize('NFKC').replace(/[\u200B-\u200D\u2060\uFEFF]/g, '').toLowerCase())
    .replace(/[0-9]/g, (digit) => LEET[digit] || digit)
    .replace(/[@]/g, 'a').replace(/[$]/g, 's').replace(/(?<=[a-z0-9])!(?=[a-z0-9])/g, 'i')
  const words = reduzirRepeticoes(base.replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim())
  return { words, compact: words.replace(/\s/g, '') }
}

const VULGAR_WORDS = new Set(`buceta bucetinha bucetao bucetona cona cuzinho cuzao cuzão cuzona foder fode fodeu fodendo foda fodase fudido fudida fudendo fudeu fuder pica picas pinto piroca piroquinha rola roludo caralho caralhada caralhinho cacete caceta caceteiro punheta punhetao punheteiro punheteira siririca merda merdinha merdao bosta bostinha cagada cagado cagadao cagando cagar caguei cagou coco mijo mijar mijando mijou mijado porra porrada puta puto putaria putinha putona putao pqp desgraca desgraçado desgraçada maldito maldita inferno diabo demonio arrombado arrombada vadia vadio piranha piranho rameira rameiro prostituta prostituto`.split(/\s+/).map((word) => semAcentos(word)))
const INSULT_WORDS = new Set(`babaca babacao idiota imbecil estupido estupida burro burra burrao otario otaria cretino cretina inutil idiotao nojento nojenta escroto escrota canalha safado safada safadao vagabundo vagabunda lazarento lazarenta miseravel verme traste energumeno paspalho paspalha palhaco palhaca mane mongolao corno corna cornudo cornuda chifrudo chifruda`.split(/\s+/).map((word) => semAcentos(word)))
const FAMILY_INSULTS = ['filho da puta', 'filha da puta', 'filhos da puta', 'filhas da puta', 'filhodaputa', 'filhadaputa', 'fdp']
const VULGAR_PHRASES = ['puta que pariu', 'porra nenhuma']

function tokenMatch(words, dictionary) {
  return words.split(' ').some((token) => dictionary.has(token))
}

const RULES = [
  { category: 'critical_illegal', level: 4, confidence: 0.98, patterns: [/pornografia infantil/, /nude[sz].{0,18}(crianca|menor)/, /exploracao sexual/, /aliciar.{0,20}(crianca|menor)/] },
  { category: 'self_harm', level: 3, confidence: 0.94, patterns: [/se mat(e|a)/, /vou me matar/, /quero morrer/, /automutila/] },
  { category: 'threat', level: 3, confidence: 0.94, patterns: [/vou te matar/, /vou matar voce/, /vou te bater/, /vou acabar com voce/, /morte pra voce/] },
  { category: 'hate_speech', level: 3, confidence: 0.92, patterns: [/morte aos?/, /tem que exterminar/, /odio (de|a) (negro|gay|trans|judeu|mulher)/] },
  { category: 'sexual', level: 3, confidence: 0.91, patterns: [/manda nude/, /foto pelad[ao]/, /sexo com menor/, /conteudo sexual/] },
  { category: 'crime', level: 3, confidence: 0.9, patterns: [/como (roubar|invadir|hackear)/, /vender arma/, /traficar droga/] },
  { category: 'bullying_harassment', level: 2, confidence: 0.9, patterns: [/voce e (burro|idiota|inutil|nojento)/, /ninguem gosta de voce/, /vai se foder/, /vaisefoder/, /vai tomar no cu/] },
  { category: 'personal_data', level: 2, confidence: 0.89, patterns: [/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/, /minha senha e/, /meu endereco e/] },
  { category: 'suspicious_link', level: 2, confidence: 0.84, patterns: [/(bit\.ly|tinyurl\.com|t\.me\/|discord\.gg\/)/, /https?:\/\/[^ ]+\.(zip|exe|apk)(\b|\/)/] },
  { category: 'inappropriate_language', level: 1, confidence: 0.82, patterns: [/\b(porra|caralho|merda|foder|fodase|foda se)\b/, /vaisefoder/] },
]

export function analyzeText(value, { recentTexts = [] } = {}) {
  const original = String(value || '').trim()
  if (!original) return { decision: 'allow', level: 0, confidence: 1, category: null }
  const normalized = normalizeModerationText(original)
  const haystacks = [normalized.words, normalized.compact]
  let match = RULES.find((rule) => rule.patterns.some((pattern) => haystacks.some((text) => pattern.test(text)))) || null
  const hasFamilyInsult = FAMILY_INSULTS.some((phrase) => haystacks.some((text) => text.includes(phrase.replace(/\s/g, text === normalized.compact ? '' : ' '))))
  const hasDirectedInsult = tokenMatch(normalized.words, INSULT_WORDS) && /\b(voce|tu|seu|sua|esse|essa|ele|ela)\b/.test(normalized.words)
  if (!match && (hasFamilyInsult || hasDirectedInsult)) match = { category: 'bullying_harassment', level: 2, confidence: 0.9 }
  const hasVulgarPhrase = VULGAR_PHRASES.some((phrase) => normalized.words.includes(phrase) || normalized.compact.includes(phrase.replace(/\s/g, '')))
  if (!match && (hasVulgarPhrase || tokenMatch(normalized.words, VULGAR_WORDS) || tokenMatch(normalized.words, INSULT_WORDS))) match = { category: 'inappropriate_language', level: 1, confidence: 0.84 }
  const sameRecent = recentTexts.filter((item) => normalizeModerationText(item).compact === normalized.compact).length
  if (!match && original.length >= 4 && sameRecent >= 2) match = { category: 'spam', level: 2, confidence: 0.9 }
  if (!match) return { decision: 'allow', level: 0, confidence: 0.99, category: null }
  if (match.level === 1) return { ...match, decision: 'edit', normalized: normalized.words }
  if (match.confidence < 0.88) return { ...match, decision: 'review', normalized: normalized.words }
  return { ...match, decision: 'block', normalized: normalized.words }
}
