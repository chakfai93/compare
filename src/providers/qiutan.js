import dayjs from "dayjs";

/**
 * 這裡先用「可替換骨架」：
 * 你之後把 page.evaluate() 內 selector 改成球探真實欄位即可。
 */
export async function fetchQiutanAsianOddsHistory({ browser, matchId, tz }) {
  const page = await browser.newPage();

  // TODO: 換成球探對應賽事亞盤歷史頁 URL
  const url = `https://example-qiutan.com/match/${matchId}/asian-odds-history`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

  const rows = await page.evaluate(() => {
    // TODO: 換成球探真實 DOM 解析
    // 回傳格式固定：bookmaker, time, line, water
    return [
      { bookmaker: "HKJC", time: "2026-09-14 10:05:00", line: "-0.5", water: "0.94" },
      { bookmaker: "18bet", time: "2026-09-14 10:03:12", line: "-0.5", water: "0.92" },
      { bookmaker: "18bet", time: "2026-09-14 10:06:00", line: "-0.75", water: "0.98" }
    ];
  });

  return rows.map((r) => ({
    bookmaker: String(r.bookmaker || "").trim(),
    time: dayjs.tz ? dayjs.tz(r.time, tz).toISOString() : new Date(r.time).toISOString(),
    line: String(r.line ?? ""),
    water: String(r.water ?? "")
  }));
}
