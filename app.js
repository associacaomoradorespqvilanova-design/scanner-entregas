// SUBSTITUA PELA URL DO SEU WEB APP ATUALIZADO
const WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbxIpvslimlUoi7IBcZWxdpufNyIaF6CwpzSQyA0dS16QYU2j6RF77FIflhGZv_3dTgF0w/exec';

// ==============================
// ELEMENTOS
// ==============================
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

const capturarBtn = document.getElementById('capturarBtn');
const iniciarCameraBtn = document.getElementById('iniciarCameraBtn');

let listaEntregas = [];
let streamAtivo = null;
let cameraPronta = false;

// ==============================
// INICIAR CÂMERA
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
    streamAtivo = stream;

    await new Promise((resolve) => {
      video.onloadedmetadata = () => resolve();
      if (video.readyState >= 2) resolve();
    });

    await video.play();

    // MELHORA VISUAL
    video.style.filter = 'contrast(140%) brightness(110%)';

    console.log('Câmera iniciada com sucesso');

    definirCameraPronta(true);

  } catch (erro) {
    console.warn('Erro câmera:', erro.message);

    definirCameraPronta(false);

    iniciarCameraBtn.style.display = 'block';

    capturarBtn.textContent = '📷 Permitir Câmera';
    capturarBtn.disabled = false;
  }
}

function definirCameraPronta(pronto) {
  cameraPronta = pronto;

  if (pronto) {
    capturarBtn.textContent = '📷 Escanear Cartão';
    capturarBtn.disabled = false;
    iniciarCameraBtn.style.display = 'none';
  } else {
    capturarBtn.textContent = '🔒 Câmera não iniciada';
    capturarBtn.disabled = true;
  }
}

async function iniciarCameraManual() {
  iniciarCameraBtn.style.display = 'none';

  capturarBtn.textContent = '⏳ Solicitando câmera...';
  capturarBtn.disabled = true;

  await tentarIniciarCamera();
}

iniciarCameraBtn.addEventListener('click', iniciarCameraManual);

capturarBtn.addEventListener('click', async (e) => {
  if (!cameraPronta) {
    e.preventDefault();

    await iniciarCameraManual();

    if (!cameraPronta) {
      alert('Permita acesso à câmera.');
      return;
    }
  }
});

// ==============================
// DATA AUTOMÁTICA
// ==============================
document.getElementById('data').value =
  new Date().toLocaleDateString('pt-BR');

// ==============================
// ESCANEAR
// ==============================
capturarBtn.addEventListener('click', async () => {

  if (!cameraPronta) return;

  if (!video.videoWidth) {
    alert('A câmera ainda está carregando.');
    return;
  }

  capturarBtn.disabled = true;
  capturarBtn.textContent = '⏳ Lendo cartão...';

  try {

    // estabilização
    await new Promise(resolve => setTimeout(resolve, 400));

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // captura imagem
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // ==========================
    // MELHORIA OCR
    // ==========================
    const frame = ctx.getImageData(
      0,
      0,
      canvas.width,
      canvas.height
    );

    const data = frame.data;

    for (let i = 0; i < data.length; i += 4) {

      const media =
        (data[i] + data[i + 1] + data[i + 2]) / 3;

      // contraste pesado
      const valor = media > 150 ? 255 : 0;

      data[i] = valor;
      data[i + 1] = valor;
      data[i + 2] = valor;
    }

    ctx.putImageData(frame, 0, 0);

    const imageData = canvas.toDataURL('image/png');

    // ==========================
    // TESSERACT
    // ==========================
    const worker = await Tesseract.createWorker('por');

    await worker.setParameters({

      tessedit_pageseg_mode: Tesseract.PSM.AUTO,

      tessedit_char_whitelist:
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÀÁÂÃÉÊÍÓÔÕÚÇàáâãéêíóôõúç0123456789-.,/ '

    });

    const {
      data: { text }
    } = await worker.recognize(imageData);

    await worker.terminate();

    processarTexto(text);

  } catch (err) {

    console.error(err);

    alert('Erro OCR: ' + err.message);

  }

  capturarBtn.disabled = false;
  capturarBtn.textContent = '📷 Escanear Cartão';

});

// ==============================
// PROCESSAR TEXTO
// ==============================
function processarTexto(texto) {

  console.log('OCR ORIGINAL');
  console.log(texto);

  let limpo = texto
    .replace(/\n/g, ' ')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/DESTINATÁRIO/gi, '')
    .replace(/REMETENTE/gi, '')
    .trim();

  console.log('OCR LIMPO');
  console.log(limpo);

  const regexEndereco =
    /\b(RUA|R\s|AVENIDA|AV\s?|ESTRADA|TRAVESSA|ALAMEDA|REPUBLICA|RODOVIA|TRAV\.?|AL\.?|ESTR\.?|ROD\.?)\b/i;

  let nome = '';
  let enderecoBruto = '';

  const inicioEndereco = limpo.search(regexEndereco);

  if (inicioEndereco !== -1) {

    nome = limpo.substring(0, inicioEndereco).trim();

    enderecoBruto =
      limpo.substring(inicioEndereco).trim();

  } else {

    const partes = limpo.split(',');

    nome = (partes[0] || '').trim();

    enderecoBruto =
      partes.slice(1).join(',').trim();
  }

  // ==========================
  // MELHOR EXTRAÇÃO NOME
  // ==========================
  const matchNome = nome.match(
    /([A-ZÀ-Ú]{2,}(?:\s+[A-ZÀ-Ú]{2,}){1,6})/i
  );

  if (matchNome) {
    nome = matchNome[1];
  }

  // ==========================
  // LIMPEZA NOME
  // ==========================
  nome = nome
    .replace(/[,.-]+$/g, '')
    .replace(/\s+\d+\s*$/g, '')
    .replace(/\s+(SP|RJ|MG|ES|DF|CE)\b\.?$/i, '')
    .replace(/\b\d{5}-\d{3}\b/g, '')
    .trim();

  // remove palavras pequenas
  nome = nome
    .split(' ')
    .filter(p => p.length > 2)
    .join(' ');

  // remove lixo OCR
  nome = nome.replace(/\b(OO|IO|LO|OI|0O|O0)\b/g, '');

  // remove caracteres repetidos
  nome = nome.replace(/\b([A-Z])\1+\b/g, '');

  // espaços extras
  nome = nome.replace(/\s+/g, ' ').trim();

  // ==========================
  // ENDEREÇO
  // ==========================
  let enderecoFinal = '';

  const regexNumeroCasa = /\b\d{1,5}\b/;

  const matchNum = enderecoBruto.match(regexNumeroCasa);

  if (matchNum) {

    const posNum =
      matchNum.index + matchNum[0].length;

    enderecoFinal =
      enderecoBruto.substring(0, posNum).trim();

    enderecoFinal =
      enderecoFinal.replace(/[,.]\s*$/, '').trim();

  } else {

    const partesEnd = enderecoBruto.split(',');

    enderecoFinal = partesEnd[0].trim();
  }

  enderecoFinal =
    enderecoFinal
      .replace(/\d{5}-\d{3}/g, '')
      .replace(/[,.\s]+$/g, '')
      .trim();

  console.log('NOME FINAL:', nome);
  console.log('ENDEREÇO FINAL:', enderecoFinal);

  document.getElementById('nome').value =
    nome.toUpperCase();

  document.getElementById('endereco').value =
    enderecoFinal.toUpperCase();

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
// ESCANEAR OUTRO
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
    alert('Nenhum cartão.');
    return;
  }

  mostrarStatus(
    'Enviando ' + listaEntregas.length + ' cartão(s)...',
    ''
  );

  try {

    const resposta = await fetch(WEBAPP_URL, {
      method: 'POST',
      body: JSON.stringify(listaEntregas),
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const resultado = await resposta.json();

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

    console.error(err);

    mostrarStatus(
      '❌ Falha na conexão',
      'erro'
    );
  }
});

// ==============================
// LIMPAR LISTA
// ==============================
document.getElementById('limparListaBtn')
.addEventListener('click', () => {

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

  const listaUl =
    document.getElementById('itensLista');

  const contador =
    document.getElementById('contadorLista');

  const div =
    document.getElementById('listaAcumulada');

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

// ==============================
// INICIAR
// ==============================
tentarIniciarCamera();
