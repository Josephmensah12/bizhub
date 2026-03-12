/**
 * Reconcile SalesBinder-migrated invoice items that have NULL asset_id.
 *
 * Phase A: Apply pre-configured description_asset_mappings (exact description match).
 * Phase B: Auto-match remaining items by comparing description against asset make/model.
 * Phase C: Apply changes (or show dry-run summary).
 *
 * Usage:
 *   node backend/scripts/reconcile-sb-invoices.js [--apply] [--verbose]
 *
 * Options:
 *   --apply    Actually write changes (default is dry-run)
 *   --verbose  Show detailed matching info
 */

const path = require('path');
const { sequelize, Asset, InvoiceItem, Invoice } = require(path.join(__dirname, '..', 'models'));
const { QueryTypes, Op } = require('sequelize');

// ── CLI flags ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const APPLY   = args.includes('--apply');
const VERBOSE = args.includes('--verbose');

// Descriptions to skip (generic / non-product line items)
const SKIP_DESCRIPTIONS = ['discount', 'shipping', 'tax', 'imported item', 'credit'];
const MIN_DESC_LENGTH = 5;
const MIN_MODEL_LENGTH = 6; // avoid false positives from short model names
// Model names that are common words — only match when combined with make
const MODEL_ONLY_BLACKLIST = ['screen', 'notebook', 'celeron', 'envy', 'laptop', 'desktop', 'tablet', 'monitor', 'charger', 'cable'];

// ── Helpers ─────────────────────────────────────────────────────────────────
function info(...a)  { console.log(`[INFO]`, ...a); }
function warn(...a)  { console.log(`[WARN]`, ...a); }
function verbose(...a) { if (VERBOSE) console.log(`  [DETAIL]`, ...a); }
function divider()   { console.log('─'.repeat(72)); }

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isGeneric(desc) {
  if (!desc || desc.length < MIN_DESC_LENGTH) return true;
  const lower = desc.toLowerCase().trim();
  return SKIP_DESCRIPTIONS.some(s => lower === s);
}

// ── Main ────────────────────────────────────────────────────────────────────
async function run() {
  console.log();
  divider();
  info(`Reconcile SalesBinder Invoice Items  [${APPLY ? 'APPLY' : 'DRY-RUN'}]`);
  divider();

  // ──────────────────────────────────────────────────────────────────────────
  // Gather unlinked items
  // ──────────────────────────────────────────────────────────────────────────
  const unlinkedRows = await sequelize.query(`
    SELECT ii.description, COUNT(*)::int AS cnt
    FROM invoice_items ii
    WHERE ii.asset_id IS NULL
      AND ii.voided_at IS NULL
    GROUP BY ii.description
    ORDER BY cnt DESC
  `, { type: QueryTypes.SELECT });

  const totalUnlinked = unlinkedRows.reduce((s, r) => s + r.cnt, 0);
  info(`Total unlinked invoice_items: ${totalUnlinked} (${unlinkedRows.length} distinct descriptions)`);

  if (totalUnlinked === 0) {
    info('Nothing to reconcile.');
    await sequelize.close();
    return;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Load assets
  // ──────────────────────────────────────────────────────────────────────────
  const assets = await sequelize.query(`
    SELECT id, make, model, category, asset_type
    FROM assets
    ORDER BY id
  `, { type: QueryTypes.SELECT });
  info(`Loaded ${assets.length} assets for matching`);

  // ──────────────────────────────────────────────────────────────────────────
  // Phase A – Pre-configured mappings
  // ──────────────────────────────────────────────────────────────────────────
  divider();
  info('Phase A: Checking description_asset_mappings table...');

  let existingMappings = [];
  try {
    existingMappings = await sequelize.query(`
      SELECT dam.description, dam.asset_id, a.make, a.model
      FROM description_asset_mappings dam
      JOIN assets a ON a.id = dam.asset_id
      WHERE dam.asset_id IS NOT NULL
    `, { type: QueryTypes.SELECT });
  } catch (err) {
    warn(`Could not read description_asset_mappings: ${err.message}`);
  }

  // Build lookup: description (lower) → asset_id
  const mappingLookup = new Map();
  for (const m of existingMappings) {
    mappingLookup.set(m.description.toLowerCase(), { asset_id: m.asset_id, make: m.make, model: m.model });
  }
  info(`Found ${existingMappings.length} pre-configured mappings`);

  // Track results:  description → { asset_id, make, model, count, source }
  const matches = new Map();
  const unmatched = [];

  // Apply Phase A matches
  for (const row of unlinkedRows) {
    const key = (row.description || '').toLowerCase();
    if (mappingLookup.has(key)) {
      const m = mappingLookup.get(key);
      matches.set(row.description, {
        asset_id: m.asset_id,
        make: m.make,
        model: m.model,
        count: row.cnt,
        source: 'mapping'
      });
      verbose(`Mapping match: "${row.description}" → ${m.make} ${m.model} (asset #${m.asset_id}) × ${row.cnt}`);
    }
  }

  const mappingMatchCount = [...matches.values()].reduce((s, m) => s + m.count, 0);
  info(`Phase A matched: ${mappingMatchCount} items (${matches.size} descriptions)`);

  // ──────────────────────────────────────────────────────────────────────────
  // Phase B – Auto-match by model name
  // ──────────────────────────────────────────────────────────────────────────
  divider();
  info('Phase B: Auto-matching by make/model...');

  // Pre-compute asset search strings
  const assetIndex = assets.map(a => ({
    id: a.id,
    make: a.make || '',
    model: a.model || '',
    makeModel: `${(a.make || '')} ${(a.model || '')}`.trim().toLowerCase(),
    modelLower: (a.model || '').toLowerCase()
  }));

  let autoMatchItems = 0;

  for (const row of unlinkedRows) {
    // Already matched in Phase A?
    if (matches.has(row.description)) continue;

    const desc = row.description || '';
    if (isGeneric(desc)) {
      unmatched.push(row);
      verbose(`Skipped (generic): "${desc}" × ${row.cnt}`);
      continue;
    }

    const descLower = desc.toLowerCase();

    // Try make+model first (more specific), then model-only
    // Use word-boundary matching to avoid partial matches like "screen" in "black screen"
    const makeModelHits = [];
    const modelOnlyHits = [];

    for (const a of assetIndex) {
      if (a.makeModel.length >= MIN_MODEL_LENGTH) {
        // For make+model, use word boundary regex
        const mmRegex = new RegExp(`\\b${escapeRegex(a.makeModel)}\\b`, 'i');
        if (mmRegex.test(desc)) {
          makeModelHits.push(a);
          continue;
        }
      }
      if (a.modelLower.length >= MIN_MODEL_LENGTH && !MODEL_ONLY_BLACKLIST.includes(a.modelLower)) {
        const mRegex = new RegExp(`\\b${escapeRegex(a.modelLower)}\\b`, 'i');
        if (mRegex.test(desc)) {
          modelOnlyHits.push(a);
        }
      }
    }

    let picked = null;

    if (makeModelHits.length === 1) {
      picked = { ...makeModelHits[0], specificity: 'make+model' };
    } else if (makeModelHits.length > 1) {
      // Multiple make+model matches — ambiguous, skip
      verbose(`Ambiguous make+model (${makeModelHits.length} hits): "${desc}"`);
    }

    if (!picked) {
      if (modelOnlyHits.length === 1) {
        picked = { ...modelOnlyHits[0], specificity: 'model-only' };
      } else if (modelOnlyHits.length > 1) {
        verbose(`Ambiguous model-only (${modelOnlyHits.length} hits): "${desc}"`);
      }
    }

    // Also consider: if make+model has multiple but we can narrow down...
    if (!picked && makeModelHits.length > 1) {
      // Not resolvable — leave unmatched
    }

    if (picked) {
      matches.set(desc, {
        asset_id: picked.id,
        make: picked.make,
        model: picked.model,
        count: row.cnt,
        source: `auto (${picked.specificity})`
      });
      autoMatchItems += row.cnt;
      verbose(`Auto-match: "${desc}" → ${picked.make} ${picked.model} (asset #${picked.id}) × ${row.cnt} [${picked.specificity}]`);
    } else {
      unmatched.push(row);
    }
  }

  info(`Phase B matched: ${autoMatchItems} items (${[...matches.values()].filter(m => m.source.startsWith('auto')).length} descriptions)`);

  // ──────────────────────────────────────────────────────────────────────────
  // Phase C – Apply or show dry-run
  // ──────────────────────────────────────────────────────────────────────────
  divider();

  if (matches.size === 0) {
    info('No matches found. Nothing to apply.');
  } else {
    // Print summary table
    info(`Matched descriptions (${matches.size}):`);
    console.log();
    console.log(
      '  ' +
      'Description'.padEnd(50) +
      'Asset'.padEnd(30) +
      'Items'.padStart(6) +
      '  Source'
    );
    console.log('  ' + '─'.repeat(96));

    for (const [desc, m] of matches) {
      const assetLabel = `${m.make} ${m.model}`.trim();
      console.log(
        '  ' +
        (desc.length > 48 ? desc.substring(0, 47) + '…' : desc).padEnd(50) +
        (assetLabel.length > 28 ? assetLabel.substring(0, 27) + '…' : assetLabel).padEnd(30) +
        String(m.count).padStart(6) +
        '  ' + m.source
      );
    }
    console.log();

    if (APPLY) {
      info('Applying changes in a transaction...');

      const t = await sequelize.transaction();
      try {
        let updatedTotal = 0;

        for (const [desc, m] of matches) {
          const [, rowCount] = await sequelize.query(`
            UPDATE invoice_items
            SET asset_id = :assetId, updated_at = NOW()
            WHERE description = :desc
              AND asset_id IS NULL
              AND voided_at IS NULL
          `, {
            replacements: { assetId: m.asset_id, desc },
            type: QueryTypes.UPDATE,
            transaction: t
          });
          updatedTotal += rowCount;
          verbose(`Updated ${rowCount} rows for "${desc}" → asset #${m.asset_id}`);

          // Save auto-matches to description_asset_mappings (upsert)
          if (m.source.startsWith('auto')) {
            try {
              await sequelize.query(`
                INSERT INTO description_asset_mappings (description, asset_id, match_type, confidence, created_at, updated_at)
                VALUES (:desc, :assetId, 'fuzzy', 0.8, NOW(), NOW())
                ON CONFLICT (description) DO UPDATE
                SET asset_id = EXCLUDED.asset_id,
                    match_type = 'fuzzy',
                    updated_at = NOW()
              `, {
                replacements: { desc, assetId: m.asset_id },
                type: QueryTypes.INSERT,
                transaction: t
              });
            } catch (mapErr) {
              warn(`Could not save mapping for "${desc}": ${mapErr.message}`);
            }
          }
        }

        await t.commit();
        info(`Transaction committed. Updated ${updatedTotal} invoice_items.`);
      } catch (err) {
        await t.rollback();
        console.error(`[ERROR] Transaction rolled back: ${err.message}`);
        throw err;
      }
    } else {
      info('Dry-run mode — no changes written. Use --apply to write.');
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Summary
  // ──────────────────────────────────────────────────────────────────────────
  divider();
  const matchedItemCount = [...matches.values()].reduce((s, m) => s + m.count, 0);
  const stillUnlinked = totalUnlinked - matchedItemCount;

  info('SUMMARY');
  info(`  Total unlinked items:        ${totalUnlinked}`);
  info(`  Matched by mapping (Phase A): ${mappingMatchCount}`);
  info(`  Matched by auto (Phase B):    ${autoMatchItems}`);
  info(`  Total matched:               ${matchedItemCount}`);
  info(`  Still unlinked:              ${stillUnlinked}`);

  if (unmatched.length > 0) {
    console.log();
    info('Top 20 unmatched descriptions:');
    const top = unmatched.slice(0, 20);
    for (const row of top) {
      console.log(`    ${String(row.cnt).padStart(5)}  ${row.description || '(NULL)'}`);
    }
    if (unmatched.length > 20) {
      info(`  ... and ${unmatched.length - 20} more`);
    }
  }

  divider();
  await sequelize.close();
}

run().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
