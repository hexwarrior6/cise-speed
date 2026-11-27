// Offline migration: stop backend writers and take a backup first.
const mongoose = require('mongoose');
async function migrateDoiIndexes(articles) {
  const rows = await articles.find({}, { projection: { doi:1, status:1 } }).toArray();
  const normalize = value => String(value || '').trim().replace(/^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)/i,'').toLowerCase();
  const seen = new Map();
  for (const row of rows) {
    const doi = normalize(row.doi);
    if (!/^10\.\d{4,}(?:\.\d+)*\/\S+$/.test(doi) || doi.length > 500) throw new Error('Invalid existing DOI at ' + row._id);
    if (row.status === 'Approved') {
      if (seen.has(doi)) throw new Error('Conflicting approved DOI: ' + doi + '; resolve manually before migration');
      seen.set(doi, row._id);
    }
  }
  // On an empty database the first createIndex also creates the collection.
  await articles.createIndex({doi:1}, {name:'approved_doi_unique', unique:true, partialFilterExpression:{status:'Approved'}});
  for (const index of await articles.indexes()) {
    if (index.unique && index.key.doi === 1 && Object.keys(index.key).length === 1 && !index.partialFilterExpression) await articles.dropIndex(index.name);
  }
  for (const row of rows) {
    const doi = normalize(row.doi);
    if (doi !== row.doi) await articles.updateOne({_id:row._id}, {$set:{doi}});
  }
  await articles.createIndex({doi:1}, {name:'doi_1'});
  await articles.createIndex({customId:1}, {unique:true, name:'customId_1'});
  return rows.length;
}
module.exports = { migrateDoiIndexes };
if (require.main === module) {
  require('dotenv').config();
  (async () => {
    if (!process.env.DB_URI) throw new Error('DB_URI is required');
    await mongoose.connect(process.env.DB_URI);
    console.log('DOI migration completed:', await migrateDoiIndexes(mongoose.connection.collection('articles')));
  })().catch(error => { console.error(error); process.exitCode=1; }).finally(() => mongoose.disconnect());
}
