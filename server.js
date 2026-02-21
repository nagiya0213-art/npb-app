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



/* =========================
   球団ページ
========================= */
app.get("/", async (req, res) => {
  const teamCode = req.query.team;
  const filterPos = req.query.pos || "";

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
      if (tds.length >= 4) {
        const number = tds.eq(0).text().trim();
        const position = tds.eq(3).text().trim();

        if (/^\d+$/.test(number)) {
          players.push({
            number: parseInt(number),
            position
          });
        }
      }
    });

    // 数字順に並び替え
    players.sort((a, b) => a.number - b.number);

    const positions = [...new Set(players.map(p => p.position))];

    const filteredPlayers = filterPos
      ? players.filter(p => p.position === filterPos)
      : players;

    let html = `
      <h1>${teams[teamCode]}</h1>

      <!-- 背番号検索 -->
      <form action="/player" method="get">
        <input type="hidden" name="team" value="${teamCode}">
        <input type="number" name="num" placeholder="背番号を入力" required>
        <button type="submit">背番号検索</button>
      </form>

      <!-- 名前検索 -->
      <form action="/player" method="get">
        <input type="hidden" name="team" value="${teamCode}">
        <input type="text" name="name" placeholder="名前を入力" required>
        <button type="submit">名前検索</button>
      </form>

      <!-- ポジションフィルター -->
      <form method="get" action="/">
        <input type="hidden" name="team" value="${teamCode}">
        <select name="pos">
          <option value="">全ポジション</option>
    `;

    positions.forEach(pos => {
      html += `<option value="${pos}" ${pos === filterPos ? "selected" : ""}>${pos}</option>`;
    });

    html += `
        </select>
        <button type="submit">絞り込み</button>
      </form>

      <hr>
      <ul>
    `;

    // 🔥 背番号のみ表示
    filteredPlayers.forEach(p => {
      html += `<li>${p.number}</li>`;
    });

    html += "</ul>";

    res.send(html);

  } catch (err) {
    console.error(err);
    res.send("選手データ取得失敗");
  }
});



/* =========================
   選手詳細
========================= */
app.get("/player", async (req, res) => {
  const teamCode = req.query.team;
  const number = req.query.num;
  const nameQuery = req.query.name;

  if (!teamCode) {
    return res.send("情報不足");
  }

  try {
    const teamUrl = `https://npb.jp/bis/teams/rst_${teamCode}.html`;
    const teamRes = await axios.get(teamUrl);
    const $team = cheerio.load(teamRes.data);

    const matches = [];

    $team("table tr").each((i, el) => {
      const tds = $team(el).find("td");
      if (tds.length >= 2) {
        const num = tds.eq(0).text().trim();
        const aTag = tds.eq(1).find("a");
        const name = aTag.text().trim();
        const link = aTag.attr("href");

        if (
          (number && num === number) ||
          (nameQuery && name.includes(nameQuery))
        ) {
          matches.push({ name, link });
        }
      }
    });

    if (matches.length === 0) {
      return res.send("選手が見つかりません");
    }

    // 🔥 複数ヒット時
    if (matches.length > 1 && nameQuery) {
      let html = "<h1>該当選手一覧</h1><ul>";
      matches.forEach(p => {
        html += `<li>
          <a href="/player?team=${teamCode}&direct=${encodeURIComponent(p.link)}">
            ${p.name}
          </a>
        </li>`;
      });
      html += "</ul>";
      return res.send(html);
    }

    const playerLink = req.query.direct || matches[0].link;
    const playerName = matches[0].name;

    const playerUrl = `https://npb.jp${playerLink}`;
    const playerRes = await axios.get(playerUrl);
    const $player = cheerio.load(playerRes.data);

    const profile = [];

    $player("table").first().find("tr").each((i, el) => {
      const th = $player(el).find("th").text().trim();
      const td = $player(el).find("td").text().trim();

      if (
        th === "ポジション" ||
        th === "投打" ||
        th === "身長／体重" ||
        th === "生年月日" ||
        th === "出身地" ||
        th === "経歴" ||
        th === "ドラフト"
      ) {
        profile.push({ th, td });
      }
    });

    // 年齢計算
    let age = "";
    const birthRow = profile.find(p => p.th === "生年月日");
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

    // ヤクルト応援歌
    if (teamCode === "s") {
      try {
        const songPage = await axios.get(
          "https://www.yakult-swallows.co.jp/players/song",
          { headers: { "User-Agent": "Mozilla/5.0" } }
        );

        const $song = cheerio.load(songPage.data);
        const normalizedName = playerName.replace(/\s/g, "");
        let lyrics = [];

        $song(".v-players-song__list-item").each((i, el) => {
          const songName = $song(el)
            .find(".v-players-song__list-name")
            .text()
            .trim()
            .replace(/\s/g, "");

          if (songName === normalizedName) {
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
        console.error("応援歌取得失敗");
      }
    }

    res.send(html);

  } catch (err) {
    console.error(err);
    res.send("取得失敗");
  }
});

module.exports = app;