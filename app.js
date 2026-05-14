// ==============================
// CONFIGURAÇÕES
// ==============================
const WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbxP2Jv1pEJ-m4vLAGPu6gIrO1TY5v_2Xzss4a8xO7f2-55raB0xlh7JgM2ACxiJOWafwQ/exec';
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
// CHAMADA À API OCR.SPACE
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

  const response = await fetch(url, {
    method: 'POST',
    body: formData
  });

  const data = await response.json();
  console.log('Resposta OCR.Space:', data);

  if (data.OCRExitCode !== 1) {
    throw new Error(data.ErrorMessage || 'Erro no OCR.Space');
  }

  const texto = data.ParsedResults?.[0]?.ParsedText || '';
  console.log('Texto extraído:', texto);
  return texto;
}

// ==============================
// EXTRAIR NOME E ENDEREÇO (robusto)
// ==============================
function extrairDados(texto) {
  console.log('Texto bruto:', texto);

  // 1. Limpeza inicial: remove caracteres estranhos, mantendo letras, números e quebras
  let limpo = texto
    .replace(/[^A-Za-zÀ-Úà-ú0-9\n\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // 2. Divide por linhas
  const linhasBrutas = limpo.split('\n').map(l => l.trim()).filter(l => l.length > 2);

  // 3. Remove linhas que são APENAS palavras proibidas (ex.: "DESTINATÁRIO")
  const palavrasProibidas = [
    'DESTINATARIO', 'DESTINATÁRIO', 'REMETENTE',
    'ENDERECO', 'ENDEREÇO', 'TELEFONE', 'TEL', 'CEP',
    'CIDADE', 'ESTADO', 'BAIRRO'
  ];
  const linhas = linhasBrutas.filter(linha => {
    const upper = linha.toUpperCase().trim();
    // Se a linha inteira for uma dessas palavras, descarta
    if (palavrasProibidas.includes(upper)) return false;
    // Se a linha tiver apenas uma palavra e for proibida, descarta
    if (upper.split(' ').length === 1 && palavrasProibidas.some(p => upper.startsWith(p))) return false;
    return true;
  });

  let nome = '';
  let enderecoBruto = '';

  // 4. Estratégia principal: primeira linha válida = nome, restante = endereço
  if (linhas.length >= 2) {
    nome = linhas[0];
    enderecoBruto = linhas.slice(1).join(' ');
  } else if (linhas.length === 1) {
    const linha = linhas[0];
    // Procura por início de endereço (R, RUA, AV, etc.)
    const regexEnd = /\b(R\s|RUA\s|AV\s|AVENIDA\s|UA\s|TRAVESSA\s|BECO\s|ALAMEDA\s|ESTRADA\s|RODOVIA\s|REPUBLICA\s)/i;
    const match = linha.match(regexEnd);
    if (match) {
      nome = linha.substring(0, match.index).trim();
      enderecoBruto = linha.substring(match.index).trim();
    } else {
      nome = linha;
      enderecoBruto = '';
    }
  } else {
    // Se não sobrou nada, tenta usar as linhas brutas (sem o filtro de proibidas)
    if (linhasBrutas.length > 0) {
      nome = linhasBrutas[0].replace(/[0-9]/g, '').trim();
      enderecoBruto = linhasBrutas.slice(1).join(' ');
    }
  }

  // 5. Limpeza do NOME
  nome = nome.replace(/[0-9,.\-]/g, ' ').replace(/\s+/g, ' ').trim();
  // Remove palavras proibidas que ainda possam ter ficado no nome
  palavrasProibidas.forEach(p => {
    const regex = new RegExp('\\b' + p + '\\b', 'gi');
    nome = nome.replace(regex, '');
  });
  nome = nome.split(' ').filter(p => p.length > 2).join(' ');
  if (!nome && linhas.length > 0) {
    nome = linhas[0].replace(/[0-9]/g, '').trim();
  }

  // 6. Corte cirúrgico do ENDEREÇO no número
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
});

document.getElementById('escanearOutroBtn').addEventListener('click', () => {
  document.getElementById('resultado').style.display = 'none';
  document.getElementById('nome').value = '';
  document.getElementById('endereco').value = '';
});

// ==============================
// ENVIAR TUDO
// ==============================
document.getElementById('enviarTudoBtn').addEventListener('click', async () => {
  if (listaEntregas.length === 0) {
    alert('Nenhum cartão.');
    return;
  }
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
  if (listaEntregas.length === 0) {
    alert('Lista vazia.');
    return;
  }
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
  if (listaEntregas.length === 0) {
    div.style.display = 'none';
    return;
  }
  div.style.display = 'block';
  listaUl.innerHTML = '';
  listaEntregas.forEach((item, index) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <span style="flex:1;">
        <strong>${item.nome}</strong>
        <br>
        ${item.endereco}
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
  setTimeout(() => {
    status.textContent = '';
    status.className = 'status';
  }, 4000);
}

tentarIniciarCamera();
