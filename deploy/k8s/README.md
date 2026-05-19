# Kubernetes deploy manifests

Plain-Kustomize layout — no Helm. The base is the source of truth; overlays
patch in environment-specific differences.

```
deploy/k8s/
├── base/                          # production-shaped defaults
│   ├── deployment.yaml            # web + email-worker Deployments
│   ├── service.yaml               # ClusterIP for the web pods
│   ├── ingress.yaml               # nginx-ingress with SSE-friendly timeouts
│   ├── hpa.yaml                   # CPU+memory autoscaling, 2 → 12
│   ├── configmap.yaml             # non-secret runtime config
│   ├── secret.example.yaml        # shape only — never apply directly
│   ├── networkpolicy.yaml         # default-deny + targeted allows
│   ├── pdb.yaml                   # min 1 available during voluntary disruptions
│   └── kustomization.yaml
└── overlays/
    ├── dev/        → linksy-dev namespace, 1 replica, Stripe test
    ├── staging/    → linksy-staging namespace, 2 replicas, Stripe test
    └── prod/       → linksy-prod namespace, base defaults, Stripe live
```

## Render & apply

```bash
# Preview the rendered manifests
kubectl kustomize deploy/k8s/overlays/prod

# Apply (use --prune sparingly; safer to scope by label)
kubectl apply -k deploy/k8s/overlays/staging

# Diff before a prod rollout
kubectl diff -k deploy/k8s/overlays/prod
```

The image tag in `base/deployment.yaml` is `CHANGE_ME` on purpose — CI
should rewrite it before `kubectl apply`. Example with Kustomize edit:

```bash
cd deploy/k8s/overlays/prod
kustomize edit set image \
  ghcr.io/your-org/linksy=ghcr.io/your-org/linksy:$GIT_SHA
kubectl apply -k .
```

## Secrets

`secret.example.yaml` documents the required keys but **must not** be applied
as-is. Pick one of:

- **SealedSecrets** — encrypt with `kubeseal --controller-namespace=kube-system`
  and commit the sealed YAML alongside the overlay.
- **External Secrets Operator** — point an `ExternalSecret` at AWS Secrets
  Manager / GCP Secret Manager / Vault.
- **Sops + age** — encrypt the secret manifest and decrypt in CI before apply.

Whichever you pick, the resulting Secret name must remain `linksy-secrets`
so the `envFrom` in the Deployment finds it.

## Probes & health

- `livenessProbe` → `/api/health` (process is up). Cheap, no DB.
- `readinessProbe` → `/api/health/ready` (DB + Redis + deps). Pulls the pod
  out of the Service while a dep is down without killing it.
- `startupProbe` → `/api/health`, generous failure threshold for cold boots.

See `app/api/health/route.ts` and `app/api/health/ready/route.ts`.

## SSE / WebRTC notes

The ingress annotations disable proxy buffering and raise the read/send
timeouts to 1h so Server-Sent Events streams (inbox + call signalling) and
WebRTC negotiation don't get cut off at the load-balancer.

The Service has `sessionAffinity: None` on purpose — clients reconnect SSE
naturally on disconnect, and stickiness would imbalance load on rollouts.

## NetworkPolicy

`networkpolicy.yaml` ships a default-deny plus targeted allows:

- **Ingress** — only the `ingress-nginx` and `monitoring` namespaces may
  reach pod port `:3000`.
- **Egress** — DNS, in-cluster Postgres + Redis, and outbound `:443/:587/:465`
  for SaaS APIs (Stripe, Resend, S3, FCM, APNs, Sentry, OAuth providers).

If you run Postgres/Redis outside the cluster, replace the `podSelector`
allow rules with `ipBlock` entries scoped to your DB / cache CIDR.
