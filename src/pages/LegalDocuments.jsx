import { useNavigate } from 'react-router-dom'

const POLICY_VERSION = '1.0 — 28 de julho de 2026'

function LegalShell({ title, subtitle, children }) {
  const navigate = useNavigate()

  return (
    <main className="legal-page">
      <header className="legal-topbar">
        <button type="button" onClick={() => navigate(-1)}>Voltar</button>
        <span>NEXO 11</span>
      </header>
      <article className="legal-document">
        <p className="legal-kicker">TRANSPARÊNCIA E PROTEÇÃO</p>
        <h1>{title}</h1>
        <p className="legal-lead">{subtitle}</p>
        <p className="legal-version">Versão {POLICY_VERSION}</p>
        {children}
      </article>
    </main>
  )
}

export function PrivacyPolicy() {
  return (
    <LegalShell
      title="Política de Privacidade"
      subtitle="Como o NEXO 11 utiliza e protege os dados de alunos, professores e escolas."
    >
      <section>
        <h2>1. Quem controla os dados</h2>
        <p>
          O NEXO 11 determina as finalidades e os meios essenciais do tratamento realizado
          diretamente na plataforma. Quando uma escola adotar oficialmente o serviço, as
          responsabilidades serão definidas em contrato próprio. O canal inicial de privacidade
          é o perfil oficial <strong>@NEXO11</strong> dentro do aplicativo.
        </p>
      </section>
      <section>
        <h2>2. Dados utilizados</h2>
        <ul>
          <li>nome, nome de usuário, e-mail institucional, escola, município, curso e função;</li>
          <li>foto, biografia, publicações, stories, comentários, curtidas e conexões;</li>
          <li>mensagens, grupos, áudios, imagens, vídeos e arquivos enviados;</li>
          <li>atividades, entregas, correções, quizzes, XP, recompensas e evolução do Nexinho;</li>
          <li>registros técnicos de autenticação, segurança, notificações e funcionamento.</li>
        </ul>
        <p>O cadastro não solicita CPF. Senhas são administradas pelo serviço de autenticação Supabase.</p>
      </section>
      <section>
        <h2>3. Para que usamos</h2>
        <p>
          Os dados são utilizados para criar contas, conectar a comunidade escolar, entregar
          mensagens, executar atividades educacionais, calcular XP, personalizar recursos,
          prevenir abuso, proteger contas e cumprir obrigações legais.
        </p>
      </section>
      <section>
        <h2>4. Crianças e adolescentes</h2>
        <p>
          O melhor interesse do menor prevalece em todas as decisões. O cadastro público não é
          permitido para menores de 13 anos. Esses usuários somente poderão acessar o serviço em
          fluxo institucional futuro, com participação verificável da escola e do responsável.
          Adolescentes devem compreender esta política e buscar orientação do responsável.
        </p>
      </section>
      <section>
        <h2>5. Compartilhamento e infraestrutura</h2>
        <p>
          Dados podem ser processados por fornecedores necessários ao funcionamento, como
          Supabase (banco, armazenamento e autenticação) e o provedor de hospedagem. Não vendemos
          dados pessoais. Informações públicas do perfil são exibidas conforme as configurações
          de privacidade do usuário.
        </p>
      </section>
      <section>
        <h2>6. Retenção e exclusão</h2>
        <p>
          Mantemos os dados enquanto a conta estiver ativa ou pelo período necessário para
          segurança e obrigações legais. O usuário pode apagar a conta nas configurações. Cópias
          técnicas temporárias podem permanecer em backups protegidos até seu ciclo de descarte.
        </p>
      </section>
      <section>
        <h2>7. Direitos do titular</h2>
        <p>
          O titular pode confirmar o tratamento, acessar, corrigir, exportar e solicitar a
          exclusão de seus dados, além de obter informações sobre compartilhamento e revisar
          consentimentos. Essas opções ficam na Central de Privacidade.
        </p>
      </section>
      <section>
        <h2>8. Segurança e incidentes</h2>
        <p>
          Utilizamos autenticação, HTTPS e regras de acesso no banco. Nenhum sistema é totalmente
          imune a incidentes. Eventos com risco ou dano relevante serão avaliados e comunicados
          conforme a LGPD e as regras da ANPD.
        </p>
      </section>
      <section>
        <h2>9. Alterações</h2>
        <p>
          Mudanças relevantes serão informadas no aplicativo. Quando necessário, um novo aceite
          será solicitado, com indicação clara da nova versão.
        </p>
      </section>
    </LegalShell>
  )
}

export function TermsOfUse() {
  return (
    <LegalShell
      title="Termos de Uso"
      subtitle="Regras para utilizar o NEXO 11 com segurança e respeito."
    >
      <section>
        <h2>1. Uso da plataforma</h2>
        <p>
          O NEXO 11 é uma plataforma social e educacional. A conta deve conter informações
          verdadeiras e não pode ser cedida. Cada usuário é responsável por proteger sua senha.
        </p>
      </section>
      <section>
        <h2>2. Idade e contas escolares</h2>
        <p>
          O cadastro público exige pelo menos 13 anos e e-mail institucional aceito. Menores de
          13 anos não podem contornar essa limitação. Contas de professor devem ser usadas apenas
          por profissionais autorizados.
        </p>
      </section>
      <section>
        <h2>3. Condutas proibidas</h2>
        <ul>
          <li>assédio, ameaça, discriminação, humilhação ou incentivo à violência;</li>
          <li>conteúdo sexual envolvendo menores ou exploração de qualquer pessoa;</li>
          <li>fraude acadêmica, falsidade de identidade, invasão ou tentativa de burlar o sistema;</li>
          <li>publicação de dados pessoais de terceiros sem autorização;</li>
          <li>spam, malware, conteúdo ilegal ou violação de direitos autorais.</li>
        </ul>
      </section>
      <section>
        <h2>4. Conteúdo e moderação</h2>
        <p>
          O usuário mantém a autoria do conteúdo que publica e concede ao NEXO 11 a permissão
          necessária para armazená-lo e exibi-lo dentro do serviço. Conteúdos ou contas podem ser
          restringidos quando houver violação, risco à comunidade ou obrigação legal.
        </p>
      </section>
      <section>
        <h2>5. Atividades, XP e recompensas</h2>
        <p>
          Professores são responsáveis pelo conteúdo e pelos critérios das atividades. XP,
          recompensas e recursos do Nexinho não representam dinheiro e podem ser corrigidos
          quando houver erro técnico, fraude ou uso indevido.
        </p>
      </section>
      <section>
        <h2>6. Denúncias e bloqueios</h2>
        <p>
          Usuários devem utilizar os recursos de bloqueio e o perfil oficial @NEXO11 para relatar
          abuso, risco a menores, fraude ou conteúdo ilegal.
        </p>
      </section>
      <section>
        <h2>7. Encerramento</h2>
        <p>
          O usuário pode apagar a conta. O acesso poderá ser suspenso em caso de violação grave,
          preservando registros estritamente necessários para segurança e cumprimento legal.
        </p>
      </section>
    </LegalShell>
  )
}

export { POLICY_VERSION }
