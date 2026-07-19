/* ---------- Shared vocabulary (sign <-> word <-> emoji) ---------- */
const VOCAB = [
  { word: "Hello", emoji: "✋" },
  { word: "Stop", emoji: "✊" },
  { word: "Yes", emoji: "👍" },
  { word: "No", emoji: "👎" },
  { word: "Peace", emoji: "✌️" },
  { word: "I love you", emoji: "🤟" },
  { word: "Wait", emoji: "☝️" }
];

/* ---------- Tab switching ---------- */
const tabDetectBtn = document.getElementById('tabDetectBtn');
const tabLookupBtn = document.getElementById('tabLookupBtn');
const detectPanel = document.getElementById('detectPanel');
const lookupPanel = document.getElementById('lookupPanel');

tabDetectBtn.addEventListener('click', () => {
  tabDetectBtn.classList.add('active');
  tabLookupBtn.classList.remove('active');
  detectPanel.classList.add('active');
  lookupPanel.classList.remove('active');
});
tabLookupBtn.addEventListener('click', () => {
  tabLookupBtn.classList.add('active');
  tabDetectBtn.classList.remove('active');
  lookupPanel.classList.add('active');
  detectPanel.classList.remove('active');
});

/* ---------- Text-to-sign lookup ---------- */
const lookupSelect = document.getElementById('lookupSelect');
const lookupResult = document.getElementById('lookupResult');
const lookupChips = document.getElementById('lookupChips');

VOCAB.forEach(v => {
  const opt = document.createElement('option');
  opt.value = v.word;
  opt.textContent = v.word;
  lookupSelect.appendChild(opt);

  const chip = document.createElement('span');
  chip.className = 'lookup-chip';
  chip.textContent = v.word;
  chip.addEventListener('click', () => showSign(v.word));
  lookupChips.appendChild(chip);
});

function showSign(word) {
  const entry = VOCAB.find(v => v.word === word);
  lookupSelect.value = word;
  if (!entry) {
    lookupResult.innerHTML = '<div class="lookup-empty">Pick a word above to see its sign</div>';
    return;
  }
  lookupResult.innerHTML = `
    <div class="lookup-emoji">${entry.emoji}</div>
    <div class="lookup-word">${entry.word}</div>
  `;
}

lookupSelect.addEventListener('change', (e) => showSign(e.target.value));

/* ---------- Detection tab logic ---------- */
const videoEl = document.getElementById('video');
const canvasEl = document.getElementById('canvas');
const ctx = canvasEl.getContext('2d');
const signLabel = document.getElementById('signLabel');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusDot = document.getElementById('statusDot');
const sentenceText = document.getElementById('sentenceText');
const speakSentenceBtn = document.getElementById('speakSentenceBtn');
const clearSentenceBtn = document.getElementById('clearSentenceBtn');

let sentenceWords = [];
let lastAddedSign = "";
let lastAddedTime = 0;
const ADD_COOLDOWN_MS = 1800; // minimum gap before the same sign can be added again

function renderSentence() {
  if (sentenceWords.length === 0) {
    sentenceText.textContent = "Signs will appear here as you make them…";
    sentenceText.classList.add('empty');
  } else {
    sentenceText.textContent = sentenceWords.join(" ");
    sentenceText.classList.remove('empty');
  }
}

// Speaks a single word immediately - used for LIVE voice as each sign is detected
function speakWord(word) {
  const utter = new SpeechSynthesisUtterance(word);
  utter.rate = 0.95;
  speechSynthesis.cancel(); // stop any prior speech so words don't queue/overlap awkwardly
  speechSynthesis.speak(utter);
}

// Called the instant a sign is confidently detected:
// - adds it to the visible sentence (TEXT)
// - speaks it out loud immediately (VOICE)
// both happen together, live, at the same time.
function addToSentence(word) {
  const now = Date.now();
  if (word === lastAddedSign && now - lastAddedTime < ADD_COOLDOWN_MS) return;
  sentenceWords.push(word);
  lastAddedSign = word;
  lastAddedTime = now;
  renderSentence();
  speakWord(word);
}

// "Speak sentence" button still available to replay the whole accumulated sentence on demand
speakSentenceBtn.addEventListener('click', () => {
  if (sentenceWords.length === 0) return;
  const utter = new SpeechSynthesisUtterance(sentenceWords.join(" "));
  utter.rate = 0.95;
  speechSynthesis.cancel();
  speechSynthesis.speak(utter);
});

clearSentenceBtn.addEventListener('click', () => {
  sentenceWords = [];
  lastAddedSign = "";
  renderSentence();
});

let stableSign = "";
let stableCount = 0;
let STABLE_FRAMES_NEEDED = 8;

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z||0) - (b.z||0));
}

function fingerStates(lm) {
  const wrist = lm[0];
  function extended(tip, pip) {
    return dist(lm[tip], wrist) > dist(lm[pip], wrist) * 1.15;
  }
  return {
    thumb: dist(lm[4], lm[17]) > dist(lm[2], lm[17]) * 1.1,
    index: extended(8, 6),
    middle: extended(12, 10),
    ring: extended(16, 14),
    pinky: extended(20, 18)
  };
}

function classifySign(lm) {
  const f = fingerStates(lm);
  if (f.thumb && f.index && f.middle && f.ring && f.pinky) return "Hello";
  if (!f.thumb && !f.index && !f.middle && !f.ring && !f.pinky) return "Stop";
  if (f.thumb && !f.index && !f.middle && !f.ring && !f.pinky) {
    if (lm[4].y < lm[0].y - 0.05) return "Yes";
    if (lm[4].y > lm[0].y + 0.05) return "No";
  }
  if (f.index && f.middle && !f.ring && !f.pinky) return "Peace";
  if (f.thumb && f.index && !f.middle && !f.ring && f.pinky) return "I love you";
  if (!f.thumb && f.index && !f.middle && !f.ring && !f.pinky) return "Wait";
  return null;
}

function onResults(results) {
  canvasEl.width = videoEl.videoWidth;
  canvasEl.height = videoEl.videoHeight;
  ctx.save();
  ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

  let detected = null;
  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    for (const lm of results.multiHandLandmarks) {
      drawConnectors(ctx, lm, Hands.HAND_CONNECTIONS, { color: '#6b8c7a', lineWidth: 2 });
      drawLandmarks(ctx, lm, { color: '#c9832f', lineWidth: 1, radius: 3 });
      const sign = classifySign(lm);
      if (sign) detected = sign;
    }
  }

  if (detected && detected === stableSign) {
    stableCount++;
  } else {
    stableSign = detected;
    stableCount = 0;
  }

  if (detected && stableCount >= STABLE_FRAMES_NEEDED) {
    signLabel.textContent = detected;
    signLabel.classList.remove('idle');
    addToSentence(detected); // text + voice, live, together
  } else if (!detected) {
    signLabel.textContent = "…";
    signLabel.classList.add('idle');
  }
  ctx.restore();
}

const hands = new Hands({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}`
});
hands.setOptions({
  maxNumHands: 1,
  modelComplexity: 1,
  minDetectionConfidence: 0.6,
  minTrackingConfidence: 0.6
});
hands.onResults(onResults);

let camera = null;

const sensitivitySlider = document.getElementById('sensitivitySlider');
const sensitivityValue = document.getElementById('sensitivityValue');
const confidenceSlider = document.getElementById('confidenceSlider');
const confidenceValue = document.getElementById('confidenceValue');

sensitivitySlider.addEventListener('input', (e) => {
  STABLE_FRAMES_NEEDED = parseInt(e.target.value);
  sensitivityValue.textContent = e.target.value;
});

confidenceSlider.addEventListener('input', (e) => {
  const val = parseFloat(e.target.value);
  confidenceValue.textContent = val.toFixed(2);
  hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: val,
    minTrackingConfidence: val
  });
});

startBtn.addEventListener('click', async () => {
  startBtn.disabled = true;
  startBtn.textContent = "Starting…";
  try {
    camera = new Camera(videoEl, {
      onFrame: async () => { await hands.send({ image: videoEl }); },
      width: 640,
      height: 480
    });
    await camera.start();
    statusDot.classList.add('live');
    startBtn.textContent = "Camera live";
    startBtn.style.display = "none";
    stopBtn.style.display = "inline-block";
    signLabel.textContent = "watching…";
  } catch (err) {
    signLabel.textContent = "Camera access denied or unavailable.";
    startBtn.disabled = false;
    startBtn.textContent = "Start camera";
  }
});

stopBtn.addEventListener('click', () => {
  if (camera) {
    camera.stop();
    camera = null;
  }
  // stop the underlying video stream tracks too, so the camera light actually turns off
  if (videoEl.srcObject) {
    videoEl.srcObject.getTracks().forEach(track => track.stop());
    videoEl.srcObject = null;
  }
  ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
  statusDot.classList.remove('live');
  signLabel.textContent = "camera stopped";
  signLabel.classList.add('idle');
  stopBtn.style.display = "none";
  startBtn.style.display = "inline-block";
  startBtn.disabled = false;
  startBtn.textContent = "Start camera";
});
