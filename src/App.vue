<script setup lang="ts">
import { BookOpen, Cloud } from "@lucide/vue";
import { RouterLink, RouterView } from "vue-router";

import NavBar from "@/components/NavBar.vue";
</script>

<template>
  <div class="app-shell">
    <NavBar />
    <main class="app-main">
      <RouterView v-slot="{ Component }">
        <component :is="Component" />
      </RouterView>
    </main>
    <footer class="app-footer">
      <span class="footer-item"
        ><Cloud :size="14" aria-hidden="true" />Data is stored on Cloudflare’s network — encrypted
        pastes are encrypted in your browser.</span
      >
      <span class="dot">·</span>
      <RouterLink to="/api" class="footer-item"
        ><BookOpen :size="14" aria-hidden="true" />API</RouterLink
      >
    </footer>
  </div>
</template>
