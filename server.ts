import { serveDir } from "https://deno.land/std@0.224.0/http/file_server.ts";

Deno.serve(async (req) => {
  const url = new URL(req.url);

  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: cors });
  }

  // 登录 API
  if (url.pathname === '/api/login' && req.method === 'POST') {
    try {
      const { qq, password } = await req.json();
      const OWNER_QQ = Deno.env.get('OWNER_QQ');
      const OWNER_PWD = Deno.env.get('OWNER_PWD');
      const GUEST_QQ = Deno.env.get('GUEST_QQ');
      const GUEST_PWD = Deno.env.get('GUEST_PWD');

      let user = null;

      if (qq === OWNER_QQ && password === OWNER_PWD) {
        user = { qq: OWNER_QQ, name: '快乐的小宝', isOwner: true };
      } else if (GUEST_QQ && qq === GUEST_QQ && password === GUEST_PWD) {
        user = { qq: GUEST_QQ, name: '用户1', isOwner: false };
      }

      if (user) {
        const token = btoa(JSON.stringify(user) + '::' + Date.now());
        return new Response(JSON.stringify({ success: true, user, token }), {
          headers: { 'Content-Type': 'application/json', ...cors }
        });
      }
      return new Response(JSON.stringify({ success: false, message: '账号或密码错误' }), {
        headers: { 'Content-Type': 'application/json', ...cors }
      });
    } catch {
      return new Response(JSON.stringify({ success: false, message: '格式错误' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...cors }
      });
    }
  }

  // 其他所有请求 → 返回静态文件（index.html、图片、视频等）
  return serveDir(req, {
    fsRoot: '.',
    showDirListing: false,
    quiet: true,
  });
});