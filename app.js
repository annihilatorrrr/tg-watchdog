const { Telegraf } = require('telegraf')
const Koa = require('koa')
const koaBody = require('koa-body')
const safeCompare = require('safe-compare')
const router = require('koa-router')()

const func = require('./func')

// Bots
const token = process.env.BOT_TOKEN
if (token === undefined) {
  throw new Error('BOT_TOKEN must be provided!')
}
const bot = new Telegraf(token)
const secretPath = `/${process.env.SECRET}`
bot.telegram.setWebhook(`https://${process.env.DOMAIN}/${process.env.SECRET}`)

bot.start((ctx) => ctx.reply(`你好，我是私有群看门狗！🐶\n我可以帮助私有群（Private group）对新成员进行人机验证，保证广告加不进来哒。\n访问 https://github.com/Astrian/tg-watchdog 了解更多，或是点击 https://t.me/+rOpjXs3hYaEwY2U1 尝试入群以体验看门狗。`))
bot.on('chat_join_request', async ctx => {
  try {
    ctx.telegram.sendMessage(
      ctx.from.id,
      `你好，我是群组 ${ctx.chat.title} 的看门狗 🐶！\n你需要完成人机验证才能入群。点击以下链接，到浏览器完成验证。`,
      {
        reply_markup: {
          inline_keyboard: [[{
            text: `开始验证`,
            login_url: {
              url: `${process.env.FRONTEND_ADDRESS}/?chat_id=${ctx.chat.id}`,
              request_write_access: true
            }
          }]]
        }
      }
    )
  } catch (e) {
    await ctx.reply('Something has gone wrong!!')
  }
})
bot.command('chatid', async ctx => {
  ctx.reply(`本会话的 ID：${ctx.chat.id}`)
})


// Website & API
const app = new Koa()
app.use(koaBody())
app.use(async (ctx, next) => {
  ctx.set("Access-Control-Allow-Origin", process.env.FRONTEND_ADDRESS)
  ctx.set("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
  ctx.set("Access-Control-Allow-Headers", "Content-Type")
  await next()
})

router.get('/', async ctx => {
  ctx.response.body = JSON.stringify({
    hello: "world"
  })
})
router.post('/verify-captcha', async ctx => {
  try {
    func.verify_login(ctx.request.body.tglogin)
    const token = ctx.request.body.token
    await func.verify_captcha(token)
    ctx.response.status = 204
    bot.telegram.approveChatJoinRequest(ctx.request.body.chat_id, ctx.request.body.tglogin.id)
  } catch (e) {
    console.log(e)
    const err = JSON.parse(e.message)
    ctx.response.status = err.code || 500
    ctx.response.body = { message: err.message || "服务器错误" }
  }
})
router.options('/verify-captcha', async ctx => {
  ctx.response.status = 204
  ctx.response
})

// Koa config
app.use(router.routes())
app.use(async (ctx, next) => {
  if (safeCompare(secretPath, ctx.url)) {
    await bot.handleUpdate(ctx.request.body)
    ctx.status = 204
    return
  }
  return next()
})
app.listen(process.env.PORT)