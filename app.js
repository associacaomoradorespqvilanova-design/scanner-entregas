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

  // 2. Divide por linhas (pode vir tudo em uma só)
  const linhasBrutas = limpo.split('\n').map(l => l.trim()).filter(l => l.length > 2);

  // Palavras proibidas (ignorar linhas que sejam só isso)
  const proibidas = [
    'DESTINATARIO', 'DESTINATÁRIO', 'REMETENTE',
    'ENDERECO', 'ENDEREÇO', 'TELEFONE', 'TEL', 'CEP',
    'CIDADE', 'ESTADO', 'BAIRRO', 'LIXAO'
  ];

  // Filtra linhas proibidas
  const linhas = linhasBrutas.filter(linha => {
    const up = linha.toUpperCase().trim();
    if (proibidas.includes(up)) return false;
    return true;
  });

  let nome = '';
  let enderecoFinal = '';

  // 3. Extrai nome (primeira linha válida, se existir)
  if (linhas.length > 0) {
    nome = linhas[0].replace(/[0-9,.\-]/g, ' ').replace(/\s+/g, ' ').trim();
    nome = nome.split(' ').filter(p => p.length > 2).join(' ');
    if (!nome) nome = linhas[0].replace(/[0-9]/g, '').trim();
  }

  // Se o nome ainda contiver coisas como "LIXAO", remove
  proibidas.forEach(p => { nome = nome.replace(new RegExp('\\b' + p + '\\b', 'gi'), ''); });
  nome = nome.replace(/\s+/g, ' ').trim();

  // 4. Extrai endereço usando regex diretamente no texto completo
  const textoCompleto = linhas.join(' '); // junta todas as linhas

  // Padrão 1: número + logradouro + nome da rua (ex: "23 RUA SÃO JOSÉ")
  // Agora captura o nome da rua até encontrar uma palavra que não seja parte do nome (palavras com 4+ letras que não são preposições) ou fim
  const padraoNumAntes = /\b(\d{1,5})\s+(RUA|AV|AVENIDA|TRAVESSA|TRV|BECO|BC|ALAMEDA|ESTRADA|RODOVIA|R)\s+((?:[A-ZÀ-Ú]{1,3}\s+)*[A-ZÀ-Ú]{3,}(?:\s+[A-ZÀ-Ú]{1,3})*)\b(?:\s+(?:LIXAO|PARQUE|VILA|BAIRRO|CENTRO|JARDIM|JD|PQ|VL|SETOR|QD|QUADRA|LOTE|LT|CASA|APTO|APARTAMENTO|BLOCO|BL|CEP|CIDADE|ESTADO|RJ|SP|MG|ES|DF|GO|PR|SC|RS|PE|BA|CE|MA|PA|AM|RO|AC|RR|AP|TO|SE|AL|PB|RN|PI|MS|MT|DF|BRASIL)\b|\s*\d{5}-\d{3}|\s*$)/i;

  // Padrão 2: logradouro + nome da rua + número (ex: "RUA SÃO JOSÉ 23")
  const padraoNumDepois = /\b(RUA|AV|AVENIDA|TRAVESSA|TRV|BECO|BC|ALAMEDA|ESTRADA|RODOVIA|R)\s+([A-ZÀ-Ú\s]+?)\s+(\d{1,5})\b/i;

  let match = textoCompleto.match(padraoNumAntes);
  if (match) {
    // Formato "23 RUA SÃO JOSÉ" → "RUA SÃO JOSÉ 23"
    const tipoLog = match[2].toUpperCase() === 'R' ? 'RUA' : match[2].toUpperCase();
    const nomeRua = match[3].trim();
    const numero = match[1];
    enderecoFinal = tipoLog + ' ' + nomeRua + ' ' + numero;

    // Se o nome ainda não foi extraído (porque estava tudo na mesma linha), extrai agora
    if (!nome || linhas.length === 1) {
      const idxEndereco = textoCompleto.indexOf(match[0]);
      if (idxEndereco > 0) {
        nome = textoCompleto.substring(0, idxEndereco).trim();
        nome = nome.replace(/[0-9,.\-]/g, ' ').replace(/\s+/g, ' ').trim();
        nome = nome.split(' ').filter(p => p.length > 2).join(' ');
        proibidas.forEach(p => { nome = nome.replace(new RegExp('\\b' + p + '\\b', 'gi'), ''); });
        nome = nome.replace(/\s+/g, ' ').trim();
      }
    }
  } else {
    match = textoCompleto.match(padraoNumDepois);
    if (match) {
      // Formato "RUA SÃO JOSÉ 23"
      const tipoLog = match[1].toUpperCase() === 'R' ? 'RUA' : match[1].toUpperCase();
      const nomeRua = match[2].trim();
      const numero = match[3];
      enderecoFinal = tipoLog + ' ' + nomeRua + ' ' + numero;

      // Se o nome não foi extraído, pega o que vem antes do endereço
      if (!nome || linhas.length === 1) {
        const idxEndereco = textoCompleto.indexOf(match[0]);
        if (idxEndereco > 0) {
          nome = textoCompleto.substring(0, idxEndereco).trim();
          nome = nome.replace(/[0-9,.\-]/g, ' ').replace(/\s+/g, ' ').trim();
          nome = nome.split(' ').filter(p => p.length > 2).join(' ');
          proibidas.forEach(p => { nome = nome.replace(new RegExp('\\b' + p + '\\b', 'gi'), ''); });
          nome = nome.replace(/\s+/g, ' ').trim();
        }
      }
    }
  }

  // Fallback: se nenhum padrão encontrado, procura em cada linha
  if (!enderecoFinal) {
    for (let i = 1; i < linhas.length; i++) {
      const linha = linhas[i];
      if (/\b(RUA|AV|AVENIDA|TRAVESSA|TRV|BECO|BC|ALAMEDA|ESTRADA|RODOVIA|R)\b/i.test(linha)) {
        enderecoFinal = linha.replace(/,/g, ' ');
        const matchNum = enderecoFinal.match(/\b\d{1,5}\b/);
        if (matchNum) {
          enderecoFinal = enderecoFinal.substring(0, matchNum.index + matchNum[0].length).trim();
        }
        break;
      }
    }
  }

  // Remove CEPs e espaços extras
  enderecoFinal = enderecoFinal.replace(/\b\d{5}-\d{3}\b/g, '').replace(/\s+/g, ' ').trim();

  // Se o nome ainda está vazio, tenta usar a primeira linha bruta
  if (!nome && linhasBrutas.length > 0) {
    nome = linhasBrutas[0].replace(/[0-9]/g, '').trim();
    proibidas.forEach(p => { nome = nome.replace(new RegExp('\\b' + p + '\\b', 'gi'), ''); });
    nome = nome.replace(/\s+/g, ' ').trim();
  }

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
