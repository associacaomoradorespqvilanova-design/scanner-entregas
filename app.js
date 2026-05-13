// SUBSTITUA PELA URL DO SEU WEB APP ATUALIZADO
const WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbxIpvslimlUoi7IBcZWxdpufNyIaF6CwpzSQyA0dS16QYU2j6RF77FIflhGZv_3dTgF0w/exec';

const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// LISTA DE ENTREGAS
let listaEntregas = [];


// =====================================
// INICIAR CÂMERA
// =====================================

async function startCamera() {

  try {

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'environment'
      },
      audio: false
    });

    video.srcObject = stream;

  } catch (erro) {

    alert('Erro ao acessar câmera: ' + erro.message);

  }

}

startCamera();


// =====================================
// DATA AUTOMÁTICA
// =====================================

document.getElementById('data').value =
  new Date().toLocaleDateString('pt-BR');


// =====================================
// ESCANEAR CARTÃO
// =====================================

document.getElementById('capturarBtn')
.addEventListener('click', async () => {

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  // melhora OCR
  ctx.filter = 'grayscale(100%) contrast(160%)';

  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  // imagem melhor para OCR
  const imageData =
    canvas.toDataURL('image/jpeg', 1.0);

  const btn =
    document.getElementById('capturarBtn');

  btn.disabled = true;
  btn.textContent = '⏳ Processando OCR...';

  try {

    const worker =
      await Tesseract.createWorker('por');

    const {
      data: { text }
    } = await worker.recognize(imageData);

    await worker.terminate();

    processarTexto(text);

  } catch (err) {

    alert('Erro OCR: ' + err.message);

  }

  btn.disabled = false;
  btn.textContent = '📷 Escanear Cartão';

});


// =====================================
// PROCESSAR TEXTO OCR
// =====================================

function processarTexto(texto) {

  console.log('OCR ORIGINAL:');
  console.log(texto);

  // =========================
  // LIMPEZA OCR
  // =========================

  texto = texto

    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/DESTINATÁRIO/gi, '')
    .replace(/DESTINATARIO/gi, '')
    .replace(/REMETENTE.*$/gi, '')
    .trim();

  console.log('OCR LIMPO:');
  console.log(texto);

  // =========================
  // PADRÕES DE ENDEREÇO
  // =========================

  const regexEndereco =
    /\b(RUA|RUA\.|R |AVENIDA|AV\.|AV |ESTRADA|TRAVESSA|ALAMEDA|PRAÇA|PRACA|BECO|VIELA|RODOVIA)\b/i;

  let nome = '';
  let endereco = '';

  // =========================
  // LOCALIZA ENDEREÇO
  // =========================

  const inicioEndereco =
    texto.search(regexEndereco);

  if (inicioEndereco !== -1) {

    nome =
      texto.substring(0, inicioEndereco).trim();

    endereco =
      texto.substring(inicioEndereco).trim();

  } else {

    // fallback
    const partes = texto.split(',');

    nome = partes[0] || '';

    endereco =
      partes.slice(1).join(',') || '';

  }

  // =========================
  // LIMPEZA FINAL
  // =========================

  nome = nome

    .replace(/\d+/g, '')
    .replace(/[,.-]+$/g, '')
    .trim();

  endereco = endereco

    .replace(/\s+/g, ' ')
    .replace(/CEP.*$/i, '')
    .trim();

  console.log('NOME:', nome);
  console.log('ENDEREÇO:', endereco);

  // =========================
  // MOSTRAR RESULTADO
  // =========================

  document.getElementById('nome').value =
    nome.toUpperCase();

  document.getElementById('endereco').value =
    endereco.toUpperCase();

  document.getElementById('resultado')
    .style.display = 'block';

}


// =====================================
// ADICIONAR À LISTA
// =====================================

document.getElementById('adicionarBtn')
.addEventListener('click', () => {

  const nome =
    document.getElementById('nome').value;

  const endereco =
    document.getElementById('endereco').value;

  if (!nome || !endereco) {

    alert('Nome e endereço não podem ficar vazios.');

    return;
  }

  listaEntregas.push({

    nome,
    endereco,

    quantidade:
      document.getElementById('quantidade').value,

    tipo:
      document.getElementById('tipo').value,

    numero:
      document.getElementById('numero').value,

    obs:
      document.getElementById('obs').value,

    telefone:
      document.getElementById('telefone').value,

    data:
      document.getElementById('data').value

  });

  atualizarListaVisual();

  // limpa resultado
  document.getElementById('resultado')
    .style.display = 'none';

  document.getElementById('nome').value = '';

  document.getElementById('endereco').value = '';

});


// =====================================
// DESCARTAR
// =====================================

document.getElementById('escanearOutroBtn')
.addEventListener('click', () => {

  document.getElementById('resultado')
    .style.display = 'none';

  document.getElementById('nome').value = '';

  document.getElementById('endereco').value = '';

});


// =====================================
// ATUALIZAR LISTA VISUAL
// =====================================

function atualizarListaVisual() {

  const listaUl =
    document.getElementById('itensLista');

  const contadorSpan =
    document.getElementById('contadorLista');

  const divLista =
    document.getElementById('listaAcumulada');

  contadorSpan.textContent =
    listaEntregas.length;

  if (listaEntregas.length === 0) {

    divLista.style.display = 'none';

    return;
  }

  divLista.style.display = 'block';

  listaUl.innerHTML = '';

  listaEntregas.forEach((item, index) => {

    const li = document.createElement('li');

    li.innerHTML = `
      <span style="flex:1; font-size:14px;">
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


// =====================================
// REMOVER ITEM
// =====================================

function removerItem(indice) {

  listaEntregas.splice(indice, 1);

  atualizarListaVisual();

}


// =====================================
// ENVIAR TUDO
// =====================================

document.getElementById('enviarTudoBtn')
.addEventListener('click', async () => {

  if (listaEntregas.length === 0) {

    alert('Nenhum cartão na lista.');

    return;
  }

  mostrarStatus(
    'Enviando ' + listaEntregas.length + ' cartão(s)...',
    ''
  );

  try {

    const resposta =
      await fetch(WEBAPP_URL, {

      method: 'POST',

      body: JSON.stringify(listaEntregas),

      headers: {
        'Content-Type': 'application/json'
      }

    });

    const resultado =
      await resposta.json();

    if (resultado.success) {

      mostrarStatus(
        '✅ ' + resultado.message,
        'sucesso'
      );

      listaEntregas = [];

      atualizarListaVisual();

    } else {

      mostrarStatus(
        '❌ ' + resultado.message,
        'erro'
      );

    }

  } catch (err) {

    mostrarStatus(
      '❌ Falha: ' + err.message,
      'erro'
    );

  }

});


// =====================================
// LIMPAR LISTA
// =====================================

document.getElementById('limparListaBtn')
.addEventListener('click', () => {

  if (confirm('Deseja apagar todos os cartões?')) {

    listaEntregas = [];

    atualizarListaVisual();

  }

});


// =====================================
// STATUS
// =====================================

function mostrarStatus(msg, classe) {

  const status =
    document.getElementById('status');

  status.textContent = msg;

  status.className =
    'status ' + classe;

  setTimeout(() => {

    status.textContent = '';

    status.className = 'status';

  }, 4000);

}
    
    processarTexto(text);
  } catch (err) {
    alert('Erro no OCR: ' + err.message);
  }
  
  document.getElementById('capturarBtn').disabled = false;
  document.getElementById('capturarBtn').textContent = '📷 Escanear Cartão';
});

// Adicionar à lista e escanear próximo
document.getElementById('adicionarBtn').addEventListener('click', () => {
  const nome = document.getElementById('nome').value;
  const endereco = document.getElementById('endereco').value;
  if (!nome || !endereco) {
    alert('Nome e endereço não podem estar vazios!');
    return;
  }
  
  // Adiciona ao array com os dados comuns atuais
  listaEntregas.push({
    nome: nome,
    endereco: endereco,
    quantidade: document.getElementById('quantidade').value,
    tipo: document.getElementById('tipo').value,
    numero: document.getElementById('numero').value,
    obs: document.getElementById('obs').value,
    telefone: document.getElementById('telefone').value,
    data: document.getElementById('data').value
  });
  
  // Limpa campos de nome/endereço e esconde resultado
  document.getElementById('nome').value = '';
  document.getElementById('endereco').value = '';
  document.getElementById('resultado').style.display = 'none';
  
  atualizarListaVisual();
});

// Descartar e escanear outro (não adiciona à lista)
document.getElementById('escanearOutroBtn').addEventListener('click', () => {
  document.getElementById('resultado').style.display = 'none';
  document.getElementById('nome').value = '';
  document.getElementById('endereco').value = '';
});

// Enviar tudo
document.getElementById('enviarTudoBtn').addEventListener('click', async () => {
  if (listaEntregas.length === 0) {
    alert('Nenhum cartão na lista!');
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
      listaEntregas = [];        // limpa a lista após envio com sucesso
      atualizarListaVisual();
    } else {
      mostrarStatus('❌ Erro: ' + resultado.message, 'erro');
    }
  } catch (err) {
    mostrarStatus('❌ Falha na conexão: ' + err.message, 'erro');
  }
});

// Limpar lista manualmente
document.getElementById('limparListaBtn').addEventListener('click', () => {
  if (confirm('Deseja apagar todos os cartões da lista?')) {
    listaEntregas = [];
    atualizarListaVisual();
  }
});

// ================== FUNÇÕES ==================

function processarTexto(texto) {

  console.log("OCR ORIGINAL:");
  console.log(texto);

  // =============================
  // LIMPEZA OCR
  // =============================

  texto = texto
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/REMETENTE.*$/i, '')
    .replace(/DESTINATÁRIO/i, '')
    .trim();

  console.log("OCR LIMPO:");
  console.log(texto);

  // =============================
  // PADRÕES DE RUA
  // =============================

  const regexEndereco =
    /\b(RUA|R |AVENIDA|AV |ESTRADA|TRAVESSA|ALAMEDA|REPUBLICA|RODOVIA)\b/i;

  let nome = '';
  let endereco = '';

  // =============================
  // LOCALIZA INÍCIO ENDEREÇO
  // =============================

  const matchEndereco = texto.search(regexEndereco);

  if (matchEndereco !== -1) {

    nome = texto.substring(0, matchEndereco).trim();

    endereco = texto.substring(matchEndereco).trim();

  } else {

    // fallback simples
    const partes = texto.split(',');

    nome = partes[0] || '';
    endereco = partes.slice(1).join(',') || '';
  }

  // =============================
  // LIMPEZA FINAL
  // =============================

  nome = nome
    .replace(/[,.-]+$/g, '')
    .trim();

  endereco = endereco
    .replace(/\s+/g, ' ')
    .trim();

  // =============================
  // REMOVE LIXO
  // =============================

  endereco = endereco
    .replace(/^[,.-\s]+/, '')
    .trim();

  // =============================
  // MOSTRAR RESULTADO
  // =============================

  console.log("NOME:", nome);
  console.log("ENDEREÇO:", endereco);

  document.getElementById('nome').value = nome.toUpperCase();

  document.getElementById('endereco').value = endereco.toUpperCase();

  document.getElementById('resultado').style.display = 'block';
function atualizarListaVisual() {
  const listaUl = document.getElementById('itensLista');
  const contadorSpan = document.getElementById('contadorLista');
  const divLista = document.getElementById('listaAcumulada');
  
  contadorSpan.textContent = listaEntregas.length;
  
  if (listaEntregas.length === 0) {
    divLista.style.display = 'none';
    return;
  }
  
  divLista.style.display = 'block';
  listaUl.innerHTML = '';
  
  listaEntregas.forEach((item, index) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <span style="flex:1; font-size:14px;"><strong>${item.nome}</strong><br>${item.endereco}</span>
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
