// URL DO SEU WEB APP – SUBSTITUA PELA URL COPIADA NA ETAPA 1
const WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbw.../exec';

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
  // Desenhar frame no canvas
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
    
    // Processar o texto extraído
    processarTexto(text);
  } catch (err) {
    alert('Erro no OCR: ' + err.message);
  }
  
  document.getElementById('capturarBtn').disabled = false;
  document.getElementById('capturarBtn').textContent = '📷 Escanear Cartão';
});

function processarTexto(texto) {
  // Exemplo simples: assume que o cartão tem o nome e o endereço em linhas separadas.
  // Você pode ajustar a lógica conforme o padrão real dos seus cartões.
  const linhas = texto.split('\n').filter(l => l.trim() !== '');
  
  let nome = '';
  let endereco = '';
  
  // Heurística: a primeira linha é o nome, o resto é o endereço
  if (linhas.length >= 2) {
    nome = linhas[0].trim();
    endereco = linhas.slice(1).join(', ').trim();
  } else if (linhas.length === 1) {
    nome = linhas[0].trim();
  }
  
  document.getElementById('nome').value = nome.toUpperCase();
  document.getElementById('endereco').value = endereco.toUpperCase();
  
  document.getElementById('resultado').style.display = 'block';
}

// Enviar para a planilha
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

// Escanear outro (limpar)
document.getElementById('escanearOutroBtn').addEventListener('click', () => {
  limparCampos();
  document.getElementById('resultado').style.display = 'none';
});

function limparCampos() {
  document.getElementById('nome').value = '';
  document.getElementById('endereco').value = '';
  // Mantém quantidade, tipo, etc. como estavam, mas você pode resetar se quiser
}

function mostrarStatus(msg, classe) {
  const status = document.getElementById('status');
  status.textContent = msg;
  status.className = 'status ' + classe;
  setTimeout(() => { status.textContent = ''; status.className = 'status'; }, 4000);
}
