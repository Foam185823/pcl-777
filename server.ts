import { serveDir } from "https://deno.land/std@0.224.0/http/file_server.ts";

let kv = null;
try {
  kv = await Deno.openKv();
  console.log("KV 已打开");
} catch (e) {
  console.error("KV 打开失败:", e);
}

async function initKV() {
  if (!kv) return;
  try {
    const owner = await kv.get(["user", "owner"]);
    if (!owner.value) {
      const OWNER_QQ = Deno.env.get("OWNER_QQ") || "";
      const OWNER_PWD = Deno.env.get("OWNER_PWD") || "";
      console.log("初始化 KV, QQ=", OWNER_QQ, "PWD长度=", OWNER_PWD.length);
      await kv.set(["user", "owner"], {
        qq: OWNER_QQ,
        password: OWNER_PWD,
        name: "快乐的小宝",
      });
    } else {
      console.log("KV 已有数据, QQ=", owner.value.qq);
    }
  } catch (e) {
    console.error("initKV 失败:", e);
  }
}
await initKV();

function jsonResp(data, cors, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: cors });
  }

  if (url.pathname === "/api/login" && req.method === "POST") {
    try {
      if (!kv) {
        return jsonResp({ success: false, message: "KV 未初始化" }, cors, 500);
      }

      const rawText = await req.text();
      let parsed;
      try {
        parsed = JSON.parse(rawText);
      } catch {
        return jsonResp({ success: false, message: "请求体不是合法 JSON" }, cors, 400);
      }

      const qq = parsed.qq;
      const password = parsed.password;

      const owner = await kv.get(["user", "owner"]);
      if (!owner.value) {
        return jsonResp({ success: false, message: "KV 中无用户数据，请重启应用" }, cors, 500);
      }

      console.log("登录尝试: 输入QQ=", qq, " KV中QQ=", owner.value.qq);
      console.log("输入密码长度=", (password || "").length, " KV密码长度=", (owner.value.password || "").length);

      if (owner.value.qq === qq && owner.value.password === password) {
        const user = { qq: owner.value.qq, name: owner.value.name, isOwner: true };
        const token = btoa(JSON.stringify(user) + "::" + Date.now());
        return jsonResp({ success: true, user, token }, cors);
      }

      return jsonResp({
        success: false,
        message: "账号或密码错误（KV中QQ=" + owner.value.qq + "）"
      }, cors);
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      console.error("登录异常:", msg);
      return jsonResp({ success: false, message: "服务器异常: " + msg }, cors, 500);
    }
  }

  if (url.pathname === "/api/rename" && req.method === "POST") {
    try {
      if (!kv) return jsonResp({ success: false, message: "KV 未初始化" }, cors, 500);
      const { qq, password, newName } = await req.json();
      const owner = await kv.get(["user", "owner"]);
      if (!owner.value || owner.value.qq !== qq || owner.value.password !== password) {
        return jsonResp({ success: false, message: "密码错误" }, cors);
      }
      if (!newName || String(newName).trim().length === 0) {
        return jsonResp({ success: false, message: "名字不能为空" }, cors);
      }
      if (String(newName).length > 20) {
        return jsonResp({ success: false, message: "名字不能超过 20 个字" }, cors);
      }
      const updated = { ...owner.value, name: String(newName).trim() };
      await kv.set(["user", "owner"], updated);
      const user = { qq: updated.qq, name: updated.name, isOwner: true };
      const token = btoa(JSON.stringify(user) + "::" + Date.now());
      return jsonResp({ success: true, user, token, message: "名字已更新" }, cors);
    } catch (e) {
      return jsonResp({ success: false, message: "异常: " + (e && e.message || String(e)) }, cors, 500);
    }
  }

  if (url.pathname === "/api/password" && req.method === "POST") {
    try {
      if (!kv) return jsonResp({ success: false, message: "KV 未初始化" }, cors, 500);
      const { qq, oldPassword, newPassword } = await req.json();
      const owner = await kv.get(["user", "owner"]);
      if (!owner.value || owner.value.qq !== qq || owner.value.password !== oldPassword) {
        return jsonResp({ success: false, message: "旧密码错误" }, cors);
      }
      if (!newPassword || String(newPassword).length < 6) {
        return jsonResp({ success: false, message: "新密码至少 6 位" }, cors);
      }
      if (/[\u4e00-\u9fa5]/.test(String(newPassword))) {
        return jsonResp({ success: false, message: "密码不能包含中文" }, cors);
      }
      if (String(newPassword) === owner.value.password) {
        return jsonResp({ success: false, message: "新密码不能和旧密码一样" }, cors);
      }
      const updated = { ...owner.value, password: String(newPassword) };
      await kv.set(["user", "owner"], updated);
      return jsonResp({ success: true, message: "密码已修改成功" }, cors);
    } catch (e) {
      return jsonResp({ success: false, message: "异常: " + (e && e.message || String(e)) }, cors, 500);
    }
  }

  const res = await serveDir(req, {
    fsRoot: ".",
    showDirListing: false,
    quiet: true,
  });

  const path = url.pathname.toLowerCase();
  const newHeaders = new Headers(res.headers);

  if (/\.(mp4|webm|mp3|wav|png|jpg|jpeg|gif|webp|svg|ico|woff|woff2)$/i.test(path)) {
    newHeaders.set("Cache-Control", "public, max-age=604800, immutable");
  } else if (/\.(html|htm)$/i.test(path) || path === "/") {
    newHeaders.set("Cache-Control", "no-cache");
  } else {
    newHeaders.set("Cache-Control", "public, max-age=86400");
  }

  return new Response(res.body, {
    status: res.status,
    headers: newHeaders,
  });
});
