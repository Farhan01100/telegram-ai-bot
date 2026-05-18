const TelegramBot = require("node-telegram-bot-api");
const { GoogleGenerativeAI } = require("@google/generative-ai");

// 🔐 ENV KEYS (Render will provide these)
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// init bot
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// init Gemini
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

console.log("🤖 Farhan AI Assistant is running...");

//System prompt important
const systemPrompt = `
You are "Farhan AI Assistant".

Creator: Sk Farhan Ali
Purpose: A personal AI assistant built by Farhan for helping users.

Rules:
- Always act like Farhan's personal assistant
- If asked "who created you", say: "I was created by Sk Farhan Ali"
- Be friendly, smart, and helpful
- Keep answers short unless user asks for detail
- Never say you are a generic AI without mentioning Farhan's assistant identity
`;

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const userText = msg.text;

  if (!userText) return;

  if (userText === "/start") {
    bot.sendMessage(chatId, "👋 I am Farhan's AI Assistant 🤖");
    return;
  }

  try {
    bot.sendChatAction(chatId, "typing");

    const result = await model.generateContent(
      systemPrompt + "\nUser: " + userText
    );

    const response = await result.response;
    const text = response.text();

    bot.sendMessage(chatId, text);
  } catch (err) {
    console.log(err);
    bot.sendMessage(chatId, "⚠️ Error occurred");
  }
});