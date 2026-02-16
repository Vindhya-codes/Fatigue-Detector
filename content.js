// ===============================
/* FATIGUE DETECTOR */
// ===============================


// CONFIG
const WINDOW_SIZE = 120000;        
const BASELINE_WINDOW = 300000;    
const FATIGUE_CONFIRMATION_WINDOWS = 3;
const ANALYSIS_INTERVAL = 30000;   
const BREAK_RESET_WINDOW = 120000;
const LONG_IDLE_THRESHOLD = 180000;
const MAX_EVENTS = 5000;
const LONG_IDLE_BUZZ_THRESHOLD = 700000; // 12 minutes
const BUZZER_INTERVAL = 30000;

// STATE
let events = [];
let fatigueWindows = 0;
let baseline = null;
let isAnalyzing = false;
let lastInterventionTime = 0;
let isResetting = false;
let breakTimer = null;
let focusState = 'active';
let pageContext = inferPageContext();
let lastUserActivity = Date.now(); // Track ALL user activity including dismissals
let idleBuzzerTimer = null;
let isLongIdleState = false;
let sessionStartTime = Date.now();
let breakHistory = []; // Track breaks in last hour
let fatigueHistory = []; // Track fatigue detection times


// EVENT CAPTURE
let lastScroll = 0, lastKey = 0, lastClick = 0;
document.addEventListener("scroll", throttle(recordEvent, 100, "scroll"));
document.addEventListener("keydown", throttle(recordEvent, 50, "key"));
document.addEventListener("click", throttle(recordEvent, 200, "click"));
document.addEventListener("visibilitychange", updateFocusState);
window.addEventListener("focus", () => { 
  focusState = 'active'; 
  updateLastActivity();
});
window.addEventListener("blur", () => { 
  focusState = 'blurred'; 
  updateLastActivity();
});


function updateLastActivity() {
  lastUserActivity = Date.now();

  if (isLongIdleState && idleBuzzerTimer) {
    clearTimeout(idleBuzzerTimer);
    idleBuzzerTimer = null;
    isLongIdleState = false;
  }
}

function updateFocusDisplay() {
  const indicator = document.getElementById('focus-indicator') || createFocusIndicator();
  const isMaximized = indicator.classList.contains('maximized');
  
  if (isMaximized) {
    showActivityOverview();
  } else {
    // Hide overview when minimized
    const existingOverview = indicator.querySelector('.activity-overview');
    if (existingOverview) existingOverview.remove();
  }
  
  // Update main indicator text
  const span = indicator.querySelector('span') || indicator;
  span.textContent = `Focus: ${focusState === 'active' ? '🟢 Active' : '🔴 Inactive'}`;
  indicator.style.opacity = focusState === 'active' ? '1' : '0.5';
}


function createFocusIndicator() {
  const div = document.createElement('div');
  div.id = 'focus-indicator';
  div.innerHTML = `
    <span>Focus: 🟢 Active</span>
    <button id="maximize-btn" style="
      margin-left: 8px; padding: 2px 6px; background: rgba(255,255,255,0.2); 
      border: none; border-radius: 4px; color: white; font-size: 10px; cursor: pointer;
    " title="Toggle Activity Overview">📊</button>
  `;
  div.style.cssText = `
    position: fixed; top: 10px; right: 10px; 
    padding: 8px 12px; background: rgba(0,0,0,0.8); color: white;
    border-radius: 20px; font-size: 12px; z-index: 99999; font-family: sans-serif;
    display: flex; align-items: center; gap: 4px; transition: all 0.2s ease;
  `;
  document.body.appendChild(div);
  
  // Toggle button handler - click to maximize/minimize
  div.querySelector('#maximize-btn').onclick = (e) => {
    e.stopPropagation();
    const indicator = document.getElementById('focus-indicator');
    indicator.classList.toggle('maximized');
    updateFocusDisplay();
  };
  
  return div;
}


function showActivityOverview() {
  const indicator = document.getElementById('focus-indicator');
  if (!indicator || !indicator.classList.contains('maximized')) return;
  
  const now = Date.now();
  const sessionDuration = Math.floor((now - sessionStartTime) / 1000 / 60);
  const recentBreaks = breakHistory.filter(b => now - b.time < 3600000); // Last hour
  const totalBreaks = recentBreaks.length;
  const recentFatigue = fatigueHistory.filter(f => now - f.time < 3600000); // Last hour fatigue detections
  const activityContext = getActivityContext(pageContext, sessionDuration);
  
  // Format break times (show up to 3 most recent)
  const breakTimes = recentBreaks.slice(-3).map(b => 
    new Date(b.time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
  ).join(', ') || 'None';
  
  // Format fatigue times (show up to 3 most recent)
  const fatigueTimes = recentFatigue.slice(-3).map(f => 
    new Date(f.time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
  ).join(', ') || 'Never';
  
  const overviewHTML = `
    <div style="
      position: absolute; top: 100%; right: 0; margin-top: 8px;
      padding: 16px; background: rgba(0,0,0,0.95); color: white;
      border-radius: 12px; min-width: 300px; max-width: 320px; z-index: 100000;
      font-size: 13px; line-height: 1.5; box-shadow: 0 10px 30px rgba(0,0,0,0.5);
      backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.1);
    ">
      <strong>📊 Activity Overview</strong>
      <div style="margin: 12px 0 8px 0; padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.1);">
        <strong>${activityContext}</strong><br>
        <span style="opacity: 0.8; font-size: 12px;">Session: ${sessionDuration}min</span>
      </div>
      <div style="margin-bottom: 8px;">
        <strong>Breaks (last 1hr):</strong><br>
        <span style="opacity: 0.9; font-size: 12px;">${totalBreaks} breaks at ${breakTimes}</span>
      </div>
      <div>
        <strong>Fatigue detected:</strong><br>
        <span style="opacity: 0.9; font-size: 12px;">${recentFatigue.length} times at ${fatigueTimes}</span>
      </div>
    </div>
  `;
  
  // Clear existing overview
  const existingOverview = indicator.querySelector('.activity-overview');
  if (existingOverview) existingOverview.remove();
  
  const overview = document.createElement('div');
  overview.className = 'activity-overview';
  overview.innerHTML = overviewHTML;
  indicator.appendChild(overview);
}


function getActivityContext(context, duration) {
  const activities = {
    learning: duration < 30 ? 'Studying' : 'Learning session',
    coding: duration < 20 ? 'Coding' : 'Problem solving',
    reading: duration < 40 ? 'Reading' : 'Deep reading',
    general: 'Working'
  };
  return activities[context] || 'Active';
}


function recordFatigueEvent() {
  fatigueHistory.push({ time: Date.now(), type: 'fatigue_detected' });
  // Keep only last 24 hours for memory efficiency
  fatigueHistory = fatigueHistory.filter(f => Date.now() - f.time < 86400000);
}


// ... [Rest of the functions remain exactly the same - checkNapDetection, triggerNapBuzzer, etc.] ...

function checkLongIdleBuzzer() {
  const idleTime = Date.now() - lastUserActivity;

  if (idleTime > LONG_IDLE_BUZZ_THRESHOLD && !breakTimer && !isLongIdleState) {
    isLongIdleState = true;
    console.log('🔕 LONG IDLE STATE TRIGGERED');
    triggerIdleBuzzer();
  } 
  else if (idleTime > LONG_IDLE_BUZZ_THRESHOLD && isLongIdleState) {
    if (!idleBuzzerTimer) triggerIdleBuzzer();
  }
}

function triggerIdleBuzzer() {
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();

  const playBuzzer = () => {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(400, audioContext.currentTime + 0.3);

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
  };

  playBuzzer();
  showLongIdleNudge();

  idleBuzzerTimer = setTimeout(triggerIdleBuzzer, BUZZER_INTERVAL);
}

function showLongIdleNudge() {
  if (document.querySelector('.idle-nudge')) return;

  const box = document.createElement("div");
  box.className = 'idle-nudge';

  box.innerHTML = `
    <div style="
      position: fixed;
      bottom: 30px;
      right: 20px;
      padding: 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border-radius: 16px;
      z-index: 99999;
      max-width: 320px;
      box-shadow: 0 15px 35px rgba(0,0,0,0.4);
      font-family: -apple-system, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      animation: subtlePulse 1.5s infinite;
    ">
      <div style="font-size: 20px; margin-bottom: 6px;">
        ⏳ Long Idle Detected
      </div>

      <div style="opacity: 0.9; font-size: 13px;">
        No activity for ${Math.floor((Date.now() - lastUserActivity) / 60000)} minutes
      </div>

      <div style="margin-top: 12px; display: flex; gap: 8px;">
        <button class="idle-resume" style="
          flex: 1;
          padding: 8px 12px;
          background: rgba(255,255,255,0.2);
          border: none;
          border-radius: 6px;
          color: white;
          cursor: pointer;
        ">
          Resume
        </button>

        <button class="idle-dismiss" style="
          padding: 8px 12px;
          background: transparent;
          border: 1px solid rgba(255,255,255,0.3);
          border-radius: 6px;
          color: white;
          cursor: pointer;
        ">
          Dismiss
        </button>
      </div>

      <style>
        @keyframes subtlePulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.03); }
        }
      </style>
    </div>
  `;

  document.body.appendChild(box);

  box.querySelector('.idle-resume').onclick = () => {
    updateLastActivity();
    box.remove();
  };

  box.querySelector('.idle-dismiss').onclick = () => {
    updateLastActivity();
    box.remove();
  };
}

function inferPageContext() {
  const url = window.location.href.toLowerCase();
  const hostname = window.location.hostname.toLowerCase();
  
  if (hostname.includes('coursera') || hostname.includes('udemy') || 
      hostname.includes('khanacademy') || url.includes('learn') || url.includes('course')) {
    return 'learning';
  }
  
  if (hostname.includes('leetcode') || hostname.includes('codewars') || 
      hostname.includes('hackerrank') || url.includes('problem') || 
      document.querySelector('textarea, .code-editor, pre code')) {
    return 'coding';
  }
  
  if (document.querySelectorAll('article, .post, .content').length > 0 ||
      url.includes('blog') || url.includes('article')) {
    return 'reading';
  }
  
  return 'general';
}

function throttle(fn, delay, type) {
  let lastCall = 0;
  return function() {
    const now = Date.now();
    if (now - lastCall >= delay) {
      lastCall = now;
      fn(type);
    }
  };
}

function recordEvent(type) {
  if (breakTimer) return;
  const now = Date.now();
  events.push({ type, time: now, scrollY: window.scrollY });
  updateLastActivity();
  cleanupOldEvents();
  updateFocusDisplay();
}

function cleanupOldEvents() {
  const cutoff = Date.now() - Math.max(WINDOW_SIZE, BASELINE_WINDOW);
  events = events.filter(e => e.time >= cutoff);
  if (events.length > MAX_EVENTS) {
    events = events.slice(-MAX_EVENTS);
  }
}

// FIXED ANALYSIS LOOP
setInterval(analyzeActivity, ANALYSIS_INTERVAL);
setInterval(updateFocusDisplay, 2000);
setInterval(checkLongIdleBuzzer, 30000);

async function analyzeActivity() {
  if (breakTimer || isAnalyzing || isResetting) return;
  
  const timeSinceLastEvent = Date.now() - (events[events.length-1]?.time || 0);
  if (timeSinceLastEvent > LONG_IDLE_THRESHOLD && focusState === 'active') {
    console.log('🟡 LONG IDLE TRIGGERED');
    showContextualNudge('stuck');
    return;
  }
  
  if (events.length < 5) return;
  
  isAnalyzing = true;

  if (Date.now() - lastInterventionTime < BREAK_RESET_WINDOW) {
    isResetting = true;
    setTimeout(() => { isResetting = false; }, BREAK_RESET_WINDOW);
  }

  if (!baseline || events.length > 100) {
    baseline = computeMetrics(events);
    isAnalyzing = false;
    return;
  }

  const recentEvents = events.filter(e => e.time >= Date.now() - WINDOW_SIZE);
  if (recentEvents.length < 10) {
    isAnalyzing = false;
    return;
  }

  const current = computeMetrics(recentEvents);
  const fatigueScore = computeFatigueScore(current, baseline);

  if (fatigueScore > 0.65) {
    fatigueWindows++;
  } else {
    fatigueWindows = Math.max(0, fatigueWindows - 1);
  }

  if (fatigueWindows >= FATIGUE_CONFIRMATION_WINDOWS) {
    recordFatigueEvent();
    await triggerContextualIntervention(current);
    fatigueWindows = 0;
    lastInterventionTime = Date.now();
    recordBreakEvent();
    resetDetector();
  }

  isAnalyzing = false;
}

function recordBreakEvent() {
  breakHistory.push({ time: Date.now(), type: 'fatigue' });
  breakHistory = breakHistory.filter(b => Date.now() - b.time < 3600000);
}

function computeMetrics(data) {
  const idleGaps = [];
  let scrollReversals = 0;
  let lastTime = data[0]?.time ?? 0;
  let lastScroll = data[0]?.scrollY ?? 0;
  let lastDirection = 0;

  data.forEach(e => {
    const gap = e.time - lastTime;
    if (gap > 5000) idleGaps.push(gap);

    if (e.type === "scroll") {
      const direction = Math.sign(e.scrollY - lastScroll);
      if (direction !== 0 && direction !== lastDirection && lastDirection !== 0) {
        scrollReversals++;
      }
      lastDirection = direction;
    }

    lastScroll = e.scrollY;
    lastTime = e.time;
  });

  const duration = (data[data.length - 1]?.time - data[0]?.time) / 1000 || 1;
  return {
    avgIdle: average(idleGaps),
    eventRate: data.length / duration,
    scrollReversals: scrollReversals / Math.max(1, data.length / 10),
    totalEvents: data.length
  };
}

function computeFatigueScore(current, base) {
  let score = 0;
  if (current.avgIdle > base.avgIdle * 1.8) score += 0.3;
  if (current.eventRate < base.eventRate * 0.65) score += 0.35;
  if (current.scrollReversals > base.scrollReversals * 2) score += 0.25;
  if (current.totalEvents < 15) score += 0.15;
  return Math.min(score, 1);
}

async function triggerContextualIntervention(metrics) {
  if (document.querySelector('.fatigue-nudge')) return;
  
  const nudges = {
    learning: "🧠 Learning fatigue detected. Try the practice quiz or watch a recap video?",
    coding: "🐛 Stuck on this problem? Check the hint or try a simpler challenge.",
    reading: "📖 Eyes tired? Try audiobooks or highlight key sections for review.",
    general: "🧠 Looking fatigued? Take a 2-min break or switch tasks."
  };
  
  const nudgeType = pageContext === 'coding' && metrics.eventRate < 0.3 ? 'stuck_problem' : 'fatigue';
  showSmartNudge(nudges[pageContext] || nudges.general, nudgeType);
}

function showContextualNudge(type) {
  const stuckNudges = {
    learning: "⏳ Been on this lesson 3+ mins without progress. Need help or try easier exercises?",
    coding: "💭 Stuck >3 mins on same problem. Want the solution hint or easier problem?",
    reading: "😴 Same page 3+ mins. Summary available or try related lighter reads?",
    general: "⏳ Idle 3+ mins on same page. Need help finding what you want?"
  };
  
  showSmartNudge(stuckNudges[pageContext] || stuckNudges.general, 'stuck');
}

function showSmartNudge(msg, type) {
  const box = document.createElement("div");
  box.className = 'fatigue-nudge';
  updateLastActivity();
  
  box.innerHTML = `
    <div style="position: fixed; bottom: 30px; right: 20px; padding: 20px; 
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white; border-radius: 16px; z-index: 99999; max-width: 320px;
      box-shadow: 0 15px 35px rgba(0,0,0,0.4); font-family: -apple-system, sans-serif;
      font-size: 14px; line-height: 1.5;">
      ${msg}
      <div style="margin-top: 12px; display: flex; gap: 8px;">
        <button class="break-btn" style="flex: 1; padding: 8px 12px; background: rgba(255,255,255,0.2); 
          border: none; border-radius: 6px; color: white; cursor: pointer;">
          Take Break (2:00)
        </button>
        <button class="dismiss-btn" style="padding: 8px 12px; background: transparent; 
          border: 1px solid rgba(255,255,255,0.3); border-radius: 6px; color: white; cursor: pointer;">
          Dismiss
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(box);
  
  box.querySelector('.break-btn').onclick = takeBreak;
  box.querySelector('.dismiss-btn').onclick = () => {
    updateLastActivity();
    box.remove();
  };
  
  setTimeout(() => {
    if (document.body.contains(box)) box.remove();
  }, 12000);
}

function takeBreak() {
  updateLastActivity();
  if (breakTimer) {
    clearTimeout(breakTimer);
    if (document.getElementById('break-countdown')) {
      document.getElementById('break-countdown').remove();
    }
    breakTimer = null;
  }

  document.querySelectorAll('.fatigue-nudge').forEach(n => n.remove());

  const countdownToast = document.createElement('div');
  countdownToast.id = 'break-countdown';
  document.body.appendChild(countdownToast);
  
  let timeLeft = 120;
  const updateCountdown = () => {
    if (!document.body.contains(countdownToast)) return;
    const mins = Math.floor(timeLeft / 60);
    const secs = timeLeft % 60;
    countdownToast.textContent = `⏳ Break in progress: ${mins}:${secs.toString().padStart(2,'0')}`;
    countdownToast.style.cssText = `
      position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
      padding: 16px 28px; background: #10b981; color: white; border-radius: 12px;
      z-index: 100000; font-family: sans-serif; font-weight: 600; font-size: 15px;
      box-shadow: 0 8px 25px rgba(0,0,0,0.3);
    `;
    timeLeft--;
  };
  
  updateCountdown();
  const countdownInterval = setInterval(updateCountdown, 1000);
  
  breakTimer = setTimeout(() => {
    clearInterval(countdownInterval);
    if (document.getElementById('break-countdown')) {
      document.getElementById('break-countdown').remove();
    }
    breakTimer = null;
    resetDetector();
    showConfirmation("✅ 2-minute break completed! Fresh monitoring started.");
  }, 120000);

  resetDetector();
}

function resetDetector() {
  events = [];
  fatigueWindows = 0;
  isResetting = true;
  baseline = null;
  sessionStartTime = Date.now();
  setTimeout(() => {
    isResetting = false;
    if (!breakTimer) {
      showStatus("Detector reset - monitoring fresh activity");
    }
  }, 5000);
}

function showConfirmation(msg) {
  const toast = document.createElement('div');
  toast.textContent = msg;
  toast.id = 'confirmation-toast';
  toast.style.cssText = `
    position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
    padding: 12px 24px; background: #10b981; color: white; border-radius: 8px;
    z-index: 100000; font-family: sans-serif;
  `;
  document.body.appendChild(toast);
  setTimeout(() => {
    if (document.body.contains(toast)) toast.remove();
  }, 4000);
}

function showStatus(msg) {
  console.log(`[FatigueDetector] ${msg}`);
}

function updateFocusState() {
  focusState = document.visibilityState === 'visible' ? 'active' : 'inactive';
  updateLastActivity();
}

function average(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}


// Auto-start focus indicator
setTimeout(updateFocusDisplay, 100);