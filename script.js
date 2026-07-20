/* ---------- ASL Fingerspelling: a RELIABLE subset of real ASL letters ----------
   Only letters that are clearly distinguishable from a single static hand
   pose via camera are included. This is a deliberate accuracy tradeoff:
   better to support 9 letters correctly than 26 unreliably.
   Excluded: motion letters (J, Z) and visually-similar static letters
   that need finer detail than finger-extended/curled (C, E, M, N, O, T, etc). */
const ASL_LETTERS = [
  { letter: "A", desc: "Closed fist, thumb resting alongside the hand" },
  { letter: "B", desc: "Four fingers up together, thumb folded across palm" },
  { letter: "D", desc: "Index finger only, pointing straight up" },
  { letter: "I", desc: "Pinky finger only, extended up" },
  { letter: "L", desc: "Thumb and index finger extended, forming an L" },
  { letter: "S", desc: "Closed fist (like a fist bump)" },
  { letter: "V", desc: "Index and middle fingers extended, spread apart" },
  { letter: "W", desc: "Index, middle, and ring fingers extended" },
  { letter: "Y", desc: "Thumb and pinky extended, middle fingers folded" }
];
const SUPPORTED_LETTERS = ASL_LETTERS.map(l => l.letter);

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

/* ---------- Letter lookup tab ---------- */
const lookupSelect = document.getElementById('lookupSelect');
const lookupResult = document.getElementById('lookupResult');
const lookupChips = document.getElementById('lookupChips');

ASL_LETTERS.forEach(entry => {
  const opt = document.createElement('option');
  opt.value = entry.letter;
  opt.textContent = entry.letter;
  lookupSelect.appendChild(opt);

  const chip = document.createElement('span');
  chip.className = 'lookup-chip';
  chip.textContent = entry.letter;
  chip.addEventListener('click', () => showLetter(entry.letter));
  lookupChips.appendChild(chip);
});

function showLetter(letter) {
  const entry = ASL_LETTERS.find(l => l.letter === letter);
  lookupSelect.value = letter;
  if (!entry) {
    lookupResult.innerHTML = '<div class="lookup-empty">Pick a letter above</div>';
    return;
  }
  lookupResult.innerHTML = `
    <div class="lookup-emoji">${entry.letter}</div>
    <div class="lookup-word">${entry.desc}</div>
  `;
}
lookupSelect.addEventListener('change', (e) => showLetter(e.target.value));

/* ---------- Detection tab logic ---------- */
const videoEl = document.getElementById('video');
const canvasEl = document.getElementById('canvas');
const ctx = canvasEl.getContext('2d');
const signLabel = document.getElementById('signLabel');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusDot = document.getElementById('statusDot');

const conversationLog = document.getElementById('conversationLog');
const replyInput = document.getElementById('replyInput');
const sendReplyBtn = document.getElementById('sendReplyBtn');
const clearConversationBtn = document.getElementById('clearConversationBtn');
const bigTextOverlay = document.getElementById('bigTextOverlay');
const bigTextContent = document.getElementById('bigTextContent');
const progressDots = document.getElementById('progressDots');
const micBtn = document.getElementById('micBtn');
const visualModeToggle = document.getElementById('visualModeToggle');
const modeLabel = document.getElementById('modeLabel');

visualModeToggle.addEventListener('change', () => {
  modeLabel.textContent = visualModeToggle.checked
    ? "🖐️ Fingerspell mode (letters shown visually, no reading needed)"
    : "💬 Text captions";
});

function addBubble(text, type) {
  const bubble = document.createElement('div');
  bubble.className = `bubble ${type}`;
  const meta = document.createElement('div');
  meta.className = 'bubble-meta';
  meta.textContent = type === 'signed' ? 'Signed' : 'Reply';
  const body = document.createElement('div');
  body.textContent = text;
  bubble.appendChild(meta);
  bubble.appendChild(body);
  conversationLog.appendChild(bubble);
  conversationLog.scrollTop = conversationLog.scrollHeight;
}

function speakWord(text) {
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = 0.95;
  speechSynthesis.cancel();
  speechSynthesis.speak(utter);
}

/* ---------- Signed letters -> spelled word (camera side) ----------
   Letters made in quick succession buffer into a spelled word; a pause
   means "done spelling" - the word is then shown and spoken as a whole. */
let letterBuffer = [];
let lastAddedLetter = "";
let lastAddedTime = 0;
const ADD_COOLDOWN_MS = 1200;
let sentenceFlushTimer = null;
const SPELL_PAUSE_MS = 2000;

function addSignedLetter(letter) {
  const now = Date.now();
  if (letter === lastAddedLetter && now - lastAddedTime < ADD_COOLDOWN_MS) return;
  lastAddedLetter = letter;
  lastAddedTime = now;

  letterBuffer.push(letter);
  signLabel.textContent = letterBuffer.join("");

  if (sentenceFlushTimer) clearTimeout(sentenceFlushTimer);
  sentenceFlushTimer = setTimeout(flushSpelledWord, SPELL_PAUSE_MS);
}

function flushSpelledWord() {
  if (letterBuffer.length === 0) return;
  const word = letterBuffer.join("");
  addBubble(word, 'signed');
  speakWord(word);
  letterBuffer = [];
}

/* ---------- Speech/text -> fingerspelled letters (reverse direction) ----------
   Works for ANY word, not just a fixed vocabulary - that's the advantage
   of real fingerspelling. Supported letters show large; unsupported
   letters show a neutral placeholder instead of guessing wrong. */
let playbackTimer = null;

function stopPlayback() {
  if (playbackTimer) { clearTimeout(playbackTimer); playbackTimer = null; }
  bigTextOverlay.classList.remove('show');
  progressDots.style.display = 'none';
  progressDots.innerHTML = '';
}
bigTextOverlay.addEventListener('click', stopPlayback);

function buildCaptionHTML(text) {
  const rawWords = text.split(/\s+/);
  return rawWords.map(rawWord => {
    const letters = rawWord.toUpperCase().replace(/[^A-Z]/g, '').split('');
    const spelled = letters.map(l =>
      SUPPORTED_LETTERS.includes(l)
        ? `<span class="known-word">${l}</span>`
        : `<span class="unknown-letter">${l}</span>`
    ).join('');
    return `<span class="spelled-word">${rawWord} <small>(${spelled})</small></span>`;
  }).join(' ');
}

// Visual-only: shows every letter of every word as a big fingerspelling sequence
function playFingerspellSequence(text) {
  const rawWords = text.toUpperCase().replace(/[^A-Z\s]/g, '').split(/\s+/).filter(Boolean);
  const sequence = [];
  rawWords.forEach((word, wi) => {
    word.split('').forEach(l => sequence.push(l));
    if (wi < rawWords.length - 1) sequence.push('␣'); // word gap marker
  });
  if (sequence.length === 0) return;

  stopPlayback();
  bigTextOverlay.classList.add('show');
  progressDots.style.display = 'flex';
  progressDots.innerHTML = sequence.map(() => '<span></span>').join('');
  const dots = progressDots.querySelectorAll('span');

  let i = 0;
  function showStep() {
    if (i >= sequence.length) { stopPlayback(); return; }
    const l = sequence[i];
    if (l === '␣') {
      bigTextContent.innerHTML = `<div class="sign-word-big">(next word)</div>`;
    } else if (SUPPORTED_LETTERS.includes(l)) {
      bigTextContent.innerHTML = `<div class="sign-emoji-big">${l}</div>`;
    } else {
      bigTextContent.innerHTML = `<div class="sign-emoji-big" style="opacity:0.4;">${l}?</div><div class="sign-word-big" style="font-size:1rem;">(not yet supported)</div>`;
    }
    dots.forEach((d, idx) => d.classList.toggle('active', idx === i));
    i++;
    playbackTimer = setTimeout(showStep, 1100);
  }
  showStep();
}

function showCaption(text) {
  stopPlayback();
  bigTextOverlay.classList.add('show');
  if (visualModeToggle.checked) {
    playFingerspellSequence(text);
  } else {
    progressDots.style.display = 'none';
    bigTextContent.innerHTML = `<div class="caption-text">${buildCaptionHTML(text)}</div>`;
    const readTime = Math.max(2200, text.split(/\s+/).length * 700);
    playbackTimer = setTimeout(stopPlayback, readTime);
  }
}

sendReplyBtn.addEventListener('click', sendReply);
replyInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendReply(); });

function sendReply() {
  const text = replyInput.value.trim();
  if (!text) return;
  addBubble(text, 'typed');
  showCaption(text);
  replyInput.value = '';
}

clearConversationBtn.addEventListener('click', () => {
  conversationLog.innerHTML = '';
  lastAddedLetter = "";
  letterBuffer = [];
});

/* ---------- Speech-to-text for replies ---------- */
const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognizer = null;
let isListening = false;

if (SpeechRecognitionAPI) {
  recognizer = new SpeechRecognitionAPI();
  recognizer.lang = 'en-US';
  recognizer.interimResults = false;
  recognizer.maxAlternatives = 1;
  recognizer.onstart = () => { isListening = true; micBtn.classList.add('listening'); micBtn.textContent = '⏺'; };
  recognizer.onend = () => { isListening = false; micBtn.classList.remove('listening'); micBtn.textContent = '🎤'; };
  recognizer.onerror = () => { isListening = false; micBtn.classList.remove('listening'); micBtn.textContent = '🎤'; };
  recognizer.onresult = (event) => {
    replyInput.value = event.results[0][0].transcript;
    sendReply();
  };
  micBtn.addEventListener('click', () => {
    if (isListening) { recognizer.stop(); }
    else { try { recognizer.start(); } catch (e) {} }
  });
} else {
  micBtn.addEventListener('click', () => {
    alert('Voice input is not supported in this browser. You can still type your reply.');
  });
}

/* ---------- Hand tracking / ASL letter classification ---------- */
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

function classifyLetter(lm) {
  const f = fingerStates(lm);

  if (!f.thumb && !f.index && !f.middle && !f.ring && !f.pinky) return "S"; // closed fist
  if (f.thumb && !f.index && !f.middle && !f.ring && !f.pinky) return "A"; // fist, thumb out
  if (!f.thumb && f.index && f.middle && f.ring && f.pinky) return "B"; // 4 up, thumb tucked
  if (!f.thumb && f.index && !f.middle && !f.ring && !f.pinky) return "D"; // index only
  if (!f.thumb && !f.index && !f.middle && !f.ring && f.pinky) return "I"; // pinky only
  if (f.thumb && f.index && !f.middle && !f.ring && !f.pinky) return "L"; // thumb + index
  if (!f.thumb && f.index && f.middle && !f.ring && !f.pinky) return "V"; // index + middle
  if (!f.thumb && f.index && f.middle && f.ring && !f.pinky) return "W"; // index+middle+ring
  if (f.thumb && !f.index && !f.middle && !f.ring && f.pinky) return "Y"; // thumb + pinky

  return null;
}

let stableSign = "";
let stableCount = 0;
let STABLE_FRAMES_NEEDED = 8;

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
      const letter = classifyLetter(lm);
      if (letter) detected = letter;
    }
  }

  if (detected && detected === stableSign) { stableCount++; }
  else { stableSign = detected; stableCount = 0; }

  if (detected && stableCount >= STABLE_FRAMES_NEEDED) {
    addSignedLetter(detected);
    signLabel.classList.remove('idle');
  } else if (!detected && letterBuffer.length === 0) {
    signLabel.textContent = "…";
    signLabel.classList.add('idle');
  }
  ctx.restore();
}

const hands = new Hands({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}`
});
hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.6, minTrackingConfidence: 0.6 });
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
  hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: val, minTrackingConfidence: val });
});

startBtn.addEventListener('click', async () => {
  startBtn.disabled = true;
  startBtn.textContent = "Starting…";
  try {
    camera = new Camera(videoEl, {
      onFrame: async () => { await hands.send({ image: videoEl }); },
      width: 640, height: 480
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
  if (camera) { camera.stop(); camera = null; }
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
