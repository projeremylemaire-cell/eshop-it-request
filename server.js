const express = require('express');
const path = require('path');

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const TEAMS_WEBHOOK_URL = process.env.TEAMS_WEBHOOK_URL || '';
const NOTION_DB_ID = "ad929c54-d71c-40a2-978d-a0fa22222dd1";

// CORS simple si un jour tu remets le front ailleurs que sur Render
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Santé du service
app.get('/ping', function (req, res) {
  res.status(200).send('pong');
});

function makeRequestId() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `REQ-${yyyy}${mm}${dd}-${hh}${mi}${ss}-${rand}`;
}

async function sendTeamsNotification(payload, requestId, notionPageId) {
  if (!TEAMS_WEBHOOK_URL) {
    console.log('[TEAMS] TEAMS_WEBHOOK_URL absent, notification ignorée.');
    return;
  }

  const message = [
    `📥 Nouvelle demande IT eShop`,
    ``,
    `**Référence** : ${requestId}`,
    `**Titre** : ${payload.titre || ''}`,
    `**Demandeur** : ${payload.demandeur || ''}`,
    `**Email** : ${payload.email || ''}`,
    `**Équipe** : ${payload.equipe || ''}`,
    `**Nature** : ${payload.nature || ''}`,
    `**Priorité** : ${payload.priorite || ''}`,
    `**Périmètres** : ${Array.isArray(payload.labels) ? payload.labels.join(', ') : ''}`,
    `**Description** : ${payload.description || ''}`,
    `**Impact** : ${payload.impact || ''}`,
    `**Deadline** : ${payload.deadline || 'Aucune'}`,
    `**Lien** : ${payload.lien || 'Aucun'}`,
    notionPageId ? `**Notion Page ID** : ${notionPageId}` : ''
  ].filter(Boolean).join('\n');

  const teamsResponse = await fetch(TEAMS_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: "Nouvelle demande IT eShop",
      text: message
    })
  });

  if (!teamsResponse.ok) {
    const txt = await teamsResponse.text();
    throw new Error(`Erreur Teams ${teamsResponse.status}: ${txt}`);
  }
}

app.post('/submit', async function (req, res) {
  try {
    if (!NOTION_TOKEN) {
      return res.status(500).json({
        error: "La variable d'environnement NOTION_TOKEN est manquante."
      });
    }

    const payload = req.body || {};
    const requestId = makeRequestId();
    const submittedAt = new Date().toISOString();

    console.log('[REQUEST] Nouvelle demande reçue', {
      requestId,
      submittedAt,
      titre: payload.titre,
      demandeur: payload.demandeur,
      email: payload.email
    });

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
      },
      "Référence": {
        "rich_text": [
          { "text": { "content": requestId } }
        ]
      },
      "Date de soumission": {
        "date": { "start": submittedAt }
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

    const notionData = await notionResponse.json();

    if (!notionResponse.ok) {
      console.error('[NOTION] Erreur', notionData);
      return res.status(notionResponse.status).json({
        error: notionData.message || "Erreur Notion"
      });
    }

    console.log('[NOTION] Demande créée', {
      requestId,
      notionPageId: notionData.id
    });

    try {
      await sendTeamsNotification(payload, requestId, notionData.id);
      console.log('[TEAMS] Notification envoyée', { requestId });
    } catch (teamsErr) {
      console.error('[TEAMS] Erreur notification', {
        requestId,
        message: teamsErr.message
      });
      // On ne bloque pas le succès si Notion a bien marché
    }

    return res.status(200).json({
      success: true,
      id: notionData.id,
      requestId: requestId,
      submittedAt: submittedAt
    });
  } catch (err) {
    console.error('[SERVER] Erreur globale', err);
    return res.status(500).json({
      error: err.message || "Erreur serveur"
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, function () {
  console.log('Server running on port ' + PORT);
});
