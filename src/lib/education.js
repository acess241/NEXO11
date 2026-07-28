export const DEFAULT_INSTITUTION_ID = '3f646a7f-8077-49ce-98f2-98f3d8ae20fe'
export const DEFAULT_INSTITUTION_NAME =
  'CENTRO TERRITORIAL DE EDUCACAO PROFISSIONAL DO SERTAO DO SAO FRANCISCO II ANTONIO CONSELHEIRO'
export const DEFAULT_INSTITUTION_SHORT_NAME =
  'CETEP Sertao do São Francisco II - Antonio Conselheiro'

export function normalizarMatricula(valor) {
  return (valor || '')
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9.-]/g, '')
    .slice(0, 40)
}

export function mascararMatricula(valor) {
  const matricula = normalizarMatricula(valor)

  if (!matricula) {
    return ''
  }

  if (matricula.length <= 4) {
    return matricula
  }

  return `${matricula.slice(0, 2)}${'*'.repeat(Math.max(1, matricula.length - 4))}${matricula.slice(-2)}`
}

export function nomeInstituicaoCurto(valor) {
  if (!valor) {
    return DEFAULT_INSTITUTION_SHORT_NAME
  }

  if (valor.length <= 70) {
    return valor
  }

  return `${valor.slice(0, 67)}...`
}
