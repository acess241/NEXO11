import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BottomNav from '../components/BottomNav'
import SocialLoader from '../components/SocialLoader'
import { supabase } from '../lib/supabase'

async function consultaSegura(query, fallback = []) {
  try {
    const { data, error } = await query
    if (error) return fallback
    return data ?? fallback
  } catch {
    return fallback
  }
}

export default function PrivacyCenter() {
  const [perfil, setPerfil] = useState(null)
  const [email, setEmail] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [exportando, setExportando] = useState(false)
  const [mensagem, setMensagem] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    async function iniciar() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        navigate('/auth')
        return
      }
      const { data } = await supabase.from('profiles').select('*').eq('account_id', user.id).maybeSingle()
      setEmail(user.email || '')
      setPerfil(data || null)
      setCarregando(false)
    }
    void iniciar()
  }, [navigate])

  async function baixarMeusDados() {
    if (!perfil || exportando) return
    setExportando(true)
    setMensagem('')

    const [posts, stories, followsRecebidos, followsEnviados, notificacoes] = await Promise.all([
      consultaSegura(supabase.from('posts').select('*').eq('profile_id', perfil.id)),
      consultaSegura(supabase.from('stories').select('*').eq('profile_id', perfil.id)),
      consultaSegura(supabase.from('follows').select('*').eq('following_profile_id', perfil.id)),
      consultaSegura(supabase.from('follows').select('*').eq('follower_profile_id', perfil.id)),
      consultaSegura(supabase.from('notifications').select('*').eq('receiver_profile_id', perfil.id)),
    ])

    const pacote = {
      exportado_em: new Date().toISOString(),
      conta: { email },
      perfil,
      publicacoes: posts,
      stories,
      seguidores: followsRecebidos,
      seguindo: followsEnviados,
      notificacoes,
      aviso: 'Mídias e conversas protegidas podem exigir solicitação complementar ao canal de privacidade.',
    }
    const blob = new Blob([JSON.stringify(pacote, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `dados-nexo11-${perfil.username || 'conta'}.json`
    link.click()
    URL.revokeObjectURL(url)
    setMensagem('Sua cópia foi preparada e baixada.')
    setExportando(false)
  }

  if (carregando) return <SocialLoader variant="profile" showBottomNav />

  return (
    <div className="container">
      <header className="topbar privacy-center-topbar">
        <button type="button" className="edit-back-btn" onClick={() => navigate('/perfil')}>Voltar</button>
        <h1>Central de Privacidade</h1>
        <span />
      </header>
      <main className="page privacy-center-page">
        <section className="privacy-hero">
          <p>SEUS DADOS, SUAS ESCOLHAS</p>
          <h2>Controle sua privacidade</h2>
          <span>Consulte documentos, baixe seus dados e gerencie sua conta.</span>
        </section>
        {mensagem ? <div className="alert-box ok-box">{mensagem}</div> : null}
        <section className="privacy-action-grid">
          <button type="button" onClick={() => navigate('/privacidade')}>
            <strong>Política de Privacidade</strong>
            <span>Veja quais dados são usados e por quê.</span>
          </button>
          <button type="button" onClick={() => navigate('/termos')}>
            <strong>Termos de Uso</strong>
            <span>Consulte as regras da comunidade.</span>
          </button>
          <button type="button" onClick={baixarMeusDados} disabled={exportando}>
            <strong>{exportando ? 'Preparando arquivo...' : 'Baixar meus dados'}</strong>
            <span>Receba uma cópia em formato JSON.</span>
          </button>
          <button type="button" onClick={() => navigate('/editar-perfil')}>
            <strong>Corrigir meus dados</strong>
            <span>Atualize nome, foto, bio e informações escolares.</span>
          </button>
          <button type="button" onClick={() => navigate('/perfil', { state: { openSettings: true } })}>
            <strong>Apagar minha conta</strong>
            <span>Acesse a confirmação de exclusão nas configurações.</span>
          </button>
          <button type="button" onClick={() => navigate('/usuario/nexo11')}>
            <strong>Falar sobre privacidade</strong>
            <span>Entre em contato com o perfil oficial @NEXO11.</span>
          </button>
        </section>
      </main>
      <BottomNav />
    </div>
  )
}
