class AudioStreamer {
    constructor() {
      this.mediaRecorder = null;
      this.audioContext = null;
      this.processor = null;
      this.stream = null;
    }
  
    static isIOS() {
      return /iPhone|iPad|iPod/.test(navigator.userAgent);
    }
  
    static isMediaRecorderSupported() {
      return typeof MediaRecorder !== "undefined";
    }
  
    static getAudioFormat() {
      return this.isMediaRecorderSupported() && !this.isIOS() ? "webm" : "pcm";
    }
  
    async start(onDataCallback) {
      try {
        console.log("AudioStreamer: Requesting microphone access...");
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  
        const format = AudioStreamer.getAudioFormat();
        console.log("AudioStreamer: Detected format:", format);
  
        if (format === "webm") {
          this.mediaRecorder = new MediaRecorder(this.stream, {
            mimeType: "audio/webm;codecs=opus",
          });
          this.mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0 && typeof onDataCallback === "function") {
              onDataCallback(event.data);
            }
          };
          this.mediaRecorder.start(100);
          console.log("AudioStreamer: MediaRecorder started in WebM mode.");
        } else {
          console.log("AudioStreamer: Using Web Audio API fallback (PCM).");
          this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
  
          if (this.audioContext.state === "suspended") {
            await this.audioContext.resume();
            console.log("AudioStreamer: AudioContext resumed.");
          }
  
          const source = this.audioContext.createMediaStreamSource(this.stream);
          this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
          this.processor.onaudioprocess = (event) => {
            const inputData = event.inputBuffer.getChannelData(0);
            const pcmData = this._convertFloat32ToInt16(inputData);
            if (typeof onDataCallback === "function") {
              onDataCallback(pcmData.buffer);
            }
          };
          source.connect(this.processor);
          this.processor.connect(this.audioContext.destination);
          console.log("AudioStreamer: Web Audio API fallback started.");
        }
      } catch (error) {
        console.error("AudioStreamer: Error starting stream:", error);
      }
    }
  
    stop() {
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
        console.log("AudioStreamer: Media stream stopped.");
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
  