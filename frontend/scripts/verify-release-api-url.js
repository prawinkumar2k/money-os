// Guards the Android/iOS release build pipeline: refuses to proceed if VITE_API_URL is missing,
// still points at localhost/a private dev host, or isn't https://. Vite bakes this value into the
// compiled JS bundle at build time — there is no way to fix it after the fact short of rebuilding,
// so catching it here (before cap sync / a Gradle build even runs) is the only real safeguard
// against accidentally shipping a release build that can never reach a real backend.
const url = process.env.VITE_API_URL;

function fail(message) {
  console.error(`\n✖ Release build blocked: ${message}\n`);
  console.error("Set a real production API URL, e.g.:");
  console.error('  VITE_API_URL=https://api.yourdomain.com/api npm run cap:sync:release\n');
  process.exit(1);
}

if (!url) {
  fail("VITE_API_URL is not set.");
}
if (!url.startsWith("https://")) {
  fail(`VITE_API_URL must be https:// — got "${url}".`);
}
if (/localhost|127\.0\.0\.1|10\.0\.2\.2|0\.0\.0\.0/.test(url)) {
  fail(`VITE_API_URL looks like a local/dev address, not a real deployed backend — got "${url}".`);
}

console.log(`✓ Release API URL looks like a real production endpoint: ${url}`);
