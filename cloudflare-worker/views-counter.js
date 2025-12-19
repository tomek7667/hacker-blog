// Cloudflare Worker for views counter proxy
// Deploy this to Cloudflare Workers and set COUNTER_API_KEY as an environment secret

export default {
	async fetch(request, env) {
		const corsHeaders = {
			"Access-Control-Allow-Origin": "https://cyber-man.pl",
			"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
			"Access-Control-Allow-Headers": "Content-Type",
		};

		// Handle CORS preflight
		if (request.method === "OPTIONS") {
			return new Response(null, { headers: corsHeaders });
		}

		const url = new URL(request.url);
		const path = url.pathname;

		// Extract counter name and action from path
		// Expected: /counter/{name} or /counter/{name}/up
		const match = path.match(/^\/counter\/([a-z0-9-]+)(\/up)?$/i);

		if (!match) {
			return new Response(JSON.stringify({ error: "Invalid path" }), {
				status: 400,
				headers: { ...corsHeaders, "Content-Type": "application/json" },
			});
		}

		const counterName = match[1];
		const shouldIncrement = match[2] === "/up";
		const workspace = "cyber-man";

		const endpoint = shouldIncrement
			? `https://api.counterapi.dev/v2/${workspace}/${counterName}/up`
			: `https://api.counterapi.dev/v2/${workspace}/${counterName}`;

		try {
			const res = await fetch(endpoint, {
				headers: { Authorization: `Bearer ${env.COUNTER_API_KEY}` },
			});

			const data = await res.json();

			return new Response(JSON.stringify(data), {
				status: res.status,
				headers: { ...corsHeaders, "Content-Type": "application/json" },
			});
		} catch (e) {
			return new Response(
				JSON.stringify({ error: "Failed to fetch counter" }),
				{
					status: 500,
					headers: { ...corsHeaders, "Content-Type": "application/json" },
				}
			);
		}
	},
};
