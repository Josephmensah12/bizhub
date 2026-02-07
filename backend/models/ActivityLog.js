'use strict';

const { Model } = require('sequelize');

/**
 * Activity Log Model
 *
 * Tracks important activities for audit trail and activity feed
 */

const ACTION_TYPES = {
  // Invoice actions
  INVOICE_CREATED: 'INVOICE_CREATED',
  INVOICE_UPDATED: 'INVOICE_UPDATED',
  INVOICE_CANCELLED: 'INVOICE_CANCELLED',
  INVOICE_ITEM_ADDED: 'INVOICE_ITEM_ADDED',
  INVOICE_ITEM_REMOVED: 'INVOICE_ITEM_REMOVED',

  // Transaction/Payment actions
  PAYMENT_RECEIVED: 'PAYMENT_RECEIVED',
  REFUND_RECORDED: 'REFUND_RECORDED',
  TRANSACTION_VOIDED: 'TRANSACTION_VOIDED',

  // Return actions
  RETURN_CREATED: 'RETURN_CREATED',
  RETURN_FINALIZED: 'RETURN_FINALIZED',
  RETURN_CANCELLED: 'RETURN_CANCELLED',

  // Store credit actions
  STORE_CREDIT_CREATED: 'STORE_CREDIT_CREATED',
  STORE_CREDIT_APPLIED: 'STORE_CREDIT_APPLIED',
  STORE_CREDIT_VOIDED: 'STORE_CREDIT_VOIDED',

  // Customer actions
  CUSTOMER_CREATED: 'CUSTOMER_CREATED',
  CUSTOMER_UPDATED: 'CUSTOMER_UPDATED',

  // Asset actions
  ASSET_CREATED: 'ASSET_CREATED',
  ASSET_RESERVED: 'ASSET_RESERVED',
  ASSET_SOLD: 'ASSET_SOLD',
  ASSET_RESTORED: 'ASSET_RESTORED'
};

const ENTITY_TYPES = {
  INVOICE: 'INVOICE',
  TRANSACTION: 'TRANSACTION',
  CUSTOMER: 'CUSTOMER',
  ASSET: 'ASSET',
  RETURN: 'RETURN',
  STORE_CREDIT: 'STORE_CREDIT'
};

module.exports = (sequelize, DataTypes) => {
  class ActivityLog extends Model {
    static associate(models) {
      ActivityLog.belongsTo(models.User, {
        foreignKey: 'actor_user_id',
        as: 'actor'
      });
    }

    /**
     * Create an activity log entry
     */
    static async log({
      actorUserId,
      actionType,
      entityType,
      entityId,
      summary,
      metadata = null
    }) {
      return await this.create({
        actor_user_id: actorUserId,
        action_type: actionType,
        entity_type: entityType,
        entity_id: String(entityId),
        summary,
        metadata
      });
    }

    /**
     * Log invoice created
     */
    static async logInvoiceCreated(invoice, userId) {
      return await this.log({
        actorUserId: userId,
        actionType: ACTION_TYPES.INVOICE_CREATED,
        entityType: ENTITY_TYPES.INVOICE,
        entityId: invoice.id,
        summary: `Invoice ${invoice.invoice_number} created`,
        metadata: {
          invoiceNumber: invoice.invoice_number,
          totalAmount: invoice.total_amount,
          currency: invoice.currency
        }
      });
    }

    /**
     * Log payment received
     */
    static async logPaymentReceived(transaction, invoice, userId) {
      return await this.log({
        actorUserId: userId,
        actionType: ACTION_TYPES.PAYMENT_RECEIVED,
        entityType: ENTITY_TYPES.TRANSACTION,
        entityId: transaction.id,
        summary: `Payment of ${transaction.currency} ${transaction.amount} received for invoice ${invoice.invoice_number}`,
        metadata: {
          transactionId: transaction.id,
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoice_number,
          amount: transaction.amount,
          currency: transaction.currency,
          paymentMethod: transaction.payment_method
        }
      });
    }

    /**
     * Log refund recorded
     */
    static async logRefundRecorded(transaction, invoice, userId) {
      return await this.log({
        actorUserId: userId,
        actionType: ACTION_TYPES.REFUND_RECORDED,
        entityType: ENTITY_TYPES.TRANSACTION,
        entityId: transaction.id,
        summary: `Refund of ${transaction.currency} ${transaction.amount} recorded for invoice ${invoice.invoice_number}`,
        metadata: {
          transactionId: transaction.id,
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoice_number,
          amount: transaction.amount,
          currency: transaction.currency,
          paymentMethod: transaction.payment_method
        }
      });
    }

    /**
     * Log transaction voided
     */
    static async logTransactionVoided(transaction, invoice, userId, reason) {
      const typeLabel = transaction.transaction_type === 'PAYMENT' ? 'Payment' : 'Refund';
      return await this.log({
        actorUserId: userId,
        actionType: ACTION_TYPES.TRANSACTION_VOIDED,
        entityType: ENTITY_TYPES.TRANSACTION,
        entityId: transaction.id,
        summary: `${typeLabel} of ${transaction.currency} ${transaction.amount} voided for invoice ${invoice.invoice_number}`,
        metadata: {
          transactionId: transaction.id,
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoice_number,
          amount: transaction.amount,
          currency: transaction.currency,
          transactionType: transaction.transaction_type,
          voidReason: reason
        }
      });
    }

    /**
     * Log invoice cancelled
     */
    static async logInvoiceCancelled(invoice, userId, reason) {
      return await this.log({
        actorUserId: userId,
        actionType: ACTION_TYPES.INVOICE_CANCELLED,
        entityType: ENTITY_TYPES.INVOICE,
        entityId: invoice.id,
        summary: `Invoice ${invoice.invoice_number} cancelled${reason ? `: ${reason}` : ''}`,
        metadata: {
          invoiceNumber: invoice.invoice_number,
          reason
        }
      });
    }

    /**
     * Log return created
     */
    static async logReturnCreated(invoiceReturn, invoice, userId) {
      const typeLabel = invoiceReturn.return_type === 'RETURN_REFUND' ? 'Return & Refund' : 'Exchange';
      return await this.log({
        actorUserId: userId,
        actionType: ACTION_TYPES.RETURN_CREATED,
        entityType: ENTITY_TYPES.RETURN,
        entityId: invoiceReturn.id,
        summary: `${typeLabel} initiated for invoice ${invoice.invoice_number} - ${invoiceReturn.currency} ${invoiceReturn.total_return_amount}`,
        metadata: {
          returnId: invoiceReturn.id,
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoice_number,
          returnType: invoiceReturn.return_type,
          totalAmount: invoiceReturn.total_return_amount,
          currency: invoiceReturn.currency
        }
      });
    }

    /**
     * Log return finalized
     */
    static async logReturnFinalized(invoiceReturn, invoice, userId) {
      const typeLabel = invoiceReturn.return_type === 'RETURN_REFUND' ? 'Return & Refund' : 'Exchange';
      return await this.log({
        actorUserId: userId,
        actionType: ACTION_TYPES.RETURN_FINALIZED,
        entityType: ENTITY_TYPES.RETURN,
        entityId: invoiceReturn.id,
        summary: `${typeLabel} finalized for invoice ${invoice.invoice_number} - ${invoiceReturn.currency} ${invoiceReturn.total_return_amount}`,
        metadata: {
          returnId: invoiceReturn.id,
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoice_number,
          returnType: invoiceReturn.return_type,
          totalAmount: invoiceReturn.total_return_amount,
          currency: invoiceReturn.currency
        }
      });
    }

    /**
     * Log store credit created
     */
    static async logStoreCreditCreated(credit, customer, userId) {
      return await this.log({
        actorUserId: userId,
        actionType: ACTION_TYPES.STORE_CREDIT_CREATED,
        entityType: ENTITY_TYPES.STORE_CREDIT,
        entityId: credit.id,
        summary: `Store credit of ${credit.currency} ${credit.original_amount} created for customer`,
        metadata: {
          creditId: credit.id,
          customerId: customer.id,
          customerName: customer.displayName || customer.company_name || `${customer.first_name} ${customer.last_name}`,
          amount: credit.original_amount,
          currency: credit.currency,
          sourceReturnId: credit.source_return_id
        }
      });
    }

    /**
     * Log store credit applied
     */
    static async logStoreCreditApplied(credit, invoice, amountApplied, userId) {
      return await this.log({
        actorUserId: userId,
        actionType: ACTION_TYPES.STORE_CREDIT_APPLIED,
        entityType: ENTITY_TYPES.STORE_CREDIT,
        entityId: credit.id,
        summary: `Store credit of ${credit.currency} ${amountApplied} applied to invoice ${invoice.invoice_number}`,
        metadata: {
          creditId: credit.id,
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoice_number,
          amountApplied: amountApplied,
          remainingCredit: credit.remaining_amount,
          currency: credit.currency
        }
      });
    }
  }

  ActivityLog.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    actor_user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    action_type: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    entity_type: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    entity_id: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    summary: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  }, {
    sequelize,
    modelName: 'ActivityLog',
    tableName: 'activity_logs',
    underscored: true,
    timestamps: false
  });

  // Static constants
  ActivityLog.ACTION_TYPES = ACTION_TYPES;
  ActivityLog.ENTITY_TYPES = ENTITY_TYPES;

  return ActivityLog;
};
