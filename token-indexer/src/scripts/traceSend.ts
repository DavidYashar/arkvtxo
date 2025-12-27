import axios from 'axios';
import { Wallet, SingleKey } from '@arkade-os/sdk';
import * as bitcoin from 'bitcoinjs-lib';
import { bech32, bech32m } from '@scure/base';

// Minimal helpers shared with decodeVirtualTx.ts (duplicated to keep scripts standalone)

type NetworkName = 'bitcoin' | 'testnet' | 'regtest' | 'signet' | string;

function isHex(s: string): boolean {
  return /^[0-9a-fA-F]+$/.test(s);
}

function getBitcoinJsNetwork(networkName: NetworkName | undefined): bitcoin.Network {
  const n = (networkName || '').toLowerCase();
  if (n.includes('main')) return bitcoin.networks.bitcoin;
  if (n.includes('bitcoin')) return bitcoin.networks.bitcoin;
  if (n.includes('test')) return bitcoin.networks.testnet;
  if (n.includes('mutiny')) return bitcoin.networks.testnet;
  if (n.includes('signet')) return bitcoin.networks.testnet;
  if (n.includes('regtest')) return bitcoin.networks.regtest;
  return bitcoin.networks.testnet;
}

async function getAspInfo(aspUrl: string): Promise<{ network?: string; pubkey?: string } | null> {
  const url = `${aspUrl}/v1/info`;
  try {
    const res = await axios.get(url, { timeout: 15_000 });
    const anyData = res.data as any;
    return {
      network: (anyData.network as string | undefined) ?? undefined,
      pubkey:
        (anyData.pubkey as string | undefined) ??
        (anyData.signerPubkey as string | undefined) ??
        (anyData.signer_pubkey as string | undefined) ??
        undefined,
    };
  } catch {
    return null;
  }
}

async function fetchVirtualTxHex(aspUrl: string, txid: string): Promise<string> {
  const candidates = [`${aspUrl}/v1/indexer/virtualTx/${txid}`, `${aspUrl}/v1/virtualTx/${txid}`];
  for (const url of candidates) {
    try {
      const res = await axios.get(url, { timeout: 20_000 });
      const data = res.data;
      const txs: unknown = data?.txs ?? data?.result?.txs;
      if (Array.isArray(txs) && typeof txs[0] === 'string') {
        return txs[0] as string;
      }
    } catch {
      // try next
    }
  }
  throw new Error(`Failed to fetch virtual tx hex for ${txid}`);
}

function bytesToBech32Words(bytes: Uint8Array): number[] {
  return bech32.toWords(bytes);
}

function encodeSegwitAddress(hrp: string, version: number, program: Uint8Array): string {
  const words = [version, ...bytesToBech32Words(program)];
  return version === 0 ? bech32.encode(hrp, words) : bech32m.encode(hrp, words);
}

function tryDecodeWitnessProgram(script: Buffer): { version: number; program: Uint8Array } | null {
  if (script.length < 4) return null;
  const op = script[0];
  const pushLen = script[1];
  const isOp0 = op === 0x00;
  const isOp1to16 = op >= 0x51 && op <= 0x60;
  if (!isOp0 && !isOp1to16) return null;
  const version = isOp0 ? 0 : op - 0x50;
  if (pushLen < 2 || pushLen > 40) return null;
  if (script.length !== 2 + pushLen) return null;
  const program = script.subarray(2, 2 + pushLen);
  return { version, program };
}

function convertBits(data: Uint8Array, from: number, to: number, pad: boolean): number[] {
  let acc = 0;
  let bits = 0;
  const ret: number[] = [];
  const maxv = (1 << to) - 1;
  for (const value of data) {
    if (value < 0 || (value >> from) !== 0) throw new Error('Invalid value for convertBits');
    acc = (acc << from) | value;
    bits += from;
    while (bits >= to) {
      bits -= to;
      ret.push((acc >> bits) & maxv);
    }
  }
  if (pad) {
    if (bits > 0) ret.push((acc << (to - bits)) & maxv);
  } else {
    if (bits >= from) throw new Error('Excess padding');
    if (((acc << (to - bits)) & maxv) !== 0) throw new Error('Non-zero padding');
  }
  return ret;
}

const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const BECH32M_CONST = 0x2bc830a3;

function bech32Polymod(values: number[]): number {
  const GENERATORS = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if (((top >>> i) & 1) === 1) chk ^= GENERATORS[i];
  }
  return chk;
}

function bech32HrpExpand(hrp: string): number[] {
  const ret: number[] = [];
  for (let i = 0; i < hrp.length; i++) ret.push(hrp.charCodeAt(i) >>> 5);
  ret.push(0);
  for (let i = 0; i < hrp.length; i++) ret.push(hrp.charCodeAt(i) & 31);
  return ret;
}

function bech32mCreateChecksum(hrp: string, data: number[]): number[] {
  const values = [...bech32HrpExpand(hrp), ...data, 0, 0, 0, 0, 0, 0];
  const polymod = bech32Polymod(values) ^ BECH32M_CONST;
  const ret: number[] = [];
  for (let i = 0; i < 6; i++) ret.push((polymod >>> (5 * (5 - i))) & 31);
  return ret;
}

function bech32mEncodeUnlimited(hrp: string, data: number[]): string {
  const checksum = bech32mCreateChecksum(hrp, data);
  const combined = [...data, ...checksum];
  let out = `${hrp}1`;
  for (const c of combined) out += BECH32_CHARSET[c];
  return out;
}

function tryParseServerXOnlyPubkey(infoPubkey: string | undefined): Uint8Array | null {
  if (!infoPubkey) return null;
  const s = infoPubkey.trim();
  if (!isHex(s)) return null;
  const buf = Buffer.from(s, 'hex');
  if (buf.length === 32) return buf;
  if (buf.length === 33) return buf.subarray(1, 33);
  return null;
}

function encodeArkadeAddress(arkHrp: 'ark' | 'tark', serverXOnly: Uint8Array, outputKeyXOnly: Uint8Array): string {
  const payload = new Uint8Array(32 + 32);
  payload.set(serverXOnly, 0);
  payload.set(outputKeyXOnly, 32);
  const words = [0, ...convertBits(payload, 8, 5, true)];
  return bech32mEncodeUnlimited(arkHrp, words);
}

function decodeAndPrintTx(txHex: string, network: bitcoin.Network, aspInfo: { network?: string; pubkey?: string } | null): void {
  const tx = bitcoin.Transaction.fromHex(txHex);
  console.log(`\nTXID: ${tx.getId()}`);
  console.log(`Inputs: ${tx.ins.length}  Outputs: ${tx.outs.length}`);

  const serverXOnly = tryParseServerXOnlyPubkey(aspInfo?.pubkey);
  const arkHrp = (aspInfo?.network || '').toLowerCase().includes('test') ? 'tark' : 'ark';

  tx.outs.forEach((out, vout) => {
    const decoded = tryDecodeWitnessProgram(out.script);
    let address: string | null = null;
    if (decoded) {
      try {
        address = encodeSegwitAddress(network.bech32, decoded.version, decoded.program);
      } catch {
        address = null;
      }
    }

    let arkadeAddress: string | null = null;
    if (decoded?.version === 1 && decoded.program.length === 32 && serverXOnly) {
      try {
        arkadeAddress = encodeArkadeAddress(arkHrp as 'ark' | 'tark', serverXOnly, decoded.program);
      } catch {
        arkadeAddress = null;
      }
    }

    console.log(`\n[vout=${vout}] value=${out.value} sats`);
    if (address) console.log(`  address: ${address}`);
    if (arkadeAddress) console.log(`  arkade_address (best-effort): ${arkadeAddress}`);
    console.log(`  scriptPubKey: ${out.script.toString('hex')}`);
  });
}

async function main() {
  const commitmentTxid = (process.argv[2] || '').trim();
  if (!/^[0-9a-f]{64}$/i.test(commitmentTxid)) {
    console.error('Usage: npm run trace:send -- <commitmentTxid>');
    process.exit(1);
  }

  const privateKeyHex = (process.env.PRIVATE_KEY_HEX || '').trim();
  if (!/^[0-9a-f]{64}$/i.test(privateKeyHex)) {
    console.error('Set PRIVATE_KEY_HEX (64 hex chars) in your environment. Example:');
    console.error('  PRIVATE_KEY_HEX=... npm run trace:send -- <commitmentTxid>');
    process.exit(1);
  }

  const aspUrl = (process.env.ARKADE_ASP_URL || process.env.ASP_URL || 'https://arkade.computer').replace(/\/+$/, '');
  const aspInfo = await getAspInfo(aspUrl);
  const btcNetwork = getBitcoinJsNetwork(aspInfo?.network);

  // Build wallet locally to get the *virtual txid / ark txid* that corresponds to this commitment settlement.
  const identity = SingleKey.fromHex(privateKeyHex);
  const wallet = await Wallet.create({ identity, arkServerUrl: aspUrl });

  const address = await wallet.getAddress();
  console.log(`Wallet address: ${address}`);
  console.log(`ASP: ${aspUrl}`);
  if (aspInfo?.network) console.log(`ASP network: ${aspInfo.network}`);

  const [history, vtxos] = await Promise.all([wallet.getTransactionHistory(), wallet.getVtxos()]);
  console.log(`History entries: ${history.length}`);
  console.log(`VTXOs: ${vtxos.length}`);

  // Helper: find any record that mentions the txid (covers SDK field-name differences over time).
  const mentionsCommitment = (obj: unknown): boolean => {
    try {
      return JSON.stringify(obj).toLowerCase().includes(commitmentTxid.toLowerCase());
    } catch {
      return false;
    }
  };

  // 1) Search transaction history for this commitment.
  const historyMatches = history.filter((tx: any) => {
    const key = tx?.key || {};
    return (
      key.commitmentTxid === commitmentTxid ||
      key.virtualTxid === commitmentTxid ||
      key.arkTxid === commitmentTxid ||
      tx?.settledBy === commitmentTxid ||
      mentionsCommitment(tx)
    );
  });

  console.log(`History matches for commitment ${commitmentTxid}: ${historyMatches.length}`);
  for (const [i, tx] of historyMatches.entries()) {
    const anyTx = tx as any;
    const key = anyTx.key || {};
    console.log(`\n[history match ${i + 1}/${historyMatches.length}] type=${tx.type} amount=${tx.amount} settled=${tx.settled}`);
    console.log(`  boardingTxid: ${key.boardingTxid || ''}`);
    console.log(`  commitmentTxid: ${key.commitmentTxid || ''}`);
    console.log(`  arkTxid: ${key.arkTxid || key.virtualTxid || ''}`);
    console.log(`  settledBy: ${anyTx.settledBy || ''}`);
  }

  // 2) Search VTXOs for this commitment as the settlement anchor.
  const vtxoMatches = vtxos.filter((v: any) => {
    return v?.settledBy === commitmentTxid || v?.spentBy === commitmentTxid || mentionsCommitment(v);
  });

  console.log(`VTXO matches for commitment ${commitmentTxid}: ${vtxoMatches.length}`);
  for (const [i, v] of vtxoMatches.entries()) {
    console.log(
      `\n[vtxo match ${i + 1}/${vtxoMatches.length}] txid=${v.txid}:${v.vout} value=${v.value} spent=${v.isSpent}`
    );
    console.log(`  arkTxId: ${v.arkTxId || ''}`);
    console.log(`  spentBy: ${v.spentBy || ''}`);
    console.log(`  settledBy: ${v.settledBy || ''}`);
    console.log(`  status: ${v.status || ''}`);
    console.log(`  virtualStatus: ${v.virtualStatus?.state || ''}`);
  }

  if (historyMatches.length === 0) {
    // Print a small diagnostic window from the end of history to help correlate by time/amount.
    const tail = history.slice(-8);
    if (tail.length) {
      console.log('\nRecent history (last 8):');
      for (const tx of tail) {
        const anyTx = tx as any;
        const key = anyTx.key || {};
        console.log(
          `- type=${tx.type} amount=${tx.amount} settled=${tx.settled} createdAt=${tx.createdAt} ` +
            `boarding=${key.boardingTxid || ''} arkTxid=${key.arkTxid || key.virtualTxid || ''} commitment=${key.commitmentTxid || ''} settledBy=${anyTx.settledBy || ''}`
        );
      }
    }
  }

  // Prefer an offchain send tx (arkTxid). If multiple, pick SENT first.
  const sent = historyMatches.find((m: any) => m?.type === 'INDEXER_TX_TYPE_SENT' && (m?.key?.arkTxid || m?.key?.virtualTxid));
  const anyWithArkTxid = historyMatches.find((m: any) => m?.key?.arkTxid || m?.key?.virtualTxid);
  const arkTxid = (sent?.key?.arkTxid || anyWithArkTxid?.key?.arkTxid || '').trim();

  if (!arkTxid) {
    console.log('\nNo arkTxid found for this commitment in wallet history.');
    console.log('This often means the tx is a batch settlement/commitment and not a direct per-wallet send id.');
    console.log('If your platform shows a “commitment tx” entry for a send, look for a separate “virtualTxid/arkTxid” field — that is what you can decode.');
    process.exit(0);
  }

  console.log(`\nResolved arkTxid for this commitment: ${arkTxid}`);
  const vhex = await fetchVirtualTxHex(aspUrl, arkTxid);
  console.log('\nDecoded receiver outputs for arkTxid:');
  decodeAndPrintTx(vhex, btcNetwork, aspInfo);
}

main().catch((err) => {
  console.error(err?.stack || err?.message || String(err));
  process.exit(1);
});
