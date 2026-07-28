export function calculateActivityXp({ maxXp, mode, grade, maxGrade = 10, manualXp, isLate = false, latePolicy = 'none' }) {
  const maximum = Number(maxXp)
  if (!Number.isFinite(maximum) || maximum <= 0) throw new Error('XP máximo inválido')
  let base
  if (mode === 'full') base = maximum
  else if (mode === 'manual') {
    base = Number(manualXp)
    if (!Number.isFinite(base) || base < 0 || base > maximum) throw new Error('XP manual inválido')
  } else {
    const score = Number(grade)
    const scale = Number(maxGrade)
    if (!Number.isFinite(score) || !Number.isFinite(scale) || scale <= 0 || score < 0 || score > scale) throw new Error('Nota inválida')
    base = Math.round(maximum * (score / scale))
  }
  const penaltyPercentage = isLate && latePolicy === 'minus_10' ? 10 : isLate && latePolicy === 'minus_25' ? 25 : 0
  return { baseXp: base, penaltyPercentage, finalXp: Math.round(base * (100 - penaltyPercentage) / 100) }
}

export function correctionDelta(previousXp, nextXp, lowerPolicy = 'keep_highest') {
  const previous = Number(previousXp)
  let next = Number(nextXp)
  if (lowerPolicy === 'keep_highest' && next < previous) next = previous
  return { previousXp: previous, finalXp: next, delta: next - previous }
}

export function walletState(total, reserved) {
  const t = Number(total); const r = Number(reserved)
  if (t < 0 || r < 0 || r > t) throw new Error('Saldo inválido')
  return { total: t, reserved: r, available: t - r }
}
