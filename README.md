# Whale Signal System V1

TRUMP token whale detection via Helius webhook → Telegram signal push.

## Setup

```bash
npm install
```

## Environment Variables

```
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
HELIUS_API_KEY=your_helius_key     # for future webhook registration
SOL_PRICE_USD=150                  # optional, fallback SOL price for USD calc
PORT=8080                          # optional, default 8080
```

## Run

```bash
npm start
```

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /health | Health check |
| POST | /webhook/helius | Helius webhook receiver |
| GET | /test | Inject mock TRUMP BUY event |

## Register Helius Webhook

In Helius dashboard → Webhooks → Create:
- Webhook URL: `https://your-domain/webhook/helius`
- Transaction Type: `SWAP`
- Account Address: TRUMP_MINT = `HaP8r3ksG76PhQLTqR8FYBeNiQpejcFbQmiHbg787Ut1`

## Signal Logic

```
normalize → extractFeatures → score → decide → push

BUY signal:  score >= 50  (direction=BUY  +30, sizeScore>0.5 +20)
SELL signal: score <= -50 (direction=SELL -30, sizeScore>0.5 +20→ -50)
```

## Pipeline

```
Helius Webhook
    ↓
heliusWebhook.js  (route handler)
    ↓
normalizer.js     (raw → standard tx object)
    ↓
features.js       (is TRUMP? BUY/SELL? size?)
    ↓
scorer.js         (numeric score)
    ↓
rules.js          (score → decision)
    ↓
telegram.js       (format + push)
```
