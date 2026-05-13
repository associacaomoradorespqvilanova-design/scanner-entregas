// URL DO SEU WEB APP – SUBSTITUA PELA URL COPIADA NA ETAPA 1
const WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbwgGd5JeE9P8TcK5DSKqDiyIA9k9O_q57BMXwG4x3deX7JhH7XN7dSrm6p7HQ35hebn1A/exec';

const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// Iniciar câmera traseira
async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: false
    });
    video.srcObject = stream;
  } catch (erro) {
    alert('Erro ao acessar a câmera: ' + erro.message);
  }
}
startCamera();

// Configurar data atual
document.getElementById('data').value = new Date().toLocaleDateString('pt-BR');

// Escanear cartão
document.getElementById('capturarBtn').addEventListener('click', async () => {
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  
  const imageData = canvas.toDataURL('image/png');
  document.getElementById('capturarBtn').disabled = true;
  document.getElementById('capturarBtn').textContent = '⏳ Processando OCR...';

  try {
    const worker = await Tesseract.createWorker('por', 1, {
      logger: m => {
        if (m.status === 'recognizing text') {
          document.getElementById('capturarBtn').textContent = 
            `⏳ Reconhecendo... ${Math.round(m.progress * 100)}%`;
        }
      }
    });
    
    const { data: { text } } = await worker.recognize(imageData);
    await worker.terminate();
    
    // Processamento inteligente do texto
    processarTexto(text);
  } catch (err) {
    alert('Erro no OCR: ' + err.message);
  }
  
  document.getElementById('capturarBtn').disabled = false;
  document.getElementById('capturarBtn').textContent = '📷 Escanear Cartão';
});

/**
 * Identifica nome e apenas o nome da rua (logradouro) no texto do cartão.
 * Regras:
 *  - Tudo antes da primeira linha que contém um tipo de logradouro (RUA, AV. etc.) é considerado NOME.
 *  - O endereço será a linha do logradouro + (se existir) a linha seguinte que contenha número.
 *  - Apenas o nome da rua e o número (se houver) são mantidos – bairro, cidade, CEP são descartados.
 */
function processarTexto(texto) {
  // Limpeza básica
  const linhasOriginais = texto
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 1); // remove linhas vazias ou com 1 caractere (ruído)
  
  // Palavras‑chave que indicam início de endereço (maiúsculas, sem acentos para facilitar)
  const prefixosRua = [
    'RUA', 'R ', 'AVENIDA', 'AV ', 'AV.', 'TRAVESSA', 'TRAV.', 'TRAV',
    'PRACA', 'PRAÇA', 'ALAMEDA', 'AL ', 'ESTRADA', 'ESTR.', 'RODOVIA', 'ROD.',
    'BECO', 'BEC ', 'LARGO', 'LGO', 'VIELA', 'VLA'
  ];
  
  // Expressão regular para detectar um número (parte do endereço)
  const regexNumero = /,\s*\d+|\s+\d+\s*$|^\d+\s/; // vírgula seguida de número, ou número no final, ou número no início

  let indiceInicioEndereco = -1;
  
  // Procura a primeira linha que começa com um dos prefixos de logradouro
  for (let i = 0; i < linhasOriginais.length; i++) {
    const linhaUpper = linhasOriginais[i].toUpperCase().replace(/[^A-Z\s]/g, '');
    if (prefixosRua.some(prefixo => linhaUpper.startsWith(prefixo + ' ') || linhaUpper === prefixo)) {
      indiceInicioEndereco = i;
      break;
    }
  }
  
  // Se não encontrou prefixo de rua, usa heurística simples (primeira linha = nome, restante = endereço)
  if (indiceInicioEndereco === -1) {
    if (linhasOriginais.length >= 2) {
      document.getElementById('nome').value = linhasOriginais[0].toUpperCase();
      // Junta todo o resto como endereço, mas vamos tentar limitar
      const resto = linhasOriginais.slice(1).join(', ').toUpperCase();
      document.getElementById('endereco').value = resto;
    } else if (linhasOriginais.length === 1) {
      document.getElementById('nome').value = linhasOriginais[0].toUpperCase();
      document.getElementById('endereco').value = '';
    }
    document.getElementById('resultado').style.display = 'block';
    return;
  }
  
  // Extrai nome: todas as linhas antes do endereço
  const linhasNome = linhasOriginais.slice(0, indiceInicioEndereco);
  const nome = linhasNome.join(' ').toUpperCase().trim();
  
  // Extrai endereço: linha do logradouro + próxima linha se contiver número
  let endereco = linhasOriginais[indiceInicioEndereco].trim();
  
  // Verifica se a linha seguinte (se existir) parece conter um número (ex: ", 123" ou "123")
  if (indiceInicioEndereco + 1 < linhasOriginais.length) {
    const linhaSeguinte = linhasOriginais[indiceInicioEndereco + 1].trim();
    if (regexNumero.test(linhaSeguinte) || /^\d+$/.test(linhaSeguinte)) {
      endereco += ', ' + linhaSeguinte;
    }
    // Se a linha seguinte não parece número, ignoramos (deve ser bairro/cidade)
  }
  
  // Converte para maiúsculas
  endereco = endereco.toUpperCase();
  
  // Remove possíveis sufixos indesejados (bairro, cidade) se vierem na mesma linha? 
  // Por simplicidade, mantemos como está, mas já cortamos linhas extras.
  
  document.getElementById('nome').value = nome;
  document.getElementById('endereco').value = endereco;
  
  document.getElementById('resultado').style.display = 'block';
}

// Enviar para a planilha (mantido igual)
document.getElementById('enviarBtn').addEventListener('click', async () => {
  const dados = {
    nome: document.getElementById('nome').value,
    endereco: document.getElementById('endereco').value,
    quantidade: document.getElementById('quantidade').value,
    tipo: document.getElementById('tipo').value,
    numero: document.getElementById('numero').value,
    obs: document.getElementById('obs').value,
    telefone: document.getElementById('telefone').value,
    data: document.getElementById('data').value
  };
  
  if (!dados.nome || !dados.endereco) {
    alert('Nome e endereço são obrigatórios!');
    return;
  }
  
  mostrarStatus('Enviando...', '');
  
  try {
    const resposta = await fetch(WEBAPP_URL, {
      method: 'POST',
      body: JSON.stringify(dados),
      headers: { 'Content-Type': 'application/json' }
    });
    const resultado = await resposta.json();
    
    if (resultado.success) {
      mostrarStatus('✅ Enviado com sucesso!', 'sucesso');
      limparCampos();
    } else {
      mostrarStatus('❌ Erro: ' + resultado.message, 'erro');
    }
  } catch (err) {
    mostrarStatus('❌ Falha na conexão: ' + err.message, 'erro');
  }
});

// Escanear outro
document.getElementById('escanearOutroBtn').addEventListener('click', () => {
  limparCampos();
  document.getElementById('resultado').style.display = 'none';
});

function limparCampos() {
  document.getElementById('nome').value = '';
  document.getElementById('endereco').value = '';
}

function mostrarStatus(msg, classe) {
  const status = document.getElementById('status');
  status.textContent = msg;
  status.className = 'status ' + classe;
  setTimeout(() => { status.textContent = ''; status.className = 'status'; }, 4000);
}
