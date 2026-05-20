// ======================================================
// TANU AI — ULTRA STABLE TELEGRAM AI BOT
// Friendly Bengali + English AI Assistant
// Created by Sk Farhan Ali
// ======================================================

import 'dotenv/config';
import TelegramBot from "node-telegram-bot-api";
import { GoogleGenerativeAI } from "@google/generative-ai";
import http from "http";

// ======================================================
// ENVIRONMENT VARIABLES
// ======================================================

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const PORT = process.env.PORT || 3000;

if (!TELEGRAM_TOKEN || !GEMINI_API_KEY) {
  console.error("❌ Missing TELEGRAM_TOKEN or GEMINI_API_KEY");
  process.exit(1);
}

// ======================================================
// BOT + GEMINI
// ======================================================

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

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
  MAX_RETRIES: 3,
  RETRY_DELAY: 2000,
  MAX_HISTORY: 10,
};

// ======================================================
// STORAGE
// ======================================================

const conversations = new Map();

// ======================================================
// HELPERS
// ======================================================

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ======================================================
// MEMORY
// ======================================================

function getConversation(chatId) {
  if (!conversations.has(chatId)) conversations.set(chatId, []);
  return conversations.get(chatId);
}

function addConversation(chatId, role, text) {
  const history = getConversation(chatId);
  history.push({ role, parts: [{ text }] });

  if (history.length > CONFIG.MAX_HISTORY) {
    history.shift();
  }

  conversations.set(chatId, history);
}

// ======================================================
// CLEAN TEXT
// ======================================================

function cleanText(text) {
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

// ======================================================
// COUNTDOWN SYSTEM (REAL)
// ======================================================

async function startCountdown(bot, chatId, seconds) {
  const msg = await bot.sendMessage(
    chatId,
    `⚡ Processing your request...\n\n⏳ Server response in ${seconds}s`
  );

  for (let i = seconds; i >= 1; i--) {
    await sleep(1000);

    await bot.editMessageText(
      `⚡ Processing your request...\n\n⏳ Server response in ${i}s`,
      {
        chat_id: chatId,
        message_id: msg.message_id
      }
    ).catch(() => {});
  }

  return msg.message_id;
}

// ======================================================
// GEMINI CALLS
// ======================================================

async function askLite(chatId, text) {
  const history = getConversation(chatId);

  const result = await liteModel.generateContent({
    contents: [...history, { role: "user", parts: [{ text }] }]
  });

  return result.response.text();
}

async function askFlash(chatId, text) {
  const history = getConversation(chatId);

  const result = await flashModel.generateContent({
    contents: [...history, { role: "user", parts: [{ text }] }]
  });

  return result.response.text();
}

// ======================================================
// SAFE SEND
// ======================================================

async function safeSend(chatId, text) {
  const clean = cleanText(text);

  if (clean.length <= 4000) {
    return bot.sendMessage(chatId, clean);
  }

  const parts = clean.match(/[\s\S]{1,4000}/g);

  for (const p of parts) {
    await bot.sendMessage(chatId, p);
  }
}

// ======================================================
// MAIN HANDLER
// ======================================================

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!text) return;

  try {
    if (text.length > CONFIG.MAX_MESSAGE_LENGTH) {
      return safeSend(chatId, "⚠️ Message too long.");
    }

    // IMPORTANT FIX: store user message
    addConversation(chatId, "user", text);

    // Simple routing (keep it lightweight)
    const isComplex =
      text.includes("code") ||
      text.includes("why") ||
      text.includes("?") ||
      text.length > 30;

    let reply;

    if (isComplex) {
      // ======================================================
      // ESCALATE MODE → COUNTDOWN ENABLED
      // ======================================================

      await startCountdown(bot, chatId, 50);

      reply = await askFlash(chatId, text);

    } else {
      // ======================================================
      // SIMPLE MODE → NO COUNTDOWN (fast)
      // ======================================================

      reply = await askLite(chatId, text);
    }

    addConversation(chatId, "model", reply);

    return safeSend(chatId, reply);

  } catch (err) {
    console.error(err);
    return safeSend(chatId, "⚠️ Error occurred. Try again.");
  }
});

// ======================================================
// SERVER
// ======================================================

http.createServer((req, res) => {
  res.end("Tanu AI running");
}).listen(PORT);

console.log("🚀 Tanu AI bot started");