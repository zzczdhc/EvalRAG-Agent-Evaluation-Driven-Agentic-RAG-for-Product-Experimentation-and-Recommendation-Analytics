# Deployment Plan

This project should not be deployed publicly until the product logic, decision calibration, and usage controls are ready.

Planned public demo URL:

```text
https://evalrag.zichaozhang.com
```

Recommended architecture:

```text
evalrag.zichaozhang.com
  -> Vercel-hosted Next.js frontend
  -> Next.js /api/analyze proxy
  -> Render-hosted FastAPI backend
  -> OpenAI-compatible LLM API
```

Deployment steps when ready:

1. Deploy the FastAPI backend from the repository root using the included Dockerfile.
2. Set backend secrets in the hosting dashboard, especially `OPENAI_API_KEY`.
3. Deploy `frontend/` as a Vercel Next.js project.
4. Set the frontend environment variable `EVALRAG_BACKEND_URL` to the deployed backend URL.
5. Add `evalrag.zichaozhang.com` as a custom domain on the Vercel frontend project.
6. Configure DNS according to Vercel's domain instructions.
7. Before public sharing, add at least one usage-control layer: authentication, password gate, rate limiting, or request quota.

Important cost note:

If the backend is configured with the owner's OpenAI API key, public visitors will consume the owner's LLM quota. Do not share broadly without access control or budget limits.

