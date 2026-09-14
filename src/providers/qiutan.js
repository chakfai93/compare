import dayjs from "dayjs";

/**
 * 解析球探 AsianOdds_n 頁面
 * 目標輸出:
 * [{ bookmaker, time, line, water }]
 */
export async function fetchQiutanAsianOddsHistory({ browser, matchId, tz }) {
  const page = await browser.newPage();
  const url = `https://vip.titan007.com/AsianOdds_n.aspx?id=${matchId}`;

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

  // 等一下讓動態內容渲染
  await page.waitForTimeout(1500);

  const rows = await page.evaluate(() => {
    const text = (el) => (el?.textContent || "").replace(/\s+/g, " ").trim();

    // 可能的資料表（不同版型/語系）
    const tableCandidates = Array.from(document.querySelectorAll("table"));

    // 嘗試找包含公司名與時間欄位的表
    const targetTables = tableCandidates.filter((tb) => {
      const t = text(tb).toLowerCase();
      return (
        (t.includes("hkjc") || t.includes("香港馬會") || t.includes("18bet")) &&
        (t.includes(":") || t.includes("時間") || t.includes("time"))
      );
    });

    const pickedTables = targetTables.length ? targetTables : tableCandidates;

    const out = [];

    for (const tb of pickedTables) {
      const trs = Array.from(tb.querySelectorAll("tr"));
      for (const tr of trs) {
        const tds = Array.from(tr.querySelectorAll("td"));
        if (tds.length < 4) continue;

        const cols = tds.map((x) => text(x));
        const rowText = cols.join(" | ").toLowerCase();

        // 書商判定
        let bookmaker = "";
        if (rowText.includes("hkjc") || rowText.includes("香港馬會")) bookmaker = "HKJC";
        if (rowText.includes("18bet")) bookmaker = "18bet";
        if (!bookmaker) continue;

        // 嘗試從欄位抓時間（形如 YYYY-MM-DD HH:mm 或 HH:mm:ss）
        let timeStr = "";
        for (const c of cols) {
          if (
            /\d{4}[-/]\d{1,2}[-/]\d{1,2}\s+\d{1,2}:\d{2}(:\d{2})?/.test(c) ||
            /\d{1,2}[-/]\d{1,2}\s+\d{1,2}:\d{2}(:\d{2})?/.test(c)
          ) {
            timeStr = c;
            break;
          }
        }

        // line / water 啟發式抓法
        // 常見盤口像: -0.5, 受半球, 平手/半球, 0/0.5
        let line = "";
        const lineRegex = /(^|[^0-9])([+-]?\d+(\.\d+)?(\/\d+(\.\d+)?)?|平手\/半球|半球\/一球|受平手\/半球|受半球|平手|半球|一球)([^0-9]|$)/;
        for (const c of cols) {
          const m = c.match(lineRegex);
          if (m) {
            line = m[2];
            break;
          }
        }

        // 水位常見 0.82 1.04 0.94
        let water = "";
        for (const c of cols) {
          const m = c.match(/\b(0\.\d{2}|1\.\d{2})\b/);
          if (m) {
            water = m[1];
            break;
          }
        }

        if (bookmaker && timeStr) {
          out.push({
            bookmaker,
            time: timeStr,
            line: line || "",
            water: water || ""
          });
        }
      }
    }

    return out;
  });

  // 時間正規化
  const normalized = rows
    .map((r) => {
      const raw = String(r.time || "").trim();

      // 支援 2026-09-14 10:05 / 09-14 10:05 這類格式
      let d = null;
      const full = dayjs(raw);
      if (full.isValid()) d = full;

      if (!d || !d.isValid()) {
        // 若沒有年份，補今年
        const m = raw.match(/^(\d{1,2})[-/](\d{1,2})\s+(\d{1,2}:\d{2}(:\d{2})?)$/);
        if (m) {
          const year = dayjs().year();
          d = dayjs(`${year}-${m[1]}-${m[2]} ${m[3]}`);
        }
      }

      if (!d || !d.isValid()) return null;

      return {
        bookmaker: r.bookmaker,
        time: d.tz ? d.tz(tz).toISOString() : d.toISOString(),
        line: String(r.line ?? "").trim(),
        water: String(r.water ?? "").trim()
      };
    })
    .filter(Boolean);

  return normalized;
}
