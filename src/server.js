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
    .filter((r) => r.bookmaker.toLowerCase() === "hkjc")
    .sort((a, b) => dayjs(a.time).valueOf() - dayjs(b.time).valueOf());
  return hkjc[0] || null;
}

function find18betNearestBeforeT0(rows, t0Iso) {
  const t0 = dayjs(t0Iso).valueOf();
  const arr = rows
    .filter((r) => r.bookmaker.toLowerCase() === "18bet")
    .filter((r) => dayjs(r.time).valueOf() <= t0)
    .sort((a, b) => dayjs(b.time).valueOf() - dayjs(a.time).valueOf());
  return arr[0] || null;
}

function buildResult(matchId, hkjcOpening, b18) {
  if (!hkjcOpening) {
    return { matchId, error: "HKJC opening not found" };
  }
  if (!b18) {
    return { matchId, hkjc_opening: hkjcOpening, error: "18bet record (<= T0) not found" };
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
    }
  };
}

app.get("/api/matches/today", async (_req, res) => {
  const today = dayjs().tz(TZ).format("YYYY-MM-DD");
  // TODO: 未接球探當天賽事前，先回示例
  res.json({
    date: today,
    matches: [
      {
        matchId: "1234567",
        league: "Demo League",
        home: "Home",
        away: "Away",
        kickoff: `${today}T20:00:00+08:00`
      }
    ]
  });
});

app.get("/api/compare", async (req, res) => {
  const matchId = String(req.query.matchId || "").trim();
  if (!matchId) return res.status(400).json({ error: "matchId is required" });

  const browser = await chromium.launch({ headless: true });
  try {
    const rows = await fetchQiutanAsianOddsHistory({ browser, matchId, tz: TZ });
    const hkjcOpening = findHkjcOpening(rows);
    const b18 = hkjcOpening ? find18betNearestBeforeT0(rows, hkjcOpening.time) : null;
    const result = buildResult(matchId, hkjcOpening, b18);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: "internal_error", message: String(e.message || e) });
  } finally {
    await browser.close();
  }
});

const PORT = process.env.PORT || 3000;
app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true, service: "compare", time: new Date().toISOString() });
});
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
