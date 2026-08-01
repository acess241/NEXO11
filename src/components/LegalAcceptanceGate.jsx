import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { LEGAL_VERSION, LEGAL_VERSION_LABEL } from '../lib/legal'

const LEGAL_ROUTES = ['/privacidade', '/termos', '/seguranca-responsabilidade']

export default function LegalAcceptanceGate({ session }) {
  const location = useLocation()
  const [loading, setLoading] = useState(true)
  const [accepted, setAccepted] = useState(false)
  const [databaseReady, setDatabaseReady] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [signedName, setSignedName] = useState('')
  const [checks, setChecks] = useState({ privacy: false, terms: false, safety: false })

  const base = import.meta.env.BASE_URL || '/'
  const isLegalPage = LEGAL_ROUTES.includes(location.pathname)
  const canAccept = useMemo(
    () => signedName.trim().length >= 3 && checks.privacy && checks.terms && checks.safety,
    [signedName, checks],
  )

  useEffect(() => {
    let active = true

    async function checkAcceptance() {
      if (!session?.user?.id) {
        if (active) {
          setAccepted(false)
          setLoading(false)
        }
        return
      }

      setLoading(true)
      setError('')

      const { data, error: queryError } = await supabase
        .from('legal_acceptances')
        .select('id')
        .eq('account_id', session.user.id)
        .eq('legal_version', LEGAL_VERSION)
        .maybeSingle()

      if (!active) return

      if (queryError) {
        setDatabaseReady(false)
        setError('A assinatura digital ainda não foi configurada no banco. Rode o SQL de aceite legal no Supabase.')
        setAccepted(false)
      } else {
        setDatabaseReady(true)
        setAccepted(Boolean(data))
      }
      setLoading(false)
    }

    void checkAcceptance()
    return () => {
      active = false
    }
  }, [session?.user?.id])

  useEffect(() => {
    if (!session || accepted || loading || isLegalPage) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [session, accepted, loading, isLegalPage])

  async function signDocuments(event) {
    event.preventDefault()
    if (!canAccept || !databaseReady || !session?.user?.id || saving) return

    setSaving(true)
    setError('')
    const { error: saveError } = await supabase.from('legal_acceptances').upsert(
      {
        account_id: session.user.id,
        legal_version: LEGAL_VERSION,
        signed_name: signedName.trim(),
        privacy_accepted: true,
        terms_accepted: true,
        safety_accepted: true,
        accepted_at: new Date().toISOString(),
        user_agent: navigator.userAgent.slice(0, 500),
      },
      { onConflict: 'account_id,legal_version' },
    )

    if (saveError) {
      setError(`Não foi possível registrar sua assinatura. ${saveError.message}`)
      setSaving(false)
      return
    }

    setAccepted(true)
    setSaving(false)
  }

  if (!session || loading || accepted || isLegalPage) return null

  return (
    <div className="legal-acceptance-backdrop" role="presentation">
      <section className="legal-acceptance-card" role="dialog" aria-modal="true" aria-labelledby="legal-acceptance-title">
        <div className="legal-acceptance-brand">NEXO 11 · DOCUMENTOS LEGAIS</div>
        <h1 id="legal-acceptance-title">Leia e assine para continuar</h1>
        <p className="legal-acceptance-intro">
          Para proteger sua conta e a comunidade, confirme que leu os documentos vigentes. Sua assinatura ficará vinculada à versão {LEGAL_VERSION_LABEL}.
        </p>

        <form onSubmit={signDocuments}>
          <div className="legal-acceptance-list">
            <label>
              <input type="checkbox" checked={checks.privacy} onChange={(event) => setChecks((value) => ({ ...value, privacy: event.target.checked }))} />
              <span>Li e concordo com a <a href={`${base}privacidade`} target="_blank" rel="noreferrer">Política de Privacidade</a>.</span>
            </label>
            <label>
              <input type="checkbox" checked={checks.terms} onChange={(event) => setChecks((value) => ({ ...value, terms: event.target.checked }))} />
              <span>Li e aceito os <a href={`${base}termos`} target="_blank" rel="noreferrer">Termos de Uso</a>.</span>
            </label>
            <label>
              <input type="checkbox" checked={checks.safety} onChange={(event) => setChecks((value) => ({ ...value, safety: event.target.checked }))} />
              <span>Li e aceito o <a href={`${base}seguranca-responsabilidade`} target="_blank" rel="noreferrer">Termo de Segurança e Responsabilidade</a>.</span>
            </label>
          </div>

          <label className="legal-signature-field">
            <span>Assinatura digital — digite seu nome completo</span>
            <input value={signedName} onChange={(event) => setSignedName(event.target.value)} autoComplete="name" placeholder="Seu nome completo" maxLength={120} />
          </label>

          {error ? <p className="legal-acceptance-error" role="alert">{error}</p> : null}

          <button className="legal-acceptance-submit" type="submit" disabled={!canAccept || !databaseReady || saving}>
            {saving ? 'Registrando assinatura...' : databaseReady ? 'Assinar e continuar' : 'Configuração do banco necessária'}
          </button>
          <p className="legal-acceptance-footnote">O registro inclui sua conta, assinatura, versão aceita e data/hora.</p>
        </form>
      </section>
    </div>
  )
}

