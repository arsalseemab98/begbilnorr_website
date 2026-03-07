interface SendEmailOptions {
  to: string[];
  subject: string;
  html: string;
  replyTo?: string;
}

async function getAccessToken(): Promise<string> {
  const tenantId = import.meta.env.AZURE_TENANT_ID;
  const clientId = import.meta.env.AZURE_CLIENT_ID;
  const clientSecret = import.meta.env.AZURE_CLIENT_SECRET;

  const res = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to get Azure token: ${err}`);
  }

  const data = await res.json();
  return data.access_token;
}

export async function sendEmail(options: SendEmailOptions): Promise<void> {
  const token = await getAccessToken();
  const from = 'info@begbilnorr.se';

  const message: Record<string, unknown> = {
    subject: options.subject,
    body: {
      contentType: 'HTML',
      content: options.html,
    },
    toRecipients: options.to.map((email) => ({
      emailAddress: { address: email },
    })),
  };

  if (options.replyTo) {
    message.replyTo = [
      { emailAddress: { address: options.replyTo } },
    ];
  }

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${from}/sendMail`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message, saveToSentItems: true }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to send email via Graph API: ${err}`);
  }
}
