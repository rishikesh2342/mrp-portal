import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const COOKIE_NAME = "mrp_session";
const SESSION_DAYS = 7;
const hashToken = (token) => createHash("sha256").update(token).digest("hex");

function cookieOptions(maxAge) {
  return [
    `${COOKIE_NAME}=` + (maxAge ? "" : ""),
    "Path=/", "HttpOnly", "SameSite=Lax", ...(process.env.NODE_ENV === "production" ? ["Secure"] : []),
    `Max-Age=${maxAge}`,
  ];
}
function setSessionCookie(res, token) {
  const options = cookieOptions(SESSION_DAYS * 86400);
  options[0] = `${COOKIE_NAME}=${token}`;
  res.setHeader("Set-Cookie", options.join("; "));
}
function clearSessionCookie(res) {
  const options = cookieOptions(0);
  options[0] = `${COOKIE_NAME}=`;
  res.setHeader("Set-Cookie", options.join("; "));
}
function sessionToken(req) {
  const cookie = req.headers.cookie || "";
  const value = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE_NAME}=`));
  return value ? decodeURIComponent(value.slice(COOKIE_NAME.length + 1)) : "";
}

export async function createPasswordHash(password) {
  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, 64);
  return `scrypt$${salt}$${Buffer.from(derived).toString("hex")}`;
}
export async function verifyPassword(password, stored) {
  const [algorithm, salt, expectedHex] = String(stored || "").split("$");
  if (algorithm !== "scrypt" || !salt || !expectedHex) return false;
  const actual = Buffer.from(await scrypt(password, salt, 64));
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function bootstrapDefaultTenant(pool) {
  const email = String(process.env.BOOTSTRAP_TENANT_EMAIL || "").trim().toLowerCase();
  const password = String(process.env.BOOTSTRAP_TENANT_PASSWORD || "");
  if (!email && !password) return;
  if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 10)
    throw new Error("Set both BOOTSTRAP_TENANT_EMAIL and a BOOTSTRAP_TENANT_PASSWORD of at least 10 characters.");
  const hash = await createPasswordHash(password);
  await pool.query(
    `INSERT INTO public.tenant_users(tenant_id,email,password_hash,display_name,role)
     SELECT tenant_id,$1,$2,$3,'admin' FROM public.tenants WHERE tenant_slug='holcim-group'
     ON CONFLICT(email) DO NOTHING`,
    [email, hash, "Workspace Administrator"],
  );
}

async function createSession(pool, user) {
  const token = randomBytes(32).toString("hex");
  await pool.query(
    `INSERT INTO public.tenant_sessions(session_hash,user_id,tenant_id,expires_at)
     VALUES($1,$2,$3,now()+($4::int * interval '1 day'))`,
    [hashToken(token), user.user_id, user.tenant_id, SESSION_DAYS],
  );
  return token;
}

export function registerTenantAuth(app, pool) {
  app.post("/api/auth/signup", async (req, res, next) => {
    const tenantName = String(req.body.tenantName || "").trim().slice(0, 160);
    const displayName = String(req.body.displayName || "").trim().slice(0, 160);
    const email = String(req.body.email || "").trim().toLowerCase().slice(0, 255);
    const password = String(req.body.password || "");
    if (!tenantName || !displayName || !/^\S+@\S+\.\S+$/.test(email) || password.length < 10)
      return res.status(400).json({ error: "Enter company name, your name, a valid email, and a password with at least 10 characters." });
    const slugBase = tenantName.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 150) || "workspace";
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const tenantSlug = `${slugBase}-${randomBytes(3).toString("hex")}`;
      const tenantResult = await client.query(
        `INSERT INTO public.tenants(tenant_name,tenant_slug) VALUES($1,$2) RETURNING tenant_id,tenant_name`,
        [tenantName, tenantSlug],
      );
      const tenant = tenantResult.rows[0];
      const passwordHash = await createPasswordHash(password);
      const userResult = await client.query(
        `INSERT INTO public.tenant_users(tenant_id,email,password_hash,display_name,role)
         VALUES($1,$2,$3,$4,'admin') RETURNING user_id,tenant_id,email,display_name,role`,
        [tenant.tenant_id, email, passwordHash, displayName],
      );
      await client.query("COMMIT");
      const token = await createSession(pool, userResult.rows[0]);
      setSessionCookie(res, token);
      res.status(201).json({ user: { ...userResult.rows[0], tenant_name: tenant.tenant_name } });
    } catch (error) {
      await client.query("ROLLBACK");
      if (error.code === "23505") return res.status(409).json({ error: "An account with this email already exists." });
      next(error);
    } finally { client.release(); }
  });

  app.post("/api/auth/login", async (req, res, next) => {
    try {
      const email = String(req.body.email || "").trim().toLowerCase();
      const result = await pool.query(
        `SELECT u.user_id,u.tenant_id,u.email,u.display_name,u.role,u.password_hash,t.tenant_name
         FROM public.tenant_users u JOIN public.tenants t USING(tenant_id)
         WHERE u.email=$1 AND u.active_flag AND t.active_flag`, [email],
      );
      if (!result.rowCount || !await verifyPassword(String(req.body.password || ""), result.rows[0].password_hash))
        return res.status(401).json({ error: "Email or password is incorrect." });
      const user = result.rows[0];
      const token = await createSession(pool, user);
      setSessionCookie(res, token);
      delete user.password_hash;
      res.json({ user });
    } catch (error) { next(error); }
  });

  app.post("/api/auth/logout", async (req, res, next) => {
    try {
      const token = sessionToken(req);
      if (token) await pool.query("DELETE FROM public.tenant_sessions WHERE session_hash=$1", [hashToken(token)]);
      clearSessionCookie(res);
      res.json({ ok: true });
    } catch (error) { next(error); }
  });

  app.use("/api", async (req, res, next) => {
    if (req.path === "/health") return next();
    const token = sessionToken(req);
    if (!token) return res.status(401).json({ error: "Sign in to a company workspace to continue." });
    try {
      const result = await pool.query(
        `SELECT u.user_id,u.tenant_id,u.email,u.display_name,u.role,t.tenant_name
         FROM public.tenant_sessions s JOIN public.tenant_users u USING(user_id,tenant_id)
         JOIN public.tenants t USING(tenant_id)
         WHERE s.session_hash=$1 AND s.expires_at>now() AND u.active_flag AND t.active_flag`,
        [hashToken(token)],
      );
      if (!result.rowCount) {
        clearSessionCookie(res);
        return res.status(401).json({ error: "Your session expired. Sign in again." });
      }
      req.tenant = result.rows[0];
      next();
    } catch (error) { next(error); }
  });
  app.get("/api/auth/me", (req, res) => res.json({ user: req.tenant }));
}
