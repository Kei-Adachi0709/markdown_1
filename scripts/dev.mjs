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
const watchContexts = [];

async function start() {
  await copyStaticAssets();
  staticWatcher = await watchStaticAssets();

  const [mainContext, preloadContext, rendererContext] = await Promise.all([
    createWatchContext('main', createMainBuildOptions(), () => restartElectron()),
    createWatchContext('preload', createPreloadBuildOptions(), () => restartElectron()),
    createWatchContext('renderer', createRendererBuildOptions()),
  ]);

  watchContexts.push(mainContext, preloadContext, rendererContext);

  startElectron();

  const cleanUp = async () => {
    await Promise.all(watchContexts.map(ctx => ctx.dispose()));
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

async function createWatchContext(name, options, onSuccessfulBuild) {
  let isInitialBuild = true;

  const plugins = [...(options.plugins ?? [])];
  plugins.push({
    name: `notify-${name}`,
    setup(build) {
      build.onEnd(result => {
        if (result.errors.length > 0) {
          console.error(`[${name}] build failed`);
          for (const error of result.errors) {
            console.error(error);
          }
          return;
        }

        const label = isInitialBuild ? '[build]' : '[rebuild]';
        console.log(`${label} ${name}`);

        if (isInitialBuild) {
          isInitialBuild = false;
        } else if (onSuccessfulBuild) {
          onSuccessfulBuild();
        }
      });
    },
  });

  const ctx = await context({
    ...options,
    plugins,
  });

  try {
    if (ctx.rebuild) {
      await ctx.rebuild();
    }
  } catch (error) {
    console.error(`[${name}] initial build failed`, error);
  }

  await ctx.watch();
  return ctx;
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
