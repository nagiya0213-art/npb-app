const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");

const app = express();

/* =========================
   球団一覧
========================= */

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
    let html = "<h1>チームを選択</h1><ul>";
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

    /* 🔥 rosterMainHeadから取得 */
    $(".rosterMainHead").each((i, el) => {

      const number = $(el).find(".rosterMainNo").text().trim();      // 背番号（文字列）
      const position = $(el).find(".rosterMainPos").text().trim();  // ポジション

      if (number) {
        players.push({ number, position });
      }
    });

    /* 背番号ソート（文字列保持） */
    players.sort((a, b) =>
      a.number.localeCompare(b.number, undefined, { numeric: true })
    );

    const positions = [...new Set(players.map(p => p.position))];

    const filteredPlayers = filterPos
      ? players.filter(p => p.position === filterPos)
      : players;

    let html = `<h1>${teams[teamCode]}</h1>`;

    html += `
      <form action="/player" method="get">
        <input type="hidden" name="team" value="${teamCode}">
        <input type="text" name="num" placeholder="背番号">
        <button type="submit">背番号検索</button>
      </form>

      <form action="/player" method="get">
        <input type="hidden" name="team" value="${teamCode}">
        <input type="text" name="name" placeholder="名前検索">
        <button type="submit">名前検索</button>
      </form>

      <form method="get">
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

      <hr><ul>
    `;

    filteredPlayers.forEach(p => {
      html += `<li>${p.number} (${p.position})</li>`;
    });

    html += "</ul>";

    res.send(html);

  } catch (err) {
    res.send("球団ページ取得失敗");
  }
});


/* =========================
   選手検索
========================= */

app.get("/player", async (req, res) => {

  const teamCode = req.query.team;
  const number = req.query.num;
  const nameQuery = req.query.name;
  const directLink = req.query.link;

  if (!teamCode) return res.send("情報不足");

  try {

    if (directLink) {
      return await renderPlayer(directLink, teamCode, res);
    }

    const teamUrl = `https://npb.jp/bis/teams/rst_${teamCode}.html`;
    const teamRes = await axios.get(teamUrl);
    const $team = cheerio.load(teamRes.data);

    const matches = [];

    $team(".rosterMainHead").each((i, el) => {

      const num = $team(el).find(".rosterMainNo").text().trim();
      const name = $team(el).find(".rosterMainName a").text().trim();
      const link = $team(el).find(".rosterMainName a").attr("href");

      if (
        (number && num === number) ||
        (nameQuery && name.includes(nameQuery))
      ) {
        matches.push({ name, link });
      }
    });

    if (matches.length === 0) {
      return res.send("選手が見つかりません");
    }

    if (matches.length > 1 && nameQuery) {
      let html = "<h1>該当選手一覧</h1><ul>";
      matches.forEach(p => {
        html += `
          <li>
            <a href="/player?team=${teamCode}&link=${p.link}">
              ${p.name}
            </a>
          </li>
        `;
      });
      html += "</ul>";
      return res.send(html);
    }

    await renderPlayer(matches[0].link, teamCode, res);

  } catch {
    res.send("検索失敗");
  }
});


/* =========================
   詳細表示
========================= */

async function renderPlayer(link, teamCode, res) {

  const playerUrl = `https://npb.jp${link}`;
  const playerRes = await axios.get(playerUrl);
  const $player = cheerio.load(playerRes.data);

  /* ✅ 正しい選手名 */
  const playerName = $player("#pc_v_name").text().trim();

  const profile = [];

  $player("tbody tr").each((i, el) => {

    const th = $player(el).find("th").text().trim();
    const td = $player(el).find("td").text().trim();

    if (th && td) {
      profile.push({ th, td });
    }
  });

  let html = `<h1>${playerName}</h1><ul>`;

  profile.forEach(p => {
    html += `<li>${p.th}: ${p.td}</li>`;
  });

  html += "</ul>";

  /* =========================
     ヤクルト応援歌（完全一致）
  ========================= */

  if (teamCode === "s") {

    try {

      const songPage = await axios.get(
        "https://www.yakult-swallows.co.jp/players/song",
        { headers: { "User-Agent": "Mozilla/5.0" } }
      );

      const $song = cheerio.load(songPage.data);

      const normalize = (str) => {
        return str
          .replace(/\s/g, "")
          .replace(/．/g, ".")
          .replace(/[Ａ-Ｚａ-ｚ０-９]/g, s =>
            String.fromCharCode(s.charCodeAt(0) - 0xFEE0)
          )
          .toUpperCase();
      };

      const normalizedName = normalize(playerName);
      let lyrics = [];

      $song(".v-players-song__list-item").each((i, el) => {

        const songNameRaw = $song(el)
          .find(".v-players-song__list-name")
          .text()
          .trim();

        const normalizedSongName = normalize(songNameRaw);

        if (normalizedSongName === normalizedName) {

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

    } catch {
      console.log("応援歌取得失敗");
    }
  }

  res.send(html);
}


module.exports = app;