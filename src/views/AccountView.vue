<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import {
  ClipboardList,
  Copy,
  KeyRound,
  LoaderCircle,
  ShieldCheck,
  Sparkles,
  Trash,
  User,
} from "@lucide/vue";

import { LIMITS, type PasteMeta, type TokenInfo } from "@shared/types";

import { ApiError, api, getAdminToken, getToken, setAdminToken, setToken } from "@/lib/api";
import { formatBytes, formatDateTime, timeAgo } from "@/lib/format";

const tokenInput = ref(getToken() ?? "");
const adminInput = ref(getAdminToken() ?? "");
const me = ref<TokenInfo | null>(null);
const myPastes = ref<PasteMeta[]>([]);
const tokens = ref<TokenInfo[]>([]);
const newToken = ref<string | null>(null);
const keyName = ref("");
const message = ref<string | null>(null);
const error = ref<string | null>(null);
const generating = ref(false);
const revoking = ref(false);

const activeLimit = computed(() => (me.value ? LIMITS.authBytes : LIMITS.anonBytes));

async function refresh(): Promise<void> {
  error.value = null;
  if (getToken()) {
    try {
      const result = await api.me();
      me.value = result.token;
      const mine = await api.listMine();
      myPastes.value = mine.pastes;
    } catch (cause) {
      me.value = null;
      myPastes.value = [];
      if (cause instanceof ApiError && cause.status === 401) {
        setToken(null);
        tokenInput.value = "";
        error.value = "That API key was rejected and has been cleared.";
      }
    }
  } else {
    me.value = null;
    myPastes.value = [];
  }

  if (getAdminToken()) {
    try {
      const result = await api.listTokens();
      tokens.value = result.tokens;
    } catch (cause) {
      tokens.value = [];
      if (cause instanceof ApiError && cause.status === 403) {
        setAdminToken(null);
        adminInput.value = "";
        error.value = "That admin token was rejected and has been cleared.";
      }
    }
  } else {
    tokens.value = [];
  }
}

onMounted(refresh);

function saveToken(): void {
  const value = tokenInput.value.trim();
  setToken(value || null);
  message.value = value ? "API key saved." : "API key cleared.";
  void refresh();
}

function saveAdmin(): void {
  const value = adminInput.value.trim();
  setAdminToken(value || null);
  message.value = value ? "Admin token saved." : "Admin token cleared.";
  void refresh();
}

async function generateKey(): Promise<void> {
  generating.value = true;
  error.value = null;
  try {
    const result = await api.createToken(keyName.value.trim() || "api key");
    newToken.value = result.token;
    keyName.value = "";
    setToken(result.token);
    tokenInput.value = result.token;
    message.value = "API key generated and saved in this browser.";
    await refresh();
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : "Could not generate an API key.";
  } finally {
    generating.value = false;
  }
}

async function revokeSelf(): Promise<void> {
  if (!window.confirm("Revoke the API key currently saved in this browser?")) return;
  revoking.value = true;
  try {
    await api.revokeSelf();
    setToken(null);
    tokenInput.value = "";
    newToken.value = null;
    message.value = "API key revoked.";
    await refresh();
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : "Could not revoke the key.";
  } finally {
    revoking.value = false;
  }
}

async function revoke(id: string): Promise<void> {
  error.value = null;
  try {
    await api.revokeToken(id);
    const list = await api.listTokens();
    tokens.value = list.tokens;
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : "Could not revoke the key.";
  }
}

async function removePaste(id: string): Promise<void> {
  if (!window.confirm("Delete this paste permanently?")) return;
  try {
    await api.deletePaste(id);
    myPastes.value = myPastes.value.filter((paste) => paste.id !== id);
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : "Could not delete the paste.";
  }
}

async function copy(value: string): Promise<void> {
  await navigator.clipboard.writeText(value);
  message.value = "Copied to clipboard.";
}
</script>

<template>
  <div class="page account">
    <h1><User :size="24" aria-hidden="true" />Account</h1>

    <p v-if="message" class="notice">{{ message }}</p>
    <p v-if="error" class="error">{{ error }}</p>

    <section class="card">
      <h2 class="section-title"><KeyRound :size="16" aria-hidden="true" />API key</h2>
      <p class="muted">
        Keys raise your paste limit from {{ formatBytes(LIMITS.anonBytes) }} to
        {{ formatBytes(LIMITS.authBytes) }}, let you delete your own pastes, and list them here.
        Sent as <code>Authorization: Bearer …</code>.
      </p>

      <div class="row">
        <input v-model="keyName" type="text" placeholder="key name (optional)" maxlength="80" />
        <button type="button" class="primary" :disabled="generating" @click="generateKey">
          <LoaderCircle v-if="generating" :size="15" class="spin" aria-hidden="true" />
          <Sparkles v-else :size="15" aria-hidden="true" />
          {{ generating ? "generating…" : "Generate API key" }}
        </button>
      </div>

      <p v-if="newToken" class="notice">
        New key (shown once):
        <code class="copyable" @click="copy(newToken)"
          ><Copy :size="12" aria-hidden="true" />{{ newToken }}</code
        >
      </p>

      <div class="row">
        <input v-model="tokenInput" type="password" placeholder="psk_…" autocomplete="off" />
        <button type="button" class="primary" @click="saveToken">Save</button>
        <button
          v-if="me"
          type="button"
          class="ghost danger"
          :disabled="revoking"
          @click="revokeSelf"
        >
          <Trash :size="14" aria-hidden="true" />revoke
        </button>
      </div>

      <p v-if="me" class="muted small">
        Active key <code>{{ me.prefix }}…</code> ({{ me.name }}), created
        {{ formatDateTime(me.created_at) }}. Limit: {{ formatBytes(activeLimit) }}.
      </p>
      <p v-else class="muted small">Using the anonymous tier ({{ formatBytes(activeLimit) }}).</p>
      <p class="muted small">
        One key per IP every few minutes — the cooldown is enforced server-side.
      </p>
    </section>

    <section v-if="me" class="card">
      <h2 class="section-title"><ClipboardList :size="16" aria-hidden="true" />Your pastes</h2>
      <p v-if="myPastes.length === 0" class="muted">No pastes yet.</p>
      <ul v-else class="paste-list compact">
        <li v-for="paste in myPastes" :key="paste.id">
          <RouterLink :to="`/p/${paste.id}`" class="paste-link">
            <span class="paste-title">{{ paste.title || paste.id }}</span>
          </RouterLink>
          <div class="paste-meta">
            <span class="badge">{{ paste.language }}</span>
            <span>{{ formatBytes(paste.size) }}</span>
            <span>{{ timeAgo(paste.created_at) }}</span>
            <button type="button" class="ghost danger" @click="removePaste(paste.id)">
              <Trash :size="13" aria-hidden="true" />delete
            </button>
          </div>
        </li>
      </ul>
    </section>

    <section class="card">
      <h2 class="section-title"><ShieldCheck :size="16" aria-hidden="true" />Admin</h2>
      <p class="muted">
        Optional. An <code>ADMIN_TOKEN</code> secret lets you list and revoke every key. It stays in
        your browser only, sent as <code>X-Admin-Token</code>.
      </p>
      <div class="row">
        <input v-model="adminInput" type="password" placeholder="admin token" autocomplete="off" />
        <button type="button" class="primary" @click="saveAdmin">Save</button>
      </div>

      <template v-if="getAdminToken()">
        <ul v-if="tokens.length" class="token-list">
          <li v-for="token in tokens" :key="token.id">
            <div>
              <code>{{ token.prefix }}…</code>
              <span class="muted"> · {{ token.name }}</span>
            </div>
            <div class="paste-meta">
              <span v-if="token.revoked_at" class="badge danger">revoked</span>
              <span v-else
                >used {{ token.last_used_at ? timeAgo(token.last_used_at) : "never" }}</span
              >
              <button
                v-if="!token.revoked_at"
                type="button"
                class="ghost danger"
                @click="revoke(token.id)"
              >
                <Trash :size="13" aria-hidden="true" />revoke
              </button>
            </div>
          </li>
        </ul>
        <p v-else class="muted">No keys yet.</p>
      </template>
    </section>
  </div>
</template>
