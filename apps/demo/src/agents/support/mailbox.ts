import { z } from "zod";

export const SUPPORT_ADDRESS = "support@acme-demo.dev";

const Address = z.object({ Name: z.string(), Address: z.string() });
const Summary = z.object({
  ID: z.string(),
  From: Address,
  To: z.array(Address),
  Subject: z.string(),
  Created: z.string(),
});
const Full = Summary.omit({ Created: true }).extend({ Date: z.string(), Text: z.string() });

export interface MailSummary {
  id: string;
  from: string;
  subject: string;
  date: string;
}

export interface MailMessage extends MailSummary {
  to: string[];
  text: string;
}

export interface OutgoingMail {
  from: string;
  fromName?: string;
  to: string;
  subject: string;
  text: string;
}

export interface Mailbox {
  inbox(): Promise<MailSummary[]>;
  read(id: string): Promise<MailMessage>;
  send(mail: OutgoingMail): Promise<{ id: string }>;
}

export function mailpit(baseUrl: string): Mailbox {
  const api = async <T>(schema: z.ZodType<T>, path: string, init?: RequestInit): Promise<T> => {
    const res = await fetch(new URL(`/api/v1/${path}`, baseUrl), init);
    if (!res.ok) throw new Error(`Mailpit ${path}: HTTP ${res.status}`);
    return schema.parse(await res.json());
  };
  return {
    async inbox() {
      const query = encodeURIComponent(`to:${SUPPORT_ADDRESS}`);
      const { messages } = await api(
        z.object({ messages: z.array(Summary) }),
        `search?query=${query}&limit=50`,
      );
      return messages.map((m) => ({
        id: m.ID,
        from: m.From.Address,
        subject: m.Subject,
        date: m.Created,
      }));
    },
    async read(id) {
      const m = await api(Full, `message/${encodeURIComponent(id)}`);
      return {
        id: m.ID,
        from: m.From.Address,
        to: m.To.map((t) => t.Address),
        subject: m.Subject,
        date: m.Date,
        text: m.Text,
      };
    },
    async send(mail) {
      const { ID } = await api(z.object({ ID: z.string() }), "send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          From: { Email: mail.from, Name: mail.fromName ?? "" },
          To: [{ Email: mail.to }],
          Subject: mail.subject,
          Text: mail.text,
        }),
      });
      return { id: ID };
    },
  };
}
