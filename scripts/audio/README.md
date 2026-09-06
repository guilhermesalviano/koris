# Koris Audio Transcription Sidecar (sherpa-onnx)

A lightweight, local speech-to-text (STT) HTTP sidecar for Koris using [`sherpa-onnx`](https://github.com/k2-fsa/sherpa-onnx) and the quantized `whisper-tiny` int8 model.

Optimized specifically for CPU inference on an **Intel 2018 Mac mini** (and similar low-spec host machines).

---

## Features

- **OpenAI Compatible Endpoint**: Ingest audio at `POST /v1/audio/transcriptions` (and alias `POST /transcribe`) via `multipart/form-data`.
- **Broad Audio Format Support**: Converts any incoming audio format (OGG/Opus, WebM, MP3, M4A, WAV, etc.) to 16kHz mono 16-bit PCM using `pydub` and `ffmpeg`.
- **CPU & Thermal Management**:
  - Uses the quantized int8 Whisper tiny model (~70MB RAM footprint).
  - Defaults to 2 compute threads (`SHERPA_NUM_THREADS=2`) to prevent thermal throttling on Intel Core i3/i5/i7.
  - Serializes incoming transcription requests with an `asyncio.Lock()` (1 concurrent transcription at a time) to prevent CPU spikes.
- **Fast Startup & Health Checks**: `GET /health` returns service status and loaded model details.

---

## Prerequisites

- **Python 3.9+**
- **ffmpeg** (required for decoding non-WAV audio):
  - macOS: `brew install ffmpeg`
  - Ubuntu/Debian: `sudo apt update && sudo apt install -y ffmpeg`

---

## Quick Start

### 1. Setup Environment & Download Model

Run the automated setup script to create `.venv`, install requirements, and download the `whisper-tiny` int8 model:

```bash
pnpm audio:setup
# Or directly:
bash scripts/audio/setup.sh
```

### 2. Start the Server

Start the FastAPI HTTP sidecar (defaults to `127.0.0.1:6006`):

```bash
pnpm audio:start
# Or directly:
bash scripts/audio/run.sh
```

---

## API Reference

### 1. Health Check
```bash
curl http://127.0.0.1:6006/health
```

Example response:
```json
{
  "status": "ok",
  "model": {
    "name": "whisper-tiny-int8",
    "model_dir": "/path/to/koris/scripts/audio/models/whisper-tiny",
    "encoder": "/path/to/koris/scripts/audio/models/whisper-tiny/tiny-encoder.int8.onnx",
    "decoder": "/path/to/koris/scripts/audio/models/whisper-tiny/tiny-decoder.int8.onnx",
    "tokens": "/path/to/koris/scripts/audio/models/whisper-tiny/tiny-tokens.txt",
    "threads": 2,
    "loaded": true,
    "cached_languages": [""]
  },
  "device": "cpu",
  "lock_acquired": false
}
```

### 2. OpenAI Transcription (`/v1/audio/transcriptions` or `/transcribe`)

Send an audio file using multipart form data:

```bash
curl http://127.0.0.1:6006/v1/audio/transcriptions \
  -F "file=@/path/to/voice_message.ogg" \
  -F "model=whisper-tiny"
```

Response:
```json
{
  "text": "Hello world, this is a test audio transcription."
}
```

Optional parameters:
- `language`: e.g. `"en"`, `"pt"`, `"es"`, `"fr"`. Omit or set to `"auto"` for automatic language detection.
- `temperature`: float (ignored by greedy search, accepted for OpenAI SDK compatibility).
- `response_format`: `"json"` (default, returns `{"text": ...}`) or `"text"` (returns plain text string).

---

## Environment Variables

| Variable | Default | Description |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Host address to bind HTTP server |
| `PORT` | `6006` | Port to bind HTTP server |
| `SHERPA_NUM_THREADS` | `2` | Number of CPU compute threads for ONNX runtime (1–4) |
| `SHERPA_MODEL_DIR` | `scripts/audio/models/whisper-tiny` | Directory containing model `.onnx` and `tokens.txt` files |
| `LOG_LEVEL` | `INFO` | Logging level (`DEBUG`, `INFO`, `WARNING`, `ERROR`) |

---

## macOS Auto-Start (launchd)

To run the audio sidecar automatically in the background upon login on macOS:

1. Copy the plist template to `~/Library/LaunchAgents/`:
   ```bash
   cp scripts/audio/com.koris.audio-sidecar.plist ~/Library/LaunchAgents/
   ```

2. Replace the `__KORIS_ROOT__` and `__HOME__` placeholders:
   ```bash
   KORIS_DIR="$(pwd)"
   sed -i '' "s|__KORIS_ROOT__|${KORIS_DIR}|g" ~/Library/LaunchAgents/com.koris.audio-sidecar.plist
   sed -i '' "s|__HOME__|${HOME}|g" ~/Library/LaunchAgents/com.koris.audio-sidecar.plist
   ```

3. Load and start the service:
   ```bash
   launchctl load ~/Library/LaunchAgents/com.koris.audio-sidecar.plist
   ```

4. Verify service is running:
   ```bash
   launchctl list | grep koris
   curl http://127.0.0.1:6006/health
   ```

5. View service logs:
   ```bash
   tail -f ~/Library/Logs/koris-audio-sidecar.log
   tail -f ~/Library/Logs/koris-audio-sidecar.err.log
   ```

6. To stop / unload:
   ```bash
   launchctl unload ~/Library/LaunchAgents/com.koris.audio-sidecar.plist
   ```
