/* ===== AUDIO CAPTURE & PITCH DETECTION ===== */
let audioCtx = null;
let analyser = null;
let dataArray = null;
let isAudioReady = false;
let micEnabled = true;
let mediaStream = null;

async function initAudio() {
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
    const source = audioCtx.createMediaStreamSource(mediaStream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.3;
    source.connect(analyser);
    dataArray = new Float32Array(analyser.fftSize);
    isAudioReady = true;
    console.log('[AUDIO] Microphone ready');
    return true;
  } catch (err) {
    console.warn('[AUDIO] Mic access denied or unavailable:', err);
    isAudioReady = false;
    return false;
  }
}

function getVolume() {
  if (!isAudioReady || !micEnabled) return 0;
  analyser.getFloatTimeDomainData(dataArray);
  let sumSquares = 0;
  for (let i = 0; i < dataArray.length; i++) {
    sumSquares += dataArray[i] * dataArray[i];
  }
  return Math.sqrt(sumSquares / dataArray.length); // 0.0 – ~1.0
}

/**
 * Autocorrelation pitch detection – reliable for humming / voice
 * Returns frequency in Hz, or -1 if silence / unreliable
 */
function getPitch() {
  if (!isAudioReady || !micEnabled) return -1;

  analyser.getFloatTimeDomainData(dataArray);
  const SIZE = dataArray.length;
  const rms = getVolume();

  // Raise threshold for noisy environments (hackathon halls)
  if (rms < 0.04) return -1;

  // Trim to non-silent region
  let r1 = 0;
  let r2 = SIZE - 1;
  const thres = 0.2;

  for (let i = 0; i < SIZE / 2; i++) {
    if (Math.abs(dataArray[i]) < thres) {
      r1 = i;
      break;
    }
  }
  for (let i = 1; i < SIZE / 2; i++) {
    if (Math.abs(dataArray[SIZE - i]) < thres) {
      r2 = SIZE - i;
      break;
    }
  }

  const trimmed = dataArray.slice(r1, r2);
  if (trimmed.length < 32) return -1;

  // Autocorrelation
  const c = new Array(trimmed.length).fill(0);
  for (let i = 0; i < trimmed.length; i++) {
    for (let j = 0; j < trimmed.length - i; j++) {
      c[i] += trimmed[j] * trimmed[j + i];
    }
  }

  // Find first valley then peak
  let d = 0;
  while (d < c.length - 1 && c[d] > c[d + 1]) d++;

  let maxval = -1;
  let maxpos = -1;
  for (let i = d; i < c.length; i++) {
    if (c[i] > maxval) {
      maxval = c[i];
      maxpos = i;
    }
  }

  if (maxpos <= 0) return -1;

  const frequency = audioCtx.sampleRate / maxpos;

  // Human vocal range filter (ignore extremes)
  if (frequency < 70 || frequency > 1200) return -1;

  return frequency;
}

function toggleMic() {
  micEnabled = !micEnabled;
  const btn = document.getElementById('mute-btn');
  if (btn) {
    btn.textContent = micEnabled ? 'MIC ON' : 'MIC OFF';
    btn.style.background = micEnabled ? 'var(--accent)' : '#555';
  }
}

function stopAudio() {
  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop());
  }
  if (audioCtx && audioCtx.state !== 'closed') {
    audioCtx.close();
  }
  isAudioReady = false;
}
