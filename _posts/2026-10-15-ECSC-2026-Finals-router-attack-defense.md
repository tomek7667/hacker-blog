---
title: ECSC 2026 Finals - router - attack/defense
published: true
category: pwn
tags: [attack-defense, atm, aal5, pppoe, coap, zephyr, xtensa, firmware]
difficulty: hard
seo_description: "ECSC 2026 Finals attack/defense challenge router writeup. An ADSL router emulated as Zephyr firmware on QEMU Xtensa, talking ATM cells to a DSLAM, with CoAP over PPPoE over AAL5 as the flag store. Recon of the protocol stack and the NVRAM image; the firmware bug itself was not reached."
seo_keywords:
  - ECSC 2026
  - attack defense
  - router writeup
  - CTF writeup
  - ATM
  - AAL5
  - PPPoE
  - CoAP
  - Zephyr RTOS
  - Xtensa
  - firmware
---

<div style="background: #fff3cd; color: #664d03; border: 1px solid #ffecb5; border-left: 6px solid #ffc107; padding: 12px 16px; margin: 0 0 24px 0; border-radius: 4px; font-weight: bold;">
WARNING! The following content unlike the rest unwarned content was generated with the use of Claude Mythos 5.1
</div>

# router - attack/defense

_one of the services from the ECSC 2026 Finals A/D day_

<div style="background: #f8d7da; color: #58151c; border: 1px solid #f1aeb5; border-left: 6px solid #dc3545; padding: 12px 16px; margin: 0 0 24px 0; border-radius: 4px;">
NO CONFIRMED VULNERABILITY. The vulnerable component is the <code>zephyr.elf</code> firmware, which was never copied off the vulnbox before the VPN went down. Nothing below has been verified against the firmware. The sections "Where the bug has to be" and "Defence" are unverified candidates derived from the handout, the DSLAM simulator and the NVRAM image only.
</div>

attachments:

- [router.tar.gz](https://github.com/tomek7667/hacker-blog/raw/master/challenge_files/router.tar.gz) - the handout repo as given (no firmware, no disk image, those are gitignored)
- [router-fat-walk.py](https://github.com/tomek7667/hacker-blog/raw/master/challenge_files/router-fat-walk.py) - stdlib-only FAT16 walker used to dump the NVRAM image
- [router-numbering-plan.txt](https://github.com/tomek7667/hacker-blog/raw/master/challenge_files/router-numbering-plan.txt) - the team IP to phone number mapping from the game

## tl;dr

1. The service is a fake ADSL router: Zephyr RTOS firmware on an emulated Xtensa `dc233c` CPU under `qemu-system-xtensa`, with a Rust helper (`netdev`) that turns a single TCP connection to the organisers' DSLAM into a vfio-user PCI device.
2. Teams reach each other by **dialling E.164 phone numbers over ATM signalling**. Once a circuit is up, the data path is `ATM -> AAL5 -> RFC 2684 -> PPPoE -> PPP -> IPv4 -> UDP -> CoAP`. CoAP resources are the flag store.
3. Persistent state is a 512 MiB FAT16 image (label `ATMLAB`) with 32 preallocated 1 MiB files under `/OAM/` and an empty `/USER/` directory. Flags end up in `/USER/`; the OAM files look like a ring of buffers selected by a 5-bit field.
4. The README states: *"Everything that is relevant is within the firmware itself."* The DSLAM, the network helper and the Python reference client are out of scope. The bug is therefore in `zephyr.elf`, which was not obtained. The candidate locations ranked at the end are unverified.

## The Challenge

The handout is tiny: a `Dockerfile`, `docker-compose.yml`, `entrypoint.sh`, a `README.md`, a licence `FNOTICE`, and `mindslam/`, a ~200 line Python "much simplified DSLAM" for local testing. The things that matter, `zephyr.elf`, `base-disk.img`, `netdev` and the `patmy/` reference client, are all in `.gitignore` and only exist on the vulnbox.

From the README:

> I really wanted to put wet string all over the venue, but I was overruled. Still, this is some play on an ADSL router. Everything that is relevant is within the firmware itself. The network device code does not contain any (intentional, at least) vulnerabilities, you should consider it out-of-scope.

and then links a wall of standards: ITU-T I.361 (ATM cells), I.432.1 (physical layer), I.363.5 (AAL5), I.610 (OAM), E.191/E.164 (addressing and phone numbers), RFC 2684 (multiprotocol over AAL5), RFC 2516 (PPPoE), RFC 1661 (PPP), RFC 791, RFC 768, RFC 7252 (CoAP) and RFC 6690 (CoRE link format). The authors note that signalling is home-made (no Q.2931/SSCOP) and that CoAP was picked over TR-069 because it needs neither TCP nor XML.

### How the box is wired

`entrypoint.sh` is the whole runtime:

```sh
/bin/netdev --force "${DSLAM_ADDRESS}" "${VFIO_SOCKET}" &
while [ ! -e "${VFIO_SOCKET}" ]; do sleep 0.1; done

exec qemu-system-xtensa \
  -machine virt,aux-ram-share=on -nographic -cpu dc233c -net none -semihosting \
  -device '{"driver":"vfio-user-pci","socket":{"path":"...sock","type":"unix"},"x-no-posted-writes":true}' \
  -drive if=none,id=nvram,file="${DISK}",format=raw,cache=writethrough \
  -device virtio-blk-pci,drive=nvram,addr=0x2,disable-legacy=on \
  -icount shift=6,align=off,sleep=on -rtc clock=vm \
  -kernel "${KERNEL}"
```

`netdev` opens **one** TCP connection to `DSLAM_ADDRESS` and exposes it to the guest as a vfio-user PCI device, i.e. a pretend ATM NIC. The firmware sees that NIC and a virtio block device, nothing else. There is no IP stack reachable from your own vulnbox; the README warns that the DSLAM is only reachable from inside the service container, enforced with bogon routes and nftables, and asks you to leave that alone.

The container runs as `nobody` with every capability dropped and `/disk/` as the only writable volume. On first boot `base-disk.img` is copied there as `atmlab-disk.img` and QEMU writes through to it.

### The DSLAM and the numbering plan

Every team's router has a phone number. The organisers publish a numbering plan at `http://dslam/numbering-plan.yaml` (attached above); the NOP is `+49 12 667`, each team gets a number in its own country code.

`mindslam/__main__.py` shows the signalling protocol. Everything on the TCP link is 53-byte ATM cells. Signalling cells go on a reserved VPI/VCI (`VirtualCircuit.SIGNALLING`), are reassembled as AAL5 PDUs and parsed into `Message` objects with a type, a transaction id, and optionally an address and a circuit:

```python
match message.type:
    case MessageType.ESTABLISH:    self.establish(connection, message)
    case MessageType.ESTABLISHED:  self.answer(connection, message.id, None)
    case MessageType.RELEASE:      self.hang_up(connection, message.circuit)
                                   connection.signal(MessageType.RELEASED, message.id)
    case MessageType.RELEASED:     pass
    case error:                    self.answer(connection, message.id, error)
```

To call another team you send `ESTABLISH` with their E.164 address and the VPI/VCI you want on your side. The DSLAM picks a free circuit on the callee side, forwards `ESTABLISH`, and when the callee answers `ESTABLISHED` both ends are connected. Errors are `UNREACHABLE`, `REJECTED_CIRCUIT` and, on the real DSLAM, `QUOTA_EXCEEDED` (32 connections per team, 4 circuits per destination, 180 s auto-release).

Once connected the DSLAM is a dumb cell relay:

```python
elif (call := connection.calls.get(cell.circuit)) is not None and call.connected:
    call.peer.write(dataclasses.replace(cell, circuit=call.peer_circuit, hec=None).to_bytes())
```

It rewrites the VPI/VCI, recomputes the HEC and passes the cell on. The only filter is on the PTI field at the top of the loop:

```python
if not cell.hec_valid or cell.pti in (Pti.SEGMENT_OAM_F5, Pti.RESOURCE_MANAGEMENT, Pti.RESERVED):
    continue
```

Two details matter. First, everything above the cell header (AAL5 trailer, RFC 2684 LLC/SNAP, PPPoE, PPP, IP, UDP, CoAP) is delivered to the peer firmware byte for byte. Second, `END_TO_END_OAM_F5` is **not** dropped, so I.610 end-to-end F5 OAM cells (loopback, continuity check, AIS/RDI) reach the other router. That matters given what is on the disk.

A comment in `establish` documents a behaviour the simulator does not implement:

```python
# The real DSLAM will replace circuits if the caller reuses the circuit ID.
# We don't do that here, that would be too much code.
```

On the real DSLAM a caller can re-`ESTABLISH` on a circuit that is already in use and have it replaced underneath the callee, which leaves the callee firmware's per-circuit state stale.

### The NVRAM image

`base-disk.img` is a 512 MiB raw FAT16 volume made with `mkfs.fat`, label `ATMLAB`, 8 KiB clusters, mounted by the firmware with FatFs R0.16 (per the licence file). Walking it with the attached script:

```
label='ATMLAB' root@270336 data@286720 cluster=8192
DIR  /OAM
FILE /OAM/0000 1048576 cluster 4
FILE /OAM/0001 1048576 cluster 132
...
FILE /OAM/001F 1048576 cluster 3972
DIR  /USER
```

Thirty-two files named `0000` to `001F`, each exactly 1 MiB, each entirely zero, each a contiguous cluster chain. Then an empty `/USER/`. The checker PUTs flags through CoAP and they land as files in `/USER/`; the OAM directory is 32 fixed slots that some OAM cell field almost certainly selects. In I.610 the F5 loopback cell carries a loopback location ID and every OAM cell carries a 4-bit function type, so there is a natural source of a small attacker-controlled index here.

## Where the bug has to be (unverified)

None of the following was checked against the firmware. The list is ordered by prior likelihood given the build: C on an RTOS, no memory isolation, FatFs path handling, hand-rolled parsers for six protocol layers whose every byte comes straight from the other team.

1. **CoAP `/USER` resource handler.** Uri-Path options concatenated into a FatFs path. A `..` segment, a missing per-user check, or a Block2 transfer that does not re-validate the path would expose the checker's flag files. This is the most common bug class in A/D storage services and the first place to look: find the string `.well-known/core`, the resource table next to it, and follow every `f_open`.
2. **OAM F5 handling.** 32 × 1 MiB slots selected by a 5-bit value. If the index is taken from the cell without masking, or the write offset inside the slot is not bounded, that is an out-of-bounds file write, or plain memory corruption if the slots are mirrored in RAM. The DSLAM lets end-to-end F5 cells through, so it is reachable.
3. **AAL5 / RFC 2684 / PPPoE / PPP parsers.** The AAL5 trailer carries a length that may disagree with the number of cells received; PPPoE has a payload length; LCP and IPCP options are TLVs; IPv4 has a total length. Any of those used as a `memcpy` length into a fixed buffer is a stack or heap overflow on Xtensa with no canaries, i.e. code execution in the router.
4. **Signalling state.** The circuit replacement behaviour quoted above, or a `RELEASE` for a circuit that is mid-`ESTABLISH`, can leave the firmware holding a freed or half-initialised circuit object that still receives cells.

## How to get the missing pieces

On the vulnbox:

```sh
docker cp router-router:/router/zephyr.elf .
docker cp router-router:/bin/netdev .
# patmy/ sits next to docker-compose.yml in the service directory
```

Then `xtensa-dc233c-elf-objdump -d zephyr.elf` from the Zephyr SDK 0.17.4 toolchain, or Ghidra with the Xtensa processor module. Zephyr keeps symbols unless the build stripped them; look for the CoAP handler table, the `f_open`/`f_write` call sites, and the `memcpy` calls fed by length fields from the AAL5, PPPoE and PPP layers.

For local testing, `python -m mindslam` is the DSLAM, `DSLAM_ADDRESS=host:9000` points a router at it, and `python -m patmy --dslam-host ...` is the reference client. The first subscriber to connect gets the fixed number (`+49 12 667` by default), the rest get `+49 14 6464 000001` upwards.

## Defence while the bug is unknown

Nothing in the container can be patched without rebuilding `zephyr.elf` (the `Dockerfile` has a `ZEPHYR_SOURCE` build arg for exactly that). What you can do:

- leave the nftables rule that confines DSLAM access to the service container alone,
- watch `/disk/atmlab-disk.img` in the `router-state` volume for anything outside `/USER/` changing, or for `/OAM/*` suddenly being non-zero,
- keep a pristine copy of `base-disk.img` so a corrupted NVRAM can be rolled back between ticks.

## afterthoughts

Six layers of telecom standards wrap a CoAP key-value store, running on a real RTOS inside a CPU emulator, delivered as a service that is not reachable from the team's own vulnbox. The README narrows the attack surface to one binary, and that binary is not part of the handout repository. The operational takeaway: copy every gitignored artifact (`zephyr.elf`, `netdev`, `patmy/`, `base-disk.img`) off the vulnbox before the VPN is needed for anything else, because the handout repo is not the service. Until that is done, this write-up stays unconfirmed.
