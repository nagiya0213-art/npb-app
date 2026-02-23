require('dotenv').config();
const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const session = require("express-session");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;

const app = express();

// Vercel/HTTPSプロキシ対応
app.set('trust proxy', 1);

// --- 認証の設定 ---
app.use(session({
  secret: process.env.SESSION_SECRET || 'npb-secret',
  resave: false,
  saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/auth/google/callback"
  },
  (accessToken, refreshToken, profile, done) => {
    const email = profile.emails[0].value;
    if (email === process.env.MY_EMAIL) {
      return done(null, profile);
    } else {
      return done(null, false, { message: "アクセス権限がありません" });
    }
  }
));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

const ensureAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) return next();
  res.redirect("/login");
};

// --- ヘルパー関数・スタイル ---
const calculateAge = (dateStr) => {
  if (!dateStr) return "";
  const match = dateStr.match(/(\d+)年(\d+)月(\d+)日/);
  if (!match) return "";
  const birthDate = new Date(match[1], match[2] - 1, match[3]);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  if (today.getMonth() < birthDate.getMonth() || (today.getMonth() === birthDate.getMonth() && today.getDate() < birthDate.getDate())) age--;
  return ` ${age}歳`;
};

const headerHtml = `
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: sans-serif; padding: 15px; line-height: 1.6; color: #333; background-color: #f4f7f9; margin: 0; }
    .unofficial-banner { background-color: #fff; border: 3px solid #d32f2f; color: #d32f2f; text-align: center; padding: 10px; font-weight: 900; font-size: 1.8rem; border-radius: 10px; margin-bottom: 20px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); }
    .team-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; list-style: none; padding: 0; }
    .team-item { display: flex; align-items: center; justify-content: flex-start; height: 80px; background-color: white; border: 1px solid #ddd; border-radius: 12px; text-decoration: none; color: #333; font-weight: bold; box-shadow: 0 2px 5px rgba(0,0,0,0.05); padding-left: 15px; background-repeat: no-repeat; background-position: right -15px center; background-size: 90px; }
    .card { background: white; padding: 15px; border-radius: 15px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); position: relative; }
    .team-icon-detail { position: absolute; top: 15px; left: 15px; width: 50px; height: auto; z-index: 2; }
    .bg-number { position: absolute; top: -10px; right: 10px; font-size: 5rem; font-weight: 900; color: rgba(0, 0, 0, 0.05); z-index: 0; pointer-events: none; }
    input[type="text"], select, button { width: 100%; padding: 14px; margin-top: 8px; font-size: 16px; border: 1px solid #ccc; border-radius: 10px; box-sizing: border-box; }
    button { background-color: #007bff; color: white; border: none; font-weight: bold; cursor: pointer; }
    .player-list { background: white; border-radius: 15px; padding: 0; list-style: none; overflow: hidden; }
    .player-list li { padding: 15px; border-bottom: 1px solid #eee; display: flex; align-items: center; }
    .player-list a { text-decoration: none; color: #007bff; flex-grow: 1; font-weight: bold; }
    .back-link { display: block; text-align: center; margin: 20px 0; text-decoration: none; color: #007bff; font-weight: bold; }
    .logout-btn { display: block; text-align: right; margin-bottom: 10px; font-size: 0.8rem; color: #999; text-decoration: none; }
  </style>
`;

const teams = {
  g: { name: "読売ジャイアンツ" }, t: { name: "阪神タイガース" }, d: { name: "中日ドラゴンズ" },
  c: { name: "広島東洋カープ" }, db: { name: "横浜DeNAベイスターズ" }, s: { name: "東京ヤクルトスワローズ" },
  l: { name: "埼玉西武ライオンズ" }, h: { name: "福岡ソフトバンクホークス" }, e: { name: "東北楽天ゴールデンイーグルス" },
  m: { name: "千葉ロッテマリーンズ" }, f: { name: "北海道日本ハムファイターズ" }, b: { name: "オリックス・バファローズ" }
};

// --- ルート設定 ---

app.get("/login", (req, res) => {
  res.send('<div style="text-align:center; padding-top:100px; font-family:sans-serif;"><h1>管理専用名鑑</h1><a href="/auth/google" style="display:inline-block; padding:15px 25px; background:#4285F4; color:white; text-decoration:none; border-radius:5px; font-weight:bold;">Googleでログイン</a></div>');
});

app.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));
app.get("/auth/google/callback", passport.authenticate("google", { failureRedirect: "/login" }), (req, res) => res.redirect("/"));

app.get("/logout", (req, res, next) => {
  req.logout((err) => { if (err) return next(err); res.redirect("/login"); });
});

// メインページ（チーム選択・検索・一覧）
app.get("/", ensureAuthenticated, async (req, res) => {
  const teamCode = req.query.team;
  const searchQuery = (req.query.q || "").trim();
  const numQuery = (req.query.num || "").trim();
  const pageHeader = `<a href="/logout" class="logout-btn">ログアウト</a><div class="unofficial-banner">！ 非公式アプリ ！</div>`;

  if (!teamCode || !teams[teamCode]) {
    let html = headerHtml + pageHeader + `<ul class="team-grid">`;
    for (let code in teams) {
      const logoUrl = `https://p.npb.jp/img/common/logo/2026/logo_${code}_m.png`;
      html += `<li><a href="/?team=${code}" class="team-item" style="background-image: linear-gradient(rgba(255,255,255,0.85), rgba(255,255,255,0.85)), url('${logoUrl}');">${teams[code].name}</a></li>`;
    }
    return res.send(html + "</ul>");
  }

  try {
    const response = await axios.get(`https://npb.jp/bis/teams/rst_${teamCode}.html`);
    const $ = cheerio.load(response.data);
    let players = [];

    $("tr.rosterPlayer").each((_, el) => {
      const number = $(el).find("td").eq(0).text().trim();
      const nameElem = $(el).find(".rosterRegister");
      const name = nameElem.text().trim();
      const link = nameElem.find("a").attr("href");
      if (name) players.push({ number, name, link });
    });

    if (searchQuery) players = players.filter(p => p.name.includes(searchQuery));
    if (numQuery) players = players.filter(p => p.number === numQuery);

    let html = headerHtml + pageHeader + `<h1 style="text-align:center;">${teams[teamCode].name}</h1><a href="/" class="back-link">← チーム選択へ戻る</a>
      <div class="card">
        <form method="get" action="/">
          <input type="hidden" name="team" value="${teamCode}">
          <input type="text" name="q" placeholder="選手名で検索" value="${searchQuery}">
          <input type="text" name="num" placeholder="背番号で検索" value="${numQuery}">
          <button type="submit" style="margin-top:10px;">検索実行</button>
        </form>
      </div>
      <ul class="player-list">`;

    players.forEach(p => {
      html += `<li><span style="width:40px; font-weight:bold; color:#888;">${p.number}</span>
        <a href="/player?team=${teamCode}&direct=${encodeURIComponent(p.link)}&num=${p.number}">${p.name}</a></li>`;
    });
    res.send(html + "</ul>");
  } catch (err) { res.send("データ取得失敗"); }
});

// 選手詳細ページ
app.get("/player", ensureAuthenticated, async (req, res) => {
  const { team: teamCode, num: number, direct: directLink } = req.query;
  const pageHeader = `<a href="/logout" class="logout-btn">ログアウト</a><div class="unofficial-banner" style="font-size:1rem; padding:5px;">非公式</div>`;
  
  try {
    const pRes = await axios.get(`https://npb.jp${directLink}`);
    const $p = cheerio.load(pRes.data);

    // 教えていただいた構造に合わせて名前とふりがなを取得
    const targetName = $p("div#pc_v_name li#pc_v_name").text().trim() || $p("h1").text().replace("日本野球機構オフィシャルサイト","").trim();
    const targetKana = $p("#pc_v_kana").text().trim();

    const profile = [];
    $p("table").first().find("tr").each((i, el) => {
      const th = $p(el).find("th").text().trim();
      let td = $p(el).find("td").text().trim();
      if (["ポジション", "投打", "身長／体重", "生年月日", "出身地", "経歴", "ドラフト"].includes(th)) {
        if (th === "生年月日") td += calculateAge(td);
        profile.push({ th, td });
      }
    });

    const logoUrl = `https://p.npb.jp/img/common/logo/2026/logo_${teamCode}_m.png`;
    let html = headerHtml + pageHeader + `
      <div class="card">
        <img src="${logoUrl}" class="team-icon-detail">
        <div class="bg-number">${number}</div>
        <div style="text-align:center; position:relative; z-index:1; margin-bottom:15px;">
          <p style="margin:0; font-size:0.85rem; color:#888; letter-spacing:0.1em;">${targetKana}</p>
          <h1 style="margin:0; font-size:1.8rem;">${targetName}</h1>
        </div>
        <ul style="position:relative; z-index:1; list-style:none; padding:0;">`;
        
    profile.forEach(p => html += `<li style="padding:10px 0; border-bottom:1px solid #eee;"><strong>${p.th}</strong>: ${p.td}</li>`);
    html += "</ul></div>";

    // ヤクルト応援歌
    if (teamCode === "s") {
      try {
        const sRes = await axios.get("https://www.yakult-swallows.co.jp/players/song");
        const $s = cheerio.load(sRes.data);
        const norm = targetName.replace(/\s/g, ""); 
        $s(".v-players-song__list-item").each((i, el) => {
          const songPlayerName = $s(el).find(".v-players-song__list-name").text().replace(/\s/g, "");
          if (songPlayerName.includes(norm) || norm.includes(songPlayerName)) {
            html += `<div class="card" style="background:#fffde7; border-left: 5px solid #001943;"><h3>球団公認 応援歌</h3>`;
            const phrase = $s(el).find(".v-players-song__phrase-text").html();
            if (phrase) html += `<div style="line-height:1.8;">${phrase}</div>`;
            html += `</div>`;
          }
        });
      } catch (e) {}
    }

    res.send(html + `<a href="/?team=${teamCode}" class="back-link">← 一覧に戻る</a>`);
  } catch (err) { res.send("詳細取得失敗"); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Listening on ${PORT}`));
module.exports = app;