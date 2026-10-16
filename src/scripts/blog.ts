export {};

const input = document.querySelector<HTMLInputElement>("#post-search")!;
const product = document.querySelector<HTMLSelectElement>("#post-product")!;
const provenance = document.querySelector<HTMLSelectElement>("#post-provenance")!;
const categories = [
  ...document.querySelectorAll<HTMLButtonElement>("[data-post-category]"),
];
const cards = [
  ...document.querySelectorAll<HTMLElement>("[data-post]"),
].map((element) => ({
  element,
  category: element.dataset.category!,
  products: JSON.parse(element.dataset.products!) as string[],
  provenances: JSON.parse(element.dataset.provenances!) as string[],
  text: element.dataset.search!,
}));
const count = document.querySelector<HTMLElement>("#post-count")!;
const empty = document.querySelector<HTMLElement>("#post-empty")!;
const reset = document.querySelector<HTMLButtonElement>("#post-reset")!;
let category = "";
function updateBlog(writeUrl = true) {
  const tokens = input.value
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  let visible = 0;
  for (const card of cards) {
    const matches =
      (!category || card.category === category) &&
      (!product.value || card.products.includes(product.value)) &&
      (!provenance.value || card.provenances.includes(provenance.value)) &&
      tokens.every((token) => card.text.includes(token));
    card.element.hidden = !matches;
    if (matches) visible++;
  }
  for (const button of categories) {
    const selected = button.dataset.postCategory === category;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-pressed", String(selected));
  }
  count.textContent = `${visible} of ${cards.length} research notes`;
  empty.hidden = visible !== 0;
  reset.hidden = !category && !product.value && !provenance.value && !input.value;
  if (writeUrl) {
    const query = new URLSearchParams();
    if (category) query.set("category", category);
    if (product.value) query.set("product", product.value);
    if (provenance.value) query.set("provenance", provenance.value);
    if (input.value.trim()) query.set("q", input.value.trim());
    history.replaceState(
      null,
      "",
      `${location.pathname}${query.size ? `?${query}` : ""}${location.hash}`,
    );
  }
}
function loadBlogQuery() {
  const query = new URLSearchParams(location.search);
  const requestedCategory = query.get("category") ?? "";
  category = categories.some(
    (button) => button.dataset.postCategory === requestedCategory,
  )
    ? requestedCategory
    : "";
  for (const [select, key] of [
    [product, "product"],
    [provenance, "provenance"],
  ] as const) {
    const value = query.get(key) ?? "";
    select.value = [...select.options].some((option) => option.value === value)
      ? value
      : "";
  }
  input.value = query.get("q") ?? "";
  updateBlog(false);
}
function clearBlog() {
  category = "";
  input.value = "";
  product.value = "";
  provenance.value = "";
  updateBlog();
}
input.addEventListener("input", () => updateBlog());
product.addEventListener("change", () => updateBlog());
provenance.addEventListener("change", () => updateBlog());
for (const button of categories)
  button.addEventListener("click", () => {
    category = button.dataset.postCategory!;
    updateBlog();
  });
reset.addEventListener("click", clearBlog);
document
  .querySelector("#post-empty-reset")
  ?.addEventListener("click", clearBlog);
window.addEventListener("popstate", loadBlogQuery);
loadBlogQuery();
