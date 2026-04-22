const express = require('express');
const path = require('path');

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_DB_ID = "e3932eea-f641-4eb6-a5e6-56ec993dd8ff";

// Route de test pour vérifier que le bon serveur tourne bien sur Render
app.get('/ping', function (req, res) {
  res.status(200).send('pong');
});

// Route d'envoi du formulaire
app.post('/submit', async function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    if (!NOTION_TOKEN) {
      return res.status(500).json({
        error: "La variable d'environnement NOTION_TOKEN est manquante sur Render."
      });
    }

    const payload = req.body || {};

    const properties = {
      "Titre": {
        "title": [
          { "text": { "content": payload.titre || "" } }
        ]
      },
      "Demandeur": {
        "rich_text": [
          { "text": { "content": payload.demandeur || "" } }
        ]
      },
      "Email": {
        "email": payload.email || null
      },
      "Statut": {
        "select": { "name": "📥 À traiter" }
      },
      "Nature": {
        "select": { "name": payload.nature || "Non renseigné" }
      },
      "Description": {
        "rich_text": [
          { "text": { "content": payload.description || "" } }
        ]
      },
      "Impact métier": {
        "rich_text": [
          { "text": { "content": payload.impact || "" } }
        ]
      }
    };

    if (payload.equipe) {
      properties["Équipe"] = { "select": { "name": payload.equipe } };
    }

    if (payload.priorite) {
      properties["Priorité"] = { "select": { "name": payload.priorite } };
    }

    if (Array.isArray(payload.labels) && payload.labels.length > 0) {
      properties["Périmètres"] = {
        "multi_select": payload.labels.map(function (label) {
          return { "name": label };
        })
      };
    }

    if (payload.deadline) {
      properties["Deadline"] = {
        "date": { "start": payload.deadline }
      };
    }

    if (payload.lien && payload.lien.indexOf('http') === 0) {
      properties["Lien / Maquette"] = {
        "url": payload.lien
      };
    }

    const notionResponse = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${NOTION_TOKEN}`,
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28"
      },
      body: JSON.stringify({
        parent: { database_id: NOTION_DB_ID },
        properties: properties
      })
    });

    const data = await notionResponse.json();

    if (!notionResponse.ok) {
      return res.status(notionResponse.status).json({
        error: data.message || "Erreur Notion"
      });
    }

    return res.status(200).json({
      success: true,
      id: data.id
    });
  } catch (err) {
    return res.status(500).json({
      error: err.message || "Erreur serveur"
    });
  }
});

// Log des routes au démarrage pour debug
app._router && app._router.stack.forEach(function (r) {
  if (r.route && r.route.path) {
    console.log('Route chargée:', Object.keys(r.route.methods).join(',').toUpperCase(), r.route.path);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, function () {
  console.log('Server running on port ' + PORT);
});
