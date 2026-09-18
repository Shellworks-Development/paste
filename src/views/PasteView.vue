<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import {
  ArrowLeft,
  Check,
  Clock,
  Copy,
  Download,
  Eye,
  FileCode,
  Flame,
  Globe,
  Hourglass,
  Link2,
  LoaderCircle,
  Lock,
  Paintbrush,
  SearchX,
  ShieldAlert,
  Trash,
  TriangleAlert,
  Unlock,
} from "@lucide/vue";

import type { Paste, PasteMeta } from "@shared/types";

import { ApiError, api } from "@/lib/api";
import { decryptText } from "@/lib/crypto";
import { formatBytes, formatDateTime, timeAgo, expiryText } from "@/lib/format";
import { renderCode, renderHtml, renderHtmlFrame, renderMarkdown } from "@/lib/markdown";

const route = useRoute();
const router = useRouter();

const paste = ref<PasteMeta | null>(null);
const plaintext = ref<string | null>(null);
const loading = ref(true);
const error = ref<{ code: string; message: string } | null>(null);
const tab = ref<"rendered" | "raw">("rendered");
const renderAsMarkdown = ref(false);
const html = ref("");
const rendering = ref(false);
const copied = ref(false);
const deleting = ref(false);
const unlocking = ref(false);
const unlockError = ref<string | null>(null);
const keyInput = ref("");

const isEncrypted = computed(() => paste.value?.visibility === "encrypted");
const isHtml = computed(() => paste.value?.language === "html");
const useFrame = computed(() => isHtml.value && (paste.value?.unsafe ?? false));
const locked = computed(() => isEncrypted.value && plaintext.value === null);
const createdAt = computed(() => (paste.value ? formatDateTime(paste.value.created_at) : ""));
const shareUrl = computed(() => {
  if (!paste.value) return window.location.href;
  const base = `${window.location.origin}/p/${paste.value.id}`;
  const key = keyInput.value.trim();
  if (isEncrypted.value && key) return `${base}?key=${encodeURIComponent(key)}`;
  return base;
});

function keyFromUrl(): string | null {
  const queryKey = route.query.key;
  if (typeof queryKey === "string" && queryKey) return queryKey;
  const match = /(?:^#|&)key=([^&]+)/.exec(window.location.hash);
  if (match) return decodeURIComponent(match[1]);
  return null;
}

async function render(): Promise<void> {
  const source = plaintext.value;
  if (source === null) return;
  rendering.value = true;
  try {
    const options = { unsafe: paste.value?.unsafe ?? false };
    if (useFrame.value) html.value = await renderHtmlFrame(source);
    else if (isHtml.value) html.value = await renderHtml(source, options);
    else if (renderAsMarkdown.value) html.value = await renderMarkdown(source, options);
    else html.value = await renderCode(source, paste.value?.language ?? "plaintext", options);
  } catch {
    html.value = `<pre class="hljs">${escapeHtml(source)}</pre>`;
  } finally {
    rendering.value = false;
  }
}

function escapeHtml(value: string): string {
  const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };
  return value.replace(/[&<>]/g, (char) => entities[char] ?? char);
}

watch([plaintext, renderAsMarkdown, useFrame], () => {
  void render();
});

onMounted(async () => {
  try {
    const meta = await api.getPasteMeta(String(route.params.id));
    paste.value = meta;

    if (meta.visibility === "encrypted") {
      const key = keyFromUrl();
      if (key) {
        keyInput.value = key;
        await unlock();
      }
      return;
    }

    const full = await api.getPaste(meta.id);
    paste.value = full;
    plaintext.value = full.content;
    renderAsMarkdown.value = full.language === "markdown";
  } catch (cause) {
    error.value =
      cause instanceof ApiError
        ? { code: cause.code, message: cause.message }
        : { code: "error", message: "Could not load this paste." };
  } finally {
    loading.value = false;
  }
});

async function unlock(): Promise<void> {
  if (!paste.value) return;
  const key = keyInput.value.trim();
  if (!key) {
    unlockError.value = "Enter the encryption key to continue.";
    return;
  }

  unlocking.value = true;
  unlockError.value = null;
  try {
    const full = await api.getPaste(paste.value.id);
    plaintext.value = await decryptText(full.content, key);
    paste.value = full;
    renderAsMarkdown.value = full.language === "markdown";
  } catch (cause) {
    unlockError.value =
      cause instanceof ApiError
        ? cause.message
        : cause instanceof Error
          ? cause.message
          : "Could not decrypt this paste.";
  } finally {
    unlocking.value = false;
  }
}

async function copy(value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    copied.value = true;
    window.setTimeout(() => (copied.value = false), 1500);
  } catch {
    /* clipboard unavailable */
  }
}

async function download(): Promise<void> {
  if (plaintext.value === null || !paste.value) return;
  const extension =
    paste.value.language === "markdown"
      ? "md"
      : paste.value.language === "plaintext"
        ? "txt"
        : paste.value.language;
  const blob = new Blob([plaintext.value], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${paste.value.title || paste.value.id}.${extension}`;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function remove(): Promise<void> {
  if (!paste.value) return;
  if (!window.confirm("Delete this paste permanently?")) return;
  deleting.value = true;
  try {
    await api.deletePaste(paste.value.id);
    await router.push("/");
  } catch (cause) {
    error.value =
      cause instanceof ApiError
        ? { code: cause.code, message: cause.message }
        : { code: "error", message: "Could not delete this paste." };
  } finally {
    deleting.value = false;
  }
}
</script>

<template>
  <div class="page paste-page">
    <p v-if="loading" class="muted">
      <LoaderCircle :size="14" class="spin" aria-hidden="true" />loading…
    </p>

    <section v-else-if="error" class="card empty-state">
      <SearchX :size="28" aria-hidden="true" />
      <h1>{{ error.code === "expired" ? "This paste expired" : "Paste not found" }}</h1>
      <p class="muted">{{ error.message }}</p>
      <RouterLink to="/" class="primary"
        ><ArrowLeft :size="15" aria-hidden="true" />Make a new paste</RouterLink
      >
    </section>

    <template v-else-if="paste">
      <header class="paste-header">
        <div class="paste-heading">
          <h1>{{ paste.title || paste.id }}</h1>
          <div class="paste-meta">
            <span class="badge">{{ paste.language }}</span>
            <span class="meta-item"
              ><Clock :size="13" aria-hidden="true" :title="createdAt" />{{
                timeAgo(paste.created_at)
              }}</span
            >
            <span class="meta-item"
              ><Hourglass :size="13" aria-hidden="true" />{{ expiryText(paste.expires_at) }}</span
            >
            <span class="meta-item"
              ><Eye :size="13" aria-hidden="true" />{{ paste.views }} views</span
            >
            <span class="meta-item">{{ formatBytes(paste.size) }}</span>
            <span v-if="isEncrypted" class="badge subtle">
              <Lock :size="11" aria-hidden="true" />encrypted
            </span>
            <span v-else-if="paste.visibility === 'public'" class="badge subtle">
              <Globe :size="11" aria-hidden="true" />public
            </span>
            <span v-if="paste.burn_after_read" class="badge danger">
              <Flame :size="11" aria-hidden="true" />burn after read
            </span>
            <span v-if="paste.unsafe" class="badge danger">
              <ShieldAlert :size="11" aria-hidden="true" />unsafe mode
            </span>
          </div>
        </div>
      </header>

      <p v-if="paste.burn_after_read && !locked" class="notice">
        <Flame :size="14" aria-hidden="true" />
        This paste was configured to self-destruct. Reading the raw body consumes it.
      </p>

      <p v-if="paste.unsafe && !locked" class="notice warning">
        <ShieldAlert :size="14" aria-hidden="true" />
        Unsafe mode: this paste can include custom CSS, which may alter the appearance of the paste.
        It is isolated from the rest of the site and JavaScript stays blocked.
      </p>

      <section v-if="locked" class="card locked-state">
        <Lock :size="26" aria-hidden="true" />
        <h2>Encrypted paste</h2>
        <p class="muted">This document is encrypted, enter the encryption key to view it.</p>
        <form class="unlock-form" @submit.prevent="unlock">
          <input
            v-model="keyInput"
            type="password"
            placeholder="encryption key"
            autocomplete="off"
            spellcheck="false"
            autofocus
          />
          <button type="submit" class="primary" :disabled="unlocking || !keyInput.trim()">
            <LoaderCircle v-if="unlocking" :size="15" class="spin" aria-hidden="true" />
            <Unlock v-else :size="15" aria-hidden="true" />
            {{ unlocking ? "unlocking…" : "unlock" }}
          </button>
        </form>
        <p v-if="unlockError" class="error">
          <TriangleAlert :size="14" aria-hidden="true" />{{ unlockError }}
        </p>
      </section>

      <template v-else>
        <div class="paste-toolbar">
          <div class="tabs" role="tablist">
            <button
              type="button"
              role="tab"
              :aria-selected="tab === 'rendered'"
              :class="{ active: tab === 'rendered' }"
              @click="tab = 'rendered'"
            >
              <Paintbrush :size="13" aria-hidden="true" />rendered
            </button>
            <button
              type="button"
              role="tab"
              :aria-selected="tab === 'raw'"
              :class="{ active: tab === 'raw' }"
              @click="tab = 'raw'"
            >
              <FileCode :size="13" aria-hidden="true" />raw
            </button>
          </div>

          <div class="toolbar-actions">
            <label
              v-if="tab === 'rendered' && !isHtml && paste.language !== 'markdown'"
              class="toggle"
            >
              <input v-model="renderAsMarkdown" type="checkbox" />
              <span>markdown</span>
            </label>
            <button type="button" class="ghost" @click="copy(plaintext ?? '')">
              <Check v-if="copied" :size="14" aria-hidden="true" />
              <Copy v-else :size="14" aria-hidden="true" />
              {{ copied ? "copied!" : "copy" }}
            </button>
            <button type="button" class="ghost" @click="copy(shareUrl)">
              <Link2 :size="14" aria-hidden="true" />copy link
            </button>
            <button v-if="isEncrypted" type="button" class="ghost" @click="download">
              <Download :size="14" aria-hidden="true" />download
            </button>
            <a
              v-else
              class="ghost"
              :href="`/raw/${paste.id}`"
              target="_blank"
              rel="noopener noreferrer"
            >
              <FileCode :size="14" aria-hidden="true" />raw
            </a>
            <a v-if="!isEncrypted" class="ghost" :href="`/dl/${paste.id}`">
              <Download :size="14" aria-hidden="true" />download
            </a>
            <button
              v-if="paste.owner"
              type="button"
              class="ghost danger"
              :disabled="deleting"
              @click="remove"
            >
              <LoaderCircle v-if="deleting" :size="14" class="spin" aria-hidden="true" />
              <Trash v-else :size="14" aria-hidden="true" />
              delete
            </button>
          </div>
        </div>

        <section
          v-if="tab === 'rendered'"
          class="card rendered"
          :class="{ 'frame-card': useFrame }"
        >
          <p v-if="rendering" class="muted">
            <LoaderCircle :size="14" class="spin" aria-hidden="true" />rendering…
          </p>
          <iframe
            v-if="useFrame"
            v-show="!rendering"
            class="unsafe-frame"
            :srcdoc="html"
            sandbox="allow-popups allow-popups-to-escape-sandbox"
            referrerpolicy="no-referrer"
            title="Paste preview (isolated)"
          ></iframe>
          <!-- eslint-disable-next-line vue/no-v-html -->
          <article
            v-else
            v-show="!rendering"
            class="prose"
            :class="{ 'paste-unsafe': paste.unsafe }"
            v-html="html"
          ></article>
        </section>

        <section v-else class="card raw-card">
          <pre class="raw-block"><code>{{ plaintext }}</code></pre>
        </section>
      </template>
    </template>
  </div>
</template>
