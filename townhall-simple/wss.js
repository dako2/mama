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
const TRANSLATION_INTERVAL = 3000; // 1 second interval to avoid redundant translations

function broadcast(message) {
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  }
}

function logToClients(message) {
  console.log(message); // Keep logging to the server console
  broadcast({ type: 'log', message });
}

wss.on("connection", (ws) => {
  logToClients("🔗 Client connected");
  clients.add(ws);

  ws.audioFormat = null;
  let ffmpeg = null;
  let pythonProcess = null;
  let audioBuffer = Buffer.alloc(0);
  const WRITE_THRESHOLD = 16000;
  const FLUSH_TIMEOUT_MS = 100;
  let flushTimer = null;

  let lastTranscriptionText = "";
  let lastTranslationTime = Date.now();

  function flushAudioBuffer() {
    if (ffmpeg && audioBuffer.length > 0) {
      ffmpeg.stdin.write(audioBuffer);
      audioBuffer = Buffer.alloc(0);
    }
    flushTimer = null;
  }

  function startTranscription() {
    pythonProcess = spawn("python3", ["-u", "transcribe_script.py"]);
    ffmpeg.stdout.pipe(pythonProcess.stdin);

    pythonProcess.stdout.on("data", (data) => {
      const text = data.toString().trim();
      if (text) {
        logToClients(`📝 Transcription: ${text}`);
        broadcast({ type: "transcription", text });

        // Trigger translation when new words are detected or after 1 second
        if (shouldTranslate(text)) {
          startTranslation(text, "Chinese");
        }
      }
    });

    pythonProcess.stderr.on("data", (data) => {
      logToClients(`Error: Python transcription error: ${data.toString()}`);
    });
  }

  function shouldTranslate(newText) {
    const now = Date.now();
    const newWords = newText.split(" ").length - lastTranscriptionText.split(" ").length;

    if (newWords >= 2 || now - lastTranslationTime >= TRANSLATION_INTERVAL) {
      lastTranscriptionText = newText;
      lastTranslationTime = now;
      return true;
    }
    return false;
  }

  function startTranslation(text, targetLanguage) {
    logToClients(`🌍 Starting translation: ${text} -> ${targetLanguage}`);
    const translationProcess = spawn("python3", ["-u", "translate_script.py", text, targetLanguage]);

    translationProcess.stdout.on("data", (data) => {
      const translatedText = data.toString().trim();
      if (translatedText) {
        logToClients(`🗣️ Translation: ${translatedText}`);
        broadcast({ type: "translation", text: translatedText, language: targetLanguage });
      }
    });

    translationProcess.stderr.on("data", (data) => {
      logToClients(`Error: Python translation error: ${data.toString()}`);
    });
  }

  function startFFmpeg(format) {
    if (ffmpeg) {
      logToClients("🔴 Stopping existing FFmpeg process...");
      ffmpeg.stdin.end();
      ffmpeg.kill();
    }

    if (format === "pcm") {
      logToClients("🎙️ Starting FFmpeg for PCM...");
      ffmpeg = spawn("ffmpeg", [
        "-f", "s16le",
        "-ar", "44100",
        "-ac", "1",
        "-i", "pipe:0",
        "-f", "s16le",
        "-acodec", "pcm_s16le",
        "-ar", "16000",
        "-ac", "1",
        "pipe:1",
      ]);
    } else if (format === "webm") {
      logToClients("🎙️ Starting FFmpeg for WebM...");
      ffmpeg = spawn("ffmpeg", [
        "-i", "pipe:0",
        "-f", "wav",
        "-acodec", "pcm_s16le",
        "-ar", "16000",
        "-ac", "1",
        "pipe:1",
      ]);
    } else {
      logToClients("Error: ❌ Unsupported format:", format);
      ws.send(JSON.stringify({ error: "Unsupported format" }));
      return;
    }

    ffmpeg.stderr.on("data", (data) => {
      logToClients(`Error: FFmpeg stderr: ${data.toString()}`);
    });

    ffmpeg.on("exit", (code, signal) => {
      logToClients(`FFmpeg exited with code ${code}, signal ${signal}`);
    });

    startTranscription();
  }

  ws.on("message", (message) => {
    if (Buffer.isBuffer(message)) {
      if (message[0] === 0x7B) { // JSON message (likely format)
        try {
          const msg = JSON.parse(message.toString("utf8"));
          if (msg.type === "format") {
            ws.audioFormat = msg.format;
            logToClients(`🎵 Audio format received: ${ws.audioFormat}`);
            startFFmpeg(ws.audioFormat);  // Restart FFmpeg with correct format
            return;
          }
        } catch (err) {
          logToClients("Error: ❌ Error parsing JSON:", err);
        }
      } else {
        // Append audio to buffer
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
      }
    } else {
      try {
        const msg = JSON.parse(message);
        if (msg.type === "format") {
          ws.audioFormat = msg.format;
          logToClients(`🎵 Audio format received: ${ws.audioFormat}`);
          startFFmpeg(ws.audioFormat);
          return;
        }
      } catch (err) {
        logToClients("[Error]❌ Error parsing JSON:", err);
      }
    }
  });

  ws.on("close", () => {
    logToClients("🔌 Client disconnected");
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

function broadcast(message) {
  const jsonString = JSON.stringify(message);
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(jsonString);
    }
  });
}

logToClients('WebSocket server running...');
