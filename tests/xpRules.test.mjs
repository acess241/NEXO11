import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateActivityXp, correctionDelta, walletState } from '../src/lib/xpRules.js'

test('nota 8 de 10 em 100 XP concede 80', () => {
  assert.deepEqual(calculateActivityXp({ maxXp: 100, mode: 'proportional', grade: 8 }), { baseXp: 80, penaltyPercentage: 0, finalXp: 80 })
})

test('atraso de 10% sobre 80 XP resulta em 72', () => {
  assert.equal(calculateActivityXp({ maxXp: 100, mode: 'proportional', grade: 8, isLate: true, latePolicy: 'minus_10' }).finalXp, 72)
})

test('nova correção movimenta apenas a diferença', () => {
  assert.equal(correctionDelta(60, 85, 'replace').delta, 25)
})

test('regra manter maior não retira XP', () => {
  assert.deepEqual(correctionDelta(85, 70, 'keep_highest'), { previousXp: 85, finalXp: 85, delta: 0 })
})

test('regra substituir retira apenas a diferença', () => {
  assert.equal(correctionDelta(85, 70, 'replace').delta, -15)
})

test('XP manual fora do limite é bloqueado', () => {
  assert.throws(() => calculateActivityXp({ maxXp: 100, mode: 'manual', manualXp: 101 }), /inválido/)
})

test('saldo reservado não pode superar saldo total', () => {
  assert.throws(() => walletState(100, 101), /inválido/)
  assert.deepEqual(walletState(1000, 600), { total: 1000, reserved: 600, available: 400 })
})
