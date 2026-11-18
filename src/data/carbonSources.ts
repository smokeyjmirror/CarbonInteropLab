export interface LineAnnotation {
  line: number;
  concept: string;
  explanation: string;
}

export interface SourceFile {
  id: string;
  filename: string;
  language: 'carbon' | 'cpp';
  languageLabel: string;
  role: string;
  summary: string;
  code: string;
  annotations: LineAnnotation[];
}

export interface MigrationTopic {
  id: string;
  title: string;
  category: string;
  summary: string;
  cppCode: string;
  carbonCode: string;
  keyTakeaways: string[];
}

export interface DrillQuestion {
  id: string;
  topic: string;
  prompt: string;
  codeSnippet: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export const SOURCE_FILES: SourceFile[] = [
  {
    id: 'legacy_reader_h',
    filename: 'legacy_reader.h',
    language: 'cpp',
    languageLabel: 'C++20 Header',
    role: 'Legacy C++ I/O Layer',
    summary:
      'Existing C++ file buffer class exposing raw pointer and byte length, plus an unsafe C++ parser function for contrast.',
    code: `#pragma once
#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>

namespace legacy_io {

class FileBuffer {
 public:
  explicit FileBuffer(std::vector<uint8_t> bytes);

  const uint8_t* Data() const noexcept { return bytes_.data(); }
  size_t Size() const noexcept { return bytes_.size(); }

 private:
  std::vector<uint8_t> bytes_;
};

// Unsafe C++ anti-pattern: trusts length prefix without bounds checks.
struct UnsafeChunkView {
  char tag[5];
  uint32_t declared_length;
  const uint8_t* payload_ptr;
};

UnsafeChunkView ReadChunkUnsafe(const FileBuffer& buf, size_t offset);

}  // namespace legacy_io`,
    annotations: [
      {
        line: 9,
        concept: 'C++ Class Imported by Carbon',
        explanation:
          'Carbon consumes this C++ class directly via `import Cpp library "legacy_reader.h"` without writing manual C ABI shims or bindgen boilerplate.',
      },
      {
        line: 13,
        concept: 'Raw Pointer Boundary',
        explanation:
          'Legacy C++ exposes a raw `const uint8_t*` and `size_t`. Carbon wraps these at the boundary into a bounds-checked `SafeSpan` before any byte indexing occurs.',
      },
      {
        line: 20,
        concept: 'Heartbleed-Class Vulnerability',
        explanation:
          'In naive C++, trusting `declared_length` from untrusted file headers allows reading past `bytes_.size()` into adjacent heap memory.',
      },
    ],
  },
  {
    id: 'legacy_reader_cpp',
    filename: 'legacy_reader.cpp',
    language: 'cpp',
    languageLabel: 'C++20 Source',
    role: 'Legacy C++ Implementation',
    summary:
      'Implements FileBuffer storage and demonstrates how naive C++ pointer arithmetic silently causes heap overreads.',
    code: `#include "legacy_reader.h"
#include <cstring>

namespace legacy_io {

FileBuffer::FileBuffer(std::vector<uint8_t> bytes)
    : bytes_(std::move(bytes)) {}

UnsafeChunkView ReadChunkUnsafe(const FileBuffer& buf, size_t offset) {
  const uint8_t* base = buf.Data();
  UnsafeChunkView view{};

  // BUG 1: No check that offset + 8 <= buf.Size()
  std::memcpy(view.tag, base + offset, 4);
  view.tag[4] = '\\0';

  // BUG 2: Big-endian length read directly from untrusted bytes
  view.declared_length =
      (static_cast<uint32_t>(base[offset + 4]) << 24) |
      (static_cast<uint32_t>(base[offset + 5]) << 16) |
      (static_cast<uint32_t>(base[offset + 6]) << 8) |
      static_cast<uint32_t>(base[offset + 7]);

  // BUG 3: Returns pointer past end if declared_length > remaining bytes
  view.payload_ptr = base + offset + 8;
  return view;
}`,
    annotations: [
      {
        line: 14,
        concept: 'Unchecked Offset Arithmetic',
        explanation:
          'If `offset` is near or beyond `buf.Size()`, `std::memcpy` immediately triggers Undefined Behavior (stack/heap out-of-bounds read).',
      },
      {
        line: 25,
        concept: 'Dangling / Overread Pointer',
        explanation:
          'Returning a raw pointer + length without validating `offset + 8 + declared_length <= buf.Size()` is the exact pattern behind CVE-2014-0160 (Heartbleed).',
      },
    ],
  },
  {
    id: 'safe_slice_carbon',
    filename: 'safe_slice.carbon',
    language: 'carbon',
    languageLabel: 'Carbon API Module',
    role: 'Checked Slice & Algebraic Errors',
    summary:
      'Defines generic bounds-checked slices, checked integer addition, and explicit Choice error variants in Carbon.',
    code: `package SafeParser api;

choice ParseError {
  TruncatedHeader,
  InvalidMagic,
  UnsupportedVersion(version: u8),
  LengthOverflow,
  OutOfBounds(requested: u64, available: u64),
  ChecksumMismatch(expected: u32, actual: u32)
}

choice Result(T:! type, E:! type) {
  Ok(value: T),
  Err(error: E)
}

class SafeSlice(T:! type) {
  fn FromRaw[ptr: T*, len: u64]() -> Self {
    return {.ptr = ptr, .len = len};
  }

  fn Len[self: Self]() -> u64 {
    return self.len;
  }

  fn Subslice[self: Self](start: u64, count: u64) -> Result(Self, ParseError) {
    match (CheckedAdd(start, count)) {
      case .Err(e) => { return .Err(e); }
      case .Ok(end) => {
        if (end > self.len) {
          return .Err(.OutOfBounds(end, self.len));
        }
        return .Ok({.ptr = self.ptr + start, .len = count});
      }
    }
  }

  fn ReadU8[self: Self](index: u64) -> Result(u8, ParseError) {
    if (index >= self.len) {
      return .Err(.OutOfBounds(index + 1, self.len));
    }
    return .Ok(self.ptr[index]);
  }

  private var ptr: T*;
  private var len: u64;
}

fn CheckedAdd(a: u64, b: u64) -> Result(u64, ParseError) {
  let max_u64: u64 = 0xFFFF_FFFF_FFFF_FFFF;
  if (a > max_u64 - b) {
    return .Err(.LengthOverflow);
  }
  return .Ok(a + b);
}`,
    annotations: [
      {
        line: 1,
        concept: 'Package & API Visibility',
        explanation:
          '`package SafeParser api;` declares the public API surface of the `SafeParser` package, replacing C++ header/source duplication.',
      },
      {
        line: 3,
        concept: 'Algebraic Sum Types (choice)',
        explanation:
          'Unlike C++ error codes or exceptions, `choice ParseError` models every failure mode with typed payloads (`OutOfBounds`, `ChecksumMismatch`).',
      },
      {
        line: 12,
        concept: 'Checked Generics (`T:! type`)',
        explanation:
          '`:!` introduces a compile-time generic parameter. Carbon type-checks generic definitions once at declaration time, avoiding C++ template instantiation errors.',
      },
      {
        line: 18,
        concept: 'Explicit `self` Parameter',
        explanation:
          'Methods declare `[self: Self]` (read-only value/ref) or `[addr self: Self*]` (mutating) in square brackets, making mutability explicit at every call site.',
      },
      {
        line: 26,
        concept: 'Overflow-Free Sub-Slicing',
        explanation:
          '`Subslice` validates `start + count` via `CheckedAdd` before comparing against `self.len`, defeating 32/64-bit integer wraparound attacks.',
      },
      {
        line: 45,
        concept: 'Private Fields with `var`',
        explanation:
          'Member variables use `private var name: Type;`—making encapsulation clear and uniform without C++ `m_` naming conventions.',
      },
    ],
  },
  {
    id: 'chunk_parser_carbon',
    filename: 'chunk_parser.carbon',
    language: 'carbon',
    languageLabel: 'Carbon Interop Impl',
    role: 'Memory-Safe File Parser',
    summary:
      'Imports C++ `legacy_reader.h` directly, wraps raw bytes in `SafeSlice`, validates headers, and checks CRC-32.',
    code: `package SafeParser impl;

import Cpp library "legacy_reader.h";

interface Diagnostic {
  fn Describe[self: Self]() -> String;
}

class ChunkRecord {
  var tag: array(u8, 4);
  var length: u32;
  var payload: SafeSlice(u8);
  var crc32: u32;
}

impl ChunkRecord as Diagnostic {
  fn Describe[self: Self]() -> String {
    return "Chunk verified with CRC-32";
  }
}

fn ReadU32BE(slice: SafeSlice(u8), offset: u64) -> Result(u32, ParseError) {
  match (slice.Subslice(offset, 4)) {
    case .Err(e) => { return .Err(e); }
    case .Ok(bytes) => {
      let b0: u32 = bytes.ReadU8(0).UnwrapOr(0) as u32;
      let b1: u32 = bytes.ReadU8(1).UnwrapOr(0) as u32;
      let b2: u32 = bytes.ReadU8(2).UnwrapOr(0) as u32;
      let b3: u32 = bytes.ReadU8(3).UnwrapOr(0) as u32;
      return .Ok((b0 << 24) | (b1 << 16) | (b2 << 8) | b3);
    }
  }
}

fn ParseFromCppBuffer(buf: Cpp.legacy_io.FileBuffer*) -> Result(ChunkRecord, ParseError) {
  let raw_slice: SafeSlice(u8) = SafeSlice(u8).FromRaw(buf->Data(), buf->Size());

  // Step 1: Validate 8-byte CRBN container header
  if (raw_slice.Len() < 8) {
    return .Err(.TruncatedHeader);
  }
  if (raw_slice.ReadU8(0) != .Ok(0x43) or raw_slice.ReadU8(1) != .Ok(0x52) or
      raw_slice.ReadU8(2) != .Ok(0x42) or raw_slice.ReadU8(3) != .Ok(0x4E)) {
    return .Err(.InvalidMagic);
  }

  let version: u8 = raw_slice.ReadU8(4).UnwrapOr(0);
  if (version != 1) {
    return .Err(.UnsupportedVersion(version));
  }

  // Step 2: Read chunk length safely at offset 12
  var cursor: u64 = 8;
  let declared_len: u32 = ReadU32BE(raw_slice, cursor + 4)?;

  // Step 3: Bounds-checked payload slice (traps overreads & integer wrap)
  let payload_slice: SafeSlice(u8) =
      raw_slice.Subslice(cursor + 8, declared_len as u64)?;

  // Step 4: Verify trailing 4-byte CRC-32 checksum
  let crc_offset: u64 = CheckedAdd(cursor + 8, declared_len as u64)?;
  let expected_crc: u32 = ReadU32BE(raw_slice, crc_offset)?;
  let computed_crc: u32 = ComputeCrc32(raw_slice.Subslice(cursor, 8 + (declared_len as u64))?);

  if (expected_crc != computed_crc) {
    return .Err(.ChecksumMismatch(expected_crc, computed_crc));
  }

  return .Ok({
    .tag = {0x4D, 0x45, 0x54, 0x41},
    .length = declared_len,
    .payload = payload_slice,
    .crc32 = computed_crc
  });
}`,
    annotations: [
      {
        line: 3,
        concept: 'Direct C++ Library Import',
        explanation:
          '`import Cpp library "legacy_reader.h";` maps C++ namespaces (`legacy_io::FileBuffer`) directly under `Cpp.legacy_io.FileBuffer`.',
      },
      {
        line: 5,
        concept: 'Interfaces & Explicit `impl`',
        explanation:
          'Carbon replaces ad-hoc C++ duck typing with `interface` definitions and explicit `impl Type as Interface` blocks for deterministic dispatch and checked generics.',
      },
      {
        line: 35,
        concept: 'C++ Pointer Interop (`Cpp.legacy_io.FileBuffer*`)',
        explanation:
          'Carbon calls `buf->Data()` and `buf->Size()` directly on the C++ object, then immediately seals the raw pointer inside `SafeSlice(u8)`.',
      },
      {
        line: 54,
        concept: 'Immutable Bindings (`let`) vs `var`',
        explanation:
          '`let declared_len` creates an immutable binding by default; `var cursor` explicitly opts into mutability when an offset advances.',
      },
      {
        line: 60,
        concept: 'Checked Addition Before Checksum Offset',
        explanation:
          'Even if `declared_len` is `0xFFFFFFFC`, `CheckedAdd` traps overflow instead of wrapping around to a valid low memory address.',
      },
    ],
  },
  {
    id: 'main_interop_carbon',
    filename: 'main_interop.carbon',
    language: 'carbon',
    languageLabel: 'Carbon Entrypoint',
    role: 'Bidirectional Execution',
    summary:
      'Constructs a C++ `FileBuffer`, hands it to Carbon `ParseFromCppBuffer`, and pattern-matches the result.',
    code: `package SafeParser impl;

import Cpp library "legacy_reader.h";
import Cpp library "<iostream>";

fn Run(cpp_buffer: Cpp.legacy_io.FileBuffer*) -> i32 {
  match (ParseFromCppBuffer(cpp_buffer)) {
    case .Ok(chunk) => {
      Cpp.std.cout << "Parsed chunk safely, bytes=" << chunk.length << "\\n";
      return 0;
    }
    case .Err(.OutOfBounds(req, avail)) => {
      Cpp.std.cerr << "Trapped out-of-bounds read: requested "
                   << req << " > available " << avail << "\\n";
      return 1;
    }
    case .Err(.LengthOverflow) => {
      Cpp.std.cerr << "Trapped 64-bit length overflow\\n";
      return 2;
    }
    case .Err(other) => {
      Cpp.std.cerr << "Rejected malformed container\\n";
      return 3;
    }
  }
}`,
    annotations: [
      {
        line: 4,
        concept: 'Standard C++ Header Interop',
        explanation:
          'Carbon can import standard C++ headers like `<iostream>` directly during incremental migration alongside custom project headers.',
      },
      {
        line: 7,
        concept: 'Exhaustive Pattern Matching',
        explanation:
          '`match` requires handling `.Ok` and `.Err` variants cleanly, guaranteeing memory-safety failures cannot be silently ignored like C++ return codes.',
      },
    ],
  },
];

export const MIGRATION_TOPICS: MigrationTopic[] = [
  {
    id: 'interop',
    title: 'Bidirectional C++ Interoperability',
    category: 'Migration Strategy',
    summary:
      'Unlike languages that require `extern "C"` FFI wrappers, Carbon imports C++ headers directly and exposes Carbon APIs back to C++.',
    cppCode: `// Consumer in C++ using an FFI bridge
extern "C" int parse_c_abi(const uint8_t* ptr, size_t len);

int RunFromCpp(const legacy_io::FileBuffer& buf) {
  return parse_c_abi(buf.Data(), buf.Size());
}`,
    carbonCode: `// Carbon imports C++ directly without C shims
import Cpp library "legacy_reader.h";

fn Run(buf: Cpp.legacy_io.FileBuffer*) -> i32 {
  let slice: SafeSlice(u8) = SafeSlice(u8).FromRaw(buf->Data(), buf->Size());
  return ParseSlice(slice);
}`,
    keyTakeaways: [
      'Zero FFI serialization overhead: Carbon calls C++ methods using native ABI.',
      'Migrate one module at a time: keep `std::vector` or file I/O in C++ while rewriting untrusted parsing in Carbon.',
      'Namespaced under `Cpp.<namespace>.<Symbol>` so C++ origins remain visually explicit.',
    ],
  },
  {
    id: 'bounds',
    title: 'Bounds-Checked Slices vs. Raw Pointers',
    category: 'Memory Safety',
    summary:
      'Carbon encourages sealing raw `T*` pointers at C++ boundaries into length-carrying slices that return explicit errors instead of reading out of bounds.',
    cppCode: `// Unsafe C++ pointer arithmetic
uint32_t ReadLength(const uint8_t* ptr) {
  // No length attached to ptr!
  return (ptr[4] << 24) | (ptr[5] << 16) | (ptr[6] << 8) | ptr[7];
}`,
    carbonCode: `// Carbon SafeSlice carries its length invariant
fn ReadU32BE(slice: SafeSlice(u8), offset: u64) -> Result(u32, ParseError) {
  match (slice.Subslice(offset, 4)) {
    case .Err(e) => { return .Err(e); }
    case .Ok(b) => { /* guaranteed 4 valid bytes */ }
  }
}`,
    keyTakeaways: [
      'A `SafeSlice(T)` couples pointer + byte count so length is never lost across function calls.',
      'Checked addition prevents `offset + declared_length` from wrapping past `UINT64_MAX`.',
      'Out-of-bounds reads fail deterministically with `.Err(.OutOfBounds(...))` rather than leaking heap memory.',
    ],
  },
  {
    id: 'mutability',
    title: 'Explicit Mutability (`let` vs `var` & `self`)',
    category: 'Language Semantics',
    summary:
      'Carbon replaces C++ `const` qualifier placement quirks with clear `let` (immutable) vs `var` (mutable) declarations and explicit `[addr self: Self*]` receivers.',
    cppCode: `class Cursor {
 public:
  size_t Pos() const { return pos_; }
  void Advance(size_t n) { pos_ += n; }
 private:
  size_t pos_ = 0;
};`,
    carbonCode: `class Cursor {
  fn Pos[self: Self]() -> u64 { return self.pos; }
  fn Advance[addr self: Self*](n: u64) { self->pos += n; }
  private var pos: u64;
}`,
    keyTakeaways: [
      '`let` binds an immutable value; `var` explicitly signals mutable state.',
      '`[self: Self]` cannot mutate object fields; `[addr self: Self*]` is required for mutating methods.',
      'Eliminates C++ `const` east-vs-west pointer confusion (`const int*` vs `int* const`).',
    ],
  },
  {
    id: 'generics',
    title: 'Checked Generics (`:!`) vs. C++ Templates',
    category: 'Type System',
    summary:
      'Carbon generics are type-checked against an `interface` at definition time, preventing thousand-line C++ template instantiation errors.',
    cppCode: `template <typename T>
void LogRecord(const T& item) {
  // Fails only at instantiation if Describe() is missing
  std::cout << item.Describe() << "\\n";
}`,
    carbonCode: `interface Diagnostic {
  fn Describe[self: Self]() -> String;
}

fn LogRecord[T:! Diagnostic](item: T) {
  Cpp.std.cout << item.Describe() << "\\n";
}`,
    keyTakeaways: [
      '`:!` marks a checked generic parameter constrained by an `interface`.',
      'Definition-checked generics enable faster compilation and clear diagnostics before instantiation.',
      'Types must explicitly `impl ChunkRecord as Diagnostic`, avoiding accidental duck-typing.',
    ],
  },
  {
    id: 'choices',
    title: 'Algebraic `choice` Types vs. `std::variant`',
    category: 'Error Handling',
    summary:
      'Carbon provides first-class tagged unions (`choice`) and `match` statements for exhaustive error and AST handling without exceptions.',
    cppCode: `std::variant<ChunkRecord, ParseError> res = Parse(buf);
if (std::holds_alternative<ParseError>(res)) {
  // Easy to forget std::get or mishandle variants
}`,
    carbonCode: `match (ParseFromCppBuffer(buf)) {
  case .Ok(chunk) => { Handle(chunk); }
  case .Err(.OutOfBounds(req, avail)) => { Report(req, avail); }
  case .Err(other) => { Abort(other); }
}`,
    keyTakeaways: [
      'No exception runtime overhead: compatible with zero-cost systems and `-fno-exceptions` C++ codebases.',
      'Compiler verifies exhaustiveness across all `choice` cases.',
      'Each variant carries strongly typed, scoped payload fields.',
    ],
  },
];

export const DRILL_QUESTIONS: DrillQuestion[] = [
  {
    id: 'q1',
    topic: 'C++ Interoperability',
    prompt: 'How does Carbon access a C++ class like `legacy_io::FileBuffer` without writing an `extern "C"` wrapper?',
    codeSnippet: `import Cpp library "legacy_reader.h";
fn Inspect(buf: Cpp.legacy_io.FileBuffer*) -> u64 { ... }`,
    options: [
      'It imports the C++ header directly via `import Cpp library` and addresses symbols under the `Cpp` namespace.',
      'It compiles the C++ file to WebAssembly and communicates over JSON.',
      'It requires a manual SWIG interface file before compiling.',
      'It only supports C structs, not C++ classes with methods.',
    ],
    correctIndex: 0,
    explanation:
      'Carbon is designed for seamless bidirectional C++ interoperability: `import Cpp library "header.h"` exposes C++ namespaces, classes, and methods directly under `Cpp.*`.',
  },
  {
    id: 'q2',
    topic: 'Method Mutability',
    prompt: 'Which method signature in Carbon allows modifying `self.cursor` inside the method body?',
    codeSnippet: `class Reader {
  // Which signature grants mutable access to self?
  private var cursor: u64;
}`,
    options: [
      'fn Advance[self: Self](n: u64)',
      'fn Advance[addr self: Self*](n: u64)',
      'fn Advance(mut self: Self, n: u64)',
      'void Advance(u64 n) mutable',
    ],
    correctIndex: 1,
    explanation:
      'In Carbon, `[self: Self]` provides read-only access to the receiver, while `[addr self: Self*]` passes the address of `self` to allow mutating fields.',
  },
  {
    id: 'q3',
    topic: 'Memory Safety & Bounds',
    prompt: 'Why does `SafeSlice.Subslice(start, count)` call `CheckedAdd(start, count)` before comparing against `self.len`?',
    codeSnippet: `let end: u64 = CheckedAdd(start, count)?;
if (end > self.len) { return .Err(.OutOfBounds(end, self.len)); }`,
    options: [
      'To convert big-endian integers to little-endian.',
      'To prevent integer wraparound where a huge `count` wraps `start + count` below `self.len`.',
      'Because Carbon forbids the `+` operator inside `if` conditions.',
      'To allocate extra heap memory automatically.',
    ],
    correctIndex: 1,
    explanation:
      'If `count` is near `UINT64_MAX`, naive `start + count` wraps to a small number, bypassing `end <= self.len`. `CheckedAdd` traps the overflow before bounds checking.',
  },
  {
    id: 'q4',
    topic: 'Checked Generics',
    prompt: 'What does `[T:! Diagnostic]` signify in a Carbon function signature?',
    codeSnippet: `fn LogRecord[T:! Diagnostic](item: T) {
  Cpp.std.cout << item.Describe();
}`,
    options: [
      'A runtime dynamic cast using RTTI.',
      'A compile-time generic parameter constrained by the `Diagnostic` interface.',
      'A preprocessor macro expansion.',
      'An optional nullable pointer to `Diagnostic`.',
    ],
    correctIndex: 1,
    explanation:
      '`:!` introduces a compile-time checked generic parameter in Carbon. The compiler verifies that `LogRecord` only uses methods declared on `Diagnostic`.',
  },
  {
    id: 'q5',
    topic: 'Bindings & Variables',
    prompt: 'What is the difference between `let` and `var` in Carbon?',
    codeSnippet: `let magic: u32 = 0x4352424E;
var cursor: u64 = 8;`,
    options: [
      '`let` allocates on the heap; `var` allocates on the stack.',
      '`let` declares an immutable value binding; `var` declares a mutable variable.',
      '`let` is only for integers; `var` is for classes.',
      'They are identical aliases kept for C++ compatibility.',
    ],
    correctIndex: 1,
    explanation:
      'Carbon uses `let` for immutable bindings (cannot be reassigned) and `var` for mutable variables whose storage can be updated.',
  },
  {
    id: 'q6',
    topic: 'Package Structure',
    prompt: 'How does Carbon organize a library module across interface and implementation files?',
    codeSnippet: `// File 1:
package SafeParser api;
// File 2:
package SafeParser impl;`,
    options: [
      'By `#include` guards and forward declarations.',
      'Using `package <Name> api;` for the public interface and `package <Name> impl;` for implementations.',
      'By exporting everything in a single `module.json` file.',
      'Using `public:` and `protected:` namespaces only.',
    ],
    correctIndex: 1,
    explanation:
      'Carbon separates a package’s public contract (`api` file) from its implementation (`impl` file), eliminating C++ textual header inclusion overhead.',
  },
];
