import { supabase } from './supabase'

export function extrairCaminhoStorage(url, bucket = 'stories') {
  if (!url) return null
  const marcadorPublico = `/storage/v1/object/public/${bucket}/`
  const marcadorAssinado = `/storage/v1/object/sign/${bucket}/`
  try {
    const parsed = new URL(url)
    const marcador = parsed.pathname.includes(marcadorPublico) ? marcadorPublico : marcadorAssinado
    const indice = parsed.pathname.indexOf(marcador)
    return indice >= 0 ? decodeURIComponent(parsed.pathname.slice(indice + marcador.length)) : null
  } catch {
    return null
  }
}

export async function criarUrlAssinadaParaMidia(url, bucket = 'stories') {
  const caminho = extrairCaminhoStorage(url, bucket)
  if (!caminho) return null
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(caminho, 3600)
  if (error) return null
  return data?.signedUrl || null
}
