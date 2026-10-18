/* Eco Air Portal v2 - photo reader for the Measure tool ("Read Photo").
 *
 * Used by the builders' AI features: Read Photo (handwritten measure sheet) and the
 * AI Plan Reader (heating drawing -> Master or Work Order). The old Netlify address
 * /.netlify/functions/claude-proxy is pointed here by vercel.json.
 * This function checks the caller is a signed-in staff member, then forwards the images
 * and instructions to Claude and returns Claude's reply unchanged.
 *
 * Vercel environment variables:
 *   ANTHROPIC_API_KEY   required. Your Claude API key (console.anthropic.com).
 *   CLAUDE_MODEL        optional. Model used when the tool asks for one that isn't on the allowed list.
 *   FIREBASE_PROJECT_ID optional. Defaults to ecoair-portal.
 *   FIREBASE_API_KEY    optional. Defaults to the portal's web API key.
 */
const DEFAULT_MODEL = 'claude-sonnet-5-5';
const PROJECT = process.env.FIREBASE_PROJECT_ID || 'ecoair-portal';
const FB_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyDd96GHh5CP3SFyK5mjyhn_7XdPqV1h2AI';
const MODELS = new Set(['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-sonnet-4-6']); // same list as the live portal
const MAX_TOKENS = 32000;   // the Plan Reader writes a full Master
const MAX_PARTS = 40;       // drawing sheets + instructions
const MAX_TEXT = 200000;

function fail(res, status, message) {
  res.status(status).json({ type: 'error', error: { type: 'portal_error', message } });
}

// Same check as signing in: the staff record exists, isn't removed, and the password hash matches.
async function isStaff(user, key) {
  if (!user || !key || !/^[a-z0-9._-]{1,64}$/i.test(user) || !/^[a-f0-9]{64}$/i.test(key)) return false;
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(PROJECT)}/databases/(default)/documents/staff/${encodeURIComponent(user.toLowerCase())}?key=${encodeURIComponent(FB_KEY)}`;
  const r = await fetch(url);
  if (!r.ok) return false;
  const doc = await r.json();
  const f = doc.fields || {};
  if (f._deleted && f._deleted.booleanValue) return false;
  return !!(f.passwordHash && f.passwordHash.stringValue === key.toLowerCase());
}

// Only pass through one user message made of images and text (what the builders send).
function cleanMessages(messages) {
  if (!Array.isArray(messages) || messages.length !== 1) return null;
  const m = messages[0];
  if (!m || m.role !== 'user' || !Array.isArray(m.content) || !m.content.length || m.content.length > MAX_PARTS) return null;
  const content = [];
  for (const part of m.content) {
    if (part && part.type === 'text' && typeof part.text === 'string' && part.text.length < MAX_TEXT) {
      content.push({ type: 'text', text: part.text });
    } else if (part && part.type === 'image' && part.source && part.source.type === 'base64' &&
      /^image\/(jpeg|png|gif|webp)$/.test(part.source.media_type) && typeof part.source.data === 'string') {
      content.push({ type: 'image', source: { type: 'base64', media_type: part.source.media_type, data: part.source.data } });
    } else return null;
  }
  return [{ role: 'user', content }];
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return fail(res, 405, 'Use POST.');
  if (!process.env.ANTHROPIC_API_KEY) return fail(res, 500, 'Photo reading is not set up yet: add ANTHROPIC_API_KEY in Vercel.');
  try {
    const user = String(req.headers['x-ea-user'] || '');
    const key = String(req.headers['x-ea-key'] || '');
    if (!(await isStaff(user, key))) return fail(res, 401, 'Sign in to the staff portal to use photo reading.');

    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
    const messages = cleanMessages(body && body.messages);
    if (!messages) return fail(res, 400, 'That request isn\'t something the builders send.');

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODELS.has(body.model) ? body.model : (process.env.CLAUDE_MODEL || DEFAULT_MODEL),
        max_tokens: Math.min(parseInt(body.max_tokens, 10) || 2048, MAX_TOKENS),
        messages
      })
    });
    const text = await r.text();
    res.status(r.status).setHeader('content-type', 'application/json');
    return res.send(text);
  } catch (e) {
    return fail(res, 502, 'Could not reach Claude: ' + (e && e.message || e));
  }
};
