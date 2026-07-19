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

/* ---------- Conversation log (two-way) ---------- */
const conversationLog = document.getElementById('conversationLog');
const replyInput = document.getElementById('replyInput');
const sendReplyBtn = document.getElementById('sendReplyBtn');
const clearConversationBtn = document.getElementById('clearConversationBtn');
const bigTextOverlay = document.getElementById('bigTextOverlay');
const bigTextContent = document.getElementById('bigTextContent');
const progressDots = document.getElementById('progressDots');
const micBtn = document.getElementById('micBtn');

let lastAddedSign = "";
let lastAddedTime = 0;
const ADD_COOLDOWN_MS = 1800;

function addBubble(text, type) {
  // type: 'signed' (from the person signing) or 'typed' (from the person replying)
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

let playbackTimer = null;

function stopPlayback() {
  if (playbackTimer) { clearTimeout(playbackTimer); playbackTimer = null; }
  bigTextOverlay.classList.remove('show');
  progressDots.style.display = 'none';
  progressDots.innerHTML = '';
}

bigTextOverlay.addEventListener('click', stopPlayback);

// Called when a sign is confidently detected: adds to conversation log + speaks it live
function addSignedWord(word) {
  const now = Date.now();
  if (word === lastAddedSign && now - lastAddedTime < ADD_COOLDOWN_MS) return;
  lastAddedSign = word;
  lastAddedTime = now;
  addBubble(word, 'signed');
  speakWord(word);
}

// Scans typed/spoken text for words that match known signs, in the order they appear
function matchSignsInText(text) {
  const words = text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/);
  const matches = [];
  // check multi-word phrases first (like "i love you") then single words
  const sortedVocab = [...VOCAB].sort((a, b) => b.word.split(' ').length - a.word.split(' ').length);
  let remaining = ' ' + words.join(' ') + ' ';
  for (const entry of sortedVocab) {
    const needle = ' ' + entry.word.toLowerCase() + ' ';
    if (remaining.includes(needle)) {
      matches.push(entry);
      remaining = remaining.replace(needle, ' ');
    }
  }
  // re-order matches by original position in the text for natural sequence
  const order = [];
  words.join(' ').toLowerCase();
  matches.forEach(m => {
    const idx = text.toLowerCase().indexOf(m.word.toLowerCase());
    order.push({ ...m, idx });
  });
  order.sort((a, b) => a.idx - b.idx);
  return order;
}

// Plays matched signs one at a time, large on screen, like a slideshow
function playSignSequence(signList) {
  if (signList.length === 0) return;
  stopPlayback();
  bigTextOverlay.classList.add('show');
  progressDots.style.display = 'flex';
  progressDots.innerHTML = signList.map(() => '<span></span>').join('');
  const dots = progressDots.querySelectorAll('span');

  let i = 0;
  function showStep() {
    if (i >= signList.length) {
      stopPlayback();
      return;
    }
    const entry = signList[i];
    bigTextContent.innerHTML = `
      <div class="sign-emoji-big">${entry.emoji}</div>
      <div class="sign-word-big">${entry.word}</div>
    `;
    dots.forEach((d, idx) => d.classList.toggle('active', idx === i));
    speakWord(entry.word);
    i++;
    playbackTimer = setTimeout(showStep, 1600);
  }
  showStep();
}

// Called when the hearing person types/speaks and sends a reply:
// shows it in the chat log AND plays the matching signs as a visual sequence
sendReplyBtn.addEventListener('click', sendReply);
replyInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendReply();
});

function sendReply() {
  const text = replyInput.value.trim();
  if (!text) return;
  addBubble(text, 'typed');
  const matched = matchSignsInText(text);
  
    playSignSequence(matched);
  } else {
    bigTextContent.innerHTML = `<div class="sign-word-big">No known signs found in that sentence</div>`;
    progressDots.style.display = 'none';
    bigTextOverlay.classList.add('show');
    playbackTimer = setTimeout(stopPlayback, 1800);
  }
  replyInput.value = '';
}

/* ---------- Speech-to-text for replies ---------- */
const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognizer = null;
let isListening = false;

if (SpeechRecognitionAPI) {
  recognizer = new SpeechRecognitionAPI();
  recognizer.lang = 'en-US';
  recognizer.interimResults = false;
  recognizer.maxAlternatives = 1;

  recognizer.onstart = () => {
    isListening = true;
    micBtn.classList.add('listening');
    micBtn.textContent = '⏺';
  };
  recognizer.onend = () => {
    isListening = false;
    micBtn.classList.remove('listening');
    micBtn.textContent = '🎤';
  };
  recognizer.onerror = () => {
    isListening = false;
    micBtn.classList.remove('listening');
    micBtn.textContent = '🎤';
  };
  recognizer.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    replyInput.value = transcript;
    sendReply();
  };

  micBtn.addEventListener('click', () => {
    if (isListening) {
      recognizer.stop();
    } else {
      try { recognizer.start(); } catch (e) { /* already started, ignore */ }
    }
  });
} else {
  micBtn.addEventListener('click', () => {
    alert('Voice input is not supported in this browser. You can still type your reply.');
  });
}

clearConversationBtn.addEventListener('click', () => {
  conversationLog.innerHTML = '';
  lastAddedSign = "";
});

/* ---------- Sign detection (hand tracking) ---------- */
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
    addSignedWord(detected);
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
