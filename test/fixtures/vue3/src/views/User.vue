<script setup lang="ts">
import { computed, ref } from "vue";
import { getUser } from "../api/user";

const userId = ref(1);
const displayId = computed(() => `#${userId.value}`);
void getUser(userId.value);
</script>

<template>
  <span>{{ displayId }}</span>
</template>
