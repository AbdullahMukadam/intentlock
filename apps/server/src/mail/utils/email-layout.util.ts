export type EmailDetail = { label: string; value: string; mono?: boolean };

export type EmailContent = {
  preheader: string;
  eyebrow: string;
  accent: string;
  title: string;
  intro: string;
  details?: EmailDetail[];
  code?: { label: string; value: string };
  button: { label: string; href: string };
  note?: string;
  footer: string;
};

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c] ?? c);
}

const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";

function detailRows(details: EmailDetail[]): string {
  return details
    .map(
      (d, i) =>
        `<tr><td style="padding:10px 0;${i ? "border-top:1px solid #f0f0f2;" : ""}color:#71717a;width:96px;vertical-align:top">${escapeHtml(d.label)}</td><td style="padding:10px 0;${i ? "border-top:1px solid #f0f0f2;" : ""}color:#18181b;word-break:break-word;${d.mono ? `font-family:${MONO};font-size:13px;` : ""}">${escapeHtml(d.value)}</td></tr>`,
    )
    .join("");
}

export function emailHtml(c: EmailContent): string {
  const href = escapeHtml(c.button.href);
  const details = c.details?.length
    ? `<tr><td style="padding:20px 32px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e4e4e7;border-radius:10px;padding:2px 16px">${detailRows(c.details)}</table></td></tr>`
    : "";
  const code = c.code
    ? `<tr><td style="padding:20px 32px 0"><p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#71717a">${escapeHtml(c.code.label)}</p><pre style="margin:0;padding:14px 16px;background:#fafafa;border:1px solid #e4e4e7;border-radius:10px;font-family:${MONO};font-size:12px;line-height:1.6;color:#18181b;white-space:pre-wrap;word-break:break-word">${escapeHtml(c.code.value)}</pre></td></tr>`
    : "";
  const note = c.note
    ? `<p style="margin:16px 0 0;font-size:13px;color:#71717a">${escapeHtml(c.note)}</p>`
    : "";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${escapeHtml(c.title)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:${SANS};font-size:15px;line-height:1.55;color:#18181b;-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(c.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5"><tr><td align="center" style="padding:32px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="padding:0 4px 16px"><span style="display:inline-block;width:22px;height:22px;line-height:22px;border-radius:6px;background:#18181b;color:#ffffff;font-size:12px;font-weight:700;text-align:center;vertical-align:middle">i</span><span style="margin-left:8px;font-size:15px;font-weight:600;letter-spacing:-.01em;vertical-align:middle;color:#18181b">Intentlock</span></td></tr>
<tr><td style="background:#ffffff;border:1px solid #e4e4e7;border-radius:14px;overflow:hidden">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td style="height:4px;background:${c.accent};font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="padding:28px 32px 0">
<p style="margin:0 0 10px;font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:${c.accent}">${escapeHtml(c.eyebrow)}</p>
<h1 style="margin:0;font-size:22px;line-height:1.3;font-weight:600;letter-spacing:-.01em;color:#18181b">${escapeHtml(c.title)}</h1>
<p style="margin:12px 0 0;color:#52525b">${escapeHtml(c.intro)}</p>
</td></tr>
${details}
${code}
<tr><td style="padding:28px 32px 32px">
<a href="${href}" style="display:inline-block;padding:12px 22px;background:#18181b;color:#ffffff;text-decoration:none;border-radius:9px;font-weight:600;font-size:14px">${escapeHtml(c.button.label)}</a>
${note}
<p style="margin:20px 0 0;padding-top:16px;border-top:1px solid #f0f0f2;font-size:12px;color:#a1a1aa">Button not working? Paste this link into your browser:<br><a href="${href}" style="color:#52525b;word-break:break-all">${href}</a></p>
</td></tr>
</table>
</td></tr>
<tr><td style="padding:20px 4px 0;font-size:12px;line-height:1.5;color:#a1a1aa">${escapeHtml(c.footer)}</td></tr>
</table>
</td></tr></table>
</body></html>
`;
}
