// Проверка собранной функции (api/index.js) как на Vercel: DATABASE_URL=... node server/dev.mjs
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import handler from "../api/index.js";
createServer((req, res) => {
  if (req.url?.startsWith("/api")) {
    // имитация перезаписи vercel.json: /api/x → /api/index?__path=x
    const u = new URL(req.url, "http://x");
    const p = u.pathname.replace(/^\/api\/?/, "");
    u.searchParams.set("__path", p);
    req.url = "/api/index?" + u.searchParams.toString();
    return void handler(req, res);
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(readFileSync(new URL("../dist/index.html", import.meta.url)));
}).listen(Number(process.env.PORT ?? 3000), () => console.log("server mode on :" + (process.env.PORT ?? 3000)));
