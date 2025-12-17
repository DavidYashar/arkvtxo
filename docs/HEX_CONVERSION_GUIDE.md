# Hex to Data Conversion Guide

## 🎯 The Three Core Conversion Methods

When decoding the OP_RETURN data, we use **three fundamental conversion methods**:

### 1. **Hex → Text** (ASCII/UTF-8 Character Encoding)
### 2. **Hex → Single Number** (Direct byte value)
### 3. **Hex → Big Number** (Multi-byte integer with Little-Endian)

---

## 📖 Method 1: Hex → Text (ASCII/UTF-8)

### How It Works

Every text character has a numeric code in the ASCII/UTF-8 standard:
- `A` = 65 (decimal) = 0x41 (hex)
- `B` = 66 (decimal) = 0x42 (hex)
- `Z` = 90 (decimal) = 0x5A (hex)
- `a` = 97 (decimal) = 0x61 (hex)
- `0` = 48 (decimal) = 0x30 (hex)

### Example: "ARK"

```
Hex:     41    52    4b
         ↓     ↓     ↓
Decimal: 65    82    75
         ↓     ↓     ↓
ASCII:   A     R     K
```

**Detailed Breakdown:**

```
0x41 (Hex) → 65 (Decimal) → "A" (Character)
├─ Binary: 01000001
├─ Calculation: (4 × 16) + (1 × 1) = 64 + 1 = 65
└─ ASCII Table Lookup: 65 = "A"

0x52 (Hex) → 82 (Decimal) → "R" (Character)
├─ Binary: 01010010
├─ Calculation: (5 × 16) + (2 × 1) = 80 + 2 = 82
└─ ASCII Table Lookup: 82 = "R"

0x4b (Hex) → 75 (Decimal) → "K" (Character)
├─ Binary: 01001011
├─ Calculation: (4 × 16) + (11 × 1) = 64 + 11 = 75
└─ ASCII Table Lookup: 75 = "K"
```

### JavaScript Code

```javascript
const buffer = Buffer.from('41524b', 'hex');
const text = buffer.toString('utf8');
console.log(text); // "ARK"

// Or character by character:
buffer.forEach(byte => {
  console.log(String.fromCharCode(byte));
  // "A", "R", "K"
});
```

### Full Example: "TestToken"

```
Hex:  54 65 73 74 54 6f 6b 65 6e
      │  │  │  │  │  │  │  │  │
Dec:  84 101 115 116 84 111 107 101 110
      │  │  │  │  │  │  │  │  │
Char: T  e  s  t  T  o  k  e  n
```

---

## 📖 Method 2: Hex → Single Number (Direct Value)

### How It Works

For single bytes (0-255), the hex value IS the number:
- `0x01` = 1
- `0x08` = 8
- `0x1d` = 29
- `0xFF` = 255

### Conversion Formula

For a 2-digit hex number like `0xAB`:
```
Decimal = (A × 16) + (B × 1)
```

### Examples from Your Token

**Version: 0x01**
```
Hex:     01
         ↓
Decimal: 1

Calculation: (0 × 16) + (1 × 1) = 1
```

**Decimals: 0x08**
```
Hex:     08
         ↓
Decimal: 8

Calculation: (0 × 16) + (8 × 1) = 8
```

**OP_PUSHBYTES: 0x1d**
```
Hex:     1d
         ↓
Decimal: 29

Calculation: (1 × 16) + (13 × 1) = 29
Note: 'd' in hex = 13 in decimal
```

### JavaScript Code

```javascript
const buffer = Buffer.from('01', 'hex');
const value = buffer[0]; // or buffer.readUInt8(0)
console.log(value); // 1

// For any single byte:
const byte = buffer.readUInt8(0);
```

### Hex Digit Reference

```
Hex:  0  1  2  3  4  5  6  7  8  9  a  b  c  d  e  f
Dec:  0  1  2  3  4  5  6  7  8  9  10 11 12 13 14 15
```

---

## 📖 Method 3: Hex → Big Number (Little-Endian 64-bit)

### How It Works

For large numbers (bigger than 255), we use multiple bytes. The bytes are stored in **Little-Endian** format, meaning:
- **Least significant byte FIRST** (rightmost digit)
- **Most significant byte LAST** (leftmost digit)

### Why Little-Endian?

Modern CPUs (Intel, AMD, ARM) process numbers in little-endian format internally. It's faster and more efficient.

### Example: 1,000,000 (One Million)

**Hex representation: `40 42 0f 00 00 00 00 00`**

```
Position in hex:  [0]  [1]  [2]  [3]  [4]  [5]  [6]  [7]
Hex bytes:        40   42   0f   00   00   00   00   00
                  ↓    ↓    ↓    ↓    ↓    ↓    ↓    ↓
Power of 256:     2⁰   2⁸   2¹⁶  2²⁴  2³²  2⁴⁰  2⁴⁸  2⁵⁶
Multiplier:       ×1   ×256 ×65K ×16M ×4B  ×1T  ×281T ×72P
```

**Step-by-step calculation:**

```
Byte [0]: 0x40 = 64 decimal
  64 × 2⁰ = 64 × 1 = 64

Byte [1]: 0x42 = 66 decimal
  66 × 2⁸ = 66 × 256 = 16,896

Byte [2]: 0x0f = 15 decimal
  15 × 2¹⁶ = 15 × 65,536 = 983,040

Bytes [3-7]: All 0x00 = 0
  0 × (anything) = 0

──────────────────────────────
Total: 64 + 16,896 + 983,040 = 1,000,000 ✅
```

### Visual Comparison: Little-Endian vs Big-Endian

**Little-Endian (our format):**
```
Memory:  [40] [42] [0f] [00] [00] [00] [00] [00]
Position: ─┬─  ─┬─  ─┬─  ─┬─  ─┬─  ─┬─  ─┬─  ─┬─
          LSB                                 MSB
          (Least Significant)    (Most Significant)

Reads: 0x000000000f4240 → 1,000,000
```

**Big-Endian (opposite):**
```
Memory:  [00] [00] [00] [00] [00] [0f] [42] [40]
Position: ─┬─  ─┬─  ─┬─  ─┬─  ─┬─  ─┬─  ─┬─  ─┬─
          MSB                                 LSB

Reads: 0x000000000f4240 → 1,000,000
```

Both represent the same number, just stored in reverse byte order!

### Another Example: 12,345 in Little-Endian

```
12,345 decimal = 0x3039 hex

Little-Endian (8 bytes):
39 30 00 00 00 00 00 00
↓  ↓
0x39 × 1     = 57 × 1   = 57
0x30 × 256   = 48 × 256 = 12,288
                          ──────
                          12,345 ✅
```

### JavaScript Code

```javascript
// Little-Endian (our format)
const buffer = Buffer.from('40420f0000000000', 'hex');
const value = buffer.readBigUInt64LE(0);
console.log(value.toString()); // "1000000"

// For 32-bit numbers (up to 4 billion):
const buffer32 = Buffer.from('40420f00', 'hex');
const value32 = buffer32.readUInt32LE(0);
console.log(value32); // 1000000
```

---

## 🧮 Complete Decoding Example

Let's decode your entire OP_RETURN step by step:

### Hex Input
```
6a1d41524b01010954657374546f6b656e045445535440420f000000000008
```

### Decoding Process

```javascript
const buffer = Buffer.from('6a1d41524b01010954657374546f6b656e045445535440420f000000000008', 'hex');
let offset = 0;

// ═══════════════════════════════════════════════════════
// BITCOIN LAYER
// ═══════════════════════════════════════════════════════

// Byte 0: OP_RETURN (0x6a = 106)
const opReturn = buffer.readUInt8(offset++);
console.log('OP_RETURN:', opReturn); // 106

// Byte 1: OP_PUSHBYTES_29 (0x1d = 29)
const pushBytes = buffer.readUInt8(offset++);
console.log('Push bytes:', pushBytes); // 29

// ═══════════════════════════════════════════════════════
// ARKADE TOKEN DATA
// ═══════════════════════════════════════════════════════

// Bytes 2-4: Protocol "ARK" (TEXT CONVERSION)
const protocol = buffer.subarray(offset, offset + 3).toString('utf8');
offset += 3;
console.log('Protocol:', protocol); // "ARK"

// Byte 5: Version (SINGLE NUMBER)
const version = buffer.readUInt8(offset++);
console.log('Version:', version); // 1

// Byte 6: Op Type (SINGLE NUMBER)
const opType = buffer.readUInt8(offset++);
console.log('Op Type:', opType); // 1 (CREATE)

// Byte 7: Name Length (SINGLE NUMBER)
const nameLen = buffer.readUInt8(offset++);
console.log('Name Length:', nameLen); // 9

// Bytes 8-16: Name "TestToken" (TEXT CONVERSION)
const name = buffer.subarray(offset, offset + nameLen).toString('utf8');
offset += nameLen;
console.log('Name:', name); // "TestToken"

// Byte 17: Symbol Length (SINGLE NUMBER)
const symbolLen = buffer.readUInt8(offset++);
console.log('Symbol Length:', symbolLen); // 4

// Bytes 18-21: Symbol "TEST" (TEXT CONVERSION)
const symbol = buffer.subarray(offset, offset + symbolLen).toString('utf8');
offset += symbolLen;
console.log('Symbol:', symbol); // "TEST"

// Bytes 22-29: Total Supply (BIG NUMBER - LITTLE ENDIAN)
const supply = buffer.readBigUInt64LE(offset);
offset += 8;
console.log('Supply:', supply.toString()); // "1000000"

// Byte 30: Decimals (SINGLE NUMBER)
const decimals = buffer.readUInt8(offset++);
console.log('Decimals:', decimals); // 8

console.log('\n✅ Decoding complete!');
```

### Output
```
OP_RETURN: 106
Push bytes: 29
Protocol: ARK
Version: 1
Op Type: 1
Name Length: 9
Name: TestToken
Symbol Length: 4
Symbol: TEST
Supply: 1000000
Decimals: 8

✅ Decoding complete!
```

---

## 📊 Conversion Method Summary

| Data Type | Size | Method | Example |
|-----------|------|--------|---------|
| **Text/String** | Variable | UTF-8 encoding | `0x41524b` → "ARK" |
| **Single byte** | 1 byte | Direct value | `0x08` → 8 |
| **16-bit integer** | 2 bytes | Little-endian | `0x3930` → 12,345 |
| **32-bit integer** | 4 bytes | Little-endian | `0x40420f00` → 1,000,000 |
| **64-bit integer** | 8 bytes | Little-endian | `0x40420f0000000000` → 1,000,000 |

---

## 🔧 JavaScript Buffer Methods Reference

```javascript
// Read single byte (0-255)
buffer[0]                    // Direct access
buffer.readUInt8(0)          // Method call

// Read text
buffer.toString('utf8')      // UTF-8 string
buffer.toString('ascii')     // ASCII string
buffer.subarray(0, 3)        // Get slice, then .toString()

// Read 16-bit integer (0-65,535)
buffer.readUInt16LE(0)       // Little-endian
buffer.readUInt16BE(0)       // Big-endian

// Read 32-bit integer (0-4,294,967,295)
buffer.readUInt32LE(0)       // Little-endian
buffer.readUInt32BE(0)       // Big-endian

// Read 64-bit integer (0-18,446,744,073,709,551,615)
buffer.readBigUInt64LE(0)    // Little-endian (returns BigInt)
buffer.readBigUInt64BE(0)    // Big-endian (returns BigInt)
```

---

## 🎓 Key Takeaways

1. **Text (ASCII/UTF-8)**: Each byte = character code
   - `0x41` → 65 → "A"
   - Simple lookup table

2. **Single Numbers**: Hex directly converts to decimal
   - `0x08` → 8
   - Formula: `(digit1 × 16) + digit2`

3. **Big Numbers (Little-Endian)**: Multiple bytes, least significant first
   - `40 42 0f 00...` → 1,000,000
   - Each byte position has power: 2⁰, 2⁸, 2¹⁶, etc.

4. **No Complex Math Needed**: JavaScript's Buffer class does all the work!
   - `.toString('utf8')` for text
   - `.readUInt8()` for single bytes
   - `.readBigUInt64LE()` for big numbers

---

## 🧪 Try It Yourself

```javascript
// Decode your own hex data
const hex = '54455354'; // "TEST"
const buffer = Buffer.from(hex, 'hex');
console.log(buffer.toString('utf8')); // "TEST"

// Encode text to hex
const text = 'HELLO';
const hexString = Buffer.from(text, 'utf8').toString('hex');
console.log(hexString); // "48454c4c4f"

// Decode number
const numHex = '40420f0000000000';
const numBuffer = Buffer.from(numHex, 'hex');
console.log(numBuffer.readBigUInt64LE(0).toString()); // "1000000"

// Encode number
const num = 1000000;
const encoded = Buffer.allocUnsafe(8);
encoded.writeBigUInt64LE(BigInt(num), 0);
console.log(encoded.toString('hex')); // "40420f0000000000"
```

---

**That's it!** These three simple conversion methods are all you need to decode any OP_RETURN data. 🎉

No complex mathematical functions - just:
1. **Hex → Text** (character codes)
2. **Hex → Number** (direct conversion)
3. **Hex → Big Number** (little-endian multi-byte)
