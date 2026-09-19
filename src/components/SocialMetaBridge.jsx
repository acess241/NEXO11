import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { criarLinkPublicacao } from '../lib/share'
import { lerLegendaStory } from '../lib/storyRepost'
import { supabase } from '../lib/supabase'

const META_FIELDS = [
  ['property', 'og:type'],
  ['property', 'og:title'],
  ['property', 'og:description'],
  ['property', 'og:url'],
  ['property', 'og:image'],
  ['property', 'og:image:secure_url'],
  ['property', 'og:image:alt'],
  ['name', 'description'],
  ['name', 'twitter:title'],
  ['name', 'twitter:description'],
  ['name', 'twitter:image'],
]

function seletorMeta(atributo, valor) {
  return `meta[${atributo}="${valor}"]`
}

function obterMeta(atributo, valor) {
  return document.head.querySelector(seletorMeta(atributo, valor))
}

function definirMeta(atributo, valor, conteudo) {
  if (!conteudo) return
  let elemento = obterMeta(atributo, valor)
  if (!elemento) {
    elemento = document.createElement('meta')
    elemento.setAttribute(atributo, valor)
    document.head.appendChild(elemento)
  }
  elemento.setAttribute('content', conteudo)
}

function resumirTexto(texto, limite = 180) {
  const limpo = String(texto || '').replace(/\s+/g, ' ').trim()
  if (limpo.length <= limite) return limpo
  return `${limpo.slice(0, limite - 1).trim()}…`
}

function obterTipoDoLink(searchParams) {
  if (searchParams.get('story')) return { chave: 'story', id: searchParams.get('story') }
  if (searchParams.get('nexis')) return { chave: 'nexis', id: searchParams.get('nexis') }
  if (searchParams.get('post')) return { chave: 'post', id: searchParams.get('post') }
  return null
}

export default function SocialMetaBridge() {
  const location = useLocation()

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search)
    const linkInfo = obterTipoDoLink(searchParams)
    const tituloAnterior = document.title
    const canonical = document.head.querySelector('link[rel="canonical"]')
    const canonicalAnterior = canonical?.getAttribute('href') || ''
    const valoresAnteriores = new Map(
      META_FIELDS.map(([atributo, valor]) => [
        `${atributo}:${valor}`,
        obterMeta(atributo, valor)?.getAttribute('content'),
      ])
    )
    let desmontado = false

    function restaurarMetadados() {
      META_FIELDS.forEach(([atributo, valor]) => {
        const anterior = valoresAnteriores.get(`${atributo}:${valor}`)
        const elemento = obterMeta(atributo, valor)
        if (anterior == null) elemento?.remove()
        else definirMeta(atributo, valor, anterior)
      })
      if (canonical && canonicalAnterior) canonical.setAttribute('href', canonicalAnterior)
      document.title = tituloAnterior
    }

    if (!linkInfo?.id) {
      return restaurarMetadados
    }

    async function carregarPublicacao() {
      try {
        const consulta = linkInfo.chave === 'story'
          ? supabase.from('stories').select('*').eq('id', linkInfo.id).maybeSingle()
          : supabase.from('posts').select('*').eq('id', linkInfo.id).maybeSingle()
        const { data: publicacao, error } = await consulta
        if (error || !publicacao || desmontado) return

        const { data: perfil } = await supabase
          .from('profiles')
          .select('nome, username')
          .eq('id', publicacao.profile_id)
          .maybeSingle()

        const autor = perfil?.nome || (perfil?.username ? `@${perfil.username}` : 'alguém da comunidade')
        const legendaStory = linkInfo.chave === 'story' ? lerLegendaStory(publicacao.caption).caption : ''
        const texto = publicacao.content || legendaStory || publicacao.text || ''
        const tipo = linkInfo.chave === 'story' ? 'Story' : linkInfo.chave === 'nexis' ? 'Nexis' : 'Publicação'
        const titulo = texto ? `${tipo} de ${autor}: ${resumirTexto(texto, 88)}` : `${tipo} de ${autor} no NEXO 11`
        const descricao = texto ? resumirTexto(texto) : `Confira este ${tipo.toLowerCase()} no NEXO 11.`
        const imagemPadrao = obterMeta('property', 'og:image')?.getAttribute('content') || ''
        const ehVideo = publicacao.media_kind === 'video' || publicacao.post_type === 'nexis'
        const imagem = !ehVideo && publicacao.media_url ? publicacao.media_url : imagemPadrao
        const url = criarLinkPublicacao(linkInfo.id, linkInfo.chave)

        definirMeta('property', 'og:type', 'article')
        definirMeta('property', 'og:title', titulo)
        definirMeta('property', 'og:description', descricao)
        definirMeta('property', 'og:url', url)
        definirMeta('property', 'og:image', imagem)
        definirMeta('property', 'og:image:secure_url', imagem)
        definirMeta('property', 'og:image:alt', `Imagem da publicação no NEXO 11`)
        definirMeta('name', 'description', descricao)
        definirMeta('name', 'twitter:title', titulo)
        definirMeta('name', 'twitter:description', descricao)
        definirMeta('name', 'twitter:image', imagem)
        if (canonical) canonical.setAttribute('href', url)
        document.title = titulo
      } catch {
        // O link continua compartilhável mesmo quando a leitura pública demora ou falha.
      }
    }

    void carregarPublicacao()
    return () => {
      desmontado = true
      restaurarMetadados()
    }
  }, [location.search])

  return null
}
