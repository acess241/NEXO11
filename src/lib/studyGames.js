export const STUDY_FILTERS = [
  { id: 'amigo', label: 'Leve o amigo', subject: 'Matemática', icon: 'route', color: '#b2ee67', description: 'Três obstáculos. Um amigo esperando chegar em casa.', rounds: 3 },
  { id: 'tribunal', label: 'Tribunal da língua', subject: 'Português', icon: 'judge', color: '#d6b4ff', description: 'Assuma o tribunal e dê seu veredito sobre cada frase.', rounds: 4 },
  { id: 'cantina', label: 'Quem paga?', subject: 'Matemática', icon: 'food', color: '#ffbe79', description: 'Acerte a conta e encha sua bandeja de lanches.', rounds: 3 },
  { id: 'lab', label: 'Salve o amigo', subject: 'Ciências', icon: 'lab', color: '#88e6ed', description: 'Use a ciência para abrir as cápsulas do laboratório.', rounds: 3 },
  { id: 'ingles', label: 'English challenge', subject: 'Inglês', icon: 'chat', color: '#91baff', description: 'Quatro desafios rápidos. Toque na tradução correta.', rounds: 4 },
  { id: 'frase', label: 'Frase certa', subject: 'Português', icon: 'letters', color: '#ffc1d4', description: 'Toque nas palavras na ordem certa para montar a frase.', rounds: 3 },
  { id: 'conta', label: 'Conta caiu', subject: 'Matemática', icon: 'numbers', color: '#f6e685', description: 'Encontre o resultado e capture a bolha certa.', rounds: 4 },
  { id: 'none', label: 'Sem efeito', subject: 'Câmera', icon: 'none', color: '#d1d9d3', rounds: 0 },
]
const math = [
  { prompt: '7 × 8 = ?', options: ['54', '56', '64'], answer: '56', hint: '7 × 8 = 56.' },
  { prompt: '15 + 27 = ?', options: ['42', '41', '32'], answer: '42', hint: '15 + 20 + 7 = 42.' },
  { prompt: 'Qual destes números é primo?', options: ['9', '11', '15'], answer: '11', hint: '11 tem apenas dois divisores positivos: 1 e 11.' },
  { prompt: 'Quanto é 25% de 80?', options: ['15', '20', '25'], answer: '20', hint: '25% é um quarto. 80 ÷ 4 = 20.' },
]
export const GAME_QUESTIONS = {
  amigo: math, conta: math,
  tribunal: [
    { prompt: '“Eu não fui à aula por que estava doente.”', options: ['Tá certo!', 'Precisa corrigir!'], answer: 'Precisa corrigir!', hint: 'Aqui usamos “porque”, junto: ele introduz a explicação.' },
    { prompt: '“Os alunos chegaram cedo.”', options: ['Tá certo!', 'Precisa corrigir!'], answer: 'Tá certo!', hint: '“Alunos” e “chegaram” concordam no plural.' },
    { prompt: '“Fazem dois anos que estudo aqui.”', options: ['Tá certo!', 'Precisa corrigir!'], answer: 'Precisa corrigir!', hint: 'Para tempo decorrido, use “Faz dois anos”.' },
    { prompt: '“Ela trouxe o livro para mim.”', options: ['Tá certo!', 'Precisa corrigir!'], answer: 'Tá certo!', hint: '“Para mim” está correto: o pronome não é sujeito de um verbo.' },
  ],
  cantina: [
    { prompt: 'O lanche custa R$ 15 e tem 20% de desconto. Você paga…', options: ['R$ 10', 'R$ 12', 'R$ 13'], answer: 'R$ 12', hint: '20% de 15 = 3. Então, 15 − 3 = R$ 12.' },
    { prompt: 'Suco: R$ 4. Sanduíche: R$ 9. Pagou com R$ 20. Qual o troco?', options: ['R$ 5', 'R$ 7', 'R$ 9'], answer: 'R$ 7', hint: '4 + 9 = 13. O troco é 20 − 13 = R$ 7.' },
    { prompt: 'Três amigos dividem uma conta de R$ 24 igualmente. Cada um paga…', options: ['R$ 6', 'R$ 8', 'R$ 12'], answer: 'R$ 8', hint: '24 ÷ 3 = R$ 8 por pessoa.' },
  ],
  lab: [
    { prompt: 'Quem transporta oxigênio pelo sangue?', options: ['Hemácias', 'Neurônios', 'Plaquetas'], answer: 'Hemácias', hint: 'As hemácias transportam oxigênio com a ajuda da hemoglobina.' },
    { prompt: 'Qual órgão bombeia o sangue?', options: ['Pulmão', 'Coração', 'Estômago'], answer: 'Coração', hint: 'As contrações do coração impulsionam o sangue pelo corpo.' },
    { prompt: 'O que ajuda o corpo a combater infecções?', options: ['Leucócitos', 'Esmalte', 'Cabelo'], answer: 'Leucócitos', hint: 'Os leucócitos, ou glóbulos brancos, participam da defesa do organismo.' },
  ],
  ingles: [
    { prompt: 'Como se diz “casa” em inglês?', options: ['House', 'Horse', 'Homeworks'], answer: 'House', hint: 'House significa casa. Horse é cavalo.' },
    { prompt: 'Complete: I ___ a student.', options: ['am', 'are', 'is'], answer: 'am', hint: 'Com “I”, a forma do verbo to be é “am”.' },
    { prompt: 'Qual é o passado de “go”?', options: ['goed', 'went', 'gone'], answer: 'went', hint: 'O passado simples de go é went.' },
    { prompt: '“She likes books” significa…', options: ['Ela gosta de livros', 'Ela escreve livros'], answer: 'Ela gosta de livros', hint: 'Likes significa gosta; books significa livros.' },
  ],
  frase: [
    { prompt: 'Monte a frase começando por “O”.', options: ['estuda', 'O', 'aluno'], answer: 'O aluno estuda', hint: 'O aluno estuda.' },
    { prompt: 'Monte a frase começando por “Nós”.', options: ['juntos', 'aprendemos', 'Nós'], answer: 'Nós aprendemos juntos', hint: 'Nós aprendemos juntos.' },
    { prompt: 'Organize as partes de uma narrativa.', options: ['fim', 'início', 'meio'], answer: 'início meio fim', hint: 'A sequência é início → meio → fim.' },
  ],
}
