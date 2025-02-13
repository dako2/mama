// =====================
// AudioStreamer Class
// =====================
class AudioStreamer {
  constructor() {
    this.mediaRecorder = null;
    this.audioContext = null;
    this.processor = null;
    this.stream = null;
  }

  static useFallback() {
    const isMediaRecorderSupported = typeof MediaRecorder !== "undefined";
    const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
    // Uncomment the next line to force raw PCM mode for testing:
    // return true;
    return !isMediaRecorderSupported || isIOS;
  }

  async start(onDataCallback) {
    try {
      console.log("AudioStreamer: Requesting microphone access...");
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      if (!AudioStreamer.useFallback()) {
        //console.log("AudioStreamer: Using MediaRecorder mode (WebM).");
        this.mediaRecorder = new MediaRecorder(this.stream, {
          mimeType: "audio/webm;codecs=opus",
        });
        this.mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0 && typeof onDataCallback === "function") {
            /*console.log(
              "AudioStreamer: MediaRecorder chunk received. Size:",
              event.data.size,
              "bytes"
            );*/
            onDataCallback(event.data);
          }
        };
        this.mediaRecorder.start(100);
        console.log("AudioStreamer: MediaRecorder started.");
      } else {
        console.log("AudioStreamer: Using Web Audio API fallback (raw PCM).");
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

        if (this.audioContext.state === "suspended") {
          await this.audioContext.resume();
          console.log("AudioStreamer: AudioContext resumed.");
        }

        const source = this.audioContext.createMediaStreamSource(this.stream);
        this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
        this.processor.onaudioprocess = (event) => {
          console.log("AudioStreamer: onaudioprocess event fired.");
          const inputData = event.inputBuffer.getChannelData(0);
          const pcmData = this._convertFloat32ToInt16(inputData);
          console.log(
            "AudioStreamer: Converted PCM data length (samples):",
            pcmData.length
          );
          if (typeof onDataCallback === "function") {
            onDataCallback(pcmData.buffer);
            console.log(
              "AudioStreamer: Sent fallback audio chunk of",
              pcmData.byteLength,
              "bytes."
            );
          }
        };
        source.connect(this.processor);
        this.processor.connect(this.audioContext.destination);
        console.log("AudioStreamer: Web Audio API fallback started.");
      }
    } catch (error) {
      throw new Error("AudioStreamer: Error starting audio stream: " + error.message);
    }
  }

  stop() {
    try {
      if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
        this.mediaRecorder.stop();
        console.log("AudioStreamer: MediaRecorder stopped.");
      }
      if (this.processor) {
        this.processor.disconnect();
        console.log("AudioStreamer: Processor disconnected.");
      }
      if (this.audioContext) {
        this.audioContext.close();
        console.log("AudioStreamer: AudioContext closed.");
      }
      if (this.stream) {
        this.stream.getTracks().forEach((track) => track.stop());
        console.log("AudioStreamer: Media stream tracks stopped.");
      }
    } catch (error) {
      console.warn("AudioStreamer: Error stopping audio stream:", error);
    }
  }

  _convertFloat32ToInt16(float32Array) {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      let s = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return int16Array;
  }
}

// ==========================
// WebSocketHandler Class
// ==========================
class WebSocketHandler {
  constructor({ onMessage, onError, onOpen, onClose }) {
    this.websocket = null;
    this.onMessage = onMessage;
    this.onError = onError;
    this.onOpen = onOpen;
    this.onClose = onClose;
  }

  connect(wsUrl) {
    return new Promise((resolve, reject) => {
      try {
        console.log("WebSocketHandler: Connecting to WebSocket at:", wsUrl);
        this.websocket = new WebSocket(wsUrl);
        this.websocket.binaryType = "arraybuffer";

        this.websocket.onopen = (event) => {
          if (this.onOpen) this.onOpen(event);
          console.log("WebSocketHandler: WebSocket connection opened.");

          const isMediaRecorderSupported = typeof MediaRecorder !== "undefined";
          const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
          const format = (!isMediaRecorderSupported || isIOS) ? 'pcm' : 'webm';
          console.log("WebSocketHandler: Determined audio format:", format);

          const formatMessage = JSON.stringify({ type: 'format', format });
          console.log("WebSocketHandler: Sending format message:", formatMessage);
          this.websocket.send(formatMessage);

          const targetLanguage = document.getElementById("languageSelect")?.value || "Chinese";
          const targetLanguageMessage = JSON.stringify({ type: 'targetLanguage', language: targetLanguage });
          console.log("WebSocketHandler: Sending targetLanguageMessage:", targetLanguageMessage);
          this.websocket.send(targetLanguageMessage);

          resolve(event);
        };

        this.websocket.onerror = (error) => {
          if (this.onError) this.onError(error);
          console.error("WebSocketHandler: WebSocket error:", error);
          reject(error);
        };

        this.websocket.onmessage = (event) => {
          if (this.onMessage) this.onMessage(event);
        };

        this.websocket.onclose = (event) => {
          if (this.onClose) this.onClose(event);
          console.log("WebSocketHandler: WebSocket connection closed.");
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  send(data) {
    if (this.websocket && this.websocket.readyState === WebSocket.OPEN && data != null) {
      //console.log("WebSocketHandler: Sending data through WebSocket.");
      this.websocket.send(data);
    } else {
      console.warn("WebSocketHandler: WebSocket is not open or data is null. Unable to send data.");
    }
  }

  close() {
    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      this.websocket.close();
      console.log("WebSocketHandler: WebSocket closed by client.");
    }
  }
}

// ==========================
// App Logic and UI Handling
// ==========================

// Global object to hold transcription segments
const transcriptionSegments = {};

// Updates the transcription display by merging and ordering segments
function updateTranscriptionDisplay() {
  const sortedKeys = Object.keys(transcriptionSegments).sort((a, b) => Number(a) - Number(b));
  const fullTranscription = sortedKeys.map(key => transcriptionSegments[key]).join(" ");
  document.getElementById("transcriptionText").innerText = fullTranscription;
}

function detectLanguage(text) {
  if (/[\u4E00-\u9FFF]/.test(text)) {
    return "zh-CN";  // Chinese Simplified
  } else if (/[\u3040-\u30FF]/.test(text)) {
    return "ja-JP";  // Japanese
  } else if (/[\uAC00-\uD7AF]/.test(text)) {
    return "ko-KR";  // Korean
  } else if (/[а-яА-ЯЁё]/.test(text)) {
    return "ru-RU";  // Russian
  } else {
    return "en-US";  // Default to English
  }
}

function speakText(text) {
  if (!window.speechSynthesis) {
    console.warn("Web Speech API not supported.");
    return;
  }

  const lang = detectLanguage(text);
  console.log(`Detected language: ${lang}`);

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = 1.0;
  utterance.pitch = 1.0;

  speechSynthesis.speak(utterance);
}

(function() {
  // DOM element references
  const streamButton = document.getElementById("streamButton");
  const transcriptionText = document.getElementById("transcriptionText");
  const translationText = document.getElementById("translationText");

  let audioStreamer = null;
  let wsHandler = null;
  let streaming = false;

  function logMessage(message) {
    console.log(message);
  }

  function getWebSocketUrl() {
    const protocol = location.protocol === "https:" ? "wss://" : "ws://";
    const host = location.host;
    return `${protocol}${host}`;
  }

  async function startStreaming() {
    try {
      logMessage("App: Initializing audio streamer...");
      audioStreamer = new AudioStreamer();

      logMessage("App: Connecting to WebSocket...");
      const wsUrl = getWebSocketUrl();
      wsHandler = new WebSocketHandler({
        onOpen: () => logMessage("App: WebSocket connection opened."),
        onError: (err) => logMessage("App: WebSocket error: " + err),
        onMessage: handleIncomingMessage,
        onClose: () => logMessage("App: WebSocket connection closed."),
      });
      await wsHandler.connect(wsUrl);

      await audioStreamer.start((audioData) => {
        wsHandler.send(audioData);
      });

      logMessage("App: Audio streaming started.");
      toggleStreaming(true);
    } catch (error) {
      logMessage("App: Failed to start streaming: " + error.message);
    }
  }

  function stopStreaming() {
    try {
      if (audioStreamer) audioStreamer.stop();
      if (wsHandler) wsHandler.close();
      logMessage("App: Streaming stopped.");
    } catch (error) {
      logMessage("App: Error stopping stream: " + error.message);
    } finally {
      toggleStreaming(false);
    }
  }

  // Modified message handler to merge transcription segments
  function handleIncomingMessage(event) {
    try {
      const data = JSON.parse(event.data);
      if (data.type === "transcription") {
        // If the incoming transcription is an object of segments
        if (typeof data.text === "object") {
          Object.keys(data.text).forEach((key) => {
            transcriptionSegments[key] = data.text[key];
          });
          updateTranscriptionDisplay();
          console.log("App: Updated transcription segments:", transcriptionSegments);
        } else {
          // Fallback if text is not segmented
          transcriptionText.innerHTML = data.text;
          
          console.log("App: Received transcription:", data.text);
        }
      } else if (data.type === "translation") {
        translationText.innerHTML = data.text;
        console.log("App: Received translation:", data.text);
        speakText(data.text);
      }
    } catch (error) {
      console.error("App: Error parsing WebSocket message:", error, event.data);
    }
  }

  function toggleStreaming(isStreaming) {
    streaming = isStreaming;
    streamButton.textContent = isStreaming ? "⏹ Stop Streaming" : "🎤 Start Streaming";
  }

  streamButton.addEventListener("click", () => {
    if (!streaming) {
      startStreaming();
    } else {
      stopStreaming();
    }
  });
})();
