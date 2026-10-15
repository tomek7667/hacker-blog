---
title: ECSC 2026 Finals - c20 - attack/defense
published: true
category: crypto
tags: [attack-defense, fhe, bfv, seal, zkp, flask]
difficulty: medium
seo_description: "ECSC 2026 Finals attack/defense challenge c20 writeup. A FHE dice game where the AFK mode uploads the owner's BFV secret key to the server and turns it into a public decryption oracle."
seo_keywords:
  - ECSC 2026
  - attack defense
  - c20 writeup
  - CTF writeup
  - homomorphic encryption
  - BFV
  - Microsoft SEAL
  - decryption oracle
  - zero knowledge proof
---

<div style="background: #fff3cd; color: #664d03; border: 1px solid #ffecb5; border-left: 6px solid #ffc107; padding: 12px 16px; margin: 0 0 24px 0; border-radius: 4px; font-weight: bold;">
WARNING! The following content unlike the rest of the website unwarned content was generated with the use of Claude Mythos 5.1. Every AI generated content WILL be marked as such.
</div>

# c20 - attack/defense

_one of the services from the ECSC 2026 Finals A/D day_

attachments:

- [c20.tar.gz](https://github.com/tomek7667/hacker-blog/raw/master/challenge_files/c20.tar.gz) - the service as handed out (base state, before any patches)
- [c20-afk-oracle-demo.py](https://github.com/tomek7667/hacker-blog/raw/master/challenge_files/c20-afk-oracle-demo.py) - reproduction client used in the "Confirmed" section below
- [c20-noise-budget.py](https://github.com/tomek7667/hacker-blog/raw/master/challenge_files/c20-noise-budget.py) - noise budget measurement of the server's homomorphic pipeline
- [c20-Dockerfile.dev](https://github.com/tomek7667/hacker-blog/raw/master/challenge_files/c20-Dockerfile.dev) - Dockerfile used to run the service locally (the original one depends on private base images)

## tl;dr

1. Every player's identity is a BFV (Microsoft SEAL) keypair. Login is a ZK proof of the secret key, whispers are encrypted to the recipient's public key.
2. The game owner can go `/afk on`, which **sends the secret key to the server** and stores it in Postgres.
3. While the owner is AFK, **any player can join the game and POST arbitrary bytes to `/roll`**. The server decrypts the result with the stored key and **broadcasts the output to everyone in the game**.
4. That makes the server a decryption oracle under the owner's key - the same key that protects the owner's whispers (where the flags live) and the owner's login. Points 1-3 were reproduced on a local instance (see "Confirmed on a local instance"); a full key or flag recovery through the oracle was **not** carried out.

## The Challenge

`c20` is a small pixel-art tabletop lobby. You walk around a room, join "games" (campaigns) and chat. Underneath it is a Flask backend mounted at `/c20` with a Postgres database, a Redis relay for the websocket positions, and a fairly unusual crypto layer:

- `/register` takes a raw **BFV public key** (poly modulus degree 2048, 16-bit batching plain modulus) as the body and gives you a random `uid`.
- `/login?uid=...` takes a **zero-knowledge proof** (a custom LWE proof shipped as `zkp_lib.so` on the server and as wasm in the browser) that you know the secret key matching the registered public key. No server nonce - the browser just stores the proof in `localStorage` and replays it every time.
- `/games/<g>/whisper?recipient_uid=...` stores a ciphertext encrypted to the recipient's public key. Only the recipient can list their whispers.
- `/games/<g>/note` stores a one-time private note, readable only by that member's session.
- `/games/<g>/roll` is the "sealed dice" feature: the client encrypts random values under the **owner's** public key, the server multiplies that ciphertext homomorphically with a hash-derived plaintext and with the game's own `roll_ciphertext`, and stores it as a pending `roll_request`.
- The owner later decrypts pending requests client-side and POSTs the plaintext to `/rolls/<id>/resolve`, which turns it into a public broadcast: `roll <id> from <uid>: <base64 plaintext>`.

So the flags were either whispers or private notes, and both are protected by the recipient's keypair. Reading the whole `app.py` top to bottom there is no SQLi, the session secret is generated into a volume on first boot, pagination is sane, and the frontend tile/room endpoints do not traverse anywhere interesting. Everything comes down to the key material.

## Vulnerability

### `/afk on` ships your secret key to the server

```python
@app.route("/games/<game_name>/afk", methods=["POST"])
@login_required
def afk_mode(game_name):
    game, _, error = _require_game_owner(game_name)
    ...
    if enabled:
        ...
        private_key = request.get_data(cache=False)
        if not private_key:
            return jsonify({"error": "Private key is required"}), 400
        owner.private_key = private_key
        game.owner_afk = True
        game.afk_token = secrets.token_bytes(32)
        pending = (
            Message.query.filter_by(
                game_name=game.name, kind="roll_request", resolved=False
            )
            .order_by(Message.id.asc())
            .all()
        )
        for request_message in pending:
            try:
                result_message = _afk_resolve_request(game, request_message)
```

The idea is "the owner is away, let the server resolve the dice for them". The implementation is: take the body of the request **verbatim** and put it in `players.private_key`. The frontend sends `this.identity.secretKey` there - the exact key used for the ZK login and for decrypting whispers. The key stays in the database for as long as any game of that owner is in AFK mode. The periodic cleanup job never wipes that column on its own.

Even on its own this is already game over for the defence: anyone who can read the database (or any future bug that leaks a column) now owns the player's identity.

### `/roll` accepts arbitrary bytes from anyone

```python
@app.route("/games/<game_name>/roll", methods=["POST"])
@login_required
def roll(game_name):
    game, _, error = _require_game_member(game_name)
    ...
    ciphertext = request.get_data(cache=False)
    if not ciphertext:
        raise ValueError("Ciphertext is required")
    evaluated = evaluate_ciphertext(ciphertext, bytes(game.roll_ciphertext))
    request_message = _add_roll_request(game, session.get("uid"), evaluated)
    result_message = _maybe_afk_resolve(game, request_message)
```

`_require_game_member` only checks that you are in the game, and `/games/<g>/join` lets **anybody** join **any** game. There is no check that the body is a fresh, well-formed encryption of dice values; it is just handed to `Ciphertext.from_bytes` and multiplied:

```python
def evaluate_ciphertext(c0, c2):
    with fhe_lock:
        seed = sha256(sha256(c0).digest() + sha256(c2).digest()).digest()
        rng = Random(seed)
        p1 = encoder.encode_int([rng.randint(1, 20) for _ in range(N)])
        c0 = Ciphertext.from_bytes(ctx, c0)
        c2 = Ciphertext.from_bytes(ctx, c2)
        return bytes(
            evaluator.multiply(evaluator.multiply_plain(c0, p1), c2).as_bytes()
        )
```

### ...and the server decrypts it and tells everyone

```python
def _afk_resolve_request(game, request_message):
    plaintext = decrypt(game.owner_uid, _decode_blob(request_message.content))
    return _resolve_request(game, request_message, plaintext, game.owner_uid)


def _maybe_afk_resolve(game, request_message):
    if not game.owner_afk:
        return None
    owner = db.session.get(Player, game.owner_uid)
    if owner is None or owner.private_key is None:
        return None
    return _afk_resolve_request(game, request_message)
```

`decrypt` loads the stored secret key into a SEAL `Decryptor`, decrypts whatever came out of `evaluate_ciphertext`, and `_resolve_request` immediately writes the plaintext into a `broadcast` message. Every member of the game gets it through `/games/<g>` history.

Put together:

- the attacker joins the victim's game,
- sends chosen ciphertext bytes to `/roll` as many times as they like,
- receives `Dec_owner(c0 · p1 · c2)` as a public broadcast each time.

Lattice-based schemes like BFV are **not** CCA secure. Handing out a decryption oracle on attacker-chosen ciphertexts under a long-lived key is exactly the thing you must never do, and here the key is also the login credential, so the whispered flags and the identity of every AFK owner are on the line. Enabling AFK also resolves _all_ already-pending requests at once, so anything an attacker queued earlier gets decrypted the moment the owner leaves.

## Confirmed on a local instance

The original `Dockerfile` depends on private base images, so the service was rebuilt from `python:3.12-slim` with the attached `c20-Dockerfile.dev`, next to `postgres:16-alpine` and `redis:7-alpine`. The reproduction client (`c20-afk-oracle-demo.py`) runs inside that container because it reuses the server's own `sealy` and `zkp_lib` modules for key generation, encryption and the login proof. It only talks to the service over HTTP, the same way the browser does.

What it does: registers an owner, a friend and an attacker; logs the owner in with a real ZK proof; the owner creates a game; the friend whispers a secret to the owner; the attacker queues one roll before AFK and one after; the owner enables AFK by POSTing the secret key; every claim is then checked against the HTTP responses.

```
[owner] registered uid=05d5c013568ba6ebc73b3a2180ea7fb7
[friend] registered uid=1c18886371135d7eb0e282c245b94f5a
[attacker] registered uid=e03dad68321dd32e88cc5f4f0649dcca
[owner] login via ZK proof (47328 B) -> Logged in successfully
[owner] created game oracle-demo-a455fc
[friend] [attacker] joined the game (join is open to anyone)
[attacker] /whispers as attacker -> [] (cannot read the whisper, as designed)
[attacker] roll #5 queued while owner is NOT afk -> resolved_immediately=False
[owner] /afk?enabled=1 with 15499 B secret key -> owner_afk=True, resolved=[{'request_id': 5, 'result_id': 6}]
[attacker] roll #7 while owner afk -> resolved_immediately=True
[attacker] server broadcast: roll 7 from e03dad68321dd32e88cc5f4f0649dcca: XqEQBAACAADpEw...
[check] broadcast == Dec_owner(c0) * p1 * m2 for all 2048 slots: False
[check] first slots: chosen=[15, 16, 4, 17, 14] p1=[17, 10, 8, 12, 20] m2=[10, 9, 17, 20, 20] broadcast=[16114, 17254, -24427, -30088, 18693]
[check] pre-queued roll #5 auto-decrypted on /afk enable: True
[check] friend (plain member) sees the decrypted plaintext in game history: True
[check] the key the server now stores decrypts whispers to the owner: 'FLAG{whispered_to_the_owner}'
```

Confirmed:

- `/afk?enabled=1` accepts and stores the raw secret key, and that key decrypts the owner's whispers (last line).
- Any member can POST a ciphertext to `/roll`; while the owner is AFK the server decrypts it with the stored key and the output lands in the public game history, visible to the friend who had nothing to do with the roll.
- A request queued _before_ AFK is decrypted the moment AFK is enabled.

Not confirmed, and worth being precise about: the decrypted values do **not** equal `chosen · p1 · m2`. Measuring the noise budget through the server's own `evaluate_ciphertext` (`c20-noise-budget.py`) explains why:

```
noise budget fresh c0 : 28
noise budget c0*p1    : 8
noise budget c0*p1*c2 : 0 (num polys 3 )
Dec(evaluate_ciphertext(c0,c2)) == v*p1*m2 : False
Dec(c0*p1) == v*p1 : True
```

With `N = 2048` and a 16-bit batching plain modulus a fresh ciphertext has 28 bits of budget. The plaintext multiplication by the batched `p1` burns 20 of them, the ciphertext multiplication by `c2` burns the rest, so the "roll" the game publishes is a decryption of a noise-saturated ciphertext. For the game that does not matter - a roll is supposed to look random anyway - but it means what the oracle hands out is `Dec_sk(noise-dominated ciphertext shaped by the attacker)`, not a clean plaintext. Turning that into key or flag recovery is the part this write-up stops at.

Patching was still the right call during the game: the key custody alone is a full identity compromise if the database is ever read, and the auto-resolve path is a decryption oracle on attacker input regardless of how clean the output is.

The owner's own browser has the same shape of bug without AFK, by the way: `_resolve` in `main.js` decrypts whatever the server stored as `content` and publishes it. The server is trusted to have produced that ciphertext, and the server trusts whatever the roller sent.

## The Fix

For the A/D defence the patch is small. The cleanest option is to simply stop decrypting on the server:

```python
def _maybe_afk_resolve(game, request_message):
    return None
```

and in `afk_mode` never store the body:

```python
# owner.private_key = private_key
```

Rolls then just stay pending until the owner comes back and resolves them client-side, which is how the non-AFK flow already works.

If you want to keep the feature, the minimum is: never persist the key, validate the submitted roll (`Ciphertext.from_bytes` plus a strict size check so only a fresh 2-component ciphertext passes), rate-limit `/roll`, and only auto-resolve requests created _after_ AFK was switched on.

## Other things worth patching

None of these were the main bug, but they make the service easier to poke at:

- `/login` has no server-side challenge, so a proof is valid forever. If it ever leaks, it is a permanent password.
- The websocket `hello` message accepts any `uid` without authentication, so you can impersonate anyone in the room relay (positions and "say" messages only).
- `/player/<uid>` lists every game a player is in, and `/games/<g>/players` lists public keys - handy for an attacker to find out where the checker bots live.

## afterthoughts

The cryptography itself is sound - SEAL defaults, a real ZK proof for login, whispers encrypted end to end. The service collapses because of a single convenience feature that hands the user's private key to the server. The weakest part of a crypto system is usually the part that decides _when_ and _for whom_ to decrypt.
