const express = require("express");
const TelegramBot = require("node-telegram-bot-api");

const app = express();
app.use(express.json());

const token = process.env.BOT_TOKEN;

const bot = new TelegramBot(token, { polling: true });

console.log("BOT + SERVER STARTED");

// проверка сервера
app.get("/", (req, res) => {
  res.send("ok");
});

// тест кнопок
bot.onText(/\/test/, (msg) => {
  bot.sendMessage(msg.chat.id, "🆕 Заявка №123", {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "🚫 Бан", callback_data: "ban_123" },
          { text: "✅ Разбан", callback_data: "unban_123" }
        ],
        [
          { text: "➡️ Разрешить", callback_data: "allow_123" }
        ]
      ]
    }
  });
});

// обработка кнопок
bot.on("callback_query", (q) => {
  console.log("CLICK:", q.data);

  bot.answerCallbackQuery(q.id, {
    text: "нажал: " + q.data
  });
});

// обычные сообщения
bot.on("message", (msg) => {
  if (msg.text !== "/test") {
    bot.sendMessage(msg.chat.id, "бот работает ✅");
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Server started");
});
