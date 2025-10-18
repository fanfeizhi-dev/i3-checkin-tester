import { ethers } from 'ethers';
import dotenv from 'dotenv';
dotenv.config();

export function getProvider(rpcUrl) {
  return new ethers.JsonRpcProvider(rpcUrl);
}

export function walletFromPk(pk, provider) {
  if (!pk.startsWith('0x')) pk = '0x' + pk;
  const w = new ethers.Wallet(pk, provider);
  return w;
}

export async function sendValue(provider, fromPk, to, valueEth) {
  const w = walletFromPk(fromPk, provider);
  const tx = await w.sendTransaction({
    to,
    value: ethers.parseEther(String(valueEth))
  });
  return tx.wait();
}
