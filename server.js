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

// 共通のスタイル（スマホ最適化）
const headerHtml = `
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: sans-serif; padding: 15px; line-height: 1.6; color: #333; }
    h1 { font-size: 1.5rem; }
    form { margin-bottom: 15px; }
    /* 入力欄とボタンを大きく、横いっぱいに */
    input[type="text"], select, button {
      width: 100%;
      padding: 12px;
      margin-top: 5px;
      font-size: 16px; /* iOSのズーム防止 */
      border: 1px solid #ccc;
      border-radius: 8px;
      box-sizing: border-box;
    }
    button {
      background-color: #007bff;
      color: white;
      font-weight: bold;
      border: none;
      cursor: pointer;
    }
    button:active { background-color: #0056b3; }
    ul { padding-left: 20px; }
    li { margin-bottom: 10px; font-size: 1.1rem; }
    a { color: #007bff; text-decoration: none; }
    .back-link { display: inline-block; margin-bottom: 15px; }
    hr { border: 0; border-top: 1px solid #eee; margin: 20px 0; }
  </style>
`;

/* =========================
   球団ページ（スマホ対応版）
========================= */
app.get("/", async (req, res) => {
  const teamCode = req.query.team;
  const filterPos = req.query.pos || "";

  if (!teamCode || !teams[teamCode]) {
    let html = headerHtml + "<h1>チームを選択してください</h1><ul>";
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
          const name = nameContainer.text().trim();
          const link = aTag.attr("href") || null;

          players.push({ number, name, link, position: currentPosition });
        }
      });
    });

    // ソート：支配下 → 育成（3文字以上）
    players.sort((a, b) => {
      const isDevA = a.number.length >= 3;
      const isDevB = b.number.length >= 3;
      if (isDevA !== isDevB) return isDevA ? 1 : -1;
      return parseInt(a.number, 10) - parseInt(b.number, 10);
    });

    const positions = [...new Set(players.map(p => p.position))].filter(Boolean);
    const filteredPlayers = filterPos ? players.filter(p => p.position === filterPos) : players;

    let html = headerHtml + `
      <h1>${teams[teamCode]}</h1>
      <a href="/" class="back-link">← チーム選択に戻る</a>

      <form action="/player" method="get">
        <input type="hidden" name="team" value="${teamCode}">
        <input type="text" name="num" placeholder="背番号を入力">
        <button type="submit">背番号で検索</button>
      </form>

      <form action="/player" method="get">
        <input type="hidden" name="team" value="${teamCode}">
        <input type="text" name="name" placeholder="選手名を入力">
        <button type="submit">名前で検索</button>
      </form>

      <form method="get" action="/">
        <input type="hidden" name="team" value="${teamCode}">
        <select name="pos" onchange="this.form.submit()">
          <option value="">全ポジションを表示</option>
          ${positions.map(pos => `<option value="${pos}" ${pos === filterPos ? "selected" : ""}>${pos}</option>`).join('')}
        </select>
      </form>

      <hr>
      <ul>
    `;

    filteredPlayers.forEach(p => {
      if (p.link) {
        html += `<li>${p.number} - <a href="/player?team=${teamCode}&direct=${encodeURIComponent(p.link)}">${p.name}</a></li>`;
      } else {
        html += `<li>${p.number} - ${p.name} <small style="color:#999;">(監督・コーチ)</small></li>`;
      }
    });

    html += "</ul>";
    res.send(html);

  } catch (err) {
    res.send("データ取得に失敗しました。");
  }
});

/* =========================
   選手詳細（スマホ対応版）
========================= */
app.get("/player", async (req, res) => {
  const { team: teamCode, num: number, name: nameQuery, direct: directLink } = req.query;

  try {
    const teamUrl = `https://npb.jp/bis/teams/rst_${teamCode}.html`;
    const teamRes = await axios.get(teamUrl);
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
          const link = aTag.attr("href");
          if ((number && num === number) || (nameQuery && name.includes(nameQuery))) {
            matches.push({ name, link });
          }
        }
      });

      if (matches.length === 0) return res.send(headerHtml + "選手が見つかりません。<br><a href='#' onclick='history.back()'>戻る</a>");
      if (matches.length > 1 && !number) {
        let listHtml = headerHtml + "<h1>検索結果</h1><ul>";
        matches.forEach(p => {
          listHtml += `<li><a href="/player?team=${teamCode}&direct=${encodeURIComponent(p.link)}">${p.name}</a></li>`;
        });
        return res.send(listHtml + "</ul>");
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
      if (["ポジション", "投打", "身長／体重", "生年月日", "出身地", "経歴", "ドラフト"].includes(th)) {
        profile.push({ th, td });
      }
    });

    let html = headerHtml + `<h1>${targetName}</h1><ul>`;
    profile.forEach(p => { html += `<li><strong>${p.th}</strong>: ${p.td}</li>`; });
    html += "</ul>";

    // ヤクルト応援歌
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
        if (lyrics.length > 0) {
          html += "<hr><h2>応援歌</h2>" + lyrics.map(l => `<p>${l}</p>`).join("");
        }
      } catch (e) {}
    }

    html += `<hr><a href="/?team=${teamCode}" class="back-link">← 選手一覧に戻る</a>`;
    res.send(html);
  } catch (err) {
    res.send("取得に失敗しました。");
  }
});

module.exports = app;