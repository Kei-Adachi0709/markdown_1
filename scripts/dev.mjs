import { context } from 'esbuild';
import chokidar from 'chokidar';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import process from 'node:process';
import {
  copyStaticAssets,
  createMainBuildOptions,
  createPreloadBuildOptions,
  createRendererBuildOptions,
  distDir,
  rootDir,
} from './buildConfig.mjs';

let electronProcess = null;
let isRestarting = false;
let staticWatcher = null;

async function start() {
  await copyStaticAssets();
  staticWatcher = await watchStaticAssets();

  const mainCtx = await context(createMainBuildOptions());
  const preloadCtx = await context(createPreloadBuildOptions());
  const rendererCtx = await context(createRendererBuildOptions());

  await Promise.all([mainCtx.rebuild(), preloadCtx.rebuild(), rendererCtx.rebuild()]);

  await Promise.all([
    mainCtx.watch({
      onRebuild(error) {
        if (error) {
          console.error('[main] build failed:', error);
        } else {
          console.log('[main] rebuilt');
          restartElectron();
        }
      },
    }),
    preloadCtx.watch({
      onRebuild(error) {
        if (error) {
          console.error('[preload] build failed:', error);
        } else {
          console.log('[preload] rebuilt');
          restartElectron();
        }
      },
    }),
    rendererCtx.watch({
      onRebuild(error) {
        if (error) {
          console.error('[renderer] build failed:', error);
        } else {
          console.log('[renderer] rebuilt');
        }
      },
    }),
  ]);

  startElectron();

  const cleanUp = async () => {
    await Promise.all([mainCtx.dispose(), preloadCtx.dispose(), rendererCtx.dispose()]);
    if (staticWatcher) {
      await staticWatcher.close();
    }
    stopElectron();
    process.exit(0);
  };

  process.on('SIGINT', cleanUp);
  process.on('SIGTERM', cleanUp);
}

function startElectron() {
  const electronBinary = process.platform === 'win32'
    ? join(rootDir, 'node_modules', '.bin', 'electron.cmd')
    : join(rootDir, 'node_modules', '.bin', 'electron');

  electronProcess = spawn(electronBinary, [join(distDir, 'main', 'main.js')], {
    stdio: 'inherit',
    shell: false,
  });

  electronProcess.on('exit', code => {
    if (!isRestarting) {
      process.exit(code ?? 0);
    }
  });
}

function restartElectron() {
  if (isRestarting) {
    return;
  }
  if (!electronProcess) {
    startElectron();
    return;
  }

  isRestarting = true;
  electronProcess.once('exit', () => {
    isRestarting = false;
    startElectron();
  });
  electronProcess.kill();
}

function stopElectron() {
  if (electronProcess) {
    electronProcess.kill();
    electronProcess = null;
  }
  isRestarting = false;
}

async function watchStaticAssets() {
  const watcher = chokidar.watch([
    join(rootDir, 'src', 'renderer', 'index.html'),
    join(rootDir, 'assets', '**/*'),
  ], {
    ignoreInitial: true,
  });

  watcher.on('all', async (event, filePath) => {
    console.log(`[static] ${event}: ${filePath}`);
    try {
      await copyStaticAssets();
      restartElectron();
    } catch (error) {
      console.error('[static] copy failed:', error);
    }
  });

  return watcher;
}

start().catch(error => {
  console.error(error);
  stopElectron();
  if (staticWatcher) {
    void staticWatcher.close();
  }
  process.exit(1);
});
