// ======================================================
// TELEGRAM AI BOT — ULTRA STABLE FINAL VERSION
// Beginner Friendly + Production Ready
// ======================================================

import TelegramBot from "node-telegram-bot-api";
import { GoogleGenerativeAI } from "@google/generative-ai";
import http from "http";

// ======================================================
// ENVIRONMENT VARIABLES
// ======================================================

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!TELEGRAM_TOKEN || !GEMINI_API_KEY) {
  console.error(
    "❌ Missing TELEGRAM_TOKEN or GEMINI_API_KEY"
  );
  process.exit(1);
}

// ======================================================
// TELEGRAM BOT
// ======================================================

const bot = new TelegramBot(TELEGRAM_TOKEN, {
  polling: true,
});

// ======================================================
// GEMINI SETUP
// ======================================================

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const liteModel = genAI.getGenerativeModel({
  model: "gemini-2.5-flash-lite",
});

const flashModel = genAI.getGenerativeModel({
  model: "gemini-2.5-flash",
});

// ======================================================
// CONFIG
// ======================================================

const CONFIG = {
  MAX_MESSAGE_LENGTH: 1000,
  USER_COOLDOWN_MS: 3000,

  CACHE_TTL_LITE: 1000 * 60 * 5,
  CACHE_TTL_FLASH: 1000 * 60 * 60,

  MAX_RETRIES: 3,
  RETRY_DELAY: 2000,

  DEBUG_MODEL_NAME: true,
};

// ======================================================
// MEMORY STORAGE
// ======================================================

const cache = new Map();
const userCooldowns = new Map();

// ======================================================
// GLOBAL ERROR HANDLERS
// ======================================================

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

// ======================================================
// HELPER FUNCTIONS
// ======================================================

function sleep(ms) {
  return new Promise((resolve) =>
    setTimeout(resolve, ms)
  );
}

function normalizeText(text) {
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

async function safeSend(chatId, text) {
  try {
    await bot.sendMessage(chatId, text);
  } catch (error) {
    console.error(
      "❌ Send Error:",
      error.message
    );
  }
}

// ======================================================
// CACHE SYSTEM
// ======================================================

function getCachedReply(text) {
  const key = normalizeText(text);

  const data = cache.get(key);

  if (!data) return null;

  if (Date.now() > data.expire) {
    cache.delete(key);
    return null;
  }

  return data.reply;
}

function saveCache(text, reply, ttl) {
  const key = normalizeText(text);

  cache.set(key, {
    reply,
    expire: Date.now() + ttl,
  });
}

// ======================================================
// COOLDOWN SYSTEM
// ======================================================

function isCooldown(userId) {
  const now = Date.now();

  const last = userCooldowns.get(userId);

  if (
    last &&
    now - last < CONFIG.USER_COOLDOWN_MS
  ) {
    return true;
  }

  userCooldowns.set(userId, now);

  return false;
}

// ======================================================
// SIMPLE COMPLEXITY DETECTION
// ======================================================

function shouldEscalate(text) {
  const complexPatterns = [
    /code/i,
    /debug/i,
    /javascript/i,
    /python/i,
    /html/i,
    /css/i,
    /react/i,
    /node/i,
    /api/i,
    /math/i,
    /physics/i,
    /algorithm/i,
    /database/i,
    /error/i,
    /fix/i,
    /why/i,
    /how/i,
    /explain/i,
  ];

  return (
    text.length > 120 ||
    complexPatterns.some((p) =>
      p.test(text)
    )
  );
}

// ======================================================
// RETRY SYSTEM
// ======================================================

async function generateWithRetry({
  model,
  payload,
  modelName,
}) {
  let delay = CONFIG.RETRY_DELAY;

  for (
    let attempt = 1;
    attempt <= CONFIG.MAX_RETRIES;
    attempt++
  ) {
    try {
      console.log(
        `🟡 ${modelName} attempt ${attempt}`
      );

      const result =
        await model.generateContent(payload);

      return result;
    } catch (error) {
      const msg =
        error.message?.toLowerCase() || "";

      console.log(
        `❌ ${modelName} failed:`,
        msg
      );

      const retryable =
        msg.includes("503") ||
        msg.includes("429") ||
        msg.includes("timeout") ||
        msg.includes("unavailable");

      if (
        !retryable ||
        attempt === CONFIG.MAX_RETRIES
      ) {
        throw error;
      }

      console.log(
        `🔄 Retrying in ${delay}ms`
      );

      await sleep(delay);

      delay *= 2;
    }
  }
}

// ======================================================
// FLASH-LITE ROUTER
// ======================================================

async function askLiteManager(userMessage) {
  const prompt = `
You are a lightweight AI assistant.

RULES:
1. If the question is simple:
- greetings
- casual chat
- easy questions
- short factual answers

Then answer directly.

2. If the question requires:
- coding
- debugging
- mathematics
- detailed explanation
- advanced reasoning

Reply ONLY:
ESCALATE

User:
"${userMessage}"
`;

  const result = await generateWithRetry({
    model: liteModel,
    modelName: "Flash-Lite",

    payload: {
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],

      generationConfig: {
        temperature: 0,
        maxOutputTokens: 300,
      },
    },
  });

  return result.response.text().trim();
}

// ======================================================
// FLASH MAIN MODEL
// ======================================================

async function askFlash(userMessage) {
  const result = await generateWithRetry({
    model: flashModel,
    modelName: "Flash",

    payload: {
      contents: [
        {
          role: "user",
          parts: [{ text: userMessage }],
        },
      ],

      systemInstruction: {
        parts: [
          {
            text:
              "You are a helpful, intelligent AI assistant. Reply clearly and naturally in the user's language.",
          },
        ],
      },

      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 700,
      },
    },
  });

  return result.response.text();
}

// ======================================================
// TELEGRAM COMMANDS
// ======================================================

bot.setMyCommands([
  {
    command: "start",
    description: "Start the bot",
  },
  {
    command: "help",
    description: "Show help",
  },
]);

// ======================================================
// MAIN MESSAGE HANDLER
// ======================================================

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text;

  if (!text) return;

  try {
    // ==========================================
    // BASIC COMMANDS
    // ==========================================

    if (text === "/start") {
      return safeSend(
        chatId,
        "👋 Welcome to Ultra Stable AI Bot!"
      );
    }

    if (text === "/help") {
      return safeSend(
        chatId,
        "🤖 Send any message and chat with AI."
      );
    }

    // ==========================================
    // LIMITS
    // ==========================================

    if (
      text.length >
      CONFIG.MAX_MESSAGE_LENGTH
    ) {
      return safeSend(
        chatId,
        "⚠️ Message too long."
      );
    }

    // ==========================================
    // COOLDOWN
    // ==========================================

    if (isCooldown(userId)) {
      return safeSend(
        chatId,
        "⏳ Please wait a few seconds."
      );
    }

    // ==========================================
    // CACHE CHECK
    // ==========================================

    const cached = getCachedReply(text);

    if (cached) {
      console.log("⚡ CACHE HIT");

      return safeSend(chatId, cached);
    }

    // ==========================================
    // TYPING STATUS
    // ==========================================

    bot
      .sendChatAction(chatId, "typing")
      .catch(() => {});

    // ==========================================
    // SMART ROUTING
    // ==========================================

    let liteReply;

    const forceFlash =
      shouldEscalate(text);

    if (!forceFlash) {
      try {
        liteReply =
          await askLiteManager(text);
      } catch {
        liteReply = "ESCALATE";
      }
    } else {
      liteReply = "ESCALATE";
    }

    // ==========================================
    // FLASH ESCALATION
    // ==========================================

    if (
      liteReply
        .toUpperCase()
        .includes("ESCALATE")
    ) {
      console.log(
        "🔴 Escalated to Flash"
      );

      try {
        const flashReply =
          await askFlash(text);

        const finalReply =
          CONFIG.DEBUG_MODEL_NAME
            ? `${flashReply}\n\n🤖 Model: Flash`
            : flashReply;

        saveCache(
          text,
          finalReply,
          CONFIG.CACHE_TTL_FLASH
        );

        return safeSend(
          chatId,
          finalReply
        );
      } catch (flashError) {
        console.log(
          "❌ Flash failed"
        );

        return safeSend(
          chatId,
          "⚠️ AI servers are busy right now. Please try again later."
        );
      }
    }

    // ==========================================
    // LITE RESPONSE
    // ==========================================

    console.log(
      "🟢 Answered by Lite"
    );

    const finalReply =
      CONFIG.DEBUG_MODEL_NAME
        ? `${liteReply}\n\n⚡ Model: Flash-Lite`
        : liteReply;

    saveCache(
      text,
      finalReply,
      CONFIG.CACHE_TTL_LITE
    );

    return safeSend(
      chatId,
      finalReply
    );
  } catch (error) {
    console.error(
      "❌ SYSTEM ERROR:",
      error.message
    );

    return safeSend(
      chatId,
      "⚠️ System busy. Try again later."
    );
  }
});

// ======================================================
// HEALTH CHECK SERVER
// ======================================================

const PORT =
  process.env.PORT || 3000;

http
  .createServer((req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/plain",
    });

    res.end("OK");
  })
  .listen(PORT, () => {
    console.log(
      `💚 Health server running on port ${PORT}`
    );
  });

// ======================================================
// STARTUP MESSAGE
// ======================================================

console.log(
  "🤖 Ultra Stable AI Bot Running..."
);