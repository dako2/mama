document.addEventListener("DOMContentLoaded", () => {
    const displayTextElement = document.getElementById("displayText");
  
    // Global caches:
    // MemoryLog: each key is a timestamp (or unique index) with its value as a merged string from that update.
    let memoryLog = {};
    // WhisperCache: stores whisper segments (e.g., keyed by numeric strings) that update over time.
    let whisperCache = {};
  
    // Helper: Merge a transcription dictionary into a string with line breaks.
    function mergeTranscriptionSegments(segments) {
      if (typeof segments === "object" && segments !== null) {
        const sortedKeys = Object.keys(segments).sort((a, b) => Number(a) - Number(b));
        return sortedKeys.map(key => segments[key]).join("<br>");
      }
      return segments;
    }
  
    // Update caches with new incoming data.
    // Here, newData is assumed to be an object representing the latest whisper update.
    function updateCaches(newData) {
      // Update WhisperCache: merge newData into the existing object.
      Object.assign(whisperCache, newData);
      
      // Create a new MemoryLog entry with the current timestamp as the key.
      const timestamp = new Date().toISOString();
      // For this MemoryLog entry, we store the merged text from newData.
      memoryLog[timestamp] = mergeTranscriptionSegments(newData);
    }
  
    // Merge the two caches into one display string.
    // MemoryLog entries (sorted chronologically) are displayed in black,
    // and WhisperCache entries (sorted numerically) in gray.
    function mergeDisplayText(memoryLog, whisperCache) {
      // Merge MemoryLog entries.
      const sortedMemoryKeys = Object.keys(memoryLog).sort(); // ISO timestamps sort lexicographically
      const memoryText = sortedMemoryKeys.map(key => memoryLog[key]).join(" ");
      
      // Merge WhisperCache entries.
      const sortedWhisperKeys = Object.keys(whisperCache).sort((a, b) => Number(a) - Number(b));
      const whisperText = sortedWhisperKeys.map(key => whisperCache[key]).join(" ");
      
      return `<span style="color: black;">${memoryText}</span><br/><span style="color: gray;">${whisperText}</span>`;
    }
  
    // WebSocket message handler for incoming transcription data.
    function handleIncomingMessage(event) {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "transcription") {
          // Assume data.text is a dictionary of whisper segments.
          updateCaches(data.text);
          // Update the display element with the merged text.
          displayTextElement.innerHTML = mergeDisplayText(memoryLog, whisperCache);
          console.log("Updated display:", mergeDisplayText(memoryLog, whisperCache));
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
  