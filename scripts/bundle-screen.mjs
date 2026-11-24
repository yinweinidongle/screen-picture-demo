import { build } from 'esbuild';

const { outputFiles } = await build({
  entryPoints: [process.argv[2]],
  platform: 'browser',
  target: 'es2022',
  format: 'iife',
  bundle: true,
  minify: true,
  legalComments: 'inline',
  write: false,
});
process.stdout.write(outputFiles[0].contents);
