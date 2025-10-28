import { build } from 'esbuild';
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
const buildWatchers = [];

async function start() {
  await copyStaticAssets();
  staticWatcher = await watchStaticAssets();

  const [mainWatcher, preloadWatcher, rendererWatcher] = await Promise.all([
    build({
      ...createMainBuildOptions(),
      watch: {
        onRebuild(error) {
          if (error) {
            console.error('[main] build failed:', error);
          } else {
            console.log('[main] rebuilt');
            restartElectron();
          }
        },
      },
    }),
    build({
      ...createPreloadBuildOptions(),
      watch: {
        onRebuild(error) {
          if (error) {
            console.error('[preload] build failed:', error);
          } else {
            console.log('[preload] rebuilt');
            restartElectron();
          }
        },
      },
    }),
    build({
      ...createRendererBuildOptions(),
      watch: {
        onRebuild(error) {
          if (error) {
            console.error('[renderer] build failed:', error);
          } else {
            console.log('[renderer] rebuilt');
          }
        },
      },
    }),
  ]);

  buildWatchers.push(mainWatcher, preloadWatcher, rendererWatcher);

  startElectron();

  const cleanUp = async () => {
    await Promise.all(
      buildWatchers.map(async watcher => {
        if (watcher?.stop) {
          await watcher.stop();
        }
      }),
    );
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
