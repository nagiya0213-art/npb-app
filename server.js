const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");

const app = express();

const teams = {
  g: "giants",
  t: "tigers",
  d: "dragons",
  c: "carp",
  db: "baystars",
  s: "swallows",
  l: "lions",
  h: "hawks",
  e: "eagles",
  m: "marines",
  f: "fighters",
  b: "buffaloes"
};

app.get("/", async (req, res) => {
  const teamCode = req.query.team;

  if (!teamCode || !teams[teamCode]) {
    return res.send("チームを選択してください");
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

app.listen(3000, () => {
  console.log("Server started");
});