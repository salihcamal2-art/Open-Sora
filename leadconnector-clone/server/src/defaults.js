import { insert } from './db.js';
import { token } from './services.js';

const WEEKDAYS = { mon: [['09:00', '17:00']], tue: [['09:00', '17:00']], wed: [['09:00', '17:00']], thu: [['09:00', '17:00']], fri: [['09:00', '17:00']], sat: [], sun: [] };

/** Creates the starter configuration for a brand-new location (sub-account). */
export function createLocationDefaults(locationId, ownerId) {
  const p = insert('pipelines', { location_id: locationId, name: 'Sales Pipeline' });
  ['New Lead', 'Contacted', 'Appointment Set', 'Proposal Sent', 'Closed'].forEach((name, i) =>
    insert('stages', { pipeline_id: p, name, position: i })
  );
  insert('calendars', {
    location_id: locationId, name: 'Consultation', slug: `consultation-${token(4)}`,
    description: '30 minute discovery call', color: '#155EEF', slot_duration: 30, owner_id: ownerId,
    availability: WEEKDAYS,
  });
  const snippets = [
    ['Greeting', 'Hi {{contact.first_name}}, thanks for reaching out to {{location.name}}! How can we help you today?', 'sms'],
    ['Review request', 'Hi {{contact.first_name}}, thanks for choosing {{location.name}}! Would you mind leaving us a quick review? {{location.review_link}}', 'sms'],
    ['Follow up', 'Hi {{contact.first_name}}, just following up on our last conversation. Do you have any questions?', 'sms'],
    ['Booking link', 'You can book a time that works for you here: {{location.booking_link}}', 'sms'],
  ];
  for (const [name, body, type] of snippets) insert('snippets', { location_id: locationId, name, body, type });
  insert('custom_fields', { location_id: locationId, name: 'Lead Budget', key: 'lead_budget', type: 'number' });
  insert('custom_fields', { location_id: locationId, name: 'Preferred Contact Time', key: 'preferred_time', type: 'select', options: ['Morning', 'Afternoon', 'Evening'] });
}

export { WEEKDAYS };
