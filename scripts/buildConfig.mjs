import { promises as fs } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const rootDir = resolve(__dirname, '..');
export const distDir = join(rootDir, 'dist');

export const alias = {
  '@common': join(rootDir, 'src', 'common'),
  '@main': join(rootDir, 'src', 'main'),
  '@renderer': join(rootDir, 'src', 'renderer'),
};

export const define = {
  'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
};

export function createMainBuildOptions() {
  return {
    entryPoints: [join(rootDir, 'src', 'main', 'main.ts')],
    outfile: join(distDir, 'main', 'main.js'),
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    sourcemap: true,
    external: ['electron'],
    alias,
    define,
    logLevel: 'silent',
  };
}

export function createPreloadBuildOptions() {
  return {
    entryPoints: [join(rootDir, 'src', 'main', 'preload.ts')],
    outfile: join(distDir, 'main', 'preload.js'),
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    sourcemap: true,
    external: ['electron'],
    alias,
    define,
    logLevel: 'silent',
  };
}

export function createRendererBuildOptions() {
  return {
    entryPoints: [join(rootDir, 'src', 'renderer', 'index.ts')],
    outdir: join(distDir, 'renderer'),
    bundle: true,
    platform: 'browser',
    target: 'es2020',
    format: 'esm',
    sourcemap: true,
    alias,
    define,
    logLevel: 'silent',
  };
}

export async function copyStaticAssets() {
  const htmlSrc = join(rootDir, 'src', 'renderer', 'index.html');
  const htmlDest = join(distDir, 'renderer', 'index.html');
  const cssSrc = join(rootDir, 'assets', 'styles.css');
  const cssDest = join(distDir, 'renderer', 'styles.css');

  await ensureDir(dirname(htmlDest));
  await ensureDir(dirname(cssDest));

  await fs.copyFile(htmlSrc, htmlDest);
  await fs.copyFile(cssSrc, cssDest);
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}
