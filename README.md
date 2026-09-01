# Summit — Vertex AI briefing assistant

Summit is a deliberately small, public-source application used to demonstrate Denali's
GitHub-to-Google Cloud lineage. It runs on Cloud Run and calls Gemini through Vertex AI with
the Cloud Run service account; it has no API key or stored cloud credential.

The interaction pattern is inspired by Google's public
[`gemini-streamlit-cloudrun`](https://github.com/GoogleCloudPlatform/generative-ai/tree/main/gemini/sample-apps/gemini-streamlit-cloudrun)
sample, but this implementation is intentionally dependency-free and keeps the source and
runtime boundary small enough for an explainable security demo.

## Runtime contract

- Project: `vertex-api-502308` (`32976044400`)
- Region: `us-central1`
- Cloud Run service: `denali-gemini-demo`
- Runtime identity: `denali-gemini-demo@vertex-api-502308.iam.gserviceaccount.com`
- Model configuration key: `VERTEX_MODEL_ID`
- Scaling: zero minimum instances, one maximum instance

The checked-in `service.yaml` is the exact source-side deployment declaration consumed by
Denali. After deployment, its image is pinned to the observed digest.

## Local check

```bash
npm run check
PORT=8080 GOOGLE_CLOUD_PROJECT=vertex-api-502308 VERTEX_LOCATION=us-central1 \
  VERTEX_MODEL_ID=gemini-2.5-flash npm start
```

`GET /healthz` never calls Vertex AI. `POST /api/generate` accepts at most 600 characters,
uses a small response budget, and is guarded by a per-instance request limit.
