
import { CONFIG } from "./config.js";

const root = document.querySelector("#contact-list");

const icons = {
  discord: `
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.54 5.34A16.3 16.3 0 0 0 15.45 4l-.5 1.03a15.2 15.2 0 0 0-5.9 0L8.55 4a16.5 16.5 0 0 0-4.1 1.35C1.86 9.2 1.16 12.95 1.5 16.64a16.7 16.7 0 0 0 5.03 2.55l1.22-1.68c-.67-.25-1.31-.57-1.9-.95l.47-.37c3.66 1.7 7.63 1.7 11.25 0l.48.37c-.6.38-1.24.7-1.91.95l1.22 1.68a16.6 16.6 0 0 0 5.03-2.55c.4-4.28-.68-7.99-2.85-11.3ZM8.67 14.57c-1.1 0-2-1.02-2-2.28s.88-2.28 2-2.28c1.12 0 2.02 1.03 2 2.28 0 1.26-.88 2.28-2 2.28Zm6.66 0c-1.1 0-2-1.02-2-2.28s.88-2.28 2-2.28c1.12 0 2.02 1.03 2 2.28 0 1.26-.88 2.28-2 2.28Z"/>
    </svg>
  `,
  signal: `
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2a9.9 9.9 0 0 0-8.63 14.76L2.2 21.8l5.02-1.17A10 10 0 1 0 12 2Zm0 2a8 8 0 1 1-3.76 15.06l-.33-.18-2.96.69.69-2.96-.18-.33A8 8 0 0 1 12 4Zm0 2.2a5.8 5.8 0 0 0-5.8 5.8c0 1.1.31 2.13.84 3l-.34 1.47 1.46-.34A5.8 5.8 0 1 0 12 6.2Zm-2.52 4.35h5.04a.75.75 0 0 1 0 1.5H9.48a.75.75 0 0 1 0-1.5Zm0 2.45h3.25a.75.75 0 0 1 0 1.5H9.48a.75.75 0 0 1 0-1.5Z"/>
    </svg>
  `
};

const contacts = [
  {
    name: "discord",
    value: CONFIG.discordUsername,
    description: "copy my Discord username"
  },
  {
    name: "signal",
    value: CONFIG.signalUsername,
    description: "copy my Signal username"
  }
];

root.innerHTML = contacts.map((contact) => `
  <button class="contact-link copy-link" type="button" data-copy="${contact.value}">
    <span class="contact-icon-wrap">${icons[contact.name]}</span>
    <span class="contact-text">
      <span>${contact.name}</span>
      <small class="project-description">${contact.description}</small>
    </span>
    <small class="contact-url">${contact.value}</small>
  </button>
`).join("");

root.querySelectorAll("[data-copy]").forEach((button) => {
  button.addEventListener("click", async () => {
    const value = button.dataset.copy;

    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const input = document.createElement("input");
      input.value = value;
      document.body.append(input);
      input.select();
      document.execCommand("copy");
      input.remove();
    }

    const label = button.querySelector(".contact-url");
    const original = label.textContent;
    label.textContent = "copied";
    setTimeout(() => {
      label.textContent = original;
    }, 1200);
  });
});
