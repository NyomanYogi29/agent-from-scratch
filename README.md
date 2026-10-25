# Lya (lya-ts)

<p align="center">
  <img src="https://img.shields.io/badge/Bun-000000?style=for-the-badge&logo=bun&logoColor=white" alt="Bun" />
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Telegram-2CA5E0?style=for-the-badge&logo=telegram&logoColor=white" alt="Telegram" />
  <img src="https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white" alt="Redis" />
  <img src="https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker" />
</p>

<p align="center">
  A lightweight, personal AI agent built from scratch with TypeScript and Bun runtime, connected via Telegram with sliding-window short-term memory in Redis.
</p>

---

## About The Project

This repository documents my journey of learning how to build an autonomous AI Agent from scratch without Hermes or OpenClaw. I named mine **Lya**.

I chose **TypeScript** with the **Bun** runtime for its speed, and seamless package management.

### Key Highlights

- **Master-Only Whitelist Gateway**: The Telegram gateway enforces a strict security middleware. Only interactions matching `MASTER_TELEGRAM_ID` are processed; all unauthorized attempts are rejected and logged.
- **Sliding-Window Short-Term Memory**: Uses Redis (`RPUSH` / `LTRIM`) to maintain a sliding conversation window (up to 24 dialogue messages) with a 24-hour TTL, preserving context efficiently without token bloat.
- **Interactive Memory Reset**: Supports an in-chat `/reset` command that instantly flushes the user's sliding window memory from Redis. The command isn't registered yet, so if you accidentally type `/reset` to your bot, it will automatically clear the sliding window in redis.
- **OpenRouter Provider**: Integrated with OpenRouter via the Vercel AI SDK (`ai`), allowing instant switching between modern LLM backends.
- **Graceful Shutdown**: Listens to `SIGINT` / `SIGTERM` signals to gracefully close the Telegram polling loop and Redis connection pool and other future services.

---

## Prerequisites

Make sure you have these installed on your local machine:

- [Bun](https://bun.sh/) (v1.4 or newer)
- [Docker](https://docs.docker.com/get-docker/) \*make sure they're working properly
- A Telegram bot token from [@BotFather](https://t.me/BotFather)
- An API key from [OpenRouter](https://openrouter.ai/)

---

## Quick Start

### 1. Clone Repository

```bash
git clone https://github.com/NyomanYogi29/lya-ts.git
cd lya-ts
```

### 2. Install Dependencies

```bash
bun install
```

### 3. Start Redis Service

Launch the Redis container using the included Compose configuration:

```bash
docker compose up -d
```

_(To stop Redis later, run `docker compose down`)_.

### 4. Configure Environment Variables

Create your local `.env` file from the provided `.env.example`:

```bash
cp .env.example .env
```

Open `.env` and configure your credentials:

```env
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
MASTER_TELEGRAM_ID=your_numerical_telegram_id

MASTER_FULL_NAME=Your Name

OPENROUTER_API_KEY=your_openrouter_api_key
OPENROUTER_MODEL=google/gemma-4-31b-it # or your chosen model
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1

REDIS_URL=redis://localhost:6379/0
```

### 5. Customize the Persona (Optional)

You can customize your own agent's core personality, behavior, and relationship dynamic directly in:
`src/adapters/system_prompt.ts`

```typescript
export const SYSTEM = `... your custom system prompt ...`;
```

### 6. Run the Application

Start the development server with live reload:

```bash
bun run dev:watch
```

---

## Configuration Reference

| Variable              | Description                                        | Default / Example              |
| :-------------------- | :------------------------------------------------- | :----------------------------- |
| `TELEGRAM_BOT_TOKEN`  | Bot API token obtained from @BotFather             | _(Required)_                   |
| `MASTER_TELEGRAM_ID`  | Your numerical Telegram user ID for whitelist auth | _(Required)_                   |
| `MASTER_FULL_NAME`    | Master's display name passed to the prompt adapter | _(Optional)_                   |
| `OPENROUTER_API_KEY`  | Your OpenRouter api key                            | _(Required)_                   |
| `OPENROUTER_MODEL`    | LLM model id from OpenRouter                       | `google/gemma-4-31b-it`        |
| `OPENROUTER_BASE_URL` | OpenRouter base url                                | `https://openrouter.ai/api/v1` |
| `REDIS_URL`           | Redis connection URI                               | `redis://localhost:6379/0`     |

---
