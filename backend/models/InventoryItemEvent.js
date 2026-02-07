'use strict';

const { Model } = require('sequelize');

const EVENT_TYPES = [
  'IMPORTED',
  'CREATED',
  'UPDATED',
  'ADDED_TO_INVOICE',
  'RESERVED',
  'SOLD',
  'PAYMENT_RECEIVED',
  'RETURN_INITIATED',
  'RETURN_FINALIZED',
  'REFUND_ISSUED',
  'EXCHANGE_CREDIT_CREATED',
  'CREDIT_APPLIED',
  'INVENTORY_RELEASED',
  'SOFT_DELETED',
  'RESTORED',
  'BULK_UPLOAD_REVERTED',
  'INVOICE_CANCELLED',
  'INVOICE_CANCELLED_INVENTORY_RELEASED'
];

const SOURCES = ['SYSTEM', 'USER', 'IMPORT', 'INVOICE', 'RETURN', 'PAYMENT'];

const EVENT_LABELS = {
  'IMPORTED': 'Imported',
  'CREATED': 'Created',
  'UPDATED': 'Updated',
  'ADDED_TO_INVOICE': 'Added to Invoice',
  'RESERVED': 'Reserved',
  'SOLD': 'Sold',
  'PAYMENT_RECEIVED': 'Payment Received',
  'RETURN_INITIATED': 'Return Initiated',
  'RETURN_FINALIZED': 'Return Finalized',
  'REFUND_ISSUED': 'Refund Issued',
  'EXCHANGE_CREDIT_CREATED': 'Exchange Credit Created',
  'CREDIT_APPLIED': 'Credit Applied',
  'INVENTORY_RELEASED': 'Inventory Released',
  'SOFT_DELETED': 'Deleted',
  'RESTORED': 'Restored',
  'BULK_UPLOAD_REVERTED': 'Import Reverted',
  'INVOICE_CANCELLED': 'Invoice Cancelled',
  'INVOICE_CANCELLED_INVENTORY_RELEASED': 'Released (Invoice Cancelled)'
};

module.exports = (sequelize, DataTypes) => {
  class InventoryItemEvent extends Model {
    static associate(models) {
      InventoryItemEvent.belongsTo(models.Asset, {
        foreignKey: 'inventory_item_id',
        as: 'inventoryItem'
      });

      InventoryItemEvent.belongsTo(models.User, {
        foreignKey: 'actor_user_id',
        as: 'actor'
      });
    }

    /**
     * Get display label for event type
     */
    getEventLabel() {
      return EVENT_LABELS[this.event_type] || this.event_type;
    }

    /**
     * Log an event for an inventory item
     */
    static async log({
      inventoryItemId,
      eventType,
      actorUserId = null,
      source = 'SYSTEM',
      referenceType = null,
      referenceId = null,
      summary = null,
      details = null
    }, dbTransaction = null) {
      const options = dbTransaction ? { transaction: dbTransaction } : {};

      return await this.create({
        inventory_item_id: inventoryItemId,
        event_type: eventType,
        actor_user_id: actorUserId,
        source,
        reference_type: referenceType,
        reference_id: referenceId ? String(referenceId) : null,
        summary,
        details_json: details
      }, options);
    }

    // Convenience methods for common events

    static async logCreated(asset, userId, dbTransaction = null) {
      return await this.log({
        inventoryItemId: asset.id,
        eventType: 'CREATED',
        actorUserId: userId,
        source: 'USER',
        summary: `Asset ${asset.asset_tag} created manually`,
        details: {
          assetTag: asset.asset_tag,
          category: asset.category,
          assetType: asset.asset_type,
          make: asset.make,
          model: asset.model,
          status: asset.status
        }
      }, dbTransaction);
    }

    static async logImported(asset, importBatchId, fileName, userId, dbTransaction = null) {
      return await this.log({
        inventoryItemId: asset.id,
        eventType: 'IMPORTED',
        actorUserId: userId,
        source: 'IMPORT',
        referenceType: 'import_batch',
        referenceId: importBatchId,
        summary: `Imported from ${fileName}`,
        details: {
          assetTag: asset.asset_tag,
          importBatchId,
          fileName,
          category: asset.category,
          assetType: asset.asset_type
        }
      }, dbTransaction);
    }

    static async logUpdated(asset, changedFields, beforeValues, afterValues, userId, dbTransaction = null) {
      const changedList = changedFields.join(', ');
      return await this.log({
        inventoryItemId: asset.id,
        eventType: 'UPDATED',
        actorUserId: userId,
        source: 'USER',
        summary: `Updated: ${changedList}`,
        details: {
          changedFields,
          before: beforeValues,
          after: afterValues
        }
      }, dbTransaction);
    }

    static async logAddedToInvoice(asset, invoice, userId, dbTransaction = null) {
      return await this.log({
        inventoryItemId: asset.id,
        eventType: 'ADDED_TO_INVOICE',
        actorUserId: userId,
        source: 'INVOICE',
        referenceType: 'invoice',
        referenceId: invoice.id,
        summary: `Added to invoice ${invoice.invoice_number}`,
        details: {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoice_number,
          previousStatus: asset._previousDataValues?.status || asset.status,
          newStatus: 'Processing'
        }
      }, dbTransaction);
    }

    static async logReserved(asset, invoice, userId, dbTransaction = null) {
      return await this.log({
        inventoryItemId: asset.id,
        eventType: 'RESERVED',
        actorUserId: userId,
        source: 'INVOICE',
        referenceType: 'invoice',
        referenceId: invoice.id,
        summary: `Processing for invoice ${invoice.invoice_number}`,
        details: {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoice_number,
          status: 'Processing'
        }
      }, dbTransaction);
    }

    static async logSold(asset, invoice, userId, dbTransaction = null) {
      return await this.log({
        inventoryItemId: asset.id,
        eventType: 'SOLD',
        actorUserId: userId,
        source: 'PAYMENT',
        referenceType: 'invoice',
        referenceId: invoice.id,
        summary: `Sold via invoice ${invoice.invoice_number}`,
        details: {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoice_number,
          status: 'Sold'
        }
      }, dbTransaction);
    }

    static async logPaymentReceived(asset, transaction, invoice, userId, dbTransaction = null) {
      return await this.log({
        inventoryItemId: asset.id,
        eventType: 'PAYMENT_RECEIVED',
        actorUserId: userId,
        source: 'PAYMENT',
        referenceType: 'payment',
        referenceId: transaction.id,
        summary: `Payment of ${transaction.currency} ${transaction.amount} received`,
        details: {
          transactionId: transaction.id,
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoice_number,
          amount: transaction.amount,
          currency: transaction.currency,
          paymentMethod: transaction.payment_method
        }
      }, dbTransaction);
    }

    static async logReturnInitiated(asset, invoiceReturn, userId, dbTransaction = null) {
      const typeLabel = invoiceReturn.return_type === 'EXCHANGE' ? 'Exchange' : 'Return & Refund';
      return await this.log({
        inventoryItemId: asset.id,
        eventType: 'RETURN_INITIATED',
        actorUserId: userId,
        source: 'RETURN',
        referenceType: 'return',
        referenceId: invoiceReturn.id,
        summary: `${typeLabel} initiated`,
        details: {
          returnId: invoiceReturn.id,
          returnType: invoiceReturn.return_type,
          reason: invoiceReturn.reason
        }
      }, dbTransaction);
    }

    static async logReturnFinalized(asset, invoiceReturn, returnItem, userId, dbTransaction = null) {
      const typeLabel = invoiceReturn.return_type === 'EXCHANGE' ? 'Exchange' : 'Return & Refund';
      return await this.log({
        inventoryItemId: asset.id,
        eventType: 'RETURN_FINALIZED',
        actorUserId: userId,
        source: 'RETURN',
        referenceType: 'return',
        referenceId: invoiceReturn.id,
        summary: `${typeLabel} finalized - item returned to stock`,
        details: {
          returnId: invoiceReturn.id,
          returnType: invoiceReturn.return_type,
          quantityReturned: returnItem.quantity_returned,
          restockCondition: returnItem.restock_condition,
          returnAmount: returnItem.line_return_amount
        }
      }, dbTransaction);
    }

    static async logInventoryReleased(asset, invoiceReturn, newStatus, userId, dbTransaction = null) {
      return await this.log({
        inventoryItemId: asset.id,
        eventType: 'INVENTORY_RELEASED',
        actorUserId: userId,
        source: 'SYSTEM',
        referenceType: 'return',
        referenceId: invoiceReturn.id,
        summary: `Released back to inventory (${newStatus})`,
        details: {
          returnId: invoiceReturn.id,
          newStatus
        }
      }, dbTransaction);
    }

    static async logRefundIssued(asset, transaction, invoiceReturn, userId, dbTransaction = null) {
      return await this.log({
        inventoryItemId: asset.id,
        eventType: 'REFUND_ISSUED',
        actorUserId: userId,
        source: 'PAYMENT',
        referenceType: 'payment',
        referenceId: transaction.id,
        summary: `Refund of ${transaction.currency} ${transaction.amount} issued`,
        details: {
          transactionId: transaction.id,
          returnId: invoiceReturn.id,
          amount: transaction.amount,
          currency: transaction.currency,
          paymentMethod: transaction.payment_method
        }
      }, dbTransaction);
    }

    static async logExchangeCreditCreated(asset, credit, invoiceReturn, userId, dbTransaction = null) {
      return await this.log({
        inventoryItemId: asset.id,
        eventType: 'EXCHANGE_CREDIT_CREATED',
        actorUserId: userId,
        source: 'RETURN',
        referenceType: 'return',
        referenceId: invoiceReturn.id,
        summary: `Store credit of ${credit.currency} ${credit.original_amount} created`,
        details: {
          returnId: invoiceReturn.id,
          creditId: credit.id,
          amount: credit.original_amount,
          currency: credit.currency
        }
      }, dbTransaction);
    }

    static async logSoftDeleted(asset, userId, dbTransaction = null) {
      return await this.log({
        inventoryItemId: asset.id,
        eventType: 'SOFT_DELETED',
        actorUserId: userId,
        source: 'USER',
        summary: 'Moved to recycle bin',
        details: {
          deletedAt: new Date().toISOString()
        }
      }, dbTransaction);
    }

    static async logRestored(asset, userId, dbTransaction = null) {
      return await this.log({
        inventoryItemId: asset.id,
        eventType: 'RESTORED',
        actorUserId: userId,
        source: 'USER',
        summary: 'Restored from recycle bin',
        details: {
          restoredAt: new Date().toISOString()
        }
      }, dbTransaction);
    }

    static async logBulkUploadReverted(asset, importBatchId, userId, dbTransaction = null) {
      return await this.log({
        inventoryItemId: asset.id,
        eventType: 'BULK_UPLOAD_REVERTED',
        actorUserId: userId,
        source: 'IMPORT',
        referenceType: 'import_batch',
        referenceId: importBatchId,
        summary: 'Import batch reverted',
        details: {
          importBatchId,
          revertedAt: new Date().toISOString()
        }
      }, dbTransaction);
    }

    static async logInvoiceCancelled(asset, invoice, cancellationReason, userId, dbTransaction = null) {
      return await this.log({
        inventoryItemId: asset.id,
        eventType: 'INVOICE_CANCELLED',
        actorUserId: userId,
        source: 'INVOICE',
        referenceType: 'invoice',
        referenceId: invoice.id,
        summary: `Invoice ${invoice.invoice_number} was cancelled`,
        details: {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoice_number,
          cancelledAt: new Date().toISOString(),
          reason: cancellationReason || null
        }
      }, dbTransaction);
    }

    static async logInvoiceCancelledInventoryReleased(asset, invoice, newStatus, userId, dbTransaction = null) {
      return await this.log({
        inventoryItemId: asset.id,
        eventType: 'INVOICE_CANCELLED_INVENTORY_RELEASED',
        actorUserId: userId,
        source: 'SYSTEM',
        referenceType: 'invoice',
        referenceId: invoice.id,
        summary: `Inventory released due to cancelled invoice ${invoice.invoice_number}`,
        details: {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoice_number,
          newStatus,
          releasedAt: new Date().toISOString()
        }
      }, dbTransaction);
    }
  }

  InventoryItemEvent.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    inventory_item_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'assets',
        key: 'id'
      }
    },
    event_type: {
      type: DataTypes.ENUM(...EVENT_TYPES),
      allowNull: false
    },
    occurred_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    actor_user_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    source: {
      type: DataTypes.ENUM(...SOURCES),
      allowNull: false,
      defaultValue: 'SYSTEM'
    },
    reference_type: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    reference_id: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    summary: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    details_json: {
      type: DataTypes.JSONB,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'InventoryItemEvent',
    tableName: 'inventory_item_events',
    underscored: true,
    timestamps: false
  });

  // Static constants
  InventoryItemEvent.EVENT_TYPES = EVENT_TYPES;
  InventoryItemEvent.SOURCES = SOURCES;
  InventoryItemEvent.EVENT_LABELS = EVENT_LABELS;

  return InventoryItemEvent;
};
