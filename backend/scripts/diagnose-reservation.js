const { Asset, sequelize } = require('../models');
const { QueryTypes } = require('sequelize');

(async () => {
  try {
    const asset = await Asset.findOne({ where: { quantity: 1 }, order: [['id','DESC']] });
    if (!asset) { console.log('No qty=1 asset'); process.exit(); }
    console.log('Asset:', asset.id, asset.asset_tag, 'qty:', asset.quantity, 'status:', asset.status);

    const items = await sequelize.query(
      `SELECT ii.invoice_id, ii.quantity, i.status, i.invoice_number
       FROM invoice_items ii JOIN invoices i ON ii.invoice_id = i.id
       WHERE ii.asset_id = $1 AND i.status != 'CANCELLED' AND ii.voided_at IS NULL`,
      { bind: [asset.id], type: QueryTypes.SELECT }
    );
    console.log('Active items:', JSON.stringify(items));

    const [r] = await sequelize.query(
      `SELECT COALESCE(SUM(ii.quantity),0) as reserved
       FROM invoice_items ii JOIN invoices i ON ii.invoice_id=i.id
       WHERE ii.asset_id=$1 AND i.status!='CANCELLED' AND ii.voided_at IS NULL`,
      { bind: [asset.id], type: QueryTypes.SELECT }
    );
    console.log('Reserved (incl PAID):', r.reserved, 'Available:', asset.quantity - parseInt(r.reserved));

    const [p] = await sequelize.query(
      `SELECT COALESCE(SUM(ii.quantity),0) as pq
       FROM invoice_items ii JOIN invoices i ON ii.invoice_id=i.id
       WHERE ii.asset_id=$1 AND i.status='PAID' AND ii.voided_at IS NULL`,
      { bind: [asset.id], type: QueryTypes.SELECT }
    );
    const paidQty = parseInt(p.pq);
    const totalReserved = parseInt(r.reserved);
    console.log('PAID counted:', paidQty);
    console.log('Correct reserved (excl PAID):', totalReserved - paidQty);
    console.log('Correct available:', asset.quantity - (totalReserved - paidQty));

    console.log('\n--- BUG: PAID items double-counted ---');
    console.log('If PAID items exist, on_hand was already decremented by payment.');
    console.log('Counting them in reserved makes available = on_hand - reserved too low (or negative).');
    console.log('This can cause stale counter data to mislead availability checks.');
  } catch (e) {
    console.error('Error:', e.message, e.stack);
  }
  process.exit();
})();
