import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { get } from './db.js';
import { requireAuth, requireLocation } from './auth.js';
import { addSseClient } from './events.js';
import './workflows.js';
import { startScheduler } from './scheduler.js';
import { seedIfEmpty } from './seed.js';

import authRoutes from './routes/auth.js';
import contactRoutes from './routes/contacts.js';
import conversationRoutes from './routes/conversations.js';
import opportunityRoutes from './routes/opportunities.js';
import calendarRoutes from './routes/calendars.js';
import taskRoutes from './routes/tasks.js';
import paymentRoutes from './routes/payments.js';
import reviewRoutes from './routes/reviews.js';
import miscRoutes from './routes/misc.js';
import publicRoutes from './routes/public.js';
import uploadRoutes, { UPLOAD_DIR } from './uploads.js';
import aiRoutes from './routes/ai.js';
import { stripeWebhook } from './stripe.js';
import pushRoutes from './push.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.set('trust proxy', true);
app.use(cors());
// Stripe needs the raw body to verify webhook signatures, so it is mounted before express.json
app.post('/api/public/stripe/webhook', express.raw({ type: 'application/json' }), stripeWebhook);
app.use(express.json({ limit: '20mb' }));
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d' }));

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use('/api/public', publicRoutes);
app.use('/api/auth', authRoutes);

// Live updates (Server-Sent Events). EventSource can't send headers -> token/location via query.
app.get('/api/stream', requireAuth, requireLocation, (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  res.write(`event: ready\ndata: {}\n\n`);
  const remove = addSseClient(res, req.user.id, req.locationId);
  req.on('close', remove);
});

const authed = [requireAuth, requireLocation];
app.use('/api/uploads', ...authed, uploadRoutes);
app.use('/api/ai', ...authed, aiRoutes);
app.use('/api/push', requireAuth, pushRoutes);
app.use('/api/contacts', ...authed, contactRoutes);
app.use('/api/conversations', ...authed, conversationRoutes);
app.use('/api/opportunities', ...authed, opportunityRoutes);
app.use('/api/calendars', ...authed, calendarRoutes);
app.use('/api/tasks', ...authed, taskRoutes);
app.use('/api/payments', ...authed, paymentRoutes);
app.use('/api/reviews', ...authed, reviewRoutes);
app.use('/api', ...authed, miscRoutes);

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Serve the built web app (client/dist) in production
const dist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message || 'Server error' });
});

if (process.env.SEED !== 'false') seedIfEmpty();
startScheduler();

const PORT = Number(process.env.PORT) || 4000;
app.listen(PORT, () => {
  const users = get('SELECT count(*) n FROM users').n;
  console.log(`LeadConnector clone API on http://localhost:${PORT}  (users: ${users})`);
});
