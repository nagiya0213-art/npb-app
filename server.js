app.get("/", async (req, res) => {
  const teamCode = req.query.team;

  if (!teamCode || !teams[teamCode]) {
    return res.send("チームを選択してください");
  }

  try {
    const url = `https://npb.jp/bis/teams/rst_${teamCode}.html`;
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);

    const players = [];

    $("tr").each((i, el) => {
      const number = $(el).find("td").eq(0).text().trim();
      const name = $(el).find("td").eq(1).text().trim();

      if (number && /^\d+$/.test(number) && name) {
        players.push({ number, name });
      }
    });

    if (players.length === 0) {
      return res.send("選手データ取得失敗");
    }

    let html = `<h1>${teams[teamCode]}</h1><ul>`;
    players.forEach(p => {
      html += `<li>${p.number} ${p.name}</li>`;
    });
    html += "</ul>";

    res.send(html);

  } catch (err) {
    console.error(err.message);
    res.send("選手データ取得失敗");
  }
});