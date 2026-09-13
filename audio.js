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
 * Pitch detection
 * - Autocorrelation: solid for low "hmm"
 * - ZCR: catches high "eeee" when auto locks onto a subharmonic
 */
function getPitch() {
  if (!isAudioReady || !micEnabled) return -1;

  analyser.getFloatTimeDomainData(dataArray);
  const SIZE = dataArray.length;
  const sampleRate = audioCtx.sampleRate;
  const rms = getVolume();

  if (rms < 0.03) return -1;

  // Zero-crossing estimate
  let crossings = 0;
  for (let i = 1; i < SIZE; i++) {
    if ((dataArray[i - 1] >= 0 && dataArray[i] < 0) ||
        (dataArray[i - 1] < 0 && dataArray[i] >= 0)) {
      crossings++;
    }
  }
  const zcrFreq = (crossings / 2) / (SIZE / sampleRate);

  // Autocorrelation
  let r1 = 0;
  let r2 = SIZE - 1;
  const thres = 0.2;
  for (let i = 0; i < SIZE / 2; i++) {
    if (Math.abs(dataArray[i]) < thres) { r1 = i; break; }
  }
  for (let i = 1; i < SIZE / 2; i++) {
    if (Math.abs(dataArray[SIZE - i]) < thres) { r2 = SIZE - i; break; }
  }
  const trimmed = dataArray.slice(r1, r2);
  let autoFreq = -1;
  if (trimmed.length >= 64) {
    const c = new Array(trimmed.length).fill(0);
    for (let i = 0; i < trimmed.length; i++) {
      for (let j = 0; j < trimmed.length - i; j++) {
        c[i] += trimmed[j] * trimmed[j + i];
      }
    }
    let d = 0;
    while (d < c.length - 1 && c[d] > c[d + 1]) d++;
    let maxval = -1;
    let maxpos = -1;
    const minLag = Math.floor(sampleRate / 900);
    const maxLag = Math.floor(sampleRate / 80);
    for (let i = Math.max(d, minLag); i < Math.min(c.length, maxLag); i++) {
      if (c[i] > maxval) {
        maxval = c[i];
        maxpos = i;
      }
    }
    if (maxpos > 0) autoFreq = sampleRate / maxpos;
  }

  // Case: clear high "eeee" — ZCR high, auto stuck on subharmonic (half freq)
  if (zcrFreq >= 300 && rms >= 0.04) {
    if (autoFreq < 0 || zcrFreq > autoFreq * 1.6 || autoFreq < 280) {
      return Math.min(zcrFreq, 900);
    }
  }

  // Case: low "hmm" — trust autocorrelation in low band
  if (autoFreq >= 80 && autoFreq <= 260) {
    // Only keep low if ZCR is NOT clearly screaming high
    if (zcrFreq < 300) return autoFreq;
  }

  if (autoFreq > 260 && autoFreq <= 1200) return autoFreq;
  if (autoFreq >= 80) return autoFreq;
  if (zcrFreq >= 80 && zcrFreq <= 1200 && rms >= 0.04) return zcrFreq;

  return -1;
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
