const WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbySC212AZVv5Whw-pPCmmUqwDfZGDQqw-Tlds8VBi8metYtDk-IqRF-jQj4TTXfshIdmg/exec';

const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const capturarBtn = document.getElementById('capturarBtn');
const iniciarCameraBtn = document.getElementById('iniciarCameraBtn');

let listaEntregas = [];
let cameraPronta = false;

// ==============================
// INICIAR CÂMERA (automática)
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
// PRÉ-PROCESSAMENTO AGRESSIVO
// ==============================
function preProcessarImagem(sourceCanvas) {
  const maxSize = 1024;
  let { width, height } = sourceCanvas;
  if (width > height && width > maxSize) {
    height = (height * maxSize) / width;
    width = maxSize;
  } else if (height > maxSize) {
    width = (width * maxSize) / height;
    height = maxSize;
  }
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = width;
  tempCanvas.height = height;
  const tCtx = tempCanvas.getContext('2d');
  tCtx.drawImage(sourceCanvas, 0, 0, width, height);

  const imageData = tCtx.getImageData(0, 0, width, height);
  const data = imageData.data;

  // Binarização com threshold ajustável (150 parece funcionar bem para cartões)
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
  tCtx.putImageData(imageData, 0, 0);
  return tempCanvas.toDataURL('image/png');
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
// EXTRAIR NOME E ENDEREÇO
// ==============================
function extrairDados(texto) {
  let limpo = texto.replace(/\n/g, ' ').replace(/\|/g, ' ').replace(/\s+/g, ' ').trim();

  const correcoes = {
    'DNU': 'RUA', 'DNL': 'RUA', 'SUVU': 'SOUZA', 'SOUZ': 'SOUZA',
    'PRC': '', 'JUREMA': '', 'TONE': '', 'OO': '', 'IO': '', 'NNE': '', 'CS': '',
    '—': '', ':': ''
  };
  for (const [erro, correto] of Object.entries(correcoes)) {
    const regex = new RegExp('\\b' + erro + '\\b', 'gi');
    limpo = limpo.replace(regex, correto);
  }

  const palavras = limpo.split(' ');
  const abreviacoes = ['R', 'AV', 'RUA', 'AVENIDA', 'TRAVESSA', 'ESTRADA', 'ALAMEDA', 'RODOVIA'];
  const filtradas = palavras.filter(p => p.length > 2 || abreviacoes.includes(p.toUpperCase()));
  limpo = filtradas.join(' ');

  const metade = Math.floor(filtradas.length / 2);
  const primeira = filtradas.slice(0, metade).join(' ');
  const segunda = filtradas.slice(metade).join(' ');
  if (primeira === segunda && primeira.length > 5) limpo = primeira;

  console.log('Texto limpo:', limpo);

  const regexEnd = /\b(R\s|RUA\s|AV\s|AVENIDA\s|ESTRADA\s|TRAVESSA\s|ALAMEDA\s|REPUBLICA\s|RODOVIA\s)/i;
  const match = limpo.match(regexEnd);
  let nome = '', endereco = '';

  if (match) {
    nome = limpo.substring(0, match.index).trim();
    endereco = limpo.substring(match.index).trim();
  } else {
    const partes = limpo.split(',');
    nome = partes[0] || '';
    endereco = partes.slice(1).join(',') || '';
  }

  nome = nome.replace(/\d+/g, '').replace(/[,.\\-]+$/g, '').trim();
  const numMatch = endereco.match(/\b\d{1,5}\b/);
  if (numMatch) {
    const posNum = numMatch.index + numMatch[0].length;
    endereco = endereco.substring(0, posNum).trim();
  } else {
    endereco = endereco.split(',')[0].trim();
  }
  endereco = endereco.replace(/\b\d{5}-\d{3}\b/g, '').trim();

  return { nome: nome.toUpperCase(), endereco: endereco.toUpperCase() };
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

    // Exibir resultado (sempre mostra os campos)
    const nomeInput = document.getElementById('nome');
    const enderecoInput = document.getElementById('endereco');
    const msgOCR = document.getElementById('mensagemOCR');

    nomeInput.value = nome;
    enderecoInput.value = endereco;
    document.getElementById('resultado').style.display = 'block';

    if (!nome && !endereco) {
      // OCR falhou: libera edição imediatamente
      nomeInput.readOnly = false;
      enderecoInput.readOnly = false;
      msgOCR.style.display = 'block';
      msgOCR.textContent = '⚠️ Texto não reconhecido. Digite o nome e o endereço manualmente.';
      nomeInput.focus();
    } else {
      // OCR funcionou: mantém readonly
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
// ADICIONAR À LISTA (já trata campos editáveis)
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
