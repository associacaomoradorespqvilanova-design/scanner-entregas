// SUBSTITUA PELA URL DO SEU WEB APP ATUALIZADO
const WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbxIpvslimlUoi7IBcZWxdpufNyIaF6CwpzSQyA0dS16QYU2j6RF77FIflhGZv_3dTgF0w/exec';

// ==============================
// CONFIG
// =============================

const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

let listaEntregas = [];

// ==============================
// INICIAR CAMERA
// ==============================

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: {
          ideal: 'environment'
        }
      },
      audio: false
    });

    video.srcObject = stream;

    // IMPORTANTE
    await video.play();

    console.log('Câmera iniciada');

  } catch (erro) {
    console.error(erro);
    alert(
      'Erro ao acessar câmera.\n\n' +
      'Verifique:\n' +
      '- Permissão da câmera\n' +
      '- HTTPS ativo\n' +
      '- Navegador compatível'
    );
  }
}

startCamera();

// ==============================
// DATA AUTOMÁTICA
// ==============================

document.getElementById('data').value =
  new Date().toLocaleDateString('pt-BR');

// ==============================
// ESCANEAR
// ==============================

document.getElementById('capturarBtn')
  .addEventListener('click', async () => {

    if (!video.videoWidth) {
      alert('A câmera ainda não carregou.');
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    ctx.drawImage(
      video,
      0,
      0,
      canvas.width,
      canvas.height
    );

    const imageData = canvas.toDataURL('image/png');

    const btn = document.getElementById('capturarBtn');

    btn.disabled = true;
    btn.textContent = '⏳ Lendo cartão...';

    try {
      const worker = await Tesseract.createWorker('por');

      const {
        data: { text }
      } = await worker.recognize(imageData);

      await worker.terminate();

      processarTexto(text);

    } catch (err) {
      console.error(err);
      alert('Erro OCR: ' + err.message);
    }

    btn.disabled = false;
    btn.textContent = '📷 Escanear Cartão';
  });

// ==============================
// PROCESSAR TEXTO (INTELIGENTE)
// ==============================

function processarTexto(texto) {
  console.log('OCR ORIGINAL');
  console.log(texto);

  texto = texto
    .replace(/\n/g, ' ')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/DESTINATÁRIO/gi, '')
    .replace(/REMETENTE/gi, '')
    .trim();

  console.log('OCR LIMPO');
  console.log(texto);

  const regexEndereco =
    /\b(RUA|R |AVENIDA|AV |ESTRADA|TRAVESSA|ALAMEDA|REPUBLICA|RODOVIA)\b/i;

  let nome = '';
  let endereco = '';

  const inicioEndereco = texto.search(regexEndereco);

  if (inicioEndereco !== -1) {
    nome = texto
      .substring(0, inicioEndereco)
      .trim();

    endereco = texto
      .substring(inicioEndereco)
      .trim();
  } else {
    const partes = texto.split(',');

    nome = partes[0] || '';
    endereco = partes.slice(1).join(',') || '';
  }

  nome = nome
    .replace(/[,.-]+$/g, '')
    .trim();

  endereco = endereco
    .replace(/\s+/g, ' ')
    .trim();

  console.log('NOME:', nome);
  console.log('ENDEREÇO:', endereco);

  document.getElementById('nome').value =
    nome.toUpperCase();

  document.getElementById('endereco').value =
    endereco.toUpperCase();

  document.getElementById('resultado').style.display =
    'block';
}

// ==============================
// ADICIONAR À LISTA
// ==============================

document.getElementById('adicionarBtn')
  .addEventListener('click', () => {

    const nome =
      document.getElementById('nome').value;

    const endereco =
      document.getElementById('endereco').value;

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

document.getElementById('escanearOutroBtn')
  .addEventListener('click', () => {

    document.getElementById('resultado').style.display = 'none';
    document.getElementById('nome').value = '';
    document.getElementById('endereco').value = '';
  });

// ==============================
// ENVIAR TUDO
// ==============================

document.getElementById('enviarTudoBtn')
  .addEventListener('click', async () => {

    if (listaEntregas.length === 0) {
      alert('Nenhum cartão na lista.');
      return;
    }

    mostrarStatus('Enviando ' + listaEntregas.length + ' cartão(s)...', '');

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
      mostrarStatus('❌ Falha na conexão', 'erro');
    }
  });

// ==============================
// LIMPAR LISTA
// ==============================

document.getElementById('limparListaBtn')
  .addEventListener('click', () => {

    if (listaEntregas.length === 0) {
      alert('Lista já está vazia.');
      return;
    }

    if (confirm('Apagar todos os cartões da lista?')) {
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

      <button onclick="removerItem(${index})">
        ❌
      </button>
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
