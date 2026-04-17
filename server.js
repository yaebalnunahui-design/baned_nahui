const express = require("express");
const TelegramBot = require("node-telegram-bot-api");

const app = express();

const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

console.log("STARTED");

// ===== РОЛИ =====
const ADMIN_ID = 8035773808; // <-- ТВОЙ ID СЮДА

const mods = [
  111111111, // <-- ID модеров
  222222222
];

// ===== ПАМЯТЬ =====
const users = {};
const banned = {};

// ===== СООБЩЕНИЯ =====
bot.on("message", (msg) => {
  const userId = msg.chat.id;

  // блок если забанен
  if (banned[userId]) {
    return bot.sendMessage(userId, "🚫 доступ запрещён");
  }

  // админ панель
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

  // тест заявка
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

// ===== КНОПКИ =====
bot.on("callback_query", (q) => {
  const data = q.data;
  const requestId = data.split("_")[1];

  const user = users[requestId];

  const isAdmin = q.from.id === ADMIN_ID;
  const isMod = mods.includes(q.from.id);

  // ===== БАН =====
  if (data.startsWith("ban")) {
    if (!isAdmin && !isMod) return;

    if (user) banned[user.userId] = true;
    return bot.answerCallbackQuery(q.id, { text: "🚫 забанен" });
  }

  // ===== РАЗБАН =====
  if (data.startsWith("unban")) {
    if (!isAdmin && !isMod) return;

    if (user) banned[user.userId] = false;
    return bot.answerCallbackQuery(q.id, { text: "✅ разбанен" });
  }

  // ===== ALLOW =====
  if (data.startsWith("allow")) {
    if (!isAdmin && !isMod) return;

    return bot.answerCallbackQuery(q.id, { text: "➡️ SMS/CODE" });
  }

  // ===== АДМИНКА =====
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
      `Заявки: ${Object.keys(users).length}\nБаны: ${Object.keys(banned).length}`
    );
  }

  bot.answerCallbackQuery(q.id);
});

// ===== СЕРВЕР =====
app.get("/", (req, res) => {
  res.send("ok");
});

app.listen(process.env.PORT || 3000, () => {
  console.log("SERVER WORKING");
});
