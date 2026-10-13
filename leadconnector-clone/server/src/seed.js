// Demo data so the app is fully explorable on first run.
// Login: demo@leadconnector.app / demo1234   (second user: sara@leadconnector.app / demo1234)
import bcrypt from 'bcryptjs';
import { pathToFileURL } from 'node:url';
import { db, get, all, insert, run, tx } from './db.js';
import { createLocationDefaults } from './defaults.js';
import { token, recalcInvoice } from './services.js';

const FIRST = ['Ahmed', 'Sara', 'John', 'Maria', 'Omar', 'Lina', 'David', 'Emma', 'Khaled', 'Noor', 'Michael', 'Olivia', 'Yousef', 'Mona', 'James', 'Sophia', 'Hassan', 'Layla', 'Daniel', 'Ava', 'Ali', 'Rania', 'Chris', 'Mia'];
const LAST = ['Haddad', 'Khalil', 'Smith', 'Garcia', 'Nasser', 'Saleh', 'Brown', 'Wilson', 'Mansour', 'Aziz', 'Johnson', 'Lee', 'Darwish', 'Fares', 'Taylor', 'Martin'];
const COMPANIES = ['Acme Corp', 'Bright Dental', 'Skyline Realty', 'Nova Fitness', 'Cedar Law', 'Blue Roofing', null, null, 'Prime Auto', 'Olive Cafe'];
const SOURCES = ['facebook ad', 'google ads', 'website form', 'referral', 'instagram', 'booking widget', 'walk-in'];
const TAGS = ['new lead', 'hot', 'customer', 'vip', 'follow up', 'facebook', 'webinar'];
const CHANNELS = ['sms', 'email', 'whatsapp', 'facebook', 'instagram', 'gmb', 'live_chat', 'sms', 'sms'];
const pick = (a, i) => a[i % a.length];
const iso = (ms) => new Date(ms).toISOString();

const CONVOS = [
  ['Hi, I saw your ad. How much does the service cost?', 'Hi {n}! Thanks for reaching out. Packages start at $199. Would you like to book a free consultation?', 'Yes please, tomorrow afternoon works.'],
  ['Can I reschedule my appointment to Friday?', 'Of course! I have 2pm or 4pm available on Friday.', '4pm is perfect, thanks!'],
  ['Do you offer financing?', 'We do — 0% for 12 months on orders over $500.'],
  ['Thanks for the great service yesterday!', 'Thank you {n}! Would you mind leaving us a quick review?'],
  ['Is the office open on Saturday?', 'Yes, from 10am to 2pm.', 'Great, see you then'],
  ['I need a quote for 3 rooms', 'Sure! Can you send a few photos of the rooms?'],
];

export function seed() {
  tx(() => {
    const hash = bcrypt.hashSync('demo1234', 10);
    const u1 = insert('users', { name: 'Demo Admin', email: 'demo@leadconnector.app', password_hash: hash, phone: '+15550000001', color: '#155EEF' });
    const u2 = insert('users', { name: 'Sara Agent', email: 'sara@leadconnector.app', password_hash: hash, phone: '+15550000002', color: '#EE46BC' });
    const L = insert('locations', {
      name: 'Demo Business', email: 'hello@demobusiness.com', phone: '+15551234567', address: '123 Main St, Austin, TX',
      website: 'https://demobusiness.com', timezone: 'UTC', currency: 'USD', review_link: 'https://g.page/r/demo-business/review',
      settings: { api_key: 'demo-api-key' },
    });
    insert('user_locations', { user_id: u1, location_id: L, role: 'admin' });
    insert('user_locations', { user_id: u2, location_id: L, role: 'user' });
    createLocationDefaults(L, u1);
    const L2 = insert('locations', { name: 'Second Branch', timezone: 'UTC', currency: 'USD' });
    insert('user_locations', { user_id: u1, location_id: L2, role: 'admin' });
    createLocationDefaults(L2, u1);

    const tagIds = Object.fromEntries(TAGS.map((t) => [t, insert('tags', { location_id: L, name: t })]));
    const now = Date.now();
    const contacts = [];
    for (let i = 0; i < 24; i++) {
      const fn = FIRST[i], ln = pick(LAST, i * 3);
      const created = now - (i * 1.3 + Math.random()) * 86400e3;
      const id = insert('contacts', {
        location_id: L, first_name: fn, last_name: ln,
        email: `${fn}.${ln}`.toLowerCase() + '@example.com', phone: `+1555${String(2000000 + i * 7919).slice(0, 7)}`,
        company: pick(COMPANIES, i), source: pick(SOURCES, i), type: i % 4 === 0 ? 'customer' : 'lead',
        assigned_to: i % 3 === 0 ? u2 : u1, city: pick(['Austin', 'Dubai', 'Amman', 'London', 'Riyadh'], i),
        country: pick(['US', 'AE', 'JO', 'GB', 'SA'], i), custom: { lead_budget: (i + 1) * 500, preferred_time: pick(['Morning', 'Afternoon', 'Evening'], i) },
        created_at: iso(created), updated_at: iso(created), last_activity: iso(created),
      });
      contacts.push({ id, fn, created });
      run('INSERT INTO contact_tags (contact_id, tag_id) VALUES (?, ?)', id, tagIds[pick(TAGS, i)]);
      if (i % 3 === 0) run('INSERT OR IGNORE INTO contact_tags (contact_id, tag_id) VALUES (?, ?)', id, tagIds.hot);
      insert('activities', { location_id: L, contact_id: id, type: 'contact_created', description: `Contact created (source: ${pick(SOURCES, i)})`, created_at: iso(created) });
    }

    // conversations
    contacts.slice(0, 16).forEach((c, i) => {
      const type = pick(CHANNELS, i);
      const lines = pick(CONVOS, i);
      let t = now - (i * 3 + 1) * 3600e3;
      const conv = insert('conversations', { location_id: L, contact_id: c.id, assigned_to: i % 4 === 0 ? null : i % 3 === 0 ? u2 : u1, starred: i % 5 === 0 ? 1 : 0, created_at: iso(t) });
      let last;
      lines.forEach((body, j) => {
        t += 6 * 60e3;
        const direction = j % 2 === 0 ? 'inbound' : 'outbound';
        last = { body: body.replace('{n}', c.fn), direction, t };
        insert('messages', {
          conversation_id: conv, location_id: L, contact_id: c.id, user_id: direction === 'outbound' ? u1 : null,
          type, direction, body: last.body, subject: type === 'email' ? 'Question about your services' : null,
          status: direction === 'inbound' ? 'received' : 'delivered', created_at: iso(t),
        });
      });
      if (i === 2) {
        const m = insert('messages', { conversation_id: conv, location_id: L, contact_id: c.id, user_id: u2, type: 'comment', direction: 'internal', body: '@Demo Admin can you check financing eligibility?', created_at: iso(t + 60e3) });
        run('INSERT INTO message_mentions (message_id, user_id) VALUES (?, ?)', m, u1);
        run('INSERT INTO conversation_followers (conversation_id, user_id) VALUES (?, ?)', conv, u1);
      }
      if (i === 4) insert('messages', { conversation_id: conv, location_id: L, contact_id: c.id, user_id: u1, type: 'call', direction: 'outbound', body: 'Discussed pricing', status: 'completed', meta: { duration: 184, outcome: 'completed' }, created_at: iso(t - 3600e3) });
      run('UPDATE conversations SET last_message_at = ?, last_message_body = ?, last_message_type = ?, last_message_direction = ?, unread_count = ? WHERE id = ?',
        iso(last.t), last.body, type, last.direction, last.direction === 'inbound' ? (i % 2) + 1 : 0, conv);
    });

    // opportunities
    const p = get('SELECT id FROM pipelines WHERE location_id = ?', L).id;
    const stages = all('SELECT id FROM stages WHERE pipeline_id = ? ORDER BY position', p);
    contacts.slice(0, 18).forEach((c, i) => {
      const status = i === 15 ? 'won' : i === 16 ? 'lost' : i === 17 ? 'abandoned' : 'open';
      insert('opportunities', {
        location_id: L, pipeline_id: p, stage_id: stages[i % stages.length].id, contact_id: c.id,
        name: `${c.fn} — ${pick(['Website package', 'Dental implant', 'Home listing', 'Gym membership', 'Roof repair'], i)}`,
        value: (i + 1) * 350, status, source: pick(SOURCES, i), assigned_to: i % 3 === 0 ? u2 : u1,
        created_at: iso(c.created), updated_at: iso(now - i * 3600e3),
      });
    });

    // appointments
    const cal = get('SELECT * FROM calendars WHERE location_id = ?', L);
    const day0 = new Date(); day0.setUTCHours(0, 0, 0, 0);
    [[0, 10], [0, 14], [1, 11], [2, 15], [-1, 9], [3, 13], [5, 10]].forEach(([d, hr], i) => {
      const s = day0.getTime() + d * 86400e3 + hr * 3600e3;
      const c = contacts[i];
      insert('appointments', {
        location_id: L, calendar_id: cal.id, contact_id: c.id, assigned_to: u1, title: `Consultation with ${c.fn}`,
        start_at: iso(s), end_at: iso(s + 30 * 60e3), status: d < 0 ? 'showed' : 'confirmed',
      });
    });
    insert('appointments', { location_id: L, calendar_id: cal.id, assigned_to: u1, title: 'Lunch break', start_at: iso(day0.getTime() + 12 * 3600e3), end_at: iso(day0.getTime() + 13 * 3600e3), is_block: 1 });

    // tasks
    [['Call back about pricing', 0, -2], ['Send proposal', 1, 5], ['Follow up after consultation', 2, 26], ['Collect signed contract', 3, 50], ['Confirm appointment', 4, -30]].forEach(([title, i, hrs]) => {
      insert('tasks', { location_id: L, contact_id: contacts[i].id, title, due_at: iso(now + hrs * 3600e3), assigned_to: i % 2 ? u2 : u1, created_by: u1 });
    });

    // products, invoices, transactions
    const prods = [['Consultation', 99], ['Starter Package', 499], ['Premium Package', 1299], ['Monthly Retainer', 299]].map(([name, price]) =>
      ({ id: insert('products', { location_id: L, name, price, type: name.includes('Monthly') ? 'recurring' : 'one_time' }), name, price }));
    [[0, 'paid'], [1, 'sent'], [2, 'draft'], [3, 'partially_paid'], [5, 'sent']].forEach(([i, status], n) => {
      const items = [{ name: prods[n % 4].name, price: prods[n % 4].price, qty: 1 }];
      const { subtotal, total } = recalcInvoice({ items, tax_rate: 5, discount: 0 });
      const paid = status === 'paid' ? total : status === 'partially_paid' ? +(total / 2).toFixed(2) : 0;
      const inv = insert('invoices', {
        location_id: L, contact_id: contacts[i].id, number: `INV-${String(n + 1).padStart(5, '0')}`, title: 'Services', status,
        issue_date: iso(now - (10 - n) * 86400e3).slice(0, 10), due_date: iso(now + (n - 2) * 86400e3).slice(0, 10),
        items, tax_rate: 5, subtotal, total, amount_paid: paid, public_token: token(12),
      });
      if (paid) insert('transactions', { location_id: L, contact_id: contacts[i].id, invoice_id: inv, amount: paid, method: 'card', created_at: iso(now - n * 86400e3) });
    });
    insert('transactions', { location_id: L, contact_id: contacts[6].id, amount: 99, method: 'cash', note: 'POS sale', created_at: iso(now - 2 * 86400e3) });

    // reviews
    [['Lina Saleh', 5, 'Amazing service, very professional team!', 'google'], ['John Smith', 4, 'Good experience overall, quick response.', 'google'],
      ['Maria Garcia', 5, 'Highly recommend!', 'facebook'], ['Omar Nasser', 2, 'Had to wait too long for my appointment.', 'google'],
      ['Emma Wilson', 5, 'Best in town.', 'facebook']].forEach(([reviewer_name, rating, body, platform], i) =>
      insert('reviews', { location_id: L, reviewer_name, rating, body, platform, reply: i === 0 ? 'Thank you so much Lina!' : null, created_at: iso(now - i * 2 * 86400e3) }));

    // workflow examples
    const stage = stages[0].id;
    insert('workflows', {
      location_id: L, name: 'New Lead Welcome', status: 'published', trigger_type: 'contact_created', trigger_config: {},
      actions: [
        { type: 'send_sms', body: 'Hi {{contact.first_name}}, thanks for contacting {{location.name}}! We will be in touch shortly.' },
        { type: 'add_tag', tag: 'new lead' },
        { type: 'create_opportunity', pipeline_id: p, stage_id: stage, name: '{{contact.name}} — New lead', value: 0 },
        { type: 'create_task', title: 'Call new lead {{contact.name}}', due_in_hours: 2 },
      ],
    });
    insert('workflows', {
      location_id: L, name: 'Negative Review Alert', status: 'published', trigger_type: 'review_received', trigger_config: { max_rating: 3 },
      actions: [{ type: 'internal_notification', body: 'A customer left a low rating — follow up quickly!' }],
    });
    insert('workflows', {
      location_id: L, name: 'Hot lead manual call', status: 'draft', trigger_type: 'tag_added', trigger_config: { tag: 'hot' },
      actions: [{ type: 'manual_action', channel: 'call', instructions: 'Call within 5 minutes' }],
    });
    insert('manual_actions', { location_id: L, contact_id: contacts[0].id, type: 'call', instructions: 'Call within 5 minutes — hot lead', assigned_to: u1 });
    insert('manual_actions', { location_id: L, contact_id: contacts[3].id, type: 'sms', instructions: 'Send pricing sheet', assigned_to: u1 });

    // notifications
    [['inbound_message', 'New SMS from Ahmed Haddad', 'Hi, I saw your ad. How much does the service cost?', '/conversations'],
      ['appointment', 'New appointment booked', 'Consultation with Sara today', '/calendars'],
      ['payment', 'Payment received', '$104.95 via card', '/payments'],
      ['review', 'New 5★ review', 'Best in town.', '/reviews']].forEach(([type, title, body, link], i) =>
      insert('notifications', { user_id: u1, location_id: L, type, title, body, link, read: i > 1 ? 1 : 0, created_at: iso(now - i * 3600e3) }));

    insert('smart_lists', { location_id: L, user_id: null, name: 'Hot leads', filters: { tags: ['hot'] } });
    insert('smart_lists', { location_id: L, user_id: null, name: 'Customers', filters: { type: 'customer' } });
  });
  console.log('Seeded demo data. Login: demo@leadconnector.app / demo1234');
}

export function seedIfEmpty() {
  if (get('SELECT count(*) n FROM users').n === 0) seed();
}

// `npm run seed` -> wipe and reseed
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--reset')) {
    const tables = all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").map((t) => t.name);
    db.exec('PRAGMA foreign_keys = OFF');
    for (const t of tables) db.exec(`DELETE FROM ${t}`);
    db.exec("DELETE FROM sqlite_sequence");
    db.exec('PRAGMA foreign_keys = ON');
  }
  seed();
}
