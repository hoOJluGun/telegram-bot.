module.exports.register = async (bot) => {
  const { escapeMdV2 } = require("../utils/effects");
  bot.command("format_demo", async (ctx) => {
    const msg = "*жирный* и ||это спойлер||\n\\`\\`\\`js\nconsole.log(42)\n\\`\\`\\`\n" +
      escapeMdV2("Экранируем _ * [ ] ( ) ~ ` > # + - = | { } . !");
    await ctx.reply(msg, { parse_mode: "MarkdownV2", disable_notification: true, protect_content: true });
  });
};
