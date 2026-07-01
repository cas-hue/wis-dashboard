/**
 * WiS Dashboard — Data fetching layer.
 *
 * Leads from Google Sheets (Platform = fb | ig | ig likes | Meta - LI | Google | blank)
 * Spend + impressions + clicks from Meta Ads, Google Ads, TikTok.
 *
 * Platform mapping:
 *   fb | ig | ig likes | Meta - LI → "Meta"
 *   Google → "Google"
 *   (blank) → "Onbekend"
 */
import { v } from "convex/values";
import { action } from "./_generated/server";

declare const process: { env: Record<string, string | undefined> };

const VIKTOR_API_URL = process.env.VIKTOR_SPACES_API_URL!;
const PROJECT_NAME = process.env.VIKTOR_SPACES_PROJECT_NAME!;
const PROJECT_SECRET = process.env.VIKTOR_SPACES_PROJECT_SECRET!;

async function callTool<T>(
  role: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const response = await fetch(
    `${VIKTOR_API_URL}/api/viktor-spaces/tools/call`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_name: PROJECT_NAME,
        project_secret: PROJECT_SECRET,
        role,
        arguments: args,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }

  const json = await response.json();
  if (!json.success) {
    throw new Error(json.error ?? "Tool call failed");
  }
  return json.result as T;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LeadRecord {
  id: string;
  timestamp: string;
  platform: string;
  channel: string;
  kwalitatief: string;
}

export interface SpendRecord {
  channel: string;
  spend: number;
  impressions: number;
  clicks: number;
  dateStart: string;
  dateStop: string;
}

const spendRecordValidator = v.object({
  channel: v.string(),
  spend: v.number(),
  impressions: v.number(),
  clicks: v.number(),
  dateStart: v.string(),
  dateStop: v.string(),
});

// ─── Platform normalisation ────────────────────────────────────────────────────

function normaliseChannel(platform: string): string {
  const p = (platform ?? "").toLowerCase().trim();
  if (
    p === "fb" ||
    p === "ig" ||
    p === "ig likes" ||
    p === "meta - li" ||
    p === "meta"
  ) {
    return "Meta";
  }
  if (p === "google") {
    return "Google";
  }
  return "Onbekend";
}

// ─── Google Sheets — Leads ─────────────────────────────────────────────────────

export const fetchLeads = action({
  args: {},
  returns: v.array(
    v.object({
      id: v.string(),
      timestamp: v.string(),
      platform: v.string(),
      channel: v.string(),
      kwalitatief: v.string(),
    }),
  ),
  handler: async (_ctx): Promise<LeadRecord[]> => {
    const SHEET_ID = "17gghgvjeVvQU7_6B85b04e3xwMB3Usi_mVmknJdJjEs";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await callTool<any>(
      "pd_google_sheets_read_rows",
      {
        spreadsheetId: SHEET_ID,
        sheetName: "Leads",
        hasHeaders: true,
      },
    );

    // The Viktor Spaces tool API may return a nested {content: "<json string>"} wrapper
    // Parse it out if needed
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let result: any = raw;
    if (result?.content && typeof result.content === "string") {
      try { result = JSON.parse(result.content); } catch { /* use raw */ }
    }

    // Handle both array-direct response and {rows:[]} wrapper
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: any[] = Array.isArray(result)
      ? result
      : Array.isArray(result?.rows)
        ? result.rows
        : [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return rows.map((r: any, i: number) => {
      const platform = (r["Platform"] ?? "").trim();
      return {
        id: String(r["_rowNumber"] ?? i + 2),
        timestamp: (r["Timestamp"] ?? "").trim(),
        platform,
        channel: normaliseChannel(platform),
        kwalitatief: (r["Kwalitatieve Kandidaat"] ?? "").trim(),
      };
    });
  },
});

// ─── Meta Ads — Spend + impressions + clicks by publisher_platform ────────────

export const fetchMetaSpend = action({
  args: {
    since: v.string(),
    until: v.string(),
  },
  returns: v.array(spendRecordValidator),
  handler: async (_ctx, { since, until }): Promise<SpendRecord[]> => {
    const AD_ACCOUNT_ID = "act_908885941550271";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let result = await callTool<any>(
      "mcp_meta_ads_get_insights",
      {
        object_id: AD_ACCOUNT_ID,
        level: "account",
        breakdowns: ["publisher_platform"],
        fields: "spend,impressions,clicks",
        time_range: { since, until },
        limit: 20,
      },
    );
    if (result?.content && typeof result.content === "string") {
      try { result = JSON.parse(result.content); } catch { /* use raw */ }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: any[] = result?.data ?? [];

    // Aggregate fb + ig into a single "Meta" row
    let totalSpend = 0, totalImp = 0, totalClicks = 0;

    for (const r of rows) {
      const pub = (r.publisher_platform ?? "").toLowerCase();
      if (pub === "facebook" || pub === "instagram") {
        totalSpend += parseFloat(r.spend ?? "0");
        totalImp += parseInt(r.impressions ?? "0");
        totalClicks += parseInt(r.clicks ?? "0");
      }
    }

    if (totalSpend === 0 && totalImp === 0) return [];

    return [{
      channel: "Meta",
      spend: totalSpend,
      impressions: totalImp,
      clicks: totalClicks,
      dateStart: since,
      dateStop: until,
    }];
  },
});

// ─── Google Ads — Spend + impressions + clicks ────────────────────────────────

export const fetchGoogleAdsSpend = action({
  args: {
    since: v.string(),
    until: v.string(),
  },
  returns: spendRecordValidator,
  handler: async (_ctx, { since, until }): Promise<SpendRecord> => {
    const CUSTOMER_ID = "5896896172";

    let spend = 0;
    let impressions = 0;
    let clicks = 0;

    try {
      const query = `
        SELECT
          metrics.cost_micros,
          metrics.impressions,
          metrics.clicks
        FROM customer
        WHERE segments.date BETWEEN '${since}' AND '${until}'
      `;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let result = await callTool<any>(
        "mcp_google_ads_run_gaql_query",
        {
          customer_id: CUSTOMER_ID,
          query: query.trim(),
        },
      );
      if (result?.content && typeof result.content === "string") {
        try { result = JSON.parse(result.content); } catch { /* use raw */ }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const row of result?.results ?? []) {
        spend += parseFloat(String(row.metrics_cost_micros ?? "0")) / 1_000_000;
        impressions += parseInt(String(row.metrics_impressions ?? "0"));
        clicks += parseInt(String(row.metrics_clicks ?? "0"));
      }
    } catch {
      // Google Ads may be rate-limited — return zeros
    }

    return {
      channel: "Google",
      spend,
      impressions,
      clicks,
      dateStart: since,
      dateStop: until,
    };
  },
});

// ─── TikTok — Spend + impressions + clicks ────────────────────────────────────
// WorkinSociety Active advertiser ID: 7624151076132290576

export const fetchTikTokSpend = action({
  args: {
    since: v.string(),
    until: v.string(),
  },
  returns: spendRecordValidator,
  handler: async (_ctx, { since, until }): Promise<SpendRecord> => {
    const ADVERTISER_ID = "7624151076132290576"; // Workinsociety_AdsManager_Active

    let spend = 0;
    let impressions = 0;
    let clicks = 0;

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let result = await callTool<any>(
        "mcp_tiktok_report_integrated_get",
        {
          advertiser_id: ADVERTISER_ID,
          dimensions: ["stat_time_day"],
          report_type: "BASIC",
          start_date: since,
          end_date: until,
          metrics: ["spend", "impressions", "clicks"],
          data_level: "AUCTION_ADVERTISER",
          page_size: 100,
        },
      );
      if (result?.content && typeof result.content === "string") {
        try { result = JSON.parse(result.content); } catch { /* use raw */ }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows: any[] = result?.data?.list ?? [];
      for (const row of rows) {
        const m = row?.metrics ?? {};
        spend += parseFloat(m.spend ?? "0");
        impressions += parseInt(m.impressions ?? "0");
        clicks += parseInt(m.clicks ?? "0");
      }
    } catch {
      // TikTok not available — return zeros
    }

    return {
      channel: "TikTok",
      spend,
      impressions,
      clicks,
      dateStart: since,
      dateStop: until,
    };
  },
});
