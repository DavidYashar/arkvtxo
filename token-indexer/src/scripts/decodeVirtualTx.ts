import axios from 'axios';
import * as bitcoin from 'bitcoinjs-lib';
import { bech32, bech32m } from '@scure/base';

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

function bytesToBech32Words(bytes: Uint8Array): number[] {
  // @scure/base bech32 expects 5-bit words
  return bech32.toWords(bytes);
}

function encodeSegwitAddress(hrp: string, version: number, program: Uint8Array): string {
  if (version < 0 || version > 16) {
    throw new Error(`Invalid segwit version: ${version}`);
  }
  const words = [version, ...bytesToBech32Words(program)];
  // v0 => bech32, v1+ => bech32m (BIP350)
  return version === 0 ? bech32.encode(hrp, words) : bech32m.encode(hrp, words);
}

function tryDecodeWitnessProgram(script: Buffer): { version: number; program: Uint8Array } | null {
  // Support canonical witness programs: OP_0..OP_16 followed by a push of 2..40 bytes.
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

function tryParseServerXOnlyPubkey(infoPubkey: string | undefined): Uint8Array | null {
  if (!infoPubkey) return null;
  const s = infoPubkey.trim();
  // Common cases: 64-hex x-only OR 66-hex compressed (33 bytes)
  if (!isHex(s)) return null;
  const buf = Buffer.from(s, 'hex');
  if (buf.length === 32) return buf;
  if (buf.length === 33) return buf.subarray(1, 33); // drop 0x02/0x03 prefix
  return null;
}

function encodeArkadeAddress(arkHrp: 'ark' | 'tark', serverXOnly: Uint8Array, outputKeyXOnly: Uint8Array): string {
  // Arkade addresses are bech32m but longer than standard segwit addresses.
  // Many bech32 libs enforce the BIP173 90-char limit, so we use a local bech32m encoder.
  // Best-effort encoding based on docs: HRP (ark/tark), version=0, payload = server_xonly(32) || p2tr_output_key(32)
  if (serverXOnly.length !== 32) throw new Error('serverXOnly must be 32 bytes');
  if (outputKeyXOnly.length !== 32) throw new Error('outputKeyXOnly must be 32 bytes');
  const payload = new Uint8Array(32 + 32);
  payload.set(serverXOnly, 0);
  payload.set(outputKeyXOnly, 32);
  const words = [0, ...convertBits(payload, 8, 5, true)];
  return bech32mEncodeUnlimited(arkHrp, words);
}

// --- Minimal bech32m encoder without 90-char limit ---
const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const BECH32M_CONST = 0x2bc830a3;

function bech32Polymod(values: number[]): number {
  const GENERATORS = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) {
      if (((top >>> i) & 1) === 1) chk ^= GENERATORS[i];
    }
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
  for (let i = 0; i < 6; i++) {
    ret.push((polymod >>> (5 * (5 - i))) & 31);
  }
  return ret;
}

function bech32mEncodeUnlimited(hrp: string, data: number[]): string {
  if (!hrp || hrp.toLowerCase() !== hrp) {
    throw new Error('HRP must be lowercase');
  }
  for (const d of data) {
    if (!Number.isInteger(d) || d < 0 || d > 31) {
      throw new Error('Data words must be 5-bit ints');
    }
  }
  const checksum = bech32mCreateChecksum(hrp, data);
  const combined = [...data, ...checksum];
  let out = `${hrp}1`;
  for (const c of combined) out += BECH32_CHARSET[c];
  return out;
}

function convertBits(data: Uint8Array, from: number, to: number, pad: boolean): number[] {
  let acc = 0;
  let bits = 0;
  const ret: number[] = [];
  const maxv = (1 << to) - 1;
  for (const value of data) {
    if (value < 0 || (value >> from) !== 0) {
      throw new Error('Invalid value for convertBits');
    }
    acc = (acc << from) | value;
    bits += from;
    while (bits >= to) {
      bits -= to;
      ret.push((acc >> bits) & maxv);
    }
  }
  if (pad) {
    if (bits > 0) {
      ret.push((acc << (to - bits)) & maxv);
    }
  } else {
    if (bits >= from) throw new Error('Excess padding');
    if (((acc << (to - bits)) & maxv) !== 0) throw new Error('Non-zero padding');
  }
  return ret;
}

async function getAspInfo(aspUrl: string): Promise<{ network?: string; pubkey?: string } | null> {
  const candidates = [`${aspUrl}/v1/info`, `${aspUrl}/v1/ark/info`];
  for (const url of candidates) {
    try {
      const res = await axios.get(url, { timeout: 15_000 });
      if (res?.data && typeof res.data === 'object') {
        const anyData = res.data as any;
        return {
          network: (anyData.network as string | undefined) ?? undefined,
          pubkey:
            (anyData.pubkey as string | undefined) ??
            (anyData.signerPubkey as string | undefined) ??
            (anyData.signer_pubkey as string | undefined) ??
            undefined,
        };
      }
    } catch {
      // try next
    }
  }
  return null;
}

async function fetchVirtualTxHexes(aspUrl: string, txid: string): Promise<string[]> {
  // Docs disagree on the path shape; try both.
  const candidates = [
    `${aspUrl}/v1/indexer/virtualTx/${txid}`,
    `${aspUrl}/v1/virtualTx/${txid}`,
  ];

  const errors: Array<{ url: string; message: string }> = [];

  for (const url of candidates) {
    try {
      const res = await axios.get(url, { timeout: 20_000 });
      const data = res.data;
      // Expected: { txs: ["<hex>", ...], page: ... }
      if (data && Array.isArray(data.txs)) {
        const txs = data.txs.filter((t: unknown) => typeof t === 'string') as string[];
        return txs;
      }
      // Some gateways wrap in { result: { txs: [...] } }
      if (data?.result && Array.isArray(data.result.txs)) {
        const txs = data.result.txs.filter((t: unknown) => typeof t === 'string') as string[];
        return txs;
      }

      errors.push({ url, message: `Unexpected response shape: ${JSON.stringify(data).slice(0, 200)}...` });
    } catch (e: any) {
      errors.push({ url, message: e?.message ?? String(e) });
    }
  }

  const errText = errors.map((e) => `- ${e.url}: ${e.message}`).join('\n');
  throw new Error(`Failed to fetch virtual tx hex for ${txid}. Tried:\n${errText}`);
}

function decodeAndPrintTx(
  txHex: string,
  network: bitcoin.Network,
  opts: { aspNetworkName?: string; aspServerPubkey?: string }
): void {
  if (!isHex(txHex)) {
    throw new Error('Virtual tx is not hex');
  }

  const tx = bitcoin.Transaction.fromHex(txHex);
  console.log(`\nTXID (computed from hex): ${tx.getId()}`);
  console.log(`Inputs: ${tx.ins.length}  Outputs: ${tx.outs.length}`);

  tx.outs.forEach((out, vout) => {
    const scriptHex = out.script.toString('hex');
    const value = out.value;

    let address: string | null = null;
    try {
      address = bitcoin.address.fromOutputScript(out.script, network);
    } catch {
      address = null;
    }

    // Fallback: derive witness address (bech32/bech32m) without relying on bitcoinjs internals.
    if (!address) {
      const decoded = tryDecodeWitnessProgram(out.script);
      if (decoded) {
        const hrp = network.bech32;
        if (hrp) {
          try {
            address = encodeSegwitAddress(hrp, decoded.version, decoded.program);
          } catch {
            address = null;
          }
        }
      }
    }

    // Detect Taproot scriptPubKey: OP_1 (0x51) + push32 (0x20) + 32-byte key
    let taprootKeyHex: string | null = null;
    let arkadeAddress: string | null = null;
    const decoded = tryDecodeWitnessProgram(out.script);
    if (decoded?.version === 1 && decoded.program.length === 32) {
      taprootKeyHex = Buffer.from(decoded.program).toString('hex');

      const serverXOnly = tryParseServerXOnlyPubkey(opts.aspServerPubkey);
      if (serverXOnly) {
        const hrp = (opts.aspNetworkName || '').toLowerCase().includes('test') ? 'tark' : 'ark';
        try {
          arkadeAddress = encodeArkadeAddress(hrp as 'ark' | 'tark', serverXOnly, decoded.program);
        } catch {
          arkadeAddress = null;
        }
      }
    }

    console.log(`\n[vout=${vout}] value=${value} sats`);
    if (address) console.log(`  address: ${address}`);
    if (arkadeAddress) console.log(`  arkade_address (best-effort): ${arkadeAddress}`);
    if (taprootKeyHex) console.log(`  taproot_output_key: ${taprootKeyHex}`);
    console.log(`  scriptPubKey: ${scriptHex}`);
  });
}

async function main() {
  const txid = (process.argv[2] || '').trim();
  if (!txid) {
    console.error('Usage: npm run decode:virtualtx -- <txid>');
    process.exit(1);
  }
  if (!/^[0-9a-f]{64}$/i.test(txid)) {
    console.error('Error: txid must be 64 hex chars');
    process.exit(1);
  }

  const aspUrl = (process.env.ARKADE_ASP_URL || process.env.ASP_URL || 'https://arkade.computer').replace(/\/+$/, '');

  const info = await getAspInfo(aspUrl);
  const network = getBitcoinJsNetwork(info?.network);

  console.log(`ASP: ${aspUrl}`);
  if (info?.network) console.log(`ASP network: ${info.network}`);
  if (info?.pubkey) console.log(`ASP pubkey: ${info.pubkey}`);

  const txHexes = await fetchVirtualTxHexes(aspUrl, txid);
  if (txHexes.length === 0) {
    throw new Error(
      [
        'No virtual txs returned.',
        '',
        'This usually means the txid you provided is NOT a virtual txid (arkTxid),',
        'but instead an on-chain commitment/settlement txid or a txid the ASP does not index as virtual.',
        '',
        'If you have the sender wallet, resolve the correct arkTxid via:',
        '  PRIVATE_KEY_HEX=... npm run trace:send -- <commitmentTxid>',
      ].join('\n')
    );
  }

  // Usually one tx per txid; if multiple returned, decode all.
  txHexes.forEach((hex, idx) => {
    console.log(`\n=== Virtual TX [${idx + 1}/${txHexes.length}] ===`);
    decodeAndPrintTx(hex, network, { aspNetworkName: info?.network, aspServerPubkey: info?.pubkey });
  });
}

main().catch((err) => {
  console.error(err?.stack || err?.message || String(err));
  process.exit(1);
});
