export interface ParsedChunk {
  index: number;
  offset: number;
  tag: string;
  declaredLength: number;
  payloadHex: string;
  payloadAscii: string;
  expectedCrc: number;
  computedCrc: number;
  crcValid: boolean;
}

export type StepOutcome = 'ok' | 'trapped_error' | 'warning';

export interface ByteHighlight {
  start: number;
  end: number; // exclusive
  kind: 'header' | 'tag' | 'length' | 'payload' | 'crc' | 'fault';
  label: string;
}

export interface TraceStep {
  stepNumber: number;
  phase: string;
  carbonLine: string;
  description: string;
  outcome: StepOutcome;
  highlight: ByteHighlight | null;
  registers: Array<{ name: string; value: string }>;
  carbonResult: string;
  unsafeCppResult: string;
}

export interface SimulationResult {
  bytes: Uint8Array;
  status: 'valid' | 'trapped';
  errorCode: string | null;
  errorDetail: string | null;
  version: number | null;
  declaredChunks: number | null;
  chunks: ParsedChunk[];
  steps: TraceStep[];
}

export interface PresetScenario {
  id: string;
  title: string;
  subtitle: string;
  category: 'Nominal' | 'Bounds Trap' | 'Overflow Trap' | 'Integrity Trap';
  description: string;
  bytes: Uint8Array;
}

// Standard IEEE 802.3 CRC-32
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

export function computeCrc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function formatHexU32(val: number): string {
  return '0x' + (val >>> 0).toString(16).toUpperCase().padStart(8, '0');
}

export function formatHexByte(val: number): string {
  return (val & 0xff).toString(16).toUpperCase().padStart(2, '0');
}

export function bytesToAscii(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    out += b >= 32 && b <= 126 ? String.fromCharCode(b) : '.';
  }
  return out;
}

export function encodeCrbnContainer(
  chunks: Array<{ tag: string; payloadText: string }>
): Uint8Array {
  const encoder = new TextEncoder();
  const encodedChunks = chunks.map((chunk) => {
    const cleanTag = (chunk.tag.toUpperCase() + '    ').slice(0, 4);
    const tagBytes = encoder.encode(cleanTag);
    const payloadBytes = encoder.encode(chunk.payloadText);
    const len = payloadBytes.length;

    const frameWithoutCrc = new Uint8Array(8 + len);
    frameWithoutCrc.set(tagBytes, 0);
    frameWithoutCrc[4] = (len >>> 24) & 0xff;
    frameWithoutCrc[5] = (len >>> 16) & 0xff;
    frameWithoutCrc[6] = (len >>> 8) & 0xff;
    frameWithoutCrc[7] = len & 0xff;
    frameWithoutCrc.set(payloadBytes, 8);

    const crc = computeCrc32(frameWithoutCrc);
    const fullChunk = new Uint8Array(12 + len);
    fullChunk.set(frameWithoutCrc, 0);
    fullChunk[8 + len] = (crc >>> 24) & 0xff;
    fullChunk[9 + len] = (crc >>> 16) & 0xff;
    fullChunk[10 + len] = (crc >>> 8) & 0xff;
    fullChunk[11 + len] = crc & 0xff;
    return fullChunk;
  });

  const totalBodyLen = encodedChunks.reduce((sum, c) => sum + c.length, 0);
  const result = new Uint8Array(8 + totalBodyLen);
  // Magic "CRBN"
  result[0] = 0x43;
  result[1] = 0x52;
  result[2] = 0x42;
  result[3] = 0x4e;
  // Version 1
  result[4] = 0x01;
  // Chunk count
  result[5] = encodedChunks.length & 0xff;
  // Reserved flags
  result[6] = 0x00;
  result[7] = 0x01;

  let offset = 8;
  for (const c of encodedChunks) {
    result.set(c, offset);
    offset += c.length;
  }
  return result;
}

export function buildPresetScenarios(): PresetScenario[] {
  const nominal = encodeCrbnContainer([
    { tag: 'META', payloadText: 'carbon-interop' },
    { tag: 'DATA', payloadText: 'safe-slice' },
  ]);

  // Overread trap: valid CRBN header + META tag, but declared length = 256 (0x00000100) while only 4 payload bytes exist
  const overreadBase = encodeCrbnContainer([{ tag: 'META', payloadText: 'leak' }]);
  const overread = new Uint8Array(overreadBase);
  overread[12] = 0x00;
  overread[13] = 0x00;
  overread[14] = 0x01;
  overread[15] = 0x00; // 256 bytes!

  // Integer overflow trap: declared length = 0xFFFFFFFC (4294967292)
  const overflowBase = encodeCrbnContainer([{ tag: 'TRAP', payloadText: 'wrap' }]);
  const overflow = new Uint8Array(overflowBase);
  overflow[12] = 0xff;
  overflow[13] = 0xff;
  overflow[14] = 0xff;
  overflow[15] = 0xfc;

  // Corrupted payload checksum: flip 1 byte inside payload of valid container
  const corruptedBase = encodeCrbnContainer([
    { tag: 'SIGN', payloadText: 'verified-v1' },
  ]);
  const corrupted = new Uint8Array(corruptedBase);
  corrupted[18] = corrupted[18] ^ 0x20; // flip bit in 'verified-v1'

  // Invalid magic header
  const badMagic = new Uint8Array(nominal);
  badMagic[0] = 0x4a; // J
  badMagic[1] = 0x55; // U
  badMagic[2] = 0x4e; // N
  badMagic[3] = 0x4b; // K

  return [
    {
      id: 'nominal',
      title: 'Nominal Two-Chunk Container',
      subtitle: 'Valid CRBN header, bounds, and CRC-32 checksums',
      category: 'Nominal',
      description:
        'Legacy C++ FileBuffer passes 56 raw bytes to Carbon. SafeSlice validates each chunk boundary and verifies both CRC-32 digests.',
      bytes: nominal,
    },
    {
      id: 'overread',
      title: 'Heartbleed-Style Overread Trap',
      subtitle: 'Header claims 256 payload bytes in a 24-byte buffer',
      category: 'Bounds Trap',
      description:
        'Mimics CVE-2014-0160: an untrusted header declares 256 bytes when only 4 exist. Carbon traps OutOfBounds before touching memory.',
      bytes: overread,
    },
    {
      id: 'overflow',
      title: '32-Bit Length Wraparound Trap',
      subtitle: 'Declared length 0xFFFFFFFC attempts offset wraparound',
      category: 'Overflow Trap',
      description:
        'A naive C++ addition `offset + declared_len` can wrap around 32-bit counters. Carbon CheckedAdd traps LengthOverflow immediately.',
      bytes: overflow,
    },
    {
      id: 'checksum',
      title: 'Corrupted Payload Bit-Flip',
      subtitle: 'Single-byte payload mutation caught by CRC-32',
      category: 'Integrity Trap',
      description:
        'Byte 18 in the payload is altered after encoding. Carbon parses bounds safely, then flags ChecksumMismatch with expected vs. actual digests.',
      bytes: corrupted,
    },
    {
      id: 'bad_magic',
      title: 'Invalid Magic Signature',
      subtitle: 'Buffer starts with JUNK instead of CRBN',
      category: 'Integrity Trap',
      description:
        'Carbon verifies the 4-byte magic prefix via SafeSlice.ReadU8 before allocating or reading any chunk fields.',
      bytes: badMagic,
    },
  ];
}

export function parseHexString(hexText: string): Uint8Array | null {
  const cleaned = hexText.replace(/[^0-9a-fA-F]/g, '');
  if (cleaned.length === 0 || cleaned.length % 2 !== 0) {
    return null;
  }
  const out = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(cleaned.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function bytesToHexString(bytes: Uint8Array): string {
  return Array.from(bytes, formatHexByte).join(' ');
}

function readU32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0
  );
}

export function simulateCarbonParser(bytes: Uint8Array): SimulationResult {
  const steps: TraceStep[] = [];
  const chunks: ParsedChunk[] = [];
  const len = bytes.length;
  let stepNum = 1;

  // Step 1: C++ -> Carbon boundary wrap
  steps.push({
    stepNumber: stepNum++,
    phase: '01. C++ Boundary Seal',
    carbonLine: 'let raw_slice: SafeSlice(u8) = SafeSlice(u8).FromRaw(buf->Data(), buf->Size());',
    description: `Carbon receives Cpp.legacy_io.FileBuffer* and seals raw pointer + length (${len} bytes) inside SafeSlice(u8).`,
    outcome: 'ok',
    highlight: len > 0 ? { start: 0, end: len, kind: 'header', label: 'Wrapped FileBuffer' } : null,
    registers: [
      { name: 'buf->Size()', value: `${len} bytes` },
      { name: 'cursor', value: '0' },
      { name: 'remaining', value: `${len} bytes` },
    ],
    carbonResult: `SafeSlice(u8) initialized with invariant len = ${len}.`,
    unsafeCppResult: 'C++ passes naked uint8_t* pointer; caller must manually remember size.',
  });

  // Step 2: Header size check
  if (len < 8) {
    steps.push({
      stepNumber: stepNum++,
      phase: '02. Header Length Guard',
      carbonLine: 'if (raw_slice.Len() < 8) { return .Err(.TruncatedHeader); }',
      description: `Container requires at least 8 header bytes, but SafeSlice reports only ${len} bytes.`,
      outcome: 'trapped_error',
      highlight: len > 0 ? { start: 0, end: len, kind: 'fault', label: 'Truncated Header' } : null,
      registers: [
        { name: 'raw_slice.Len()', value: `${len}` },
        { name: 'required', value: '8' },
      ],
      carbonResult: 'Trapped: ParseError.TruncatedHeader returned cleanly.',
      unsafeCppResult: 'Undefined Behavior: ReadChunkUnsafe reads past buffer end on stack/heap.',
    });
    return {
      bytes,
      status: 'trapped',
      errorCode: 'TruncatedHeader',
      errorDetail: `Expected 8 header bytes, got ${len} bytes.`,
      version: null,
      declaredChunks: null,
      chunks,
      steps,
    };
  }

  // Step 2b: Magic check
  const magic = bytesToAscii(bytes.slice(0, 4));
  const magicOk =
    bytes[0] === 0x43 && bytes[1] === 0x52 && bytes[2] === 0x42 && bytes[3] === 0x4e;

  if (!magicOk) {
    steps.push({
      stepNumber: stepNum++,
      phase: '02. Magic Signature Check',
      carbonLine: 'if (raw_slice.ReadU8(0) != .Ok(0x43) or ... ) { return .Err(.InvalidMagic); }',
      description: `First 4 bytes decoded as "${magic}" (${Array.from(bytes.slice(0, 4), formatHexByte).join(' ')}), expected "CRBN" (43 52 42 4E).`,
      outcome: 'trapped_error',
      highlight: { start: 0, end: 4, kind: 'fault', label: 'Invalid Magic' },
      registers: [
        { name: 'magic', value: `"${magic}"` },
        { name: 'expected', value: '"CRBN"' },
      ],
      carbonResult: 'Trapped: ParseError.InvalidMagic. Parser aborts before touching chunk body.',
      unsafeCppResult: 'May continue parsing garbage bytes if return code is ignored.',
    });
    return {
      bytes,
      status: 'trapped',
      errorCode: 'InvalidMagic',
      errorDetail: `Magic header "${magic}" does not match "CRBN".`,
      version: bytes[4],
      declaredChunks: bytes[5],
      chunks,
      steps,
    };
  }

  const version = bytes[4];
  const chunkCount = bytes[5];

  steps.push({
    stepNumber: stepNum++,
    phase: '02. Container Header Verified',
    carbonLine: 'let version: u8 = raw_slice.ReadU8(4).UnwrapOr(0);',
    description: `Verified "CRBN" signature, format version ${version}, and declared chunk count = ${chunkCount}.`,
    outcome: 'ok',
    highlight: { start: 0, end: 8, kind: 'header', label: 'CRBN Header' },
    registers: [
      { name: 'magic', value: '"CRBN"' },
      { name: 'version', value: `${version}` },
      { name: 'chunk_count', value: `${chunkCount}` },
      { name: 'cursor', value: '8' },
    ],
    carbonResult: `Header valid. Advancing cursor to byte offset 8.`,
    unsafeCppResult: `Header read succeeds (bytes 0..7 are inside buffer).`,
  });

  if (version !== 1) {
    steps.push({
      stepNumber: stepNum++,
      phase: '03. Version Guard',
      carbonLine: 'if (version != 1) { return .Err(.UnsupportedVersion(version)); }',
      description: `Container declares format version ${version}; parser only supports version 1.`,
      outcome: 'trapped_error',
      highlight: { start: 4, end: 5, kind: 'fault', label: 'Unsupported Version' },
      registers: [
        { name: 'version', value: `${version}` },
        { name: 'supported', value: '1' },
      ],
      carbonResult: `Trapped: ParseError.UnsupportedVersion(${version}).`,
      unsafeCppResult: 'Continues interpreting incompatible v2+ field layout.',
    });
    return {
      bytes,
      status: 'trapped',
      errorCode: `UnsupportedVersion(${version})`,
      errorDetail: `Format version ${version} is unsupported (expected 1).`,
      version,
      declaredChunks: chunkCount,
      chunks,
      steps,
    };
  }

  let cursor = 8;
  for (let i = 0; i < chunkCount; i++) {
    // Check chunk 8-byte header (tag + len)
    if (cursor + 8 > len) {
      steps.push({
        stepNumber: stepNum++,
        phase: `03.${i + 1} Chunk Header Bounds`,
        carbonLine: 'let declared_len: u32 = ReadU32BE(raw_slice, cursor + 4)?;',
        description: `Chunk #${i + 1} needs 8 header bytes at offset ${cursor}, only ${Math.max(0, len - cursor)} remaining.`,
        outcome: 'trapped_error',
        highlight: {
          start: Math.min(cursor, len),
          end: len,
          kind: 'fault',
          label: 'Truncated Chunk Header',
        },
        registers: [
          { name: 'chunk_index', value: `${i}` },
          { name: 'cursor', value: `${cursor}` },
          { name: 'remaining', value: `${Math.max(0, len - cursor)}` },
        ],
        carbonResult: `Trapped: ParseError.OutOfBounds(${cursor + 8}, ${len}).`,
        unsafeCppResult: `ReadChunkUnsafe reads ${cursor + 8 - len} unallocated bytes past buffer!`,
      });
      return {
        bytes,
        status: 'trapped',
        errorCode: 'OutOfBounds',
        errorDetail: `Chunk #${i + 1} header requires offset ${cursor + 8}, buffer length is ${len}.`,
        version,
        declaredChunks: chunkCount,
        chunks,
        steps,
      };
    }

    const tag = bytesToAscii(bytes.slice(cursor, cursor + 4));
    const declaredLen = readU32BE(bytes, cursor + 4);

    steps.push({
      stepNumber: stepNum++,
      phase: `03.${i + 1} Decode Chunk Header`,
      carbonLine: 'let declared_len: u32 = ReadU32BE(raw_slice, cursor + 4)?;',
      description: `Chunk #${i + 1} tag="${tag}" at offset ${cursor}, declared payload length = ${declaredLen} bytes (${formatHexU32(declaredLen)}).`,
      outcome: 'ok',
      highlight: {
        start: cursor,
        end: cursor + 8,
        kind: 'tag',
        label: `Chunk #${i + 1} Header`,
      },
      registers: [
        { name: 'tag', value: `"${tag}"` },
        { name: 'declared_len', value: `${declaredLen} (${formatHexU32(declaredLen)})` },
        { name: 'payload_start', value: `${cursor + 8}` },
        { name: 'remaining', value: `${len - (cursor + 8)}` },
      ],
      carbonResult: `Chunk metadata decoded safely; next step validates bounds before slicing.`,
      unsafeCppResult: `ReadChunkUnsafe trusts declared_len = ${declaredLen} without checking buffer size.`,
    });

    // Overflow / 32-bit wraparound trap
    const u32Wrapped = ((cursor + 8 + declaredLen) >>> 0);
    if (declaredLen >= 0xffff0000) {
      steps.push({
        stepNumber: stepNum++,
        phase: `04.${i + 1} Checked Arithmetic Guard`,
        carbonLine: 'let crc_offset: u64 = CheckedAdd(cursor + 8, declared_len as u64)?;',
        description: `Declared length ${formatHexU32(declaredLen)} (${declaredLen.toLocaleString()} bytes) triggers integer overflow protection.`,
        outcome: 'trapped_error',
        highlight: {
          start: cursor + 4,
          end: cursor + 8,
          kind: 'fault',
          label: 'Integer Overflow Trap',
        },
        registers: [
          { name: 'declared_len', value: formatHexU32(declaredLen) },
          { name: 'naive_u32_sum', value: `${u32Wrapped} (WRAPPED!)` },
          { name: 'available', value: `${len - (cursor + 8)} bytes` },
        ],
        carbonResult: 'Trapped: ParseError.LengthOverflow / OutOfBounds. No wraparound bypass possible.',
        unsafeCppResult: `32-bit addition wraps (${cursor + 8} + ${declaredLen}) -> ${u32Wrapped}, bypassing naive \`end <= size\` check!`,
      });
      return {
        bytes,
        status: 'trapped',
        errorCode: 'LengthOverflow',
        errorDetail: `Chunk "${tag}" length ${formatHexU32(declaredLen)} triggers overflow/wraparound guard.`,
        version,
        declaredChunks: chunkCount,
        chunks,
        steps,
      };
    }

    // Bounds check for payload + 4-byte CRC
    const payloadStart = cursor + 8;
    const payloadEnd = payloadStart + declaredLen;
    const chunkEnd = payloadEnd + 4;

    if (chunkEnd > len) {
      const overreadBytes = chunkEnd - len;
      steps.push({
        stepNumber: stepNum++,
        phase: `04.${i + 1} Payload Bounds Guard`,
        carbonLine: 'let payload_slice = raw_slice.Subslice(cursor + 8, declared_len as u64)?;',
        description: `Chunk "${tag}" requests ${declaredLen} payload bytes + 4 CRC bytes (needs offset ${chunkEnd}), exceeding buffer end (${len}).`,
        outcome: 'trapped_error',
        highlight: {
          start: cursor + 4,
          end: len,
          kind: 'fault',
          label: `Blocked ${overreadBytes}-byte Overread`,
        },
        registers: [
          { name: 'requested_end', value: `${chunkEnd}` },
          { name: 'buffer_len', value: `${len}` },
          { name: 'overread_delta', value: `+${overreadBytes} bytes` },
        ],
        carbonResult: `Trapped: ParseError.OutOfBounds(${chunkEnd}, ${len}). Zero out-of-bounds memory accessed.`,
        unsafeCppResult: `ReadChunkUnsafe reads ${overreadBytes} bytes past heap allocation (Heartbleed leak).`,
      });
      return {
        bytes,
        status: 'trapped',
        errorCode: 'OutOfBounds',
        errorDetail: `Chunk "${tag}" requested end offset ${chunkEnd}, but buffer ends at ${len} (+${overreadBytes} bytes).`,
        version,
        declaredChunks: chunkCount,
        chunks,
        steps,
      };
    }

    const payloadBytes = bytes.slice(payloadStart, payloadEnd);
    const expectedCrc = readU32BE(bytes, payloadEnd);
    const computedCrc = computeCrc32(bytes.slice(cursor, payloadEnd));
    const crcValid = expectedCrc === computedCrc;

    steps.push({
      stepNumber: stepNum++,
      phase: `04.${i + 1} Checked Slice & CRC-32`,
      carbonLine: 'if (expected_crc != computed_crc) { return .Err(.ChecksumMismatch(...)); }',
      description: crcValid
        ? `Sliced ${declaredLen} bytes for "${tag}" cleanly. CRC-32 matches (${formatHexU32(computedCrc)}).`
        : `Sliced ${declaredLen} bytes safely, but CRC-32 mismatch: header ${formatHexU32(expectedCrc)} != computed ${formatHexU32(computedCrc)}.`,
      outcome: crcValid ? 'ok' : 'trapped_error',
      highlight: {
        start: payloadStart,
        end: chunkEnd,
        kind: crcValid ? 'payload' : 'fault',
        label: crcValid ? `Verified "${tag}"` : 'CRC-32 Mismatch',
      },
      registers: [
        { name: 'payload_bytes', value: `${declaredLen}` },
        { name: 'expected_crc', value: formatHexU32(expectedCrc) },
        { name: 'computed_crc', value: formatHexU32(computedCrc) },
      ],
      carbonResult: crcValid
        ? `Chunk "${tag}" verified and emitted as SafeSlice(u8).`
        : `Trapped: ParseError.ChecksumMismatch(${formatHexU32(expectedCrc)}, ${formatHexU32(computedCrc)}).`,
      unsafeCppResult: crcValid
        ? 'Payload copied; still lacks lifetime safety guarantees.'
        : 'Silent data corruption accepted if CRC check is omitted.',
    });

    chunks.push({
      index: i,
      offset: cursor,
      tag,
      declaredLength: declaredLen,
      payloadHex: bytesToHexString(payloadBytes),
      payloadAscii: bytesToAscii(payloadBytes),
      expectedCrc,
      computedCrc,
      crcValid,
    });

    if (!crcValid) {
      return {
        bytes,
        status: 'trapped',
        errorCode: 'ChecksumMismatch',
        errorDetail: `Chunk "${tag}" expected CRC ${formatHexU32(expectedCrc)}, computed ${formatHexU32(computedCrc)}.`,
        version,
        declaredChunks: chunkCount,
        chunks,
        steps,
      };
    }

    cursor = chunkEnd;
  }

  return {
    bytes,
    status: 'valid',
    errorCode: null,
    errorDetail: null,
    version,
    declaredChunks: chunkCount,
    chunks,
    steps,
  };
}
