const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_DB_ID = "e3932eea-f641-4eb6-a5e6-56ec993dd8ff";

app.post('/submit', async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    var payload = req.body;
    var properties = {
      "Titre": { "title": [{ "text": { "content": payload.titre || "" } }] },
      "Demandeur": { "rich_text": [{ "text": { "content": payload.demandeur || "" } }] },
      "Email": { "email": payload.email || null },
      "Statut": { "select": { "name": "\ud83d\udce5 \u00c0 traiter" } },
      "Nature": { "select": { "name": payload.nature } },
      "Description": { "rich_text": [{ "text": { "content": payload.description || "" } }] },
      "Impact m\u00e9tier": { "rich_text": [{ "text": { "content": payload.impact || "" } }] }
    };

    if (payload.equipe) properties["\u00c9quipe"] = { "select": { "name": payload.equipe } };
    if (payload.priorite) properties["Priorit\u00e9"] = { "select": { "name": payload.priorite } };
    if (payload.labels && payload.labels.length > 0) properties["P\u00e9rim\u00e8tres"] = { "multi_select": payload.labels.map(function(l) { return { "name": l }; }) };
    if (payload.deadline) properties["Deadline"] = { "date": { "start": payload.deadline } };
    if (payload.lien && payload.lien.indexOf('http') === 0) properties["Lien / Maquette"] = { "url": payload.lien };

    var body = JSON.stringify({ "parent": { "database_id": NOTION_DB_ID }, "properties": properties });

    var response = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + NOTION_TOKEN,
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28"
      },
      body: body
    });

    var data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data.message || "Erreur Notion" });
    }
    return res.json({ success: true, id: data.id });

  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
});

var PORT = process.env.PORT || 3000;
app.listen(PORT, function() {
  console.log('Server running on port ' + PORT);
});
