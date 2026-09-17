<script setup lang="ts">
import { ArrowLeft, SearchX } from "@lucide/vue";
import { RouterLink } from "vue-router";
</script>

<template>
  <div class="page">
    <section class="card empty-state">
      <SearchX :size="28" aria-hidden="true" />
      <h1>404</h1>
      <p class="muted">That page does not exist.</p>
      <RouterLink to="/" class="primary"
        ><ArrowLeft :size="15" aria-hidden="true" />Back home</RouterLink
      >
    </section>
  </div>
</template>
