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

const headerHtml = `
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: "Helvetica Neue", Arial, sans-serif; padding: 15px; line-height: 1.6; color: #333; background-color: #f8f9fa; }
    .page-title { text-align: center; margin-bottom: 20px; color: #555; }
    .page-title h3 { margin: 0; font-size: 1.4rem; border-bottom: 2px solid #007bff; display: inline-block; padding-bottom: 5px; }
    .page-title small { font-size: 0.9rem; color: #777; margin-left: 5px; }
    .select-heading { font-size: 1.8rem; text-align: center; margin: 30px 0 20px; font-weight: bold; }
    .team-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; list-style: none; padding: 0; }
    .team-grid a { 
      display: flex; align-items: center; justify-content: center; height: 80px;
      background: white; border: 1px solid #ddd; border-radius: 12px;
      text-decoration: none; color: #333; font-weight: bold; text-align: center;
      box-shadow: 0 2px 4px rgba(0,0,0,0.05); padding: 10px; font-size: 0.95rem;
    }
    .team-grid a:active { transform: scale(0.95); background-color: #e9ecef; }
    
    /* フォーム・検索周り */
    .search-box { background: white; padding: 15px; border-radius: 12px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
    input[type="text"], select, button {
      width: 100%; padding: 14px; margin-top: 8px; font-size: 16px; 
      border: 1px solid #ccc; border-radius: 8px; box-sizing: border-box;
    }
    button { background-color: #007bff; color: white; border: none; font-weight: bold; margin-top: 12px; }
    
    .player-list { background: white; border-radius: 12px; padding: 0; list-style: none; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
    .player-list li { padding: 15px; border-bottom: 1px solid #eee; font-size: 1.1rem; }
    .player-list li:last-child { border-bottom: none; }
    .back-link { display: block; text-align: center; margin-bottom: 20px; text-decoration: none; color: #007bff; }
  </style>
`;

/* =========================
   球団ページ
========================= */
app.get("/", async (req, res) => {
  const teamCode = req.query.team;
  const filterPos = req.query.pos || "";
  const pageHeader = `<div class="page-title"><h3>2026年度<small>選手一覧</small></h3></div>`;

  if (!teamCode || !teams[teamCode]) {
    let html = headerHtml + pageHeader;
    html += `<h2 class="select-heading">チームを選択</h2><ul class="team-grid">`;
    for (let code in teams) html += `<li><a href="/?team=${code}">${teams[code]}</a></li>`;
    html += "</ul>";
    return res.send(html);
  }

  try {
    const response = await axios.get(`https://npb.jp/bis/teams/rst_${teamCode}.html`);
    const $ = cheerio.load(response.data);
    const players = [];

    $("table.rosterlisttbl").each((_, table) => {
      let currentPosition = "";
      $(table).find("tr").each((i, el) => {
        if ($(el).hasClass("rosterMainHead")) {
          const posText = $(el).find(".rosterPos").text().trim();
          if (posText) currentPosition = posText;
        }
        if ($(el).hasClass("rosterPlayer")) {
          const number = $(el).find("td").eq(0).text().trim();
          const nameContainer = $(el).find(".rosterRegister");
          const aTag = nameContainer.find("a");
          players.push({
            number,
            name: nameContainer.text().trim(),
            link: aTag.attr("href") || null,
            position: currentPosition
          });
        }
      });
    });

    players.sort((a, b) => {
      const isDevA = a.number.length >= 3;
      const isDevB = b.number.length >= 3;
      if (isDevA !== isDevB) return isDevA ? 1 : -1;
      return parseInt(a.number, 10) - parseInt(b.number, 10);
    });

    const positions = [...new Set(players.map(p => p.position))].filter(Boolean);
    const filteredPlayers = filterPos ? players.filter(p => p.position === filterPos) : players;

    let html = headerHtml + pageHeader + `
      <h1 style="text-align:center; margin-bottom:10px;">${teams[teamCode]}</h1>
      <a href="/" class="back-link">← チーム選択に戻る</a>

      <div class="search-box">
        <form action="/player" method="get">
          <input type="hidden" name="team" value="${teamCode}">
          <input type="text" name="num" placeholder="背番号で検索 (例: 1)">
          <button type="submit">背番号検索</button>
        </form>
        
        <form action="/player" method="get" style="margin-top:20px;">
          <input type="hidden" name="team" value="${teamCode}">
          <input type="text" name="name" placeholder="名前で検索 (例: 山田)">
          <button type="submit">名前検索</button>
        </form>
      </div>

      <div class="search-box">
        <form method="get" action="/">
          <input type="hidden" name="team" value="${teamCode}">
          <label style="font-size:0.9rem; color:#666;">ポジション絞り込み</label>
          <select name="pos" onchange="this.form.submit()">
            <option value="">全ポジションを表示</option>
            ${positions.map(pos => `<option value="${pos}" ${pos === filterPos ? "selected" : ""}>${pos}</option>`).join('')}
          </select>
        </form>
      </div>

      <ul class="player-list">
    `;

    filteredPlayers.forEach(p => {
      if (p.link) {
        html += `<li>${p.number} - <a href="/player?team=${teamCode}&direct=${encodeURIComponent(p.link)}">${p.name}</a></li>`;
      } else {
        html += `<li>${p.number} - ${p.name} <small style="color:#999;">(リンクなし)</small></li>`;
      }
    });

    html += "</ul>";
    res.send(html);
  } catch (err) { res.send("取得失敗"); }
});

/* =========================
   選手詳細
========================= */
app.get("/player", async (req, res) => {
  const { team: teamCode, num: number, name: nameQuery, direct: directLink } = req.query;
  const pageHeader = `<div class="page-title"><h3>2026年度<small>選手一覧</small></h3></div>`;

  try {
    const teamRes = await axios.get(`https://npb.jp/bis/teams/rst_${teamCode}.html`);
    const $team = cheerio.load(teamRes.data);
    let targetLink = directLink;
    let targetName = "";

    if (targetLink) {
      targetName = $team(`a[href="${targetLink}"]`).first().text().trim();
    } else {
      const matches = [];
      $team("tr.rosterPlayer").each((i, el) => {
        const num = $team(el).find("td").eq(0).text().trim();
        const aTag = $team(el).find(".rosterRegister a");
        if (aTag.length > 0) {
          const name = aTag.text().trim();
          if ((number && num === number) || (nameQuery && name.includes(nameQuery))) {
            matches.push({ name, link: aTag.attr("href") });
          }
        }
      });
      if (matches.length === 0) return res.send(headerHtml + pageHeader + "<div class='search-box'>選手が見つかりませんでした。<br><a href='#' onclick='history.back()'>戻る</a></div>");
      if (matches.length > 1 && !number) {
        let listHtml = headerHtml + pageHeader + "<div class='search-box'><h1>検索結果</h1><ul class='player-list'>";
        matches.forEach(p => {
          listHtml += `<li><a href="/player?team=${teamCode}&direct=${encodeURIComponent(p.link)}">${p.name}</a></li>`;
        });
        return res.send(listHtml + "</ul></div>");
      }
      targetLink = matches[0].link;
      targetName = matches[0].name;
    }

    const playerRes = await axios.get(`https://npb.jp${targetLink}`);
    const $player = cheerio.load(playerRes.data);
    const profile = [];
    $player("table").first().find("tr").each((i, el) => {
      const th = $player(el).find("th").text().trim();
      const td = $player(el).find("td").text().trim();
      if (["ポジション", "投打", "身長／体重", "生年月日", "出身地", "経歴", "ドラフト"].includes(th)) profile.push({ th, td });
    });

    let html = headerHtml + pageHeader + `<h1 style="text-align:center;">${targetName}</h1><div class="search-box"><ul>`;
    profile.forEach(p => { html += `<li><strong>${p.th}</strong>: ${p.td}</li>`; });
    html += "</ul></div>";

    if (teamCode === "s") {
      try {
        const songRes = await axios.get("https://www.yakult-swallows.co.jp/players/song", { timeout: 5000 });
        const $song = cheerio.load(songRes.data);
        const normName = targetName.replace(/\s/g, "");
        let lyrics = [];
        $song(".v-players-song__list-item").each((i, el) => {
          if ($song(el).find(".v-players-song__list-name").text().trim().replace(/\s/g, "") === normName) {
            $song(el).find(".v-players-song__phrase-text p").each((j, p) => lyrics.push($song(p).text().trim()));
          }
        });
        if (lyrics.length > 0) html += `<div class="search-box" style="background:#fffde7;"><h2>応援歌</h2>${lyrics.map(l => `<p>${l}</p>`).join("")}</div>`;
      } catch (e) {}
    }
    html += `<a href="/?team=${teamCode}" class="back-link">← 選手一覧に戻る</a>`;
    res.send(html);
  } catch (err) { res.send("エラーが発生しました。"); }
});

module.exports = app;