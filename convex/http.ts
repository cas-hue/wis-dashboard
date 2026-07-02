import { httpRouter } from "convex/server";
import { createViktorAuthRoutes } from "../src/lib/viktor-spaces-access/server";
import { httpAction } from "./_generated/server";
import { auth } from "./auth";
import { api } from "./_generated/api";

const http = httpRouter();
auth.addHttpRoutes(http);

declare const process: { env: Record<string, string | undefined> };

function viktorAuthRoutes() {
  const resourceId =
    process.env.VIKTOR_AUTH_RESOURCE_ID ||
    process.env.VITE_VIKTOR_SPACES_SPACE_ID ||
    "";
  return createViktorAuthRoutes({
    clientId: process.env.VIKTOR_AUTH_CLIENT_ID || `space-${resourceId}`,
    resourceId,
    viktorAuthBaseUrl:
      process.env.VIKTOR_AUTH_BASE_URL ||
      process.env.VIKTOR_SPACES_API_URL ||
      "",
    successRedirectPath: "/dashboard",
  });
}

http.route({
  path: "/__viktor_auth/callback",
  method: "GET",
  handler: httpAction(async (_ctx, request) =>
    viktorAuthRoutes().callback(request),
  ),
});

http.route({
  path: "/__viktor_auth/me",
  method: "GET",
  handler: httpAction(async (_ctx, request) => viktorAuthRoutes().me(request)),
});

http.route({
  path: "/__viktor_auth/logout",
  method: "POST",
  handler: httpAction(async (_ctx, request) =>
    viktorAuthRoutes().logout(request),
  ),
});

// ─── /api/spend — public endpoint for Cursor / external consumers ──────────────
// Returns aggregated spend, impressions and clicks per channel for a date range.
// Query params: since (YYYY-MM-DD), until (YYYY-MM-DD). Defaults to last 30 days.
http.route({
  path: "/api/spend",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const today = new Date();
    const defaultUntil = new Date(today);
    defaultUntil.setDate(defaultUntil.getDate() - 1);
    const defaultSince = new Date(defaultUntil);
    defaultSince.setDate(defaultSince.getDate() - 29);

    const since = url.searchParams.get("since") ?? defaultSince.toISOString().split("T")[0];
    const until = url.searchParams.get("until") ?? defaultUntil.toISOString().split("T")[0];

    try {
      const [metaRows, googleRow, tiktokRow] = await Promise.all([
        ctx.runAction(api.data.fetchMetaSpend, { since, until }),
        ctx.runAction(api.data.fetchGoogleAdsSpend, { since, until }),
        ctx.runAction(api.data.fetchTikTokSpend, { since, until }),
      ]);

      const channels = [
        ...metaRows,
        googleRow,
        tiktokRow,
      ].filter((r) => r.spend > 0 || r.impressions > 0);

      const totalSpend = channels.reduce((s, r) => s + r.spend, 0);
      const totalImpressions = channels.reduce((s, r) => s + r.impressions, 0);
      const totalClicks = channels.reduce((s, r) => s + r.clicks, 0);

      return new Response(
        JSON.stringify({
          ok: true,
          period: { since, until },
          totals: { spend: totalSpend, impressions: totalImpressions, clicks: totalClicks },
          channels,
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        },
      );
    } catch (err) {
      return new Response(
        JSON.stringify({ ok: false, error: String(err) }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        },
      );
    }
  }),
});

export default http;
