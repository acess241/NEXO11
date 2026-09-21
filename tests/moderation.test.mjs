import test from 'node:test'
import assert from 'node:assert/strict'
import { analyzeText, normalizeModerationText } from '../src/lib/moderationRules.js'

test('reconhece tentativa de burlar com numeros e espacos', () => {
  const result = analyzeText('v4i s3 f0d3r')
  assert.equal(result.decision, 'block')
  assert.equal(result.category, 'bullying_harassment')
})

test('linguagem leve pede edicao em vez de punicao automatica', () => {
  const result = analyzeText('essa prova está uma merda')
  assert.equal(result.decision, 'edit')
  assert.equal(result.level, 1)
})

test('palavra parecida em contexto inocente nao e bloqueada', () => {
  assert.equal(analyzeText('Estudamos a caralha, uma planta marinha.').decision, 'allow')
})

test('ameaca direta e bloqueada como grave', () => {
  const result = analyzeText('eu vou te matar amanhã')
  assert.equal(result.decision, 'block')
  assert.equal(result.level, 3)
})

test('mensagem repetida vira spam somente depois de reincidencia', () => {
  const result = analyzeText('clique aqui agora', { recentTexts: ['clique aqui agora', 'clique aqui agora'] })
  assert.equal(result.category, 'spam')
  assert.equal(result.decision, 'block')
})

test('normalizacao preserva palavras para analise contextual', () => {
  assert.deepEqual(normalizeModerationText('V0CÊ   É!'), { words: 'voce e', compact: 'vocee' })
})

test('remove invisiveis e reduz repeticoes usadas para burlar', () => {
  assert.equal(analyzeText('p\u200boooooorr4').decision, 'edit')
})

test('novo dicionario reconhece insulto direto sem punir substring inocente', () => {
  assert.equal(analyzeText('você é um imbecil').decision, 'block')
  assert.equal(analyzeText('estudamos ocupação e paulistas').decision, 'allow')
})
