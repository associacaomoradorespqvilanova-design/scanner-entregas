const WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbySC212AZVv5Whw-pPCmmUqwDfZGDQqw-Tlds8VBi8metYtDk-IqRF-jQj4TTXfshIdmg/exec';

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

    await new Promise(resolve => {

      video.onloadedmetadata =
        () => resolve();

      if (video.readyState >= 2)
        resolve();
    });

    await video.play();

    video.style.filter =
      'contrast(140%) brightness(110%) grayscale(100%)';

    definirCameraPronta(true);

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

document.getElementById('data').value =
  new Date().toLocaleDateString('pt-BR');

// ==============================
// PRE PROCESSAMENTO
// ==============================
function preProcessarImagem(sourceCanvas) {

  const novoCanvas =
    document.createElement('canvas');

  novoCanvas.width =
    sourceCanvas.width;

  novoCanvas.height =
    sourceCanvas.height;

  const novoCtx =
    novoCanvas.getContext('2d');

  novoCtx.drawImage(
    sourceCanvas,
    0,
    0
  );

  const imageData =
    novoCtx.getImageData(
      0,
      0,
      novoCanvas.width,
      novoCanvas.height
    );

  const data = imageData.data;

  for (
    let i = 0;
    i < data.length;
    i += 4
  ) {

    const gray =
      (
        data[i] +
        data[i + 1] +
        data[i + 2]
      ) / 3;

    const valor =
      gray > 150 ? 255 : 0;

    data[i] = valor;
    data[i + 1] = valor;
    data[i + 2] = valor;
  }

  novoCtx.putImageData(
    imageData,
    0,
    0
  );

  return novoCanvas.toDataURL(
    'image/png'
  );
}

// ==============================
// OCR
// ==============================
async function realizarOCR(
  imagemDataURL
) {

  const worker =
    await Tesseract.createWorker(
      'por'
    );

  await worker.setParameters({

    preserve_interword_spaces: '1',

    tessedit_pageseg_mode: '6'
  });

  const {
    data: { text }
  } =
    await worker.recognize(
      imagemDataURL
    );

  await worker.terminate();

  return text;
}

// ==============================
// EXTRAÇÃO INTELIGENTE
// ==============================
function extrairDados(texto) {

  console.log(
    'OCR ORIGINAL'
  );

  console.log(texto);

  // ==========================
  // LIMPEZA
  // ==========================
  texto = texto

    .replace(/\|/g, ' ')

    .replace(/\s+/g, ' ')

    .replace(/CEP\s*\d+/gi, ' ')

    .trim();

  // ==========================
  // ENDEREÇO
  // ==========================
  const regexEndereco =
    /(RUA|R\s|AVENIDA|AV\s|TRAVESSA|TV\s|ESTRADA|ALAMEDA)\s+[A-ZÀ-Ú0-9\s]+?\d{1,5}/i;

  const enderecoMatch =
    texto.match(regexEndereco);

  let endereco = '';

  if (enderecoMatch) {

    endereco =
      enderecoMatch[0]

        .replace(/\s+/g, ' ')
        .trim();
  }

  // ==========================
  // NOME
  // ==========================
  let nome = texto;

  if (endereco) {

    nome =
      texto.replace(
        endereco,
        ''
      );
  }

  // remove lixo
  nome = nome

    .replace(/DUQUE DE CAXIAS/gi, '')

    .replace(/RJ/gi, '')

    .replace(/PARQUE VILA NOVA/gi, '')

    .replace(/\d+/g, '')

    .replace(/CEP/gi, '')

    .replace(/\s+/g, ' ')

    .trim();

  // ==========================
  // PEGA SOMENTE PRIMEIRAS PALAVRAS
  // ==========================
  const palavras =
    nome.split(' ');

  if (palavras.length > 4) {

    nome =
      palavras
        .slice(0, 4)
        .join(' ');
  }

  // ==========================
  // CORREÇÕES OCR
  // ==========================
  nome = nome

    .replace(/^UCINA/i, 'LUCIANA')

    .replace(/^UCIANA/i, 'LUCIANA')

    .replace(/^LCIANA/i, 'LUCIANA')

    .replace(/\s+/g, ' ')
    .trim();

  console.log(
    'NOME FINAL:',
    nome
  );

  console.log(
    'ENDEREÇO FINAL:',
    endereco
  );

  return {

    nome:
      nome.toUpperCase(),

    endereco:
      endereco.toUpperCase()
  };
}

// ==============================
// ESCANEAR
// ==============================
capturarBtn.addEventListener(
  'click',
  async () => {

    if (!cameraPronta) return;

    capturarBtn.disabled = true;

    capturarBtn.textContent =
      '⏳ Lendo cartão...';

    try {

      await new Promise(resolve =>
        setTimeout(resolve, 500)
      );

      canvas.width =
        video.videoWidth;

      canvas.height =
        video.videoHeight;

      ctx.drawImage(
        video,
        0,
        0,
        canvas.width,
        canvas.height
      );

      const imagemProcessada =
        preProcessarImagem(
          canvas
        );

      const textoBruto =
        await realizarOCR(
          imagemProcessada
        );

      const {
        nome,
        endereco
      } =
        extrairDados(
          textoBruto
        );

      document.getElementById(
        'nome'
      ).value = nome;

      document.getElementById(
        'endereco'
      ).value = endereco;

      document.getElementById(
        'resultado'
      ).style.display =
        'block';

      if (
        !nome &&
        !endereco
      ) {

        mostrarStatus(
          '⚠️ Não reconhecido',
          'erro'
        );

      } else {

        mostrarStatus(
          '✅ Cartão lido',
          'sucesso'
        );
      }

    } catch (err) {

      console.error(err);

      alert(
        'Erro OCR: ' +
        err.message
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
document.getElementById(
  'adicionarBtn'
).addEventListener(
  'click',
  () => {

    const nome =
      document.getElementById(
        'nome'
      ).value.trim();

    const endereco =
      document.getElementById(
        'endereco'
      ).value.trim();

    if (
      !nome ||
      !endereco
    ) {

      alert(
        'Nome e endereço obrigatórios'
      );

      return;
    }

    listaEntregas.push({

      nome,
      endereco,

      quantidade:
        document.getElementById(
          'quantidade'
        ).value,

      tipo:
        document.getElementById(
          'tipo'
        ).value,

      numero:
        document.getElementById(
          'numero'
        ).value,

      obs:
        document.getElementById(
          'obs'
        ).value,

      telefone:
        document.getElementById(
          'telefone'
        ).value,

      data:
        document.getElementById(
          'data'
        ).value
    });

    atualizarListaVisual();

    document.getElementById(
      'resultado'
    ).style.display =
      'none';

    document.getElementById(
      'nome'
    ).value = '';

    document.getElementById(
      'endereco'
    ).value = '';
  }
);

// ==============================
// ESCANEAR OUTRO
// ==============================
document.getElementById(
  'escanearOutroBtn'
).addEventListener(
  'click',
  () => {

    document.getElementById(
      'resultado'
    ).style.display =
      'none';

    document.getElementById(
      'nome'
    ).value = '';

    document.getElementById(
      'endereco'
    ).value = '';
  }
);

// ==============================
// ENVIAR
// ==============================
document.getElementById(
  'enviarTudoBtn'
).addEventListener(
  'click',
  async () => {

    if (
      listaEntregas.length === 0
    ) {

      alert(
        'Nenhum cartão.'
      );

      return;
    }

    mostrarStatus(
      'Enviando...',
      ''
    );

    try {

      const resposta =
        await fetch(
          WEBAPP_URL,
          {

            method: 'POST',

            body:
              JSON.stringify(
                listaEntregas
              ),

            headers: {
              'Content-Type':
                'application/json'
            }
          }
        );

      const resultado =
        await resposta.json();

      if (resultado.success) {

        mostrarStatus(
          '✅ ' +
          resultado.message,
          'sucesso'
        );

        listaEntregas = [];

        atualizarListaVisual();

      } else {

        mostrarStatus(
          '❌ ' +
          resultado.message,
          'erro'
        );
      }

    } catch (err) {

      console.error(err);

      mostrarStatus(
        '❌ Falha conexão',
        'erro'
      );
    }
  }
);

// ==============================
// LIMPAR
// ==============================
document.getElementById(
  'limparListaBtn'
).addEventListener(
  'click',
  () => {

    if (
      listaEntregas.length === 0
    ) {

      alert(
        'Lista vazia.'
      );

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
    document.getElementById(
      'itensLista'
    );

  const contador =
    document.getElementById(
      'contadorLista'
    );

  const div =
    document.getElementById(
      'listaAcumulada'
    );

  contador.textContent =
    listaEntregas.length;

  if (
    listaEntregas.length === 0
  ) {

    div.style.display =
      'none';

      return;
  }

  div.style.display =
    'block';

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

function removerItem(indice) {

  listaEntregas.splice(
    indice,
    1
  );

  atualizarListaVisual();
}

function mostrarStatus(
  msg,
  classe
) {

  const status =
    document.getElementById(
      'status'
    );

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
