import { Article } from "../types/article";
export const exportToCSV = (articles: Article[], filename = "search-results.csv"): void => {
  if (!articles.length) return;
  const fields: (keyof Article)[] = ["customId","title","authors","source","pubyear","doi","claim","evidence","status","averageRating","createdAt","updatedAt"];
  const headers = ["ID","Title","Authors","Source","Year","DOI","Claim","Evidence Type","Status","Average Rating","Created At","Updated At"];
  const escape = (value: unknown) => {
    let text = String(value ?? "");
    if (/^[\s]*[=+\-@\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  };
  const csv = [headers.join(","), ...articles.map(article => fields.map(field => escape(article[field])).join(","))].join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" }));
  const link = document.createElement("a");
  link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
};
