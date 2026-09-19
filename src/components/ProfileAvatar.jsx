import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { criarUrlAssinadaParaMidia } from '../lib/storageMedia'

const avatarUrlCache = new Map()

function normalizarUrlFoto(src) {
  if (!src) return ''
  if (/^https?:\/\//i.test(src)) return src

  const { data } = supabase.storage.from('stories').getPublicUrl(src)
  return data?.publicUrl || src
}

function obterInicial(nome = '') {
  const texto = String(nome || '').trim()
  return texto ? texto.charAt(0).toUpperCase() : 'N'
}

export default function ProfileAvatar({
  src,
  name,
  alt = '',
  className = '',
  fallbackClassName = '',
}) {
  const urlInicial = useMemo(() => normalizarUrlFoto(src), [src])
  const [url, setUrl] = useState(urlInicial)
  const [mostrarFallback, setMostrarFallback] = useState(!urlInicial)
  const [tentouRecuperar, setTentouRecuperar] = useState(false)

  useEffect(() => {
    setUrl(urlInicial)
    setMostrarFallback(!urlInicial)
    setTentouRecuperar(false)
  }, [urlInicial])

  async function recuperarFoto() {
    if (tentouRecuperar || !urlInicial) {
      setMostrarFallback(true)
      return
    }

    setTentouRecuperar(true)
    const cache = avatarUrlCache.get(urlInicial)
    if (cache && cache.expiresAt > Date.now()) {
      setUrl(cache.url)
      setMostrarFallback(false)
      return
    }

    const assinada = await criarUrlAssinadaParaMidia(urlInicial, 'stories')
    if (assinada && assinada !== urlInicial) {
      avatarUrlCache.set(urlInicial, { url: assinada, expiresAt: Date.now() + 50 * 60 * 1000 })
      setUrl(assinada)
      setMostrarFallback(false)
      return
    }

    setMostrarFallback(true)
  }

  if (mostrarFallback) {
    return (
      <span
        className={`profile-avatar-fallback ${className} ${fallbackClassName}`.trim()}
        aria-label={alt || name || 'Perfil'}
      >
        {obterInicial(name)}
      </span>
    )
  }

  return (
    <img
      className={className}
      src={url}
      alt={alt || name || 'Perfil'}
      loading="lazy"
      decoding="async"
      onError={recuperarFoto}
    />
  )
}
