import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.resolve(__dirname, '..', 'addresses.batch.json');

export function loadAddresses(requiredN) {
  if (!fs.existsSync(CACHE)) {
    throw new Error(`addresses.batch.json 不存在。请先运行: npm run derive:2 或 derive:10`);
  }
  const all = JSON.parse(fs.readFileSync(CACHE, 'utf-8'));
  if (requiredN && all.length < requiredN) {
    throw new Error(`地址数量不足: 需要 ${requiredN}, 实际 ${all.length}`);
  }
  return requiredN ? all.slice(0, requiredN) : all;
}
