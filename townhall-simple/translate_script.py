import os
import sys
import logging
import openai
from openai import OpenAI
from dotenv import load_dotenv

import queue
import threading
import logging
import sys

def main():
    """
    Main entry point. Reads text to translate from command line arguments,
    calls the translation function, and prints the result.
    """
    # Optional: Set up logging for easier debugging.
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s:%(message)s')

    # Load environment variables (e.g., OPENAI_API_KEY)
    load_dotenv()
    OPENAI_API_KEY= os.getenv("OPENAI_API_KEY")
    client = OpenAI(api_key=OPENAI_API_KEY)

    if len(sys.argv) < 2:
        print("No text provided for translation.", flush=True)
        sys.exit(0)

    # The text to translate is the first argument.
    text_to_translate = sys.argv[1]

    # Optionally, read target language from second argument or default to Chinese.
    target_language = "Chinese"
    if len(sys.argv) >= 3:
        target_language = sys.argv[2]

    #logging.info(f"Translating text: '{text_to_translate}' -> {target_language}")

    # Perform translation using a streaming approach
    translation = translate_text_stream(client, text_to_translate, target_language=target_language)
    print(translation, flush=True)
    sys.stdout.flush()


def translate_text_stream_new(client: object, text: str, target_language: str = "Chinese", queue_maxsize: int = 2) -> str:
    """
    Translates the given text to `target_language` using OpenAI's ChatCompletion API in streaming mode.
    Buffers transcription data in a queue and triggers translation when the queue reaches `queue_maxsize`.
    Returns the fully assembled translation as a single string.
    """
    try:
        # Create a queue for buffering transcription data
        text_queue = queue.Queue(maxsize=queue_maxsize)
        
        # Add the input text to the queue
        text_queue.put(text)

        # Check if the queue is full before triggering translation
        if text_queue.full():
            collected_text = ""
            while not text_queue.empty():
                collected_text += text_queue.get() + " "

            if not collected_text.strip():
                return ""

            # Customize your system prompt to guide style or domain.
            prompt_system = (
                f"Translate into the language of {target_language}."
                f"Context: I'm watching SuperBowl live."
            )

            # Create a streaming ChatCompletion request
            response_stream = client.chat.completions.create(
                model="gpt-3.5-turbo",  # or another model, e.g. "gpt-4"
                messages=[
                    {"role": "system", "content": prompt_system},
                    {"role": "user", "content": collected_text},
                ],
                stream=True,          # IMPORTANT: Enable streaming
                temperature=0.7
            )

            # As we receive streamed tokens, build up the final translation string
            translation = ""
            for chunk in response_stream:
                if chunk.choices[0].delta.content:
                    translation += chunk.choices[0].delta.content

            # Print translation immediately for real-time output
            print(translation, flush=True)
            sys.stdout.flush()
            
            return translation
        
        return ""  # Return empty string if queue is not full yet

    except Exception as e:
        logging.error(f"Translation error: {e}")
        return ""

def translate_text_stream(client: object, text: str, target_language: str = "Chinese") -> str:
    """
    Translates the given text to `target_language` using OpenAI's ChatCompletion API in streaming mode.
    Returns the fully assembled translation as a single string.
    """
    try:
        # Customize your system prompt to guide style or domain.
        prompt_system = (
            #f"You are SuperBowl live commentor speaking {target_language}, your tone: engaing, concise, expertise. Use the information provided only. Game context: Chefs vs. Eagles, 2025 SuperBowl live.)" #Comment by translating the live SuperBowl comments into the language of {target_language}. 
            f"Be my personal assistant and speak in {target_language}"
        )

        # Create a streaming ChatCompletion request
        response_stream = client.chat.completions.create(
            model="gpt-4o-mini",  # or another model, e.g. "gpt-4"
            messages=[
                {"role": "system", "content": prompt_system},
                {"role": "user", "content": text},
            ],
            stream=True,          # IMPORTANT: Enable streaming
            #temperature=0.7
        )

        # As we receive streamed tokens, build up the final translation string
        translation = ""
        for chunk in response_stream:
            if chunk.choices[0].delta.content:
                translation += chunk.choices[0].delta.content
 
        return translation

    except Exception as e:
        logging.error(f"Translation error: {e}")
        return ""

if __name__ == "__main__":
    main()
