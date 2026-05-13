// ==============================
// CONFIGURAÇÕES
// ==============================
const WEBAPP_URL =
  'https://script.google.com/macros/s/AKfycbySC212AZVv5Whw-pPCmmUqwDfZGDQqw-Tlds8VBi8metYtDk-IqRF-jQj4TTXfshIdmg/exec';

const GEMINI_API_KEY =
  'AIzaSyDNCwSc_8FtpIg7ax1M6iiQooxy_c8-tQI';

// ==============================
// ELEMENTOS
// ==============================
const video =
  document.getElementById('video');

const canvas =
  document.getElementById('canvas');

const ctx =
  canvas.getContext('2d');

const capturarBtn =
  document.getElementById('capturarBtn');

const iniciarCameraBtn =
  document.getElementById('iniciarCameraBtn');

let listaEntregas = [];

let cameraPronta = false;

// ==============================
// INICIAR CÂMERA
// ==============================
async function tentarIniciarCamera() {

  try {

    const stream =
      await navigator.mediaDevices.getUserMedia({

        video: {

          facingMode: {
            ideal: 'environment'
          },

          width: {
            ideal: 1920
          },

          height: {
            ideal: 1080
          }
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

    // melhora visual
    video.style.filter =
      'contrast(140%) brightness(110%) saturate(120%)';

    definirCameraPronta(true);

  } catch (err) {

    console.error(err);

    definirCameraPronta(false);

    iniciarCameraBtn.style.display =
      'block';

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

    iniciarCameraBtn.style.display =
      'none';

  } else {

    capturarBtn.disabled = true;

    capturarBtn.textContent =
      '🔒 Câmera não iniciada';
  }
}

async function iniciarCameraManual() {

  iniciarCameraBtn.style.display =
    'none';

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
// DATA AUTOMÁTICA
// ==============================
document.getElementById('data').value =
  new Date().toLocaleDateString('pt-BR');

// ==============================
// MELHORAR IMAGEM
// ==============================
function melhorarImagem() {

  const frame =
    ctx.getImageData(
      0,
      0,
      canvas.width,
      canvas.height
    );

  const data = frame.data;

  for (
    let i = 0;
    i < data.length;
    i += 4
  ) {

    const media =
      (
        data[i] +
        data[i + 1] +
        data[i + 2]
      ) / 3;

    // aumenta contraste
    const valor =
      media > 145 ? 255 : 0;

    data[i] = valor;
    data[i + 1] = valor;
    data[i + 2] = valor;
  }

  ctx.putImageData(
    frame,
    0,
    0
  );
}

// ==============================
// CHAMADA GEMINI
// ==============================
async function extrairComGemini(
  imagemBase64
) {

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

  const payload = {

    contents: [{

      parts: [

        {

          text: `
Você receberá uma imagem de um cartão de entrega.

TAREFA:

1. Extraia SOMENTE:
- nome completo da pessoa
- endereço (somente rua + número)

2. NÃO incluir:
- bairro
- cidade
- CEP
- códigos
- status
- textos laterais

3. O nome normalmente está:
- em MAIÚSCULO
- na parte superior do cartão

4. O endereço normalmente começa com:
RUA, R, AV, AVENIDA, TRAVESSA, ESTRADA

5. Retorne APENAS JSON válido.

FORMATO:

{
  "nome": "BRUNA BORGES DE SOUZA",
  "endereco": "R RIO NEGRO 35"
}

Se não conseguir ler:

{
  "nome": "",
  "endereco": ""
}
          `
        },

        {

          inline_data: {

            mime_type: 'image/jpeg',

            data: imagemBase64
          }
        }
      ]
    }]
  };

  const response =
    await fetch(url, {

      method: 'POST',

      headers: {
        'Content-Type':
          'application/json'
      },

      body:
        JSON.stringify(payload)
    });

  const data =
    await response.json();

  console.log('GEMINI RAW');
  console.log(data);

  const texto =
    data?.candidates?.[0]?.content?.parts?.[0]?.text
    || '{"nome":"","endereco":""}';

  const jsonLimpo =
    texto
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();

  try {

    return JSON.parse(jsonLimpo);

  } catch (err) {

    console.error(
      'Erro JSON Gemini:',
      err
    );

    return {
      nome: '',
      endereco: ''
    };
  }
}

// ==============================
// ESCANEAR CARTÃO
// ==============================
capturarBtn.addEventListener(
  'click',
  async () => {

    if (!cameraPronta) return;

    capturarBtn.disabled = true;

    capturarBtn.textContent =
      '⏳ Consultando IA...';

    try {

      // estabilização
      await new Promise(resolve =>
        setTimeout(resolve, 500)
      );

      // ==========================
      // CAPTURA
      // ==========================
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

      // ==========================
      // MELHORA IMAGEM
      // ==========================
      melhorarImagem();

      // ==========================
      // BASE64
      // ==========================
      const imagemBase64 =
        canvas
          .toDataURL(
            'image/jpeg',
            1.0
          )
          .split(',')[1];

      // ==========================
      // GEMINI
      // ==========================
      const resultado =
        await extrairComGemini(
          imagemBase64
        );

      console.log(
        'RESULTADO IA'
      );

      console.log(
        resultado
      );

      // ==========================
      // LIMPEZA EXTRA
      // ==========================
      let nome =
        (resultado.nome || '')

          .replace(
            /\b(OO|IO|LO|SS|AA|NNE)\b/g,
            ''
          )

          .replace(
            /\s+/g,
            ' '
          )

          .trim();

      let endereco =
        (resultado.endereco || '')

          .replace(
            /\s+/g,
            ' '
          )

          .trim();

      // ==========================
      // RESULTADO
      // ==========================
      document.getElementById(
        'nome'
      ).value =
        nome.toUpperCase();

      document.getElementById(
        'endereco'
      ).value =
        endereco.toUpperCase();

      document.getElementById(
        'resultado'
      ).style.display =
        'block';

      // ==========================
      // STATUS
      // ==========================
      if (
        !nome &&
        !endereco
      ) {

        mostrarStatus(
          '⚠️ Não foi possível ler o cartão.',
          'erro'
        );

      } else {

        mostrarStatus(
          '✅ Leitura concluída com IA!',
          'sucesso'
        );
      }

    } catch (err) {

      console.error(err);

      alert(
        'Erro IA: ' +
        err.message
      );
    }

    capturarBtn.disabled = false;

    capturarBtn.textContent =
      '📷 Escanear Cartão';
  }
);

// ==============================
// ADICIONAR À LISTA
// ==============================
document.getElementById(
  'adicionarBtn'
).addEventListener(
  'click',
  () => {

    const nome =
      document.getElementById(
        'nome'
      ).value;

    const endereco =
      document.getElementById(
        'endereco'
      ).value;

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
// ENVIAR TUDO
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
// LIMPAR LISTA
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
    document.getElementById(
      'status'
    );

  status.textContent = msg;

  status.className =
    'status ' + classe;

  setTimeout(() => {

    status.textContent =
      '';

    status.className =
      'status';

  }, 4000);
}

// ==============================
// INICIAR
// ==============================
tentarIniciarCamera();
