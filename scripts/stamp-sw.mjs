// Browsers reinstall a service worker only when its bytes change, and an installed
// worker keeps the security headers (CSP) it was first fetched with. Angular's worker
// is identical across our releases, so stamp the version to make each release new.
import { appendFileSync, readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
appendFileSync('www/ngsw-worker.js', `\n// app ${version}\n`);
