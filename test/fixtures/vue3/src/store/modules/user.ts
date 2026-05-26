import { defineStore } from "pinia";

export const useUserStore = defineStore("user", {
  state: () => ({ currentUserId: 0 }),
  actions: {
    selectUser(id: number) {
      this.currentUserId = id;
    },
  },
});
