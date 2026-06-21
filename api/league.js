export default async function handler(req, res) {
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: "Missing league id" });

  try {
    const [leagueRes, rostersRes, usersRes] = await Promise.all([
      fetch(`https://api.sleeper.app/v1/league/${id}`),
      fetch(`https://api.sleeper.app/v1/league/${id}/rosters`),
      fetch(`https://api.sleeper.app/v1/league/${id}/users`),
    ]);

    const league = await leagueRes.json();
    const rosters = await rostersRes.json();
    const users = await usersRes.json();

    const userMap = {};
    for (const u of users) {
      userMap[u.user_id] = u.display_name || u.username;
    }

    // Fetch all unique player IDs
    const allPlayerIds = new Set();
    for (const r of rosters) {
      for (const pid of r.players || []) allPlayerIds.add(pid);
    }

    const playersRes = await fetch("https://api.sleeper.app/v1/players/nfl");
    const allPlayers = await playersRes.json();

    const normalize = (s) => s.toLowerCase().replace(/[^a-z]/g, "");

    const teams = rosters.map((r) => {
      const owner = userMap[r.owner_id] || "Unknown";
      const starters = new Set(r.starters || []);
      const byPos = { QB: [], RB: [], WR: [], TE: [], OTHER: [] };

      for (const pid of r.players || []) {
        const p = allPlayers[pid];
        if (!p) continue;
        const pos = ["QB", "RB", "WR", "TE"].includes(p.position)
          ? p.position
          : "OTHER";
        const name =
          p.full_name || `${p.first_name || ""} ${p.last_name || ""}`.trim();
        byPos[pos].push({
          name,
          team: p.team,
          age: p.age,
          sleeper_id: pid,
          starter: starters.has(pid),
          norm_name: normalize(name),
        });
      }

      return {
        owner,
        roster_id: r.roster_id,
        record: `${r.settings?.wins || 0}-${r.settings?.losses || 0}`,
        points_for: r.settings?.fpts || 0,
        positions: byPos,
      };
    });

    teams.sort((a, b) => parseInt(b.record) - parseInt(a.record));

    res.status(200).json({
      league: {
        name: league.name,
        type: league.settings?.type,
        total_rosters: league.total_rosters,
      },
      teams,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}