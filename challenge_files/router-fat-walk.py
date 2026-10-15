"""Walk the FAT16 NVRAM image of the ECSC 2026 'router' service and dump its tree.

Usage: python -I router-fat-walk.py base-disk.img
Pure stdlib, no mounting needed. Prints directories, files (size, first cluster)
and the content of files <= 4 KiB.
"""

import struct
import sys

d = open(sys.argv[1], "rb")
bs = d.read(512)
bps = struct.unpack_from("<H", bs, 11)[0]
spc = bs[13]
res = struct.unpack_from("<H", bs, 14)[0]
nf = bs[16]
re = struct.unpack_from("<H", bs, 17)[0]
spf = struct.unpack_from("<H", bs, 22)[0]
fatoff = res * bps
root = (res + nf * spf) * bps
data = root + re * 32
cs = spc * bps
d.seek(fatoff)
fat = d.read(spf * bps)
print(f"label={bs[43:54].decode('latin1').strip()!r} root@{root} data@{data} cluster={cs}")


def chain(c):
    out = []
    while 2 <= c < 0xFFF8:
        out.append(c)
        c = struct.unpack_from("<H", fat, c * 2)[0]
    return out


def readfile(c, size):
    b = b""
    for cl in chain(c):
        d.seek(data + (cl - 2) * cs)
        b += d.read(cs)
    return b[:size] if size else b


def listdir(raw, path):
    lfn = ""
    for i in range(0, len(raw), 32):
        e = raw[i : i + 32]
        if e[0] == 0:
            break
        if e[0] == 0xE5:
            lfn = ""
            continue
        if e[11] == 0x0F:
            part = (e[1:11] + e[14:26] + e[28:32]).decode("utf-16le", "replace").split("\x00")[0]
            lfn = part + lfn
            continue
        sn = e[:8].decode("latin1").strip()
        ext = e[8:11].decode("latin1").strip()
        name = lfn or (sn + ("." + ext if ext else ""))
        lfn = ""
        attr = e[11]
        clus = struct.unpack_from("<H", e, 26)[0]
        size = struct.unpack_from("<I", e, 28)[0]
        if name in (".", ".."):
            continue
        full = path + "/" + name
        if attr & 0x10:
            print("DIR ", full)
            listdir(readfile(clus, 0), full)
        else:
            print("FILE", full, size, "cluster", clus)
            if size <= 4096:
                print("   ", readfile(clus, size))


d.seek(root)
listdir(d.read(re * 32), "")
