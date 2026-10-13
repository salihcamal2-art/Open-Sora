// Conversation AI: reply suggestions, conversation summaries and message rewriting.
// Enabled when ANTHROPIC_API_KEY is set (model configurable with AI_MODEL).
import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { all, get, parseJSON } from '../db.js';
import { h, HttpError } from '../auth.js';
import { fullName, contactTags, labelOf } from '../services.js';

const MODEL = process.env.AI_MODEL || 'claude-opus-5-5';
const client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
export const aiEnabled = () => !!client;

const r = Router();

async function ask({ system, prompt, maxTokens = 2000, schema }) {
  if (!client) throw new HttpError(503, 'AI is not configured. Set ANTHROPIC_API_KEY on the server.');
  let response;
  try {
    response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      // if a safety classifier declines, let the API re-run on its recommended fallback model
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', ...(schema ? { format: { type: 'json_schema', schema } } : {}) },
      system,
      messages: [{ role: 'user', content: prompt }],
    });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) throw new HttpError(429, 'AI is busy, try again in a moment');
    if (e instanceof Anthropic.AuthenticationError) throw new HttpError(503, 'AI API key is invalid');
    if (e instanceof Anthropic.APIError) throw new HttpError(502, `AI error: ${e.message}`);
    throw e;
  }
  if (response.stop_reason === 'refusal') throw new HttpError(422, 'The AI declined this request');
  return response.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
}

function transcript(conversationId) {
  const msgs = all(
    `SELECT m.type, m.direction, m.body, m.subject, m.created_at, u.name AS user_name FROM messages m
     LEFT JOIN users u ON u.id = m.user_id WHERE m.conversation_id = ? AND m.status != 'scheduled'
     ORDER BY m.created_at DESC, m.id DESC LIMIT 60`, conversationId
  ).reverse();
  return msgs.map((m) => {
    const who = m.direction === 'inbound' ? 'Customer' : m.direction === 'internal' ? `Internal note (${m.user_name || 'team'})` : `Business (${m.user_name || 'automation'})`;
    return `[${m.created_at.slice(0, 16).replace('T', ' ')}] ${who} via ${labelOf(m.type)}: ${m.subject ? `${m.subject} — ` : ''}${m.body || '(attachment)'}`;
  }).join('\n');
}

function context(req, conv) {
  const c = get('SELECT * FROM contacts WHERE id = ?', conv.contact_id);
  const loc = get('SELECT * FROM locations WHERE id = ?', req.locationId);
  const custom = parseJSON(c.custom, {});
  return {
    contact: c,
    business: `Business: ${loc.name}${loc.website ? ` (${loc.website})` : ''}${loc.phone ? `, phone ${loc.phone}` : ''}${loc.address ? `, ${loc.address}` : ''}.`,
    customer: `Customer: ${fullName(c)}${c.company ? ` from ${c.company}` : ''}; tags: ${contactTags(c.id).join(', ') || 'none'}; type: ${c.type}${Object.keys(custom).length ? `; details: ${JSON.stringify(Object.fromEntries(Object.entries(custom).filter(([k]) => !k.startsWith('_'))))}` : ''}.`,
  };
}

function loadConv(req) {
  const conv = get('SELECT * FROM conversations WHERE id = ? AND location_id = ?', req.params.id, req.locationId);
  if (!conv) throw new HttpError(404, 'Conversation not found');
  return conv;
}

r.get('/status', (req, res) => res.json({ enabled: aiEnabled(), model: client ? MODEL : null }));

// Three short reply options for the selected channel
r.post('/conversations/:id/suggest', h(async (req, res) => {
  const conv = loadConv(req);
  const ctx = context(req, conv);
  const channel = labelOf(req.body.channel || 'sms');
  const text = await ask({
    system: `You help a small-business team reply to customers. ${ctx.business} Write replies in the same language the customer uses, warm and professional, ready to send as-is. Never invent prices, availability or policies that are not in the conversation — when unsure, offer to check or to book a call.`,
    prompt: `${ctx.customer}\n\nConversation so far:\n${transcript(conv.id) || '(no messages yet)'}\n\nWrite 3 different reply options to send next by ${channel}${channel === 'SMS' ? ' (keep each under 300 characters)' : ''}. ${req.body.instructions ? `Extra guidance from the agent: ${req.body.instructions}` : ''}`,
    schema: {
      type: 'object',
      properties: { replies: { type: 'array', items: { type: 'string' } } },
      required: ['replies'],
      additionalProperties: false,
    },
  });
  let replies;
  try {
    replies = JSON.parse(text).replies;
  } catch {
    replies = text.split(/\n+/).map((l) => l.replace(/^\s*(\d+[.)]|[-*])\s*/, '').trim()).filter(Boolean);
  }
  res.json({ replies: replies.slice(0, 3) });
}));

// Summary + sentiment + next step
r.post('/conversations/:id/summary', h(async (req, res) => {
  const conv = loadConv(req);
  const ctx = context(req, conv);
  const summary = await ask({
    system: `You summarise customer conversations for a sales/support team. ${ctx.business} Be concise and factual. Answer in ${req.body.language === 'ar' ? 'Arabic' : 'the language most of the conversation is in'}.`,
    prompt: `${ctx.customer}\n\nConversation:\n${transcript(conv.id) || '(no messages yet)'}\n\nGive: a 2-3 sentence summary, the customer's intent, their sentiment (positive / neutral / negative), any open questions or commitments, and the single best next step. Use short labelled lines.`,
  });
  res.json({ summary });
}));

const MODES = {
  improve: 'Improve clarity and tone while keeping the meaning.',
  professional: 'Rewrite in a more professional tone.',
  friendly: 'Rewrite in a warmer, friendlier tone.',
  shorter: 'Make it noticeably shorter, keeping the key information.',
  grammar: 'Fix spelling and grammar only; change nothing else.',
  arabic: 'Translate it into natural Arabic.',
  english: 'Translate it into natural English.',
};

r.post('/rewrite', h(async (req, res) => {
  const { text, mode = 'improve' } = req.body;
  if (!text?.trim()) throw new HttpError(400, 'Nothing to rewrite');
  const out = await ask({
    system: 'You edit messages that a business sends to its customers. Return only the rewritten message text, with no preamble, quotes or explanation.',
    prompt: `${MODES[mode] || MODES.improve}\n\nMessage:\n${text}`,
  });
  res.json({ text: out });
}));

export default r;
