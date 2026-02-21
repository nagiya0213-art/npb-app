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
   球団ページ（修正版）
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
    
    // 全てのテーブル（支配下・育成両方）を対象にループ
    $("table.rosterlisttbl").each((_, table) => {
      let currentPosition = "";
      
      $(table).find("tr").each((i, el) => {
        // ポジション行（投手・捕手など）の判定
        if ($(el).hasClass("rosterMainHead")) {
          // Aタグがある場合とない場合両方に対応
          const posText = $(el).find(".rosterPos").text().trim();
          if (posText) currentPosition = posText;
        }

        // 選手行の判定
        if ($(el).hasClass("rosterPlayer")) {
          const number = $(el).find("td").eq(0).text().trim();
          const name = $(el).find(".rosterRegister").text().trim();

          players.push({
            number,
            name,
            position: currentPosition
          });
        }
      });
    });

    // 文字列のまま数値順ソート
    players.sort((a, b) =>
      a.number.localeCompare(b.number, undefined, { numeric: true })
    );

    const positions = [...new Set(players.map(p => p.position))].filter(Boolean);

    const filteredPlayers = filterPos
      ? players.filter(p => p.position === filterPos)
      : players;

    let html = `
      <h1>${teams[teamCode]}</h1>
      <p><a href="/">← チーム一覧へ戻る</a></p>

      <form action="/player" method="get">
        <input type="hidden" name="team" value="${teamCode}">
        <input type="text" name="num" placeholder="背番号を入力" required>
        <button type="submit">背番号検索</button>
      </form>

      <form action="/player" method="get">
        <input type="hidden" name="team" value="${teamCode}">
        <input type="text" name="name" placeholder="名前を入力" required>
        <button type="submit">名前検索</button>
      </form>

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
      <h3>選手一覧 (${filterPos || '全ポジション'})</h3>
      <ul>
    `;

    filteredPlayers.forEach(p => {
      // 一覧からも詳細へ飛べるようにリンクを追加
      html += `<li>${p.number} - <a href="/player?team=${teamCode}&num=${p.number}">${p.name}</a> [${p.position}]</li>`;
    });

    html += "</ul>";
    res.send(html);

  } catch (err) {
    console.error(err);
    res.send("選手データ取得失敗");
  }
});

/* =========================
   選手詳細（リンク修正版）
========================= */
app.get("/player", async (req, res) => {
  const teamCode = req.query.team;
  const number = req.query.num;
  const nameQuery = req.query.name;
  const directLink = req.query.direct; // 複数候補から選ばれた際のリンク

  if (!teamCode) return res.send("情報不足");

  try {
    const teamUrl = `https://npb.jp/bis/teams/rst_${teamCode}.html`;
    const teamRes = await axios.get(teamUrl);
    const $team = cheerio.load(teamRes.data);

    let playerLink = directLink;
    let playerName = "";

    // directLinkがない場合は検索を行う
    if (!playerLink) {
      const matches = [];
      $team("tr.rosterPlayer").each((i, el) => {
        const num = $team(el).find("td").eq(0).text().trim();
        const aTag = $team(el).find(".rosterRegister a");
        const name = aTag.text().trim();
        const link = aTag.attr("href");

        if (
          (number && num === number) ||
          (nameQuery && name.includes(nameQuery))
        ) {
          matches.push({ name, link });
        }
      });

      if (matches.length === 0) return res.send("選手が見つかりません");

      // 複数ヒットした場合はリストを表示
      if (matches.length > 1 && !number) {
        let html = "<h1>該当選手一覧</h1><ul>";
        matches.forEach(p => {
          html += `
            <li>
              <a href="/player?team=${teamCode}&direct=${encodeURIComponent(p.link)}">
                ${p.name}
              </a>
            </li>
          `;
        });
        html += "</ul><p><a href='#' onclick='history.back()'>戻る</a></p>";
        return res.send(html);
      }
      
      playerLink = matches[0].link;
      playerName = matches[0].name;
    }

    // 詳細データの取得
    const playerUrl = `https://npb.jp${playerLink}`;
    const playerRes = await axios.get(playerUrl);
    const $player = cheerio.load(playerRes.data);

    // playerNameが未設定（directLinkで来た場合など）ならページから取得
    if (!playerName) {
      playerName = $player("#pc_v_name #nm_kanji").text().trim() || "選手詳細";
    }

    const profile = [];
    $player("table").first().find("tr").each((i, el) => {
      const th = $player(el).find("th").text().trim();
      const td = $player(el).find("td").text().trim();
      if (["ポジション", "投打", "身長／体重", "生年月日", "出身地", "経歴", "ドラフト"].includes(th)) {
        profile.push({ th, td });
      }
    });

    let html = `<h1>${playerName}</h1><ul>`;
    profile.forEach(p => { html += `<li>${p.th}: ${p.td}</li>`; });
    html += "</ul>";

    /* 応援歌コード（変更なし） */
    if (teamCode === "s") {
      try {
        const songPage = await axios.get("https://www.yakult-swallows.co.jp/players/song", { headers: { "User-Agent": "Mozilla/5.0" } });
        const $song = cheerio.load(songPage.data);
        const normalizedName = playerName.replace(/\s/g, "");
        let lyrics = [];
        $song(".v-players-song__list-item").each((i, el) => {
          const songName = $song(el).find(".v-players-song__list-name").text().trim().replace(/\s/g, "");
          if (songName === normalizedName) {
            $song(el).find(".v-players-song__phrase-text p").each((j, pEl) => {
              lyrics.push($song(pEl).text().trim());
            });
          }
        });
        if (lyrics.length > 0) {
          html += "<h2>応援歌</h2>";
          lyrics.forEach(line => { html += `<p>${line}</p>`; });
        }
      } catch (err) { console.error("応援歌取得失敗"); }
    }

    html += `<p><a href="/?team=${teamCode}">チーム一覧へ戻る</a></p>`;
    res.send(html);

  } catch (err) {
    console.error(err);
    res.send("取得失敗");
  }
});

module.exports = app;