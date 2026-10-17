// Winter Arc API — Cloudflare Worker + D1
// Static app is served from /public, everything under /api/ is handled here.

const MAX_BODY = 256 * 1024;

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, PUT, POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-max-age": "86400",
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...CORS },
  });
const err = (status, error) => json({ error }, status);

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function newToken() {
  const a = new Uint8Array(24);
  crypto.getRandomValues(a);
  let s = "";
  for (const b of a) s += String.fromCharCode(b);
  return "wa_" + btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function readBody(req) {
  const text = await req.text();
  if (text.length > MAX_BODY) throw Object.assign(new Error("Zu groß"), { status: 413 });
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw Object.assign(new Error("Kein gültiges JSON"), { status: 400 });
  }
}

async function authed(req, env) {
  const m = (req.headers.get("authorization") || "").match(/^Bearer\s+(\S+)$/i);
  if (!m) return null;
  const hash = await sha256(m[1]);
  return env.DB.prepare("SELECT id, name FROM players WHERE token_hash = ?").bind(hash).first();
}

const cleanName = (n) => String(n || "").trim().slice(0, 24);

async function handleApi(req, env, path) {
  const method = req.method;
  if (method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  // Public: which slots exist and which are still free
  if (path === "/api/slots" && method === "GET") {
    const { results } = await env.DB.prepare("SELECT id, name, token_hash IS NOT NULL AS claimed FROM players ORDER BY rowid").all();
    return json({ slots: results.map((r) => ({ id: r.id, name: r.name, claimed: !!r.claimed })) });
  }

  // Public: claim a free slot once; returns the access token a single time
  if (path === "/api/claim" && method === "POST") {
    const body = await readBody(req);
    const slot = String(body.slot || "");
    const name = cleanName(body.name);
    if (!slot || !name) return err(400, "slot und name fehlen");
    const token = newToken();
    const res = await env.DB.prepare(
      "UPDATE players SET token_hash = ?, name = ?, claimed_at = ? WHERE id = ? AND token_hash IS NULL"
    ).bind(await sha256(token), name, new Date().toISOString(), slot).run();
    if (!res.meta.changes) return err(409, "Platz ist schon vergeben oder existiert nicht");
    return json({ id: slot, name, token });
  }

  const me = await authed(req, env);
  if (!me) return err(401, "Zugangscode fehlt oder ist ungültig");

  if (path === "/api/me" && method === "GET") return json(me);

  // Private state: stored encrypted by the client, the server never sees plain text
  if (path === "/api/state" && method === "GET") {
    const r = await env.DB.prepare("SELECT state_enc, state_updated, seed_json FROM players WHERE id = ?").bind(me.id).first();
    return json({
      enc: r.state_enc || null,
      updated: r.state_updated || null,
      seed: !r.state_enc && r.seed_json ? JSON.parse(r.seed_json) : null,
    });
  }
  if (path === "/api/state" && method === "PUT") {
    const body = await readBody(req);
    if (typeof body.enc !== "string" || !body.enc) return err(400, "enc fehlt");
    await env.DB.prepare("UPDATE players SET state_enc = ?, state_updated = ?, seed_json = NULL WHERE id = ?")
      .bind(body.enc, Date.now(), me.id).run();
    return json({ ok: true });
  }

  // Public part: what friends are allowed to see
  if (path === "/api/public" && method === "PUT") {
    const body = await readBody(req);
    if (!body || typeof body !== "object" || Array.isArray(body)) return err(400, "Objekt erwartet");
    const name = cleanName(body.name) || me.name;
    body.name = name;
    await env.DB.prepare("UPDATE players SET public_json = ?, public_updated = ?, name = ? WHERE id = ?")
      .bind(JSON.stringify(body), Date.now(), name, me.id).run();
    return json({ ok: true });
  }

  if (path === "/api/players" && method === "GET") {
    const { results } = await env.DB.prepare(
      "SELECT id, name, token_hash IS NOT NULL AS claimed, public_json, public_updated FROM players ORDER BY rowid"
    ).all();
    return json({
      me: me.id,
      players: results.map((r) => ({
        id: r.id,
        name: r.name,
        claimed: !!r.claimed,
        updated: r.public_updated || null,
        public: r.public_json ? JSON.parse(r.public_json) : null,
      })),
    });
  }

  return err(404, "Unbekannter Pfad");
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/")) {
      try {
        return await handleApi(req, env, url.pathname);
      } catch (e) {
        return err(e.status || 500, e.status ? e.message : "Serverfehler");
      }
    }
    return env.ASSETS.fetch(req);
  },
};
