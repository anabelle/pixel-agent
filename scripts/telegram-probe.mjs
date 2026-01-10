import https from "node:https";

function callTelegram(method, token) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.telegram.org",
        method: "GET",
        path: `/bot${token}/${method}`,
        timeout: 15_000,
      },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch (e) {
            resolve({ status: res.statusCode, body: data });
          }
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy(new Error("timeout"));
    });
    req.end();
  });
}

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error("TELEGRAM_BOT_TOKEN is not set");
    process.exitCode = 2;
    return;
  }

  const methods = ["getMe", "getWebhookInfo"];
  for (const method of methods) {
    try {
      const res = await callTelegram(method, token);
      console.log(`${method}:`, JSON.stringify(res, null, 2));
    } catch (e) {
      console.error(`${method} failed:`, e?.message || e);
      process.exitCode = 1;
    }
  }
}

await main();
