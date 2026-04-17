const express = require("express");
const TelegramBot = require("node-telegram-bot-api");

const app = express();

const token = process.env.BOT_TOKEN;

const bot = new TelegramBot(token, { polling: true });

console.log("STARTED");

// ответ на сообщения
bot.on("message", (msg) => {
if (msg.text === "/test") {
bot.sendMessage(msg.chat.id, "🆕 Заявка №" + Date.now(), {
reply_markup: {
inline_keyboard: [
[
{ text: "🚫 Бан", callback_data: "ban_" + msg.chat.id },
{ text: "✅ Разбан", callback_data: "unban_" + msg.chat.id }
],
[
{ text: "➡️ СМС/КОД", callback_data: "allow_" + msg.chat.id }
]
]
}
});
} else {
bot.sendMessage(msg.chat.id, "бот работает ✅");
}
});

// обработка кнопок
bot.on("callback_query", (q) => {
console.log("CLICK:", q.data);

let text = "";

if (q.data.startsWith("ban")) text = "🚫 пользователь забанен";
if (q.data.startsWith("unban")) text = "✅ пользователь разбанен";
if (q.data.startsWith("allow")) text = "➡️ СМС/КОД";

bot.answerCallbackQuery(q.id, { text });
});

// сервер
app.get("/", (req, res) => {
res.send("ok");
});

app.listen(process.env.PORT || 3000, () => {
console.log("SERVER WORKING");
});
