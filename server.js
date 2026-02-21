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
   球団ページ（一覧・検索・フィルター）
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
          const link = aTag.attr("href") || null; // リンクがない場合はnull

          players.push({
            number,
            name,
            link,
            position: currentPosition
          });
        }
      });
    });

    // ソート：支配下（1-2桁）→ 育成（3桁以上）
    players.sort((a, b) => {
      const isDevA = a.number.length >= 3;
      const isDevB = b.number.length >= 3;
      if (isDevA !== isDevB) return isDevA ? 1 : -1;
      return parseInt(a.number, 10) - parseInt(b.number, 10);
    });

    const positions = [...new Set(players.map(p => p.position))].filter(Boolean);
    const filteredPlayers = filterPos ? players.filter(p => p.position === filterPos) : players;

    let html = `
      <h1>${teams[teamCode]}</h1>
      <p><a href="/">← チーム選択に戻る</a></p>

      <form action="/player" method="get" style="display:inline-block; margin-bottom:10px;">
        <input type="hidden" name="team" value="${teamCode}">
        <input type="text" name="num" placeholder="背番号を入力" required>
        <button type="submit">背番号検索</button>
      </form>

      <form action="/player" method="get" style="display:inline-block; margin-bottom:10px;">
        <input type="hidden" name="team" value="${teamCode}">
        <input type="text" name="name" placeholder="名前を入力" required>
        <button type="submit">名前検索</button>
      </form>

      <form method="get" action="/" style="margin-bottom:20px;">
        <input type="hidden" name="team" value="${teamCode}">
        <select name="pos">
          <option value="">全ポジション</option>
    `;

    positions.forEach(pos => {
      html += `<option value="${pos}" ${pos === filterPos ? "selected" : ""}>${pos}</option>`;
    });

    html += `</select><button type="submit">ポジション絞り込み</button></form><hr><ul>`;

    filteredPlayers.forEach(p => {
      // リンク(link)がある場合のみAタグを生成、ない（監督等）場合は名前のみ表示
      if (p.link) {
        html += `<li>${p.number} - <a href="/player?team=${teamCode}&direct=${encodeURIComponent(p.link)}">${p.name}</a></li>`;
      } else {
        html += `<li>${p.number} - ${p.name} (リンクなし)</li>`;
      }
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
  const directLink = req.query.direct;

  if (!teamCode) return res.send("情報不足");

  try {
    const teamUrl = `https://npb.jp/bis/teams/rst_${teamCode}.html`;
    const teamRes = await axios.get(teamUrl);
    const $team = cheerio.load(teamRes.data);

    let targetLink = directLink;
    let targetName = "";

    if (targetLink) {
      const found = $team(`a[href="${targetLink}"]`);
      targetName = found.text().trim();
    } else {
      const matches = [];
      $team("tr.rosterPlayer").each((i, el) => {
        const num = $team(el).find("td").eq(0).text().trim();
        const aTag = $team(el).find(".rosterRegister a");
        
        // リンクがある（選手である）場合のみ検索対象にする
        if (aTag.length > 0) {
          const name = aTag.text().trim();
          const link = aTag.attr("href");
          if ((number && num === number) || (nameQuery && name.includes(nameQuery))) {
            matches.push({ name, link });
          }
        }
      });

      if (matches.length === 0) return res.send("該当する選手（詳細あり）が見つかりません");

      if (matches.length > 1 && !number) {
        let html = `<h1>検索結果</h1><ul>`;
        matches.forEach(p => {
          html += `<li><a href="/player?team=${teamCode}&direct=${encodeURIComponent(p.link)}">${p.name}</a></li>`;
        });
        html += "</ul><p><a href='#' onclick='history.back()'>戻る</a></p>";
        return res.send(html);
      }
      
      targetLink = matches[0].link;
      targetName = matches[0].name;
    }

    const playerUrl = `https://npb.jp${targetLink}`;
    const playerRes = await axios.get(playerUrl);
    const $player = cheerio.load(playerRes.data);

    const profile = [];
    $player("table").first().find("tr").each((i, el) => {
      const th = $player(el).find("th").text().trim();
      const td = $player(el).find("td").text().trim();
      if (["ポジション", "投打", "身長／体重", "生年月日", "出身地", "経歴", "ドラフト"].includes(th)) {
        profile.push({ th, td });
      }
    });

    let html = `<h1>${targetName}</h1><ul>`;
    profile.forEach(p => { html += `<li>${p.th}: ${p.td}</li>`; });
    html += "</ul>";

    // ヤクルト応援歌
    if (teamCode === "s" && targetName) {
      try {
        const songPage = await axios.get("https://www.yakult-swallows.co.jp/players/song", { 
          headers: { "User-Agent": "Mozilla/5.0" },
          timeout: 5000 
        });
        const $song = cheerio.load(songPage.data);
        const normalizedTargetName = targetName.replace(/\s/g, "");
        let lyrics = [];
        $song(".v-players-song__list-item").each((i, el) => {
          const songName = $song(el).find(".v-players-song__list-name").text().trim().replace(/\s/g, "");
          if (songName === normalizedTargetName) {
            $song(el).find(".v-players-song__phrase-text p").each((j, pEl) => {
              lyrics.push($song(pEl).text().trim());
            });
          }
        });
        if (lyrics.length > 0) {
          html += "<hr><h2>応援歌</h2>";
          lyrics.forEach(line => { html += `<p><strong>${line}</strong></p>`; });
        }
      } catch (err) { console.error("応援歌取得失敗"); }
    }

    html += `<hr><p><a href="/?team=${teamCode}">選手一覧に戻る</a></p>`;
    res.send(html);

  } catch (err) {
    console.error(err);
    res.send("取得失敗");
  }
});

module.exports = app;