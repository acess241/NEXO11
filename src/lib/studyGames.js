export const STUDY_FILTERS = [
  { id: 'none', label: 'Sem filtro', subject: 'Câmera', icon: 'none', color: '#d1d9d3', description: 'Entre na câmera limpa e deslize para escolher um desafio.', rounds: 0 },
  { id: 'vira', label: 'Vira e Responde', subject: 'Reflexo', icon: 'flip', color: '#8ef6ff', description: 'Incline a cabeça para a esquerda ou para a direita e escolha a resposta.', rounds: 4, tilt: true },
  { id: 'vf', label: 'V ou F?', subject: 'Raciocínio', icon: 'judge', color: '#b4ff72', description: 'Julgue cada afirmação como verdadeira ou falsa.', rounds: 4 },
  { id: 'faltando', label: 'Tá Faltando!', subject: 'Matemática', icon: 'numbers', color: '#ffd166', description: 'Complete a conta ou descubra o próximo passo da sequência.', rounds: 4 },
  { id: 'comparar', label: 'Maior, Menor ou Igual', subject: 'Matemática', icon: 'numbers', color: '#ff9fca', description: 'Compare os números antes que a dúvida compare você.', rounds: 4 },
  { id: 'porcentagem', label: 'Porcentou', subject: 'Matemática', icon: 'numbers', color: '#ffbd7a', description: 'Porcentagens curtas, respostas rápidas e zero enrolação.', rounds: 4 },
  { id: 'tabuada', label: 'Tabuada Turbo', subject: 'Matemática', icon: 'numbers', color: '#ffe86b', description: 'A tabuada entrou no modo turbo. Respira e responde.', rounds: 5 },
  { id: 'segundos', label: '10 Segundos', subject: 'Velocidade', icon: 'play', color: '#70f5c1', description: 'Cada rodada começa com dez segundos no relógio.', rounds: 4, timeLimit: 10 },
  { id: 'sem-errar', label: '5 Sem Errar', subject: 'Sequência', icon: 'route', color: '#c6a7ff', description: 'Cinco acertos seguidos. Um erro encerra a sequência.', rounds: 5, streak: true },
  { id: 'sobrevive', label: 'Sobrevive Aí', subject: 'Resistência', icon: 'route', color: '#ff7b9d', description: 'Responda enquanto conseguir. Um erro encerra o desafio.', rounds: 8, survival: true },
  { id: 'portugues-pressao', label: 'Português na Pressão', subject: 'Português', icon: 'letters', color: '#d2b4ff', description: 'Português rápido para quem gosta de pensar em alta velocidade.', rounds: 5, timeLimit: 10 },
  { id: 'certo', label: 'Qual Tá Certo?', subject: 'Português', icon: 'letters', color: '#ffb3d1', description: 'Escolha a palavra escrita corretamente.', rounds: 4 },
  { id: 'completa', label: 'Completa Aí', subject: 'Português', icon: 'letters', color: '#ffa8a8', description: 'Complete as frases com a palavra que faz sentido.', rounds: 4 },
  { id: 'verbo', label: 'Caça-Verbo', subject: 'Português', icon: 'letters', color: '#b4c7ff', description: 'Encontre o verbo escondido em cada frase.', rounds: 4 },
  { id: 'bio', label: 'BioFlash', subject: 'Biologia', icon: 'lab', color: '#7ff7a2', description: 'Biologia em flashes: corpo, células e vida.', rounds: 4 },
  { id: 'orgao', label: 'Que Órgão É Esse?', subject: 'Biologia', icon: 'lab', color: '#77e8df', description: 'Relacione órgãos e funções do corpo humano.', rounds: 4 },
  { id: 'vida', label: 'Vida ou Planta?', subject: 'Ciências', icon: 'food', color: '#a8e86d', description: 'Seres vivos, plantas e animais em uma disputa simpática.', rounds: 4 },
  { id: 'tempo', label: 'Volta no Tempo', subject: 'História', icon: 'route', color: '#f1c17b', description: 'Viaje por acontecimentos que marcaram o mundo.', rounds: 4 },
  { id: 'quem', label: 'Quem Foi?', subject: 'História', icon: 'judge', color: '#e8a5ff', description: 'Reconheça personagens históricos pelas suas pistas.', rounds: 4 },
  { id: 'geo', label: 'GeoGiro', subject: 'Geografia', icon: 'route', color: '#82cfff', description: 'Gire o mapa mental e encontre a resposta.', rounds: 4 },
  { id: 'capital', label: 'Capital na Cabeça', subject: 'Geografia', icon: 'route', color: '#8be9ff', description: 'Estados e capitais sem abrir o mapa.', rounds: 4 },
  { id: 'onde', label: 'Onde Fica?', subject: 'Geografia', icon: 'route', color: '#70b8ff', description: 'Localize lugares e continentes com rapidez.', rounds: 4 },
  { id: 'fisica', label: 'Física em Movimento', subject: 'Física', icon: 'play', color: '#a4b8ff', description: 'Movimento, força e energia em perguntas visuais.', rounds: 4 },
  { id: 'quimica', label: 'Quimicando', subject: 'Química', icon: 'lab', color: '#e0a6ff', description: 'Misture curiosidade com conceitos de química.', rounds: 4 },
  { id: 'elemento', label: 'Que Elemento É?', subject: 'Química', icon: 'lab', color: '#91f0d0', description: 'Descubra os elementos pela pista certa.', rounds: 4 },
  { id: 'english', label: 'English Now', subject: 'Inglês', icon: 'chat', color: '#92b9ff', description: 'Inglês rápido para soltar a língua.', rounds: 4 },
  { id: 'traduz', label: 'Traduz Aí', subject: 'Inglês', icon: 'chat', color: '#a9e1ff', description: 'Traduza palavras e frases do dia a dia.', rounds: 4 },
]

const q = (prompt, options, answer, hint) => ({ prompt, options, answer, hint })

export const GAME_QUESTIONS = {
  vira: [
    q('Incline para o lado correto: 7 × 8.', ['Esquerda: 54', 'Direita: 56'], 'Direita: 56', '7 × 8 = 56.'),
    q('Incline para o lado correto: capital do Brasil.', ['Esquerda: Brasília', 'Direita: Salvador'], 'Esquerda: Brasília', 'Brasília é a capital do Brasil.'),
    q('Incline para o lado correto: passado de go.', ['Esquerda: goed', 'Direita: went'], 'Direita: went', 'O passado simples de go é went.'),
    q('Incline para o lado correto: órgão que bombeia sangue.', ['Esquerda: pulmão', 'Direita: coração'], 'Direita: coração', 'O coração impulsiona o sangue pelo corpo.'),
  ],
  vf: [
    q('A água ferve a 100 °C ao nível do mar.', ['Verdadeiro', 'Falso'], 'Verdadeiro', 'A pressão atmosférica altera o ponto de ebulição.'),
    q('O verbo indica uma ação, estado ou fenômeno.', ['Verdadeiro', 'Falso'], 'Verdadeiro', 'Essa é uma das funções do verbo.'),
    q('A Amazônia fica totalmente dentro do Brasil.', ['Verdadeiro', 'Falso'], 'Falso', 'A floresta também se estende por outros países.'),
    q('3/4 é igual a 75%.', ['Verdadeiro', 'Falso'], 'Verdadeiro', '3 ÷ 4 = 0,75, ou 75%.'),
  ],
  faltando: [
    q('Complete: 5, 10, 15, __.', ['18', '20', '25'], '20', 'A sequência aumenta de 5 em 5.'),
    q('Complete: 2 × __ = 18.', ['7', '8', '9'], '9', '18 ÷ 2 = 9.'),
    q('Complete: 100, 90, 80, __.', ['60', '70', '75'], '70', 'A sequência diminui de 10 em 10.'),
    q('Complete: 1, 4, 9, __.', ['12', '16', '18'], '16', 'São quadrados: 1², 2², 3² e 4².'),
  ],
  comparar: [
    q('Qual relação está correta? 48 __ 84', ['>', '<', '='], '<', '48 é menor que 84.'),
    q('Qual relação está correta? 3/4 __ 0,5', ['>', '<', '='], '>', '3/4 = 0,75, maior que 0,5.'),
    q('Qual relação está correta? 12 × 2 __ 24', ['>', '<', '='], '=', '12 × 2 = 24.'),
    q('Qual é o maior número?', ['0,8', '0,08', '0,18'], '0,8', '0,8 tem oito décimos.'),
  ],
  porcentagem: [
    q('Quanto é 10% de 90?', ['9', '10', '19'], '9', '10% é a décima parte.'),
    q('Quanto é 50% de 64?', ['16', '32', '48'], '32', '50% é a metade.'),
    q('Quanto é 25% de 120?', ['20', '30', '40'], '30', '25% é um quarto de 120.'),
    q('Um produto de R$ 80 tem 10% de desconto. Preço final?', ['R$ 70', 'R$ 72', 'R$ 78'], 'R$ 72', '10% de 80 é 8; 80 − 8 = 72.'),
  ],
  tabuada: [
    q('6 × 7 = ?', ['36', '42', '48'], '42', '6 grupos de 7 formam 42.'),
    q('8 × 9 = ?', ['63', '72', '81'], '72', '8 × 9 = 72.'),
    q('7 × 6 = ?', ['36', '42', '48'], '42', 'A ordem dos fatores não muda o produto.'),
    q('9 × 4 = ?', ['27', '32', '36'], '36', '9 × 4 = 36.'),
    q('12 × 3 = ?', ['30', '36', '39'], '36', '12 + 12 + 12 = 36.'),
  ],
  segundos: [
    q('Qual é o próximo número? 11, 22, 33, __.', ['40', '44', '55'], '44', 'A sequência soma 11.'),
    q('Qual palavra é um substantivo?', ['correr', 'bonito', 'janela'], 'janela', 'Janela nomeia uma coisa.'),
    q('Qual planeta é conhecido como planeta vermelho?', ['Marte', 'Saturno', 'Vênus'], 'Marte', 'O ferro oxidado dá a Marte sua aparência avermelhada.'),
    q('Quanto é 9²?', ['18', '72', '81'], '81', '9 × 9 = 81.'),
  ],
  'sem-errar': [
    q('12 + 19 = ?', ['29', '31', '39'], '31', '12 + 19 = 31.'),
    q('Qual é um mamífero?', ['golfinho', 'sardinha', 'tartaruga'], 'golfinho', 'Golfinhos respiram ar e amamentam.'),
    q('Sinônimo de feliz:', ['contente', 'distante', 'pesado'], 'contente', 'Contente significa feliz.'),
    q('Qual é a capital de Pernambuco?', ['Recife', 'Natal', 'Maceió'], 'Recife', 'Recife é a capital pernambucana.'),
    q('Qual gás as plantas usam na fotossíntese?', ['oxigênio', 'gás carbônico', 'hélio'], 'gás carbônico', 'O CO₂ entra como matéria-prima da fotossíntese.'),
  ],
  sobrevive: [
    q('5 × 9 = ?', ['35', '45', '55'], '45', '5 × 9 = 45.'),
    q('Qual é o plural de pão?', ['pãos', 'pães', 'pões'], 'pães', 'O plural irregular é pães.'),
    q('Qual continente tem o Brasil?', ['América do Sul', 'Europa', 'África'], 'América do Sul', 'O Brasil está na América do Sul.'),
    q('Qual força nos mantém no chão?', ['gravidade', 'luz', 'eletricidade'], 'gravidade', 'A gravidade atrai os corpos para a Terra.'),
    q('Qual é 20% de 50?', ['5', '10', '20'], '10', '20% de 50 = 10.'),
    q('Qual órgão usamos para respirar?', ['pulmões', 'rins', 'fígado'], 'pulmões', 'Os pulmões fazem trocas gasosas.'),
    q('Qual é o antônimo de claro?', ['brilhante', 'escuro', 'limpo'], 'escuro', 'Escuro é o oposto de claro.'),
    q('Qual planeta é o terceiro a partir do Sol?', ['Terra', 'Marte', 'Júpiter'], 'Terra', 'A ordem é Mercúrio, Vênus, Terra.'),
  ],
  'portugues-pressao': [
    q('Qual frase está correta?', ['Havia muitas pessoas.', 'Haviam muitas pessoas.'], 'Havia muitas pessoas.', 'Haver no sentido de existir fica no singular.'),
    q('Qual é o antônimo de breve?', ['longo', 'rápido', 'leve'], 'longo', 'Breve significa curto.'),
    q('Qual palavra é oxítona?', ['café', 'árvore', 'lâmpada'], 'café', 'A sílaba tônica de café é a última.'),
    q('Qual pontuação encerra uma pergunta?', ['!', '?', ';'], '?', 'O ponto de interrogação marca pergunta.'),
    q('Qual é o feminino de ator?', ['atora', 'atriz', 'atores'], 'atriz', 'O feminino consagrado é atriz.'),
  ],
  certo: [
    q('Qual palavra está escrita corretamente?', ['exceção', 'excessão', 'esceção'], 'exceção', 'A grafia correta é exceção.'),
    q('Qual palavra está escrita corretamente?', ['beneficiente', 'beneficente', 'benificente'], 'beneficente', 'Beneficente vem de benefício.'),
    q('Qual palavra está escrita corretamente?', ['privilégio', 'previlégio', 'privilêgio'], 'privilégio', 'A grafia correta é privilégio.'),
    q('Qual palavra está escrita corretamente?', ['reinvindicar', 'reivindicar', 'reinvincar'], 'reivindicar', 'Reivindicar começa com rei.'),
  ],
  completa: [
    q('Complete: Quem espera sempre…', ['alcança', 'cansa', 'perde'], 'alcança', 'Quem espera sempre alcança.'),
    q('Complete: Água mole em pedra dura…', ['tanto bate até que fura', 'fica parada', 'vira gelo'], 'tanto bate até que fura', 'É um ditado sobre persistência.'),
    q('Complete: O sol nasce…', ['no oeste', 'no leste', 'no sul'], 'no leste', 'O movimento aparente começa no leste.'),
    q('Complete: Mais vale um pássaro na mão…', ['que dois voando', 'que três na árvore', 'do que um peixe'], 'que dois voando', 'O provérbio fala de valorizar o que já se tem.'),
  ],
  verbo: [
    q('Qual é o verbo? “A menina desenhou uma estrela.”', ['menina', 'desenhou', 'estrela'], 'desenhou', 'Desenhou indica a ação.'),
    q('Qual é o verbo? “O vento sopra forte.”', ['vento', 'sopra', 'forte'], 'sopra', 'Sopra indica o que o vento faz.'),
    q('Qual é o verbo? “Nós somos curiosos.”', ['Nós', 'somos', 'curiosos'], 'somos', 'Somos indica estado.'),
    q('Qual é o verbo? “As crianças brincam no pátio.”', ['crianças', 'brincam', 'pátio'], 'brincam', 'Brincam indica a ação.'),
  ],
  bio: [
    q('Qual estrutura contém o material genético?', ['DNA', 'água', 'glicose'], 'DNA', 'O DNA armazena informações genéticas.'),
    q('Qual processo as plantas usam para produzir alimento?', ['fotossíntese', 'digestão', 'combustão'], 'fotossíntese', 'Luz, água e CO₂ participam da fotossíntese.'),
    q('Qual célula transporta oxigênio?', ['hemácia', 'neurônio', 'plaqueta'], 'hemácia', 'Hemácias têm hemoglobina.'),
    q('Qual sistema coordena respostas do corpo?', ['nervoso', 'digestório', 'urinário'], 'nervoso', 'O sistema nervoso recebe e envia sinais.'),
  ],
  orgao: [
    q('Qual órgão filtra o sangue e produz urina?', ['rins', 'pulmões', 'pele'], 'rins', 'Os rins filtram o sangue.'),
    q('Qual órgão produz a bile?', ['fígado', 'coração', 'pâncreas'], 'fígado', 'O fígado produz a bile.'),
    q('Qual órgão é responsável pelo pensamento?', ['cérebro', 'estômago', 'intestino'], 'cérebro', 'O cérebro coordena pensamentos e ações.'),
    q('Qual órgão faz a maior parte da absorção de nutrientes?', ['intestino delgado', 'esôfago', 'traqueia'], 'intestino delgado', 'As vilosidades ampliam sua absorção.'),
  ],
  vida: [
    q('Qual é um ser vivo?', ['fungo', 'pedra', 'água'], 'fungo', 'Fungos são seres vivos.'),
    q('Qual grupo produz seu próprio alimento pela fotossíntese?', ['plantas', 'mamíferos', 'peixes'], 'plantas', 'Plantas são organismos autotróficos.'),
    q('Qual animal é ovíparo?', ['galinha', 'cachorro', 'gato'], 'galinha', 'A galinha põe ovos.'),
    q('Qual precisa de luz para crescer?', ['planta', 'pedra', 'copo'], 'planta', 'A luz é essencial para a fotossíntese.'),
  ],
  tempo: [
    q('Em que ano começou a Independência do Brasil?', ['1500', '1822', '1889'], '1822', 'A declaração ocorreu em 1822.'),
    q('Qual civilização construiu as pirâmides de Gizé?', ['egípcia', 'romana', 'inca'], 'egípcia', 'As pirâmides ficam no Egito.'),
    q('A escrita cuneiforme é associada a qual região antiga?', ['Mesopotâmia', 'Escandinávia', 'Oceania'], 'Mesopotâmia', 'A escrita surgiu entre povos mesopotâmicos.'),
    q('Qual evento marcou 1889 no Brasil?', ['Proclamação da República', 'Independência', 'Descobrimento'], 'Proclamação da República', 'A República foi proclamada em 1889.'),
  ],
  quem: [
    q('Quem escreveu “Dom Casmurro”?', ['Machado de Assis', 'Cecília Meireles', 'Graciliano Ramos'], 'Machado de Assis', 'Bentinho é personagem de Machado.'),
    q('Quem foi conhecido como o Rei do Futebol?', ['Pelé', 'Ayrton Senna', 'Oscar'], 'Pelé', 'Pelé é uma referência mundial do futebol.'),
    q('Quem pintou a Mona Lisa?', ['Leonardo da Vinci', 'Van Gogh', 'Portinari'], 'Leonardo da Vinci', 'A obra é de Leonardo.'),
    q('Quem liderou a luta pelos direitos civis nos EUA?', ['Martin Luther King Jr.', 'Isaac Newton', 'Charles Darwin'], 'Martin Luther King Jr.', 'Ele defendeu igualdade e não violência.'),
  ],
  geo: [
    q('Qual é o maior continente?', ['Ásia', 'África', 'Europa'], 'Ásia', 'A Ásia é o maior continente em área.'),
    q('Qual linha divide a Terra em norte e sul?', ['Equador', 'Greenwich', 'Trópico de Capricórnio'], 'Equador', 'A linha do Equador fica na latitude 0°.'),
    q('Qual bioma é típico do Nordeste brasileiro?', ['Caatinga', 'Pampa', 'Pantanal'], 'Caatinga', 'A Caatinga é exclusiva do Brasil.'),
    q('Qual oceano banha a costa brasileira?', ['Atlântico', 'Pacífico', 'Índico'], 'Atlântico', 'O Brasil está voltado para o Atlântico.'),
  ],
  capital: [
    q('Qual é a capital de Minas Gerais?', ['Belo Horizonte', 'Vitória', 'Goiânia'], 'Belo Horizonte', 'Belo Horizonte é a capital mineira.'),
    q('Qual é a capital da Bahia?', ['Salvador', 'Aracaju', 'Recife'], 'Salvador', 'Salvador é a capital baiana.'),
    q('Qual é a capital do Ceará?', ['Fortaleza', 'Natal', 'Teresina'], 'Fortaleza', 'Fortaleza é a capital cearense.'),
    q('Qual é a capital do Pará?', ['Belém', 'Macapá', 'Manaus'], 'Belém', 'Belém é a capital paraense.'),
  ],
  onde: [
    q('Onde fica o deserto do Saara?', ['África', 'Ásia', 'América do Sul'], 'África', 'O Saara ocupa o norte da África.'),
    q('Onde fica a Cordilheira dos Andes?', ['oeste da América do Sul', 'leste da Europa', 'norte da África'], 'oeste da América do Sul', 'Os Andes acompanham a costa oeste sul-americana.'),
    q('Onde fica o Japão?', ['Ásia', 'África', 'Oceania'], 'Ásia', 'O Japão está no leste da Ásia.'),
    q('Onde fica a Amazônia brasileira?', ['norte do Brasil', 'sul do Brasil', 'litoral do Sudeste'], 'norte do Brasil', 'A maior parte fica na região Norte.'),
  ],
  fisica: [
    q('Qual força puxa os objetos para a Terra?', ['gravidade', 'atrito', 'empuxo'], 'gravidade', 'A gravidade atrai massas.'),
    q('O que acontece com a velocidade quando um carro acelera?', ['aumenta', 'diminui', 'fica sempre igual'], 'aumenta', 'Aceleração positiva aumenta a velocidade.'),
    q('Qual unidade mede força?', ['newton', 'watt', 'metro'], 'newton', 'A força é medida em newtons (N).'),
    q('Qual forma de energia vem do movimento?', ['cinética', 'química', 'nuclear'], 'cinética', 'Energia cinética é energia de movimento.'),
  ],
  quimica: [
    q('Qual estado tem volume e forma definidos?', ['sólido', 'líquido', 'gasoso'], 'sólido', 'Sólidos mantêm forma e volume.'),
    q('Mistura de água e sal é…', ['homogênea', 'heterogênea', 'um elemento'], 'homogênea', 'O sal se dissolve e forma uma única fase.'),
    q('Qual gás é essencial para a combustão?', ['oxigênio', 'nitrogênio', 'hélio'], 'oxigênio', 'O oxigênio alimenta a combustão.'),
    q('Qual partícula tem carga negativa?', ['elétron', 'próton', 'nêutron'], 'elétron', 'Elétrons têm carga negativa.'),
  ],
  elemento: [
    q('Qual elemento tem símbolo O?', ['oxigênio', 'ouro', 'ósmio'], 'oxigênio', 'O é o símbolo do oxigênio.'),
    q('Qual elemento tem símbolo Fe?', ['ferro', 'flúor', 'frâncio'], 'ferro', 'Fe vem do latim ferrum.'),
    q('Qual elemento é essencial nos ossos?', ['cálcio', 'cloro', 'cobalto'], 'cálcio', 'O cálcio ajuda a formar ossos e dentes.'),
    q('Qual elemento é um gás nobre?', ['hélio', 'hidrogênio', 'cloro'], 'hélio', 'O hélio pertence aos gases nobres.'),
  ],
  english: [
    q('Como se diz “casa” em inglês?', ['House', 'Horse', 'Homework'], 'House', 'House significa casa.'),
    q('Complete: I ___ a student.', ['am', 'are', 'is'], 'am', 'Com I usamos am.'),
    q('Qual é o passado de “go”?', ['goed', 'went', 'gone'], 'went', 'O passado simples de go é went.'),
    q('“She likes books” significa…', ['Ela gosta de livros', 'Ela escreve livros', 'Ela compra livros'], 'Ela gosta de livros', 'Likes significa gosta.'),
  ],
  traduz: [
    q('Traduza “morning”.', ['manhã', 'noite', 'tarde'], 'manhã', 'Morning é manhã.'),
    q('Traduza “friend”.', ['professor', 'amigo', 'vizinho'], 'amigo', 'Friend é amigo.'),
    q('Traduza “school”.', ['casa', 'escola', 'cidade'], 'escola', 'School é escola.'),
    q('Traduza “I am ready”.', ['Eu estou pronto', 'Eu estou cansado', 'Eu vou embora'], 'Eu estou pronto', 'Ready significa pronto.'),
  ],
}

// Compatibilidade com os filtros antigos já usados em gravações salvas.
GAME_QUESTIONS.amigo = GAME_QUESTIONS.tabuada
GAME_QUESTIONS.tribunal = GAME_QUESTIONS.vf
GAME_QUESTIONS.cantina = GAME_QUESTIONS.porcentagem
GAME_QUESTIONS.lab = GAME_QUESTIONS.bio
GAME_QUESTIONS.ingles = GAME_QUESTIONS.english
GAME_QUESTIONS.frase = GAME_QUESTIONS.completa
GAME_QUESTIONS.conta = GAME_QUESTIONS.faltando
