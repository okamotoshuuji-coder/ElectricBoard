# くらし電力 | Energy Journal

家庭の電力データを月ごとに記録し、年間の推移や前年との比較を確認できるシンプルなブラウザーアプリです。

A lightweight browser app for recording monthly household electricity data and reviewing yearly trends and year-over-year comparisons.

## 日本語

### はじめ方

1. このリポジトリをダウンロードまたはクローンします。
2. `index.html` をブラウザーで開きます。
3. 月ごとのデータを入力するか、CSV / JSON ファイルを読み込みます。

ビルドやパッケージのインストールは不要です。データは利用中のブラウザーの `localStorage` に保存され、サーバーには送信されません。ブラウザーやサイトのデータを消去すると、保存した記録も削除される場合があります。必要に応じてCSVまたはJSONでバックアップしてください。

### 主な機能

- 月ごとの発電量、売電量、買電量、電気料金などの記録・編集・削除
- 発電量 − 売電量 ＋ 買電量による家庭消費量の自動計算
- 年間サマリー・全期間サマリーの項目を選んで、それぞれの比較グラフを切り替え
- 太陽光の自家消費量や割合、概算節約額の表示
- CSV / JSON の読み込みと書き出し
- スマートフォン・デスクトップ向けレイアウトと、動きを抑える設定への対応

### データの読み込み

「ファイルから読み込む」からCSVまたはJSONを選択してください。CSVはUTF-8を推奨します。`date` は `YYYY-MM` または `YYYY/M` 形式で指定します。同じ年月の記録がすでにある場合、その月のデータを更新します。日別の記録（`YYYY-MM-DD`）も読み込み時に月単位へ集計されます。

CSVの列名は次のとおりです。`date` 以外の項目は任意で、分かる項目だけ入力できます。電力量はkWh、料金は円、単価は円/kWhです。

| 列名 | 内容 |
| --- | --- |
| `date` | 対象月（必須） |
| `solarKwh` | 太陽光発電量 |
| `soldKwh` | 売電量 |
| `boughtKwh` | 買電量 |
| `billYen` | 電気料金 |
| `revenueYen` | 売電収入 |
| `basicChargeYen` | 基本料金 |
| `weekdayDayRateYen` | 平日昼の単価 |
| `holidayRateYen` | 休日の単価 |

家庭消費量は `solarKwh - soldKwh + boughtKwh` で計算されます。JSONはレコードの配列、または `{"records":[...]}` の形式で読み込めます。CSVひな形・JSONひな形はアプリからダウンロードできます。

### サンプルデータ

[`sample-electricity-data-2016-2025.csv`](./sample-electricity-data-2016-2025.csv) は、2016年1月から2025年12月までの月次サンプルです。120か月分の**架空のデータ**であり、実際の計測値や電気料金を示すものではありません。動作確認やグラフの表示例としてご利用ください。

### 計算について

概算節約額は、太陽光の自家消費量に平日昼・休日の単価を平日数・土日数で按分した単価を掛けて計算します。祝日は平日扱いとし、基本料金は含みません。表示される効果は入力値に基づく概算です。

## English

### Getting started

1. Download or clone this repository.
2. Open `index.html` in a web browser.
3. Enter monthly readings or import a CSV / JSON file.

No build step or package installation is required. Records are stored in the current browser's `localStorage` and are not sent to a server. Clearing browser or site data may delete saved records, so export a CSV or JSON backup when needed.

### Features

- Add, edit, and delete monthly generation, export, import, and electricity bill records
- Automatically calculate household consumption as generation − exported energy + imported energy
- Switch comparison charts by selecting a metric in the yearly or all-time summary
- Review solar self-consumption, related percentages, and estimated savings
- Import and export CSV / JSON data
- Responsive desktop and mobile layouts, with support for reduced-motion preferences

### Importing data

Choose a CSV or JSON file in the “Import & Export” section. UTF-8 is recommended for CSV files. Set `date` to `YYYY-MM` or `YYYY/M`. If a record for the same month already exists, it will be replaced by the imported record. Daily records using `YYYY-MM-DD` are grouped by month when imported.

The CSV columns are listed below. All columns except `date` are optional; include only the values you have. Energy values use kWh, charges use yen, and rates use yen/kWh.

| Column | Description |
| --- | --- |
| `date` | Record month (required) |
| `solarKwh` | Solar generation |
| `soldKwh` | Energy sold to the grid |
| `boughtKwh` | Energy bought from the grid |
| `billYen` | Electricity bill |
| `revenueYen` | Revenue from energy sold |
| `basicChargeYen` | Basic monthly charge |
| `weekdayDayRateYen` | Weekday daytime rate |
| `holidayRateYen` | Weekend / holiday rate |

Household consumption is calculated as `solarKwh - soldKwh + boughtKwh`. JSON imports can be an array of records or an object in the form `{"records":[...]}`. CSV and JSON templates are available to download in the app.

### Sample data

[`sample-electricity-data-2016-2025.csv`](./sample-electricity-data-2016-2025.csv) contains 120 monthly records from January 2016 through December 2025. The values are **synthetic samples**, not actual meter readings or electricity bills. Use them to try the import workflow and explore the charts.

### Calculation notes

Estimated savings are calculated from solar energy consumed at home and an estimated rate weighted by weekday and weekend day counts. Public holidays are treated as weekdays, and the basic charge is excluded. Results are estimates based on the values entered or imported.
