<script setup lang="ts">
import { onMounted, ref } from "vue";
import { RouterLink, useRouter } from "vue-router";
import { Database, FileClock, Rocket, Sparkles } from "@lucide/vue";

import type { PasteMeta, Stats } from "@shared/types";

import PasteEditor from "@/components/PasteEditor.vue";
import { api } from "@/lib/api";
import { formatBytes, timeAgo } from "@/lib/format";

const router = useRouter();
const recent = ref<PasteMeta[]>([]);
const stats = ref<Stats | null>(null);
const loaded = ref(false);

function onCreated(paste: PasteMeta, key: string | null): void {
  void router.push(key ? `/p/${paste.id}?key=${encodeURIComponent(key)}` : `/p/${paste.id}`);
}

onMounted(async () => {
  try {
    const [recentResult, statsResult] = await Promise.all([api.recent(20), api.stats()]);
    recent.value = recentResult.pastes;
    stats.value = statsResult;
  } catch {
    recent.value = [];
  } finally {
    loaded.value = true;
  }
});
</script>

<template>
  <div class="page home">
    <section class="hero">
      <h1><Rocket :size="26" aria-hidden="true" />paste</h1>
      <p>Simple text sharing.</p>
    </section>

    <PasteEditor @created="onCreated" />

    <section class="recent">
      <header class="section-header">
        <h2 class="section-title">
          <FileClock :size="16" aria-hidden="true" />Recent public pastes
        </h2>
        <span v-if="stats" class="muted section-title">
          <Database :size="14" aria-hidden="true" />
          {{ stats.pastes }} pastes · {{ formatBytes(stats.bytes) }} stored
        </span>
      </header>

      <p v-if="loaded && recent.length === 0" class="muted empty">
        <Sparkles :size="14" aria-hidden="true" />
        Nothing public yet. Pastes default to unlisted — tick “Public” to share one here.
      </p>

      <ul v-if="recent.length" class="paste-list">
        <li v-for="paste in recent" :key="paste.id">
          <RouterLink :to="`/p/${paste.id}`" class="paste-link">
            <span class="paste-title">{{ paste.title || paste.id }}</span>
            <span class="paste-id">{{ paste.id }}</span>
          </RouterLink>
          <div class="paste-meta">
            <span class="badge">{{ paste.language }}</span>
            <span>{{ formatBytes(paste.size) }}</span>
            <span>{{ timeAgo(paste.created_at) }}</span>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>
