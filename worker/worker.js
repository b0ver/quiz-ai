const ALLOWED = ["CLA","GPT","YA","GIGA","KIMI","DS","GROK","GEM"];
const ORIGIN = "*"; // на проде сузить до origin GitHub Pages

function cors(resp) {
  resp.headers.set("Access-Control-Allow-Origin", ORIGIN);
  resp.headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  resp.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return resp;
}

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return cors(new Response(null, { status: 204 }));
    const url = new URL(req.url);

    if (req.method === "POST" && url.pathname === "/vote") {
      let body;
      try { body = await req.json(); } catch { return cors(new Response("bad json", { status: 400 })); }
      const type = body && body.type;
      if (!ALLOWED.includes(type)) return cors(new Response("bad type", { status: 400 }));
      const cur = parseInt((await env.QUIZ_STATS.get("votes:" + type)) || "0", 10) + 1;
      const tot = parseInt((await env.QUIZ_STATS.get("votes:total")) || "0", 10) + 1;
      await env.QUIZ_STATS.put("votes:" + type, String(cur));
      await env.QUIZ_STATS.put("votes:total", String(tot));
      return cors(new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } }));
    }

    if (req.method === "GET" && url.pathname === "/stats") {
      const counts = {};
      for (const t of ALLOWED) counts[t] = parseInt((await env.QUIZ_STATS.get("votes:" + t)) || "0", 10);
      const total = parseInt((await env.QUIZ_STATS.get("votes:total")) || "0", 10);
      return cors(new Response(JSON.stringify({ counts, total }), { headers: { "Content-Type": "application/json" } }));
    }

    return cors(new Response("not found", { status: 404 }));
  }
};
