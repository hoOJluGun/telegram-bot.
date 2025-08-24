function delay(ms){ return new Promise(r=>setTimeout(r, ms)); }
const DEFAULT_INTERVAL = 4500;

async function withTyping(ctx, fn, { action="typing", intervalMs=DEFAULT_INTERVAL } = {}){
  let active = true;
  (async function loop(){ try{ while(active){ await ctx.sendChatAction(action); await delay(intervalMs); } } catch(_){} })();
  try { return await fn(); } finally { active = false; }
}

async function runWithProgress(ctx, steps = [], { render } = {}){
  const total = steps.length || 1;
  for (let i=0;i<steps.length;i++){
    const pct = Math.round((i/total)*100);
    const text = render ? render({i,total,pct}) : `⏳ Обработка: ${pct}%`;
    await ctx.app.ui.show(ctx, text);
    const step = steps[i];
    if (typeof step === "number") await delay(step);
    else if (typeof step === "function") await step();
    else await delay(250);
  }
  await ctx.app.ui.show(ctx, "✅ Готово (100%)");
}

async function sendDice(ctx, emoji="🎲"){ return ctx.replyWithDice({ emoji }); }
function escapeMdV2(s=""){ return s.replace(/[_*[\]()~`>#+-=|{}.!]/g, "\\$&"); }

module.exports = { delay, withTyping, runWithProgress, sendDice, escapeMdV2 };
