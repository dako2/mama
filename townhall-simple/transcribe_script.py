#!/usr/bin/env python
import sys
import json
import time
import threading
import urllib.parse
import websocket
import logging

# Configure logging for better visibility
logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s:%(message)s')
logger = logging.getLogger(__name__)

# === Configuration ===
API_KEY = "fw_3ZnPWupFvcyudUcpifWoLe6r"  # Replace with your actual API key
BASE_URL = "ws://audio-streaming.us-virginia-1.direct.fireworks.ai/v1/audio/transcriptions/streaming"
CHUNK_DURATION_MS = 1000  # Duration of each audio chunk in milliseconds
SAMPLE_RATE = 16000       # 16 kHz
# Since ffmpeg outputs 16-bit PCM, each sample is 2 bytes.
CHUNK_SIZE = int(SAMPLE_RATE * CHUNK_DURATION_MS / 1000) * 2  # In bytes
logger.info("Configured CHUNK_SIZE: %d bytes", CHUNK_SIZE)

# === WebSocket Handlers ===
def on_message(ws, message):
    try:
        logger.debug("Raw message received: %s", message)
        msg = json.loads(message)
        logger.debug("Parsed JSON message: %s", msg)
        
        if "segments" in msg:
            segments = {seg.get("id", "unknown"): seg.get("text", "") for seg in msg["segments"]}
            # Print the segments in a nicely formatted JSON.
            print(json.dumps(segments, indent=2, ensure_ascii=False), flush=True)
        else:
            logger.warning("No 'segments' key found in the message.")
    except Exception as e:
        logger.error("Error processing message: %s", e, exc_info=True)

def on_error(ws, error):
    logger.error("WebSocket error: %s", error)

def on_close(ws, close_status_code, close_msg):
    logger.info("WebSocket closed with code %s, message: %s", close_status_code, close_msg)

def on_open(ws):
    logger.info("WebSocket connection opened.")
    
    def send_audio():
        while True:
            data = sys.stdin.buffer.read(CHUNK_SIZE)
            if not data:
                logger.info("No more data from stdin. Exiting send_audio thread.")
                break
            logger.debug("Read audio chunk of %d bytes", len(data))
            # Check if the chunk length is as expected.
            if len(data) != CHUNK_SIZE:
                logger.warning("Expected chunk size %d bytes, but got %d bytes", CHUNK_SIZE, len(data))
            try:
                ws.send(data, opcode=websocket.ABNF.OPCODE_BINARY)
            except Exception as send_err:
                logger.error("Error sending audio chunk: %s", send_err)
            time.sleep(0.01)  # Throttle the sending rate if necessary

    threading.Thread(target=send_audio, daemon=True).start()

def main():
    # Build the transcription endpoint URL with query parameters.
    params = urllib.parse.urlencode({
        "model": "whisper-v3",
        # You could add a language parameter here if needed.
        #"language": "en",
    })
    url = f"{BASE_URL}?{params}"
    headers = {"Authorization": API_KEY}

    # Create and run the WebSocketApp.
    ws = websocket.WebSocketApp(
        url,
        header=headers,
        on_open=on_open,
        on_message=on_message,
        on_error=on_error,
        on_close=on_close,
    )
    logger.info("Connecting to transcription service at: %s", url)
    ws.run_forever()

if __name__ == "__main__":
    main()
