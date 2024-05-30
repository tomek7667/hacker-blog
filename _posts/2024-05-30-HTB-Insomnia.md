# Insomnia

This challenge is a huge bootstrap app written in PHP.

`Insomnia/app/Controllers/ProfileController.php` contains the following:

```php
$token = (string) $_COOKIE["token"] ?? null;
$flag = file_get_contents(APPPATH . "/../flag.txt");
if (isset($token)) {
    $key = (string) getenv("JWT_SECRET");
    $jwt_decode = JWT::decode($token, new Key($key, "HS256"));
    $username = $jwt_decode->username;
    if ($username == "administrator") {
        return view("ProfilePage", [
            "username" => $username,
            "content" => $flag,
        ]);
    } else {
        $content = "Haven't seen you for a while";
        return view("ProfilePage", [
            "username" => $username,
            "content" => $content,
        ]);
    }
}
```

So we need to get the token of the administrator to get the flag. Their password is set randomly in the `entrypoint.sh` script.

The login and registration looks as follows:

```php
public function login()
{
    $db = db_connect();
    $json_data = request()->getJSON(true);
    if (!count($json_data) == 2) {
        return $this->respond("Please provide username and password", 404);
    }
    $query = $db->table("users")->getWhere($json_data, 1, 0);
    $result = $query->getRowArray();
    if (!$result) {
        return $this->respond("User not found", 404);
    } else {
        $key = (string) getenv("JWT_SECRET");
        $iat = time();
        $exp = $iat + 36000;
        $headers = [
            "alg" => "HS256",
            "typ" => "JWT",
        ];
        $payload = [
            "iat" => $iat,
            "exp" => $exp,
            "username" => $result["username"],
        ];
        $token = JWT::encode($payload, $key, "HS256");

        $response = [
            "message" => "Login Succesful",
            "token" => $token,
        ];
        return $this->respond($response, 200);
    }
}
```

There is also `Insomnia/writable` directory which contains lots of logs from the development of the challenge *(which doesn't seem too professional)*. From it I can assume the author was trying some SQL injections, messing up with the `token` type *(as array e.g.)* and created some accounts, but nothing useful.

JWT signing and env handling seems to be done correctly, however the `login` function is implemented in an unsafe way:

```php
$json_data = request()->getJSON(true);
if (!count($json_data) == 2) {
    return $this->respond("Please provide username and password", 404);
}
$query = $db->table("users")->getWhere($json_data, 1, 0);
$result = $query->getRowArray();
if (!$result) {
    return $this->respond("User not found", 404);
} else {
    ...
}
```

The `json_data` object is passed directly to the `getWhere` which resolves in a query like `WHERE <key> = <value> AND ...`. The previous check is done to ensure the object has exactly 2 keys, but it doesn't check if the keys are `username` and `password`. This allows us to pass an object like `{"username": "administrator", "username": "administrator"}` and get a token for the administrator.

The fastest way is to just turn on the intercept in burp, click login and replace the key `password` to `username` and the values to `administrator`s. This will redirect us directly to the profile page with the flag.
