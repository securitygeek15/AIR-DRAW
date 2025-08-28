
# FingerDraw + FaceAuth (Flask)

A minimal web server that serves a browser app where you can draw with your fingers (tracked via MediaPipe Hands) and gate drawing using face recognition (face-api.js). All AI runs locally in the browser.

## Quick start

```bash
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

pip install -r requirements.txt

python app.py
# visit http://localhost:5000
```

## Notes
- Requires internet on first run to download models from CDNs.
- Click **Enroll face** to upload your reference photo. When recognized in webcam, status shows **Authenticated**, and drawing is enabled.
- You can test without face auth by clicking **Bypass Auth**.
- Draw by pinching **thumb + index**. Release to stop drawing.
- Press **C** or use **Clear** to erase the drawing layer.
