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



// =========================
// トップ（球団一覧＋選手一覧）
// =========================
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

    let html = `<h1>${teams[teamCode]}</h1><ul>`;
    players.forEach(p => {
      html += `
        <li>
          <a href="/player?team=${teamCode}&num=${p.number}">
            ${p.number} ${p.name}
          </a>
        </li>
      `;
    });
    html += "</ul>";

    res.send(html);

  } catch (err) {
    console.error(err);
    res.send("選手データ取得失敗");
  }
});



// =========================
// 選手詳細
// =========================
app.get("/player", async (req, res) => {
  const teamCode = req.query.team;
  const number = req.query.num;

  if (!teamCode || !number) {
    return res.send("選手情報が不足しています");
  }

  try {
    // チームページ取得
    const teamUrl = `https://npb.jp/bis/teams/rst_${teamCode}.html`;
    const teamRes = await axios.get(teamUrl);
    const $team = cheerio.load(teamRes.data);

    let playerLink = null;
    let playerName = "";

    $team("table tr").each((i, el) => {
      const tds = $team(el).find("td");
      if (tds.length >= 2) {
        const num = tds.eq(0).text().trim();
        if (num === number) {
          const aTag = tds.eq(1).find("a");
          if (aTag.length > 0) {
            playerLink = aTag.attr("href");
            playerName = aTag.text().trim();
          }
        }
      }
    });

    if (!playerLink) {
      return res.send("選手詳細が見つかりません");
    }

    // =========================
// 選手詳細（位置〜ドラフト全部表示＋年齢）
// =========================
app.get("/player", async (req, res) => {
  const teamCode = req.query.team;
  const number = req.query.num;

  if (!teamCode || !number) {
    return res.send("選手情報が不足しています");
  }

  try {
    // チームページ取得
    const teamUrl = `https://npb.jp/bis/teams/rst_${teamCode}.html`;
    const teamRes = await axios.get(teamUrl);
    const $team = cheerio.load(teamRes.data);

    let playerLink = null;
    let playerName = "";

    // 背番号一致の選手リンク取得
    $team("table tr").each((i, el) => {
      const tds = $team(el).find("td");
      if (tds.length >= 2) {
        const num = tds.eq(0).text().trim();
        if (num === number) {
          const aTag = tds.eq(1).find("a");
          if (aTag.length > 0) {
            playerLink = aTag.attr("href");
            playerName = aTag.text().trim();
          }
        }
      }
    });

    if (!playerLink) {
      return res.send("選手詳細が見つかりません");
    }

    // 個人ページ取得
    const playerUrl = `https://npb.jp${playerLink}`;
    const playerRes = await axios.get(playerUrl);
    const $player = cheerio.load(playerRes.data);

    const profile = [];

    // プロフィール表を全部取得
    $player("table tr").each((i, el) => {
      const th = $player(el).find("th").text().trim();
      const td = $player(el).find("td").text().trim();
      if (th && td) {
        profile.push({ th, td });
      }
    });

    // 年齢計算
    let age = "";
    const birthRow = profile.find(p => p.th.includes("生年月日"));

    if (birthRow) {
      const birthDate = new Date(
        birthRow.td.replace(/年|月/g, "-").replace(/日/, "")
      );
      const today = new Date();
      age = today.getFullYear() - birthDate.getFullYear();
      const m = today.getMonth() - birthDate.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
    }

    let html = `<h1>${playerName}</h1><ul>`;

    profile.forEach(p => {
      html += `<li>${p.th}: ${p.td}</li>`;
    });

    if (age !== "") {
      html += `<li>年齢: ${age}歳</li>`;
    }

    html += "</ul>";

    // =========================
    // ヤクルト応援歌（名前一致）
    // =========================
    if (teamCode === "s") {
      try {
        const songPage = await axios.get(
          "https://www.yakult-swallows.co.jp/players/song",
          {
            headers: { "User-Agent": "Mozilla/5.0" },
            timeout: 5000
          }
        );

        const $song = cheerio.load(songPage.data);
        let lyrics = [];

        const normalizedPlayerName = playerName.replace(/\s/g, "");

        $song(".v-players-song__list-item").each((i, el) => {
          const songName = $song(el)
            .find(".v-players-song__list-name")
            .text()
            .trim()
            .replace(/\s/g, "");

          if (songName === normalizedPlayerName) {
            $song(el)
              .find(".v-players-song__phrase-text p")
              .each((j, p) => {
                lyrics.push($song(p).text().trim());
              });
          }
        });

        if (lyrics.length > 0) {
          html += "<h2>応援歌</h2>";
          lyrics.forEach(line => {
            html += `<p>${line}</p>`;
          });
        }

      } catch (err) {
        console.error("応援歌取得失敗:", err.message);
      }
    }

    res.send(html);

  } catch (err) {
    console.error(err);
    res.send("選手詳細取得失敗");
  }
});

module.exports = app;