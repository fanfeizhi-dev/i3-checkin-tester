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

// 日志目录 & checkin summary 日志文件
const LOG_DIR = path.resolve(ROOT, 'logs');
const CHECKIN_LOG_FILE = path.resolve(LOG_DIR, 'checkin-summary.log');

function readJson(relPath) {
  const p = path.resolve(ROOT, relPath);
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function envResolve(s) {
  if (typeof s !== 'string') return s;
  return s.startsWith('${') ? (process.env[s.slice(2, -1)] || '') : s;
}

// 简单识别是否是 RPC 限流
function isLimitExceeded(err) {
  const code = err?.code ?? err?.error?.code;
  const msg = (err?.message || err?.error?.message || '').toLowerCase();
  return code === -32005 || msg.includes('limit exceeded');
}

// 简单识别是否是超时
function isTimeout(err) {
  const code = err?.code ?? err?.error?.code;
  const msg = (err?.message || err?.error?.message || '').toLowerCase();
  return code === 'TIMEOUT' || msg.includes('timeout');
}

async function main() {
  // 确保 logs 目录存在
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }

  // === 1. 地址列表加载 ===
  const ADDR_FILE = process.env.ADDR_FILE || 'addresses.batch.json';
  const ADDR_PATH = path.resolve(ROOT, ADDR_FILE);
  if (!fs.existsSync(ADDR_PATH)) {
    throw new Error(`缺少地址文件：${ADDR_FILE}`);
  }
  let list = JSON.parse(fs.readFileSync(ADDR_PATH, 'utf-8'));

  // 可选切片：ADDR_START / ADDR_COUNT
  const s = Number(process.env.ADDR_START || 0);
  const c = process.env.ADDR_COUNT ? Number(process.env.ADDR_COUNT) : null;
  if (Number.isFinite(s) && s > 0) list = list.slice(s);
  if (c !== null && Number.isFinite(c)) list = list.slice(0, c);
  console.log(`地址来源 ${ADDR_FILE}，items=${list.length}`);

  if (!Array.isArray(list) || list.length === 0) {
    throw new Error(`地址列表为空：${ADDR_FILE}`);
  }

  // === 2. 链配置 ===
  const chains = readJson('config/chains.json');
  const abi = readJson('abis/I3CheckInCore.json');

  const net = (process.env.CHAIN || 'bnb').toLowerCase();
  if (!chains[net]) {
    throw new Error(`未知 CHAIN=${net}，可选：${Object.keys(chains).join(', ')}`);
  }

  const rpc = envResolve(chains[net].rpcHttps);
  const contractAddr = envResolve(chains[net].checkInContract);
  const delay = Number(process.env.PER_TX_DELAY_MS || 100);

  if (!rpc) throw new Error(`RPC 未配置: ${net}`);
  if (!contractAddr) throw new Error(`CheckIn 合约未配置: ${net}`);

  const provider = getProvider(rpc);
  console.log(`CHAIN=${net} RPC=${rpc} contract=${contractAddr} items=${list.length}`);

  // === 3. 余额阈值 & 重试参数 ===
  const DEFAULT_MIN = { bnb: '0.00003', opbnb: '0.00000001' };
  const MIN_CHECKIN_BNB =
    net === 'bnb'
      ? (process.env.MIN_CHECKIN_BNB || DEFAULT_MIN.bnb)
      : (process.env.MIN_CHECKIN_OPBNB || DEFAULT_MIN.opbnb);

  const MIN_NEEDED = ethers.parseEther(MIN_CHECKIN_BNB);
  const BAL_RETRY_MAX = Number(process.env.BAL_RETRY_MAX || '20');
  const BAL_RETRY_MS = Number(process.env.BAL_RETRY_MS || '1000');

  const CHECKIN_MAX_RETRY = Number(process.env.CHECKIN_MAX_RETRY || '3');
  const CHECKIN_BACKOFF_MS = Number(process.env.CHECKIN_BACKOFF_MS || '3000');

  // === 4. 统计计数 ===
  let okCount = 0;
  let skipContract = 0;
  let skipBalance = 0;
  let errCount = 0;

  // === 5. 逐地址 check-in（每个地址独立 try/catch）===
  for (const it of list) {
    const idx = it.index ?? '?';
    const addr = it.address;

    try {
      const wallet = walletFromPk(it.privateKey, provider);
      const contract = new ethers.Contract(contractAddr, abi, wallet);

      // 先跳过合约地址
      const code = await provider.getCode(addr);
      if (code && code !== '0x') {
        skipContract++;
        console.log(
          `[skip-contract] #${idx} ${addr} 是合约地址，跳过 checkIn`
        );
        continue;
      }

      // 尝试多次 checkIn（主要处理 TIMEOUT / limit exceeded）
      let sentOk = false;
      let attempt = 0;

      while (!sentOk && attempt < CHECKIN_MAX_RETRY) {
        attempt += 1;

        try {
          // 1) 等资金到账（余额达标）
          let bal = await provider.getBalance(addr);
          let tries = 0;
          while (bal < MIN_NEEDED && tries < BAL_RETRY_MAX) {
            console.log(
              `[checkin-wait] #${idx} ${addr} balance=${ethers.formatEther(
                bal
              )} BNB < ${MIN_CHECKIN_BNB}，等待中(${tries + 1}/${BAL_RETRY_MAX})...`
            );
            await sleep(BAL_RETRY_MS);
            bal = await provider.getBalance(addr);
            tries++;
          }

          if (bal < MIN_NEEDED) {
            skipBalance++;
            console.warn(
              `[checkin-skip-balance] #${idx} ${addr} balance=${ethers.formatEther(
                bal
              )} BNB < ${MIN_CHECKIN_BNB}，放弃本次 checkIn`
            );
            // 余额不足没必要再重试这一地址
            break;
          }

          // 2) 估算 gas（可选）+ 调用 checkIn
          const gas = await contract.checkIn.estimateGas().catch(() => 0n);
          const tx =
            gas && gas > 0n
              ? await contract.checkIn({ gasLimit: gas + 20_000n })
              : await contract.checkIn();

          const rc = await tx.wait();
          console.log(
            `[checkin] #${idx} ${addr} tx=${tx.hash} status=${rc.status} (attempt=${attempt})`
          );
          okCount++;
          sentOk = true;
        } catch (e) {
          // 可重试错误：超时 / 限流
          if ((isTimeout(e) || isLimitExceeded(e)) && attempt < CHECKIN_MAX_RETRY) {
            const backoffMs = CHECKIN_BACKOFF_MS * attempt;
            console.warn(
              `[checkin-retry] #${idx} ${addr} 因 ${
                e?.code || e?.shortMessage || e?.message
              }，准备第 ${attempt} 次重试，等待 ${backoffMs}ms`
            );
            await sleep(backoffMs);
          } else {
            // 非重试型错误，或重试耗尽
            errCount++;
            console.error(
              `[checkin-err] #${idx} ${addr} ERR:`,
              e?.message || e
            );
            break;
          }
        }
      }
    } catch (e) {
      // 兜底：这一地址所有逻辑外层的保护
      errCount++;
      console.error(
        `[checkin-err] #${idx} ${addr} FATAL:`,
        e?.message || e
      );
    }

    if (delay > 0) {
      await sleep(delay);
    }
  }

  // === 6. 总结 & 写入日志 ===
  console.log(
    `[checkin-summary] total=${list.length} ok=${okCount} ` +
      `skipContract=${skipContract} skipBalance=${skipBalance} err=${errCount}`
  );

  const ts = new Date().toISOString();
  const logLine = [
    ts,
    net,
    ADDR_FILE,
    list.length,
    okCount,
    skipContract,
    skipBalance,
    errCount
  ].join(',') + '\n';

  const needHeader = !fs.existsSync(CHECKIN_LOG_FILE);
  if (needHeader) {
    fs.appendFileSync(
      CHECKIN_LOG_FILE,
      'timestamp,chain,addr_file,total,ok,skipContract,skipBalance,err\n',
      'utf-8'
    );
  }
  fs.appendFileSync(CHECKIN_LOG_FILE, logLine, 'utf-8');
}

// 顶层入口：只有真正“根本跑不动”的问题才会让进程退出
main().catch((e) => {
  console.error('[checkin-fatal]', e);
  process.exit(1);
});
