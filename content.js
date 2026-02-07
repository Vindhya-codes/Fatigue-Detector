// ===============================
/* ENHANCED FATIGUE DETECTOR - INTEGRATED VERSION */
// ===============================

// CONFIG
const WINDOW_SIZE = 120000;        
const BASELINE_WINDOW = 300000;    
const FATIGUE_CONFIRMATION_WINDOWS = 3;
const ANALYSIS_INTERVAL = 30000;   
const BREAK_RESET_WINDOW = 120000;
const LONG_IDLE_THRESHOLD = 180000;
const MAX_EVENTS = 5000;

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

// EVENT CAPTURE
let lastScroll = 0, lastKey = 0, lastClick = 0;
document.addEventListener("scroll", throttle(recordEvent, 100, "scroll"));
document.addEventListener("keydown", throttle(recordEvent, 50, "key"));
document.addEventListener("click", throttle(recordEvent, 200, "click"));
document.addEventListener("visibilitychange", updateFocusState);
window.addEventListener("focus", () => focusState = 'active');
window.addEventListener("blur", () => focusState = 'blurred');

function updateFocusDisplay() {
  const indicator = document.getElementById('focus-indicator') || createFocusIndicator();
  indicator.textContent = `Focus: ${focusState === 'active' ? '🟢 Active' : '🔴 Inactive'}`;
  indicator.style.opacity = focusState === 'active' ? '1' : '0.5';
}

function createFocusIndicator() {
  const div = document.createElement('div');
  div.id = 'focus-indicator';
  div.style.cssText = `
    position: fixed; top: 10px; right: 10px; 
    padding: 8px 12px; background: rgba(0,0,0,0.8); color: white;
    border-radius: 20px; font-size: 12px; z-index: 99999; font-family: sans-serif;
  `;
  document.body.appendChild(div);
  return div;
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
    return 'solving';
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
  if (focusState !== 'active' || breakTimer) return;
  const now = Date.now();
  events.push({ type, time: now, scrollY: window.scrollY });
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

// FIXED ANALYSIS LOOP - Idle works independently of event count
setInterval(analyzeActivity, ANALYSIS_INTERVAL);
setInterval(updateFocusDisplay, 2000);

async function analyzeActivity() {
  if (breakTimer || isAnalyzing || isResetting) return;
  
  // FIXED: Long idle check works regardless of event count
  const timeSinceLastEvent = Date.now() - (events[events.length-1]?.time || 0);
  if (timeSinceLastEvent > LONG_IDLE_THRESHOLD && focusState === 'active') {
    console.log('🟡 LONG IDLE TRIGGERED');
    showContextualNudge('stuck');
    return;
  }
  
  // Fatigue analysis needs minimum events
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
    await triggerContextualIntervention(current);
    fatigueWindows = 0;
    lastInterventionTime = Date.now();
    resetDetector();
  }

  isAnalyzing = false;
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
    solving: "🐛 Stuck on this problem? Check the hint or try a simpler challenge.",
    reading: "📖 Eyes tired? Try audiobooks or highlight key sections for review.",
    general: "🧠 Looking fatigued? Take a 2-min break or switch tasks."
  };
  
  const nudgeType = pageContext === 'solving' && metrics.eventRate < 0.3 ? 'stuck_problem' : 'fatigue';
  showSmartNudge(nudges[pageContext] || nudges.general, nudgeType);
}

function showContextualNudge(type) {
  const stuckNudges = {
    learning: "⏳ Been on this lesson 3+ mins without progress. Need help or try easier exercises?",
    solving: "💭 Stuck >3 mins on same problem. Want the solution hint or easier problem?",
    reading: "😴 Same page 3+ mins. Summary available or try related lighter reads?",
    general: "⏳ Idle 3+ mins on same page. Need help finding what you want?"
  };
  
  showSmartNudge(stuckNudges[pageContext] || stuckNudges.general, 'stuck');
}

// FIXED: Smart nudge with proper event handlers + countdown break
function showSmartNudge(msg, type) {
  const box = document.createElement("div");
  box.className = 'fatigue-nudge';
  box.innerHTML = `
    <div style="
      position: fixed; bottom: 30px; right: 20px; 
      padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white; border-radius: 16px; z-index: 99999; max-width: 320px;
      box-shadow: 0 15px 35px rgba(0,0,0,0.4); font-family: -apple-system, sans-serif;
      font-size: 14px; line-height: 1.5;
    ">
      ${msg}
      <div style="margin-top: 12px; display: flex; gap: 8px;">
        <button class="break-btn" style="
          flex: 1; padding: 8px 12px; background: rgba(255,255,255,0.2); 
          border: none; border-radius: 6px; color: white; cursor: pointer;
        ">Take Break (2:00)</button>
        <button class="dismiss-btn" style="
          padding: 8px 12px; background: transparent; border: 1px solid rgba(255,255,255,0.3); 
          border-radius: 6px; color: white; cursor: pointer;
        ">Dismiss</button>
      </div>
    </div>
  `;
  document.body.appendChild(box);
  
  // FIXED: Proper event delegation
  box.querySelector('.break-btn').onclick = takeBreak;
  box.querySelector('.dismiss-btn').onclick = () => box.remove();
  
  setTimeout(() => {
    if (document.body.contains(box)) box.remove();
  }, 12000);
}

// INTEGRATED: Countdown break with persistent toast
function takeBreak() {
  if (breakTimer) {
    clearTimeout(breakTimer);
    if (document.getElementById('break-countdown')) {
      document.getElementById('break-countdown').remove();
    }
    breakTimer = null;
  }

  document.querySelectorAll('.fatigue-nudge').forEach(n => n.remove());

  // Create persistent countdown toast
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
}

function average(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

// Auto-start focus indicator
setTimeout(updateFocusDisplay, 100);
