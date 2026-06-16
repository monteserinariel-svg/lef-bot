'use strict';

const TelegramBot = require('node-telegram-bot-api');
const { analyze } = require('./lef-engine');

const TOKEN = process.env.BOT_TOKEN;
if (!TOKEN) { console.error('❌  Falta BOT_TOKEN en variables de entorno.'); process.exit(1); }

const bot = new TelegramBot(TOKEN, { polling: true });

// ─── Estado de conversación por usuario ──────────────────────────────────────
const sessions = {};   // chatId → { step, data }

function session(id) {
  if (!sessions[id]) sessions[id] = { step: 'idle', data: {} };
  return sessions[id];
}

// ─── Helpers de formato ───────────────────────────────────────────────────────
const fmt = n => Number(n).toLocaleString('es-AR', { maximumFractionDigits: 2 });

function bar(score, max = 100, len = 10) {
  const filled = Math.round((score / max) * len);
  return '█'.repeat(filled) + '░'.repeat(len - filled);
}

function scoreEmoji(s) {
  if (s >= 80) return '🔥';
  if (s >= 60) return '⚡';
  if (s >= 40) return '🟡';
  return '⚪';
}

function renderResult(r) {
  const { pair, zones, comp, sweepResult, impulse, euphoriaScore, capScore, lts, signals, trend, structure1H } = r;

  const trendLabel = trend === 'bull' ? '📈 Alcista' : trend === 'bear' ? '📉 Bajista' : '↔️ Neutral';
  const structLabel = structure1H === 'intact' ? '✅ Intacta' : structure1H === 'broken_up' ? '⬆️ Rotura alcista' : '⬇️ Rotura bajista';

  let msg = '';

  // Cabecera
  msg += `╔══════════════════════════╗\n`;
  msg += `║  📊 LEF — ${pair.padEnd(14)} ║\n`;
  msg += `╚══════════════════════════╝\n\n`;

  // LTS global
  msg += `*LTS Global: ${lts}/100* ${scoreEmoji(lts)}\n`;
  msg += `${bar(lts)} \n`;
  msg += `Tendencia: ${trendLabel}  |  1H: ${structLabel}\n\n`;

  // Módulos
  msg += `━━━ MÓDULOS ━━━━━━━━━━━━━━━━\n`;
  msg += `🗺  *Compresión:* ${comp}/100 ${bar(comp, 100, 8)}\n`;
  msg += `🌊 *Barrido:* ${sweepResult.type} (${sweepResult.score} pts)\n`;
  msg += `⚡ *Delta impulso:* ${impulse.label} (${impulse.score} pts)\n`;
  msg += `🔥 *Euforia:* ${euphoriaScore}/100 ${bar(euphoriaScore, 100, 8)}\n`;
  msg += `🌊 *Capitulación:* ${capScore}/100 ${bar(capScore, 100, 8)}\n\n`;

  // Mapa de liquidez
  msg += `━━━ MAPA DE LIQUIDEZ ━━━━━━━\n`;
  zones.slice(0, 5).forEach(z => {
    const arrow = z.side === 'sell' ? '🔴' : '🟢';
    msg += `${arrow} $${fmt(z.level)} — ${z.label}\n`;
    msg += `   LDR: ${z.ldr}x ATR  |  ${z.score} pts  |  Prob: ${z.prob.label}\n`;
  });
  msg += `\n`;

  // Señales
  if (signals.length === 0) {
    msg += `━━━ SEÑALES ━━━━━━━━━━━━━━━━\n`;
    msg += `⚪ Sin confluencias suficientes.\nMonitorear y esperar nueva estructura.\n`;
  } else {
    msg += `━━━ SEÑALES LEF ━━━━━━━━━━━━\n\n`;
    signals.forEach(s => {
      msg += `${s.emoji} *${s.type} — ${s.pair}*\n`;
      msg += `📍 *${s.label}*\n`;
      msg += `🎯 Zona de espera:\n`;
      msg += `   \\$${fmt(s.zoneFrom)} — \\$${fmt(s.zoneTo)}\n`;
      msg += `📊 LTS: ${s.lts}/100  |  LDR: ${s.ldr}x  |  Prob ataque: ${s.prob}\n`;
      if (s.conditions.length > 0) {
        msg += `✅ Confluencias:\n`;
        s.conditions.forEach(c => { msg += `   • ${c}\n`; });
      }
      msg += `⏳ *Confirmación 1H:*\n   ${s.confirmation}\n`;
      msg += `🕐 TF: ${s.timeframes}\n\n`;
      msg += `⚠️ _No operar al precio actual.\nEsperar que el precio llegue a la zona._\n\n`;
    });
  }

  msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `_LEF Bot · Liquidity Exhaustion Framework_`;

  return msg;
}

// ─── Teclados ─────────────────────────────────────────────────────────────────
const KB_TREND = {
  reply_markup: {
    keyboard: [['📈 Alcista', '📉 Bajista', '↔️ Neutral']],
    one_time_keyboard: true, resize_keyboard: true,
  },
};
const KB_SWEEP = {
  reply_markup: {
    keyboard: [['🔺 Barrido alcista', '🔻 Barrido bajista', '⬛ Sin barrido']],
    one_time_keyboard: true, resize_keyboard: true,
  },
};
const KB_COMP = {
  reply_markup: {
    keyboard: [['✅ Sí, comprimido', '🟡 Parcialmente', '❌ No']],
    one_time_keyboard: true, resize_keyboard: true,
  },
};
const KB_EFF = {
  reply_markup: {
    keyboard: [['📉 Decayendo', '📈 Creciendo', '➡️ Estable']],
    one_time_keyboard: true, resize_keyboard: true,
  },
};
const KB_STRUCT = {
  reply_markup: {
    keyboard: [['✅ Intacta', '⬆️ Rotura alcista', '⬇️ Rotura bajista']],
    one_time_keyboard: true, resize_keyboard: true,
  },
};
const KB_REMOVE = { reply_markup: { remove_keyboard: true } };

// ─── Flujo principal ──────────────────────────────────────────────────────────
const STEPS = [
  {
    key: 'pair',
    ask: () => `👋 *LEF Bot activo*\n\n¿Qué par querés analizar?\nEjemplo: BTC/USDT, ETH/USDT, SOL/USDT`,
    parse: v => v.trim().toUpperCase(),
    validate: v => v.length > 2,
    errMsg: 'Escribí un par válido (ej: BTC/USDT)',
  },
  {
    key: 'price',
    ask: d => `Par: *${d.pair}*\n\n¿Cuál es el precio actual aproximado?\n_(Solo el número, sin símbolos)_`,
    parse: v => parseFloat(v.replace(/[^0-9.]/g, '')),
    validate: v => !isNaN(v) && v > 0,
    errMsg: 'Ingresá un número válido (ej: 67500)',
  },
  {
    key: 'atr',
    ask: d => `*${d.pair}* @ $${fmt(d.price)}\n\n¿Cuál es el ATR diario?\n_(Average True Range del período diario)_`,
    parse: v => parseFloat(v.replace(/[^0-9.]/g, '')),
    validate: v => !isNaN(v) && v > 0,
    errMsg: 'Ingresá un número válido (ej: 1850)',
  },
  {
    key: 'eqh',
    ask: () => `¿Tenés un *EQH (triple/doble techo)* identificado?\nIngresá el precio o escribí *no*`,
    parse: v => v.toLowerCase() === 'no' ? null : parseFloat(v.replace(/[^0-9.]/g, '')),
    validate: () => true,
    errMsg: '',
  },
  {
    key: 'eql',
    ask: () => `¿Tenés un *EQL (triple/doble piso)* identificado?\nIngresá el precio o escribí *no*`,
    parse: v => v.toLowerCase() === 'no' ? null : parseFloat(v.replace(/[^0-9.]/g, '')),
    validate: () => true,
    errMsg: '',
  },
  {
    key: 'weeklyHigh',
    ask: () => `¿Cuál es el *máximo semanal*? (o *no*)`,
    parse: v => v.toLowerCase() === 'no' ? null : parseFloat(v.replace(/[^0-9.]/g, '')),
    validate: () => true,
    errMsg: '',
  },
  {
    key: 'weeklyLow',
    ask: () => `¿Cuál es el *mínimo semanal*? (o *no*)`,
    parse: v => v.toLowerCase() === 'no' ? null : parseFloat(v.replace(/[^0-9.]/g, '')),
    validate: () => true,
    errMsg: '',
  },
  {
    key: 'trend',
    ask: () => `¿Cuál es la *tendencia principal* (diario)?`,
    parse: v => v.includes('Alcista') || v.includes('alcista') ? 'bull' : v.includes('Bajista') || v.includes('bajista') ? 'bear' : 'neutral',
    validate: () => true,
    errMsg: '',
    keyboard: KB_TREND,
  },
  {
    key: 'sweep',
    ask: () => `¿Hubo un *barrido de liquidez* reciente?`,
    parse: v => v.includes('alcista') || v.includes('Alcista') ? 'bullish' : v.includes('bajista') || v.includes('Bajista') ? 'bearish' : 'none',
    validate: () => true,
    errMsg: '',
    keyboard: KB_SWEEP,
  },
  {
    key: 'compression',
    ask: () => `¿El mercado está en *compresión*?\n(ATR decreciente + BB estrechas + volumen bajo)`,
    parse: v => {
      const yes = v.includes('Sí') || v.includes('comprimido');
      const partial = v.includes('Parcial') || v.includes('parcial');
      return { atrDecreasing: yes || partial, bbTight: yes, volumeDecreasing: yes || partial };
    },
    validate: () => true,
    errMsg: '',
    keyboard: KB_COMP,
  },
  {
    key: 'impulseEff',
    ask: () => `¿Cómo está la *eficiencia del impulso*?\n(menos avance con más volumen = decayendo)`,
    parse: v => v.includes('Decayendo') || v.includes('decayendo') ? 'decay' : v.includes('Creciendo') || v.includes('creciendo') ? 'rising' : 'stable',
    validate: () => true,
    errMsg: '',
    keyboard: KB_EFF,
  },
  {
    key: 'structure1H',
    ask: () => `¿Cómo está la *estructura en 1H*?`,
    parse: v => v.includes('Rotura alcista') ? 'broken_up' : v.includes('Rotura bajista') ? 'broken_down' : 'intact',
    validate: () => true,
    errMsg: '',
    keyboard: KB_STRUCT,
  },
];

function currentStep(ses) {
  return STEPS[ses.stepIndex ?? 0];
}

async function askStep(chatId, ses) {
  const step = currentStep(ses);
  const text = step.ask(ses.data);
  const opts = step.keyboard ?? KB_REMOVE;
  await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', ...opts });
}

// ─── Comandos ─────────────────────────────────────────────────────────────────
bot.onText(/\/start/, async msg => {
  const id = msg.chat.id;
  sessions[id] = { stepIndex: 0, data: {} };
  await bot.sendMessage(id,
    `🌊 *Liquidity Exhaustion Framework*\n\nBot de señales por zona.\n\n` +
    `Comandos:\n/analizar — nuevo análisis\n/info — qué es el LEF\n/ayuda — cómo usar`,
    { parse_mode: 'Markdown' }
  );
  await new Promise(r => setTimeout(r, 500));
  await askStep(id, sessions[id]);
});

bot.onText(/\/analizar/, async msg => {
  const id = msg.chat.id;
  sessions[id] = { stepIndex: 0, data: {} };
  await askStep(id, sessions[id]);
});

bot.onText(/\/info/, async msg => {
  await bot.sendMessage(msg.chat.id,
    `📖 *Liquidity Exhaustion Framework (LEF)*\n\n` +
    `El LEF no pregunta si el mercado está alcista o bajista.\nPregunta: *¿dónde está la mayor concentración de órdenes sin ejecutar?*\n\n` +
    `*Módulos:*\n` +
    `1️⃣ Mapa de liquidez — EQH/EQL, semanales, mensuales\n` +
    `2️⃣ LDR — distancia/ATR a cada zona\n` +
    `3️⃣ Compresión — ATR + BB + volumen\n` +
    `4️⃣ Barrido — captura de liquidez\n` +
    `5️⃣ Delta de impulso — eficiencia precio/volumen\n` +
    `6️⃣ Euforia — sobreextensión alcista\n` +
    `7️⃣ Capitulación — sobreextensión bajista\n\n` +
    `*Las señales siempre son por zona. Nunca por precio actual.*`,
    { parse_mode: 'Markdown' }
  );
});

bot.onText(/\/ayuda/, async msg => {
  await bot.sendMessage(msg.chat.id,
    `❓ *Cómo usar el LEF Bot*\n\n` +
    `1. Escribí /analizar\n` +
    `2. El bot te va a pedir los datos del activo paso a paso\n` +
    `3. Al final genera:\n   • Mapa de liquidez con puntajes\n   • LTS Score global\n   • Zonas de compra/venta para esperar\n\n` +
    `⚠️ *Importante:* las señales indican ZONAS, no precios exactos. El precio debe llegar a esa zona y confirmar estructura antes de operar.`,
    { parse_mode: 'Markdown' }
  );
});

// ─── Manejo de mensajes ───────────────────────────────────────────────────────
bot.on('message', async msg => {
  if (!msg.text || msg.text.startsWith('/')) return;
  const chatId = msg.chat.id;
  const ses = session(chatId);
  if (ses.stepIndex === undefined || ses.stepIndex >= STEPS.length) return;

  const step = currentStep(ses);
  const parsed = step.parse(msg.text);

  if (step.validate && !step.validate(parsed)) {
    await bot.sendMessage(chatId, `⚠️ ${step.errMsg}`, { parse_mode: 'Markdown' });
    return;
  }

  ses.data[step.key] = parsed;
  ses.stepIndex++;

  if (ses.stepIndex >= STEPS.length) {
    // Construir parámetros para el engine
    const d = ses.data;
    const impulseMap = { decay: [{ pct: 10, volume: 500 }, { pct: 6, volume: 800 }, { pct: 3, volume: 1200 }], rising: [{ pct: 3, volume: 1200 }, { pct: 6, volume: 800 }, { pct: 10, volume: 500 }], stable: [{ pct: 5, volume: 700 }, { pct: 5, volume: 700 }] };

    const params = {
      pair: d.pair,
      price: d.price,
      atr: d.atr,
      eqh: d.eqh,
      eql: d.eql,
      weeklyHigh: d.weeklyHigh,
      weeklyLow: d.weeklyLow,
      monthlyHigh: d.weeklyHigh ? d.weeklyHigh * 1.03 : null,
      monthlyLow:  d.weeklyLow  ? d.weeklyLow  * 0.97 : null,
      trend: d.trend,
      sweep: d.sweep,
      compression: d.compression,
      impulses: impulseMap[d.impulseEff] ?? impulseMap.stable,
      sentiment: {
        distEMAperc: d.trend === 'bull' ? 8 : d.trend === 'bear' ? -8 : 0,
        fibExtension: d.sweep !== 'none' ? 161.8 : 100,
        volumeSpike: d.sweep !== 'none',
        momentumHigh: d.trend === 'bull',
        structureLost: d.structure1H === 'broken_down',
      },
      structure1H: d.structure1H,
    };

    await bot.sendMessage(chatId, '⏳ Calculando análisis LEF...', KB_REMOVE);

    try {
      const result = analyze(params);
      const text = renderResult(result);
      await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
      await bot.sendMessage(chatId,
        `✅ Análisis completo.\n\n¿Querés analizar otro activo?\n/analizar — nuevo análisis`,
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      console.error(err);
      await bot.sendMessage(chatId, '❌ Error al calcular. Intentá de nuevo con /analizar');
    }

    ses.stepIndex = undefined;
  } else {
    await askStep(chatId, ses);
  }
});

bot.on('polling_error', err => console.error('Polling error:', err.message));

console.log('🌊 LEF Bot iniciado...');
