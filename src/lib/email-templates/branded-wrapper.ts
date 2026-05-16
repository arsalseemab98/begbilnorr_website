// src/lib/email-templates/branded-wrapper.ts
//
// Wraps any inner HTML in the Begbilnorr brand template: logo header,
// red accent line, dark card, footer. Used for all internal lead
// notifications (info@begbilnorr.se) so they look on-brand.

const SANS = `'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif`;

export function wrapBranded(opts: {
  title: string;
  preheader?: string;
  innerHtml: string;
}): string {
  const { title, preheader = '', innerHtml } = opts;
  return `<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <title>${escapeHtml(title)}</title>
</head>
${preheader ? `<div style="display:none;font-size:1px;color:#000;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(preheader)}</div>` : ''}
<body style="margin:0;padding:0;background:#000000;font-family:${SANS};color:#FFFFFF;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#000000;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width:600px;width:100%;">

        <!-- Header — logo -->
        <tr><td align="center" style="padding:8px 0 24px 0;">
          <img src="https://begbilnorr.se/images/begbilnorr-logo-nav.png" alt="Begbilnorr" width="150" height="90" style="display:block;margin:0 auto;border:0;outline:none;text-decoration:none;width:150px;height:90px;max-width:150px;">
        </td></tr>

        <!-- Red accent strip -->
        <tr><td style="height:3px;background:#E62E2D;line-height:3px;font-size:0;border-radius:2px 2px 0 0;">&nbsp;</td></tr>

        <!-- Body card -->
        <tr><td style="background:#111111;padding:36px 32px;border-radius:0 0 12px 12px;border:1px solid rgba(255,255,255,0.06);border-top:none;color:#FFFFFF;font-family:${SANS};font-size:15px;line-height:1.7;">
${innerHtml}
        </td></tr>

        <!-- Footer -->
        <tr><td align="center" style="padding:24px 16px 8px;font-family:${SANS};font-size:11px;color:rgba(255,255,255,0.35);line-height:1.7;">
          Begbilnorr · Fabriksvägen 18, 972 54 Luleå · <a href="https://begbilnorr.se" style="color:rgba(255,255,255,0.4);text-decoration:none;">begbilnorr.se</a>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
