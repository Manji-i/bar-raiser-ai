import { db } from '../services/db.js';
import { bootstrapAdmin } from '../services/adminBootstrapService.js';

const input = await new Promise((resolve, reject) => {
  let value = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { value += chunk; });
  process.stdin.on('end', () => resolve(value));
  process.stdin.on('error', reject);
});

const [username = '', password = '', email = ''] = input.split(/\r?\n/);

try {
  const admin = await bootstrapAdmin(db, { username, password, email: email || null });
  console.log(`Created administrator ${admin.id}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Admin bootstrap failed');
  process.exitCode = 1;
}
