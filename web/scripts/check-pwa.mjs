/**
 * Fail the build if the PWA manifest points at an asset that won't exist in
 * the deployed output.
 *
 * Why this exists: the manifest once listed PNG icons that were generated
 * locally but never made it into the deployed output, so production served a
 * manifest referencing 404s. Chrome then refused to install, and the only
 * symptom was a button that said "installing" and did nothing. A missing or
 * mislabelled icon must break the build, not the user's tap.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

const manifestPath = existsSync(join(dist, 'manifest.webmanifest'))
  ? join(dist, 'manifest.webmanifest')
  : join(root, 'public', 'manifest.webmanifest');

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch (err) {
  console.error(`x Could not read ${manifestPath}: ${err.message}`);
  process.exit(1);
}

const problems = [];
const check = (cond, msg) => {
  if (!cond) problems.push(msg);
};

check(manifest.name, 'manifest: missing "name"');
check(manifest.short_name, 'manifest: missing "short_name"');
check(manifest.start_url, 'manifest: missing "start_url"');
check(
  ['standalone', 'minimal-ui', 'fullscreen'].includes(manifest.display),
  `manifest: display "${manifest.display}" is not installable`,
);

const icons = manifest.icons ?? [];
// Chrome's hard requirement for installability.
check(
  icons.some((i) => i.sizes === '192x192' && i.type === 'image/png'),
  'manifest: no 192x192 PNG icon (Chrome will not install)',
);
check(
  icons.some((i) => i.sizes === '512x512' && i.type === 'image/png'),
  'manifest: no 512x512 PNG icon (Chrome will not install)',
);
check(
  icons.some((i) => i.purpose === 'maskable'),
  'manifest: no maskable icon',
);

// Verify every declared src exists in the OUTPUT (dist/) - that is what gets
// deployed, and an icon present only in public/ is exactly the failure this
// guard is for.
for (const icon of icons) {
  const src = icon.src.replace(/^\//, '');
  const inDist = join(dist, src);
  const inPublic = join(root, 'public', src);
  /*
   * If dist/ exists, that is the ONLY thing that matters - it is what gets
   * deployed. Falling back to public/ there would hide a file that exists in
   * the repo but never made it into the build output, which is precisely the
   * failure this guard exists to catch. The fallback applies only when the
   * check runs before a build (no dist/ yet).
   */
  const where = existsSync(dist)
    ? existsSync(inDist)
      ? inDist
      : null
    : existsSync(inPublic)
      ? inPublic
      : null;
  if (!where) {
    problems.push(
      `manifest icon "${icon.src}" is missing from ${existsSync(dist) ? 'dist/ (the deployed output)' : 'public/'}`,
    );
    continue;
  }
  if (statSync(where).size === 0) problems.push(`manifest icon "${icon.src}" is empty`);

  // A mislabelled icon is rejected exactly like a missing one, so verify the
  // declared pixel size against the real PNG header.
  if (src.endsWith('.png') && /^\d+x\d+$/.test(icon.sizes)) {
    const buf = readFileSync(where);
    const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (!buf.subarray(0, 8).equals(pngMagic)) {
      problems.push(`manifest icon "${icon.src}" is not a real PNG`);
    } else {
      const w = buf.readUInt32BE(16);
      const h = buf.readUInt32BE(20);
      if (`${w}x${h}` !== icon.sizes) {
        problems.push(`manifest icon "${icon.src}" claims ${icon.sizes} but is ${w}x${h}`);
      }
    }
  }
}

if (problems.length) {
  console.error('\nx PWA check failed:\n');
  for (const p of problems) console.error('  -', p);
  console.error('\nThe app would not be installable. Fix these before deploying.\n');
  process.exit(1);
}
console.log(`PWA manifest OK (${icons.length} icons, all present and correctly sized)`);
