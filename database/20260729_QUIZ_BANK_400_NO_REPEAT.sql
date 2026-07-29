-- NEXO 11 - banco complementar de 400 perguntas para o Nexinho
-- 100 Matemática + 100 Português + 100 Inglês + 100 Química.
-- Seguro para executar mais de uma vez: perguntas existentes não são duplicadas.

create extension if not exists pgcrypto;

do $quiz_bank_400$
begin
  if to_regclass('public.academy_quiz_questions') is null then
    raise exception 'A tabela public.academy_quiz_questions nao existe. Rode primeiro o SQL base da Academia.';
  end if;
end;
$quiz_bank_400$;

with
series as (
  select generate_series(1, 20) as n
),
math_candidates as (
  select
    'matematica'::text subject_name, 'base'::text challenge_scope, null::text course_area,
    format('Uma biblioteca tinha %s livros e recebeu mais %s. Quantos livros ela tem agora?', 35 + n * 3, 8 + n) prompt,
    ((35 + n * 3) + (8 + n))::text answer,
    ((35 + n * 3) + (8 + n) + 2)::text wrong_1,
    ((35 + n * 3) + (8 + n) - 3)::text wrong_2,
    ((35 + n * 3) + (8 + n) + 10)::text wrong_3,
    'Some a quantidade inicial com os livros recebidos.'::text explanation, 1::smallint difficulty, n
  from series
  union all
  select 'matematica','base',null,
    format('Uma escola comprou %s cadernos e distribuiu %s. Quantos sobraram?', 90 + n * 4, 15 + n),
    ((90 + n * 4) - (15 + n))::text,
    ((90 + n * 4) - (15 + n) + 5)::text,
    ((90 + n * 4) - (15 + n) - 4)::text,
    ((90 + n * 4) + (15 + n))::text,
    'Subtraia os cadernos distribuídos do total comprado.',1,n + 20
  from series
  union all
  select 'matematica','base',null,
    format('Há %s caixas com %s lápis em cada uma. Quantos lápis há ao todo?', 2 + (n % 9), 4 + n),
    ((2 + (n % 9)) * (4 + n))::text,
    (((2 + (n % 9)) * (4 + n)) + (2 + (n % 9)))::text,
    (((2 + (n % 9)) * (4 + n)) - (2 + (n % 9)))::text,
    ((2 + (n % 9)) + (4 + n))::text,
    'Multiplique o número de caixas pela quantidade em cada caixa.',2,n + 40
  from series
  union all
  select 'matematica','base',null,
    format('%s figurinhas foram divididas igualmente entre %s estudantes. Quantas cada estudante recebeu?', (3 + (n % 8)) * (5 + n), 3 + (n % 8)),
    (5 + n)::text,
    (4 + n)::text,
    (6 + n)::text,
    ((3 + (n % 8)) * (5 + n))::text,
    'Divida o total de figurinhas pela quantidade de estudantes.',2,n + 60
  from series
  union all
  select 'matematica','base',null,
    format('Quanto é %s%% de %s?', (1 + (n % 4)) * 10, 50 + n * 10),
    (((1 + (n % 4)) * 10 * (50 + n * 10)) / 100)::text,
    ((((1 + (n % 4)) * 10 * (50 + n * 10)) / 100) + 5)::text,
    ((((1 + (n % 4)) * 10 * (50 + n * 10)) / 100) + 10)::text,
    greatest(1, (((1 + (n % 4)) * 10 * (50 + n * 10)) / 100) - 5)::text,
    'Transforme a porcentagem em fração de 100 e multiplique pelo valor.',3,n + 80
  from series
),
portuguese_facts as (
  select *
  from unnest(
    array['animal','papel','farol','azul','jardim','cidadão','pão','mão','alemão','capitão','cão','flor','professor','mulher','homem','jovem','mês','país','lápis','ônibus'],
    array['animais','papéis','faróis','azuis','jardins','cidadãos','pães','mãos','alemães','capitães','cães','flores','professores','mulheres','homens','jovens','meses','países','lápis','ônibus'],
    array['rápido','claro','alto','forte','cheio','novo','cedo','perto','alegre','fácil','quente','longo','rico','duro','doce','calmo','limpo','aberto','grande','corajoso'],
    array['lento','escuro','baixo','fraco','vazio','velho','tarde','longe','triste','difícil','frio','curto','pobre','macio','amargo','agitado','sujo','fechado','pequeno','medroso'],
    array['bonito','feliz','rápido','calmo','esperto','começo','casa','trabalho','ajuda','caminho','aluno','professor','erro','resposta','história','coragem','amizade','alegria','cuidado','mudança'],
    array['belo','contente','veloz','tranquilo','inteligente','início','lar','emprego','auxílio','trajeto','estudante','docente','engano','solução','relato','bravura','companheirismo','felicidade','atenção','transformação']
  ) with ordinality as f(singular, plural, antonym_word, antonym, synonym_word, synonym, n)
),
portuguese_candidates as (
  select 'portugues'::text subject_name,'base'::text challenge_scope,null::text course_area,
    format('Qual é o plural correto de “%s”?', singular) prompt,
    plural answer, 'um ' || singular wrong_1, singular || 'ões' wrong_2, singular || 'zes' wrong_3,
    format('O plural correto de “%s” é “%s”.', singular, plural) explanation,1::smallint difficulty,n::int
  from portuguese_facts
  union all
  select 'portugues','base',null,
    format('Qual palavra tem sentido contrário a “%s”?', antonym_word),
    antonym, synonym, plural, singular,
    format('“%s” é antônimo de “%s”.', antonym, antonym_word),1,(n + 20)::int
  from portuguese_facts
  union all
  select 'portugues','base',null,
    format('Qual palavra é sinônimo de “%s”?', synonym_word),
    synonym, antonym, plural, singular,
    format('“%s” tem sentido semelhante a “%s”.', synonym, synonym_word),2,(n + 40)::int
  from portuguese_facts
  union all
  select 'portugues','base',null,
    format('Na frase “Os %s estudam todos os dias”, qual é o núcleo do sujeito?', plural),
    plural, 'estudam', 'todos', 'dias',
    format('O núcleo do sujeito “Os %s” é o substantivo “%s”.', plural, plural),2,(n + 60)::int
  from portuguese_facts
  union all
  select 'portugues','base',null,
    format('Complete corretamente: “Ontem, nós ___ sobre %s.”', synonym_word),
    'estudamos', 'estudaremos', 'estudaria', 'estudar',
    'A palavra “ontem” pede o verbo no passado: estudamos.',2,(n + 80)::int
  from portuguese_facts
),
english_facts as (
  select *
  from unnest(
    array['book','school','teacher','student','house','water','food','friend','family','city','computer','window','door','chair','table','dog','cat','sun','moon','world'],
    array['livro','escola','professor','estudante','casa','água','comida','amigo','família','cidade','computador','janela','porta','cadeira','mesa','cachorro','gato','sol','lua','mundo'],
    array['read','write','study','learn','teach','speak','listen','walk','run','open','close','help','play','work','live','eat','drink','sleep','think','answer'],
    array['ler','escrever','estudar','aprender','ensinar','falar','escutar','caminhar','correr','abrir','fechar','ajudar','brincar','trabalhar','viver','comer','beber','dormir','pensar','responder'],
    array['happy','sad','big','small','fast','slow','hot','cold','easy','difficult','young','old','strong','weak','clean','dirty','new','beautiful','good','bad'],
    array['feliz','triste','grande','pequeno','rápido','lento','quente','frio','fácil','difícil','jovem','velho','forte','fraco','limpo','sujo','novo','bonito','bom','ruim']
  ) with ordinality as f(noun_en, noun_pt, verb_en, verb_pt, adjective_en, adjective_pt, n)
),
english_candidates as (
  select 'ingles'::text subject_name,'base'::text challenge_scope,null::text course_area,
    format('What is the Portuguese translation of “%s”?', noun_en) prompt,
    noun_pt answer, verb_pt wrong_1, adjective_pt wrong_2, noun_en wrong_3,
    format('“%s” significa “%s”.', noun_en, noun_pt) explanation,1::smallint difficulty,n::int
  from english_facts
  union all
  select 'ingles','base',null,
    format('Como se diz “%s” em inglês?', noun_pt),
    noun_en, verb_en, adjective_en, noun_pt,
    format('“%s” em inglês é “%s”.', noun_pt, noun_en),1,(n + 20)::int
  from english_facts
  union all
  select 'ingles','base',null,
    format('What is the Portuguese translation of the verb “%s”?', verb_en),
    verb_pt, noun_pt, adjective_pt, verb_en,
    format('O verbo “%s” significa “%s”.', verb_en, verb_pt),2,(n + 40)::int
  from english_facts
  union all
  select 'ingles','base',null,
    format('Como se diz “%s” em inglês?', adjective_pt),
    adjective_en, noun_en, verb_en, adjective_pt,
    format('“%s” em inglês é “%s”.', adjective_pt, adjective_en),2,(n + 60)::int
  from english_facts
  union all
  select 'ingles','base',null,
    format('Complete: “I ___ every day.” Use o verbo “%s”.', verb_pt),
    verb_en, verb_en || 's', verb_en || 'ed', 'am ' || verb_en,
    'Com “I” no presente simples, usa-se a forma básica do verbo.',3,(n + 80)::int
  from english_facts
),
chemistry_facts as (
  select *
  from unnest(
    array['H','He','Li','Be','B','C','N','O','F','Ne','Na','Mg','Al','Si','P','S','Cl','Ar','K','Ca'],
    array['Hidrogênio','Hélio','Lítio','Berílio','Boro','Carbono','Nitrogênio','Oxigênio','Flúor','Neônio','Sódio','Magnésio','Alumínio','Silício','Fósforo','Enxofre','Cloro','Argônio','Potássio','Cálcio'],
    array[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20]
  ) with ordinality as f(symbol, element_name, atomic_number, n)
),
chemistry_candidates as (
  select 'quimica'::text subject_name,'base'::text challenge_scope,null::text course_area,
    format('Qual é o símbolo químico do elemento %s?', element_name) prompt,
    symbol answer, element_name wrong_1, (symbol || '2') wrong_2, ('X' || symbol) wrong_3,
    format('O símbolo de %s é %s.', element_name, symbol) explanation,1::smallint difficulty,n::int
  from chemistry_facts
  union all
  select 'quimica','base',null,
    format('Qual elemento químico é representado pelo símbolo %s?', symbol),
    element_name, 'Mercúrio', 'Ferro', 'Cobre',
    format('O símbolo %s representa o elemento %s.', symbol, element_name),1,(n + 20)::int
  from chemistry_facts
  union all
  select 'quimica','base',null,
    format('Qual é o número atômico do %s (%s)?', element_name, symbol),
    atomic_number::text, (atomic_number + 1)::text, (atomic_number + 2)::text, (atomic_number + 10)::text,
    'O número atômico corresponde à quantidade de prótons no núcleo.',2,(n + 40)::int
  from chemistry_facts
  union all
  select 'quimica','base',null,
    format('Um átomo neutro de %s tem %s prótons. Quantos elétrons ele possui?', element_name, atomic_number),
    atomic_number::text, (atomic_number + 1)::text, greatest(0, atomic_number - 1)::text, (atomic_number * 2)::text,
    'Em um átomo neutro, o número de elétrons é igual ao de prótons.',2,(n + 60)::int
  from chemistry_facts
  union all
  select 'quimica','base',null,
    format('Um íon de %s perdeu um elétron. Se o átomo neutro tem %s elétrons, quantos restaram?', element_name, atomic_number),
    greatest(0, atomic_number - 1)::text, atomic_number::text, (atomic_number + 1)::text, (atomic_number + 2)::text,
    'Quando um átomo perde um elétron, forma um cátion e fica com um elétron a menos.',3,(n + 80)::int
  from chemistry_facts
),
all_candidates as (
  select * from math_candidates
  union all select * from portuguese_candidates
  union all select * from english_candidates
  union all select * from chemistry_candidates
),
rotated as (
  select
    subject_name,
    challenge_scope,
    course_area,
    prompt,
    case (n % 4) when 0 then answer when 1 then wrong_1 when 2 then wrong_2 else wrong_3 end option_a,
    case (n % 4) when 0 then wrong_1 when 1 then answer when 2 then wrong_3 else wrong_2 end option_b,
    case (n % 4) when 0 then wrong_2 when 1 then wrong_3 when 2 then answer else wrong_1 end option_c,
    case (n % 4) when 0 then wrong_3 when 1 then wrong_2 when 2 then wrong_1 else answer end option_d,
    case (n % 4) when 0 then 'A' when 1 then 'B' when 2 then 'C' else 'D' end correct_option,
    explanation,
    difficulty
  from all_candidates
)
insert into public.academy_quiz_questions (
  subject_name,
  challenge_scope,
  course_area,
  prompt,
  option_a,
  option_b,
  option_c,
  option_d,
  correct_option,
  explanation,
  difficulty,
  is_active
)
select
  r.subject_name,
  r.challenge_scope,
  r.course_area,
  r.prompt,
  r.option_a,
  r.option_b,
  r.option_c,
  r.option_d,
  r.correct_option,
  r.explanation,
  r.difficulty,
  true
from rotated r
where not exists (
  select 1
  from public.academy_quiz_questions q
  where q.subject_name = r.subject_name
    and q.prompt = r.prompt
);

-- Índices usados pela seleção aleatória e pelo histórico antirrepetição.
create index if not exists academy_quiz_questions_active_subject_idx
  on public.academy_quiz_questions (subject_name, is_active);

create index if not exists chat_pet_quiz_attempts_profile_question_history_idx
  on public.chat_pet_quiz_attempts (profile_id, started_at desc);

-- Conferência: deve mostrar pelo menos 100 questões novas por matéria.
select
  subject_name as materia,
  count(*) filter (where is_active) as perguntas_ativas
from public.academy_quiz_questions
where subject_name in ('matematica', 'portugues', 'ingles', 'quimica')
group by subject_name
order by subject_name;
