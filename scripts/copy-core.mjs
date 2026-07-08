import { cpSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const variants = ['umd', 'esm'];
const srcBase = resolve('node_modules/@ffmpeg/core/dist');
const destBase = resolve('public/ffmpeg');

if (existsSync(srcBase)) {
  for (const variant of variants) {
    const src = resolve(srcBase, variant);
    const dest = resolve(destBase, variant);
    if (existsSync(src)) {
      mkdirSync(dest, { recursive: true });
      cpSync(src, dest, { recursive: true });
      console.log(`Copied @ffmpeg/core (${variant}) to public/ffmpeg/${variant}/`);
    }
  }
} else {
  console.warn('@ffmpeg/core not found, skipping copy');
}
