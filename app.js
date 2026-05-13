// ==============================
// CONFIGURAÇÕES
// ==============================
const WEBAPP_URL =
  'https://script.google.com/macros/s/AKfycbySC212AZVv5Whw-pPCmmUqwDfZGDQqw-Tlds8VBi8metYtDk-IqRF-jQj4TTXfshIdmg/exec';

const GEMINI_API_KEY =
  'AIzaSyB8vYwWXJPplJkom7-gosOyLEKrpTIOwxI';

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

    video.setAttribute(
      'autoplay',
      true
    );

    video.setAttribute(
      'muted',
      true
    );

    video.setAttribute(
      'playsinline',
      true
    );

    const stream =
      await navigator.mediaDevices.getUserMedia({

        video: {

          facingMode: 'environment',

          width: {
            ideal: 1280
          },

          height: {
            ideal: 720
          }
        },

        audio: false
      });

    video.srcObject = stream;

    await video.play();

    video.style.filter =
      'contrast(145%) brightness(110%) grayscale(100%)';

    definirCameraPronta(true);

    console.log('CAMERA OK');

  } catch (err) {

    console.error(
      'ERRO CAMERA',
      err
    );

    alert(
      'Erro ao abrir câmera: ' +
      err.message
    );

    definirCameraPronta(false);

    iniciarCameraBtn.style.display =
      'block';

    capturarBtn.disabled =
      false;

    capturarBtn.textContent =
      '📷 Permitir câmera';
  }
}

function definirCameraPronta(pronto) {

  cameraPronta = pronto;

  if (pronto) {

    capturarBtn.disabled =
      false;

    capturarBtn.textContent =
      '📷 Escanear Cartão';

    iniciarCameraBtn.style.display =
      'none';

  } else {

    capturarBtn.disabled =
      true;

    capturarBtn.textContent =
      '🔒 Câmera não iniciada';
  }
}

async function iniciarCameraManual() {

  iniciarCameraBtn.style.display =
    'none';

  capturarBtn.disabled =
    true;

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
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const payload = {

    contents: [{

      parts: [

        {

          text:
`Você é um leitor de cartões de entrega brasileiros.

REGRAS OBRIGATÓRIAS:

CAMPO "nome":
- SOMENTE nome de pessoa
- NUNCA incluir:
  - números
  - CEP
  - cidade
  - bairro
  - estado
  - endereço
- manter abreviações do nome
- exemplos válidos:
  - "ELIANE A D LIMA"
  - "JOSE CARLOS"
  - "M A SOUZA"

CAMPO "endereco":
- retornar SOMENTE:
  LOGRADOURO + NÚMERO

- PARAR EXATAMENTE no número
- NÃO incluir:
  - bairro
  - cidade
  - estado
  - CEP
  - complemento

EXEMPLOS:

Entrada:
RUA SAO JOSE 15
PARQUE VILA NOVA
DUQUE DE CAXIAS RJ

Saída:
{
  "nome": "MARIA JOSE",
  "endereco": "RUA SAO JOSE 15"
}

Outro exemplo:
TV BOA ESPERANCA 44
JARDIM PRIMAVERA

Saída:
{
  "nome": "ELIANE A D LIMA",
  "endereco": "TV BOA ESPERANCA 44"
}

IMPORTANTÍSSIMO:
- se existir número no campo nome, está ERRADO
- endereço SEMPRE termina no número
- preserve abreviações:
  - R
  - R.
  - TV
  - TV.
  - BC
  - BC.
  - AV
  - AV.

RETORNE SOMENTE JSON VÁLIDO.
SEM EXPLICAÇÕES.
SEM TEXTO EXTRA.`
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

  if (!response.ok) {

    const erro =
      await response.json();

    console.log(erro);

    throw new Error(
      erro?.error?.message ||
      'Erro IA'
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
// LIMPEZA
// ==============================
function limparTexto(
  texto,
  tipo = ''
) {

  texto = texto
    .replace(/\s+/g, ' ')
    .trim();

  // remove CEP
  texto = texto.replace(
    /\b\d{5}-?\d{3}\b/g,
    ''
  );

  // remove cidade/estado
  texto = texto.replace(
    /\bDUQUE DE CAXIAS\b/gi,
    ''
  );

  texto = texto.replace(
    /\bRJ\b/gi,
    ''
  );

  if (tipo === 'nome') {

    // remove números
    texto = texto.replace(
      /\d+/g,
      ''
    );

    // remove palavras de endereço
    texto = texto.replace(
      /\b(RUA|R|AV|AVENIDA|TV|TRAVESSA|BC|BECO|AL|ALAMEDA|ESTRADA|ESTR)\b/gi,
      ''
    );

    texto = texto
      .replace(/\s+/g, ' ')
      .trim();
  }

  if (tipo === 'endereco') {

    // pega somente até o número
    const match =
      texto.match(
        /^(.+?\b\d{1,5})\b/
      );

    if (match) {
      texto = match[1];
    }
  }

  return texto.trim();
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

      await new Promise(resolve =>
        setTimeout(resolve, 700)
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

      // melhora
      melhorarImagem();

      // base64
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
          resultado.nome || '',
          'nome'
        );

      let endereco =
        limparTexto(
          resultado.endereco || '',
          'endereco'
        );

      // campos
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
          '✅ Cartão lido',
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
