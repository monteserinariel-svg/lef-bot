# 🌊 LEF Bot — Liquidity Exhaustion Framework para Telegram

Bot de señales por zona de liquidez. Nunca emite señales por precio actual.

## Archivos

- `lef-engine.js` — motor de cálculo (todos los módulos LEF)
- `bot.js` — bot de Telegram con flujo conversacional
- `README.md` — instrucciones de deploy

---

## ⚡ Paso 1 — Crear el bot en Telegram

1. Abrí Telegram y buscá **@BotFather**
2. Enviá `/newbot`
3. Poné un nombre: `LEF Trading Bot`
4. Poné un username: `mi_lef_bot` (debe terminar en `bot`)
5. BotFather te devuelve un **token** → copialo, lo necesitás en el paso 3

---

## 🖥️ Paso 2 — Opciones de hosting

### Opción A — Railway (gratis, recomendado)

1. Creá cuenta en [railway.app](https://railway.app)
2. New Project → Deploy from GitHub repo  
   (o "Empty project" → subí los archivos)
3. En Variables de entorno agregá:
   ```
   BOT_TOKEN = tu_token_de_botfather
   ```
4. Railway detecta Node.js automáticamente y lo levanta

### Opción B — Render (gratis)

1. Cuenta en [render.com](https://render.com)
2. New → Web Service → conectá tu repo
3. Build command: `npm install`
4. Start command: `node bot.js`
5. Environment variable: `BOT_TOKEN = tu_token`

### Opción C — Local (para probar)

```bash
# Instalar dependencias
npm install

# Correr el bot
BOT_TOKEN=tu_token node bot.js
```

En Windows:
```cmd
set BOT_TOKEN=tu_token
node bot.js
```

---

## 💬 Comandos del bot

| Comando | Descripción |
|---------|-------------|
| `/start` | Inicia el bot y primer análisis |
| `/analizar` | Nuevo análisis LEF |
| `/info` | Descripción del framework |
| `/ayuda` | Cómo usar el bot |

---

## 📊 Flujo de análisis

El bot pregunta paso a paso:

1. Par (BTC/USDT, ETH/USDT...)
2. Precio actual aproximado
3. ATR diario
4. EQH — triple/doble techo
5. EQL — triple/doble piso
6. Máximo semanal
7. Mínimo semanal
8. Tendencia general (botones)
9. Barrido detectado (botones)
10. Compresión (botones)
11. Eficiencia del impulso (botones)
12. Estructura 1H (botones)

Al final emite:
- Mapa de liquidez con puntajes y LDR
- LTS Score global
- Zonas de compra/venta con rango de espera
- Confluencias detectadas
- Confirmación requerida en 1H

---

## ⚠️ Importante

Las señales siempre indican una **zona de precio**, nunca el precio actual.
El operador debe esperar que el precio llegue a esa zona y confirmar estructura antes de operar.
