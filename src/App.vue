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
      <span class="dot">·</span>
      <a
        href="https://github.com/Shellworks-Development/paste"
        class="footer-item"
        target="_blank"
        rel="noopener noreferrer"
      >
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="currentColor">
          <path
            d="M12 .5C5.37.5 0 5.78 0 12.292c0 5.211 3.438 9.63 8.205 11.188.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.917 24 17.502 24 12.292 24 5.78 18.627.5 12 .5z"
          />
        </svg>
        GitHub
      </a>
    </footer>
  </div>
</template>
