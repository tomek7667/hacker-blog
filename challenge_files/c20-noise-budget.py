"""Local check: is the server-side product c0*p1*c2 still decryptable (noise budget)?"""
import random
from hashlib import sha256
from random import Random

from sealy import (
    BFVEncoder, BFVEvaluator, BfvEncryptionParametersBuilder, Ciphertext, CoefficientModulus,
    Context, Decryptor, DegreeType, Encryptor, KeyGenerator, PlainModulus, SecurityLevel,
)
from backend.fhe import evaluate_ciphertext

N, T = 2048, 61441
degree, sec = DegreeType(N), SecurityLevel(128)
params = (BfvEncryptionParametersBuilder().with_poly_modulus_degree(degree)
          .with_coefficient_modulus(CoefficientModulus.bfv(degree, sec))
          .with_plain_modulus(PlainModulus.batching(degree, 16)).build())
ctx = Context(params, False, sec)
enc = BFVEncoder(ctx)
ev = BFVEvaluator(ctx)

kg = KeyGenerator(ctx)
sk, pk = kg.secret_key(), kg.create_public_key()
E, D = Encryptor(ctx, pk), Decryptor(ctx, sk)

def encrypt(vals):
    return E.encrypt(enc.encode_int(vals))

def dec(ct):
    return [int(x) for x in enc.decode_int(D.decrypt(ct))]

m2 = [random.randint(1, 20) for _ in range(N)]
v = [random.randint(1, 20) for _ in range(N)]
c2, c0 = encrypt(m2), encrypt(v)
print("noise budget fresh c0 :", D.invariant_noise_budget(c0))
seed = sha256(sha256(bytes(c0.as_bytes())).digest() + sha256(bytes(c2.as_bytes())).digest()).digest()
rng = Random(seed); p1 = [rng.randint(1, 20) for _ in range(N)]
step1 = ev.multiply_plain(c0, enc.encode_int(p1))
print("noise budget c0*p1    :", D.invariant_noise_budget(step1))
step2 = ev.multiply(step1, c2)
print("noise budget c0*p1*c2 :", D.invariant_noise_budget(step2), "(num polys", step2.get_num_polynomials(), ")")

server_bytes = evaluate_ciphertext(bytes(c0.as_bytes()), bytes(c2.as_bytes()))
got = dec(Ciphertext.from_bytes(ctx, server_bytes))
exp = [(a * b * c) % T for a, b, c in zip(v, p1, m2)]
exp = [x - T if x > T // 2 else x for x in exp]
print("Dec(evaluate_ciphertext(c0,c2)) == v*p1*m2 :", got == exp, "| first", got[:4], "vs", exp[:4])

# Same pipeline but with only ONE ciphertext multiplication (c0 * p1), to show the budget is the issue.
got1 = dec(step1)
exp1 = [(a * b) % T for a, b in zip(v, p1)]
print("Dec(c0*p1) == v*p1 :", got1 == exp1)
