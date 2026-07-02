const express = require('express');
const path = require('path');
#
#
const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_DB_ID = "e3932eea-f641-4eb6-a5e6-56ec993dd8ff";
const TEAMS_WEBHOOK_URL = "https://default0e2f240d11ec48d08dbe8871cf2c17.70.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/c573e397a5704bcdadadb234bf23ad85/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=Z66fmshFqvS4S8r4Hp34pX6TUnFYkQYEM6HbWU9bc1s";

async function notifyTeams(payload, notionPageUrl) {
  try {
    var labels = (payload.labels || []).join(', ') || '—';
    var card = {
      "type": "message",
      "attachments": [
        {
          "contentType": "application/vnd.microsoft.card.adaptive",
          "content": {
            "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
            "type": "AdaptiveCard",
            "version": "1.4",
            "body": [
              {
                "type": "TextBlock",
                "text": "🚀 Nouvelle demande eShop !",
                "weight": "Bolder",
                "size": "Large",
                "color": "Accent",
                "wrap": true
              },
              {
                "type": "TextBlock",
                "text": payload.titre || "Sans titre",
                "weight": "Bolder",
                "size": "Medium",
                "wrap": true
              },
              {
                "type": "FactSet",
                "facts": [
                  { "title": "👤 Demandeur", "value": payload.demandeur || "—" },
                  { "title": "🏷️ Nature", "value": payload.nature || "—" },
                  { "title": "⚡ Priorité", "value": payload.priorite || "—" },
                  { "title": "🎯 Périmètres", "value": labels }
                ]
              },
              {
                "type": "TextBlock",
                "text": payload.description || "",
                "wrap": true,
                "isSubtle": true,
                "spacing": "Medium"
              }
            ],
            "actions": notionPageUrl ? [
              {
                "type": "Action.OpenUrl",
                "title": "Voir dans Notion",
                "url": notionPageUrl
              }
            ] : []
          }
        }
      ]
    };

    await fetch(TEAMS_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(card)
    });
  } catch (e) {
    // La notification Teams ne doit jamais faire échouer la création de la fiche
    console.log('Teams notify error:', e.message);
  }
}

app.post('/submit', async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    var payload = req.body;

    var lienFinal = payload.lien && payload.lien.indexOf('http') === 0 ? payload.lien : null;

    var properties = {
      "Titre": { "title": [{ "text": { "content": payload.titre || "" } }] },
      "Demandeur": { "rich_text": [{ "text": { "content": payload.demandeur || "" } }] },
      "Email": { "email": payload.email || null },
      "Statut": { "select": { "name": "\ud83d\udce5 \u00c0 traiter" } },
      "Nature": { "select": { "name": payload.nature } },
      "Description": { "rich_text": [{ "text": { "content": payload.description || "" } }] },
      "Impact m\u00e9tier": { "rich_text": [{ "text": { "content": payload.impact || "" } }] }
    };

    if (payload.priorite) properties["Priorit\u00e9"] = { "select": { "name": payload.priorite } };
    if (payload.labels && payload.labels.length > 0) properties["P\u00e9rim\u00e8tres"] = { "multi_select": payload.labels.map(function(l) { return { "name": l }; }) };
    if (payload.deadline) properties["Deadline"] = { "date": { "start": payload.deadline } };
    if (payload.resultat) properties["R\u00e9sultat attendu"] = { "rich_text": [{ "text": { "content": payload.resultat } }] };
    if (payload.solution) properties["Pistes explor\u00e9es"] = { "rich_text": [{ "text": { "content": payload.solution } }] };
    if (lienFinal) properties["Lien / Maquette"] = { "url": lienFinal };

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

    // Notifie Teams en parallèle (sans bloquer la réponse au formulaire)
    notifyTeams(payload, data.url);

    return res.json({ success: true, id: data.id });

  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
});

var PORT = process.env.PORT || 3000;
app.listen(PORT, function() {
  console.log('Server running on port ' + PORT);
});
