import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BottomNav from '../components/BottomNav'
import PostCard from '../components/PostCard'
import SocialLoader from '../components/SocialLoader'
import StoryBar from '../components/StoryBar'
import { supabase } from '../lib/supabase'
import logoNexo from '/logo-novo.png'

function IconeEstrela({ preenchida }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill={preenchida ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}

function IconeComentarios() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
      <path d="M8 9h8" />
      <path d="M8 13h5" />
    </svg>
  )
}

function IconeRepost() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="17 1 21 5 17 9" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <polyline points="7 23 3 19 7 15" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  )
}

function formatarData(dataIso) {
  const data = new Date(dataIso)

  return data.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function extrairCaminhoStorageStory(mediaUrl) {
  if (!mediaUrl) return null

  const marcador = '/storage/v1/object/public/stories/'

  try {
    const url = new URL(mediaUrl)
    const indice = url.pathname.indexOf(marcador)
    if (indice === -1) return null
    return decodeURIComponent(url.pathname.slice(indice + marcador.length))
  } catch {
    const indice = mediaUrl.indexOf(marcador)
    if (indice === -1) return null

    return decodeURIComponent(
      mediaUrl
        .slice(indice + marcador.length)
        .split('?')[0]
    )
  }
}

function montarComentarioLocal(perfil, comentario) {
  return {
    ...comentario,
    autor: {
      id: perfil.id,
      nome: perfil.nome,
      username: perfil.username,
      foto_url: perfil.foto_url,
    },
    totalCurtidas: 0,
    euCurti: false,
  }
}

function criarMapaPorId(lista) {
  return new Map((lista || []).map((item) => [item.id, item]))
}

function agruparPorCampo(lista, campo) {
  return (lista || []).reduce((mapa, item) => {
    const chave = item[campo]
    const grupoAtual = mapa.get(chave) || []
    grupoAtual.push(item)
    mapa.set(chave, grupoAtual)
    return mapa
  }, new Map())
}

function criarSetComposto(lista, montarChave) {
  return new Set((lista || []).map(montarChave))
}

function calcularPontuacaoRelevancia(post) {
  const idadeHoras = Math.max(
    1,
    (Date.now() - new Date(post.created_at).getTime()) / 3600000
  )
  const pesoEngajamento =
    post.totalCurtidas * 2 + post.totalComentarios * 3 + post.totalReposts * 4
  const pesoRecencia = 42 / Math.pow(idadeHoras + 2, 0.62)
  const bonusMidia = post.media_url ? 3 : 0
  const bonusVideo = post.post_type === 'nexis' ? 2 : 0

  return pesoEngajamento + pesoRecencia + bonusMidia + bonusVideo
}

function ordenarPostsPorRelevancia(posts) {
  return [...posts].sort((a, b) => {
    const scoreA = calcularPontuacaoRelevancia(a)
    const scoreB = calcularPontuacaoRelevancia(b)

    if (scoreA !== scoreB) {
      return scoreB - scoreA
    }

    return new Date(b.created_at) - new Date(a.created_at)
  })
}

function normalizarUsernameBase(valor) {
  return `${valor || ''}`
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9._]/g, '')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.+/, '')
    .replace(/\.+$/, '')
    .slice(0, 24)
}

function montarPerfilFallback(user) {
  const nomeMeta = `${user?.user_metadata?.nome || ''}`.trim()
  const nomeEmail = `${user?.email || ''}`.split('@')[0] || ''
  const nome = nomeMeta || nomeEmail || 'Usuário'
  const usernameMeta = normalizarUsernameBase(user?.user_metadata?.username)
  const username =
    usernameMeta || normalizarUsernameBase(nomeEmail) || `user${(user?.id || '').replace(/-/g, '').slice(0, 6)}`

  return {
    id: null,
    account_id: user?.id || null,
    nome,
    username: username || 'usuario',
    foto_url: null,
  }
}

export default function Feed() {
  const [posts, setPosts] = useState([])
  const [stories, setStories] = useState([])
  const [meuPerfil, setMeuPerfil] = useState(null)
  const [feedEmDescoberta, setFeedEmDescoberta] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [comentariosAbertos, setComentariosAbertos] = useState({})
  const [novoComentario, setNovoComentario] = useState({})
  const [respostaComentario, setRespostaComentario] = useState({})
  const [comentarioRespondendo, setComentarioRespondendo] = useState({})
  const [postParaApagar, setPostParaApagar] = useState(null)

  const navigate = useNavigate()

  useEffect(() => {
    carregarTudo()
  }, [])

  async function garantirPerfilUsuario(user) {
    try {
      const { data: perfilExistente, error: erroPerfil } = await supabase
        .from('profiles')
        .select('*')
        .eq('account_id', user.id)
        .maybeSingle()

      if (erroPerfil) throw erroPerfil
      if (perfilExistente) return perfilExistente

      const nomeBase =
        `${user?.user_metadata?.nome || user?.email?.split('@')?.[0] || 'Novo usuário'}`.trim() ||
        'Novo usuário'
      const sufixo = user.id.replace(/-/g, '').slice(0, 6)
      const usernameMeta = normalizarUsernameBase(user?.user_metadata?.username)
      const usernameBase = usernameMeta || `user${sufixo}`
      const usernameFinal = `${usernameBase}${usernameBase.endsWith(sufixo) ? '' : sufixo}`.slice(0, 30)

      const payloadCompleto = {
        account_id: user.id,
        nome: nomeBase,
        username: usernameFinal,
        bio: '',
        foto_url: null,
        institution_id: user?.user_metadata?.institution_id || null,
        institution_name: user?.user_metadata?.institution_name || null,
        enrollment_number: user?.user_metadata?.enrollment_number || null,
        role: user?.user_metadata?.role || 'student',
        teacher_subject: user?.user_metadata?.teacher_subject || null,
        teacher_school: user?.user_metadata?.teacher_school || null,
        teacher_registration: user?.user_metadata?.teacher_registration || null,
        teacher_department: user?.user_metadata?.teacher_department || null,
      }

      const usernameAlternativo = `user${user.id.replace(/-/g, '').slice(0, 10)}`
      const tentarInserir = async (payload) => {
        const tentativa = await supabase.from('profiles').insert(payload)
        return tentativa.error || null
      }

      let erroInsercao = await tentarInserir(payloadCompleto)

      if (erroInsercao && /duplicate key|unique|username/i.test(`${erroInsercao.message || ''}`)) {
        erroInsercao = await tentarInserir({
          ...payloadCompleto,
          username: usernameAlternativo,
        })
      }

      if (erroInsercao) {
        let erroFallback = await tentarInserir({
          account_id: user.id,
          nome: nomeBase,
          username: usernameFinal,
          bio: '',
          foto_url: null,
        })

        if (erroFallback && /duplicate key|unique|username/i.test(`${erroFallback.message || ''}`)) {
          erroFallback = await tentarInserir({
            account_id: user.id,
            nome: nomeBase,
            username: usernameAlternativo,
            bio: '',
            foto_url: null,
          })
        }

        if (erroFallback) throw erroFallback
      }

      const { data: perfilCriado, error: erroBuscaFinal } = await supabase
        .from('profiles')
        .select('*')
        .eq('account_id', user.id)
        .single()

      if (erroBuscaFinal) throw erroBuscaFinal
      return perfilCriado
    } catch (error) {
      console.warn('[FEED_PROFILE_BOOTSTRAP]', error?.code || '', error?.message || error)
      return montarPerfilFallback(user)
    }
  }

  const gruposStories = useMemo(() => {
    if (!stories.length) return []

    const mapa = new Map()

    stories.forEach((story) => {
      if (!story.perfil?.id) return

      if (!mapa.has(story.perfil.id)) {
        mapa.set(story.perfil.id, {
          perfil: story.perfil,
          stories: [],
        })
      }

      mapa.get(story.perfil.id).stories.push(story)
    })

    return Array.from(mapa.values()).map((grupo) => ({
      ...grupo,
      stories: grupo.stories.sort(
        (a, b) => new Date(a.created_at) - new Date(b.created_at)
      ),
    }))
  }, [stories])

  async function carregarTudo() {
    setCarregando(true)
    setErro('')

    const safeSelect = async (label, queryPromise, fallback = []) => {
      try {
        const { data, error } = await queryPromise
        if (error) throw error
        return Array.isArray(data) ? data : fallback
      } catch (error) {
        console.warn(`[${label}]`, error?.code || '', error?.message || error)
        return fallback
      }
    }

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        navigate('/auth')
        return
      }

      const perfil = await garantirPerfilUsuario(user)

      setMeuPerfil(perfil)

      const seguindoData = perfil?.id
        ? await safeSelect(
            'FEED_FOLLOWS_LOAD',
            supabase
              .from('follows')
              .select('following_profile_id')
              .eq('follower_profile_id', perfil.id),
            []
          )
        : []

      const idsSeguindo = [
        ...new Set(
          (seguindoData || [])
            .map((item) => item.following_profile_id)
            .filter(Boolean)
        ),
      ]
      const seguindoSet = new Set(idsSeguindo)
      const usuarioNovo = idsSeguindo.length === 0
      setFeedEmDescoberta(usuarioNovo)

      let postsQuery = supabase
        .from('posts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(220)

      if (!usuarioNovo) {
        postsQuery = postsQuery.in('profile_id', [perfil.id, ...idsSeguindo])
      }

      const postsBase = await safeSelect('FEED_POSTS_LOAD', postsQuery, [])
      const idsPosts = postsBase.map((post) => post.id)
      const idsPerfisPosts = [...new Set(postsBase.map((post) => post.profile_id))]

      const [perfisPostsData, comentarios, repostsData, curtidasPostData] = await Promise.all([
        idsPerfisPosts.length > 0
          ? safeSelect(
              'FEED_POST_AUTHORS_LOAD',
              supabase.from('profiles').select('*').in('id', idsPerfisPosts),
              []
            )
          : Promise.resolve([]),
        idsPosts.length > 0
          ? safeSelect(
              'FEED_COMMENTS_LOAD',
              supabase
                .from('comments')
                .select('id, post_id, content, created_at, profile_id, parent_comment_id')
                .in('post_id', idsPosts)
                .order('created_at', { ascending: true }),
              []
            )
          : Promise.resolve([]),
        idsPosts.length > 0
          ? safeSelect(
              'FEED_REPOSTS_LOAD',
              supabase.from('reposts').select('post_id, profile_id').in('post_id', idsPosts),
              []
            )
          : Promise.resolve([]),
        idsPosts.length > 0
          ? safeSelect(
              'FEED_POST_LIKES_LOAD',
              supabase.from('post_likes').select('post_id, profile_id').in('post_id', idsPosts),
              []
            )
          : Promise.resolve([]),
      ])

      const perfisPostsMap = criarMapaPorId(perfisPostsData)
      const comentariosPorPost = agruparPorCampo(comentarios, 'post_id')
      const repostsPorPost = agruparPorCampo(repostsData, 'post_id')
      const curtidasPorPost = agruparPorCampo(curtidasPostData, 'post_id')
      const postsVisiveis = (postsBase || []).filter((post) => {
        if (post.profile_id === perfil.id) return true

        if (!usuarioNovo) return true

        const autorPost = perfisPostsMap.get(post.profile_id)
        return !autorPost?.is_private
      })

      const idsAutoresComentarios = [
        ...new Set(comentarios.map((comentario) => comentario.profile_id)),
      ]
      const idsComentarios = comentarios.map((comentario) => comentario.id)

      const [autoresComentariosData, curtidasComentarioData] = await Promise.all([
        idsAutoresComentarios.length > 0
          ? safeSelect(
              'FEED_COMMENT_AUTHORS_LOAD',
              supabase
                .from('profiles')
                .select('id, nome, username, foto_url')
                .in('id', idsAutoresComentarios),
              []
            )
          : Promise.resolve([]),
        idsComentarios.length > 0
          ? safeSelect(
              'FEED_COMMENT_LIKES_LOAD',
              supabase
                .from('comment_likes')
                .select('comment_id, profile_id')
                .in('comment_id', idsComentarios),
              []
            )
          : Promise.resolve([]),
      ])

      const autoresComentariosMap = criarMapaPorId(autoresComentariosData)
      const curtidasComentarioPorId = agruparPorCampo(
        curtidasComentarioData,
        'comment_id'
      )

      const meusRepostsSet = criarSetComposto(
        (repostsData || []).filter((item) => item.profile_id === perfil.id),
        (item) => item.post_id
      )
      const minhasCurtidasPostSet = criarSetComposto(
        (curtidasPostData || []).filter((item) => item.profile_id === perfil.id),
        (item) => item.post_id
      )
      const minhasCurtidasComentarioSet = criarSetComposto(
        (curtidasComentarioData || []).filter(
          (item) => item.profile_id === perfil.id
        ),
        (item) => item.comment_id
      )

      const postsFinal = postsVisiveis.map((post) => {
        const comentariosDoPost = (comentariosPorPost.get(post.id) || []).map(
          (comentario) => ({
            ...comentario,
            autor: autoresComentariosMap.get(comentario.profile_id),
            totalCurtidas: (curtidasComentarioPorId.get(comentario.id) || []).length,
            euCurti: minhasCurtidasComentarioSet.has(comentario.id),
          })
        )

        return {
          ...post,
          autor: perfisPostsMap.get(post.profile_id),
          comentarios: comentariosDoPost,
          totalComentarios: comentariosDoPost.length,
          totalReposts: (repostsPorPost.get(post.id) || []).length,
          totalCurtidas: (curtidasPorPost.get(post.id) || []).length,
          euRepostei: meusRepostsSet.has(post.id),
          euCurti: minhasCurtidasPostSet.has(post.id),
          ehMeuPost: post.profile_id === perfil.id,
        }
      })

      const postsOrdenados = usuarioNovo
        ? ordenarPostsPorRelevancia(postsFinal)
        : [...postsFinal].sort(
            (a, b) => new Date(b.created_at) - new Date(a.created_at)
          )

      setPosts(postsOrdenados)

      try {
        const idsPermitidosStories = [perfil.id, ...idsSeguindo]

        const { data: storiesData, error: storiesError } = await supabase
          .from('stories')
          .select('*')
          .in('profile_id', idsPermitidosStories)
          .order('created_at', { ascending: false })

        if (storiesError) throw storiesError

        const agora = new Date()
        const storiesValidosBase = (storiesData || []).filter((story) => {
          if (!story.expires_at) return true
          return new Date(story.expires_at) > agora
        })

        if (storiesValidosBase.length > 0) {
          const idsStories = [...new Set(storiesValidosBase.map((story) => story.profile_id))]

          const { data: perfisStories } = await supabase
            .from('profiles')
            .select('*')
            .in('id', idsStories)

          const { data: views } = await supabase
            .from('story_views')
            .select('*')
            .eq('profile_id', perfil.id)

          const perfisStoriesMap = criarMapaPorId(perfisStories || [])
          const storiesFiltrados = storiesValidosBase.filter(
            (story) =>
              story.profile_id === perfil.id ||
              seguindoSet.has(story.profile_id)
          )

          const storiesFinal = storiesFiltrados.map((story) => ({
            ...story,
            perfil: perfisStoriesMap.get(story.profile_id),
            visto: (views || []).some((view) => view.story_id === story.id),
          }))

          setStories(storiesFinal)
        } else {
          setStories([])
        }
      } catch (storyError) {
        console.warn('[FEED_STORIES_LOAD]', storyError?.message || storyError)
        setStories([])
      }
    } catch (error) {
      console.error('[FEED_LOAD_FATAL]', error?.code || '', error?.message || error)
      setErro('Não foi possível carregar o feed.')
    } finally {
      setCarregando(false)
    }
  }

  async function marcarStoryComoVisto(storyId) {
    if (!meuPerfil) return

    const jaVisto = stories.some((story) => story.id === storyId && story.visto)
    if (jaVisto) return

    const { error } = await supabase.from('story_views').insert({
      story_id: storyId,
      profile_id: meuPerfil.id,
    })

    if (!error) {
      setStories((prev) =>
        prev.map((story) =>
          story.id === storyId ? { ...story, visto: true } : story
        )
      )
    }
  }

  async function apagarStory(story) {
    if (!story?.id || !meuPerfil) return false

    if (story.profile_id !== meuPerfil.id) {
      setErro('Você s? pode apagar seus próprios stories.')
      return false
    }

    try {
      setErro('')

      const { error } = await supabase
        .from('stories')
        .delete()
        .eq('id', story.id)
        .eq('profile_id', meuPerfil.id)

      if (error) throw error

      setStories((prev) => prev.filter((item) => item.id !== story.id))

      const caminhoArquivo = extrairCaminhoStorageStory(story.media_url)
      if (caminhoArquivo) {
        const { error: erroStorage } = await supabase.storage
          .from('stories')
          .remove([caminhoArquivo])

        if (erroStorage) {
          console.warn('Falha ao remover arquivo do story:', erroStorage.message)
        }
      }

      return true
    } catch {
      setErro('Não foi possível apagar o story agora.')
      return false
    }
  }

  async function sair() {
    await supabase.auth.signOut()
    navigate('/auth')
  }

  async function alternarRepost(postId, euRepostei) {
    if (!meuPerfil) return

    try {
      if (euRepostei) {
        const { error } = await supabase
          .from('reposts')
          .delete()
          .eq('post_id', postId)
          .eq('profile_id', meuPerfil.id)

        if (error) throw error
      } else {
        const { error } = await supabase.from('reposts').insert({
          post_id: postId,
          profile_id: meuPerfil.id,
        })

        if (error) throw error
      }

      setPosts((prev) =>
        prev.map((post) =>
          post.id === postId
            ? {
                ...post,
                euRepostei: !euRepostei,
                totalReposts: euRepostei
                  ? Math.max(0, post.totalReposts - 1)
                  : post.totalReposts + 1,
              }
            : post
        )
      )
    } catch {
      setErro('Não foi possível atualizar o repost.')
    }
  }

  async function alternarCurtidaPost(postId, euCurti) {
    if (!meuPerfil) return

    try {
      if (euCurti) {
        const { error } = await supabase
          .from('post_likes')
          .delete()
          .eq('post_id', postId)
          .eq('profile_id', meuPerfil.id)

        if (error) throw error
      } else {
        const { error } = await supabase.from('post_likes').insert({
          post_id: postId,
          profile_id: meuPerfil.id,
        })

        if (error) throw error
      }

      setPosts((prev) =>
        prev.map((post) =>
          post.id === postId
            ? {
                ...post,
                euCurti: !euCurti,
                totalCurtidas: euCurti
                  ? Math.max(0, post.totalCurtidas - 1)
                  : post.totalCurtidas + 1,
              }
            : post
        )
      )
    } catch {
      setErro('Não foi possível atualizar a curtida.')
    }
  }

  async function comentar(postId) {
    if (!meuPerfil || !novoComentario[postId]?.trim()) return

    try {
      const texto = novoComentario[postId]

      const { data, error } = await supabase
        .from('comments')
        .insert({
          post_id: postId,
          profile_id: meuPerfil.id,
          content: texto,
          parent_comment_id: null,
        })
        .select()
        .single()

      if (error) throw error

      const comentarioNovo = montarComentarioLocal(meuPerfil, data)

      setNovoComentario((prev) => ({ ...prev, [postId]: '' }))

      setPosts((prev) =>
        prev.map((post) =>
          post.id === postId
            ? {
                ...post,
                totalComentarios: post.totalComentarios + 1,
                comentarios: [...post.comentarios, comentarioNovo],
              }
            : post
        )
      )
    } catch {
      setErro('Não foi possível comentar.')
    }
  }

  async function responderComentario(postId, comentarioPaiId) {
    if (!meuPerfil || !respostaComentario[comentarioPaiId]?.trim()) return

    try {
      const texto = respostaComentario[comentarioPaiId]

      const { data, error } = await supabase
        .from('comments')
        .insert({
          post_id: postId,
          profile_id: meuPerfil.id,
          content: texto,
          parent_comment_id: comentarioPaiId,
        })
        .select()
        .single()

      if (error) throw error

      const respostaNova = montarComentarioLocal(meuPerfil, data)

      setRespostaComentario((prev) => ({ ...prev, [comentarioPaiId]: '' }))
      setComentarioRespondendo((prev) => ({
        ...prev,
        [comentarioPaiId]: false,
      }))

      setPosts((prev) =>
        prev.map((post) =>
          post.id === postId
            ? {
                ...post,
                totalComentarios: post.totalComentarios + 1,
                comentarios: [...post.comentarios, respostaNova],
              }
            : post
        )
      )
    } catch {
      setErro('Não foi possível responder o comentário.')
    }
  }

  async function apagarPostConfirmado() {
    if (!postParaApagar) return

    try {
      const { error } = await supabase
        .from('posts')
        .delete()
        .eq('id', postParaApagar)

      if (error) throw error

      setPosts((prev) => prev.filter((post) => post.id !== postParaApagar))
      setPostParaApagar(null)
    } catch {
      setErro('Não foi possível apagar a postagem.')
    }
  }

  async function apagarComentario(commentId, postId) {
    try {
      const { error } = await supabase
        .from('comments')
        .delete()
        .eq('id', commentId)

      if (error) throw error

      setPosts((prev) =>
        prev.map((post) => {
          if (post.id !== postId) return post

          const removidos = post.comentarios.filter(
            (comentario) =>
              comentario.id === commentId ||
              comentario.parent_comment_id === commentId
          ).length

          return {
            ...post,
            totalComentarios: Math.max(0, post.totalComentarios - removidos),
            comentarios: post.comentarios.filter(
              (comentario) =>
                comentario.id !== commentId &&
                comentario.parent_comment_id !== commentId
            ),
          }
        })
      )
    } catch {
      setErro('Não foi possível apagar o comentário.')
    }
  }

  async function alternarCurtidaComentario(commentId, postId, euCurti) {
    if (!meuPerfil) return

    try {
      if (euCurti) {
        const { error } = await supabase
          .from('comment_likes')
          .delete()
          .eq('comment_id', commentId)
          .eq('profile_id', meuPerfil.id)

        if (error) throw error
      } else {
        const { error } = await supabase.from('comment_likes').insert({
          comment_id: commentId,
          profile_id: meuPerfil.id,
        })

        if (error) throw error
      }

      setPosts((prev) =>
        prev.map((post) =>
          post.id === postId
            ? {
                ...post,
                comentarios: post.comentarios.map((comentario) =>
                  comentario.id === commentId
                    ? {
                        ...comentario,
                        euCurti: !euCurti,
                        totalCurtidas: euCurti
                          ? Math.max(0, comentario.totalCurtidas - 1)
                          : comentario.totalCurtidas + 1,
                      }
                    : comentario
                ),
              }
            : post
        )
      )
    } catch {
      setErro('Não foi possível atualizar a curtida do comentário.')
    }
  }

  function abrirPerfilPorUsername(username) {
    if (!username) return

    if (meuPerfil?.username === username) {
      navigate('/perfil')
      return
    }

    navigate(`/usuario/${username}`)
  }

  function renderComentarios(post) {
    const comentariosRaiz = post.comentarios.filter(
      (comentario) => !comentario.parent_comment_id
    )

    return comentariosRaiz.map((comentario) => {
      const respostas = post.comentarios.filter(
        (item) => item.parent_comment_id === comentario.id
      )
      const ehMeuComentario = meuPerfil && comentario.profile_id === meuPerfil.id

      return (
        <div className="comment-item" key={comentario.id}>
          <button
            type="button"
            className="comment-author-btn"
            onClick={() => abrirPerfilPorUsername(comentario.autor?.username)}
          >
            {comentario.autor?.nome || 'Usuário'} @{comentario.autor?.username || 'username'}
          </button>

          <p className="comment-date">{formatarData(comentario.created_at)}</p>
          <p>{comentario.content}</p>

          <div className="comment-actions">
            <button
              className={`icon-action-btn ${comentario.euCurti ? 'active-like' : ''}`}
              onClick={() =>
                alternarCurtidaComentario(
                  comentario.id,
                  post.id,
                  comentario.euCurti
                )
              }
            >
              <IconeEstrela preenchida={comentario.euCurti} />
              <span>{comentario.totalCurtidas}</span>
            </button>

            <button
              className="action-btn small-btn"
              onClick={() =>
                setComentarioRespondendo((prev) => ({
                  ...prev,
                  [comentario.id]: !prev[comentario.id],
                }))
              }
            >
              Responder
            </button>

            {ehMeuComentario && (
              <button
                className="action-btn small-btn delete-btn"
                onClick={() => apagarComentario(comentario.id, post.id)}
              >
                Apagar
              </button>
            )}
          </div>

          {comentarioRespondendo[comentario.id] && (
            <div className="reply-box">
              <input
                className="input small-comment-input"
                type="text"
                placeholder="Responder comentário..."
                value={respostaComentario[comentario.id] || ''}
                onChange={(e) =>
                  setRespostaComentario((prev) => ({
                    ...prev,
                    [comentario.id]: e.target.value,
                  }))
                }
              />

              <button
                className="btn small-submit-btn"
                type="button"
                onClick={() => responderComentario(post.id, comentario.id)}
              >
                Responder
              </button>
            </div>
          )}

          {respostas.length > 0 && (
            <div className="reply-list">
              {respostas.map((resposta) => {
                const ehMinhaResposta = meuPerfil && resposta.profile_id === meuPerfil.id

                return (
                  <div className="reply-item" key={resposta.id}>
                    <button
                      type="button"
                      className="comment-author-btn"
                      onClick={() => abrirPerfilPorUsername(resposta.autor?.username)}
                    >
                      {resposta.autor?.nome || 'Usuário'} @{resposta.autor?.username || 'username'}
                    </button>

                    <p className="comment-date">{formatarData(resposta.created_at)}</p>
                    <p>{resposta.content}</p>

                    <div className="comment-actions">
                      <button
                        className={`icon-action-btn ${resposta.euCurti ? 'active-like' : ''}`}
                        onClick={() =>
                          alternarCurtidaComentario(
                            resposta.id,
                            post.id,
                            resposta.euCurti
                          )
                        }
                      >
                        <IconeEstrela preenchida={resposta.euCurti} />
                        <span>{resposta.totalCurtidas}</span>
                      </button>

                      {ehMinhaResposta && (
                        <button
                          className="action-btn small-btn delete-btn"
                          onClick={() => apagarComentario(resposta.id, post.id)}
                        >
                          Apagar
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )
    })
  }

  if (carregando) {
    return <SocialLoader variant="feed" showBottomNav />
  }

  return (
    <div className="container">
      <div
        className="topbar"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <button
          type="button"
          className="feed-brand"
          onClick={() => navigate('/')}
          aria-label="Ir para o início"
        >
          <img src={logoNexo} alt="Logo NEXO" />
          <span>NEXO</span>
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => navigate('/novo-post')}
            className="feed-create-btn"
          >
            Criar
          </button>

          <button
            onClick={() => navigate('/perfil')}
            className="feed-profile-btn"
          >
            {meuPerfil?.foto_url ? (
              <img
                src={meuPerfil.foto_url}
                alt={meuPerfil.nome}
                className="feed-profile-btn-img"
              />
            ) : (
              <span>{meuPerfil?.nome?.charAt(0)?.toUpperCase() || 'P'}</span>
            )}
          </button>

          <button
            onClick={sair}
            className="feed-logout-btn"
          >
            Sair
          </button>
        </div>
      </div>

      <div className="page">
        {erro && <div className="alert-box erro-box">{erro}</div>}

        <StoryBar
          grupos={gruposStories}
          meuPerfil={meuPerfil}
          onStoryViewed={marcarStoryComoVisto}
          onOpenCreateStory={() => navigate('/novo-story')}
          onOpenProfile={abrirPerfilPorUsername}
          onDeleteStory={apagarStory}
        />

        {posts.length === 0 ? (
          <div className="empty-state">
            <h3 style={{ marginBottom: 10, color: 'white' }}>Nada por aqui ainda</h3>
            <p>
              {feedEmDescoberta
                ? 'Enquanto você ainda não segue ninguém, o feed mostra apenas recomendações relevantes.'
                : 'Siga perfis para montar seu feed com stories e postagens.'}
            </p>
          </div>
        ) : (
          <div className="feed-list">
            {posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                comentariosAbertos={comentariosAbertos}
                setComentariosAbertos={setComentariosAbertos}
                alternarCurtidaPost={alternarCurtidaPost}
                alternarRepost={alternarRepost}
                novoComentario={novoComentario}
                setNovoComentario={setNovoComentario}
                comentar={comentar}
                renderComentarios={renderComentarios}
                setPostParaApagar={setPostParaApagar}
                abrirPerfil={abrirPerfilPorUsername}
                IconeEstrela={IconeEstrela}
                IconeComentarios={IconeComentarios}
                IconeRepost={IconeRepost}
              />
            ))}
          </div>
        )}
      </div>

      {postParaApagar && (
        <div className="modal-overlay">
          <div className="modal-box">
            <h3>Apagar postagem?</h3>
            <p>Tem certeza que deseja apagar esta postagem?</p>

            <div className="modal-actions">
              <button
                className="btn btn-secondary"
                onClick={() => setPostParaApagar(null)}
              >
                Cancelar
              </button>

              <button
                className="btn delete-solid-btn"
                onClick={apagarPostConfirmado}
              >
                Apagar
              </button>
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  )
}



