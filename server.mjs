import http from "node:http";

const port = Number(process.env.PORT || 8080);
const project = process.env.GOOGLE_CLOUD_PROJECT;
const location = process.env.VERTEX_LOCATION || "us-central1";
const model = process.env.VERTEX_MODEL_ID || "gemini-2.5-flash";
const startedAt = new Date().toISOString();
const requestWindow = { startedAt: Date.now(), count: 0 };
const MAX_REQUESTS_PER_HOUR = 30;

const page = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Summit — Vertex AI briefing assistant</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, sans-serif; color: #172033; background: #f4f7fb; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: radial-gradient(circle at 12% 5%, #dff3ff 0, transparent 34%), radial-gradient(circle at 88% 12%, #e8e1ff 0, transparent 31%), #f6f8fc; }
    main { width: min(920px, calc(100% - 32px)); margin: 0 auto; padding: 54px 0 70px; }
    .eyebrow { color: #6956d8; font-size: 12px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; }
    h1 { margin: 12px 0 10px; font-size: clamp(34px, 6vw, 62px); line-height: 1.02; letter-spacing: -.045em; }
    .lede { max-width: 690px; margin: 0; color: #59657b; font-size: 18px; line-height: 1.6; }
    .badges { display: flex; flex-wrap: wrap; gap: 8px; margin: 24px 0 30px; }
    .badge { padding: 8px 11px; border: 1px solid #dce2ee; border-radius: 999px; background: rgba(255,255,255,.76); color: #4d5c72; font-size: 12px; font-weight: 700; }
    .panel { padding: 26px; border: 1px solid #dfe5ef; border-radius: 22px; background: rgba(255,255,255,.9); box-shadow: 0 18px 50px rgba(43,57,91,.10); backdrop-filter: blur(14px); }
    label { display: block; margin-bottom: 9px; font-size: 13px; font-weight: 800; }
    textarea { width: 100%; min-height: 118px; resize: vertical; padding: 15px 16px; border: 1px solid #cfd7e5; border-radius: 14px; background: white; color: #172033; font: inherit; line-height: 1.5; outline: none; }
    textarea:focus { border-color: #7564df; box-shadow: 0 0 0 4px rgba(117,100,223,.12); }
    .suggestions { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0 18px; }
    .suggestions button { padding: 8px 10px; border: 1px solid #dfe4ee; border-radius: 9px; background: #f8f9fc; color: #526078; font-size: 12px; cursor: pointer; }
    .actions { display: flex; align-items: center; gap: 14px; }
    #submit { padding: 12px 18px; border: 0; border-radius: 11px; background: #6b59d7; color: white; font-weight: 800; cursor: pointer; }
    #submit:disabled { opacity: .55; cursor: wait; }
    #status { color: #69758a; font-size: 13px; }
    #answer { display: none; margin-top: 22px; padding: 18px; border-radius: 14px; background: #f5f3ff; color: #303950; line-height: 1.65; white-space: pre-wrap; }
    footer { margin-top: 18px; color: #7a8497; font-size: 12px; text-align: center; }
  </style>
</head>
<body>
  <main>
    <div class="eyebrow">Golden Path · Google Cloud</div>
    <h1>Summit briefing assistant</h1>
    <p class="lede">A small, real AI application running on Cloud Run and using Gemini through Vertex AI. Its source, runtime identity, model configuration, and deployment are independently observable by Denali.</p>
    <div class="badges"><span class="badge">Cloud Run</span><span class="badge">Vertex AI</span><span class="badge">Gemini 2.5 Flash</span><span class="badge">Dedicated service account</span><span class="badge">Scale to zero</span></div>
    <section class="panel">
      <label for="prompt">Create a concise customer briefing</label>
      <textarea id="prompt" maxlength="600">Summarize the three most important questions a security leader should ask before deploying an AI agent.</textarea>
      <div class="suggestions">
        <button type="button" data-prompt="Explain code-to-cloud correlation in three concise bullets.">Code-to-cloud</button>
        <button type="button" data-prompt="Give me a five-point security checklist for a customer-support AI agent.">Security checklist</button>
        <button type="button" data-prompt="Draft a short executive briefing on why AI runtime identity matters.">Executive briefing</button>
      </div>
      <div class="actions"><button id="submit" type="button">Generate with Vertex AI</button><span id="status">Ready</span></div>
      <div id="answer" aria-live="polite"></div>
    </section>
    <footer>Public-source demonstration application · prompts are sent to Vertex AI and are not stored by this app</footer>
  </main>
  <script>
    const prompt = document.querySelector('#prompt');
    const submit = document.querySelector('#submit');
    const status = document.querySelector('#status');
    const answer = document.querySelector('#answer');
    document.querySelectorAll('[data-prompt]').forEach((button) => button.addEventListener('click', () => { prompt.value = button.dataset.prompt; prompt.focus(); }));
    submit.addEventListener('click', async () => {
      const value = prompt.value.trim();
      if (!value) return;
      submit.disabled = true; status.textContent = 'Generating…'; answer.style.display = 'none';
      try {
        const response = await fetch('/api/generate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: value }) });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'generation_failed');
        answer.textContent = payload.text; answer.style.display = 'block'; status.textContent = 'Generated by ' + payload.model;
      } catch (error) {
        answer.textContent = 'The model request could not be completed: ' + error.message; answer.style.display = 'block'; status.textContent = 'Request failed';
      } finally { submit.disabled = false; }
    });
  </script>
</body>
</html>`;

function secureHeaders(contentType) {
  return {
    "content-type": contentType,
    "cache-control": "no-store",
    "content-security-policy": "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
  };
}

function sendJson(response, status, body) {
  response.writeHead(status, secureHeaders("application/json; charset=utf-8"));
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 2_048) throw new Error("request_too_large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function consumeRequestBudget() {
  const now = Date.now();
  if (now - requestWindow.startedAt >= 3_600_000) {
    requestWindow.startedAt = now;
    requestWindow.count = 0;
  }
  requestWindow.count += 1;
  return requestWindow.count <= MAX_REQUESTS_PER_HOUR;
}

async function metadataAccessToken() {
  const response = await fetch("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token", {
    headers: { "Metadata-Flavor": "Google" },
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error("metadata_token_failed");
  return (await response.json()).access_token;
}

async function generate(prompt) {
  if (!project) throw new Error("project_not_configured");
  const token = await metadataAccessToken();
  const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(location)}/publishers/google/models/${encodeURIComponent(model)}:generateContent`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 256, temperature: 0.2 },
    }),
    signal: AbortSignal.timeout(35_000),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error("vertex_request_failed");
  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("")?.trim();
  if (!text) throw new Error("vertex_response_empty");
  return text;
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  if (request.method === "GET" && url.pathname === "/") {
    response.writeHead(200, secureHeaders("text/html; charset=utf-8"));
    return response.end(page);
  }
  if (request.method === "GET" && url.pathname === "/healthz") {
    return sendJson(response, 200, { status: "ok", provider: "vertex-ai", model, started_at: startedAt });
  }
  if (request.method === "POST" && url.pathname === "/api/generate") {
    if (!consumeRequestBudget()) return sendJson(response, 429, { error: "demo_request_limit_reached" });
    try {
      const body = await readJson(request);
      const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 600) : "";
      if (!prompt) return sendJson(response, 422, { error: "prompt_required" });
      const text = await generate(prompt);
      return sendJson(response, 200, { text, provider: "vertex-ai", model });
    } catch (error) {
      console.error(JSON.stringify({ event: "generation_failed", code: error.message }));
      return sendJson(response, error.message === "request_too_large" ? 413 : 502, { error: error.message });
    }
  }
  return sendJson(response, 404, { error: "not_found" });
});

server.listen(port, "0.0.0.0", () => {
  console.log(JSON.stringify({ event: "listening", port, provider: "vertex-ai", model }));
});
