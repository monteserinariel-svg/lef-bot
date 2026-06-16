'use strict';

// ─── Módulo 1: Puntaje de liquidez ───────────────────────────────────────────
function liquidityScore(type) {
  const scores = {
    eqh_triple: 90, eql_triple: 90,
    eqh_double: 70, eql_double: 70,
    monthly_high: 75, monthly_low: 75,
    weekly_high: 60, weekly_low: 60,
    consolidation: 50,
  };
  return scores[type] ?? 50;
}

// ─── Módulo 2: LDR ───────────────────────────────────────────────────────────
function calcLDR(price, zoneLevel, atr) {
  return Math.abs(price - zoneLevel) / atr;
}

function ldrProbability(ldr) {
  if (ldr < 0.5) return { label: 'Muy alta', score: 95 };
  if (ldr < 1.0) return { label: 'Alta', score: 80 };
  if (ldr < 2.0) return { label: 'Media', score: 60 };
  if (ldr < 3.5) return { label: 'Baja', score: 35 };
  return { label: 'Muy baja', score: 15 };
}

// ─── Módulo 3: Compresión ─────────────────────────────────────────────────────
function compressionScore(atrDecreasing, bbTight, volumeDecreasing) {
  let score = 0;
  if (atrDecreasing) score += 35;
  if (bbTight) score += 35;
  if (volumeDecreasing) score += 30;
  return score;
}

// ─── Módulo 4: Barrido ────────────────────────────────────────────────────────
function detectSweep(sweepType) {
  if (sweepType === 'bullish') return { detected: true, type: 'alcista', score: 85, signal: 'Rompió máximo → cerró debajo. Liquidez capturada arriba.' };
  if (sweepType === 'bearish') return { detected: true, type: 'bajista', score: 85, signal: 'Rompió mínimo → cerró arriba. Liquidez capturada abajo.' };
  return { detected: false, type: 'ninguno', score: 10, signal: 'Sin barrido reciente.' };
}

// ─── Módulo 5: Delta de impulso ───────────────────────────────────────────────
function impulseEfficiency(impulses) {
  // impulses: [{pct, volume}, ...]
  if (!impulses || impulses.length < 2) return { score: 50, label: 'Sin datos suficientes', decay: false };
  const efficiencies = impulses.map(i => i.pct / i.volume);
  const isDecaying = efficiencies.every((e, i) => i === 0 || e < efficiencies[i - 1]);
  const lastEff = efficiencies[efficiencies.length - 1];
  const firstEff = efficiencies[0];
  const decayRatio = firstEff > 0 ? ((firstEff - lastEff) / firstEff) * 100 : 0;
  const score = isDecaying ? Math.min(95, 50 + decayRatio) : 30;
  return {
    score: Math.round(score),
    label: isDecaying ? `Decayendo ${decayRatio.toFixed(0)}%` : 'Creciendo / estable',
    decay: isDecaying,
  };
}

// ─── Módulo 6: Euforia ────────────────────────────────────────────────────────
function euphoria({ distEMAperc, fibExtension, volumeSpike, momentumHigh }) {
  let score = 0;
  if (distEMAperc > 15) score += 30;
  else if (distEMAperc > 8) score += 20;
  else if (distEMAperc > 4) score += 10;

  if (fibExtension >= 261.8) score += 30;
  else if (fibExtension >= 161.8) score += 15;

  if (volumeSpike) score += 25;
  if (momentumHigh) score += 15;

  return Math.min(100, score);
}

// ─── Módulo 7: Capitulación ───────────────────────────────────────────────────
function capitulation({ distEMAperc, volumeSpike, structureLost }) {
  let score = 0;
  if (distEMAperc < -15) score += 30;
  else if (distEMAperc < -8) score += 20;
  else if (distEMAperc < -4) score += 10;
  if (volumeSpike) score += 35;
  if (structureLost) score += 35;
  return Math.min(100, score);
}

// ─── LTS Score ────────────────────────────────────────────────────────────────
function calcLTS({ liquidityWeight, sweepProbability, volatilityCompression, momentumDecay, volumeAnomaly }) {
  return Math.round((liquidityWeight + sweepProbability + volatilityCompression + momentumDecay + volumeAnomaly) / 5);
}

// ─── Análisis completo ────────────────────────────────────────────────────────
function analyze(params) {
  const {
    pair, price, atr,
    eqh, eql,
    weeklyHigh, weeklyLow,
    monthlyHigh, monthlyLow,
    trend,                        // 'bull' | 'bear' | 'neutral'
    sweep,                        // 'bullish' | 'bearish' | 'none'
    compression,                  // { atrDecreasing, bbTight, volumeDecreasing }
    impulses,                     // [{pct, volume}, ...]
    sentiment,                    // { distEMAperc, fibExtension, volumeSpike, momentumHigh, structureLost }
    structure1H,                  // 'intact' | 'broken_up' | 'broken_down'
  } = params;

  // Zonas de liquidez
  const zones = [];
  const addZone = (label, level, side, type) => {
    const score = liquidityScore(type);
    const ldr = calcLDR(price, level, atr);
    const prob = ldrProbability(ldr);
    zones.push({ label, level, side, score, ldr: +ldr.toFixed(2), prob });
  };

  if (eqh)         addZone('EQH — Triple techo',   eqh,         'sell', 'eqh_triple');
  if (eql)         addZone('EQL — Triple piso',     eql,         'buy',  'eql_triple');
  if (weeklyHigh)  addZone('Máximo semanal',        weeklyHigh,  'sell', 'weekly_high');
  if (weeklyLow)   addZone('Mínimo semanal',        weeklyLow,   'buy',  'weekly_low');
  if (monthlyHigh) addZone('Máximo mensual',        monthlyHigh, 'sell', 'monthly_high');
  if (monthlyLow)  addZone('Mínimo mensual',        monthlyLow,  'buy',  'monthly_low');

  zones.sort((a, b) => a.ldr - b.ldr);

  // Sub-módulos
  const comp = compressionScore(
    compression?.atrDecreasing ?? false,
    compression?.bbTight ?? false,
    compression?.volumeDecreasing ?? false
  );
  const sweepResult = detectSweep(sweep);
  const impulse = impulseEfficiency(impulses);
  const euphoriaScore = euphoria(sentiment ?? {});
  const capScore = capitulation(sentiment ?? {});

  // LTS
  const topZone = zones[0];
  const lts = calcLTS({
    liquidityWeight: topZone?.score ?? 50,
    sweepProbability: sweepResult.score,
    volatilityCompression: comp,
    momentumDecay: impulse.score,
    volumeAnomaly: sentiment?.volumeSpike ? 80 : 35,
  });

  // Señales — siempre por zona, nunca precio actual
  const signals = [];

  const sellZones = zones.filter(z => z.side === 'sell').sort((a, b) => a.ldr - b.ldr);
  const buyZones  = zones.filter(z => z.side === 'buy').sort((a, b) => a.ldr - b.ldr);

  if (sellZones.length > 0) {
    const sz = sellZones[0];
    const margin = atr * 0.3;
    const conditions = [];
    if (sz.score >= 80)      conditions.push(`Liquidez alta (${sz.score} pts)`);
    if (comp > 60)           conditions.push('Compresión activa');
    if (impulse.decay)       conditions.push('Delta decayente');
    if (sweep === 'bullish') conditions.push('Barrido alcista previo');
    if (euphoriaScore > 65)  conditions.push(`Euforia ${euphoriaScore}/100`);

    signals.push({
      type: 'VENTA',
      emoji: '🔴',
      pair,
      label: sz.label,
      zoneFrom: +(sz.level - margin).toFixed(2),
      zoneTo:   +(sz.level + margin * 0.5).toFixed(2),
      lts: Math.round((sz.score + sweepResult.score + comp + impulse.score) / 4),
      ldr: sz.ldr,
      prob: sz.prob.label,
      conditions,
      confirmation: 'Esperar pérdida de estructura en 1H + volumen decreciente en el rebote.',
      timeframes: 'Diario → 4H → 1H → 15m',
    });
  }

  if (buyZones.length > 0) {
    const bz = buyZones[0];
    const margin = atr * 0.3;
    const conditions = [];
    if (bz.score >= 80)      conditions.push(`Liquidez alta (${bz.score} pts)`);
    if (comp > 60)           conditions.push('Compresión activa');
    if (capScore > 55)       conditions.push(`Capitulación ${capScore}/100`);
    if (sweep === 'bearish') conditions.push('Barrido bajista previo');

    signals.push({
      type: 'COMPRA',
      emoji: '🟢',
      pair,
      label: bz.label,
      zoneFrom: +(bz.level - margin * 0.5).toFixed(2),
      zoneTo:   +(bz.level + margin).toFixed(2),
      lts: Math.round((bz.score + sweepResult.score + comp + capScore) / 4),
      ldr: bz.ldr,
      prob: bz.prob.label,
      conditions,
      confirmation: 'Esperar recuperación de estructura en 1H + barrido bajista confirmado.',
      timeframes: 'Diario → 4H → 1H → 15m',
    });
  }

  return { pair, price, atr, zones, comp, sweepResult, impulse, euphoriaScore, capScore, lts, signals, trend, structure1H };
}

module.exports = { analyze, liquidityScore, calcLDR, ldrProbability };
