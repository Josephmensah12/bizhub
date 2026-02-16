/**
 * Quick Migration Status Check
 */

const GradualInventoryCompleter = require('./gradual-inventory-completion');

async function showStatus() {
  const completer = new GradualInventoryCompleter();
  const status = completer.getStatus();
  
  console.log('📊 Current Migration Status:');
  console.log(`   Items: ${status.extractedItems}/${status.totalItems} (${status.progress})`);
  console.log(`   Imported: ${status.importedItems} items`);  
  console.log(`   Pages: ${status.lastPageExtracted}/${status.totalPages}`);
  console.log(`   Remaining: ${status.remaining} items`);
  console.log(`   Errors: ${status.errors}`);
  
  // Estimate completion time
  const remaining = status.remaining;
  const batchesLeft = Math.ceil(remaining / 5);
  const hoursLeft = (batchesLeft * 0.5).toFixed(1); // 30 min per batch
  
  console.log(`\n⏱️  Estimated completion: ${hoursLeft} hours (${batchesLeft} batches)`);
  console.log(`💰 Remaining cost: ~$${(remaining * 0.01).toFixed(2)} USD`);
  
  if (remaining === 0) {
    console.log('🎉 MIGRATION COMPLETE! 🎉');
  }
}

showStatus().catch(console.error);