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

  // 1. Limpeza leve
  let limpo = texto
    .replace(/[^A-Za-zÀ-Úà-ú0-9\n\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // 2. Tenta dividir por quebras de linha
  let linhas = limpo
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 2);

  // Se não houver quebras, usa a regex de logradouro para separar
  if (linhas.length <= 1) {
    const inicioLogradouro = /\b(RUA|AVENIDA|TRAVESSA|ALAMEDA|ESTRADA|RODOVIA|BECO|PRAÇA|LARGO|VIELA|PROJETADA|PROJETADO|R\s|AV\s|TV\s|TRAV\s|ESTR\s|ROD\s|PC\s|AL\s|VL\s)\b/i;
    const match = limpo.match(inicioLogradouro);
    if (match) {
      const idx = match.index;
      const nome = limpo.substring(0, idx).trim();
      const enderecoBruto = limpo.substring(idx).trim();
      linhas = [nome, enderecoBruto];
    } else {
      // Nenhum logradouro conhecido: assume que tudo é nome
      linhas = [limpo, ''];
    }
  }

  // 3. Nome = primeira linha, endereço = segunda linha (se existir)
  let nome = linhas[0] || '';
  let enderecoFinal = '';

  if (linhas.length >= 2) {
    let linhaEndereco = linhas[1];

    // Reorganiza "23 RUA SÃO JOSÉ" -> "RUA SÃO JOSÉ 23"
    const matchNumAntes = linhaEndereco.match(/^(\d{1,5})\s+(RUA|AV|AVENIDA|TRAVESSA|TRV|BECO|BC|ALAMEDA|ESTRADA|RODOVIA|R\s|PROJETADA|PROJETADO)\s+(.+)/i);
    if (matchNumAntes) {
      const tipoLog = matchNumAntes[2].toUpperCase().replace(/\s+$/, '');
      const nomeRua = matchNumAntes[3].trim();
      const numero = matchNumAntes[1];
      enderecoFinal = tipoLog + ' ' + nomeRua + ' ' + numero;
    } else {
      enderecoFinal = linhaEndereco;
      // Corta no primeiro número de casa
      const matchNum = enderecoFinal.match(/\b\d{1,5}\b/);
      if (matchNum) {
        enderecoFinal = enderecoFinal.substring(0, matchNum.index + matchNum[0].length).trim();
      }
    }
  }

  // 4. Limpeza do NOME
  // Remove números e pontuações
  nome = nome.replace(/[\d,.\-]+/g, ' ').replace(/\s+/g, ' ').trim();

  // Remove palavras proibidas do nome (DESTINATARIO, etc.)
  const proibidas = ['DESTINATARIO', 'DESTINATÁRIO', 'REMETENTE'];
  proibidas.forEach(p => { nome = nome.replace(new RegExp('\\b' + p + '\\b', 'gi'), ''); });

  nome = nome.split(' ').filter(p => p.length > 2).join(' ');
  if (!nome && linhas.length > 0) {
    nome = linhas[0].replace(/[\d,.\-]+/g, ' ').replace(/\s+/g, ' ').trim();
    nome = nome.split(' ').filter(p => p.length > 2).join(' ');
  }

  // 5. Limpeza final do ENDEREÇO
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
