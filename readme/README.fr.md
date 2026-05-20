# ChargeTrail

[English](../README.md) · **Français** · [简体中文](./README.zh-CN.md)

ChargeTrail est une application web qui agrège les données de sessions de
recharge de véhicules électriques provenant de plusieurs réseaux tiers
(ChargePoint, ChargeLab, BC Hydro, et d'autres), les normalise dans un modèle
de données unifié, les stocke localement dans SQLite et les expose via une API
REST consommée par une application monopage React.

Elle offre une vue unique de l'activité de recharge aujourd'hui dispersée sur
de nombreux portails de fournisseurs — avec un stockage local résilient hors
ligne et une couche d'adaptateurs enfichable permettant d'ajouter de nouveaux
réseaux sans toucher au cœur du système.

## Pile technique

- **Backend** — Node.js + Express 5, TypeScript (ESM), SQLite (better-sqlite3),
  Drizzle ORM, validation pilotée par Zod + documentation OpenAPI.
- **Frontend** — React 18 + Vite, TypeScript, Tailwind CSS 4, shadcn/ui,
  TanStack Query, Recharts, i18next.

## Configuration rapide de l'environnement de développement

Prérequis : **Node.js 20+** (24.x recommandé) et npm.

```bash
# 1. Cloner
git clone git@github.com:chnliupu/ChargeTrail.git
cd ChargeTrail

# 2. Backend
cd backend
npm install
cp .env .env.local        # ajuster si nécessaire
npm run dev               # API sur http://localhost:3000
                          # Swagger UI sur http://localhost:3000/api-docs

# 3. Frontend (dans un second terminal)
cd frontend
npm install
cp .env.example .env      # VITE_API_ORIGIN par défaut http://localhost:3000
npm run dev               # application sur http://localhost:3001
```

Scripts courants (à exécuter dans `backend/` ou `frontend/`) :

| Commande         | Rôle                                      |
| ---------------- | ----------------------------------------- |
| `npm run dev`    | Démarrer le serveur de dev (rechargement) |
| `npm run build`  | Build de production                       |
| `npm test`       | Lancer la suite de tests (Vitest)         |
| `npm run lint`   | Analyse statique                          |
| `npm run format` | Vérifier le formatage                     |

## Pages

### Connecteur

![Page Connecteur](connector.png)

### Données

![Page Données](data.png)

### Résumé

![Page Résumé](summary.png)

### Mode sombre

![Paramètres système](system_settings.png)

## Licence

[MIT](../LICENSE) © chnliupu
