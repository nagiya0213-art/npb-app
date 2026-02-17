const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 3000;

// ===== 年齢計算 =====
function calculateAge(birthText) {
  const match = birthText.match(/(\d+)年(\d+)月(\d+)日/);
  if (!match) return "";

  const year = parseInt(match[1]);
  const month = parseInt(match[2]) - 1;
  const day = parseInt(match[3]);

  const birth = new Date(year, month, day);
  const today = new Date();

  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;

  return age;
}

// ===== 球団一覧 =====
const teams = {
  g: "読売ジャイアンツ",
  t: "阪神タイガース",
  db: "横浜DeNAベイスターズ",
  c: "広島東洋カープ",
  s: "東京ヤクルトスワローズ",
  d: "中日ドラゴンズ",
  h: "福岡ソフトバンクホークス",
  m: "千葉ロッテマリーンズ",
  l: "埼玉西武ライオンズ",
  bs: "オリックス・バファローズ",
  f: "北海道日本ハムファイターズ",
  e: "東北楽天ゴールデンイーグルス"
};

// ===== キャッシュ =====
const CACHE_DIR = path.join(__dirname, "cache");
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR);

function loadCache(file) {
  const filePath = path.join(CACHE_DIR, file);
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  }
  return null;
}

function saveCache(file, data) {
  const filePath = path.join(CACHE_DIR, file);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

// ===== トップページ =====
app.get("/", async (req, res) => {
  let html = "";

  const anyTeamCode = Object.keys(teams)[0];
  let yearText = "年度情報なし";

  try {
    const response = await axios.get(
      `https://npb.jp/bis/teams/rst_${anyTeamCode}.html`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Accept-Language": "ja-JP,ja;q=0.9"
        }
      }
    );

    const $ = cheerio.load(response.data);
    const match = $("h1, h2, title").first().text().match(/\d{4}年度/);
    if (match) yearText = match[0];
  } catch (err) {
    yearText = "年度取得失敗";
  }

  html += `<h2>${yearText}</h2>`;
  html += `<h1>球団を選んでください</h1><ul>`;

  for (let code in teams) {
    html += `<li><a href="/team/${code}">${teams[code]}</a></li>`;
  }

  html += "</ul>";
  res.send(html);
});

// ===== 球団ページ =====
app.get("/team/:code", async (req, res) => {
  const code = req.params.code;
  const numberInput = req.query.number;
  const teamName = teams[code];

  if (!teamName) return res.send("球団が見つかりません");

  const cacheFile = `${code}.json`;
  let cacheData = loadCache(cacheFile);
  const now = Date.now();

  if (!cacheData || !cacheData.players) {
    try {
      const url = `https://npb.jp/bis/teams/rst_${code}.html`;
      const response = await axios.get(url);
      const $ = cheerio.load(response.data);

      const players = [];
      $("tr").each((i, el) => {
        const number = $(el).find("td").eq(0).text().trim();
        const name = $(el).find("td").eq(1).text().trim();
        const link = $(el).find("td").eq(1).find("a").attr("href");

        if (number && name && link) {
          players.push({
            number,
            name,
            link: "https://npb.jp" + link
          });
        }
      });

      const yearMatch = $("h1, h2, title").first().text().match(/\d{4}年度/);
      cacheData = {
        players,
        year: yearMatch ? yearMatch[0] : "年度情報なし",
        timestamp: now
      };

      saveCache(cacheFile, cacheData);
    } catch (err) {
      if (!cacheData) return res.send("オンライン取得失敗 & キャッシュなし");
    }
  }

  const { players, year } = cacheData;

  let html = `
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      body{font-family:sans-serif;padding:10px;}
      input,button{margin:5px 0;}
      pre{white-space:pre-wrap;}
    </style>
    <h1>${teamName}</h1>
    <p><strong>${year}</strong></p>
    <h2>背番号検索</h2>
    <form method="GET">
      <input type="number" name="number" placeholder="背番号を入力">
      <button type="submit">検索</button>
    </form>
  `;

  if (numberInput) {
    const player = players.find(p => p.number === numberInput);

    if (!player) {
      html += "<p>選手が見つかりません</p>";
    } else {
      let playerDetails = loadCache(`${code}_${numberInput}.json`);

      if (!playerDetails) {
        try {
          const playerRes = await axios.get(
            player.link,
            {
              headers: {
                "User-Agent": "Mozilla/5.0",
                "Accept-Language": "ja-JP,ja;q=0.9"
              }
            }
          );

          const $$ = cheerio.load(playerRes.data);

          const birth = $$("th:contains('生年月日')").next().text().trim();
          const heightWeight = $$("th:contains('身長')").next().text().trim();
          const position = $$("th:contains('ポジション')").next().text().trim();
          const age = calculateAge(birth);

          playerDetails = { birth, heightWeight, position, age };
          saveCache(`${code}_${numberInput}.json`, playerDetails);
        } catch (err) {
  console.log("選手詳細取得失敗:", err.message);
}

      }

      if (playerDetails) {
        html += `
          <hr>
          <h2>選手詳細</h2>
          <p><strong>名前:</strong> ${player.name}</p>
          <p><strong>ポジション:</strong> ${playerDetails.position}</p>
          <p><strong>生年月日:</strong> ${playerDetails.birth}</p>
          <p><strong>年齢:</strong> ${playerDetails.age}歳</p>
          <p><strong>身長・体重:</strong> ${playerDetails.heightWeight}</p>
        `;
      }

      // ===== ヤクルト応援歌（API版）=====
if (code === "s") {
  let songCache = loadCache(`song_${numberInput}.json`);

  if (!songCache) {
    try {
      const songRes = await axios.get(
        "https://www.yakult-swallows.co.jp/assets/json/players/song.json",
        {
          headers: {
            "User-Agent": "Mozilla/5.0",
            "Accept-Language": "ja-JP,ja;q=0.9"
          }
        }
      );

      const songs = songRes.data;
      const targetName = player.name.replace(/\s/g, "");

      let foundSong = "";

      songs.forEach(item => {
        const name = item.name.replace(/\s/g, "");
        if (name === targetName) {
          foundSong = item.lyrics || "";
        }
      });

      songCache = { lyrics: foundSong };
      saveCache(`song_${numberInput}.json`, songCache);

    } catch (err) {
      console.log("応援歌取得失敗:", err.message);
      songCache = { lyrics: "" };
    }
  }

  html += `<hr><h2>応援歌</h2><pre>${songCache.lyrics || "応援歌なし"}</pre>`;
}

  html += "<br><a href='/'>球団選択に戻る</a>";
  res.send(html);
});

module.exports = app;
