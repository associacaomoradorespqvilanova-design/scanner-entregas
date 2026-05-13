const WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbySC212AZVv5Whw-pPCmmUqwDfZGDQqw-Tlds8VBi8metYtDk-IqRF-jQj4TTXfshIdmg/exec';

const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const capturarBtn = document.getElementById('capturarBtn');
const iniciarCameraBtn = document.getElementById('iniciarCameraBtn');

let listaEntregas = [];
let cameraPronta = false;

// ==============================
// INICIAR CÂMERA (com foco contínuo)
// ==============================
async function tentarIniciarCamera() {
  try {
    const constraints = {
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        // Tenta forçar foco contínuo (se não suportar, ignora)
        focusMode: { ideal: 'continuous' },
        exposureMode: { ideal: 'continuous' },
        whiteBalanceMode: { ideal: 'continuous' }
      },
      audio: false
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;

    await new Promise(resolve => {
      video.onloadedmetadata = () => resolve();
      if (video.readyState >= 2) resolve();
    });
    await video.play();

    // Aumenta contraste e nitidez via CSS (não afeta o OCR, mas ajuda visualmente)
    video.style.filter = 'contrast(130%) brightness(110%) saturate(0%)';

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
// PRÉ-PROCESSAMENTO COM RECORTE
// ==============================
function preProcessarImagem(sourceCanvas) {
  // Recorta 10% das bordas para eliminar molduras/retângulos do cartão
  const marginX = sourceCanvas.width * 0.1;
  const marginY = sourceCanvas.height * 0.1;
  const recorteCanvas = document.createElement('canvas');
  recorteCanvas.width = sourceCanvas.width - marginX * 2;
  recorteCanvas.height = sourceCanvas.height - marginY * 2;
  const recorteCtx = recorteCanvas.getContext('2d');
  recorteCtx.drawImage(sourceCanvas, marginX, marginY, recorteCanvas.width, recorteCanvas.height, 0, 0, recorteCanvas.width, recorteCanvas.height);

  // Redimensiona para no máximo 1024px (mantendo proporção)
  let { width, height } = recorteCanvas;
  const maxSize = 1024;
  if (width > height && width > maxSize) {
    height = (height * maxSize) / width;
    width = maxSize;
  } else if (height > maxSize) {
    width = (width * maxSize) / height;
    height = maxSize;
  }
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = width;
  finalCanvas.height = height;
  const finalCtx = finalCanvas.getContext('2d');
  finalCtx.drawImage(recorteCanvas, 0, 0, width, height);

  // Binarização (preto e branco pesado)
  const imageData = finalCtx.getImageData(0, 0, width, height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    const val = gray > 150 ? 255 : 0;
    data[i] = val;
    data[i + 1] = val;
    data[i + 2] = val;
  }
  finalCtx.putImageData(imageData, 0, 0);

  return finalCanvas.toDataURL('image/png');
}

// ==============================
// OCR
// ==============================
async function realizarOCR(imagemDataURL) {
  const worker = await Tesseract.createWorker('por', 1);
  await worker.setParameters({
    tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÀÁÂÃÉÊÍÓÔÕÚÇàáâãéêíóôõúç0123456789-., ',
    preserve_interword_spaces: '1'
  });
  const { data: { text } } = await worker.recognize(imagemDataURL);
  await worker.terminate();
  return text;
}

// ==============================
// EXTRAIR NOME E ENDEREÇO (aprimorado)
// ==============================
function extrairDados(texto) {
  // 1. Limpeza inicial
  let limpo = texto
    .replace(/\n/g, ' ')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Palavras proibidas
  const palavrasProibidas = [
    'DESTINATARIO', 'DESTINATÁRIO', 'REMETENTE',
    'ENDERECO', 'ENDEREÇO', 'TELEFONE', 'TEL', 'CEP',
    'CIDADE', 'ESTADO', 'BAIRRO'
  ];
  palavrasProibidas.forEach(p => {
    const regex = new RegExp('\\b' + p + '\\b', 'gi');
    limpo = limpo.replace(regex, '');
  });

  // Correções de erros comuns
  const correcoes = {
    'DNU': 'RUA', 'DNL': 'RUA', 'SUVU': 'SOUZA', 'SOUZ': 'SOUZA',
    'PRC': '', 'JUREMA': '', 'TONE': '', 'OO': '', 'IO': '', 'NNE': '', 'CS': '',
    '—': '', ':': ''
  };
  for (const [erro, correto] of Object.entries(correcoes)) {
    const regex = new RegExp('\\b' + erro + '\\b', 'gi');
    limpo = limpo.replace(regex, correto);
  }

  // Remove palavras com ≤2 caracteres, exceto abreviações de logradouro
  const abreviacoesValidas = ['R', 'AV', 'TV', 'TRV', 'BC', 'AL', 'ESTR', 'ROD'];
  let palavras = limpo.split(' ').filter(p => {
    if (p.length > 2) return true;
    if (abreviacoesValidas.includes(p.toUpperCase())) return true;
    return false;
  });
  limpo = palavras.join(' ');

  // Remove duplicações (metade igual)
  const metade = Math.floor(palavras.length / 2);
  const primeira = palavras.slice(0, metade).join(' ');
  const segunda = palavras.slice(metade).join(' ');
  if (primeira === segunda && primeira.length > 5) {
    limpo = primeira;
  }

  // Remove sequências estranhas (ex.: "Xx", "aa") que ainda possam ter escapado
  limpo = limpo.replace(/\b[a-zA-Z]{1,2}\b/g, '').replace(/\s+/g, ' ').trim();

  console.log('Texto limpo:', limpo);

  // 2. Expansão de abreviações para detecção
  const mapaAbreviacoes = {
    'R': 'RUA',
    'AV': 'AVENIDA',
    'TV': 'TRAVESSA',
    'TRV': 'TRAVESSA',
    'BC': 'BECO',
    'AL': 'ALAMEDA',
    'ESTR': 'ESTRADA',
    'ROD': 'RODOVIA'
  };
  let textoExpandido = limpo;
  const chaves = Object.keys(mapaAbreviacoes).sort((a, b) => b.length - a.length);
  chaves.forEach(abrev => {
    const regex = new RegExp('\\b' + abrev + '\\b', 'gi');
    textoExpandido = textoExpandido.replace(regex, mapaAbreviacoes[abrev]);
  });

  // 3. Localizar início do endereço
  const regexEnd = /\b(RUA|AVENIDA|TRAVESSA|BECO|ALAMEDA|ESTRADA|RODOVIA|REPUBLICA)\s/i;
  const match = textoExpandido.match(regexEnd);
  
  let nome = '', endereco = '';

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

  // 4. Limpar nome (apenas letras, sem números)
  nome = nome.replace(/[\d,.\-]+/g, ' ').replace(/\s+/g, ' ').trim();
  nome = nome.split(' ').filter(p => p.length >= 2).join(' ');
  if (!nome) {
    const possiveisNomes = limpo.split(' ').filter(p => /^[A-ZÀ-Ú]+$/i.test(p) && p.length > 2);
    nome = possiveisNomes.slice(0, 3).join(' ');
  }

  // 5. Limpar endereço (corte cirúrgico no número)
  // Remove tudo que vem depois do número, incluindo o próprio bairro
  const regexNumero = /\b\d{1,5}\b/;
  const matchNum = endereco.match(regexNumero);
  if (matchNum) {
    // Pega do início até o fim do número (incluindo o número)
    const posFim = matchNum.index + matchNum[0].length;
    endereco = endereco.substring(0, posFim).trim();
    // Remove vírgula ou ponto que possa ter ficado grudado no final
    endereco = endereco.replace(/[,.]+$/g, '');
  } else {
    // Se não tem número, pega só o que parece ser nome da rua (antes de qualquer vírgula)
    endereco = endereco.split(',')[0].trim();
  }

  // Remove CEPs e espaços extras
  endereco = endereco.replace(/\b\d{5}-\d{3}\b/g, '').replace(/\s+/g, ' ').trim();

  // Última verificação: se o endereço ainda tiver mais de 6 palavras, corta depois do número (segurança extra)
  if (endereco.split(' ').length > 6) {
    const numMatch2 = endereco.match(regexNumero);
    if (numMatch2) {
      endereco = endereco.substring(0, numMatch2.index + numMatch2[0].length).trim();
    }
  }

  if (!endereco) {
    const matchFallback = textoExpandido.match(/\b(RUA|AVENIDA|TRAVESSA|BECO|ALAMEDA|ESTRADA|RODOVIA)\s.+?(?=\s+\d{1,5}|$)/i);
    if (matchFallback) {
      endereco = matchFallback[0].trim();
    }
  }

  return {
    nome: nome.toUpperCase(),
    endereco: endereco.toUpperCase()
  };
}

// ==============================
// ESCANEAR CARTÃO
// ==============================
capturarBtn.addEventListener('click', async () => {
  if (!cameraPronta) return;

  capturarBtn.disabled = true;
  capturarBtn.textContent = '⏳ Processando...';

  try {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imagemProcessada = preProcessarImagem(canvas);
    const textoBruto = await realizarOCR(imagemProcessada);
    console.log('OCR:', textoBruto);

    const { nome, endereco } = extrairDados(textoBruto);

    const nomeInput = document.getElementById('nome');
    const enderecoInput = document.getElementById('endereco');
    const msgOCR = document.getElementById('mensagemOCR');

    nomeInput.value = nome;
    enderecoInput.value = endereco;
    document.getElementById('resultado').style.display = 'block';

    if (!nome && !endereco) {
      nomeInput.readOnly = false;
      enderecoInput.readOnly = false;
      msgOCR.style.display = 'block';
      msgOCR.textContent = '⚠️ Texto não reconhecido. Digite os dados manualmente.';
      nomeInput.focus();
    } else {
      nomeInput.readOnly = true;
      enderecoInput.readOnly = true;
      msgOCR.style.display = 'none';
    }
  } catch (err) {
    console.error(err);
    alert('Erro no OCR: ' + err.message);
  }

  capturarBtn.disabled = false;
  capturarBtn.textContent = '📷 Escanear Cartão';
});

// ==============================
// ADICIONAR À LISTA (mantido)
// ==============================
document.getElementById('adicionarBtn').addEventListener('click', () => {
  const nome = document.getElementById('nome').value.trim();
  const endereco = document.getElementById('endereco').value.trim();
  if (!nome || !endereco) {
    alert('Nome e endereço obrigatórios');
    return;
  }

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
  document.getElementById('nome').readOnly = true;
  document.getElementById('endereco').readOnly = true;
  document.getElementById('mensagemOCR').style.display = 'none';
});

document.getElementById('escanearOutroBtn').addEventListener('click', () => {
  document.getElementById('resultado').style.display = 'none';
  document.getElementById('nome').value = '';
  document.getElementById('endereco').value = '';
  document.getElementById('nome').readOnly = true;
  document.getElementById('endereco').readOnly = true;
  document.getElementById('mensagemOCR').style.display = 'none';
});

// ==============================
// ENVIAR TUDO
// ==============================
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

tentarIniciarCamera();
