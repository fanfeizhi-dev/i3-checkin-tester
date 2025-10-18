// scripts/fund-wallets.js
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { getProvider, walletFromPk } from '../utils/signer-factory.js';
import { sleep } from '../utils/time.js';
import { ethers } from 'ethers';

dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function readJson(relPath) {
  const p = path.resolve(ROOT, relPath);
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}
function envResolve(s) {
  if (typeof s !== 'string') return s;
  return s.startsWith('${') ? (process.env[s.slice(2, -1)] || '') : s;
}

const ADDR = path.resolve(ROOT, 'addresses.batch.json');
if (!fs.existsSync(ADDR)) throw new Error('缺少 addresses.batch.json，请先 derive');
const list = JSON.parse(fs.readFileSync(ADDR, 'utf-8'));

// 🔀 按 CHAIN 选择网络（默认 bnb）
const net = (process.env.CHAIN || 'bnb').toLowerCase();
const chains = readJson('config/chains.json');
if (!chains[net]) throw new Error(`未知 CHAIN=${net}，可选：${Object.keys(chains).join(', ')}`);
const rpc = envResolve(chains[net].rpcHttps);

const fundPk = process.env.FUND_PRIVATE_KEY;

// 💰 每地址分发额度（可被环境变量覆盖）
const DEFAULTS = {
  bnb:   '0.00004',     // 4e-5 BNB
  opbnb: '0.0000004',  // 4e-7 BNB
};
const perValue =
  (net === 'bnb'   ? (process.env.FUND_PER_BNB   || DEFAULTS.bnb)
                   : (process.env.FUND_PER_OPBNB || DEFAULTS.opbnb));

const delay = Number(process.env.PER_TX_DELAY_MS || 100);

const provider = getProvider(rpc);
const funder = walletFromPk(fundPk, provider);
console.log(`CHAIN=${net} RPC=${rpc}`);
console.log(`Funder: ${await funder.getAddress()} | 将向 ${list.length} 地址各转 ${perValue} BNB`);

for (const it of list) {
  // 保护：跳过“合约地址”
  const code = await provider.getCode(it.address);
  if (code && code !== '0x') {
    console.log(`[skip-contract] #${it.index} ${it.address} 是合约地址，跳过分发`);
    continue;
  }

  const tx = await funder.sendTransaction({
    to: it.address,
    value: ethers.parseEther(perValue),
  });
  const rc = await tx.wait();
  console.log(`[fund] #${it.index} ${it.address} +${perValue} BNB tx=${tx.hash} status=${rc.status}`);
  await sleep(delay);
}
