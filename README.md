# compare

輸入賽事 ID，抓取球探來源的亞盤走勢資料，找出：

1. HKJC 初盤（最早時間 T0）
2. 18bet 在 `<= T0` 中最接近 T0 的一筆
3. 回傳兩者盤口、水位與時間差 JSON

## Local run

```bash
npm install
node src/server.js
```

開啟：`http://localhost:3000`

## API

### `GET /api/compare?matchId=1234567`
回傳：
- `hkjc_opening`
- `bet18_nearest_before_t0`
- `delta.seconds` / `delta.minutes`

### `GET /api/matches/today`
目前是示例資料，待接球探當天賽事清單。
