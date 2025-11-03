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

function readJson(relPath) {
  const p = path.resolve(ROOT, relPath);
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}
function envResolve(s) {
  if (typeof s !== 'string') return s;
  return s.startsWith('${') ? (process.env[s.slice(2, -1)] || '') : s;
}

// === 关键：可选择地址清单文件（默认 addresses.batch.json） ===
const ADDR_FILE = process.env.ADDR_FILE || 'addresses.batch.json';
const ADDR_PATH = path.resolve(ROOT, ADDR_FILE);
if (!fs.existsSync(ADDR_PATH)) throw new Error(`缺少地址文件：${ADDR_FILE}`);
let list = JSON.parse(fs.readFileSync(ADDR_PATH, 'utf-8'));

// 可选切片
const s = Number(process.env.ADDR_START || 0);
const c = process.env.ADDR_COUNT ? Number(process.env.ADDR_COUNT) : null;
if (Number.isFinite(s) && s > 0) list = list.slice(s);
if (c !== null && Number.isFinite(c)) list = list.slice(0, c);
console.log(`地址来源 ${ADDR_FILE}，items=${list.length}`);

// 配置
const chains = readJson('config/chains.json');
const abi = readJson('abis/I3CheckInCore.json');

const net = (process.env.CHAIN || 'bnb').toLowerCase();
if (!chains[net]) throw new Error(`未知 CHAIN=${net}，可选：${Object.keys(chains).join(', ')}`);

const rpc = envResolve(chains[net].rpcHttps);
const contractAddr = envResolve(chains[net].checkInContract);
const delay = Number(process.env.PER_TX_DELAY_MS || 100);
if (!rpc) throw new Error(`RPC 未配置: ${net}`);
if (!contractAddr) throw new Error(`CheckIn 合约未配置: ${net}`);

const provider = getProvider(rpc);
console.log(`CHAIN=${net} RPC=${rpc} contract=${contractAddr} items=${list.length}`);

// 最低余额阈值（可调）
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
    const code = await provider.getCode(it.address);
    if (code && code !== '0x') {
      console.log(`[skip-contract] #${it.index} ${it.address} 是合约地址，跳过 checkIn`);
      continue;
    }

    // 等资金到账
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

    // 估算 gas（可选）+ 调用
    const gas = await contract.checkIn.estimateGas().catch(() => 0n);
    const tx = gas && gas > 0n
      ? await contract.checkIn({ gasLimit: gas + 20_000n })
      : await contract.checkIn();

    const rc = await tx.wait();
    console.log(`[checkin] #${it.index} ${it.address} tx=${tx.hash} status=${rc.status}`);
  } catch (e) {
    console.error(`[checkin] #${it.index} ${it.address} ERR: ${e.message}`);
  }

  await sleep(delay);
}
