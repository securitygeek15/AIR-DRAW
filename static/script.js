
/* Finger drawing with pinch + face recognition gate using face-api.js */
const video = document.getElementById('video');
const overlay = document.getElementById('overlay');
const draw = document.getElementById('draw');
const brushSizeEl = document.getElementById('brushSize');
const brushColorEl = document.getElementById('brushColor');
const clearBtn = document.getElementById('clearBtn');
const authStatus = document.getElementById('authStatus');
const enrollImage = document.getElementById('enrollImage');
const toggleAuthBtn = document.getElementById('toggleAuthBtn');

const octx = overlay.getContext('2d');
const dctx = draw.getContext('2d');

let bypassAuth = false;
let authenticated = false;
let enrolledDescriptor = null;
let faceModelsLoaded = false;

let lastPoint = null;
let penDown = false;
let lastPinchState = false;

// Resize canvases to match video element CSS size
function resizeCanvases() {
  const rect = video.getBoundingClientRect();
  [overlay, draw].forEach(c => {
    c.width = video.videoWidth || rect.width;
    c.height = video.videoHeight || rect.height;
  });
}
window.addEventListener('resize', resizeCanvases);

// Load face-api models (from CDN paths inside the lib)
async function loadFaceModels() {
  // face-api.js expects model files in a relative folder if using loadFromUri.
  // We'll fetch from a public CDN. These paths can change in future; adjust if needed.
  const MODEL_URL = "https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/weights/";
  await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
  await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
  await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
  faceModelsLoaded = true;
}

// Init MediaPipe Hands
const hands = new Hands({locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`});
hands.setOptions({
  maxNumHands: 1,
  modelComplexity: 1,
  minDetectionConfidence: 0.6,
  minTrackingConfidence: 0.6
});

let camera = null;

async function initCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
  video.srcObject = stream;
  return new Promise(res => { video.onloadedmetadata = () => { video.play(); resizeCanvases(); res(); }; });
}

// Process each frame for MediaPipe Hands
async function processFrame() {
  if (video.videoWidth === 0) {
    requestAnimationFrame(processFrame);
    return;
  }
  await hands.send({image: video});
  requestAnimationFrame(processFrame);
}

// Hand landmark callback
hands.onResults(results => {
  octx.clearRect(0, 0, overlay.width, overlay.height);

  if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
    lastPoint = null;
    penDown = false;
    return;
  }

  const landmarks = results.multiHandLandmarks[0];
  // Index finger tip = 8, Thumb tip = 4
  const idx = landmarks[8];
  const th = landmarks[4];

  // Convert normalized coords [0..1] to pixels
  const x = idx.x * overlay.width;
  const y = idx.y * overlay.height;
  const tx = th.x * overlay.width;
  const ty = th.y * overlay.height;

  // Draw fingertip marker
  octx.beginPath();
  octx.arc(x, y, 8, 0, Math.PI * 2);
  octx.lineWidth = 2;
  octx.strokeStyle = '#00ff88';
  octx.stroke();

  // Pinch detection (thumb-index distance)
  const dist = Math.hypot(x - tx, y - ty);
  const isPinching = dist < 45; // pixels threshold

  // Only allow drawing when authenticated or bypassed
  const allowed = authenticated || bypassAuth;

  // Transition logic to avoid jitter: only toggle when state changes
  if (allowed) {
    if (isPinching && !lastPinchState) penDown = true;
    if (!isPinching && lastPinchState) { penDown = false; lastPoint = null; }
  } else {
    penDown = false;
    lastPoint = null;
  }
  lastPinchState = isPinching;

  if (penDown) {
    const size = parseInt(brushSizeEl.value, 10);
    const color = brushColorEl.value;
    dctx.lineCap = 'round';
    dctx.lineJoin = 'round';
    dctx.strokeStyle = color;
    dctx.lineWidth = size;

    if (lastPoint) {
      dctx.beginPath();
      dctx.moveTo(lastPoint.x, lastPoint.y);
      dctx.lineTo(x, y);
      dctx.stroke();
    }
    lastPoint = {x, y};
  }
});

// Face recognition pipeline (simple 1-person verification against enrolled photo)
async function checkFaceAuth() {
  if (!faceModelsLoaded || (!enrolledDescriptor && !bypassAuth)) {
    requestAnimationFrame(checkFaceAuth);
    return;
  }
  // Run every ~300ms to save compute
  setTimeout(async () => {
    let ok = false;
    try {
      const detections = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks().withFaceDescriptors();
      if (detections && detections.length > 0) {
        if (!enrolledDescriptor) {
          // If bypass is ON, mark as authenticated when any face present.
          ok = bypassAuth && detections.length > 0;
        } else {
          // Compare each detected face to enrolled descriptor using Euclidean distance
          const distances = detections.map(d => faceapi.euclideanDistance(d.descriptor, enrolledDescriptor));
          const min = Math.min(...distances);
          ok = min < 0.55; // threshold tweakable
        }
      }
    } catch (e) {
      console.warn('Face check error:', e);
    }
    authenticated = ok || bypassAuth;
    updateAuthBadge();
    requestAnimationFrame(checkFaceAuth);
  }, 300);
}

function updateAuthBadge() {
  if (bypassAuth) {
    authStatus.textContent = 'Bypass: Drawing allowed';
    authStatus.className = 'badge ok';
    return;
  }
  if (!faceModelsLoaded) {
    authStatus.textContent = 'Loading models…';
    authStatus.className = 'badge pending';
    return;
  }
  if (!enrolledDescriptor) {
    authStatus.textContent = 'No face enrolled';
    authStatus.className = 'badge pending';
    return;
  }
  if (authenticated) {
    authStatus.textContent = 'Authenticated';
    authStatus.className = 'badge ok';
  } else {
    authStatus.textContent = 'Face not recognized';
    authStatus.className = 'badge fail';
  }
}

clearBtn.addEventListener('click', () => {
  dctx.clearRect(0, 0, draw.width, draw.height);
});
document.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'c') {
    dctx.clearRect(0, 0, draw.width, draw.height);
  }
});

toggleAuthBtn.addEventListener('click', () => {
  bypassAuth = !bypassAuth;
  toggleAuthBtn.classList.toggle('active', bypassAuth);
  toggleAuthBtn.textContent = 'Bypass Auth: ' + (bypassAuth ? 'ON' : 'OFF');
  updateAuthBadge();
});

enrollImage.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const img = await fileToImage(file);
  // Resize for consistent descriptors
  const T = 256;
  const canvas = document.createElement('canvas');
  canvas.width = T; canvas.height = T;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, T, T);

  const detection = await faceapi.detectSingleFace(canvas, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks().withFaceDescriptor();
  if (detection && detection.descriptor) {
    enrolledDescriptor = detection.descriptor;
    updateAuthBadge();
  } else {
    alert('No face found in the enrolled image. Try another photo.');
  }
});

function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

(async function main() {
  try {
    await initCamera();
  } catch (e) {
    alert('Camera access denied. Please allow webcam.');
    console.error(e);
    return;
  }
  resizeCanvases();

  // Kick off hands + face
  await loadFaceModels().catch(err => console.error('Face models failed to load', err));
  updateAuthBadge();

  const cam = new Camera(video, {
    onFrame: async () => { /* handled by manual loop */ },
    width: 1280,
    height: 720
  });
  cam.start(); // required by MediaPipe but we'll call send() ourselves
  processFrame();
  checkFaceAuth();
})();
