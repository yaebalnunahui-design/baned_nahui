const express = require("express");
const TelegramBot = require("node-telegram-bot-api");

const app = express();

// разрешаем запросы с сайта
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

// база (в памяти)
let bannedUsers = {};
let requests = {};

// получить свой ID
bot.onText(/\/id/, (msg) => {
  bot.sendMessage(msg.chat.id, "Твой ID: " + msg.chat.id);
});

// тест кнопок
bot.onText(/\/test/, (msg) => {
  const id = Date.now();

  requests[id] = "test";

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
  const data = q.data;
  const id = data.split("_")[1];

  const phone = requests[id];

  if (!phone) {
    return bot.answerCallbackQuery(q.id, { text: "нет данных" });
  }

  if (data.startsWith("ban")) {
    bannedUsers[phone] = true;
    bot.answerCallbackQuery(q.id, { text: "🚫 забанен " + phone });
  }

  if (data.startsWith("unban")) {
    delete bannedUsers[phone];
    bot.answerCallbackQuery(q.id, { text: "✅ разбан " + phone });
  }

  if (data.startsWith("allow")) {
    bot.answerCallbackQuery(q.id, { text: "➡️ разрешено" });
  }
});

// ПРИЕМ С САЙТА
app.post("/send", (req, res) => {
  const data = req.body;

  console.log("ПРИШЛО:", data);

  // проверка бана
  if (bannedUsers[data.phone]) {
    console.log("ЗАБЛОКИРОВАН:", data.phone);
    return res.json({ ok: false });
  }

  const id = Date.now();

  // сохраняем связь ID → телефон
  requests[id] = data.phone;

  bot.sendMessage(
    adminId,
    `🆕 ЗАЯВКА ID: ${id}

👤 Имя: ${data.name}
📞 Телефон: ${data.phone}`,
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
  ).catch(err => console.log("TG ERROR:", err.message));

  res.json({ ok: true });
});

// проверка сервера
app.get("/", (req, res) => {
  res.send("ok");
});

app.listen(process.env.PORT || 3000, () => {
  console.log("SERVER WORKING");
});
