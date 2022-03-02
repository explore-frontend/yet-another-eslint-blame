const esbuild = require('esbuild');

esbuild.build({
    entryPoints: [
        './src/index.ts',
        './src/cli.ts'
    ],
    bundle: false,
    format: 'cjs',
    platform: 'node',
    sourcemap: true,
    outdir: './dist',
})
