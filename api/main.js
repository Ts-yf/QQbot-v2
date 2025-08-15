import { createServer } from "http";
import express from 'express';
import serverless from 'serverless-http';
import { sign } from "tweetnacl";
import axios from "axios";


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
  let appid = req.headers["x-bot-appid"];
  if (typeof data != 'object') { 
    try { data = JSON.parse(data) } catch (err) { return log('解析webhook消息错误', err) } 
  }
  if (data?.d?.hasOwnProperty("plain_token")) {
    log(`[${secret.slice(0, 3)}***]回调配置消息：${JSON.stringify(data)}`);
    return makeWebHookSign(req, secret);
  }
  await req.res.sendStatus(200);
  await makeMsg(data, secret, appid);
  return;
}
async function sendmsg(msg, secret, appid, req_data){
  let get_token_url = "https://bots.qq.com/app/getAppAccessToken";
  let body = { clientSecret: secret, appId: appid };
  let { data } = await axios.post(get_token_url, body);
  log(100, req_data, 123, body, 456, data);
  let access_token = data.access_token;
  let group_id = req_data?.d?.group_id || req_data?.d?.group_openid;
  let user_id = req_data?.d?.author?.id || req_data?.d?.group_member_openid || req_data?.d?.user_openid || req_data?.d?.openid;
  let baseURL = "https://api.sgroup.qq.com/v2";
  let send_msg_url = (!group_id) ? `${baseURL}/users/${user_id}/message` : `${baseURL}/groups/${group_id}/message`;
  log(111, send_msg_url);
  let payload = { msg_type: 0, msg_seq: 1, content: msg, msg_id: req_data?.d?.id };
  log(222, payload);
  let { data: result } = await axios.post(send_msg_url, payload, { headers: { Authorization: `QQBot ${access_token}` } });
  log(333, result);
  return result;
}

async function makeMsg(data, secret, appid) {
  let id = data.id;
  let op = data.op;
  let d = data.d;
  let t = data.t;
  switch (op) {
    case 0:
      switch (t) {
        case 'GROUP_AT_MESSAGE_CREATE':
          await sendmsg('机器人服务未连接到服务器（error：1）', secret, appid, data);
          return log(`[${secret.slice(0, 3)}***][群消息]：${d.content}`);
        case 'C2C_MESSAGE_CREATE':
          await sendmsg('机器人服务未连接到服务器（error：2）', secret, appid, data);
          return log(`[${secret.slice(0, 3)}***][私聊消息]：${d.content}`);
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