import express from "express";
import cors from "cors";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import { chromium } from "playwright";
import { fetchQiutanAsianOddsHistory } from "./providers/qiutan.js";

dayjs.extend(utc);
dayjs.extend(timezone);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const TZ = "Asia/Hong_Kong";

function findHkjcOpening(rows) {
  const hkjc = rows
    .filter((r) => String(r.bookmaker || "").toLowerCase() === "hkjc")
    .sort((a, b) => dayjs(a.time).valueOf() - dayjs(b.time).valueOf());
  return hkjc[0] || null;
}

function find18betNearestBeforeT0(rows, t0Iso) {
  const t0 = dayjs(t0Iso).valueOf();
  const arr = rows
    .filter((r) => String(r.bookmaker || "").toLowerCase() === "18bet")
    .filter((r) => dayjs(r.time).valueOf() <= t0)
    .sort((a, b) => dayjs(b.time).valueOf() - dayjs(a.time).valueOf());
  return arr[0] || null;
}

function buildResult(matchId, hkjcOpening, b18, extra = {}) {
  if (!hkjcOpening) {
    return { matchId, error: "HKJC opening not found", ...extra };
  }
  if (!b18) {
    return {
      matchId,
      hkjc_opening: hkjcOpening,
      error: "18bet record (<= T0) not found",
      ...extra
    };
  }

  const sec = dayjs(hkjcOpening.time).diff(dayjs(b18.time), "second");
  return {
    matchId,
    hkjc_opening: hkjcOpening,
    bet18_nearest_before_t0: b18,
    delta: {
      seconds: sec,
      minutes: +(sec / 60).toFixed(2)
    },
    meta: {
      provider: "qiutan",
      rule: "18bet_time <= HKJC_T0 and nearest"
    },
    ...extra
  };
}

app.get("/api/matches/today", async (_req, res) => {
  try {
    const today = dayjs().tz(TZ).format("YYYY-MM-DD");
    res.json({
      date: today,
      matches: [
        {
          matchId: "2993786",
          league: "Demo League",
          home: "Home",
          away: "Away",
          kickoff: `${today}T20:00:00+08:00`
        }
      ]
    });
  } catch (e) {
    res.status(500).json({ error: "matches_today_failed", message: String(e?.message || e) });
  }
});

app.get("/api/compare", async (req, res) => {
  const matchId = String(req.query.matchId || "").trim();
  if (!matchId) return res.status(400).json({ error: "matchId is required" });

  let browser;
  let launchOk = false;
  let rows = [];

  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
    });
    launchOk = true;

    rows = await fetchQiutanAsianOddsHistory({ browser, matchId, tz: TZ });

    const hkjcOpening = findHkjcOpening(rows);
    const b18 = hkjcOpening ? find18betNearestBeforeT0(rows, hkjcOpening.time) : null;

    const result = buildResult(matchId, hkjcOpening, b18, {
      debug: {
        launchOk,
        rowsCount: rows.length,
        sample: rows.slice(0, 5)
      }
    });

    return res.json(result);
  } catch (e) {
    return res.status(500).json({
      error: "compare_failed",
      message: String(e?.message || e),
      debug: {
        launchOk,
        rowsCount: rows.length,
        sample: rows.slice(0, 3)
      }
    });
  } finally {
    try {
      if (browser) await browser.close();
    } catch {}
  }
});

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true, service: "compare", time: new Date().toISOString() });
});

// 全域防崩（避免 Render 直接 502）
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
