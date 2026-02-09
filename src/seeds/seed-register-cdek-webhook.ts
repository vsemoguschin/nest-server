import 'dotenv/config';
import axios from 'axios';

const CDEK_ACCOUNT = process.env.CDEK_ACCOUNT;
const CDEK_PASSWORD = process.env.CDEK_PASSWORD;
const WEBHOOK_URL = (process.env.WEBHOOK_URL || '').trim();

if (!CDEK_ACCOUNT || !CDEK_PASSWORD) {
  console.error('[CDEK Webhook] Missing CDEK_ACCOUNT or CDEK_PASSWORD');
  process.exit(1);
}

function readArgValue(name: string): string | null {
  const flag = `--${name}`;
  const arg = process.argv.find((item) => item === flag || item.startsWith(`${flag}=`));
  if (!arg) return null;
  if (arg === flag) {
    const index = process.argv.indexOf(arg);
    const next = process.argv[index + 1];
    if (!next || next.startsWith('--')) return null;
    return next;
  }
  const [, value] = arg.split('=');
  return value ?? null;
}

async function getAccessToken(): Promise<string> {
  const response = await axios.post(
    'https://api.cdek.ru/v2/oauth/token',
    new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CDEK_ACCOUNT || '',
      client_secret: CDEK_PASSWORD || '',
    }),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    },
  );

  return response.data.access_token;
}

async function run() {
  const type = (readArgValue('type') || 'ORDER_STATUS').trim();
  const url = (readArgValue('url') || WEBHOOK_URL).trim();

  if (!url) {
    console.error('[CDEK Webhook] Missing WEBHOOK_URL or --url');
    process.exit(1);
  }

  const token = await getAccessToken();
  const response = await axios.post(
    'https://api.cdek.ru/v2/webhooks',
    { type, url },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    },
  );

  console.log('[CDEK Webhook] Created');
  console.dir(response.data, { depth: null, colors: true });
}

run().catch((error) => {
  const message = error?.response?.data || error?.message || error;
  console.error('[CDEK Webhook] Fatal error', message);
  process.exitCode = 1;
});
