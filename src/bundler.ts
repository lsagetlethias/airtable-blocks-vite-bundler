import * as vite from 'vite';
import react from '@vitejs/plugin-react-swc';
import fs from 'fs';
import path from 'path';
import type { OutputBundle, OutputChunk, RollupOptions, InputOption } from 'rollup';

import {
  RunTaskConsumer,
  RunDevServerOptions,
  BuildStatus,
  RunDevServerMethods,
  ReleaseTaskConsumer,
  ReleaseBundleOptions,
  SubmitFindDependenciesOptions,
  SubmitTaskConsumer,
} from '@airtable/blocks-cli';

type CustomizeViteConfigFn = (baseConfig: vite.UserConfig) => vite.UserConfig;

function makeLiveReloadPlugin(port: number, https: boolean): vite.Plugin {
  return {
    name: 'airtable-live-reload',
    enforce: 'pre',
    resolveId(id) {
      if (id === 'virtual:live-reload') {
        return id;
      }
    },
    load(id) {
      if (id === 'virtual:live-reload') {
        const filePath = path.join(__dirname, 'live-reload-and-report-disconnection.js');
        let contents = fs.readFileSync(filePath, 'utf8');
        contents = contents
          .replace('[REPLACE_PORT]', `${port}`)
          .replace('[REPLACE_PROTOCOL]', https ? 'https' : 'http');
        return contents;
      }
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/live-reload-and-report-disconnection.js') {
          const filePath = path.join(__dirname, 'live-reload-and-report-disconnection.js');
          let contents = fs.readFileSync(filePath, 'utf8');
          contents = contents
            .replace('[REPLACE_PORT]', `${port}`)
            .replace('[REPLACE_PROTOCOL]', https ? 'https' : 'http');
          res.setHeader('Content-Type', 'application/javascript');
          res.end(contents);
          return;
        }
        next();
      });
    },
  };
}

class Bundler implements RunTaskConsumer, ReleaseTaskConsumer, SubmitTaskConsumer {
  viteServer?: vite.ViteDevServer;
  customizeViteConfig?: CustomizeViteConfigFn;

  constructor(customizeViteConfig?: CustomizeViteConfigFn) {
    this.customizeViteConfig = customizeViteConfig;
  }

  _createViteConfig(options: vite.UserConfig): vite.UserConfig {
    const root = options.root || process.cwd();

    const baseConfig: vite.UserConfig & Record<string, unknown> = {
      root,
      server: options.server,
      build: options.build || { outDir: 'dist' },
      plugins: options.plugins || [],
    };

    // ensure runtime option present without widening `vite.UserConfig`
    baseConfig['configFile'] = false;

    // Preserve provided rollup input if present; do not inject live-reload here.
    const incomingBuild = options.build;
    if (incomingBuild && incomingBuild.rollupOptions?.input) {
      const buildOpts = baseConfig.build!;
      buildOpts.rollupOptions ||= {};
      buildOpts.rollupOptions.input = incomingBuild.rollupOptions.input;
    }

    const merged: vite.UserConfig = {
      ...options,
      ...baseConfig,
      plugins: [react(), ...(baseConfig.plugins || [])],
    };

    return this.customizeViteConfig ? this.customizeViteConfig(merged) : merged;
  }

  async findDependenciesAsync(options: SubmitFindDependenciesOptions & Partial<vite.UserConfig>) {
    const files = new Set<string>();

    const depsPlugin: vite.Plugin = {
      name: 'airtable-collect-deps',
      generateBundle(_outputOptions, bundle: OutputBundle) {
        for (const fileName of Object.keys(bundle)) {
          const chunk = bundle[fileName] as OutputChunk | undefined;
          if (chunk && chunk.modules) {
            const modules = chunk.modules as Record<string, unknown>;
            for (const modId of Object.keys(modules)) {
              try {
                const resolved = path.isAbsolute(modId) ? modId : path.resolve(modId);
                files.add(resolved);
              } catch (_) {
                // ignore
              }
            }
          }
        }
      },
    };

    const opts = options as Partial<vite.UserConfig> & { plugins?: vite.Plugin[] };
    const incomingPlugins = opts.plugins || [];
    const buildIn = opts.build as vite.BuildOptions | undefined;
    const composedOptions: Partial<vite.UserConfig> = {
      ...opts,
      plugins: incomingPlugins.concat(depsPlugin),
      build: { ...(buildIn || {}), write: false, ssr: false },
    };

    const config = this._createViteConfig(composedOptions);

    try {
      await vite.build(config);
    } catch (err) {
      // still collect any files discovered before failure
      throw err;
    }

    // include common project files
    for (const file of [
      'package.json',
      'package-lock.json',
      'yarn.lock',
      'pnpm-lock.yaml',
      'tailwind.config.js',
    ]) {
      const p = path.join(process.cwd(), file);
      if (fs.existsSync(p)) {
        files.add(p);
      }
    }

    return { files: Array.from(files) };
  }

  async bundleAsync(bundlingOptions: ReleaseBundleOptions) {
    const config = this._createViteConfig(bundlingOptions);
    await vite.build(config);
  }

  async startDevServerAsync({
    port,
    emitBuildState,
    ...bundlingOptions
  }: RunDevServerOptions & RunDevServerMethods) {
    const opts = bundlingOptions as Partial<vite.UserConfig> & { plugins?: vite.Plugin[] };
    const config = this._createViteConfig(opts);

    // Create live-reload plugin for the dev server and attach it here.
    const serverOpts = opts.server as vite.ServerOptions | undefined;
    const https = Boolean(serverOpts && (serverOpts as any).https);
    const liveReloadPlugin = makeLiveReloadPlugin(port, https);
    config.plugins = [...(config.plugins || []), liveReloadPlugin];

    // If an input is already provided, prepend the virtual live-reload module
    // so it's executed before the user's entry points in dev.
    const buildOpts =
      (config.build as vite.BuildOptions) ||
      (config.build = { outDir: 'dist' } as vite.BuildOptions);
    const rollupOpts = (buildOpts.rollupOptions || {}) as RollupOptions;
    const existingInput = rollupOpts.input as InputOption | undefined;
    if (existingInput) {
      rollupOpts.input = Array.isArray(existingInput)
        ? (['virtual:live-reload', ...existingInput] as InputOption)
        : (['virtual:live-reload', existingInput] as unknown as InputOption);
      buildOpts.rollupOptions = rollupOpts;
    }

    const server = await vite.createServer({ ...config, server: { port } });
    this.viteServer = server;

    // Watcher events: signal building/ready states roughly
    server.watcher.on('all', () => {
      emitBuildState({ status: BuildStatus.BUILDING });
    });

    // Vite doesn't expose a direct "done" hook here; mark ready when server is listening
    await server.listen();
    emitBuildState({ status: BuildStatus.READY });
  }

  async teardownAsync() {
    if (this.viteServer) {
      await this.viteServer.close();
    }
  }
}

export default async function (customizeViteConfig?: CustomizeViteConfigFn): Promise<Bundler> {
  return new Bundler(customizeViteConfig);
}
