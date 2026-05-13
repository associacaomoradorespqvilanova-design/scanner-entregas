// SUBSTITUA PELA URL DO SEU WEB APP
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
let cameraPronta = false;

// ==============================
// INICIAR CAMERA
// ==============================
async function tentarIniciarCamera() {

  try {

    const stream =
      await navigator.mediaDevices.getUserMedia({

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

    // melhora visual
    video.style.filter =
      'contrast(140%) brightness(110%)';

    definirCameraPronta(true);

    console.log('Câmera iniciada');

  } catch (err) {

    console.error(err);

    definirCameraPronta(false);

    iniciarCameraBtn.style.display = 'block';

    capturarBtn.disabled = false;

    capturarBtn.textContent =
      '📷 Permitir câmera';
  }
}

function definirCameraPronta(pronto) {

  cameraPronta = pronto;

  if (pronto) {

    capturarBtn.disabled = false;

    capturarBtn.textContent =
      '📷 Escanear Cartão';

    iniciarCameraBtn.style.display = 'none';

  } else {

    capturarBtn.disabled = true;

    capturarBtn.textContent =
      '🔒 Câmera não iniciada';
  }
}

async function iniciarCameraManual() {

  iniciarCameraBtn.style.display = 'none';

  capturarBtn.disabled = true;

  capturarBtn.textContent =
    '⏳ Iniciando câmera...';

  await tentarIniciarCamera();
}

iniciarCameraBtn.addEventListener(
  'click',
  iniciarCameraManual
);

// ==============================
// DATA
// ==============================
document.getElementById('data').value =
  new Date().toLocaleDateString('pt-BR');

// ==============================
// ESCANEAR
// ==============================
capturarBtn.addEventListener(
  'click',
  async () => {

    if (!cameraPronta) return;

    capturarBtn.disabled = true;

    capturarBtn.textContent =
      '⏳ Escaneando...';

    try {

      // estabilização
      await new Promise(resolve =>
        setTimeout(resolve, 500)
      );

      // ==========================
      // CAPTURA ORIGINAL
      // ==========================
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      ctx.drawImage(
        video,
        0,
        0,
        canvas.width,
        canvas.height
      );

      // ==================================================
      // RECORTE DO NOME
      // ==================================================

      // ÁREA SUPERIOR ESQUERDA
      const nomeX = 0;
      const nomeY = canvas.height * 0.03;

      const nomeW = canvas.width * 0.75;
      const nomeH = canvas.height * 0.18;

      // canvas auxiliar
      const nomeCanvas =
        document.createElement('canvas');

      const nomeCtx =
        nomeCanvas.getContext('2d');

      nomeCanvas.width = nomeW;
      nomeCanvas.height = nomeH;

      nomeCtx.drawImage(
        canvas,
        nomeX,
        nomeY,
        nomeW,
        nomeH,
        0,
        0,
        nomeW,
        nomeH
      );

      // ==================================================
      // MELHORA OCR
      // ==================================================
      const frame =
        nomeCtx.getImageData(
          0,
          0,
          nomeW,
          nomeH
        );

      const data = frame.data;

      for (let i = 0; i < data.length; i += 4) {

        const media =
          (
            data[i] +
            data[i + 1] +
            data[i + 2]
          ) / 3;

        const valor =
          media > 160 ? 255 : 0;

        data[i] = valor;
        data[i + 1] = valor;
        data[i + 2] = valor;
      }

      nomeCtx.putImageData(frame, 0, 0);

      // ==================================================
      // IMAGEM FINAL
      // ==================================================
      const imageData =
        nomeCanvas.toDataURL('image/png');

      // ==================================================
      // OCR
      // ==================================================
      const worker =
        await Tesseract.createWorker('por');

      await worker.setParameters({

        tessedit_pageseg_mode:
          Tesseract.PSM.SINGLE_LINE,

        tessedit_char_whitelist:
          'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÀÁÂÃÉÊÍÓÔÕÚÇàáâãéêíóôõúç '

      });

      const {
        data: { text }
      } = await worker.recognize(imageData);

      await worker.terminate();

      console.log('OCR BRUTO:', text);

      // ==================================================
      // LIMPEZA NOME
      // ==================================================
      let nome = text
        .replace(/\n/g, ' ')
        .replace(/\|/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      // pega possíveis nomes
      const nomesProvaveis =
        nome.match(
          /\b[A-ZÀ-Ú]{2,}(?:\s+[A-ZÀ-Ú]{2,}){1,6}\b/gi
        );

      if (
        nomesProvaveis &&
        nomesProvaveis.length > 0
      ) {

        nome =
          nomesProvaveis.sort(
            (a, b) =>
              b.length - a.length
          )[0];
      }

      // remove lixo comum
      nome = nome
        .replace(/\b(OO|IO|LO|OI)\b/g, '')
        .replace(/\bRU\b/g, '')
        .replace(/\bSS\b/g, '')
        .replace(/\bAA\b/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      // ==================================================
      // ENDEREÇO
      // ==================================================

      // usa OCR completo pro endereço
      const workerEndereco =
        await Tesseract.createWorker('por');

      const {
        data: { text: textoEndereco }
      } =
        await workerEndereco.recognize(
          canvas.toDataURL('image/png')
        );

      await workerEndereco.terminate();

      let endereco = '';

      const regexEndereco =
        /(RUA|R\s|AV|AVENIDA|ESTRADA|TRAVESSA)\s.+?\d+/i;

      const matchEndereco =
        textoEndereco.match(regexEndereco);

      if (matchEndereco) {

        endereco =
          matchEndereco[0];

      } else {

        endereco =
          'ENDEREÇO NÃO ENCONTRADO';
      }

      endereco = endereco
        .replace(/\s+/g, ' ')
        .trim();

      // ==================================================
      // RESULTADO
      // ==================================================
      console.log('NOME FINAL:', nome);
      console.log('ENDEREÇO FINAL:', endereco);

      document.getElementById('nome').value =
        nome.toUpperCase();

      document.getElementById('endereco').value =
        endereco.toUpperCase();

      document.getElementById('resultado').style.display =
        'block';

    } catch (err) {

      console.error(err);

      alert(
        'Erro no OCR: ' + err.message
      );
    }

    capturarBtn.disabled = false;

    capturarBtn.textContent =
      '📷 Escanear Cartão';
  }
);

// ==============================
// ADICIONAR
// ==============================
document.getElementById('adicionarBtn')
.addEventListener(
  'click',
  () => {

    const nome =
      document.getElementById('nome').value;

    const endereco =
      document.getElementById('endereco').value;

    if (!nome || !endereco) {

      alert(
        'Nome e endereço obrigatórios'
      );

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

    document.getElementById('resultado').style.display =
      'none';

    document.getElementById('nome').value = '';

    document.getElementById('endereco').value = '';
  }
);

// ==============================
// ESCANEAR OUTRO
// ==============================
document.getElementById('escanearOutroBtn')
.addEventListener(
  'click',
  () => {

    document.getElementById('resultado').style.display =
      'none';

    document.getElementById('nome').value = '';

    document.getElementById('endereco').value = '';
  }
);

// ==============================
// ENVIAR TUDO
// ==============================
document.getElementById('enviarTudoBtn')
.addEventListener(
  'click',
  async () => {

    if (listaEntregas.length === 0) {

      alert('Nenhum cartão.');

      return;
    }

    mostrarStatus(
      'Enviando...',
      ''
    );

    try {

      const resposta =
        await fetch(WEBAPP_URL, {

          method: 'POST',

          body: JSON.stringify(
            listaEntregas
          ),

          headers: {
            'Content-Type':
              'application/json'
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

      console.error(err);

      mostrarStatus(
        '❌ Erro conexão',
        'erro'
      );
    }
  }
);

// ==============================
// LIMPAR LISTA
// ==============================
document.getElementById('limparListaBtn')
.addEventListener(
  'click',
  () => {

    if (listaEntregas.length === 0) {

      alert('Lista vazia.');

      return;
    }

    if (
      confirm(
        'Apagar todos os cartões?'
      )
    ) {

      listaEntregas = [];

      atualizarListaVisual();
    }
  }
);

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

  contador.textContent =
    listaEntregas.length;

  if (listaEntregas.length === 0) {

    div.style.display = 'none';

    return;
  }

  div.style.display = 'block';

  listaUl.innerHTML = '';

  listaEntregas.forEach(
    (item, index) => {

      const li =
        document.createElement('li');

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
    }
  );
}

// ==============================
// REMOVER ITEM
// ==============================
function removerItem(indice) {

  listaEntregas.splice(
    indice,
    1
  );

  atualizarListaVisual();
}

// ==============================
// STATUS
// ==============================
function mostrarStatus(
  msg,
  classe
) {

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
