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
// INICIAR CÂMERA (automática com fallback)
// ==============================
async function tentarIniciarCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        focusMode: { ideal: 'continuous-picture' },
        exposureMode: { ideal: 'continuous' },
        whiteBalanceMode: { ideal: 'continuous' }
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
    console.log('Câmera iniciada com sucesso');
    definirCameraPronta(true);

  } catch (erro) {
    console.warn('Não foi possível iniciar a câmera automaticamente:', erro.message);
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
      alert('É necessário permitir o acesso à câmera para escanear.');
      return;
    }
  }
});

// ==============================
// DATA AUTOMÁTICA
// ==============================
document.getElementById('data').value = new Date().toLocaleDateString('pt-BR');

// ==============================
// ESCANEAR (com estabilização)
// ==============================
capturarBtn.addEventListener('click', async () => {
  if (!cameraPronta) return;

  if (!video.videoWidth) {
    alert('A câmera ainda não está pronta. Aguarde um instante.');
    return;
  }

  await new Promise(resolve => setTimeout(resolve, 300));

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const imageData = canvas.toDataURL('image/png');

  capturarBtn.disabled = true;
  capturarBtn.textContent = '⏳ Lendo cartão...';

  try {
    const worker = await Tesseract.createWorker('por');
    const { data: { text } } = await worker.recognize(imageData);
    await worker.terminate();
    processarTexto(text);
  } catch (err) {
    console.error(err);
    alert('Erro no OCR: ' + err.message);
  }

  capturarBtn.disabled = false;
  capturarBtn.textContent = '📷 Escanear Cartão';
});

// ==============================
// PROCESSAR TEXTO (FOCO TOTAL EM NOME E RUA)
// ==============================
function processarTexto(texto) {
  console.log('OCR ORIGINAL');
  console.log(texto);

  // Limpeza inicial: remove quebras, barras, espaços duplicados e rótulos conhecidos
  let limpo = texto
    .replace(/\n/g, ' ')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/DESTINATÁRIO/gi, '')
    .replace(/REMETENTE/gi, '')
    .trim();

  console.log('OCR LIMPO');
  console.log(limpo);

  // Palavras-chave que indicam logradouro (com pequenas variações de OCR)
  const regexEndereco =
    /\b(RUA|R\s|AVENIDA|AV\s?|ESTRADA|TRAVESSA|ALAMEDA|REPUBLICA|RODOVIA|TRAV\.?|AL\.?|ESTR\.?|ROD\.?)\b/i;

  let nome = '';
  let enderecoBruto = '';

  const inicioEndereco = limpo.search(regexEndereco);

  if (inicioEndereco !== -1) {
    nome = limpo.substring(0, inicioEndereco).trim();
    enderecoBruto = limpo.substring(inicioEndereco).trim();
  } else {
    // Fallback: se não achou logradouro, assume que a primeira vírgula separa nome do endereço
    const partes = limpo.split(',');
    nome = (partes[0] || '').trim();
    enderecoBruto = partes.slice(1).join(',').trim();
  }

  // ========== LIMPEZA EXTRA DO NOME ==========
  // Remove traços, pontos e vírgulas no final do nome
  nome = nome.replace(/[,.-]+$/g, '').trim();
  // Remove números isolados no final (ex: "JOAO 123" -> mantém "JOAO")
  nome = nome.replace(/\s+\d+\s*$/g, '').trim();
  // Remove palavras que parecem ser CEP ou cidade (ex: "SP", "SP-", "12345-678")
  nome = nome.replace(/\s+(SP|RJ|MG|ES|DF|CE)\b\.?$/i, '').trim();
  nome = nome.replace(/\b\d{5}-\d{3}\b/g, '').trim(); // CEP

  // ========== EXTRAÇÃO APENAS DO NOME DA RUA ==========
  // Queremos o logradouro + número (se existir), descartando bairro/cidade
  let enderecoFinal = '';

  // Tenta achar um número pequeno (até 5 dígitos) que é o número da casa
  const regexNumeroCasa = /\b\d{1,5}\b/;
  const matchNum = enderecoBruto.match(regexNumeroCasa);

  if (matchNum) {
    // Pega do início até o fim do número (incluindo uma possível vírgula antes)
    const posNum = matchNum.index + matchNum[0].length;
    enderecoFinal = enderecoBruto.substring(0, posNum).trim();
    // Remove vírgula ou ponto final se sobraram
    enderecoFinal = enderecoFinal.replace(/[,.]\s*$/, '').trim();
  } else {
    // Se não tem número, fica com a primeira parte antes de qualquer vírgula
    const partesEnd = enderecoBruto.split(',');
    enderecoFinal = partesEnd[0].trim();
    // Se ainda parecer ter mais de uma palavra, verifica se a segunda é um número? já feito
  }

  // Remove CEPs que possam ter ficado grudados
  enderecoFinal = enderecoFinal.replace(/\d{5}-\d{3}/g, '').trim();

  // Garante que o endereço não termine com vírgula ou ponto
  enderecoFinal = enderecoFinal.replace(/[,.\s]+$/g, '').trim();

  // ========== RESULTADO FINAL ==========
  console.log('NOME FINAL:', nome);
  console.log('ENDEREÇO FINAL:', enderecoFinal);

  document.getElementById('nome').value = nome.toUpperCase();
  document.getElementById('endereco').value = enderecoFinal.toUpperCase();
  document.getElementById('resultado').style.display = 'block';
}

// ==============================
// ADICIONAR À LISTA (mantido igual)
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
document.getElementById('limparListaBtn').addEventListener('click', () => {
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
