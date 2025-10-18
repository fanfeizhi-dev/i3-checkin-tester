import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '..', 'addresses.batch.json');

const argN = Number(process.argv.find(a => a.startsWith('--n='))?.split('=')[1] || process.env.WALLET_COUNT || 30);

// 读取助记词：优先 .env(TEST_MNEMONIC)，否则 wallets/mnemonic.txt
const mnemonicPath = path.resolve(__dirname, '..', 'wallets', 'mnemonic.txt');
const mnemonic = process.env.TEST_MNEMONIC || (fs.existsSync(mnemonicPath) ? fs.readFileSync(mnemonicPath, 'utf-8').trim() : '');

if (!mnemonic) {
  console.error('缺少 TEST_MNEMONIC 或 wallets/mnemonic.txt');
  process.exit(1);
}

try {
  // 关键：先从 phrase 得到 Mnemonic，再从 seed 得到“根”HDNode
  const m = ethers.Mnemonic.fromPhrase(mnemonic);
  const root = ethers.HDNodeWallet.fromSeed(m.computeSeed()); // depth=0 的根节点

  const res = [];
  for (let i = 0; i < argN; i++) {
    const child = root.derivePath(`m/44'/60'/0'/0/${i}`);
    res.push({ index: i, address: child.address, privateKey: child.privateKey });
  }

  fs.writeFileSync(OUT, JSON.stringify(res, null, 2));
  console.log(`已写入 ${OUT}，共 ${res.length} 地址`);
} catch (e) {
  console.error('派生地址失败：', e.message);
  process.exit(1);
}
