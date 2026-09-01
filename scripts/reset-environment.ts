const environment = process.argv[2];
if (!['development', 'preview', 'production'].includes(environment ?? '')) {
  console.error('Usage: bun run reset <development|preview|production>');
  process.exit(1);
}

const token = process.env.RESET_ADMIN_TOKEN;
if (!token) {
  console.error('RESET_ADMIN_TOKEN is required.');
  process.exit(1);
}

const endpoint = {
  development: process.env.RUNDOWN_DEVELOPMENT_URL ?? 'http://localhost:3000',
  preview: process.env.RUNDOWN_PREVIEW_URL,
  production: process.env.RUNDOWN_PRODUCTION_URL ?? 'https://rundown-app.dev',
}[environment!];
if (!endpoint) {
  console.error(`Set RUNDOWN_${environment!.toUpperCase()}_URL before running this reset.`);
  process.exit(1);
}

const response = await fetch(new URL('/api/admin/reset', endpoint), {
  method: 'POST',
  headers: {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
  },
  body: JSON.stringify({ environment }),
});
const result: unknown = await response.json();
console.log(JSON.stringify(result, null, 2));
if (!response.ok) process.exit(1);
