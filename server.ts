import { serveDir } from "https://deno.land/std@0.224.0/http/file_server.ts";

const kv = await Deno.openKv();

// 初始化：第一次启动时把环境变量里的密码写进 KV
async function initKV() {
  const owner = await kv.get(["user", "owner"]);
  if (!owner.value) {
    const OWNER_QQ = Deno.env.get("OWNER_QQ") || "";
    const OWNER_PWD = Deno.env.get("OWNER_PWD") || "";
    await kv.set(["user", "owner"], {
      qq: OWNER_QQ,
      password: OWNER_PWD,
      name: "快乐的小宝",
    });
  }
}
await initKV();

function jsonResp(data: unknown, cors: Record<string, string>, status = 200) {
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

  // ============ 登录 ============
  if (url.pathname === "/api/login" && req.method === "POST") {
    try {
      const { qq, password } = await req.json();
      const owner = await kv.get<{ qq: string; password: string; name: string }>(["user", "owner"]);

      if (owner.value && owner.value.qq === qq && owner.value.password === password) {
        const user = { qq: owner.value.qq, name: owner.value.name, isOwner: true };
        const token = btoa(JSON.stringify(user) + "::" + Date.now());
        return jsonResp({ success: true, user, token }, cors);
      }

      const GUEST_QQ = Deno.env.get("GUEST_QQ");
      const GUEST_PWD = Deno.env.get("GUEST_PWD");
      if (GUEST_QQ && qq === GUEST_QQ && password === GUEST_PWD) {
        const user = { qq: GUEST_QQ, name: "用户1", isOwner: false };
        const token = btoa(JSON.stringify(user) + "::" + Date.now());
        return jsonResp({ success: true, user, token }, cors);
      }

      return jsonResp({ success: false, message: "账号或密码错误" }, cors);
    } catch {
      return jsonResp({ success: false, message: "格式错误" }, cors, 400);
    }
  }

  // ============ 改名字（先验证密码） ============
  if (url.pathname === "/api/rename" && req.method === "POST") {
    try {
      const { qq, password, newName } = await req.json();
      const owner = await kv.get<{ qq: string; password: string; name: string }>(["user", "owner"]);

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
    } catch {
      return jsonResp({ success: false, message: "格式错误" }, cors, 400);
    }
  }

  // ============ 改密码（先验证旧密码） ============
  if (url.pathname === "/api/password" && req.method === "POST") {
    try {
      const { qq, oldPassword, newPassword } = await req.json();
      const owner = await kv.get<{ qq: string; password: string; name: string }>(["user", "owner"]);

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
    } catch {
      return jsonResp({ success: false, message: "格式错误" }, cors, 400);
    }
  }

  // 其他请求 → 静态文件
  return serveDir(req, {
    fsRoot: ".",
    showDirListing: false,
    quiet: true,
  });
});