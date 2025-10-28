import { build } from 'esbuild';
import {
  copyStaticAssets,
  createMainBuildOptions,
  createPreloadBuildOptions,
  createRendererBuildOptions,
} from './buildConfig.mjs';

async function runBuild() {
  const mainOptions = { ...createMainBuildOptions(), logLevel: 'info' };
  const preloadOptions = { ...createPreloadBuildOptions(), logLevel: 'info' };
  const rendererOptions = { ...createRendererBuildOptions(), logLevel: 'info' };

  await Promise.all([build(mainOptions), build(preloadOptions), build(rendererOptions)]);

  await copyStaticAssets();
}

runBuild().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
