document.addEventListener("DOMContentLoaded", () => {
    const displayTextElement = document.getElementById("displayText");
   
    // WebSocket message handler for incoming transcription data.
    function handleIncomingMessage(event) {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'log') {
            console.log(`[LOG] ${data.message}`);
            displayTextElement.innerHTML += `[LOG] ${data.message}<br>`;
        } else if (data.type === 'transcription') {
            console.log(`[Transcription] ${data.text}`);
            displayTextElement.innerHTML += `[Transcription] ${data.text}<br>`;
        } else if (data.type === 'translation') {
            console.log(`[Translation] ${data.text} (${data.language})`);
            displayTextElement.innerHTML += `[Translation] ${data.text} (${data.language})<br>`;
        }
        // You can add handling for other message types (e.g., translation) if needed.
      } catch (error) {
        console.error("Error parsing WebSocket message:", error);
      }
    }
  
    // WebSocketHandler class to encapsulate connection handling.
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
          this.websocket = new WebSocket(wsUrl);
          this.websocket.binaryType = "arraybuffer";
    
          this.websocket.onopen = (event) => {
            if (this.onOpen) this.onOpen(event);
            resolve(event);
          };
    
          this.websocket.onerror = (error) => {
            if (this.onError) this.onError(error);
            reject(error);
          };
    
          this.websocket.onmessage = (event) => {
            if (this.onMessage) this.onMessage(event);
          };
    
          this.websocket.onclose = (event) => {
            if (this.onClose) this.onClose(event);
          };
        });
      }
    
      close() {
        if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
          this.websocket.close();
        }
      }
    }
    
    // Determine the proper WebSocket URL.
    function getWebSocketUrl() {
      const protocol = location.protocol === "https:" ? "wss://" : "ws://";
      return `${protocol}${location.host}`;
    }
    
    // Create and connect the WebSocket.
    const wsHandler = new WebSocketHandler({
      onOpen: () => console.log("WebSocket connection opened."),
      onError: (err) => console.error("WebSocket error: " + err),
      onMessage: handleIncomingMessage,
      onClose: () => console.log("WebSocket connection closed."),
    });
    
    wsHandler.connect(getWebSocketUrl());
  });
  