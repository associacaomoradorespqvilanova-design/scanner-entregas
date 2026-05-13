// URL do seu Web App do Google Apps Script (apenas para enviar os dados)
const WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbySC212AZVv5Whw-pPCmmUqwDfZGDQqw-Tlds8VBi8metYtDk-IqRF-jQj4TTXfshIdmg/exec';

const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const capturarBtn = document.getElementById('capturarBtn');
const iniciarCameraBtn = document.getElementById('iniciarCameraBtn');

let listaEntregas = [];
let cameraPronta = false;

// ==============================
// INICIAR CÂMERA (automática, com fallback)
// ==============================
async function tentarIniciarCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false
    });
    video.srcObject = stream;
    await new Promise(resolve => {
      video.onloadedmetadata = () => resolve();
      if (video.readyState >= 2) resolve();
    });
    await video.play();
    definirCameraPronta(true);
  } catch (err) {
    console.error(err);
    definirCameraPronta(false);
    iniciarCameraBtn.style.display = 'block';
    capturarBtn.disabled = false;
    capturarBtn.textContent = '📷 Permitir câmera';
  }
}

function definirCameraPronta(pronto) {
  cameraPronta = pronto;
  if (pronto) {
    capturarBtn.disabled = false;
    capturarBtn.textContent = '📷 Escanear Cartão';
    iniciarCameraBtn.style.display = 'none';
  } else {
    capturarBtn.disabled = true;
    capturarBtn.textContent = '🔒 Câmera não iniciada';
  }
}

async function iniciarCameraManual() {
  iniciarCameraBtn.style.display = 'none';
  capturarBtn.disabled = true;
  capturarBtn.textContent = '⏳ Iniciando câmera...';
  await tentarIniciarCamera();
}

iniciarCameraBtn.addEventListener('click', iniciarCameraManual);
document.getElementById('data').value = new Date().toLocaleDateString('pt-BR');

// ==============================
// PRÉ-PROCESSAMENTO PESADO DA IMAGEM
// ==============================
function preProcessarImagem(sourceCanvas) {
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = w;
  tempCanvas.height = h;
  const tCtx = tempCanvas.getContext('2d');
  tCtx.drawImage(sourceCanvas, 0, 0);
  
  const imageData = tCtx.getImageData(0, 0, w, h);
  const data = imageData.data;
  
  // 1. Escala de cinza + contraste extremo
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i+1];
    const b = data[i+2];
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    // Threshold adaptativo simples: se > 128, branco; senão preto
    const val = gray > 128 ? 255 : 0;
    data[i] = val;
    data[i+1] = val;
    data[i+2] = val;
  }
  tCtx.putImageData(imageData, 0, 0);
  
  // 2. Aumentar nitidez (filtro simples)
  // (opcional, podemos pular por simplicidade)
  
  return tempCanvas.toDataURL('image/png');
}

// ==============================
// OCR COM TESSERACT (offline)
// ==============================
async function realizarOCR(imagemDataURL) {
  const worker = await Tesseract.createWorker('por', 1, {
    logger: m => console.log(m)
  });
  
  // Configurar para reconhecer apenas caracteres que aparecem em endereços
  await worker.setParameters({
    tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÀÁÂÃÉÊÍÓÔÕÚÇàáâãéêíóôõúç0123456789-., ',
    preserve_interword_spaces: '1'
  });
  
  const { data: { text } } = await worker.recognize(imagemDataURL);
  await worker.terminate();
  return text;
}

// ==============================
// ESCANEAR CARTÃO
// ==============================
capturarBtn.addEventListener('click', async () => {
  if (!cameraPronta) return;
  
  capturarBtn.disabled = true;
  capturarBtn.textContent = '⏳ Processando imagem...';
  
  try {
    // Captura o frame
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Pré-processamento pesado
    const imagemProcessada = preProcessarImagem(canvas);
    
    // OCR
    const textoBruto = await realizarOCR(imagemProcessada);
    console.log('OCR original:', textoBruto);
    
    // Limpeza e extração inteligente
    const { nome, endereco } = extrairDados(textoBruto);
    
    // Exibir resultado
    document.getElementById('nome').value = nome;
    document.getElementById('endereco').value = endereco;
    document.getElementById('resultado').style.display = 'block';
    
    // Se ambos vazios, mostrar texto bruto para depuração (opcional)
    if (!nome && !endereco) {
      document.getElementById('debugCampo').style.display = 'block';
      document.getElementById('textoBruto').value = textoBruto;
    } else {
      document.getElementById('debugCampo').style.display = 'none';
    }
    
    mostrarStatus('✅ Leitura concluída', 'sucesso');
    
  } catch (err) {
    console.error(err);
    alert('Erro no OCR: ' + err.message);
  }
  
  capturarBtn.disabled = false;
  capturarBtn.textContent = '📷 Escanear Cartão';
});

// ==============================
// FUNÇÃO DE EXTRAÇÃO DE NOME E ENDEREÇO
// ==============================
function extrairDados(texto) {
  // Limpeza básica
  let limpo = texto
    .replace(/\n/g, ' ')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  // Correções manuais de erros comuns do OCR (adicione os que aparecem nos seus testes)
  const correcoes = {
    'DNU': 'RUA',
    'DNL': 'RUA',
    'SUVU': 'SOUZA',
    'SOUZ': 'SOUZA',
    'PRC': '',
    'JUREMA': '',
    'TONE': '',
    'OO': '',
    'IO': '',
    'NNE': '',
    'CS': '',
    '—': '',
    ':': ''
  };
  for (const [erro, correto] of Object.entries(correcoes)) {
    const regex = new RegExp('\\b' + erro + '\\b', 'gi');
    limpo = limpo.replace(regex, correto);
  }
  
  // Remove palavras muito curtas (exceto R, AV, etc.)
  const palavras = limpo.split(' ');
  const abreviacoes = ['R', 'AV', 'RUA', 'AVENIDA', 'TRAVESSA', 'ESTRADA', 'ALAMEDA', 'RODOVIA'];
  const filtradas = palavras.filter(p => p.length > 2 || abreviacoes.includes(p.toUpperCase()));
  limpo = filtradas.join(' ');
  
  // Duplicação: se a primeira metade é igual à segunda, remove a segunda
  const metade = Math.floor(filtradas.length / 2);
  const primeira = filtradas.slice(0, metade).join(' ');
  const segunda = filtradas.slice(metade).join(' ');
  if (primeira === segunda && primeira.length > 5) {
    limpo = primeira;
  }
  
  console.log('Texto limpo:', limpo);
  
  // Localizar início do endereço (R, RUA, AV, etc.)
  const regexEnd = /\b(R\s|RUA\s|AV\s|AVENIDA\s|ESTRADA\s|TRAVESSA\s|ALAMEDA\s|REPUBLICA\s|RODOVIA\s)/i;
  const match = limpo.match(regexEnd);
  
  let nome = '';
  let endereco = '';
  
  if (match) {
    const idx = match.index;
    nome = limpo.substring(0, idx).trim();
    endereco = limpo.substring(idx).trim();
  } else {
    // Fallback: divide na primeira vírgula
    const partes = limpo.split(',');
    nome = partes[0] || '';
    endereco = partes.slice(1).join(',') || '';
  }
  
  // Limpar nome: remover números e pontuação
  nome = nome.replace(/\d+/g, '').replace(/[,.\\-]+$/g, '').trim();
  
  // Limpar endereço: pegar só até o primeiro número (rua + número)
  const numMatch = endereco.match(/\b\d{1,5}\b/);
  if (numMatch) {
    const posNum = numMatch.index + numMatch[0].length;
    endereco = endereco.substring(0, posNum).trim();
  } else {
    // Se não tem número, tenta a primeira parte antes de vírgula
    const partesEnd = endereco.split(',');
    endereco = partesEnd[0].trim();
  }
  
  // Remove CEPs e ruídos
  endereco = endereco.replace(/\b\d{5}-\d{3}\b/g, '').trim();
  
  return {
    nome: nome.toUpperCase(),
    endereco: endereco.toUpperCase()
  };
}

// ==============================
// BOTÃO DE CORREÇÃO MANUAL (se OCR falhou)
// ==============================
document.getElementById('corrigirBtn').addEventListener('click', () => {
  const nomeInput = document.getElementById('nome');
  const enderecoInput = document.getElementById('endereco');
  
  // Torna os campos editáveis
  nomeInput.readOnly = false;
  enderecoInput.readOnly = false;
  nomeInput.focus();
  
  mostrarStatus('✏️ Edite os campos e depois clique em "Adicionar à lista".', '');
});

// ==============================
// FUNÇÕES DE LISTA E ENVIO (mantidas iguais)
// ==============================
document.getElementById('adicionarBtn').addEventListener('click', () => {
  const nome = document.getElementById('nome').value;
  const endereco = document.getElementById('endereco').value;
  if (!nome || !endereco) { alert('Nome e endereço obrigatórios'); return; }
  
  listaEntregas.push({
    nome,
    endereco,
    quantidade: document.getElementById('quantidade').value,
    tipo: document.getElementById('tipo').value,
    numero: document.getElementById('numero').value,
    obs: document.getElementById('obs').value,
    telefone: document.getElementById('telefone').value,
    data: document.getElementById('data').value
  });
  
  atualizarListaVisual();
  document.getElementById('resultado').style.display = 'none';
  document.getElementById('nome').value = '';
  document.getElementById('endereco').value = '';
  document.getElementById('nome').readOnly = true;  // volta a readonly
  document.getElementById('endereco').readOnly = true;
});

document.getElementById('escanearOutroBtn').addEventListener('click', () => {
  document.getElementById('resultado').style.display = 'none';
  document.getElementById('nome').value = '';
  document.getElementById('endereco').value = '';
  document.getElementById('nome').readOnly = true;
  document.getElementById('endereco').readOnly = true;
});

document.getElementById('enviarTudoBtn').addEventListener('click', async () => {
  if (listaEntregas.length === 0) { alert('Nenhum cartão.'); return; }
  mostrarStatus('Enviando...', '');
  
  try {
    const resposta = await fetch(WEBAPP_URL, {
      method: 'POST',
      body: JSON.stringify(listaEntregas),
      headers: { 'Content-Type': 'application/json' }
    });
    const resultado = await resposta.json();
    
    if (resultado.success) {
      mostrarStatus('✅ ' + resultado.message, 'sucesso');
      listaEntregas = [];
      atualizarListaVisual();
    } else {
      mostrarStatus('❌ ' + resultado.message, 'erro');
    }
  } catch (err) {
    console.error(err);
    mostrarStatus('❌ Falha conexão', 'erro');
  }
});

document.getElementById('limparListaBtn').addEventListener('click', () => {
  if (listaEntregas.length === 0) { alert('Lista vazia.'); return; }
  if (confirm('Apagar todos os cartões?')) {
    listaEntregas = [];
    atualizarListaVisual();
  }
});

function atualizarListaVisual() {
  const listaUl = document.getElementById('itensLista');
  const contador = document.getElementById('contadorLista');
  const div = document.getElementById('listaAcumulada');
  
  contador.textContent = listaEntregas.length;
  if (listaEntregas.length === 0) { div.style.display = 'none'; return; }
  div.style.display = 'block';
  listaUl.innerHTML = '';
  
  listaEntregas.forEach((item, index) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <span style="flex:1;">
        <strong>${item.nome}</strong><br>${item.endereco}
      </span>
      <button onclick="removerItem(${index})">❌</button>
    `;
    listaUl.appendChild(li);
  });
}

function removerItem(indice) {
  listaEntregas.splice(indice, 1);
  atualizarListaVisual();
}

function mostrarStatus(msg, classe) {
  const status = document.getElementById('status');
  status.textContent = msg;
  status.className = 'status ' + classe;
  setTimeout(() => { status.textContent = ''; status.className = 'status'; }, 4000);
}

// Iniciar câmera ao carregar
tentarIniciarCamera();
