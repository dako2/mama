const WebSocket = require('ws');
const { spawn, execSync } = require('child_process');
const server = require('./server');

function isRaspberryPi() {
  try {
    const modelInfo = execSync('cat /proc/cpuinfo').toString();
    return modelInfo.toLowerCase().includes('raspberry');
  } catch (error) {
    return false;
  }
}

const pythonPath = isRaspberryPi() ? '/home/pi/miniconda3/bin/python' : 'python';

const wss = new WebSocket.Server({ server });
const clients = new Set();
let transcriptionStore = { text: '' };
let lastTranslationText = "";
const TRANSLATION_INTERVAL = 1000; // 1 second interval to avoid redundant translations

wss.on('connection', (ws) => {
  console.log('Client connected');
  ws.audioFormat = null;
  clients.add(ws);

  let ffmpeg = null;
  let pythonProcess = null;
  let audioBuffer = Buffer.alloc(0);
  const WRITE_THRESHOLD = 16000;
  const FLUSH_TIMEOUT_MS = 100;
  let flushTimer = null;

  function flushAudioBuffer() {
    if (ffmpeg && audioBuffer.length > 0) {
      ffmpeg.stdin.write(audioBuffer);
      audioBuffer = Buffer.alloc(0);
    }
    flushTimer = null;
  }

  function startTranscription() {
    pythonProcess = spawn(pythonPath, ['-u', 'transcribe_script.py']);
    ffmpeg.stdout.pipe(pythonProcess.stdin);

    pythonProcess.stdout.on('data', (data) => {
      const text = data.toString().trim();
      if (text) {
        console.log(`Transcription received: ${text}`);
        transcriptionStore.text = text;
        broadcast({ type: 'transcription', text });

        if (shouldTranslate(text)) {
          startTranslation(text, 'Chinese');
        }
      }
    });

    pythonProcess.stderr.on('data', (data) => {
      console.error('Python transcription process error:', data.toString());
    });
  }

  function shouldTranslate(newText) {
    const newWords = newText.split(' ').length - lastTranslationText.split(' ').length;
    return newWords >= 2;
  }

  function startTranslation(text, targetLanguage) {
    lastTranslationText = text;
    console.log(`Starting translation: ${text} -> ${targetLanguage}`);
    const translationProcess = spawn(pythonPath, ['-u', 'translate_script.py', text, targetLanguage]);

    translationProcess.stdout.on('data', (data) => {
      const translatedText = data.toString().trim();
      if (translatedText) {
        console.log(`Translation received: ${translatedText}`);
        broadcast({ type: 'translation', text: translatedText, language: targetLanguage });
      }
    });

    translationProcess.stderr.on('data', (data) => {
      console.error('Python translation process error:', data.toString());
    });
  }

  function broadcast(message) {
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(message));
      }
    }
  }

  ws.on('message', (message) => {
    if (Buffer.isBuffer(message)) {
      if (message[0] === 0x7B) {
        try {
          const msg = JSON.parse(message.toString('utf8'));
          if (msg.type === 'format') {
            ws.audioFormat = msg.format;
            console.log(`Received audio format: ${ws.audioFormat}`);
            return;
          }
        } catch (err) {
          console.error('Error parsing JSON:', err);
        }
      } else {
        audioBuffer = Buffer.concat([audioBuffer, message]);

        if (audioBuffer.length >= WRITE_THRESHOLD) {
          if (flushTimer) {
            clearTimeout(flushTimer);
            flushTimer = null;
          }
          flushAudioBuffer();
        } else {
          if (flushTimer) clearTimeout(flushTimer);
          flushTimer = setTimeout(flushAudioBuffer, FLUSH_TIMEOUT_MS);
        }

        if (!ffmpeg) {
          ffmpeg = spawn('ffmpeg', [
            '-f', 's16le',
            '-ar', '44100',
            '-ac', '1',
            '-i', 'pipe:0',
            '-f', 's16le',
            '-acodec', 'pcm_s16le',
            '-ar', '16000',
            '-ac', '1',
            'pipe:1'
          ]);
          console.log(`Spawned ffmpeg: ${ffmpeg.pid}`);
          startTranscription();
        }
      }
    } else {
      try {
        const msg = JSON.parse(message);
        if (msg.type === 'format') {
          ws.audioFormat = msg.format;
          console.log(`Audio format set to: ${ws.audioFormat}`);
          return;
        }
      } catch (err) {
        console.error('Error parsing JSON:', err);
      }
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    clients.delete(ws);

    if (ffmpeg) {
      ffmpeg.stdin.end();
      ffmpeg.kill();
    }
    if (pythonProcess) {
      pythonProcess.kill();
    }
  });
});

console.log('WebSocket server running...');
