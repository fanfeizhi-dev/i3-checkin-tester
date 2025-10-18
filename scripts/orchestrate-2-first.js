import { execSync } from 'node:child_process';
process.env.PLAN = 'plan2';
execSync('node scripts/derive-addresses.js --n=2', { stdio: 'inherit' });
execSync('npm run fund', { stdio: 'inherit' });
execSync('npm run checkin', { stdio: 'inherit' });

