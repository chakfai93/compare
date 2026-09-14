import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * Parse Asian odds history from Qiutan with resilient selectors + text fallback.
 * Returns rows:
 * { bookmaker, homeHandicap, awayHandicap, homeOdds, awayOdds, time }
 */
export async function fetchQiutanAsianOddsHistory({ browser, matchId, tz = "Asia/Hong_Kong" }) {
  const url = `https://vip.win007.com/changeDetail/handicap.aspx?id=${encodeURIComponent(matchId)}&companyid=3`;

  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });

  // allow dynamic table render
  await page.waitForTimeout(2500);

  const rows = await page.evaluate((timezoneName) => {
    const clean = (s) => (s || "").replace(/\s+/g, " ").trim();

    const normalizeBookmaker = (name) => {
      const n = clean(name).toLowerCase();
      if (!n) return "";
      if (n.includes("hkjc") || n.includes("香港") || n.includes("香港马会")) return "hkjc";
      if (n.includes("18bet") || n.includes("18 bet") || n.includes("18bet体育") || n.includes("eighteen")) return "18bet";
      return clean(name);
    };

    const parseTime = (s) => {
      const t = clean(s);
      if (!t) return null;
      // expected like: 09-14 19:35 or 2026-09-14 19:35
      const full = /^\d{4}-\d{2}-\d{2}/.test(t) ? t : `${new Date().getFullYear()}-${t}`;
      const d = new Date(full.replace(/-/g, "/"));
      if (Number.isNaN(d.getTime())) return null;
      return d.toISOString();
    };

    const parseLineFromCells = (cells) => {
      if (!cells || cells.length < 3) return null;
      const vals = cells.map((c) => clean(c.textContent || ""));
      const joined = vals.join(" | ");

      // bookmaker likely in first 1-2 columns
      const bookmakerRaw = vals.find((v) => /hkjc|香港|香港马会|18\s*bet/i.test(v)) || vals[0] || "";
      const bookmaker = normalizeBookmaker(bookmakerRaw);

      // time usually last column containing date-time
      const timeRaw = [...vals].reverse().find((v) => /\d{1,2}[-\/]\d{1,2}\s+\d{1,2}:\d{2}|\d{4}[-\/]\d{1,2}[-\/]\d{1,2}\s+\d{1,2}:\d{2}/.test(v)) || "";
      const time = parseTime(timeRaw);

      // find odds-like numbers
      const nums = joined.match(/-?\d+(?:\.\d+)?/g) || [];
      // heuristic positions; keep nullable
      const homeOdds = nums.length >= 2 ? Number(nums[nums.length - 2]) : null;
      const awayOdds = nums.length >= 1 ? Number(nums[nums.length - 1]) : null;
      const homeHandicap = nums.length >= 4 ? Number(nums[nums.length - 4]) : null;
      const awayHandicap = nums.length >= 3 ? Number(nums[nums.length - 3]) : null;

      if (!bookmaker || !time) return null;
      return { bookmaker, homeHandicap, awayHandicap, homeOdds, awayOdds, time, _raw: vals };
    };

    const out = [];

    // Path A: table rows
    const trNodes = Array.from(document.querySelectorAll("table tr"));
    for (const tr of trNodes) {
      const cells = Array.from(tr.querySelectorAll("td"));
      const row = parseLineFromCells(cells);
      if (row) out.push(row);
    }

    // Path B fallback: div/li rows that look like odds lines
    if (out.length === 0) {
      const candidates = Array.from(document.querySelectorAll("div, li, p"));
      for (const node of candidates) {
        const txt = clean(node.textContent || "");
        if (!txt) continue;
        if (!/(hkjc|香港|香港马会|18\s*bet)/i.test(txt)) continue;
        if (!/(\d{1,2}[-\/]\d{1,2}\s+\d{1,2}:\d{2}|\d{4}[-\/]\d{1,2}[-\/]\d{1,2}\s+\d{1,2}:\d{2})/.test(txt)) continue;

        const pseudoCells = txt.split(/[|｜\t]/g).map((x) => ({ textContent: x }));
        const row = parseLineFromCells(pseudoCells);
        if (row) out.push(row);
      }
    }

    // normalize + dedupe simple key
    const uniq = new Map();
    for (const r of out) {
      const key = `${r.bookmaker}__${r.time}__${r.homeOdds ?? ""}__${r.awayOdds ?? ""}`;
      if (!uniq.has(key)) uniq.set(key, r);
    }

    return Array.from(uniq.values())
      .map((r) => ({
        bookmaker: r.bookmaker,
        homeHandicap: r.homeHandicap,
        awayHandicap: r.awayHandicap,
        homeOdds: r.homeOdds,
        awayOdds: r.awayOdds,
        time: r.time
      }))
      .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  }, tz);

  await page.close();
  return rows;
}
