---
title: corCTF 2025 - control - 36 solves
published: true
---

# control - misc

_author: chop0_

- Challenge description:

> Design a controller for a digital power supply!
>
> nc ctfi.ng 32727

- Number of solves: `36`
- Points: `159`

attachments:

- [ctrl.py](https://static.cor.team/corctf-2025/5ec00f0ba6432b4d66cb43147712d921d925948a6aa8e7bc5843c6a8ce2200cc/ctrl.py)
- [Dockerfile](https://static.cor.team/corctf-2025/6006add686701eac4f6b3486127d72db44872878fd864bc529afb58993238506/Dockerfile)

## The Challenge

Basically the `ctrl.py` file contains a simulation of an electrical control system with some noise. It loads our WASM module and check if a our code can track the target waveform close enough. If our code does well enough, we will receive the flag:

```python
mse = np.mean((x.T[1][5:-1] - target[:len(t)][5:])**2)
if mse < 0.01:
    with open("flag.txt", "r") as f:
        print(f.read().strip())
```

The system setup is as follows:

```python
LOAD_RESISTANCE = 5
SOURCE_RESISTANCE = 0.01
SOURCE_VOLTAGE = 15

C1 = 47e-6
C2 = 47e-6
L = 88e-6

DT = 0.0001
N = 1000
```

These constants represent two capacitors marked _(C1 and C2)_, an inductor _(L)_ anda source with resistance and load.

The following function takes as input:

```python
x = [vC1, vC2, iL] # The voltages through capacitors C1 and C2 with current through the inductor L.
u = [u0, u1] # these are the controller outputs
```

The function `F(x, u)` defines a differential equations of the virtual circuit and adds random noise to simulate the measurements usual uncertainty:

```python
@numba.njit
def F(x, u):
    vC1 = x[0] + np.random.normal(0, 0.1)
    vC2 = x[1] + np.random.normal(0, 0.1)
    i_L = x[2] + np.random.normal(0, 0.1)

    v_L = vC1 * u[0] - vC2 * u[1]
    i_C1 = -u[0] * i_L + (SOURCE_VOLTAGE - vC1) / SOURCE_RESISTANCE
    i_C2 = u[1] * i_L - vC2 / LOAD_RESISTANCE

    dC1 = i_C1 / C1
    dC2 = i_C2 / C2
    di_L = (v_L ) / L

    return np.array([dC1, dC2, di_L])
```

Our WASM controller is making N _(1000)_ steps calling our defined `controller_step` exported function, that returns a result that will be unpacked to 2 floats:

```python
def unpack_pair_u64_to_float32(u64: int) -> tuple[float, float]:
    b = struct.pack('<Q', u64 & ((1 << 64) - 1))
    u1 = struct.unpack_from('<f', b, 0)[0]
    u0 = struct.unpack_from('<f', b, 4)[0]
    return float(u0), float(u1)
```

and feeding it _(`local_u`)_ then to the following:

```python
local_u = np.clip(local_u, 0, 1)
u[k] = local_u
sol = solve_ivp(lambda t, x: F(x, local_u), [k * DT, (k + 1) * DT], x_prev)
x[k + 1] = sol.y.T[-1]
k += 1
```

So our `controller_step` is taking `sp`, `vC1`, `vC2` and `iL` as arguments.

Our target is to follow:

```python
target = np.abs(np.sin(2 * np.pi * 60 * np.arange(N) * DT))
```

which is a 60 Hz sine wave wrapped in an absolute value.

## The solution

So now that we know what is our goal with our WASM module, we need to define the `controller_step` function. In wasm, it will look as follows:

```wasm
(controller_step (param f32 f32 f32 f32) (result i64))
```

If you don't know WASM/WAT I strongly recommend to read [mozilla's guide to WebAssembly](https://developer.mozilla.org/en-US/docs/WebAssembly/Guides/Understanding_the_text_format). We can compile the WebAssemblyText (WAT) into WASM with the `wat2wasm` tool **(shock!)** to which you can find precompiled binaries [here](https://github.com/WebAssembly/wabt/releases). When you have the binary in your path, my solution script takes the `solve.wat` file, compiles it and sends to the netcat server.

This is the script that does the compiling, connecting and sending the payload:

```python
from pwn import remote
import base64
import subprocess

HOST = "ctfi.ng"
PORT = 32727

def build_wasm(wat_file = "solve.wat") -> bytes:
    wasm_file = "solve.wasm"
    subprocess.check_call(["wat2wasm.exe", wat_file, "-o", wasm_file])
    with open(wasm_file, "rb") as f:
        return f.read()

def main():
    wasm_bytes = build_wasm()
    payload = base64.b64encode(wasm_bytes)

    io = remote(HOST, PORT, level="error")
    io.recvuntil(b":")
    io.sendline(payload)
    io.interactive()

if __name__ == "__main__":
    main()
```

And the actual WebAssemblyText, which is more and more often seen on CTFs _([sekai ctf extreme example writeup](https://blog.badat.dev/blog/captivating-canvas-contraption/))_, `solve.wat` will look as follows to follow the target function:

```wat
(module
  (type (func (param f32 f32 f32 f32) (result i64)))
  (global $integral (mut f32) (f32.const 0.0))

  (func $controller_step (export "controller_step") (type 0)
    (param $sp f32) (param $x0 f32) (param $x1 f32) (param $x2 f32)
    (result i64)
    (local $err f32) (local $int f32) (local $ff f32) (local $u f32)

    ;; err = sp - x1
    local.get $sp
    local.get $x1
    f32.sub
    local.set $err

    ;; int = clamp(global_integral + ki*err, -0.5, 0.5)
    global.get $integral
    local.get $err
    f32.const 0.02    ;; KI
    f32.mul
    f32.add
    f32.const -0.5
    f32.max
    f32.const 0.5
    f32.min
    local.set $int

    ;; save back to global
    local.get $int
    global.set $integral

    ;; ff = sp * inv_vin
    local.get $sp
    f32.const 0.06666667   ;; 1/15
    f32.mul
    local.set $ff

    ;; u = clamp(kp*err + int + ff, 0.0, 1.0)
    local.get $err
    f32.const 0.3          ;; KP
    f32.mul
    local.get $int
    f32.add
    local.get $ff
    f32.add
    f32.const 0.0
    f32.max
    f32.const 1.0
    f32.min
    local.set $u

    ;; pack (u, int) into i64
    local.get $u
    i32.reinterpret_f32
    i64.extend_i32_s
    local.get $int
    i32.reinterpret_f32
    i64.extend_i32_s
    i64.const 32
    i64.shl
    i64.or
  )
)
```

This is a function called 1000 times by the server, and it will pack the two numbers into a single i64 to be unpacked later by the server's `unpack_pair_u64_to_float32`.

After running the `solve.py` with the `solve.wat` in the same directory, with the `wat2wasm` binary in path, we will see:

```bash
> python .\solve.py

corctf{l@yers_0f_c0ntrol_are_fun!}
```

:)
