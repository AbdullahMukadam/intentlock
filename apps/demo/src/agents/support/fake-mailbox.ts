import type { Mailbox, MailMessage, OutgoingMail } from "./mailbox.js";
import { SUPPORT_ADDRESS } from "./mailbox.js";
import { supportSeedMail } from "./seed-mail.js";

export function fakeMailbox(mail = supportSeedMail()) {
  const messages: MailMessage[] = mail.map((m, i) => ({
    id: `m${i + 1}`,
    from: m.from,
    to: [m.to],
    subject: m.subject,
    date: new Date(Date.UTC(2026, 9, 14, 9, i)).toISOString(),
    text: m.text,
  }));
  const sent: OutgoingMail[] = [];
  const mailbox: Mailbox = {
    inbox: async () =>
      messages
        .filter((m) => m.to.includes(SUPPORT_ADDRESS))
        .map(({ id, from, subject, date }) => ({ id, from, subject, date })),
    read: async (id) => {
      const m = messages.find((x) => x.id === id);
      if (!m) throw new Error(`No message ${id}`);
      return m;
    },
    send: async (out) => {
      sent.push(out);
      return { id: `sent${sent.length}` };
    },
  };
  return { mailbox, sent };
}
