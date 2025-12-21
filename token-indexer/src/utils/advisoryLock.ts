export function advisoryLockKeysFromTokenId(tokenId: string): { key1: number; key2: number } {
  const hex = String(tokenId).replace(/^0x/i, '');

  const part1 = hex.slice(0, 8).padEnd(8, '0');
  const part2 = hex.slice(8, 16).padEnd(8, '0');

  const u1 = (parseInt(part1, 16) >>> 0) as number;
  const u2 = (parseInt(part2, 16) >>> 0) as number;

  return {
    key1: toSignedInt32(u1),
    key2: toSignedInt32(u2)
  };
}

function toSignedInt32(unsigned: number): number {
  // PostgreSQL pg_advisory_xact_lock(int, int) expects signed 32-bit integers.
  // parseInt(hex, 16) returns a JS number in [0, 0xFFFFFFFF].
  return unsigned > 0x7fffffff ? unsigned - 0x100000000 : unsigned;
}
