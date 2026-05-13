````javascript
// ==============================
// CONFIGURAÇÕES
// ==============================
const WEBAPP_URL =
  'https://script.google.com/macros/s/AKfycbySC212AZVv5Whw-pPCmmUqwDfZGDQqw-Tlds8VBi8metYtDk-IqRF-jQj4TTXfshIdmg/exec';

// SUA API KEY
const GEMINI_API_KEY =
  'AIzaSyB8vYwWXJPplJkom7-gosOyLEKrpTIOwxI';

// MODELO MAIS ESTÁVEL
const GEMINI_MODEL =
  'gemini-1.5-flash-latest';

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
// INICIAR CAMERA
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

    // melhora imagem
    video.style.filter =
      'contrast(145%) brightness(110%) grayscale(100%)';

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
// DATA
// ==============================
document.getElementById('data').value =
  new Date().toLocaleDateString('pt-BR');

// ==============================
// MELHORAR IMAGEM
// ==============================
function melhorarImagem() {

  const imageData =
    ctx.getImageData(
      0,
      0,
      canvas.width,
      canvas.height
    );

  const data =
    imageData.data;

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
      media > 140
        ? 255
        : 0;

    data[i] = valor;
    data[i + 1] = valor;
    data[i + 2] = valor;
  }

  ctx.putImageData(
    imageData,
    0,
    0
  );
}

// ==============================
// GEMINI
// ==============================
async function extrairComGemini(
  imagemBase64
) {

  const url =
    `https://generativelanguage.googleapis.com/v1/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const payload = {

    contents: [{

      parts: [

        {

          text:
`Leia este cartão de entrega brasileiro.

Você DEVE retornar APENAS:

1. Nome completo da pessoa
2. Rua + número

IGNORE COMPLETAMENTE:
- bairro
- cidade
- estado
- CEP
- observações
- textos laterais
- códigos

RETORNE SOMENTE JSON.

EXEMPLO:

{
  "nome": "LUCIANA ALVES LOPES",
  "endereco": "RUA SAO PAULO 12"
}

NÃO escreva explicações.
NÃO escreva markdown.
NÃO escreva texto adicional.`
        },

        {

          inlineData: {

            mimeType:
              'image/jpeg',

            data:
              imagemBase64
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

  // ==========================
  // TRATAMENTO DE ERRO
  // ==========================
  if (!response.ok) {

    const erro =
      await response.json();

    console.log(erro);

    // quota excedida
    if (
      erro?.error?.code === 429
    ) {

      throw new Error(
        'LIMITE DA IA ATINGIDO. AGUARDE 1 MINUTO.'
      );
    }

    // api inválida
    if (
      erro?.error?.status ===
      'INVALID_ARGUMENT'
    ) {

      throw new Error(
        'API KEY INVÁLIDA'
      );
    }

    throw new Error(
      erro?.error?.message ||
      'Erro desconhecido'
    );
  }

  const data =
    await response.json();

  console.log(
    'RESPOSTA GEMINI'
  );

  console.log(data);

  const texto =
    data?.candidates?.[0]?.content?.parts?.[0]?.text
    || '{"nome":"","endereco":""}';

  // remove markdown
  const jsonLimpo =
    texto
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();

  let resultado;

  try {

    resultado =
      JSON.parse(jsonLimpo);

  } catch {

    resultado = {
      nome: '',
      endereco: ''
    };
  }

  return resultado;
}

// ==============================
// LIMPEZA FINAL
// ==============================
function limparTexto(texto) {

  return texto
    .replace(/\s+/g, ' ')
    .replace(/CEP.*$/gi, '')
    .replace(/DUQUE DE CAXIAS.*$/gi, '')
    .replace(/RJ.*$/gi, '')
    .trim();
}

// ==============================
// ESCANEAR
// ==============================
capturarBtn.addEventListener(
  'click',
  async () => {

    if (!cameraPronta)
      return;

    capturarBtn.disabled =
      true;

    capturarBtn.textContent =
      '⏳ Consultando IA...';

    try {

      // estabiliza foco
      await new Promise(resolve =>
        setTimeout(resolve, 800)
      );

      // captura
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

      // melhora imagem
      melhorarImagem();

      // gera base64
      const imagemBase64 =
        canvas
          .toDataURL(
            'image/jpeg',
            0.95
          )
          .split(',')[1];

      // IA
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

      // limpa
      let nome =
        limparTexto(
          resultado.nome || ''
        );

      let endereco =
        limparTexto(
          resultado.endereco || ''
        );

      // CAMPOS
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

      // edição manual
      document.getElementById(
        'nome'
      ).readOnly = false;

      document.getElementById(
        'endereco'
      ).readOnly = false;

      if (
        !nome &&
        !endereco
      ) {

        mostrarStatus(
          '⚠️ IA não conseguiu ler',
          'erro'
        );

      } else {

        mostrarStatus(
          '✅ Cartão lido com IA',
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

    capturarBtn.disabled =
      false;

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

      if (
        resultado.success
      ) {

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
        document.createElement(
          'li'
        );

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

      listaUl.appendChild(
        li
      );
    }
  );
}

// ==============================
// REMOVER
// ==============================
function removerItem(
  indice
) {

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

  status.textContent =
    msg;

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
````
