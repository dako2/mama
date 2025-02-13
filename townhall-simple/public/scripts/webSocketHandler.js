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

