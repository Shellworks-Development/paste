<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { BookOpen, Clipboard, Monitor, Moon, Plus, Sun, User } from "@lucide/vue";

import { cycleTheme, theme } from "@/lib/theme";

const themeIcon = computed(() =>
  theme.value === "light" ? Sun : theme.value === "dark" ? Moon : Monitor,
);
</script>

<template>
  <header class="nav">
    <RouterLink to="/" class="brand" aria-label="paste home">
      <Clipboard :size="18" aria-hidden="true" />
      <span class="brand-name">paste</span>
    </RouterLink>

    <nav class="nav-links">
      <RouterLink to="/"><Plus :size="15" aria-hidden="true" />new</RouterLink>
      <RouterLink to="/account"><User :size="15" aria-hidden="true" />account</RouterLink>
      <RouterLink to="/api"><BookOpen :size="15" aria-hidden="true" />api</RouterLink>
    </nav>

    <button
      type="button"
      class="icon-button"
      :title="`Theme: ${theme}`"
      :aria-label="`Switch theme (currently ${theme})`"
      @click="cycleTheme"
    >
      <component :is="themeIcon" :size="16" aria-hidden="true" />
    </button>
  </header>
</template>
