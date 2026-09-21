import { useNavigate } from 'react-router-dom'

const rules = [
  ['Bullying e assédio', 'Não ataque, humilhe, persiga ou constranja outra pessoa.'],
  ['Ameaças', 'Não publique ameaças, incentivo à violência ou mensagens que coloquem alguém em risco.'],
  ['Ódio e discriminação', 'Não ataque pessoas por raça, origem, religião, deficiência, gênero ou orientação.'],
  ['Conteúdo sexual ou ilegal', 'Nudez, exploração, aliciamento e conteúdo criminoso não pertencem ao NEXO 11.'],
  ['Privacidade', 'Não divulgue endereços, senhas, documentos ou informações pessoais suas ou de terceiros.'],
  ['Spam e contas falsas', 'Não envie mensagens repetitivas, links perigosos nem finja ser outra pessoa.'],
  ['Ajuda em situações de risco', 'Se você ou alguém estiver em perigo, procure imediatamente um adulto de confiança ou serviço de emergência.'],
]

export default function CommunityRules() {
  const navigate = useNavigate()
  return <main className="community-rules-page">
    <header><button type="button" onClick={() => navigate(-1)} aria-label="Voltar">←</button><div><span>NEXO 11 · COMUNIDADE</span><h1>Regras da Comunidade</h1></div></header>
    <section className="community-rules-hero"><h2>Uma rede escolar segura é responsabilidade de todo mundo.</h2><p>Queremos conversa, criatividade e liberdade com respeito. Sempre que for seguro, você poderá corrigir o conteúdo antes de qualquer medida.</p></section>
    <div className="community-rules-grid">{rules.map(([title, description], index) => <article key={title}><b>{String(index + 1).padStart(2, '0')}</b><div><h3>{title}</h3><p>{description}</p></div></article>)}</div>
    <section className="community-rules-review"><h2>Como a moderação funciona</h2><p>Conteúdos leves podem receber um pedido de edição. Violações claras são bloqueadas. Casos duvidosos ou graves seguem para revisão humana. Você pode denunciar conteúdos, bloquear pessoas e pedir revisão de uma suspensão.</p></section>
  </main>
}
