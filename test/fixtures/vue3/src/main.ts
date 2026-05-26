import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./views/User.vue";

createApp(App).use(createPinia()).mount("#app");
