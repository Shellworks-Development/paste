<script setup lang="ts">
import { computed } from "vue";
import {
  Boxes,
  CircleAlert,
  CloudUpload,
  Download,
  Gauge,
  Globe,
  Lock,
  ShieldCheck,
} from "@lucide/vue";

import { LIMITS } from "@shared/types";
import { formatBytes } from "@/lib/format";

const origin = computed(() => window.location.origin);

const samples = computed(() => {
  const base = origin.value;
  return {
    createJson: `curl -X POST ${base}/api/pastes \\
  -H 'Content-Type: application/json' \\
  -d '{
    "content": "# hello\\n\\nmarkdown by default",
    "title": "greeting",
    "language": "markdown",
    "visibility": "unlisted",
    "expires_in": "1w"
  }'`,
    createRaw: `cat main.rs | curl -X POST '${base}/api/pastes?language=rust&expires_in=1d' \\
  --data-binary @-`,
    createFile: `curl -X POST ${base}/api/pastes -F file=@notes.md -F language=markdown`,
    read: `curl ${base}/api/pastes/<id>          # JSON, includes content
curl ${base}/api/pastes/<id>/meta     # JSON metadata only
curl ${base}/api/pastes/<id>?raw      # text/plain
curl ${base}/raw/<id>                 # text/plain
curl -o file.txt ${base}/dl/<id>      # download`,
    manage: `curl -H "Authorization: Bearer $TOKEN" ${base}/api/me
curl -H "Authorization: Bearer $TOKEN" ${base}/api/pastes
curl -X DELETE -H "Authorization: Bearer $TOKEN" ${base}/api/pastes/<id>`,
    tokens: `# anyone can generate a key (one per IP every few minutes)
curl -X POST ${base}/api/tokens -d '{"name": "laptop"}'

# use it
curl -H "Authorization: Bearer $TOKEN" ${base}/api/me

# revoke the key you are using
curl -X DELETE -H "Authorization: Bearer $TOKEN" ${base}/api/tokens/self

# optional admin: list / revoke any key
curl -H "X-Admin-Token: $ADMIN_TOKEN" ${base}/api/tokens
curl -X DELETE -H "X-Admin-Token: $ADMIN_TOKEN" ${base}/api/tokens/<id>`,
    public: `curl '${base}/api/recent?limit=25'
curl ${base}/api/languages
curl ${base}/api/stats
curl ${base}/api/health`,
    encrypted: `curl -X POST ${base}/api/pastes \\
  -H 'Content-Type: application/json' \\
  -d '{
    "content": "paste-encrypted:v1:210000:<salt>:<iv>:<ciphertext>",
    "visibility": "encrypted",
    "language": "markdown"
  }'

# share the key separately, or in the link
open "${base}/p/<id>?key=<key>"`,
    errors: `{ "error": { "code": "payload_too_large", "message": "…" } }`,
  };
});
</script>

<template>
  <div class="page docs">
    <h1>API</h1>
    <p class="muted">
      Everything the web app does is a plain HTTP call. Base URL: <code>{{ origin }}</code>
    </p>

    <section class="card">
      <h2 class="section-title"><ShieldCheck :size="16" aria-hidden="true" />Authentication</h2>
      <p>
        Reading and creating pastes works anonymously. Sending
        <code>Authorization: Bearer &lt;key&gt;</code> raises your size limit and lets you manage
        the pastes you created. Generate a key with <code>POST /api/tokens</code> or the button on
        the <RouterLink to="/account">account page</RouterLink>. An optional
        <code>ADMIN_TOKEN</code>
        secret unlocks key listing and revocation.
      </p>
      <ul class="plain-list">
        <li>
          Anonymous limit: <strong>{{ formatBytes(LIMITS.anonBytes) }}</strong>
        </li>
        <li>
          Authenticated limit: <strong>{{ formatBytes(LIMITS.authBytes) }}</strong>
        </li>
      </ul>
    </section>

    <section class="card">
      <h2 class="section-title"><CloudUpload :size="16" aria-hidden="true" />Create a paste</h2>
      <pre class="doc-code"><code>{{ samples.createJson }}</code></pre>
      <p class="muted small">Any non-JSON body is treated as the raw content:</p>
      <pre class="doc-code"><code>{{ samples.createRaw }}</code></pre>
      <p class="muted small">Or upload a file as multipart form data:</p>
      <pre class="doc-code"><code>{{ samples.createFile }}</code></pre>
      <ul class="plain-list">
        <li><code>language</code> — any highlight.js id, default <code>markdown</code></li>
        <li>
          <code>visibility</code> — <code>unlisted</code> (default), <code>public</code> (listed in
          recent), or <code>encrypted</code> (key required)
        </li>
        <li>
          <code>expires_in</code> — <code>10m</code>, <code>1h</code>, <code>1d</code>,
          <code>1w</code>, <code>2w</code>, <code>1m</code>, <code>6m</code>, <code>1y</code>,
          <code>never</code>, or seconds
        </li>
        <li><code>burn_after_read</code> — <code>true</code> deletes the paste on first read</li>
        <li>
          <code>unsafe</code> — <code>true</code> opts in to scoped custom CSS (still sanitized; no
          scripts)
        </li>
      </ul>
    </section>

    <section class="card">
      <h2 class="section-title"><Download :size="16" aria-hidden="true" />Read a paste</h2>
      <pre class="doc-code"><code>{{ samples.read }}</code></pre>
      <p class="muted small">
        <code>Accept: text/plain</code> also returns the raw body. Raw responses carry
        <code>X-Paste-Id</code>, <code>X-Paste-Language</code>, <code>X-Paste-Size</code>,
        <code>X-Paste-Created-At</code> and <code>X-Paste-Expires-At</code>.
      </p>
    </section>

    <section class="card">
      <h2 class="section-title"><Lock :size="16" aria-hidden="true" />Encryption</h2>
      <p>
        With <code>visibility: "encrypted"</code> the paste body is encrypted in your browser with
        AES-GCM (key derived via PBKDF2-SHA256, 210k iterations). The server only ever stores the
        <code>paste-encrypted:v1:…</code> envelope, so it cannot read the content. Title, language,
        size and expiry stay in metadata so the link can prompt for the key.
      </p>
      <pre class="doc-code"><code>{{ samples.encrypted }}</code></pre>
      <p class="muted small">
        Append <code>?key=…</code> to a share link to unlock automatically (a
        <code>#key=…</code> fragment works too and avoids sending the key to the server). Without a
        key the viewer shows an unlock prompt. A wrong key fails the AES-GCM authentication check,
        so tampered ciphertext never decrypts.
      </p>
    </section>

    <section class="card">
      <h2 class="section-title"><Boxes :size="16" aria-hidden="true" />Manage</h2>
      <pre class="doc-code"><code>{{ samples.manage }}</code></pre>
      <pre class="doc-code"><code>{{ samples.tokens }}</code></pre>
    </section>

    <section class="card">
      <h2 class="section-title"><Globe :size="16" aria-hidden="true" />Public</h2>
      <pre class="doc-code"><code>{{ samples.public }}</code></pre>
    </section>

    <section class="card">
      <h2 class="section-title"><Gauge :size="16" aria-hidden="true" />Rate limits</h2>
      <p class="muted small">
        Enforced per Cloudflare location with the Workers rate limiting binding. Exceeding a limit
        returns <code>429</code> with <code>Retry-After</code>.
      </p>
      <ul class="plain-list">
        <li>Anonymous creates: 20 / minute per IP</li>
        <li>Authenticated creates: 300 / minute per token</li>
        <li>Raw + recent reads: 600 / minute per IP</li>
        <li>
          API key generation: 10 / minute per IP, plus a per-IP issuance cooldown (300s,
          configurable via <code>TOKEN_COOLDOWN_SECONDS</code>)
        </li>
      </ul>
    </section>

    <section class="card">
      <h2 class="section-title"><CircleAlert :size="16" aria-hidden="true" />Errors</h2>
      <pre class="doc-code"><code>{{ samples.errors }}</code></pre>
    </section>
  </div>
</template>
