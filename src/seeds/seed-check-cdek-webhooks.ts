import 'dotenv/config';
import axios from 'axios';

const CDEK_ACCOUNT = process.env.CDEK_ACCOUNT;
const CDEK_PASSWORD = process.env.CDEK_PASSWORD;
const WEBHOOK_URL = (process.env.WEBHOOK_URL || '').trim();

if (!CDEK_ACCOUNT || !CDEK_PASSWORD) {
  console.error('[CDEK Webhooks] Missing CDEK_ACCOUNT or CDEK_PASSWORD');
  process.exit(1);
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
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

function normalizeWebhooks(payload: any): Array<Record<string, any>> {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.webhooks)) return payload.webhooks;
  if (payload?.entity) return [payload.entity];
  return [];
}

async function run() {
  const printRaw = hasFlag('print');
  const typeFilter = (readArgValue('type') || 'ORDER_STATUS').trim();
  const token = await getAccessToken();

  const response = await axios.get('https://api.cdek.ru/v2/webhooks', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (printRaw) {
    console.log('[CDEK Webhooks] Raw response:');
    console.dir(response.data, { depth: null, colors: true });
  }

  const items = normalizeWebhooks(response.data);
  console.log(`[CDEK Webhooks] total=${items.length}`);

  if (!items.length) {
    console.warn('[CDEK Webhooks] No webhooks found (or unexpected payload shape)');
    return;
  }

  const byType = new Map<string, number>();
  let byUrl = 0;
  let byTypeAndUrl = 0;

  for (const item of items) {
    const type = String(item?.type || '');
    const url = String(item?.url || '');
    if (type) byType.set(type, (byType.get(type) || 0) + 1);
    if (WEBHOOK_URL && url === WEBHOOK_URL) byUrl += 1;
    if (WEBHOOK_URL && type === typeFilter && url === WEBHOOK_URL) byTypeAndUrl += 1;
  }

  console.log(
    `[CDEK Webhooks] type=${typeFilter} count=${byType.get(typeFilter) || 0}`,
  );

  if (WEBHOOK_URL) {
    console.log(`[CDEK Webhooks] url=${WEBHOOK_URL} count=${byUrl}`);
    console.log(
      `[CDEK Webhooks] type+url match count=${byTypeAndUrl}`,
    );
  }

  const preview = items.slice(0, 10).map((item) => ({
    uuid: item?.uuid,
    type: item?.type,
    url: item?.url,
  }));
  console.log('[CDEK Webhooks] preview (first 10):');
  console.dir(preview, { depth: null, colors: true });
}

run().catch((error) => {
  console.error('[CDEK Webhooks] Fatal error', error?.message || error);
  process.exitCode = 1;
});
