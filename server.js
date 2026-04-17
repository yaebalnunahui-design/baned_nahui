const express = require("express");
const TelegramBot = require("node-telegram-bot-api");

const app = express();

const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

console.log("STARTED");

// память
const users = {};
const banned = {};

// сообщение
bot.on("message", (msg) => {
  const userId = msg.chat.id;

  // блок если в бане
  if (banned[userId]) {
    return bot.sendMessage(userId, "🚫 доступ запрещён");
  }

  // админ панель
  if (msg.text === "/admin") {
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

    return bot.sendMessage(userId, "🔥 Новый Лог 👻 №" + requestId, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🚫 Бан", callback_data: "ban_" + requestId },
            { text: "✅ Разбан", callback_data: "unban_" + requestId }
          ],
          [
            { text: "➡️ СМС/КОД", callback_data: "allow_" + requestId }
          ]
        ]
      }
    });
  }

  bot.sendMessage(userId, "бот работает ✅");
});

// кнопки
bot.on("callback_query", (q) => {
  const data = q.data;
  const requestId = data.split("_")[1];
  const user = users[requestId];

  // заявки
  if (data.startsWith("ban")) {
    if (user) banned[user.userId] = true;
    return bot.answerCallbackQuery(q.id, { text: "🚫 забанен" });
  }

  if (data.startsWith("unban")) {
    if (user) banned[user.userId] = false;
    return bot.answerCallbackQuery(q.id, { text: "✅ разбанен" });
  }

  if (data.startsWith("allow")) {
    return bot.answerCallbackQuery(q.id, { text: "➡️ СМС/КОД" });
  }

  // админка
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

// сервер
app.get("/", (req, res) => {
  res.send("ok");
});

app.listen(process.env.PORT || 3000, () => {
  console.log("SERVER WORKING");
});
