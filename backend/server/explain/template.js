// Fixed fallback template — used when both Gemini and Groq are unavailable
// Builds plain-language Hinglish explanation from the ranking numbers

/**
 * Generates a fixed template explanation from ranking data
 * @param {Object} ranking - { chosen, runnerUp, nearest, bikeFallback }
 * @param {string} severity - 'critical' | 'minor'
 * @returns {string} Hinglish explanation text
 */
export function templateExplain(ranking, severity = 'minor') {
  if (!ranking?.chosen) {
    return 'Abhi koi free unit nahi hai. Request queue mein hai — jaise hi koi unit free hogi, assign ho jayega.';
  }

  const { chosen, runnerUp, nearest, bikeFallback } = ranking;
  const unitLabel = chosen.type === 'ambulance' ? 'ambulance' : 'bike responder';
  const eta = chosen.eta_minutes.toFixed(1);
  const dist = chosen.distance_km.toFixed(2);
  const gps = chosen.gpsAge_s.toFixed(0);

  let lines = [];

  // Opening
  lines.push(`${chosen.id} (${unitLabel}) ko assign kiya gaya hai.`);
  lines.push(`ETA: ${eta} min | Distance: ${dist} km | GPS age: ${gps}s (fresh).`);

  // Bike fallback warning
  if (bikeFallback) {
    lines.push(`⚠️ Koi ALS ambulance free nahi thi — bike fallback liya gaya (+5 min penalty ke saath).`);
  }

  // Why nearest lost
  if (nearest && nearest.id !== chosen.id) {
    if (nearest.gpsAge_s > 20 && severity === 'critical') {
      lines.push(
        `Nearest unit ${nearest.id} exclude hua kyunki uska GPS ${nearest.gpsAge_s.toFixed(0)}s purana hai — critical case mein stale GPS safe nahi.`
      );
    } else if (nearest.gpsAge_s > 20) {
      lines.push(
        `Nearest unit ${nearest.id} ka GPS ${nearest.gpsAge_s.toFixed(0)}s purana tha — +3 min stale penalty laga.`
      );
    } else if (severity === 'critical' && nearest.type === 'bike') {
      lines.push(`Nearest unit ${nearest.id} bike hai — critical ke liye ambulance prefer hoti hai (+5 min capability penalty).`);
    } else {
      lines.push(`Nearest unit ${nearest.id} ka score zyada tha — ${chosen.id} overall better tha.`);
    }
  }

  // Runner-up margin
  if (runnerUp) {
    const margin = (runnerUp.eta_minutes - chosen.eta_minutes).toFixed(1);
    lines.push(`Runner-up: ${runnerUp.id} (${margin} min peeche tha).`);
  }

  // Severity note
  if (severity === 'critical') {
    lines.push('Ye ek critical request hai — ambulance aur fresh GPS ko priority di gayi hai.');
  } else {
    lines.push('Minor request — nearest available responder assign kiya gaya hai.');
  }

  lines.push('[Template fallback — AI unavailable] Ye ek PROTOTYPE / DRILL hai.');

  return lines.join(' ');
}

/**
 * Generates a fixed template triage response
 * @param {string} text - caller description (unused in template, but signature matches)
 * @returns {{ severity: string, source: string }}
 */
export function templateTriage(text = '') {
  // Simple keyword-based fallback when AI unavailable
  const lowerText = text.toLowerCase();
  const criticalKeywords = [
    'unconscious', 'not breathing', 'chest pain', 'heart attack', 'stroke',
    'accident', 'bleeding heavily', 'fire', 'burns', 'choking', 'seizure',
    'bebehosh', 'saans nahi', 'seene mein dard', 'haadsa', 'khoon', 'aag',
    'dil', 'epilepsy'
  ];

  const isCritical = criticalKeywords.some((kw) => lowerText.includes(kw));

  return {
    severity: isCritical ? 'critical' : 'minor',
    source: 'button',
    note: 'Template fallback — AI unavailable. Severity determined by keyword matching.'
  };
}
