#!/usr/bin/env node
/**
 * Dependency-free structural check for the plugin package.
 *
 * It validates the manifest, the bundle patch, and the two JavaScript halves
 * without mounting them, so CI catches drift between the package name, the
 * Loader row, and the browser module id.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

function read(name) {
  return readFileSync(join(root, name), 'utf8');
}

function regexEscape(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* -------------------------------------------------------------- package.json */

let pkg = null;
try {
  pkg = JSON.parse(read('package.json'));
} catch (error) {
  failures.push(`package.json is not valid JSON: ${error.message}`);
}

if (pkg !== null) {
  check(/^[a-z0-9][a-z0-9._-]*$/.test(pkg.name ?? ''), 'package name must be an unscoped npm name');
  check(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(pkg.version ?? ''), 'version must be semver');
  check(pkg.type === 'module', 'package must be type: module');
  check(pkg.license === 'MIT', 'license must be MIT');
  check(pkg.engines?.node === '>=20', 'engines.node must be ">=20"');
  check(pkg.exports?.['.'] === './index.js', 'exports["."] must point at index.js');
  check(pkg.exports?.['./client'] === './client.js', 'exports["./client"] must point at client.js');
  check(pkg.exports?.['./package.json'] === './package.json', 'exports must expose ./package.json');
  check(pkg.dsh?.bundle?.patch === './cordis.patch.yml', 'dsh.bundle.patch must point at cordis.patch.yml');
  check(pkg.dsh?.client?.platform === 'web', 'dsh.client.platform must be web');
  check(pkg.dsh?.client?.immediately === true, 'dsh.client.immediately must be true');
  check(Array.isArray(pkg.dsh?.client?.inject) && pkg.dsh.client.inject.length > 0, 'dsh.client.inject must order the slot owners');
  check(!pkg.dependencies || Object.keys(pkg.dependencies).length === 0, 'the runtime bundle carries no npm dependencies');
  check(!pkg.icon || existsSync(join(root, pkg.icon)), 'declared icon file must exist');
}

/* ----------------------------------------------------------- bundle patch */

const patch = read('cordis.patch.yml');
check(!/\t/.test(patch), 'cordis.patch.yml must not contain tabs');
check(/^\s*-\s*insert:\s*$/m.test(patch), 'cordis.patch.yml must insert one row list');
if (pkg !== null) {
  const name = new RegExp(`name:\\s*['"]?${regexEscape(pkg.name)}['"]?\\s*$`, 'm');
  check(name.test(patch), `cordis.patch.yml must name the package ${pkg.name}`);
}
check(/id:\s*workspace-hud\s*$/m.test(patch), 'cordis.patch.yml must declare the workspace-hud row id');

/* ------------------------------------------------------------ host half */

const host = read('index.js');
check(/export function apply\s*\(/.test(host), 'index.js must export apply()');
check(!/require\(|from\s+['"][^'"]+['"]/.test(host), 'the host half must not import other modules');

/* ---------------------------------------------------------- client half */

const client = read('client.js');
check(client.startsWith('window.__ModuleLoader__.load({'), 'client.js must register through window.__ModuleLoader__.load');
if (pkg !== null) {
  check(client.includes(`id: '${pkg.name}'`), `the browser module id must equal the package name (${pkg.name})`);
}
check(!/require\(['"]@deepseek-ai\//.test(client), 'client.js must not require Harness client packages');
check(/react/.test(client), 'client.js must render with the platform React module');
check(client.includes("ctx.slots.inject('shell.overlay'"), 'client.js must register into the shell.overlay slot');
check(client.includes('workspaceFiles'), 'client.js must read workspace files through remote.workspaceFiles');
check(client.includes('getBalance'), 'client.js must read the account balance');
check(client.includes('session.list'), 'client.js must aggregate token usage from the session list');

/* --------------------------------------------------------------- docs */

for (const file of ['LICENSE', 'README.md', 'README.zh.md', 'assets/preview.png']) {
  check(existsSync(join(root, file)), `${file} is missing`);
}

/* --------------------------------------------------------------- report */

if (failures.length > 0) {
  console.error(`workspace-hud check failed (${failures.length}):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`workspace-hud check passed (${pkg.name}@${pkg.version})`);
