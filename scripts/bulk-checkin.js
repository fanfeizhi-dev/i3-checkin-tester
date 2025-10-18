// scripts/bulk-checkin.js
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { ethers } from 'ethers';
import { getProvider, walletFromPk } from '../utils/signer-factory.js';
import { sleep } from '../utils/time.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ---- 读取 JSON（避免 import assertions）
function readJson(relPath) {
  const p = path.resolve(ROOT, relPath);
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}
function envResolve(s) {
  if (typeof s !== 'string') return s;
  return s.startsWith('${') ? (process.env[s.slice(2, -1)] || '') : s;
}

// 配置与 ABI
const chains = readJson('config/chains.json');
const abi = readJson('abis/I3CheckInCore.json');

// 地址清单
const ADDR = path.resolve(ROOT, 'addresses.batch.json');
if (!fs.existsSync(ADDR)) throw new Error('缺少 addresses.batch.json，请先 derive');
const list = JSON.parse(fs.readFileSync(ADDR, 'utf-8'));

// 🔀 关键：按 CHAIN 选择网络（默认 bnb）
const net = (process.env.CHAIN || 'bnb').toLowerCase();
if (!chains[net]) throw new Error(`未知 CHAIN=${net}，可选：${Object.keys(chains).join(', ')}`);

const rpc = envResolve(chains[net].rpcHttps);
const contractAddr = envResolve(chains[net].checkInContract);
const delay = Number(process.env.PER_TX_DELAY_MS || 100);
if (!rpc) throw new Error(`RPC 未配置: ${net}`);
if (!contractAddr) throw new Error(`CheckIn 合约未配置: ${net}`);

const provider = getProvider(rpc);
console.log(`CHAIN=${net} RPC=${rpc} contract=${contractAddr} items=${list.length}`);

// 🧮 按链设置“发交易前的余额下限”
// - BNB：默认 0.00003（你实测 ~0.00002941）
// - opBNB：默认 0.00000001（10^-8），远小于你分发的 6e-8
const DEFAULT_MIN = { bnb: '0.00003', opbnb: '0.00000001' };
const MIN_CHECKIN_BNB =
  net === 'bnb'
    ? (process.env.MIN_CHECKIN_BNB || DEFAULT_MIN.bnb)
    : (process.env.MIN_CHECKIN_OPBNB || DEFAULT_MIN.opbnb);

const MIN_NEEDED = ethers.parseEther(MIN_CHECKIN_BNB);
const BAL_RETRY_MAX = Number(process.env.BAL_RETRY_MAX || 20);
const BAL_RETRY_MS  = Number(process.env.BAL_RETRY_MS  || 1000);

for (const it of list) {
  const wallet = walletFromPk(it.privateKey, provider);
  const contract = new ethers.Contract(contractAddr, abi, wallet);

  try {
    // 0) 保护：跳过“链上已有代码”的地址（合约地址）
    const code = await provider.getCode(it.address);
    if (code && code !== '0x') {
      console.log(`[skip-contract] #${it.index} ${it.address} 是合约地址，跳过 checkIn`);
      continue;
    }

    // 1) 等余额可见、达到阈值
    let bal = await provider.getBalance(it.address);
    let tries = 0;
    while (bal < MIN_NEEDED && tries < BAL_RETRY_MAX) {
      console.log(
        `[checkin] #${it.index} ${it.address} balance=${ethers.formatEther(bal)} BNB < ${MIN_CHECKIN_BNB}，等待中(${tries + 1}/${BAL_RETRY_MAX})...`
      );
      await sleep(BAL_RETRY_MS);
      bal = await provider.getBalance(it.address);
      tries++;
    }
    if (bal < MIN_NEEDED) {
      throw new Error(`balance still low (${ethers.formatEther(bal)} BNB < ${MIN_CHECKIN_BNB}); skip`);
    }

    // 2) 估算 gas 并加一点 buffer
    const gas = await contract.checkIn.estimateGas().catch(() => 0n);
    const tx = gas && gas > 0n
      ? await contract.checkIn({ gasLimit: gas + 20_000n })
      : await contract.checkIn();

    const rc = await tx.wait();
    console.log(`[checkin] #${it.index} ${it.address} tx=${tx.hash} status=${rc.status}`);
  } catch (e) {
    console.error(`[checkin] #${it.index} ${it.address} ERR: ${e.message}`);
  }

  // 3) 地址间节流
  await sleep(delay);
}
