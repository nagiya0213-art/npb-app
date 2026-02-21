const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");

const app = express();

const teams = {
  g: "読売ジャイアンツ",
  t: "阪神タイガース",
  d: "中日ドラゴンズ",
  c: "広島東洋カープ",
  db: "横浜DeNAベイスターズ",
  s: "東京ヤクルトスワローズ",
  l: "埼玉西武ライオンズ",
  h: "福岡ソフトバンクホークス",
  e: "東北楽天ゴールデンイーグルス",
  m: "千葉ロッテマリーンズ",
  f: "北海道日本ハムファイターズ",
  b: "オリックス・バファローズ"
};

app.get("/", async (req, res) => {
  const teamCode = req.query.team;

  if (!teamCode || !teams[teamCode]) {

  let html = "<h1>チームを選択してください</h1><ul>";

  for (let code in teams) {
    html += `<li><a href="/?team=${code}">${teams[code]}</a></li>`;
  }

  html += "</ul>";

  return res.send(html);
}

  try {
    const url = `https://npb.jp/bis/teams/rst_${teamCode}.html`;
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);

    const players = [];

    $("table tr").each((i, el) => {
      const tds = $(el).find("td");
      if (tds.length >= 2) {
        const number = tds.eq(0).text().trim();
        const name = tds.eq(1).text().trim();

        if (/^\d+$/.test(number) && name) {
          players.push({ number, name });
        }
      }
    });

    if (players.length === 0) {
      return res.send("選手データ取得失敗");
    }

    let html = `<h1>${teams[teamCode]}</h1><ul>`;
    players.forEach(p => {
      html += `<li>${p.number} ${p.name}</li>`;
    });
    html += "</ul>";

    res.send(html);

  } catch (err) {
    console.error(err.message);
    res.send("選手データ取得失敗");
  }
});

module.exports = app;