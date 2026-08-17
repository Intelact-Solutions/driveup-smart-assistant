import fs from 'node:fs/promises';
import path from 'node:path';
import { config, projectRoot } from '../src/config.js';

const repoRoot = path.resolve(projectRoot, '..');
const LANGUAGES = ['de', 'fr', 'it'];

const MOBILE_ARB = (lang: string) =>
  path.join(repoRoot, 'driveup-mobile', 'lib', 'l10n', 'arb', `app_${lang}.arb`);
const ADMIN_I18N = (lang: string) =>
  path.join(repoRoot, 'driveup-admin', 'public', 'i18n', `${lang}.json`);

function flatten(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(out, flatten(v as Record<string, unknown>, key));
    } else if (typeof v === 'string') {
      out[key] = v;
    }
  }
  return out;
}

function isValidLabel(s: string): boolean {
  return Boolean(s && s.trim() && !s.includes('{') && !s.includes('\n') && s.length <= 40);
}

async function readStringDict(filePath: string): Promise<Record<string, string>> {
  const raw = JSON.parse(await fs.readFile(filePath, 'utf8')) as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k.startsWith('@')) continue;
    if (typeof v === 'string') out[k] = v;
  }
  return out;
}

async function buildLanguageMap(lang: string): Promise<Record<string, string>> {
  const enArb = await readStringDict(MOBILE_ARB('en'));
  const arb = await readStringDict(MOBILE_ARB(lang));
  const enAdmin = flatten(await readStringDict(ADMIN_I18N('en')));
  const admin = flatten(await readStringDict(ADMIN_I18N(lang)));

  const map: Record<string, string> = {};
  for (const [key, enValue] of Object.entries(enArb)) {
    const loc = arb[key];
    if (isValidLabel(enValue) && isValidLabel(loc) && enValue !== loc && !(enValue in map)) {
      map[enValue] = loc;
    }
  }
  for (const [key, enValue] of Object.entries(enAdmin)) {
    const loc = admin[key];
    if (isValidLabel(enValue) && isValidLabel(loc) && enValue !== loc && !(enValue in map)) {
      map[enValue] = loc;
    }
  }
  return map;
}

async function main(): Promise<void> {
  const result: Record<string, Record<string, string>> = {};
  for (const lang of LANGUAGES) {
    result[lang] = await buildLanguageMap(lang);
    console.log(`${lang}: ${Object.keys(result[lang]).length} labels`);
  }

  await fs.mkdir(path.dirname(config.labelsPath), { recursive: true });
  await fs.writeFile(config.labelsPath, JSON.stringify(result));
  console.log(`Wrote ${config.labelsPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});