import { ditherGradient } from "../src/dither";
import { detectLocale, locales, saveLocale, type Locale } from "../src/i18n";
import { icons } from "../src/icons";
import { siteMessages } from "./i18n";
import "./style.css";

const sunset = ["#7b2ff7", "#b02bd0", "#ff2a9d", "#ff5f73", "#ff9f45", "#ffd23f"];
const rootStyle = document.documentElement.style;
rootStyle.setProperty("--dither-sunset", ditherGradient(sunset));
rootStyle.setProperty("--dither-cyan", ditherGradient(["#0a7f8f", "#149fbf", "#2de2e6", "#a8fcff"]));
rootStyle.setProperty("--dither-fire", ditherGradient(["#a3136f", "#ff4b5c", "#ff9f45", "#ffd23f"]));

for (const el of document.querySelectorAll<HTMLElement>("[data-icon]")) {
  el.innerHTML = icons[el.dataset.icon as keyof typeof icons](Number(el.dataset.size ?? 16));
}

const select = document.querySelector<HTMLSelectElement>("#locale")!;
const frame = document.querySelector<HTMLIFrameElement>("#demo-frame")!;
select.innerHTML = locales.map(({ id, label }) => `<option value="${id}">${label}</option>`).join("");

function applyLocale(locale: Locale) {
  const m = siteMessages[locale];
  document.documentElement.lang = locale;
  document.title = m.title;
  document.querySelector('meta[name="description"]')?.setAttribute("content", m.description);
  select.value = locale;

  for (const el of document.querySelectorAll<HTMLElement>("[data-i18n]")) {
    const value = m[el.dataset.i18n as keyof typeof m];
    el.innerHTML = Array.isArray(value) ? value.map((item) => `<li>${item}</li>`).join("") : value;
  }
}

applyLocale(detectLocale());

select.addEventListener("change", () => {
  const locale = select.value as Locale;
  // The demo shares this origin's localStorage, so it picks the choice up on reload.
  saveLocale(locale);
  applyLocale(locale);
  frame.contentWindow?.location.reload();
});

for (const link of document.querySelectorAll<HTMLElement>("[data-demo]")) {
  link.addEventListener("click", () => {
    frame.src = `app/index.html?tool=${link.dataset.demo}`;
  });
}
