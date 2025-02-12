// Optimized WebSocket server (wss.js)
const WebSocket = require('ws');
const { spawn } = require('child_process');
const server = require('./server');

const wss = new WebSocket.Server({ server });
let transcriptionStore = {};
let lastTranslationText = "";
const TRANSLATION_INTERVAL = 2000; // Adjust for performance

// Use a Set to track connected clients
const clients = new Set();

// Broadcast function to send a message to all connected clients
function broadcast(data) {
  const message = JSON.stringify(data);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

wss.on('connection', (ws) => {
  console.log('Client connected');
  clients.add(ws);

  const ffmpeg = spawn('ffmpeg', [
    '-i', 'pipe:0',
    '-f', 's16le',
    '-acodec', 'pcm_s16le',
    '-ar', '16000',
    '-ac', '1',
    'pipe:1'
  ]);
  
  const pythonProcess = spawn('python', ['-u', 'transcribe_script.py']);
  ffmpeg.stdout.pipe(pythonProcess.stdin);
  let audioFormat = null;

  ws.on('message', (message) => {
    if (!audioFormat) {
      try {
        const msg = JSON.parse(message);
        if (msg.type === 'format') {
          audioFormat = msg.format;
          return;
        }
      } catch (e) {
        // If JSON parsing fails, treat it as audio data.
      }
    }
    // Write the raw audio data to ffmpeg's stdin.
    ffmpeg.stdin.write(message);
  });

  // When transcription data is received, broadcast it to all clients.
  pythonProcess.stdout.on('data', (data) => {
    const text = data.toString().trim();
    if (text) {
      transcriptionStore = { ...transcriptionStore, text };
      broadcast({ type: 'transcription', text });
    }
  });

  // Periodically check if a new transcription is available and translate it.
  setInterval(() => {
    if (transcriptionStore.text && lastTranslationText !== transcriptionStore.text) {
      lastTranslationText = transcriptionStore.text;
      const translationProcess = spawn('python', ['-u', 'translate_script.py', lastTranslationText, 'Chinese']);
      translationProcess.stdout.on('data', (data) => {
        const translatedText = data.toString().trim();
        broadcast({ type: 'translation', text: translatedText });
      });
    }
  }, TRANSLATION_INTERVAL);

  // When a client disconnects, clean up.
  ws.on('close', () => {
    clients.delete(ws);
    ffmpeg.stdin.end();
    ffmpeg.kill();
    pythonProcess.kill();
  });
});

console.log('WebSocket server running...');
