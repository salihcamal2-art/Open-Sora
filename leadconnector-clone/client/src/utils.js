export const CHANNEL_LABELS = {
  sms: 'SMS', email: 'Email', whatsapp: 'WhatsApp', facebook: 'Facebook', instagram: 'Instagram',
  gmb: 'Google Business', live_chat: 'Live Chat', call: 'Call', comment: 'Internal Comment',
};
export const CHANNEL_COLORS = {
  sms: '#12B76A', email: '#155EEF', whatsapp: '#25D366', facebook: '#1877F2', instagram: '#E1306C',
  gmb: '#F79009', live_chat: '#7A5AF8', call: '#06AED4', comment: '#F5B700',
};

let currency = 'USD';
export const setCurrency = (c) => (currency = c || 'USD');
export const money = (n, cur = currency) => {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur, maximumFractionDigits: 2 }).format(Number(n || 0));
  } catch {
    return `${cur} ${Number(n || 0).toFixed(2)}`;
  }
};

export function initials(name = '?') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';
}

export function colorFor(str = '') {
  const palette = ['#155EEF', '#7A5AF8', '#EE46BC', '#F79009', '#12B76A', '#06AED4', '#F04438', '#6172F3'];
  let h = 0;
  for (const ch of String(str)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return palette[h % palette.length];
}

export function timeAgo(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 0) return d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export const fmtTime = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '');
export const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) : '');
export const fmtDateTime = (iso) => (iso ? `${fmtDate(iso)}, ${fmtTime(iso)}` : '');

// value for <input type="datetime-local">
export function toLocalInput(iso) {
  const d = iso ? new Date(iso) : new Date();
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}
export const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null);

export const ymd = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

export function parseCSV(text) {
  const rows = [];
  let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); rows.push(row); row = []; cur = '';
    } else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

/** Extract contact fields from OCR'd business-card text. */
export function parseBusinessCard(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 1);
  const email = (text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/) || [])[0] || '';
  const phone = ((text.match(/(\+?\d[\d\s().-]{7,}\d)/) || [])[0] || '').replace(/[^\d+]/g, '');
  const website = (text.match(/(https?:\/\/)?(www\.)[\w-]+\.[\w.]+/i) || [])[0] || '';
  const titleWords = /(ceo|cto|cfo|founder|director|manager|engineer|consultant|sales|owner|president|officer|designer|developer|agent|partner|head|lead)/i;
  const companyWords = /(inc|llc|ltd|corp|company|co\.|group|agency|studio|solutions|services|realty|clinic|consulting|tech)/i;
  const isContactLine = (l) => l.includes('@') || /\d{4,}/.test(l) || /www\.|http/i.test(l);
  const nameLine = lines.find((l) => !isContactLine(l) && /^[A-Za-z؀-ۿ.'-]+(\s+[A-Za-z؀-ۿ.'-]+){1,2}$/.test(l) && !titleWords.test(l) && !companyWords.test(l)) || '';
  const job = lines.find((l) => titleWords.test(l) && !isContactLine(l)) || '';
  const company = lines.find((l) => companyWords.test(l) && !isContactLine(l)) || lines.find((l) => l !== nameLine && l !== job && !isContactLine(l) && l === l.toUpperCase() && l.length > 2) || '';
  const [first_name = '', ...rest] = nameLine.split(/\s+/);
  return { first_name, last_name: rest.join(' '), email, phone, company, job_title: job, website };
}
