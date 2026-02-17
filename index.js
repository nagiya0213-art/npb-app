const axios = require("axios");
const cheerio = require("cheerio");
const readline = require("readline");

const teams = [
  { name: "読売ジャイアンツ", url: "https://npb.jp/bis/teams/rst_g.html" },
  { name: "阪神タイガース", url: "https://npb.jp/bis/teams/rst_t.html" },
  { name: "横浜DeNAベイスターズ", url: "https://npb.jp/bis/teams/rst_db.html" },
  { name: "広島東洋カープ", url: "https://npb.jp/bis/teams/rst_c.html" },
  { name: "東京ヤクルトスワローズ", url: "https://npb.jp/bis/teams/rst_s.html" },
  { name: "中日ドラゴンズ", url: "https://npb.jp/bis/teams/rst_d.html" },
  { name: "福岡ソフトバンクホークス", url: "https://npb.jp/bis/teams/rst_h.html" },
  { name: "千葉ロッテマリーンズ", url: "https://npb.jp/bis/teams/rst_m.html" },
  { name: "埼玉西武ライオンズ", url: "https://npb.jp/bis/teams/rst_l.html" },
  { name: "オリックス・バファローズ", url: "https://npb.jp/bis/teams/rst_bs.html" },
  { name: "北海道日本ハムファイターズ", url: "https://npb.jp/bis/teams/rst_f.html" },
  { name: "東北楽天ゴールデンイーグルス", url: "https://npb.jp/bis/teams/rst_e.html" }
];

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function calculateAge(birthText) {
  // 「1988年11月01日」を分解
  const match = birthText.match(/(\d+)年(\d+)月(\d+)日/);

  if (!match) return "取得失敗";

  const year = parseInt(match[1]);
  const month = parseInt(match[2]) - 1;
  const day = parseInt(match[3]);

  const birth = new Date(year, month, day);
  const today = new Date();

  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();

  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--;
  }

  return age;
}


console.log("球団を選んでください：");
teams.forEach((team, index) => {
  console.log(`${index + 1}: ${team.name}`);
});

rl.question("番号を入力してください: ", async (answer) => {
  const teamIndex = parseInt(answer) - 1;
  const team = teams[teamIndex];

  if (!team) {
    console.log("無効な番号です");
    rl.close();
    return;
  }

  try {
    const res = await axios.get(team.url);
    const $ = cheerio.load(res.data);

    const players = [];

    console.log(`\n${team.name} 選手一覧\n`);

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
        console.log(number, name);
      }
    });

    rl.question("\n背番号を入力してください: ", async (numInput) => {
      const player = players.find(p => p.number === numInput);

      if (!player) {
        console.log("選手が見つかりません");
        rl.close();
        return;
      }

      try {
        const playerRes = await axios.get(player.link);
        const $$ = cheerio.load(playerRes.data);

        const birth = $$("th:contains('生年月日')").next().text().trim();
        const heightWeight = $$("th:contains('身長')").next().text().trim();
	const position = $$("th:contains('ポジション')").next().text().trim();


        const age = calculateAge(birth);

        console.log("\n====================");
	console.log(player.name);
	console.log("ポジション:", position);
	console.log("生年月日:", birth);
	console.log("年齢:", age + "歳");
	console.log("身長・体重:", heightWeight);
        console.log("====================");

      } catch (err) {
        console.log("選手情報取得失敗:", err.message);
      }

      rl.close();
    });

  } catch (error) {
    console.log("取得失敗:", error.message);
    rl.close();
  }
});
