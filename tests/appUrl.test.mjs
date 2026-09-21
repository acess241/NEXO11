import test from 'node:test'
import assert from 'node:assert/strict'
import {
  criarUrlDoApp,
  obterUrlRecuperacao,
  restaurarRotaDoFallback,
} from '../src/lib/appUrl.js'

test('monta a URL de recuperacao respeitando a base do GitHub Pages', () => {
  const location = { origin: 'https://acess241.github.io' }
  assert.equal(
    obterUrlRecuperacao(location, '/NEXO11/'),
    'https://acess241.github.io/NEXO11/reset-senha'
  )
})

test('monta URLs locais sem duplicar barras', () => {
  const location = { origin: 'http://localhost:5173' }
  assert.equal(criarUrlDoApp('/auth', location, '/'), 'http://localhost:5173/auth')
})

test('restaura rota interna e preserva o hash de autenticacao', () => {
  let destino = ''
  const location = {
    search: '?__nexo_path=%2Freset-senha%3Forigem%3Demail',
    hash: '#access_token=segredo&type=recovery',
  }
  const history = {
    replaceState(_state, _title, url) {
      destino = url
    },
  }

  assert.equal(restaurarRotaDoFallback(location, history, '/NEXO11/'), true)
  assert.equal(
    destino,
    '/NEXO11/reset-senha?origem=email#access_token=segredo&type=recovery'
  )
})

test('nao altera a URL quando nao veio do fallback', () => {
  const history = { replaceState() { throw new Error('nao deveria ser chamado') } }
  assert.equal(restaurarRotaDoFallback({ search: '' }, history, '/NEXO11/'), false)
})
