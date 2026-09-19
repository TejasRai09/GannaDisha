/**
 * Ganna Chakra authentication - Microsoft Entra ID (Azure AD) single sign-on.
 *
 * There are no passwords here. People sign in with the same Outlook account
 * they use for everything else, and this service never sees a credential.
 *
 * nginx asks this about every request (auth_request) before serving the app,
 * so the login page is a real gate rather than decoration - without it anyone
 * could fetch /baseline.json directly.
 *
 * The flow is authorization code with PKCE. PKCE means no client secret has to
 * live on this box: the service proves it started the exchange by presenting a
 * verifier only it knows. The short-lived state cookie carries that verifier,
 * signed, so nothing needs storing between the two requests.
 *
 *   GET  /api/auth/login     -> redirect to Microsoft
 *   GET  /api/auth/callback  -> exchange the code, set the session, land in app
 *   POST /api/logout         -> clear the session
 *   GET  /api/me             -> { email, name } for the signed-in user
 *   GET  /verify             -> 200 or 401, for nginx only
 *
 * Node built-ins only. The box has 914 MB of RAM and no npm.
 */

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 3001);
const CONF_DIR = process.env.GD_CONF || '/etc/gannadisha';
const CONF_FILE = path.join(CONF_DIR, 'config.json');
const SECRET_FILE = path.join(CONF_DIR, 'secret');
const SESSION_DAYS = 7;
const COOKIE = 'gd_session';
const STATE_COOKIE = 'gd_oauth';

function config() {
  try {
    return JSON.parse(fs.readFileSync(CONF_FILE, 'utf8'));
  } catch {
    return {};
  }
}

// ------------------------------------------------------------------ signing
function secret() {
  if (!fs.existsSync(SECRET_FILE)) {
    fs.mkdirSync(CONF_DIR, { recursive: true });
    fs.writeFileSync(SECRET_FILE, crypto.randomBytes(48).toString('hex'), { mode: 0o600 });
  }
  return fs.readFileSync(SECRET_FILE, 'utf8').trim();
}

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${mac}`;
}

function unsign(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, mac] = token.split('.');
  const want = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  const a = Buffer.from(mac || '');
  const b = Buffer.from(want);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ helpers
const json = (res, code, obj) => {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
};

function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

const session = (req) => unsign(readCookie(req, COOKIE));

/** Secure only once the site is on TLS, or the cookie would never be sent. */
const cookieFlags = () =>
  `Path=/; HttpOnly; SameSite=Lax${config().https ? '; Secure' : ''}`;

/** Where Microsoft should send people back to. */
function redirectUri(req) {
  const c = config();
  if (c.redirectUri) return c.redirectUri;
  const proto = req.headers['x-forwarded-proto'] || (c.https ? 'https' : 'http');
  return `${proto}://${req.headers.host}/api/auth/callback`;
}

/** Decode an id_token's claims. Signature is not checked here - see below. */
function claims(idToken) {
  try {
    return JSON.parse(Buffer.from(String(idToken).split('.')[1], 'base64url').toString('utf8'));
  } catch {
    return {};
  }
}

/**
 * Who is allowed in.
 *
 * Being in the Zuari tenant is not enough - the whole company is in it. Only
 * the named planning accounts get through, and everyone who does is a manager.
 */
function isAllowed(email) {
  const allow = (config().allow || []).map((x) => String(x).toLowerCase());
  return allow.includes(String(email || '').toLowerCase());
}

// ------------------------------------------------------------------- server
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const c = config();
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || req.socket.remoteAddress || 'unknown';

  // --- nginx asks about every request before serving the app ---------------
  if (url.pathname === '/verify') {
    const s = session(req);
    if (!s) { res.writeHead(401); return res.end(); }
    res.writeHead(200, { 'X-User': s.email });
    return res.end();
  }

  if (url.pathname === '/api/me') {
    const s = session(req);
    if (!s) return json(res, 401, { error: 'Not signed in' });
    return json(res, 200, { email: s.email, name: s.name });
  }

  if (url.pathname === '/api/logout' && req.method === 'POST') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Set-Cookie': `${COOKIE}=; ${cookieFlags()}; Max-Age=0`,
    });
    return res.end('{"ok":true}');
  }

  /**
   * TEMPORARY WAY IN, until DNS exists.
   *
   * Microsoft only accepts an https:// redirect URI, so single sign-on cannot
   * work against a bare IP address. This lets the named accounts in with a long
   * random key in the meantime.
   *
   * It is off unless `tempKey` is set in config.json, and gd-enable-https
   * removes that line when TLS goes live. Delete it by hand sooner if you like:
   *   sudo nano /etc/gannadisha/config.json   (drop the tempKey line)
   *   sudo systemctl restart gannadisha-auth
   */
  if (url.pathname === '/api/temp-login') {
    if (!c.tempKey) return json(res, 404, { error: 'Not found' });
    const given = url.searchParams.get('key') || '';
    const a = Buffer.from(given);
    const b = Buffer.from(c.tempKey);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      console.log(`[auth] temp-login refused, bad key, from ${ip}`);
      return json(res, 401, { error: 'Not found' });
    }
    const email = String(url.searchParams.get('as') || (c.allow || [])[0] || '').toLowerCase();
    if (!isAllowed(email)) return json(res, 403, { error: `${email} is not on the access list.` });

    // Deliberately short: this is a stopgap, not a way of working.
    const token = sign({ email, name: email, exp: Date.now() + 12 * 3600_000, temp: true });
    console.log(`[auth] TEMP sign-in  ${email}  from ${ip}  (no SSO - DNS pending)`);
    res.writeHead(302, {
      Location: '/',
      'Set-Cookie': `${COOKIE}=${token}; ${cookieFlags()}; Max-Age=${12 * 3600}`,
      'Cache-Control': 'no-store',
    });
    return res.end();
  }

  // --- start: send them to Microsoft ---------------------------------------
  if (url.pathname === '/api/auth/login') {
    if (!c.clientId || !c.tenantId) {
      return json(res, 500, { error: 'Sign-in is not configured on this server yet.' });
    }
    // PKCE: keep a verifier, send only its hash. Microsoft hands the code back
    // to whoever can produce the original, which is only this service.
    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    const nonce = crypto.randomBytes(16).toString('base64url');
    let next = url.searchParams.get('next') || '/';
    if (!next.startsWith('/') || next.startsWith('//')) next = '/';

    const state = sign({ verifier, nonce, next, exp: Date.now() + 10 * 60_000 });

    const auth = new URL(`https://login.microsoftonline.com/${c.tenantId}/oauth2/v2.0/authorize`);
    auth.searchParams.set('client_id', c.clientId);
    auth.searchParams.set('response_type', 'code');
    auth.searchParams.set('redirect_uri', redirectUri(req));
    auth.searchParams.set('response_mode', 'query');
    auth.searchParams.set('scope', 'openid profile email offline_access');
    auth.searchParams.set('state', crypto.createHash('sha256').update(state).digest('base64url'));
    auth.searchParams.set('nonce', nonce);
    auth.searchParams.set('code_challenge', challenge);
    auth.searchParams.set('code_challenge_method', 'S256');

    res.writeHead(302, {
      Location: auth.toString(),
      // Ten minutes is plenty to finish signing in, and nothing is left lying
      // around if they abandon it.
      'Set-Cookie': `${STATE_COOKIE}=${encodeURIComponent(state)}; ${cookieFlags()}; Max-Age=600`,
      'Cache-Control': 'no-store',
    });
    return res.end();
  }

  // --- return: exchange the code for tokens --------------------------------
  if (url.pathname === '/api/auth/callback') {
    const fail = (why, detail) => {
      console.log(`[auth] ${why}${detail ? ' - ' + detail : ''}  from ${ip}`);
      res.writeHead(302, {
        Location: `/login.html?error=${encodeURIComponent(why)}`,
        'Set-Cookie': `${STATE_COOKIE}=; ${cookieFlags()}; Max-Age=0`,
      });
      res.end();
    };

    const err = url.searchParams.get('error');
    if (err) return fail(url.searchParams.get('error_description') || err);

    const code = url.searchParams.get('code');
    const stateHash = url.searchParams.get('state');
    const stateRaw = readCookie(req, STATE_COOKIE);
    const state = unsign(stateRaw || '');

    if (!code || !state) return fail('That sign-in link expired. Please try again.');
    // The state in the URL must match the cookie, or this is a forged callback.
    const wantHash = crypto.createHash('sha256').update(stateRaw).digest('base64url');
    if (stateHash !== wantHash) return fail('Sign-in could not be verified. Please try again.');

    let tokens;
    try {
      const body = new URLSearchParams({
        client_id: c.clientId,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri(req),
        code_verifier: state.verifier,
        scope: 'openid profile email offline_access',
      });
      // A confidential registration still wants its secret; a public/SPA one
      // does not. Send it only if one has been configured.
      if (c.clientSecret) body.set('client_secret', c.clientSecret);

      const r = await fetch(`https://login.microsoftonline.com/${c.tenantId}/oauth2/v2.0/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      tokens = await r.json();
      if (!r.ok) {
        return fail(
          'Microsoft rejected the sign-in.',
          `${tokens.error}: ${String(tokens.error_description || '').split('\n')[0]}`
        );
      }
    } catch (e) {
      return fail('Could not reach Microsoft to complete sign-in.', String(e).slice(0, 120));
    }

    const cl = claims(tokens.id_token);
    if (cl.nonce && cl.nonce !== state.nonce) return fail('Sign-in could not be verified.');
    // The id_token came straight from Microsoft's token endpoint over TLS, in
    // response to a code only this service could redeem, so its signature adds
    // nothing here. It would matter if the token arrived via the browser.
    if (c.tenantId && cl.tid && cl.tid !== c.tenantId) {
      return fail('That account is not from this organisation.');
    }

    const email = String(cl.preferred_username || cl.email || cl.upn || '').toLowerCase();
    const name = cl.name || email;

    if (!email) return fail('Microsoft did not return an email address for that account.');
    if (!isAllowed(email)) {
      console.log(`[auth] refused  ${email}  from ${ip}`);
      return fail(`${email} is not on the access list for this tool.`);
    }

    const token = sign({ email, name, exp: Date.now() + SESSION_DAYS * 86400_000 });
    console.log(`[auth] signed in  ${email}  from ${ip}`);
    res.writeHead(302, {
      Location: state.next || '/',
      'Set-Cookie': [
        `${COOKIE}=${token}; ${cookieFlags()}; Max-Age=${SESSION_DAYS * 86400}`,
        `${STATE_COOKIE}=; ${cookieFlags()}; Max-Age=0`,
      ],
      'Cache-Control': 'no-store',
    });
    return res.end();
  }

  json(res, 404, { error: 'Not found' });
});

server.listen(PORT, '127.0.0.1', () => {
  const c = config();
  const n = (c.allow || []).length;
  console.log(
    `[auth] listening on 127.0.0.1:${PORT}  `
    + `tenant=${c.tenantId ? c.tenantId.slice(0, 8) + '...' : 'NOT SET'}  `
    + `${n} allowed account${n === 1 ? '' : 's'}  `
    + `${c.clientSecret ? 'confidential' : 'PKCE, no secret'}`
  );
});
