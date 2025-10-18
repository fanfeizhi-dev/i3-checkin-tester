// scripts/derive-addresses.js
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { ethers } from 'ethers';

dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const getArg = (k, def) => {
  const hit = args.find(a => a === k || a.startsWith(`${k}=`));
  if (!hit) return def;
  if (hit.includes('=')) return hit.split('=')[1];
  const i = args.indexOf(hit);
  return (i >= 0 && args[i+1] && !args[i+1].startsWith('--')) ? args[i+1] : true;
};

const N = parseInt(getArg('--n', '2'), 10);
const START = parseInt(getArg('--start', '0'), 10);
const APPEND = !!getArg('--append', false);

const MN = (process.env.TEST_MNEMONIC || '').trim() ||
          (fs.existsSync(path.resolve(ROOT, 'wallets/mnemonic.txt'))
            ? fs.readFileSync(path.resolve(ROOT,'wallets/mnemonic.txt'),'utf8').trim()
            : '');

if (!MN) throw new Error('缺少助记词：请在 .env(TEST_MNEMONIC) 或 wallets/mnemonic.txt 提供');

const hd = ethers.HDNodeWallet.fromPhrase(MN);
const outFile = path.resolve(ROOT, 'addresses.batch.json');

let out = [];
if (APPEND && fs.existsSync(outFile)) {
  out = JSON.parse(fs.readFileSync(outFile, 'utf8'));
}

for (let i = 0; i < N; i++) {
  const idx = START + i;
  const pathDerive = `m/44'/60'/0'/0/${idx}`;
  const child = hd.derivePath(pathDerive);
  out.push({
    index: idx,
    address: child.address,
    privateKey: child.privateKey
  });
}

fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
console.log(`已写入 ${outFile}，新增 ${N} 地址 (start=${START})，当前总数=${out.length}`);
