// Run with the backend stopped and a verified database backup.
const mongoose = require('mongoose');
require('dotenv').config();
async function main() {
  if (!process.env.DB_URI) throw new Error('DB_URI is required');
  await mongoose.connect(process.env.DB_URI);
  const articles = mongoose.connection.collection('articles');
  const rows = await articles.find({}, { projection: { doi:1, status:1 } }).toArray();
  const normalize = value => String(value || '').trim().replace(/^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)/i,'').toLowerCase();
  const seen = new Map();
  for (const row of rows) {
    const doi = normalize(row.doi);
    if (!/^10\.\d{4,}(?:\.\d+)*\/\S+$/.test(doi)) throw new Error('Invalid existing DOI at ' + row._id);
    if (row.status === 'Approved') {
      if (seen.has(doi)) throw new Error('Conflicting approved DOI: ' + doi + '; resolve manually before migration');
      seen.set(doi, row._id);
    }
  }
  // Install the replacement constraint before removing the old one.
  await articles.createIndex({doi:1}, {name:'approved_doi_unique', unique:true, partialFilterExpression:{status:'Approved'}});
  for (const index of await articles.indexes()) {
    if (index.unique && index.key.doi === 1 && Object.keys(index.key).length === 1 && !index.partialFilterExpression) await articles.dropIndex(index.name);
  }
  for (const row of rows) await articles.updateOne({_id:row._id}, {$set:{doi:normalize(row.doi)}});
  await articles.createIndex({doi:1}, {name:'doi_1'});
  console.log('DOI migration completed:', rows.length);
}
main().catch(error => { console.error(error); process.exitCode=1; }).finally(() => mongoose.disconnect());
