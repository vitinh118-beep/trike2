'use strict';
// Đóng gói toàn bộ mã client + Three.js thành một file dist/bundle.js (chạy offline, không cần CDN).
const esbuild = require('esbuild');

const minify = process.argv.includes('--min');

esbuild
  .build({
    entryPoints: ['src/main.js'],
    bundle: true,
    outfile: 'dist/bundle.js',
    format: 'iife',
    target: 'chrome120',
    sourcemap: !minify,
    minify,
    loader: { '.json': 'json' },
    logLevel: 'info',
  })
  .then(() => console.log(minify ? 'Build (nén) xong.' : 'Build xong.'))
  .catch(() => process.exit(1));
