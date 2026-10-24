#!/usr/bin/env python3
"""Rewrites an APK so every uncompressed entry starts on a 4-byte boundary (4096 for .so files).

Equivalent to `zipalign -p 4 in.apk out.apk`. Android requires resources.arsc to be stored
uncompressed and aligned for apps targeting API 30+, and alignment must happen *before*
signing with apksigner. Usage: zipalign.py in.apk out.apk
"""
import struct
import sys
import zipfile
import zlib


def dos_datetime(dt):
    y, mo, d, h, mi, s = dt
    return (h << 11) | (mi << 5) | (s // 2), ((max(y, 1980) - 1980) << 9) | (mo << 5) | d


def main(src, dst):
    entries = []
    with zipfile.ZipFile(src) as zin, open(dst, "wb") as out:
        for info in zin.infolist():
            data = zin.read(info)
            if info.compress_type == zipfile.ZIP_STORED:
                method, raw = 0, data
            else:
                c = zlib.compressobj(9, zlib.DEFLATED, -15)
                method, raw = 8, c.compress(data) + c.flush()
            crc = zlib.crc32(data) & 0xFFFFFFFF
            name = info.filename.encode("utf-8")
            flags = 0x800 if any(b > 0x7F for b in name) else 0
            offset = out.tell()
            extra = b""
            if method == 0:
                align = 4096 if info.filename.endswith(".so") else 4
                extra = b"\0" * ((-(offset + 30 + len(name))) % align)
            t, d = dos_datetime(info.date_time)
            out.write(struct.pack("<IHHHHHIIIHH", 0x04034B50, 20, flags, method, t, d, crc,
                                  len(raw), len(data), len(name), len(extra)))
            out.write(name + extra + raw)
            entries.append((name, flags, method, t, d, crc, len(raw), len(data), info.external_attr, offset))

        cd_start = out.tell()
        for name, flags, method, t, d, crc, csize, usize, attr, offset in entries:
            out.write(struct.pack("<IHHHHHHIIIHHHHHII", 0x02014B50, 20, 20, flags, method, t, d, crc,
                                  csize, usize, len(name), 0, 0, 0, 0, attr, offset))
            out.write(name)
        cd_size = out.tell() - cd_start
        out.write(struct.pack("<IHHHHIIH", 0x06054B50, 0, 0, len(entries), len(entries), cd_size, cd_start, 0))


def check(path):
    """Exit non-zero if any stored entry is misaligned."""
    bad = []
    with zipfile.ZipFile(path) as z, open(path, "rb") as f:
        for info in z.infolist():
            if info.compress_type != zipfile.ZIP_STORED:
                continue
            f.seek(info.header_offset)
            header = f.read(30)
            name_len, extra_len = struct.unpack("<HH", header[26:30])
            start = info.header_offset + 30 + name_len + extra_len
            align = 4096 if info.filename.endswith(".so") else 4
            if start % align:
                bad.append(info.filename)
    if bad:
        sys.exit(f"misaligned: {bad}")
    print(f"aligned: {path}")


if __name__ == "__main__":
    if sys.argv[1] == "--check":
        check(sys.argv[2])
    else:
        main(sys.argv[1], sys.argv[2])
        check(sys.argv[2])
