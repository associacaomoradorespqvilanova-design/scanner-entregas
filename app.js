// SUBSTITUA PELA URL DO SEU WEB APP
const WEBAPP_URL =
  'https://script.google.com/macros/s/AKfycbxIpvslimlUoi7IBcZWxdpufNyIaF6CwpzSQyA0dS16QYU2j6RF77FIflhGZv_3dTgF0w/exec';

// ==============================
// ELEMENTOS
// ==============================
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const capturarBtn = document.getElementById('capturarBtn');
const iniciarCameraBtn = document.getElementById('iniciarCameraBtn');
const overlayGuias = document.getElementById('overlayGuias');

let listaEntregas = [];
let cameraPronta = false;

// ==============================
// INICIAR CAMERA (automática)
// ==============================
async function tentarIniciarCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      },
      audio: false
    });

    video.srcObject = stream;

    await new Promise((resolve) => {
      video.onloadedmetadata = () => resolve();
      if (video.readyState >= 2) resolve();
    });

    await video.play();

    // Melhora visual
    video.style.filter = 'contrast(140%) brightness(110%)';

    // Não exibe overlay (linhas-guia) – fica limpo
    overlayGuias.style.display = 'none';

    definirCameraPronta(true);
    console.log('Câmera iniciada');
  } catch (err) {
    console.error(err);
    definirCameraPronta(false);
    iniciarCameraBtn.style.display = 'block';
    capturarBtn.disabled = false;
    capturarBtn.textContent = '📷 Permitir câmera';
    overlayGuias.style.display = 'none';
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
// FUNÇÃO OCR MELHORADA (única área)
// ==============================
async function fazerOCR(sx, sy, sw, sh) {
  const tempCanvas = document.createElement('canvas');
  const tempCtx = tempCanvas.getContext('2d');

  // Aumenta resolução
  tempCanvas.width = sw * 2;
  tempCanvas.height = sh * 2;

  tempCtx.drawImage(canvas, sx, sy, sw, sh, 0, 0, tempCanvas.width, tempCanvas.height);

  // ========== CONTRASTE PESADO ==========
  const frame = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
  const data = frame.data;

  for (let i = 0; i < data.length; i += 4) {
    const media = (data[i] + data[i + 1] + data[i + 2]) / 3;
    const valor = media > 140 ? 255 : 0;
    data[i] = valor;
    data[i + 1] = valor;
    data[i + 2] = valor;
  }

  tempCtx.putImageData(frame, 0, 0);

  const worker = await Tesseract.createWorker('por');
  const { data: { text } } = await worker.recognize(tempCanvas.toDataURL('image/png'));
  await worker.terminate();

  return text;
}

// ==============================
// ESCANEAR CARTÃO
// ==============================
capturarBtn.addEventListener('click', async () => {
  if (!cameraPronta) return;

  capturarBtn.disabled = true;
  capturarBtn.textContent = '⏳ Escaneando...';

  try {
    await new Promise(resolve => setTimeout(resolve, 500));

    // ========== CAPTURA ORIGINAL ==========
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // ========== ÚNICA ÁREA DE OCR (pega toda a faixa onde está nome+endereço) ==========
    // Ajuste conforme necessidade: aqui pega de 3% até 35% da altura e 94% da largura (central)
    const areaTexto = {
      x: canvas.width * 0.03,
      y: canvas.height * 0.03,
      w: canvas.width * 0.94,
      h: canvas.height * 0.32
    };

    const textoBruto = await fazerOCR(areaTexto.x, areaTexto.y, areaTexto.w, areaTexto.h);

    console.log('OCR BRUTO:', textoBruto);

    // ========== LIMPEZA INICIAL ==========
    let limpo = textoBruto
      .replace(/\n/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Correções de erros comuns do OCR (adicione mais se necessário)
    const correcoes = {
      'DNU': 'RUA',
      'DNL': 'RUA',
      'SUVU': 'SOUZA',
      'SOUZ': 'SOUZA',
      'CS': '',     // ruído comum (ex.: "5 CS" vira só "5")
      'PRC': '',
      'JUREMA': '',
      'TONE': '',
      'OO': '',
      'IO': ''
    };

    for (const [erro, correto] of Object.entries(correcoes)) {
      const regex = new RegExp('\\b' + erro + '\\b', 'gi');
      limpo = limpo.replace(regex, correto);
    }

    // Remove palavras com 2 caracteres, exceto abreviações úteis (R, AV, etc.)
    const abreviacoesValidas = ['R', 'AV', 'AL', 'TV', 'TRAV', 'ESTR', 'ROD'];
    limpo = limpo.split(' ')
      .filter(p => p.length > 2 || abreviacoesValidas.includes(p.toUpperCase()))
      .join(' ');

    console.log('LIMPO:', limpo);

    // ========== SEPARAR NOME E ENDEREÇO ==========
    let nome = '';
    let endereco = '';

    // Regex para encontrar o início do logradouro (R, RUA, AVENIDA, etc.)
    const regexEndereco = /\b(R\s|RUA\s|AV\s|AVENIDA\s|ESTRADA\s|TRAVESSA\s|ALAMEDA\s|REPUBLICA\s|RODOVIA\s)/i;
    const match = limpo.match(regexEndereco);

    if (match) {
      const posicao = match.index;
      nome = limpo.substring(0, posicao).trim();
      endereco = limpo.substring(posicao).trim();
    } else {
      // Fallback: divide na primeira vírgula (se houver)
      const partes = limpo.split(',');
      nome = (partes[0] || '').trim();
      endereco = partes.slice(1).join(',').trim();
    }

    // ========== LIMPAR NOME ==========
    // Remove números e pontuação final
    nome = nome.replace(/\b\d+\b/g, '').replace(/[,.\-/]+$/g, '').trim();
    // Se nome ficou vazio ou muito curto, tenta pegar as duas primeiras palavras do texto original
    if (nome.length < 3) {
      nome = limpo.split(' ').slice(0, 2).join(' ');
    }

    // ========== LIMPAR ENDEREÇO (só rua + número) ==========
    // Pega até o primeiro número (casa) e ignora o resto
    const regexNumeroCasa = /\b\d{1,5}\b/;
    const matchNum = endereco.match(regexNumeroCasa);
    if (matchNum) {
      const posNum = matchNum.index + matchNum[0].length;
      endereco = endereco.substring(0, posNum).trim();
    } else {
      // Se não tem número, fica com a primeira parte antes de qualquer vírgula
      const partesEnd = endereco.split(',');
      endereco = partesEnd[0].trim();
    }

    // Remove CEPs e palavras indesejadas que possam ter sobrado
    endereco = endereco.replace(/\b\d{5}-\d{3}\b/g, '').trim();
    endereco = endereco.replace(/\s+/g, ' ').trim();

    // ========== RESULTADO ==========
    console.log('NOME FINAL:', nome);
    console.log('ENDEREÇO FINAL:', endereco);

    document.getElementById('nome').value = nome.toUpperCase();
    document.getElementById('endereco').value = endereco.toUpperCase();
    document.getElementById('resultado').style.display = 'block';

  } catch (err) {
    console.error(err);
    alert('Erro OCR: ' + err.message);
  }

  capturarBtn.disabled = false;
  capturarBtn.textContent = '📷 Escanear Cartão';
});

// ==============================
// ADICIONAR À LISTA
// ==============================
document.getElementById('adicionarBtn').addEventListener('click', () => {
  const nome = document.getElementById('nome').value;
  const endereco = document.getElementById('endereco').value;

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

// ==============================
// DESCARTAR E ESCANEAR OUTRO
// ==============================
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

// ==============================
// LIMPAR LISTA
// ==============================
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

// ==============================
// LISTA VISUAL
// ==============================
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

// ==============================
// REMOVER ITEM
// ==============================
function removerItem(indice) {
  listaEntregas.splice(indice, 1);
  atualizarListaVisual();
}

// ==============================
// STATUS
// ==============================
function mostrarStatus(msg, classe) {
  const status = document.getElementById('status');
  status.textContent = msg;
  status.className = 'status ' + classe;

  setTimeout(() => {
    status.textContent = '';
    status.className = 'status';
  }, 4000);
}

// ==============================
// INICIAR TUDO AO CARREGAR
// ==============================
tentarIniciarCamera();
