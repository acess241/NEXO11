import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  DEFAULT_INSTITUTION_ID,
  DEFAULT_INSTITUTION_NAME,
  normalizarMatricula,
} from '../lib/education'
import { salvarContaDaSessao } from '../lib/savedAccounts'
import {
  SCHOOL_CITY_OPTIONS,
  getCityKeyFromSchoolName,
  isSchoolInCity,
  listSchoolsByCity,
} from '../lib/schoolsCatalog'
import { formatDisplayName } from '../lib/textFormat'
import logo from '/logo-novo.png'

const ENOVA_STUDENT_DOMAIN = '@aluno.enova.educacao.ba.gov.br'
const ENOVA_TEACHER_DOMAIN = '@enova.educacao.ba.gov.br'

function emailEnovaPermitido(emailValue) {
  const value = String(emailValue || '').trim().toLowerCase()
  return value.endsWith(ENOVA_STUDENT_DOMAIN) || value.endsWith(ENOVA_TEACHER_DOMAIN)
}

function erroEmailEnova(emailValue, role) {
  const value = String(emailValue || '').trim().toLowerCase()
  const expected = role === 'teacher' ? ENOVA_TEACHER_DOMAIN : ENOVA_STUDENT_DOMAIN
  if (!value.endsWith(expected)) {
    return role === 'teacher'
      ? `Professores devem utilizar o email institucional ${ENOVA_TEACHER_DOMAIN}.`
      : `Alunos devem utilizar o email institucional ${ENOVA_STUDENT_DOMAIN}.`
  }
  return ''
}

function IconeOlhoAberto() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function IconeOlhoFechado() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10.733 5.076A10.744 10.744 0 0 1 21.938 11.652a1 1 0 0 1 0 .696 10.75 10.75 0 0 1-4.274 5.168" />
      <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
      <path d="M17.479 17.499A10.75 10.75 0 0 1 2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" />
      <path d="m2 2 20 20" />
    </svg>
  )
}

function detectarModoRecuperacao() {
  if (typeof window === 'undefined') return false
  const hash = window.location.hash || ''
  const search = window.location.search || ''
  const path = window.location.pathname || ''
  const bruto = `${hash}&${search}`.toLowerCase()
  return (
    path.includes('/reset-senha') ||
    bruto.includes('type=recovery') ||
    bruto.includes('recovery_token=') ||
    bruto.includes('access_token=')
  )
}

function obterRedirectRecuperacao() {
  if (typeof window === 'undefined') return undefined
  return `${window.location.origin}/reset-senha`
}

export default function Auth({ forceRecoveryMode = false, allowAddAccount = false }) {
  const [isLogin, setIsLogin] = useState(Boolean(allowAddAccount))
  const [esqueciSenha, setEsqueciSenha] = useState(false)
  const [modoRecuperacao, setModoRecuperacao] = useState(
    forceRecoveryMode || detectarModoRecuperacao()
  )

  const [tipoConta, setTipoConta] = useState('student')
  const [nome, setNome] = useState('')
  const [username, setUsername] = useState('')
  const [cpfCadastro, setCpfCadastro] = useState('')
  const [cidadeEscola, setCidadeEscola] = useState('')
  const [escolaProfessor, setEscolaProfessor] = useState('')
  const [materiaProfessor, setMateriaProfessor] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [confirmarSenha, setConfirmarSenha] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState('')

  const navigate = useNavigate()
  const escolasDaCidade = useMemo(
    () => (cidadeEscola ? listSchoolsByCity(cidadeEscola) : []),
    [cidadeEscola]
  )

  useEffect(() => {
    if (!allowAddAccount) return
    setIsLogin(true)
    setEsqueciSenha(false)
  }, [allowAddAccount])

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setModoRecuperacao(true)
        setEsqueciSenha(false)
        setErro('')
        setSucesso('Link validado. Defina sua nova senha.')
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  function selecionarCidadeEscola(cityKey) {
    setCidadeEscola(cityKey)

    if (!cityKey) return
    if (isSchoolInCity(escolaProfessor, cityKey)) return

    setEscolaProfessor('')
  }

  function selecionarEscola(nomeEscola) {
    setEscolaProfessor(nomeEscola)

    if (!nomeEscola) return
    if (cidadeEscola && isSchoolInCity(nomeEscola, cidadeEscola)) return

    const cityKey = getCityKeyFromSchoolName(nomeEscola)
    if (cityKey) {
      setCidadeEscola(cityKey)
    }
  }

  function formatarNomeEscola(nomeEscola) {
    const nome = `${nomeEscola || ''}`.trim()
    if (nome.length <= 74) return nome
    return `${nome.slice(0, 71)}...`
  }

  function normalizarCpf(valor) {
    return `${valor || ''}`.replace(/\D/g, '').slice(0, 11)
  }

  function formatarCpf(valor) {
    const cpf = normalizarCpf(valor)
    if (cpf.length <= 3) return cpf
    if (cpf.length <= 6) return `${cpf.slice(0, 3)}.${cpf.slice(3)}`
    if (cpf.length <= 9) return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6)}`
    return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`
  }

  function cpfValido(valor) {
    const cpf = normalizarCpf(valor)
    if (cpf.length !== 11) return false
    if (/^(\d)\1{10}$/.test(cpf)) return false

    let soma = 0
    for (let i = 0; i < 9; i += 1) soma += Number(cpf[i]) * (10 - i)
    let digito = (soma * 10) % 11
    if (digito === 10) digito = 0
    if (digito !== Number(cpf[9])) return false

    soma = 0
    for (let i = 0; i < 10; i += 1) soma += Number(cpf[i]) * (11 - i)
    digito = (soma * 10) % 11
    if (digito === 10) digito = 0
    return digito === Number(cpf[10])
  }

  function validarNomeDeUsuario(valor) {
    if (valor.includes(' ')) return 'Não é permitido usar espaço no nome de usuário.'
    if (valor.length > 30) return 'O nome de usuário pode ter no máximo 30 caracteres.'
    if (valor.startsWith('.')) return 'O nome de usuário não pode começar com "."'
    if (valor.endsWith('.')) return 'O nome de usuário não pode terminar com "."'
    if (valor.includes('..')) return 'Não é permitido usar ".." no nome de usuário.'
    if (!/^[a-z0-9._]+$/.test(valor)) return 'Use apenas letras (a-z), números (0-9), "." ou "_"'
    return null
  }

  function traduzirErro(error) {
    const code = `${error?.code || ''}`.toLowerCase()
    const texto = `${error?.message || error || ''}`.toLowerCase()

    if (code === 'email_not_confirmed' || texto.includes('email not confirmed')) {
      return 'Seu email ainda não foi confirmado. Abra sua caixa de entrada e confirme o cadastro.'
    }

    if (texto.includes('invalid login credentials')) {
      return 'Email ou senha incorretos. Se acabou de cadastrar, confirme o email antes de entrar.'
    }

    if (
      (code === '23505' && texto.includes('cpf')) ||
      (texto.includes('duplicate key') && texto.includes('cpf')) ||
      texto.includes('profiles_cpf')
    ) {
      return 'Este CPF já está cadastrado.'
    }

    if (texto.includes('email signups are disabled')) return 'O cadastro por email esta desativado.'
    if (texto.includes('signup is disabled')) return 'O cadastro esta desativado.'
    if (texto.includes('user already registered')) return 'Esse email ja esta cadastrado.'
    if (texto.includes('database error')) return 'Erro ao salvar usuário. Verifique a configuração do banco.'
    if (texto.includes('password should be at least')) return 'A senha precisa ter pelo menos 6 caracteres.'
    if (texto.includes('otp expired') || texto.includes('expired')) return 'Este link expirou. Solicite outro.'
    if (texto.includes('invalid token')) return 'Link inválido. Solicite um novo link de senha.'
    if (
      texto.includes('failed to fetch') ||
      texto.includes('fetch failed') ||
      texto.includes('network request failed') ||
      texto.includes('load failed')
    ) {
      return 'Falha de conexão com o servidor. Verifique internet/VPN e tente novamente.'
    }

    return 'Ocorreu um erro. Tente novamente.'
  }

  function normalizarRoleConta(roleValue) {
    const lowered = `${roleValue || ''}`.toLowerCase().trim()
    if (lowered === 'teacher' || lowered === 'professor' || lowered === 'admin' || lowered === 'docente') {
      return 'teacher'
    }
    return 'student'
  }

  async function criarPerfilAutomatico(userId, nomeBase, usernameBase, extra = {}) {
    const { data: perfilExistente, error: erroBusca } = await supabase
      .from('profiles')
      .select('id, role, teacher_subject, teacher_school, teacher_registration, teacher_department')
      .eq('account_id', userId)
      .limit(1)
      .maybeSingle()

    if (erroBusca) throw erroBusca
    const roleFinal = normalizarRoleConta(extra.role)
    const cpfFinal = normalizarCpf(extra.cpf)
    const teacherSubjectFinal = `${extra.teacherSubject || ''}`.trim() || null
    const teacherSchoolFinal = `${extra.teacherSchool || ''}`.trim() || null
    const teacherRegistrationFinal = `${extra.teacherRegistration || ''}`.trim() || null
    const teacherDepartmentFinal = `${extra.teacherDepartment || ''}`.trim() || null

    if (perfilExistente) {
      const patch = {}
      if (roleFinal === 'teacher' && `${perfilExistente.role || ''}`.toLowerCase() !== 'teacher') {
        patch.role = 'teacher'
      }

      if (!perfilExistente.teacher_subject && teacherSubjectFinal) patch.teacher_subject = teacherSubjectFinal
      if (!perfilExistente.teacher_school && teacherSchoolFinal) patch.teacher_school = teacherSchoolFinal
      if (!perfilExistente.teacher_registration && teacherRegistrationFinal) {
        patch.teacher_registration = teacherRegistrationFinal
      }
      if (!perfilExistente.teacher_department && teacherDepartmentFinal) {
        patch.teacher_department = teacherDepartmentFinal
      }

      if (Object.keys(patch).length > 0) {
        const { error: erroAtualizacao } = await supabase
          .from('profiles')
          .update(patch)
          .eq('id', perfilExistente.id)

        if (
          erroAtualizacao &&
          !/(role|teacher_subject|teacher_school|teacher_registration|teacher_department|schema cache|column)/i.test(
            erroAtualizacao.message || ''
          )
        ) {
          throw erroAtualizacao
        }
      }

      if (cpfFinal) {
        const { error: erroCpf } = await supabase
          .from('profiles')
          .update({ cpf: cpfFinal })
          .eq('id', perfilExistente.id)

        if (
          erroCpf &&
          !/(schema cache|column\s+.*cpf|cpf.*does not exist)/i.test(erroCpf.message || '')
        ) {
          throw erroCpf
        }
      }
      return true
    }

    const nomeFinal = formatDisplayName(nomeBase || 'Novo usuário')

    let usernameFinal = (usernameBase || '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '')
      .replace(/[^a-z0-9._]/g, '')
      .slice(0, 30)

    if (!usernameFinal) usernameFinal = `user${userId.replace(/-/g, '').slice(0, 8)}`
    if (usernameFinal.startsWith('.')) usernameFinal = usernameFinal.replace(/^\.+/, '')
    if (usernameFinal.endsWith('.')) usernameFinal = usernameFinal.replace(/\.+$/, '')
    if (usernameFinal.includes('..')) usernameFinal = usernameFinal.replace(/\.{2,}/g, '.')
    if (!usernameFinal) usernameFinal = `user${userId.replace(/-/g, '').slice(0, 8)}`

    const { data: jaExiste, error: erroUsername } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', usernameFinal)
      .limit(1)

    if (erroUsername) throw erroUsername
    if (jaExiste && jaExiste.length > 0) {
      usernameFinal = `${usernameFinal}${userId.replace(/-/g, '').slice(0, 4)}`
    }

    const matriculaFinal = normalizarMatricula(extra.enrollmentNumber)
    const instituicaoIdFinal = extra.institutionId || DEFAULT_INSTITUTION_ID
    const instituicaoNomeFinal = extra.institutionName || DEFAULT_INSTITUTION_NAME
    const { error: erroCriacao } = await supabase.from('profiles').insert({
      account_id: userId,
      nome: nomeFinal,
      username: usernameFinal,
      bio: '',
      foto_url: null,
      institution_id: instituicaoIdFinal,
      institution_name: instituicaoNomeFinal,
      enrollment_number: matriculaFinal || null,
      role: roleFinal,
      teacher_subject: teacherSubjectFinal,
      teacher_school: teacherSchoolFinal,
      teacher_registration: teacherRegistrationFinal,
      teacher_department: teacherDepartmentFinal,
    })

    if (
      erroCriacao &&
      /(institution_id|institution_name|enrollment_number|role|teacher_subject|teacher_school|teacher_registration|teacher_department|schema cache|column)/i.test(
        erroCriacao.message || ''
      )
    ) {
      const { error: erroFallback } = await supabase.from('profiles').insert({
        account_id: userId,
        nome: nomeFinal,
        username: usernameFinal,
        bio: '',
        foto_url: null,
      })

      if (erroFallback) throw erroFallback
      return false
    }

    if (erroCriacao) throw erroCriacao

    if (cpfFinal) {
      const { error: erroCpf } = await supabase
        .from('profiles')
        .update({ cpf: cpfFinal })
        .eq('account_id', userId)

      if (
        erroCpf &&
        !/(schema cache|column\s+.*cpf|cpf.*does not exist)/i.test(erroCpf.message || '')
      ) {
        throw erroCpf
      }
    }

    return true
  }

  async function salvarContaAtualNoDispositivo() {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session?.user) return

    const { data: perfil } = await supabase
      .from('profiles')
      .select('nome, username')
      .eq('account_id', session.user.id)
      .maybeSingle()

    salvarContaDaSessao(session, perfil || null)
  }

  async function handleEnviarLinkEsqueciSenha(event) {
    event.preventDefault()
    setErro('')
    setSucesso('')

    const emailNormalizado = email.trim().toLowerCase()
    if (!emailNormalizado) {
      setErro('Informe um email valido.')
      return
    }
    if (isLogin && !emailEnovaPermitido(emailNormalizado)) {
      setErro('Entre com seu email institucional e-Nova Bahia.')
      return
    }
    if (!isLogin) {
      const emailError = erroEmailEnova(emailNormalizado, tipoConta)
      if (emailError) {
        setErro(emailError)
        return
      }
    }

    setCarregando(true)

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(emailNormalizado, {
        redirectTo: obterRedirectRecuperacao(),
      })

      if (error) throw error

      setSucesso(
        'Enviamos um link de redefinição para seu email. Abra o link e defina a nova senha.'
      )
    } catch (err) {
      setErro(traduzirErro(err))
    } finally {
      setCarregando(false)
    }
  }

  async function handleSalvarNovaSenha(event) {
    event.preventDefault()
    setErro('')
    setSucesso('')

    if (!senha || senha.length < 6) {
      setErro('A nova senha precisa ter pelo menos 6 caracteres.')
      return
    }

    if (senha !== confirmarSenha) {
      setErro('A confirmação da senha não confere.')
      return
    }

    setCarregando(true)

    try {
      const { error } = await supabase.auth.updateUser({ password: senha })
      if (error) throw error

      setSucesso('Senha alterada com sucesso. Agora você ja pode entrar normalmente.')
      setModoRecuperacao(false)
      setEsqueciSenha(false)
      setIsLogin(true)
      setSenha('')
      setConfirmarSenha('')

      if (typeof window !== 'undefined') {
        window.history.replaceState({}, '', '/auth')
      }
    } catch (err) {
      setErro(traduzirErro(err))
    } finally {
      setCarregando(false)
    }
  }

  async function handleAuth(event) {
    event.preventDefault()
    setErro('')
    setSucesso('')

    if (!isLogin) {
      const erroUsername = validarNomeDeUsuario(username)
      const cpfNormalizado = normalizarCpf(cpfCadastro)
      const materiaProfessorLimpa = materiaProfessor.trim()
      const escolaProfessorLimpa = escolaProfessor.trim()
      const cidadeSelecionada = cidadeEscola.trim()

      if (erroUsername) {
        setErro(erroUsername)
        return
      }

      if (!cidadeSelecionada) {
        setErro('Selecione o município da escola.')
        return
      }

      if (escolaProfessorLimpa.length < 3) {
        setErro('Selecione uma escola válida.')
        return
      }

      if (!isSchoolInCity(escolaProfessorLimpa, cidadeSelecionada)) {
        setErro('Selecione uma escola da lista para continuar.')
        return
      }

      if (!cpfValido(cpfNormalizado)) {
        setErro('Informe um CPF válido para continuar.')
        return
      }

      if (tipoConta === 'teacher') {
        if (materiaProfessorLimpa.length < 2) {
          setErro('Informe a matéria principal do professor.')
          return
        }
      }
    }

    const emailNormalizado = email.trim().toLowerCase()
    if (!emailNormalizado) {
      setErro('Informe um email valido.')
      return
    }

    setCarregando(true)

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email: emailNormalizado,
          password: senha,
        })

        if (error) throw error

        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (user) {
          await criarPerfilAutomatico(user.id, user.user_metadata?.nome, user.user_metadata?.username, {
            institutionId: user.user_metadata?.institution_id,
            institutionName: user.user_metadata?.institution_name,
            enrollmentNumber: user.user_metadata?.enrollment_number,
            cpf: user.user_metadata?.cpf,
            role: user.user_metadata?.role,
            teacherSubject: user.user_metadata?.teacher_subject,
            teacherSchool: user.user_metadata?.teacher_school,
            teacherRegistration: user.user_metadata?.teacher_registration,
            teacherDepartment: user.user_metadata?.teacher_department,
          })
        }

        await salvarContaAtualNoDispositivo()

        if (allowAddAccount) {
          setSucesso('Conta adicionada com sucesso!')
          navigate('/perfil', { replace: true })
          return
        }

        setSucesso('Login feito com sucesso!')
      } else {
        const professorEh = tipoConta === 'teacher'
        const cpfNormalizado = normalizarCpf(cpfCadastro)
        const escolaProfessorLimpa = escolaProfessor.trim()
        const materiaProfessorLimpa = materiaProfessor.trim()
        const nomeEscolaFinal = escolaProfessorLimpa || DEFAULT_INSTITUTION_NAME

        const { data, error } = await supabase.auth.signUp({
          email: emailNormalizado,
          password: senha,
          options: {
            data: {
              nome,
              username,
              role: professorEh ? 'teacher' : 'student',
              institution_id: DEFAULT_INSTITUTION_ID,
              institution_name: nomeEscolaFinal,
              cpf: cpfNormalizado,
              enrollment_number: null,
              teacher_subject: professorEh ? materiaProfessorLimpa : null,
              teacher_school: professorEh ? nomeEscolaFinal : null,
              teacher_registration: null,
              teacher_department: null,
            },
          },
        })

        if (error) throw error
        if (!data?.user) {
          setErro('Não foi possível criar a conta.')
          return
        }

        const salvouEducacao = await criarPerfilAutomatico(data.user.id, nome, username, {
          institutionId: DEFAULT_INSTITUTION_ID,
          institutionName: nomeEscolaFinal,
          enrollmentNumber: null,
          cpf: cpfNormalizado,
          role: professorEh ? 'teacher' : 'student',
          teacherSubject: professorEh ? materiaProfessorLimpa : null,
          teacherSchool: professorEh ? nomeEscolaFinal : null,
          teacherRegistration: null,
          teacherDepartment: null,
        })

        if (data.session) {
          await salvarContaAtualNoDispositivo()
        }

        setSucesso(
          salvouEducacao
            ? 'Cadastro realizado com sucesso!'
            : 'Cadastro realizado. Rode o SQL de instituição/matrícula para salvar os novos campos.'
        )
        setIsLogin(true)
        setMostrarSenha(false)
        setCpfCadastro('')
        setMateriaProfessor('')
        setCidadeEscola('')
        setEscolaProfessor('')
      }
    } catch (err) {
      setErro(traduzirErro(err))
    } finally {
      setCarregando(false)
    }
  }

  function renderPasswordInput({
    value,
    onChange,
    placeholder,
    required = true,
    confirm = false,
  }) {
    return (
      <div style={{ position: 'relative' }}>
        <input
          className="input"
          type={mostrarSenha ? 'text' : 'password'}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          required={required}
          style={{ paddingRight: '48px' }}
          autoComplete={confirm ? 'new-password' : 'current-password'}
        />

        <button
          type="button"
          onClick={() => setMostrarSenha(!mostrarSenha)}
          aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
          style={{
            position: 'absolute',
            right: '14px',
            top: '38%',
            transform: 'translateY(-50%)',
            background: 'transparent',
            border: 'none',
            color: '#9ca3af',
            cursor: 'pointer',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {mostrarSenha ? <IconeOlhoFechado /> : <IconeOlhoAberto />}
        </button>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <div className="container page">
        <div className="logo-box">
          <img src={logo} alt="Nexo" />
        </div>

        <div className="card">
          <h1 className="title">
            {modoRecuperacao
              ? 'Redefinir senha'
              : allowAddAccount
              ? 'Adicionar conta'
              : esqueciSenha
              ? 'Esqueci minha senha'
              : isLogin
              ? 'Entrar'
              : 'Criar conta'}
          </h1>

          {erro ? (
            <div
              style={{
                background: '#2a0d0d',
                color: '#ff6b6b',
                padding: '10px',
                borderRadius: '10px',
                marginBottom: '10px',
              }}
            >
              {erro}
            </div>
          ) : null}

          {sucesso ? (
            <div
              style={{
                background: '#0d2a1a',
                color: '#4cffb2',
                padding: '10px',
                borderRadius: '10px',
                marginBottom: '10px',
              }}
            >
              {sucesso}
            </div>
          ) : null}

          {modoRecuperacao ? (
            <form onSubmit={handleSalvarNovaSenha}>
              {renderPasswordInput({
                value: senha,
                onChange: (e) => setSenha(e.target.value),
                placeholder: 'Nova senha',
              })}

              {renderPasswordInput({
                value: confirmarSenha,
                onChange: (e) => setConfirmarSenha(e.target.value),
                placeholder: 'Confirmar nova senha',
                confirm: true,
              })}

              <button className="btn" type="submit" disabled={carregando}>
                {carregando ? 'Salvando nova senha...' : 'Salvar nova senha'}
              </button>

              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => {
                  setModoRecuperacao(false)
                  setIsLogin(true)
                  setSenha('')
                  setConfirmarSenha('')
                  if (typeof window !== 'undefined') {
                    window.location.href = '/auth'
                  }
                }}
              >
                Voltar para login
              </button>
            </form>
          ) : esqueciSenha ? (
            <form onSubmit={handleEnviarLinkEsqueciSenha}>
              <input
                className="input"
                type="email"
                placeholder="Seu email institucional e-Nova"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />

              <button className="btn" type="submit" disabled={carregando}>
                {carregando ? 'Enviando link...' : 'Enviar link de redefinição'}
              </button>

              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => {
                  setEsqueciSenha(false)
                  setIsLogin(true)
                  setErro('')
                  setSucesso('')
                }}
              >
                Voltar para login
              </button>
            </form>
          ) : (
            <>
              <form onSubmit={handleAuth}>
                {!isLogin ? (
                  <>
                    <div className="auth-role-switch">
                      <button
                        className={`auth-role-btn ${tipoConta === 'student' ? 'active' : ''}`}
                        type="button"
                        onClick={() => setTipoConta('student')}
                      >
                        Conta de aluno
                      </button>
                      <button
                        className={`auth-role-btn ${tipoConta === 'teacher' ? 'active' : ''}`}
                        type="button"
                        onClick={() => setTipoConta('teacher')}
                      >
                        Conta de professor
                      </button>
                    </div>

                    <input
                      className="input"
                      type="text"
                      placeholder="Seu nome"
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      required
                    />

                    <input
                      className="input"
                      type="text"
                      placeholder="Nome de usuário"
                      value={username}
                      onChange={(e) => setUsername(e.target.value.toLowerCase())}
                      required
                    />

                    <input
                      className="input"
                      type="text"
                      inputMode="numeric"
                      placeholder="CPF"
                      value={formatarCpf(cpfCadastro)}
                      onChange={(e) => setCpfCadastro(normalizarCpf(e.target.value))}
                      required
                    />

                    <select
                      className="input"
                      value={cidadeEscola}
                      onChange={(e) => selecionarCidadeEscola(e.target.value)}
                      required
                    >
                      <option value="">Selecione o município da escola</option>
                      {SCHOOL_CITY_OPTIONS.map((cidade) => (
                        <option key={cidade.key} value={cidade.key}>
                          {`${cidade.label} (${cidade.schoolCount})`}
                        </option>
                      ))}
                    </select>

                    <select
                      className="input auth-school-select"
                      value={escolaProfessor}
                      onChange={(e) => selecionarEscola(e.target.value)}
                      required
                      disabled={!cidadeEscola}
                    >
                      <option value="">
                        {cidadeEscola ? 'Selecione a escola' : 'Selecione primeiro o município'}
                      </option>
                      {escolasDaCidade.map((escola) => (
                        <option key={escola.inep || `${escola.name}-${escola.city}`} value={escola.name}>
                          {formatarNomeEscola(escola.name)}
                        </option>
                      ))}
                    </select>

                    {escolaProfessor ? (
                      <p className="auth-school-selected-name">{escolaProfessor}</p>
                    ) : null}

                    {tipoConta === 'teacher' ? (
                      <input
                        className="input"
                        type="text"
                        placeholder="Matéria principal (ex: Matemática)"
                        value={materiaProfessor}
                        onChange={(e) => setMateriaProfessor(e.target.value)}
                        required
                      />
                    ) : null}
                  </>
                ) : null}

                <input
                  className="input"
                  type="email"
                  placeholder={isLogin ? 'Seu email institucional e-Nova' : tipoConta === 'teacher' ? `nome${ENOVA_TEACHER_DOMAIN}` : `matricula${ENOVA_STUDENT_DOMAIN}`}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />

                {renderPasswordInput({
                  value: senha,
                  onChange: (e) => setSenha(e.target.value),
                  placeholder: 'Sua senha',
                })}

                <button className="btn" type="submit" disabled={carregando}>
                  {carregando ? (isLogin ? 'Entrando...' : 'Criando conta...') : isLogin ? 'Entrar' : 'Cadastrar'}
                </button>
              </form>

              {isLogin && !allowAddAccount ? (
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => {
                    setEsqueciSenha(true)
                    setErro('')
                    setSucesso('')
                  }}
                >
                  Esqueci minha senha
                </button>
              ) : null}

              {allowAddAccount ? (
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => navigate('/perfil')}
                >
                  Voltar para perfil
                </button>
              ) : (
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => {
                    setIsLogin(!isLogin)
                    setEsqueciSenha(false)
                    setErro('')
                    setSucesso('')
                    setMostrarSenha(false)
                    setSenha('')
                    if (isLogin) {
                      setTipoConta('student')
                      setCpfCadastro('')
                      setMateriaProfessor('')
                      setCidadeEscola('')
                      setEscolaProfessor('')
                    }
                  }}
                >
                  {isLogin ? 'Não tem conta? Cadastre-se' : 'Já tem conta? Entrar'}
                </button>
              )}
            </>
          )}
        </div>

      </div>
    </div>
  )
}
