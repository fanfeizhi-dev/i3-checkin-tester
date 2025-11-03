// scripts/derive-addresses.js
// 从 depth=0 根节点派生；支持 --n / --append / --start；输出：addresses.batch.json + addresses.last.json

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { ethers } from 'ethers';

dotenv.config();

// ---------- paths ----------
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR  = path.resolve(__dirname, '..');
const OUT_FILE  = path.resolve(ROOT_DIR, 'addresses.batch.json');
const LAST_FILE = path.resolve(ROOT_DIR, 'addresses.last.json');
const MN_FILE   = path.resolve(ROOT_DIR, 'wallets', 'mnemonic.txt');

// ---------- args ----------
const args = process.argv.slice(2);
function getArg(flag, defVal) {
  const hit = args.find(a => a === flag || a.startsWith(`${flag}=`));
  if (!hit) return defVal;
  if (hit.includes('=')) return hit.split('=')[1];
  const i = args.indexOf(hit);
  return (i >= 0 && args[i + 1] && !args[i + 1].startsWith('--')) ? args[i + 1] : true;
}

const N       = parseInt(getArg('--n', '3'), 10);   // 本批生成数量
const APPEND  = !!getArg('--append', false);        // 追加到现有清单
const START_C = getArg('--start', null);            // 指定起始 index（可选）

// ---------- read mnemonic ----------
function readMnemonic() {
  let mn = (process.env.TEST_MNEMONIC || '').trim();
  if (!mn && fs.existsSync(MN_FILE)) {
    mn = fs.readFileSync(MN_FILE, 'utf8').trim();
  }
  return mn.replace(/\s+/g, ' ').trim();
}
const MN = readMnemonic();
if (!MN) {
  console.error('缺少助记词：请在 .env(TEST_MNEMONIC) 或 wallets/mnemonic.txt 提供。');
  process.exit(1);
}

// ---------- get true root (depth = 0) ----------
let root;
try {
  const m = ethers.Mnemonic.fromPhrase(MN);
  const seed = m.computeSeed();
  root = ethers.HDNodeWallet.fromSeed(seed); // depth=0
} catch (e) {
  console.error('助记词无效（BIP39 校验失败或非法词）：', e?.message || e);
  process.exit(1);
}

// ---------- base list & start index ----------
let list = [];
let startIndex = 0;

if (APPEND && fs.existsSync(OUT_FILE)) {
  try {
    const parsed = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
    if (Array.isArray(parsed)) list = parsed;
  } catch { /* ignore */ }
  startIndex = list.length;
}

if (START_C !== null) {
  const s = parseInt(START_C, 10);
  if (!Number.isFinite(s) || s < 0) {
    console.error(`--start 的值无效：${START_C}`);
    process.exit(1);
  }
  startIndex = s;
}

// ---------- derive ----------
for (let i = 0; i < N; i++) {
  const idx = startIndex + i;
  const pathAbs = `m/44'/60'/0'/0/${idx}`;
  const child   = root.derivePath(pathAbs);
  list.push({ index: idx, address: child.address, privateKey: child.privateKey });
}

// ---------- write out ----------
fs.writeFileSync(OUT_FILE, JSON.stringify(list, null, 2));

const lastBatch = list
  .filter(x => x.index >= startIndex && x.index < startIndex + N)
  .sort((a, b) => a.index - b.index);

fs.writeFileSync(LAST_FILE, JSON.stringify(lastBatch, null, 2));

console.log(`已写入 ${OUT_FILE}：新增 ${N} 个地址 (start=${startIndex})，当前总数=${list.length}`);
console.log(`另外已写入 ${LAST_FILE}（仅包含本批 ${N} 个新地址）`);
