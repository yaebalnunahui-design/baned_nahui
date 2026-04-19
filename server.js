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
const workerBot = new TelegramBot(process.env.WORKER_BOT_TOKEN, { polling: true });

// ===== ENV =====
const adminId = Number(process.env.ADMIN_CHAT_ID);
const workerChat = Number(process.env.WORKER_CHAT_ID);

// ===== РЕФЕРАЛЫ =====
let refUsers = {}; // { code: { username, tgId } }

// ===== БАЗЫ =====
let takenRequests = {};
let requestTexts = {};

// ===== РЕГИСТРАЦИЯ РЕФЕРАЛА =====
mainBot.onText(/\/start (.+)/, (msg, match) => {
  const code = match[1];

  const username = msg.from.username
    ? "@" + msg.from.username
    : msg.from.first_name;

  refUsers[code] = {
    username,
    tgId: msg.from.id
  };

  mainBot.sendMessage(msg.chat.id, `✅ Ты привязан к коду: ${code}`);
});

// ===== ЗАЯВКА =====
app.post("/send", (req, res) => {
  const d = req.body;
  const id = d.clientId;

  if (!id) return res.json({ ok: false });

  // 🔥 реферал
  const refCode = d.ref || null;
  const refUser = refUsers[refCode];

  const refText = refUser
    ? `👥 Реферал: ${refUser.username}`
    : `👥 Реферал: неизвестно`;

  const text = `🆕 НОВАЯ ЗАЯВКА

🆔 ID: ${id}

${refText}

📦 ${d.service}
👤 ${d.name}
📞 ${d.phone}
📧 ${d.email}
🏙 ${d.city}
💬 ${d.comment}`;

  requestTexts[id] = text;

  mainBot.sendMessage(adminId, text);

  workerBot.sendMessage(workerChat, text, {
    reply_markup: {
      inline_keyboard: [
        [{ text: "📥 Забрать", callback_data: "take_" + id }]
      ]
    }
  });

  res.json({ ok: true, id });
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

    takenRequests[id] = user;

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

    workerBot.answerCallbackQuery(q.id);
  }

  if (data.startsWith("free")) {
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

    workerBot.answerCallbackQuery(q.id);
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log("SERVER OK");
});
