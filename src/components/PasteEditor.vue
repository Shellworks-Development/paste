<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from "vue";
import { RouterLink } from "vue-router";
import {
  ClipboardPaste,
  Eraser,
  EyeOff,
  FileUp,
  Flame,
  Globe,
  Hourglass,
  KeyRound,
  LoaderCircle,
  Lock,
  RefreshCw,
  Tag,
  TriangleAlert,
  Type,
} from "@lucide/vue";

import { DEFAULT_LANGUAGE, type Language } from "@shared/languages";
import { EXPIRY_PRESETS, LIMITS, type PasteMeta, type Visibility } from "@shared/types";

import { ApiError, api, getToken } from "@/lib/api";
import { encryptText, generateKey } from "@/lib/crypto";
import { countLines, formatBytes } from "@/lib/format";

const emit = defineEmits<{ created: [paste: PasteMeta, key: string | null] }>();

const ENVELOPE_OVERHEAD = 140;

const content = ref("");
const title = ref("");
const language = ref(DEFAULT_LANGUAGE);
const expiresIn = ref("1w");
const visibility = ref<Visibility>("unlisted");
const burnAfterRead = ref(false);
const encryptionKey = ref("");
const includeKeyInLink = ref(true);

const languages = shallowRef<Language[]>([]);
const submitting = ref(false);
const error = ref<string | null>(null);
const dragging = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);

const isEncrypted = computed(() => visibility.value === "encrypted");
const maxBytes = computed(() => (getToken() ? LIMITS.authBytes : LIMITS.anonBytes));
const plaintextBytes = computed(() => new TextEncoder().encode(content.value).byteLength);
const byteSize = computed(() =>
  isEncrypted.value
    ? Math.ceil(plaintextBytes.value * (4 / 3)) + ENVELOPE_OVERHEAD
    : plaintextBytes.value,
);
const tooLarge = computed(() => byteSize.value > maxBytes.value);
const keyMissing = computed(() => isEncrypted.value && encryptionKey.value.trim().length < 8);
const canSubmit = computed(
  () => content.value.length > 0 && !tooLarge.value && !keyMissing.value && !submitting.value,
);
const usage = computed(() => Math.min(100, (byteSize.value / maxBytes.value) * 100));

onMounted(async () => {
  try {
    const result = await api.languages();
    languages.value = result.languages;
    if (result.languages.some((l) => l.id === result.default)) language.value = result.default;
  } catch {
    languages.value = [{ id: DEFAULT_LANGUAGE, label: "Markdown" }];
  }
});

async function submit(): Promise<void> {
  if (!canSubmit.value) return;
  submitting.value = true;
  error.value = null;
  try {
    const key = isEncrypted.value ? encryptionKey.value.trim() : null;
    const body = key ? await encryptText(content.value, key) : content.value;

    if (new TextEncoder().encode(body).byteLength > maxBytes.value) {
      error.value = `The encrypted payload exceeds the ${formatBytes(maxBytes.value)} limit. Shorten the paste or sign in with a token.`;
      return;
    }

    const meta = await api.createPaste({
      content: body,
      title: title.value.trim() || undefined,
      language: language.value,
      visibility: visibility.value,
      burn_after_read: burnAfterRead.value,
      expires_in: expiresIn.value,
    });
    emit("created", meta, key && includeKeyInLink.value ? key : null);
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : "Could not create the paste.";
  } finally {
    submitting.value = false;
  }
}

function newKey(): void {
  encryptionKey.value = generateKey();
}

async function loadFile(file: File): Promise<void> {
  if (file.size > maxBytes.value) {
    error.value = `“${file.name}” is ${formatBytes(file.size)}, over the ${formatBytes(maxBytes.value)} limit.`;
    return;
  }
  content.value = await file.text();
  if (!title.value) title.value = file.name;
  error.value = null;
}

function onDrop(event: DragEvent): void {
  dragging.value = false;
  const file = event.dataTransfer?.files?.[0];
  if (file) void loadFile(file);
}

function onPickFile(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) void loadFile(file);
  input.value = "";
}

function clear(): void {
  content.value = "";
  title.value = "";
  error.value = null;
}

function onKeydown(event: KeyboardEvent): void {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    event.preventDefault();
    void submit();
  }
}
</script>

<template>
  <section class="editor card">
    <div class="editor-toolbar">
      <Tag :size="15" class="field-icon" aria-hidden="true" />
      <input
        v-model="title"
        class="title-input"
        type="text"
        placeholder="Untitled paste"
        maxlength="200"
        aria-label="Paste title"
      />
      <div class="editor-actions">
        <button type="button" class="ghost" @click="fileInput?.click()">
          <FileUp :size="14" aria-hidden="true" />upload
        </button>
        <button type="button" class="ghost" :disabled="!content" @click="clear">
          <Eraser :size="14" aria-hidden="true" />clear
        </button>
      </div>
      <input ref="fileInput" type="file" hidden @change="onPickFile" />
    </div>

    <div
      class="editor-body"
      :class="{ dragging }"
      @dragover.prevent="dragging = true"
      @dragleave.prevent="dragging = false"
      @drop.prevent="onDrop"
    >
      <textarea
        v-model="content"
        class="editor-textarea"
        spellcheck="false"
        placeholder="Paste or type anything… markdown is rendered by default, or pick a language for syntax highlighting. Drop a file to load it. Ctrl/Cmd + Enter to paste."
        @keydown="onKeydown"
      ></textarea>
      <div v-if="dragging" class="drop-overlay">
        <FileUp :size="20" aria-hidden="true" />drop file to load
      </div>
    </div>

    <div class="editor-options">
      <label class="field">
        <span class="field-label"><Type :size="13" aria-hidden="true" />Language</span>
        <select v-model="language">
          <option v-for="lang in languages" :key="lang.id" :value="lang.id">
            {{ lang.label }}
          </option>
        </select>
      </label>

      <label class="field">
        <span class="field-label"><Hourglass :size="13" aria-hidden="true" />Expires</span>
        <select v-model="expiresIn">
          <option v-for="preset in EXPIRY_PRESETS" :key="preset.value" :value="preset.value">
            {{ preset.label }}
          </option>
        </select>
      </label>

      <label class="field">
        <span class="field-label"><Globe :size="13" aria-hidden="true" />Visibility</span>
        <select v-model="visibility">
          <option value="unlisted">Unlisted</option>
          <option value="public">Public (listed in recent)</option>
          <option value="encrypted">Encrypted (key required)</option>
        </select>
      </label>

      <label class="field checkbox">
        <input v-model="burnAfterRead" type="checkbox" />
        <span class="field-label"><Flame :size="13" aria-hidden="true" />Burn after read</span>
      </label>
    </div>

    <div v-if="isEncrypted" class="encryption-panel">
      <div class="encryption-heading">
        <Lock :size="14" aria-hidden="true" />
        <span>End-to-end encrypted in your browser — the key never reaches the server.</span>
      </div>
      <div class="row">
        <input
          v-model="encryptionKey"
          type="text"
          class="key-input"
          placeholder="encryption key (8+ characters)"
          autocomplete="off"
          spellcheck="false"
        />
        <button type="button" class="ghost" @click="newKey">
          <RefreshCw :size="14" aria-hidden="true" />generate
        </button>
      </div>
      <label class="toggle">
        <input v-model="includeKeyInLink" type="checkbox" />
        <span>include the key in the share link (<code>?key=…</code>)</span>
      </label>
      <p class="muted small">
        The paste body is encrypted; title, language, size and expiry stay visible so the link can
        prompt for the key.
      </p>
    </div>

    <div class="editor-footer">
      <div class="usage" :class="{ over: tooLarge }">
        <div class="usage-bar">
          <div class="usage-fill" :style="{ width: `${usage}%` }"></div>
        </div>
        <span>
          {{ formatBytes(byteSize) }} / {{ formatBytes(maxBytes) }}
          <template v-if="content">· {{ countLines(content) }} lines</template>
          <template v-if="isEncrypted">· encrypted</template>
        </span>
      </div>

      <p v-if="!getToken()" class="hint">
        <EyeOff :size="13" aria-hidden="true" />
        Anonymous limit is 1 MiB.
        <RouterLink to="/account">Add an API token</RouterLink> for 5 MiB.
      </p>

      <button type="button" class="primary" :disabled="!canSubmit" @click="submit">
        <LoaderCircle v-if="submitting" :size="15" class="spin" aria-hidden="true" />
        <ClipboardPaste v-else :size="15" aria-hidden="true" />
        {{ submitting ? "pasting…" : "paste" }}
      </button>
    </div>

    <p v-if="error" class="error"><TriangleAlert :size="14" aria-hidden="true" />{{ error }}</p>
    <p v-else-if="keyMissing && content" class="error">
      <KeyRound :size="14" aria-hidden="true" />Set an encryption key of at least 8 characters.
    </p>
    <p v-else-if="tooLarge" class="error">
      <TriangleAlert :size="14" aria-hidden="true" />Too large — reduce the paste or sign in with a
      token.
    </p>
  </section>
</template>
