export function configureGuacDisplayElement(displayEl: HTMLElement, label: string) {
  displayEl.tabIndex = 0;
  displayEl.setAttribute("role", "application");
  displayEl.setAttribute("aria-label", label);
  displayEl.style.outline = "none";
  displayEl.style.touchAction = "none";
}
