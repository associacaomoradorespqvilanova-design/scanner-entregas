// ==============================
// CONFIGURAÇÕES
// ==============================
const WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbwQNReVOuA-XboGCM77eNmLEHW7hzagm-k5azeZVutr9ytC2TBs_QWxvw6igmr6ldmkPw/exec';
const OCR_SPACE_API_KEY = 'K86039269588957'; // <-- Cole sua chave aqui

// ==============================
// ELEMENTOS
// ==============================
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const capturarBtn = document.getElementById('capturarBtn');
const iniciarCameraBtn = document.getElementById('iniciarCameraBtn');

let listaEntregas = [];
let cameraPronta = false;

// ==============================
// INICIAR CÂMERA
// ==============================
async function tentarIniciarCamera() {
  try {
    video.setAttribute('autoplay', true);
    video.setAttribute('muted', true);
    video.setAttribute('playsinline', true);

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'environment',
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    });

    video.srcObject = stream;
    await video.play();

    video.style.filter = 'contrast(145%) brightness(110%) grayscale(100%)';
    definirCameraPronta(true);
    console.log('Câmera iniciada');
  } catch (err) {
    console.error('Erro câmera:', err);
    alert('Erro ao abrir câmera: ' + err.message);
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

// ==============================
// DATA AUTOMÁTICA
// ==============================
document.getElementById('data').value = new Date().toLocaleDateString('pt-BR');

// ==============================
// PRÉ-PROCESSAMENTO DA IMAGEM
// ==============================
function melhorarImagem() {
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const media = (data[i] + data[i + 1] + data[i + 2]) / 3;
    const valor = media > 140 ? 255 : 0;
    data[i] = valor;
    data[i + 1] = valor;
    data[i + 2] = valor;
  }
  ctx.putImageData(imageData, 0, 0);
}

// ==============================
// OCR.SPACE
// ==============================
async function extrairComOCRSpace(imagemBase64) {
  const url = 'https://api.ocr.space/parse/image';
  const formData = new FormData();
  formData.append('apikey', OCR_SPACE_API_KEY);
  formData.append('base64Image', 'data:image/jpeg;base64,' + imagemBase64);
  formData.append('language', 'por');
  formData.append('isTable', 'false');
  formData.append('scale', 'true');
  formData.append('OCREngine', '2');

  const response = await fetch(url, { method: 'POST', body: formData });
  const data = await response.json();

  if (data.OCRExitCode !== 1) throw new Error(data.ErrorMessage || 'Erro no OCR.Space');
  return data.ParsedResults?.[0]?.ParsedText || '';
}

// ==============================
// EXTRAIR NOME E ENDEREÇO
// ==============================
function extrairDados(texto) {
  console.log('OCR original:', texto);

  // 1. Limpeza inicial
  let limpo = texto
    .replace(/[^A-Za-zÀ-Úà-ú0-9\n\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // 2. Divide por linhas, remove linhas muito curtas
  const linhasBrutas = limpo.split('\n').map(l => l.trim()).filter(l => l.length > 2);

  // Palavras proibidas (ignorar linhas que sejam só isso)
  const proibidas = [
    'DESTINATARIO', 'DESTINATÁRIO', 'REMETENTE',
    'ENDERECO', 'ENDEREÇO', 'TELEFONE', 'TEL', 'CEP',
    'CIDADE', 'ESTADO', 'BAIRRO', 'LIXAO'  // <-- adicionado LIXAO
  ];

  // 3. Filtra linhas que são APENAS palavras proibidas
  const linhas = linhasBrutas.filter(linha => {
    const up = linha.toUpperCase().trim();
    if (proibidas.includes(up)) return false;
    if (up.split(' ').length === 1 && proibidas.some(p => up.startsWith(p))) return false;
    return true;
  });

  let nome = '';
  let enderecoBruto = '';

  // 4. Estratégia principal: primeira linha = nome, segunda linha = endereço
  //    Se houver mais linhas, são bairros/lixo e serão ignoradas.
  if (linhas.length >= 2) {
    nome = linhas[0];
    enderecoBruto = linhas[1];  // pega APENAS a segunda linha
  } else if (linhas.length === 1) {
    // Uma única linha: procura por logradouro para separar
    const linha = linhas[0];
    const regexEnd = /\b(R\s|RUA\s|AV\s|AVENIDA\s|UA\s|TRAVESSA\s|BECO\s|ALAMEDA\s|ESTRADA\s|RODOVIA\s|REPUBLICA\s)/i;
    const match = linha.match(regexEnd);
    if (match) {
      nome = linha.substring(0, match.index).trim();
      enderecoBruto = linha.substring(match.index).trim();
    } else {
      nome = linha;
      enderecoBruto = '';
    }
  } else if (linhasBrutas.length > 0) {
    // Nenhuma linha válida após filtro: tenta usar as brutas
    nome = linhasBrutas[0].replace(/[0-9]/g, '').trim();
    enderecoBruto = linhasBrutas.length >= 2 ? linhasBrutas[1] : '';
  }

  // 5. Limpeza do NOME (mantida igual)
  nome = nome.replace(/[0-9,.\-]/g, ' ').replace(/\s+/g, ' ').trim();
  proibidas.forEach(p => { nome = nome.replace(new RegExp('\\b' + p + '\\b', 'gi'), ''); });
  nome = nome.split(' ').filter(p => p.length > 2).join(' ');
  if (!nome && linhas.length > 0) {
    nome = linhas[0].replace(/[0-9]/g, '').trim();
  }

  // 6. Processamento do ENDEREÇO (corte no número + inversão se necessário)
  let enderecoFinal = '';

  // Verifica se o número vem antes da rua: "23 RUA SÃO JOSÉ"
  const matchNumAntes = enderecoBruto.match(/^(\d{1,5})\s+(RUA|AV|AVENIDA|TRAVESSA|BECO|ALAMEDA|ESTRADA|RODOVIA|R)\s+(.+)/i);
  if (matchNumAntes) {
    // Reformata: "RUA SÃO JOSÉ 23"
    const tipoLogradouro = matchNumAntes[2].toUpperCase() === 'R' ? 'RUA' : matchNumAntes[2].toUpperCase();
    enderecoFinal = tipoLogradouro + ' ' + matchNumAntes[3].toUpperCase() + ' ' + matchNumAntes[1];
  } else {
    // Formato normal: "RUA SÃO JOSÉ 23" ou "RUA SÃO JOSÉ, 23"
    enderecoFinal = enderecoBruto.replace(/,/g, ' ');
    // Corta no primeiro número (garante que nada depois do número entre)
    const regexNumero = /\b\d{1,5}\b/;
    const matchNum = enderecoFinal.match(regexNumero);
    if (matchNum) {
      const posFim = matchNum.index + matchNum[0].length;
      enderecoFinal = enderecoFinal.substring(0, posFim).trim();
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
// ESCANEAR CARTÃO
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
    melhorarImagem();
    const imagemBase64 = canvas.toDataURL('image/jpeg', 0.9).split(',')[1];
    const textoBruto = await extrairComOCRSpace(imagemBase64);
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

// ==============================
// ENVIAR TUDO (JSONP – SEM CORS)
// ==============================
document.getElementById('enviarTudoBtn').addEventListener('click', () => {
  if (listaEntregas.length === 0) { alert('Nenhum cartão.'); return; }
  mostrarStatus('Enviando...', '');

  const callbackName = 'entregasCallback';
  const dadosJSON = encodeURIComponent(JSON.stringify(listaEntregas));
  const url = `${WEBAPP_URL}?callback=${callbackName}&dados=${dadosJSON}`;

  // Define a função global de callback
  window[callbackName] = function(resposta) {
    if (resposta.success) {
      mostrarStatus('✅ ' + resposta.message, 'sucesso');
      listaEntregas = [];
      atualizarListaVisual();
    } else {
      mostrarStatus('❌ ' + resposta.message, 'erro');
    }
    // Remove o script injetado e a função global
    document.body.removeChild(script);
    delete window[callbackName];
  };

  const script = document.createElement('script');
  script.src = url;
  script.onerror = () => {
    mostrarStatus('❌ Falha na conexão', 'erro');
    document.body.removeChild(script);
    delete window[callbackName];
  };
  document.body.appendChild(script);
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
  status.textContent = msg;
  status.className = 'status ' + classe;
  setTimeout(() => { status.textContent = ''; status.className = 'status'; }, 4000);
}

tentarIniciarCamera();
