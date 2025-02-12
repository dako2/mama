// Optimized WebSocket server (wss.js)
const WebSocket = require('ws');
const { spawn } = require('child_process');
const server = require('./server');

const wss = new WebSocket.Server({ server });
let transcriptionStore = { text: '' }; // Global transcription text
// Keep track of connected clients.
const clients = new Set();

// When a client connects...
wss.on('connection', (ws) => {
  console.log('Client connected');

  // Set default properties for this connection.
  ws.audioFormat = null; // Will be set upon receiving a control message.
  clients.add(ws);

  let ffmpeg = null;
  let pythonProcess = null;
  let ffmpegSpawned = false;

  // Accumulator for binary audio data.
  let audioBuffer = Buffer.alloc(0);
  // Write threshold (expected chunk size for Python transcription process).
  const WRITE_THRESHOLD = 16000;
  // Flush timeout in milliseconds (adjust as needed).
  const FLUSH_TIMEOUT_MS = 100;
  let flushTimer = null;

  // Helper function to flush the audio buffer to ffmpeg.
  function flushAudioBuffer() {
    if (ffmpeg && audioBuffer.length > 0) {
      ffmpeg.stdin.write(audioBuffer);
      //console.log(`Flushed ${audioBuffer.length} bytes to ffmpeg.`);
      audioBuffer = Buffer.alloc(0);
    }
    flushTimer = null;
  }

  ws.on('message', (message) => {
    // If the message is a Buffer, check its first byte.
    if (Buffer.isBuffer(message)) {
      // Check if the message likely represents a JSON control message.
      if (message[0] === 0x7B) { // 0x7B === '{'
        // Convert the buffer to a string and try parsing it as JSON.
        const textMessage = message.toString('utf8');
        try {
          const msg = JSON.parse(textMessage);
          if (msg.type === 'format') {
            ws.audioFormat = msg.format;
            console.log(`Received audio format from client: ${ws.audioFormat}`);
            return; // Control message handled.
          }
        } catch (err) {
          console.error('Error parsing JSON control message:', err);
        }
      } else {
        // Otherwise, assume it's binary audio data.
        const chunk = message; // already a Buffer
        //console.log(`Received binary audio data of length: ${chunk.length}`);
        // (Then your buffering logic below follows here.)
        audioBuffer = Buffer.concat([audioBuffer, chunk]);
  
        // Flush immediately if we've reached the threshold.
        if (audioBuffer.length >= WRITE_THRESHOLD) {
          if (flushTimer) {
            clearTimeout(flushTimer);
            flushTimer = null;
          }
          flushAudioBuffer();
        } else {
          // Otherwise, reset a flush timer.
          if (flushTimer) clearTimeout(flushTimer);
          flushTimer = setTimeout(flushAudioBuffer, FLUSH_TIMEOUT_MS);
        }
  
        // Spawn ffmpeg and transcription process if not yet spawned.
        if (!ffmpegSpawned) {
          const format = ws.audioFormat || 'pcm'; // default to PCM if not specified.
          let ffmpegArgs;
          if (format === 'pcm') {
            ffmpegArgs = [
              '-i', 'pipe:0',
              '-f', 's16le',
              '-acodec', 'pcm_s16le',
              '-ar', '16000',
              '-ac', '1',
              'pipe:1'
            ];
          } else if (format === 'webm') {
            ffmpegArgs = [
              '-f', 'webm',
              '-i', 'pipe:0',
              '-f', 's16le',
              '-acodec', 'pcm_s16le',
              '-ar', '16000',
              '-ac', '1',
              'pipe:1'
            ];
          } else {
            ffmpegArgs = [
              '-i', 'pipe:0',
              '-f', 's16le',
              '-acodec', 'pcm_s16le',
              '-ar', '16000',
              '-ac', '1',
              'pipe:1'
            ];
          }
          ffmpeg = spawn('ffmpeg', ffmpegArgs);
          ffmpegSpawned = true;
          console.log(`Spawned ffmpeg process with PID: ${ffmpeg.pid} using format: ${format}`);
  
          // Spawn the transcription process.
          pythonProcess = spawn('python', ['-u', 'transcribe_script.py']);
          console.log(`Spawned transcription process with PID: ${pythonProcess.pid}`);
          ffmpeg.stdout.pipe(pythonProcess.stdin);
  
          pythonProcess.stdout.on('data', (data) => {
            const text = data.toString().trim();
            if (text) {
              console.log(`Transcription received: ${text}`);
              transcriptionStore.text = text;
              // Broadcast the transcription to all connected clients.
              for (const client of clients) {
                if (client.readyState === WebSocket.OPEN) {
                  client.send(JSON.stringify({ type: 'transcription', text }));
                }
              }
            }
          });
          pythonProcess.stderr.on('data', (data) => {
            console.error('Python transcription process error:', data.toString());
          });
        }
      }
    } else if (typeof message === 'string') {
      // In some cases, messages may already be strings.
      try {
        const msg = JSON.parse(message);
        if (msg.type === 'format') {
          ws.audioFormat = msg.format;
          console.log(`Received audio format from client: ${ws.audioFormat}`);
          return; // Control message handled.
        }
      } catch (err) {
        console.error('Error parsing JSON control message:', err);
      }
    }
  });
  

  ws.on('close', () => {
    console.log('Client disconnected');
    clients.delete(ws);
    // Flush any remaining audio data before closing.
    if (ffmpeg && audioBuffer.length > 0) {
      ffmpeg.stdin.write(audioBuffer);
      console.log(`Wrote final ${audioBuffer.length} bytes to ffmpeg before closing.`);
    }
    if (flushTimer) clearTimeout(flushTimer);
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
