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

    // Aplica um filtro sutil para melhorar contraste na tela
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
  const marginX = sourceCanvas.width * 0.1;
  const marginY = sourceCanvas.height * 0.1;
  const recorteCanvas = document.createElement('canvas');
  recorteCanvas.width = sourceCanvas.width - marginX * 2;
  recorteCanvas.height = sourceCanvas.height - marginY * 2;
  const recorteCtx = recorteCanvas.getContext('2d');
  recorteCtx.drawImage(sourceCanvas, marginX, marginY, recorteCanvas.width, recorteCanvas.height, 0, 0, recorteCanvas.width, recorteCanvas.height);

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
// EXTRAIR NOME E ENDEREÇO (usa quebra de linha)
// ==============================
function extrairDados(texto) {
  console.log('OCR original:', texto);

  // Divide por quebras de linha primeiro
  const linhas = texto
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 2); // ignora linhas muito curtas

  let nome = '';
  let enderecoBruto = '';

  if (linhas.length >= 2) {
    // Estratégia principal: primeira linha = nome, restante = endereço (junta com espaços)
    nome = linhas[0];
    enderecoBruto = linhas.slice(1).join(' ');
  } else if (linhas.length === 1) {
    // Uma única linha: usar regex para separar
    const linha = linhas[0];
    const regexEnd = /\b(R\s|RUA\s|AV\s|AVENIDA\s|TRAVESSA\s|TRV\s|BECO\s|BC\s|ALAMEDA\s|ESTRADA\s|RODOVIA\s|REPUBLICA\s)/i;
    const match = linha.match(regexEnd);
    if (match) {
      nome = linha.substring(0, match.index).trim();
      enderecoBruto = linha.substring(match.index).trim();
    } else {
      nome = linha;
      enderecoBruto = '';
    }
  } else {
    // Nenhuma linha válida
    nome = '';
    enderecoBruto = '';
  }

  // ========== LIMPEZA DO NOME ==========
  // Remove pontuações, números e palavras proibidas
  nome = nome
    .replace(/[\d,.\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Remove palavras proibidas que ainda possam ter ficado
  const palavrasProibidas = [
    'DESTINATARIO', 'DESTINATÁRIO', 'REMETENTE',
    'ENDERECO', 'ENDEREÇO', 'TELEFONE', 'TEL', 'CEP',
    'CIDADE', 'ESTADO', 'BAIRRO'
  ];
  palavrasProibidas.forEach(p => {
    const regex = new RegExp('\\b' + p + '\\b', 'gi');
    nome = nome.replace(regex, '');
  });

  // Remove palavras muito curtas (≤2), exceto abreviações válidas (mas no nome não faz sentido, então remove todas)
  nome = nome.split(' ').filter(p => p.length > 2).join(' ');

  // Se o nome ficou vazio, tenta pegar as primeiras palavras do texto original
  if (!nome && linhas.length > 0) {
    const palavras = linhas[0].split(' ').filter(p => /^[A-ZÀ-Ú]+$/i.test(p) && p.length > 2);
    nome = palavras.slice(0, 3).join(' ');
  }

  // ========== LIMPEZA DO ENDEREÇO (corte no número) ==========
  // Limpeza básica
  enderecoBruto = enderecoBruto
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Expande abreviações apenas para detecção (não altera o texto final)
  const mapaAbreviacoes = {
    'R': 'RUA', 'AV': 'AVENIDA', 'TV': 'TRAVESSA', 'TRV': 'TRAVESSA',
    'BC': 'BECO', 'AL': 'ALAMEDA', 'ESTR': 'ESTRADA', 'ROD': 'RODOVIA'
  };
  let textoExpandido = enderecoBruto;
  const chaves = Object.keys(mapaAbreviacoes).sort((a, b) => b.length - a.length);
  chaves.forEach(abrev => {
    const regex = new RegExp('\\b' + abrev + '\\b', 'gi');
    textoExpandido = textoExpandido.replace(regex, mapaAbreviacoes[abrev]);
  });

  // Agora corta no número
  const regexNumero = /\b\d{1,5}\b/;
  const matchNum = enderecoBruto.match(regexNumero);
  let enderecoFinal = '';

  if (matchNum) {
    const posFim = matchNum.index + matchNum[0].length;
    enderecoFinal = enderecoBruto.substring(0, posFim).trim();
    enderecoFinal = enderecoFinal.replace(/[,.]+$/g, ''); // remove vírgula/ponto final
  } else {
    // Sem número: pega o que parece ser só o logradouro
    const matchFallback = textoExpandido.match(/\b(RUA|AVENIDA|TRAVESSA|BECO|ALAMEDA|ESTRADA|RODOVIA)\s.+?(?=\s+\d{1,5}|$)/i);
    if (matchFallback) {
      enderecoFinal = matchFallback[0].trim();
    } else {
      enderecoFinal = enderecoBruto.split(',')[0].trim();
    }
  }

  // Remove CEPs e espaços extras
  enderecoFinal = enderecoFinal.replace(/\b\d{5}-\d{3}\b/g, '').replace(/\s+/g, ' ').trim();

  console.log('Nome:', nome);
  console.log('Endereço:', enderecoFinal);

  return {
    nome: nome.toUpperCase(),
    endereco: enderecoFinal.toUpperCase()
  };
}

// ==============================
// ESCANEAR CARTÃO (com delay e freeze)
// ==============================
capturarBtn.addEventListener('click', async () => {
  if (!cameraPronta) return;

  capturarBtn.disabled = true;
  capturarBtn.textContent = '⏳ Capturando...';

  try {
    // Pequeno delay para estabilizar o foco
    await new Promise(resolve => setTimeout(resolve, 500));

    // Congela o frame atual (desenha o vídeo no canvas)
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Pré-processamento
    const imagemProcessada = preProcessarImagem(canvas);

    // OCR
    const textoBruto = await realizarOCR(imagemProcessada);

    // Extrair dados
    const { nome, endereco } = extrairDados(textoBruto);

    // Exibir resultado
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
      msgOCR.textContent = '⚠️ Não reconhecido. Digite manualmente.';
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
