import { serveDir } from "https://deno.land/std@0.224.0/http/file_server.ts";

const kv = await Deno.openKv();

function safeBtoa(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin);
}

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

const DOWNLOAD_LINKS = {
  "1": "https://ts.buzzheavier.com/d/fgcgegjzwb7l?v=jtyg7mrBHauwbjAikYEcZ_Kk3M-yPY4J8D1Aqr4wU5nwokc7L91kLk8s7DoQCyHjWYAHIRzvo_xgM8dJBDUsinsNKSf9lKAQl_Q9iCoPkglBxwX2iXWDiRL2LS3Ak_6EclryZiOxYM8887jkLG65Fo7HXAoDpK1zwON4EWSDelqhGz9Y9t2JC45LVX3iYGPEMB96iuTaPc7DirQQo_S-gQLFyr6FJu2ZgvEo-b8bJUqdQ8o",
  "2": "https://ts.buzzheavier.com/d/n2a2oq4on9s4?v=qN-j-c7ujAatgxrkPCGyHFHB1ZDpKKMTNZefkDSZA4ZmsK2WFPzdaktwbAma67w7QgBYBv27l38z1AXfZz-kRNIV30XMZvjmCbvWir6bgZhkkvbutXgWYh9aMma0RvbtBo8P1FWnOLMuoypCMBuaB2FTFMJaxr3k3CR1XUlu-a1Nywfn_oU0aNLGl9pYOvM5IKiZG1XQtsJ8Z5JTKvMxpLteeMgEeJtMCuKeKeYhzJa5EZjkY1mRsdaomQT4w7BhDLSXi5NbDYGH1YjCLg"
};

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
      const { qq, password } = await req.json();
      const owner = await kv.get(["user", "owner"]);

      if (owner.value && owner.value.qq === qq && owner.value.password === password) {
        const user = { qq: owner.value.qq, name: owner.value.name, isOwner: true };
        const token = safeBtoa(JSON.stringify(user) + "::" + Date.now());
        return jsonResp({ success: true, user, token }, cors);
      }

      const GUEST_QQ = Deno.env.get("GUEST_QQ");
      const GUEST_PWD = Deno.env.get("GUEST_PWD");
      if (GUEST_QQ && qq === GUEST_QQ && password === GUEST_PWD) {
        const user = { qq: GUEST_QQ, name: "用户1", isOwner: false };
        const token = safeBtoa(JSON.stringify(user) + "::" + Date.now());
        return jsonResp({ success: true, user, token }, cors);
      }

      return jsonResp({ success: false, message: "账号或密码错误" }, cors);
    } catch (e) {
      return jsonResp({ success: false, message: "服务器异常: " + (e && e.message || String(e)) }, cors, 500);
    }
  }

  if (url.pathname === "/api/rename" && req.method === "POST") {
    try {
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
      const token = safeBtoa(JSON.stringify(user) + "::" + Date.now());
      return jsonResp({ success: true, user, token, message: "名字已更新" }, cors);
    } catch (e) {
      return jsonResp({ success: false, message: "服务器异常: " + (e && e.message || String(e)) }, cors, 500);
    }
  }

  if (url.pathname === "/api/password" && req.method === "POST") {
    try {
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
      return jsonResp({ success: false, message: "服务器异常: " + (e && e.message || String(e)) }, cors, 500);
    }
  }

  if (url.pathname === "/api/download" && req.method === "POST") {
    try {
      const { id, token } = await req.json();
      if (!token) {
        return jsonResp({ success: false, message: "未登录，无法下载" }, cors, 401);
      }
      const link = DOWNLOAD_LINKS[String(id)];
      if (!link) {
        return jsonResp({ success: false, message: "未找到该项目的下载链接" }, cors, 404);
      }
      return jsonResp({ success: true, url: link }, cors);
    } catch (e) {
      return jsonResp({ success: false, message: "服务器异常: " + (e && e.message || String(e)) }, cors, 500);
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
