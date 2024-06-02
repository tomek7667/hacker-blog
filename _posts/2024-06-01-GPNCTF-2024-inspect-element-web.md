---
title: GPN CTF 2024 - inspect-element - web
published: true
---

Dockerfile is running chrome with the debugging port open.
In order to connect to the debugging port, I had to use the command from hint:

```bash
socat TCP-LISTEN:1336,fork OPENSSL:positions--ariana-grande-8298.ctf.kitctf.de:443
```

Then I could go to [chrome://inspect/#devices](chrome://inspect/#devices) and connect to the remote debugging port using `localhost:1336` as the address. In order to properly connect to this, I following [chrome documentation regarding accessing local servers and chrome instances with port forwarding](https://developer.chrome.com/docs/devtools/remote-debugging/local-server). If succesful, you should see something like this:

![chrome remote target screenshot](https://i.imgur.com/OmLn80P.png)

Then you can click **inspect fallback** button and it should open developer tools for the remote chrome instance. Go to `chrome://settings/downloads` and disable option `Ask where to save each file before downloading`. The next step is to save the `127.0.0.1:13370` url for overrides, and then make the contents of `index.html` be the following in your local machine:

```html
<html>
	<body>
		<button id="download">click</button>
		<script defer>
			const downloadText = () => {
				const text = `<a href="file:///flag">pwn</a>`;
				const blob = new Blob([text], { type: "text/plain" });
				const url = URL.createObjectURL(blob);
				const a = document.createElement("a");
				a.href = url;
				a.download = "hello.html";
				a.click();
				URL.revokeObjectURL(url);
			};

			download.addEventListener("click", downloadText);
		</script>
	</body>
</html>
```

After doing so, reload the page, click the button and go to `chrome://downloads` to see the downloaded file. Open it and the debugger should say that the tab is not active like so:

![debugger inactive tab screenshot](https://i.imgur.com/n9Tjvyg.png)

However, the tab with *inspect devices* will show that a new tab has opened:

![new tab](https://i.imgur.com/IAmpQZZ.png)

After clicking **inspect fallback** we are able to click **pwn** button:

![pwn button](https://i.imgur.com/EAr7rB7.png)

and that will redirect us to the flag file:

![flag](https://i.imgur.com/gQVpFvI.png)

---

*P.S.: Going to url `file:///flag` replaced for some reason the `file:///` to `http://file///flag` so that's why we used this workaround.*
