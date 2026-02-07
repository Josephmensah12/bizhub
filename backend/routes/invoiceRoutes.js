/**
 * Invoice Routes
 *
 * Sales invoice management with payments and inventory locking
 */

const express = require('express');
const router = express.Router();
const invoiceController = require('../controllers/invoiceController');
const returnController = require('../controllers/returnController');
const { authenticate, requireRole } = require('../middleware/auth');

// Public route: PDF download with token (no auth required - token validates access)
router.get('/:id/pdf/download', invoiceController.downloadPdf);

// All other routes require authentication
router.use(authenticate);

// GET /api/v1/invoices/available-assets - Get inventory available for invoicing
router.get('/available-assets', invoiceController.getAvailableAssets);

// GET /api/v1/invoices - List invoices with filters and metrics
router.get('/', invoiceController.list);

// POST /api/v1/invoices - Create new invoice (always UNPAID)
router.post('/', invoiceController.create);

// GET /api/v1/invoices/:id - Get single invoice with items and payments
router.get('/:id', invoiceController.getById);

// PATCH /api/v1/invoices/:id - Update invoice
router.patch('/:id', invoiceController.update);

// DELETE /api/v1/invoices/:id - Delete invoice (unpaid only)
router.delete('/:id', invoiceController.delete);

// POST /api/v1/invoices/:id/items - Add item to invoice
router.post('/:id/items', invoiceController.addItem);

// DELETE /api/v1/invoices/:id/items/:itemId - Remove item from invoice
router.delete('/:id/items/:itemId', invoiceController.removeItem);

// POST /api/v1/invoices/:id/payments - Receive payment (legacy endpoint)
router.post('/:id/payments', invoiceController.receivePayment);

// GET /api/v1/invoices/:id/payments - Get payment history (legacy endpoint)
router.get('/:id/payments', invoiceController.getPayments);

// Transaction endpoints (new unified system)
// GET /api/v1/invoices/:id/transactions - Get all transactions (payments + refunds)
router.get('/:id/transactions', invoiceController.getTransactions);

// POST /api/v1/invoices/:id/transactions - Create transaction (payment or refund)
router.post('/:id/transactions', invoiceController.createTransaction);

// POST /api/v1/invoices/:id/transactions/:txId/void - Void a transaction
router.post('/:id/transactions/:txId/void', invoiceController.voidTransaction);

// POST /api/v1/invoices/:id/cancel - Cancel invoice (restore inventory)
router.post('/:id/cancel', invoiceController.cancel);

// GET /api/v1/invoices/:id/pdf - Generate invoice PDF
router.get('/:id/pdf', invoiceController.generatePdf);

// GET /api/v1/invoices/:id/whatsapp-link - Get WhatsApp share link
router.get('/:id/whatsapp-link', invoiceController.getWhatsAppLink);

// Return endpoints
// GET /api/v1/invoices/:invoiceId/returnable-items - Get items that can be returned
router.get('/:invoiceId/returnable-items', returnController.getReturnableItems);

// GET /api/v1/invoices/:invoiceId/returns - Get all returns for invoice
router.get('/:invoiceId/returns', returnController.getInvoiceReturns);

// POST /api/v1/invoices/:invoiceId/returns - Create a new return
router.post('/:invoiceId/returns', returnController.createReturn);

module.exports = router;
