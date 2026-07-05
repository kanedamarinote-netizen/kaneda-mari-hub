// @ts-check
import { defineConfig } from 'astro/config';

// GitHub Pages (プロジェクトページ) 向け設定。
// build.format 'file' で /archive.html /articles/nXXX.html の現行URLを維持する。
export default defineConfig({
  site: 'https://kanedamarinote-netizen.github.io',
  base: '/kaneda-mari-hub',
  trailingSlash: 'never',
  build: {
    format: 'file',
  },
});
