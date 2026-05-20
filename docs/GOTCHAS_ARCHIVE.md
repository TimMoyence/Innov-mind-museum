# Pièges archives — moins fréquents

Pièges techniques moins-fréquents extraits de `CLAUDE.md` le 2026-05-19 pour alléger le contexte chargé à chaque session. Conservés ici car incident-backed : si tu touches ces zones (DB pooling, ORM cross-entity, observabilité Prometheus, vision pré-traitement, reverse proxy nginx), relis cette page d'abord.

Critère pour rester sur cette page (vs. remonter dans `CLAUDE.md`) : surface < 1 dev-touche/mois ET pas un risque de régression bloquante immédiate. Si l'un de ces pièges revient mordre quelqu'un, promote-le back dans `CLAUDE.md` Pièges connus.

---

- **PgBouncer transaction mode interdit `LISTEN/NOTIFY`, session-scoped advisory locks, persistent prepared statements** — Musaium n'utilise rien de ça aujourd'hui (audit ADR-021), mais à vérifier au cas par cas.

- **SWC + TypeORM cross-entity = ReferenceError circular** — fix = wrap les FK avec le type alias `Relation<T>`. Ne pas s'écarter de ce pattern sur les nouvelles entités.

- **Prometheus `static_configs.targets` n'expand PAS `${VAR}`** — seul `external_labels` accepte `${VAR}` (avec `--enable-feature=expand-external-labels`). Pour différencier prod/dev, on monte 2 fichiers distincts : `infra/grafana/prometheus.yml` (target `backend:3000` pour prod, scp'd via CI vers `/srv/museum/obs/`) et `infra/grafana/prometheus.local.yml` (target `host.docker.internal:3000` pour le local stack `infra/grafana/docker-compose*.yml`). Ne pas tenter de paramétrer le target via env — c'est silencieusement ignoré.

- **SigLIP ONNX preprocessing utilise `normalize` à `[-1, 1]`, PAS la moyenne ImageNet** — différent de ResNet/CLIP/DINOv2. Si tu portes du code de pré-traitement depuis un projet CLIP, NE PAS appliquer `mean=[0.485, 0.456, 0.406]` / `std=[0.229, 0.224, 0.225]` : SigLIP attend `(pixel / 127.5) - 1.0`. Erreur silencieuse — l'encoder produit des vecteurs valides mais avec un recall catastrophique (≪ 0.85 fixture, NFR violé). Référence : `museum-backend/src/modules/chat/adapters/secondary/embeddings/siglip-onnx.adapter.ts`. Seen 2026-05-10 ADR-037.

- **nginx `proxy_pass $variable` ignore les `rewrite` du même bloc** — forme literal `proxy_pass http://...` applique `rewrite` normalement, mais forme variable `proxy_pass $upstream` les ignore SILENCIEUSEMENT. Fix : embed l'URI dans la variable (`set $auth_upstream http://museum-backend:3000/api/auth/super-admin-check;`), pas juste le host. Le 404 produit transite en 500 client via `auth_request` → ressemble à un bug backend (~30min debug perdues sur le Grafana iframe path 2026-05-10). Réf `infra/nginx/conf.d/grafana.conf` (commit `c3bc30c75`).
