Fatigue Detector 

A smart activity monitor that detects when you're getting fatigued or stuck while browsing. It tracks your interaction patterns (scrolling, typing, clicks) and provides contextual nudges to take breaks or switch tasks before burnout hits.

What it does

- **Smart monitoring**: Learns your normal browsing patterns in the first 5 minutes
- **Fatigue detection**: Catches slowing activity, erratic scrolling, and low engagement
- **Stuck detection**: Alerts when idle 3+ minutes on the same page
- **Context-aware nudges**: Different suggestions for learning sites, coding challenges, or reading
- **Break timer**: Guided 2-minute breaks with countdown

How to test

1. **Install**: Load the script in your browser (via Tampermonkey or as extension)
2. **Browse normally**: The detector learns your patterns in the first 5 minutes
3. **Watch for nudges**: Purple notification boxes appear bottom-right when fatigue is detected
4. **Take breaks**: Click "Take Break" for a guided 2-minute pause, or "Dismiss" to continue
5. **Check focus**: Green/red indicator in top-right shows if you're actively on the page

Tech Stack:
Vanilla JavaScript - no dependencies, runs entirely in browser