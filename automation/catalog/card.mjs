// Pure catalog projection shared by build and server-side approval checks.
export function toCard({ meta }, basePath) {
  return { id: meta.id, title: meta.title, grade: meta.grade, unit: meta.unit, summary: meta.summary, concepts: meta.concepts, href: `${basePath}simulations/${meta.id}/${meta.entry}` };
}
