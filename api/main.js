import { createServer } from "http";
import express from 'express';
import serverless from 'serverless-http';
const { sign } = (await import("tweetnacl")).default;

const app = express();
app.use(express.json());

// 错误处理中间件
app.use((err, req, res, next) => {
  log(`[ERROR] ${err.stack}`);
  res.status(500).send('Server Error');
});

// 全局错误捕获
process.on('unhandledRejection', (reason, promise) => {
  log('[UNHANDLED REJECTION]', reason);
});

process.on('uncaughtException', (err) => {
  log('[FATAL ERROR]', err.stack);
});

// 消息处理函数保持不变
async function makeWebHook(req, secret) {
  if (!secret) return req.res.send('secret参数为空');
  let data = req.body;
  if (typeof data != 'object') { 
    try { data = JSON.parse(data) } catch (err) { return log('解析webhook消息错误', err) } 
  }
  if (data?.d?.hasOwnProperty("plain_token")) {
    log(`[${secret.slice(0, 3)}***]回调配置消息：${JSON.stringify(data)}`);
    return makeWebHookSign(req, secret);
  }
  await makeMsg(data, secret);
  return req.res.sendStatus(200);
}

async function makeMsg(data, secret) {
  let id = data.id;
  let op = data.op;
  let d = data.d;
  let t = data.t;
  switch (op) {
    case 0:
      switch (t) {
        case 'GROUP_AT_MESSAGE_CREATE':
          return log(`[${secret.slice(0, 3)}***][群消息]：${d.content}`);
        default:
          return log(`[${secret.slice(0, 3)}***]收到消息类型：${t}`);
      }
    default:
      return log(`[${secret.slice(0, 3)}***]收到消息：${JSON.stringify(data)}`);
  }
}

function log(...data) {
  const now = new Date();
  const h = now.getHours();
  const m = now.getMinutes();
  const s = now.getSeconds();
  const ms = now.getMilliseconds();
  const time = `${h}:${m}:${s}:${ms}`;
  console.log(`[TS-Wh-To-Ws][${time}]`, ...data);
}

async function makeWebHookSign(req, secret) {
  const { plain_token, event_ts } = req.body.d;
  while (secret.length < 32)
    secret = secret.repeat(2).slice(0, 32);
  const signature = Buffer.from(sign.detached(
    Buffer.from(`${event_ts}${plain_token}`),
    sign.keyPair.fromSeed(Buffer.from(secret)).secretKey,
  )).toString("hex");
  log(`[${secret.slice(0, 3)}***]计算签名：${signature}`);
  req.res.send({ plain_token, signature });
}

// 路由
app.get('/', (req, res) => {
  return res.send(JSON.stringify({ status: 'ok' }));
});

app.post('/webhook', async (req, res) => {
  return await makeWebHook(req, req.query?.secret);
});

// 导出为Netlify函数
export const handler = serverless(app);

// 本地开发支持
if (process.env.NETLIFY_DEV) {
  const port = process.env.PORT || 3000;
  const server = createServer(app);
  server.listen(port, () => {
    log(`本地调试模式启动，端口号：${port}`);
  });
}