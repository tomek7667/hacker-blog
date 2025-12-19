---
title: SECCON Quals 2025 - dummyhole - 15 solves
published: false
tags: [web, xss, CTF, SECCON]
difficulty: Hard
---

# dummyhole - web

_author: RyotaK_

- Challenge description:

> Is this a hole or...?
>
> Challenge: http://dummyhole.seccon.games
> Admin bot: http://dummyhole.seccon.games:1337

- Number of solves: `15`
- Points: `233`

attachments:

- [dummyhole.tar.gz](https://github.com/tomek7667/hacker-blog/raw/master/challenge_files/dummyhole.tar.gz)

## tl;dr

couple of interesting exploits chained:

- `image/jpeg+json` / `image/png+json` allowed as they are checked with just `.startsWith('image/png')` function

## The Challenge

After signing to the service, we are greeted with an upload image form with title and description options:

![upload image form](https://github.com/tomek7667/hacker-blog/raw/master/challs_media/web-dummyhole/upload-image.webp)

After submitting, we are redirected to `/posts?id=<uuid>` and we can see our just uploaded post:

![newly created post](https://github.com/tomek7667/hacker-blog/raw/master/challs_media/web-dummyhole/newly-created-post.webp)

Getting such quick recon out of the way, let's check the code to find ourselves the flag!

After searching for `FLAG` across the uncompressed task files, we can see that ``
