const express = require("express");
const TelegramBot = require("node-telegram-bot-api");

const app = express();

// чтобы сайт мог отправлять
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  next();
});

const token = process.env.BOT_TOKEN;
const adminId = process.env.ADMIN_CHAT_ID;

const bot = new TelegramBot(token, { polling: true });

console.log("SERVER + BOT STARTED");

// показать ID
bot.onText(/\/id/, (msg) => {
  bot.sendMessage(msg.chat.id, "Твой ID: " + msg.chat.id);
});

// тест
bot.onText(/\/test/, (msg) => {
  const id = Date.now();

  bot.sendMessage(adminId, "🆕 Тест заявка ID: " + id, {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "🚫 Бан", callback_data: "ban_" + id },
          { text: "✅ Разбан", callback_data: "unban_" + id }
        ],
        [
          { text: "➡️ Разрешить", callback_data: "allow_" + id }
        ]
      ]
    }
  });
});

// кнопки
bot.on("callback_query", (q) => {
  bot.answerCallbackQuery(q.id, { text: "нажал: " + q.data });
});

// ПРИЕМ С САЙТА
app.post("/send", (req, res) => {
  console.log("ПРИШЛО:", req.body);

  const id = Date.now();

  bot.sendMessage(
    adminId,
    "🆕 ЗАЯВКА ID: " + id + "\n\n" + JSON.stringify(req.body, null, 2),
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🚫 Бан", callback_data: "ban_" + id },
            { text: "✅ Разбан", callback_data: "unban_" + id }
          ],
          [
            { text: "➡️ Разрешить", callback_data: "allow_" + id }
          ]
        ]
      }
    }
  );

  res.json({ ok: true });
});

// проверка
app.get("/", (req, res) => {
  res.send("ok");
});

app.listen(process.env.PORT || 3000, () => {
  console.log("SERVER WORKING");
});
