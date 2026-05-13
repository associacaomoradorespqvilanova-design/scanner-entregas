// SUBSTITUA PELA URL DO SEU WEB APP
const WEBAPP_URL =
  'https://script.google.com/macros/s/AKfycbweKuxpOt5aXWPFDcbjUj0uOgX7ubqi5H6t8_VLAqcPeBBZB41FCZb2rgNYKW61RYf77g/exec';

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
// INICIAR CÂMERA (automática)
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
    video.style.filter = 'contrast(140%) brightness(110%)';

    definirCameraPronta(true);
    console.log('Câmera iniciada');
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

// ==============================
// DATA AUTOMÁTICA
// ==============================
document.getElementById('data').value = new Date().toLocaleDateString('pt-BR');

// ==============================
// ESCANEAR (agora usando IA)
// ==============================
capturarBtn.addEventListener('click', async () => {
  if (!cameraPronta) return;

  capturarBtn.disabled = true;
  capturarBtn.textContent = '⏳ Analisando com IA...';

  try {
    // Pequena pausa para estabilizar foco
    await new Promise(resolve => setTimeout(resolve, 300));

    // Captura o frame
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Converte para JPEG base64 (sem o prefixo "data:image/jpeg;base64,")
    const imagemBase64 = canvas.toDataURL('image/jpeg', 0.9).split(',')[1];

    // Envia para o Google Apps Script (função processarImagem)
    const response = await fetch(WEBAPP_URL + '?action=processarImagem', {
      method: 'POST',
      body: JSON.stringify({ imagem: imagemBase64 }),
      headers: { 'Content-Type': 'application/json' }
    });

    const resultado = await response.json();

    console.log('IA retornou:', resultado);

    document.getElementById('nome').value = resultado.nome?.toUpperCase() || '';
    document.getElementById('endereco').value = resultado.endereco?.toUpperCase() || '';
    document.getElementById('resultado').style.display = 'block';

    if (!resultado.nome && !resultado.endereco) {
      mostrarStatus('⚠️ Não foi possível ler o cartão. Tente novamente.', 'erro');
    } else {
      mostrarStatus('✅ Leitura concluída com IA!', 'sucesso');
    }

  } catch (err) {
    console.error(err);
    alert('Erro ao consultar IA: ' + err.message);
  }

  capturarBtn.disabled = false;
  capturarBtn.textContent = '📷 Escanear Cartão';
});

// ==============================
// ADICIONAR À LISTA (mantido)
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
// ENVIAR TUDO (mantido)
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
