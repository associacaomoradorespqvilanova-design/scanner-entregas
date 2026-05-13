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
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        focusMode: { ideal: 'continuous' },
        exposureMode: { ideal: 'continuous' },
        whiteBalanceMode: { ideal: 'continuous' }
      },
      audio: false
    });

    video.srcObject = stream;
    await new Promise(resolve => {
      video.onloadedmetadata = () => resolve();
      if (video.readyState >= 2) resolve();
    });
    await video.play();
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
// PRÉ-PROCESSAMENTO AGRESSIVO
// ==============================
function preProcessarImagem(sourceCanvas) {
  // Recorta 10% das bordas
  const marginX = sourceCanvas.width * 0.1;
  const marginY = sourceCanvas.height * 0.1;
  const recorteCanvas = document.createElement('canvas');
  recorteCanvas.width = sourceCanvas.width - marginX * 2;
  recorteCanvas.height = sourceCanvas.height - marginY * 2;
  const recorteCtx = recorteCanvas.getContext('2d');
  recorteCtx.drawImage(sourceCanvas, marginX, marginY, recorteCanvas.width, recorteCanvas.height, 0, 0, recorteCanvas.width, recorteCanvas.height);

  // Redimensiona para 1024px
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

  // Binarização com threshold 128
  const imageData = finalCtx.getImageData(0, 0, width, height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]; const g = data[i + 1]; const b = data[i + 2];
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    const val = gray > 128 ? 255 : 0;
    data[i] = val; data[i + 1] = val; data[i + 2] = val;
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
    tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÀÁÂÃÉÊÍÓÔÕÚÇàáâãéêíóôõúç0123456789- ',
    preserve_interword_spaces: '1'
  });
  const { data: { text } } = await worker.recognize(imagemDataURL);
  await worker.terminate();
  return text;
}

// ==============================
// EXTRAÇÃO ROBUSTA DE DADOS
// ==============================
function extrairDados(texto) {
  console.log('OCR original:', texto);

  // 1. Limpeza máxima
  let limpo = texto
    .replace(/[^A-Za-zÀ-Úà-ú0-9\n\s]/g, ' ') // remove tudo que não for letra, número ou espaço
    .replace(/\s+/g, ' ')
    .trim();

  // 2. Tenta separar por quebra de linha
  const linhas = limpo.split('\n').map(l => l.trim()).filter(l => l.length > 2);
  let nome = '', enderecoBruto = '';

  if (linhas.length >= 2) {
    nome = linhas[0];
    enderecoBruto = linhas.slice(1).join(' ');
  } else if (linhas.length === 1) {
    const linha = linhas[0];
    // Procura por início de endereço (R, RUA, AV, UA, etc.)
    const regexEnd = /\b(R\s|RUA\s|AV\s|AVENIDA\s|UA\s|TRAVESSA\s|BECO\s|ALAMEDA\s|ESTRADA\s|RODOVIA\s|REPUBLICA\s)/i;
    const match = linha.match(regexEnd);
    if (match) {
      nome = linha.substring(0, match.index).trim();
      enderecoBruto = linha.substring(match.index).trim();
    } else {
      // Se não achou endereço, assume que tudo é nome
      nome = linha;
      enderecoBruto = '';
    }
  }

  // 3. Limpeza do NOME
  nome = nome.replace(/[0-9,.\-]/g, ' ').replace(/\s+/g, ' ').trim();
  nome = nome.split(' ').filter(p => p.length > 2).join(' ');
  if (!nome && linhas.length > 0) {
    nome = linhas[0].replace(/[0-9]/g, '').trim();
  }

  // 4. Corte cirúrgico do ENDEREÇO no número
  const regexNumero = /\b\d{1,5}\b/;
  const matchNum = enderecoBruto.match(regexNumero);
  let enderecoFinal = '';
  if (matchNum) {
    enderecoFinal = enderecoBruto.substring(0, matchNum.index + matchNum[0].length).trim();
    enderecoFinal = enderecoFinal.replace(/[,.]+$/g, '');
  } else {
    enderecoFinal = enderecoBruto.split(',')[0].trim();
  }
  enderecoFinal = enderecoFinal.replace(/\b\d{5}-\d{3}\b/g, '').replace(/\s+/g, ' ').trim();

  return {
    nome: nome.toUpperCase(),
    endereco: enderecoFinal.toUpperCase()
  };
}

// ==============================
// ESCANEAR CARTÃO (com fallback manual)
// ==============================
capturarBtn.addEventListener('click', async () => {
  if (!cameraPronta) return;
  capturarBtn.disabled = true;
  capturarBtn.textContent = '⏳ Processando...';

  try {
    await new Promise(resolve => setTimeout(resolve, 500));
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imagemProcessada = preProcessarImagem(canvas);
    const textoBruto = await realizarOCR(imagemProcessada);
    const { nome, endereco } = extrairDados(textoBruto);

    const nomeInput = document.getElementById('nome');
    const enderecoInput = document.getElementById('endereco');
    nomeInput.value = nome;
    enderecoInput.value = endereco;
    document.getElementById('resultado').style.display = 'block';

    if (!nome || !endereco) {
      nomeInput.readOnly = false;
      enderecoInput.readOnly = false;
      document.getElementById('mensagemOCR').style.display = 'block';
      document.getElementById('mensagemOCR').textContent = '⚠️ Verifique os dados. Se necessário, digite.';
    } else {
      nomeInput.readOnly = true;
      enderecoInput.readOnly = true;
      document.getElementById('mensagemOCR').style.display = 'none';
    }
  } catch (err) {
    console.error(err);
    alert('Erro no OCR: ' + err.message);
  }
  capturarBtn.disabled = false;
  capturarBtn.textContent = '📷 Escanear Cartão';
});

// ==============================
// ADICIONAR À LISTA
// ==============================
document.getElementById('adicionarBtn').addEventListener('click', () => {
  const nome = document.getElementById('nome').value.trim();
  const endereco = document.getElementById('endereco').value.trim();
  if (!nome || !endereco) { alert('Nome e endereço obrigatórios'); return; }

  listaEntregas.push({
    nome, endereco,
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
});

document.getElementById('escanearOutroBtn').addEventListener('click', () => {
  document.getElementById('resultado').style.display = 'none';
  document.getElementById('nome').value = '';
  document.getElementById('endereco').value = '';
});

document.getElementById('enviarTudoBtn').addEventListener('click', async () => {
  if (listaEntregas.length === 0) { alert('Nenhum cartão.'); return; }
  mostrarStatus('Enviando...', '');
  try {
    const resposta = await fetch(WEBAPP_URL, { method: 'POST', body: JSON.stringify(listaEntregas), headers: { 'Content-Type': 'application/json' } });
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
  if (confirm('Apagar todos os cartões?')) { listaEntregas = []; atualizarListaVisual(); }
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
    li.innerHTML = `<span style="flex:1;"><strong>${item.nome}</strong><br>${item.endereco}</span><button onclick="removerItem(${index})">❌</button>`;
    listaUl.appendChild(li);
  });
}

function removerItem(indice) { listaEntregas.splice(indice, 1); atualizarListaVisual(); }

function mostrarStatus(msg, classe) {
  const status = document.getElementById('status');
  status.textContent = msg; status.className = 'status ' + classe;
  setTimeout(() => { status.textContent = ''; status.className = 'status'; }, 4000);
}

tentarIniciarCamera();
