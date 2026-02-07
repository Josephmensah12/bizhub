'use strict';

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Invoice PDF Generation Service
 *
 * Generates professional branded PDF invoices
 */
class InvoicePdfService {
  constructor() {
    this.pdfDir = path.join(__dirname, '..', 'uploads', 'invoices');
    // Ensure directory exists
    if (!fs.existsSync(this.pdfDir)) {
      fs.mkdirSync(this.pdfDir, { recursive: true });
    }
  }

  /**
   * Format currency for display
   */
  formatCurrency(amount, currency = 'GHS') {
    if (amount === null || amount === undefined) return '—';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2
    }).format(amount);
  }

  /**
   * Format date for display
   */
  formatDate(dateString) {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  /**
   * Generate a unique token for PDF access
   */
  generateAccessToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Get status display text
   */
  getStatusDisplay(status) {
    const labels = {
      'UNPAID': 'Unpaid',
      'PARTIALLY_PAID': 'Partially Paid',
      'PAID': 'Paid',
      'CANCELLED': 'Cancelled'
    };
    return labels[status] || status;
  }

  /**
   * Generate Invoice PDF
   *
   * @param {Object} invoice - Invoice data with items, customer, payments
   * @param {Object} companyProfile - Company profile data
   * @param {string} existingToken - Optional existing token for regeneration
   * @returns {Promise<{filePath: string, fileName: string, accessToken: string}>}
   */
  async generatePdf(invoice, companyProfile, existingToken = null) {
    return new Promise((resolve, reject) => {
      try {
        const accessToken = existingToken || this.generateAccessToken();
        const fileName = `invoice-${invoice.invoice_number}-${accessToken.substring(0, 8)}.pdf`;
        const filePath = path.join(this.pdfDir, fileName);

        const doc = new PDFDocument({
          size: 'A4',
          margin: 50,
          info: {
            Title: `Invoice ${invoice.invoice_number}`,
            Author: companyProfile?.company_name || 'BizHub',
            Subject: 'Invoice',
            Creator: 'BizHub Invoice System'
          }
        });

        const writeStream = fs.createWriteStream(filePath);
        doc.pipe(writeStream);

        // Page dimensions
        const pageWidth = doc.page.width - 100; // 50 margin each side
        const leftCol = 50;
        const rightCol = doc.page.width - 250;

        let yPos = 50;

        // ============== HEADER ==============
        // Company Logo (left side)
        if (companyProfile?.logo_url && companyProfile.logo_storage_key) {
          const logoPath = path.join(__dirname, '..', 'uploads', 'logos', companyProfile.logo_storage_key);
          if (fs.existsSync(logoPath)) {
            try {
              doc.image(logoPath, leftCol, yPos, { width: 120 });
            } catch (err) {
              console.error('Error loading logo:', err.message);
            }
          }
        }

        // Company Info (right side)
        doc.fontSize(16).font('Helvetica-Bold');
        doc.text(companyProfile?.company_name || 'Company Name', rightCol, yPos, { width: 200, align: 'right' });

        yPos += 22;
        doc.fontSize(9).font('Helvetica').fillColor('#666666');

        if (companyProfile?.tagline) {
          doc.text(companyProfile.tagline, rightCol, yPos, { width: 200, align: 'right' });
          yPos += 12;
        }

        if (companyProfile?.address_line_1) {
          doc.text(companyProfile.address_line_1, rightCol, yPos, { width: 200, align: 'right' });
          yPos += 12;
        }

        if (companyProfile?.address_line_2) {
          doc.text(companyProfile.address_line_2, rightCol, yPos, { width: 200, align: 'right' });
          yPos += 12;
        }

        const cityLine = [companyProfile?.city, companyProfile?.region_state, companyProfile?.country].filter(Boolean).join(', ');
        if (cityLine) {
          doc.text(cityLine, rightCol, yPos, { width: 200, align: 'right' });
          yPos += 12;
        }

        if (companyProfile?.phone) {
          doc.text(`Tel: ${companyProfile.phone}`, rightCol, yPos, { width: 200, align: 'right' });
          yPos += 12;
        }

        if (companyProfile?.email) {
          doc.text(companyProfile.email, rightCol, yPos, { width: 200, align: 'right' });
          yPos += 12;
        }

        if (companyProfile?.website) {
          doc.text(companyProfile.website, rightCol, yPos, { width: 200, align: 'right' });
          yPos += 12;
        }

        if (companyProfile?.tax_id_or_tin) {
          doc.text(`TIN: ${companyProfile.tax_id_or_tin}`, rightCol, yPos, { width: 200, align: 'right' });
          yPos += 12;
        }

        // Reset position after header
        yPos = Math.max(yPos, 150);

        // ============== INVOICE TITLE ==============
        doc.fillColor('#000000');
        doc.moveTo(leftCol, yPos).lineTo(leftCol + pageWidth, yPos).stroke('#cccccc');
        yPos += 20;

        doc.fontSize(24).font('Helvetica-Bold').fillColor('#333333');
        doc.text('INVOICE', leftCol, yPos);

        // Status badge
        const statusColors = {
          'UNPAID': '#f59e0b',
          'PARTIALLY_PAID': '#3b82f6',
          'PAID': '#10b981',
          'CANCELLED': '#ef4444'
        };
        const statusColor = statusColors[invoice.status] || '#666666';
        const statusText = this.getStatusDisplay(invoice.status);

        doc.fontSize(10).font('Helvetica-Bold').fillColor(statusColor);
        doc.text(statusText.toUpperCase(), leftCol + 120, yPos + 8);

        yPos += 40;

        // ============== INVOICE DETAILS ==============
        // Left: Invoice info
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#333333');
        doc.text('Invoice Number:', leftCol, yPos);
        doc.font('Helvetica').text(invoice.invoice_number, leftCol + 100, yPos);

        yPos += 16;
        doc.font('Helvetica-Bold').text('Date:', leftCol, yPos);
        doc.font('Helvetica').text(this.formatDate(invoice.invoice_date), leftCol + 100, yPos);

        yPos += 16;
        doc.font('Helvetica-Bold').text('Currency:', leftCol, yPos);
        doc.font('Helvetica').text(invoice.currency, leftCol + 100, yPos);

        // Right: Customer info
        const custYStart = yPos - 32;
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#333333');
        doc.text('Bill To:', rightCol, custYStart);

        let custY = custYStart + 16;
        doc.font('Helvetica');

        if (invoice.customer) {
          const customerName = invoice.customer.displayName ||
            (invoice.customer.first_name && invoice.customer.last_name
              ? `${invoice.customer.first_name} ${invoice.customer.last_name}`
              : invoice.customer.company_name || 'Customer');

          doc.font('Helvetica-Bold').text(customerName, rightCol, custY, { width: 200 });
          custY += 14;
          doc.font('Helvetica');

          if (invoice.customer.company_name && invoice.customer.first_name) {
            doc.text(invoice.customer.company_name, rightCol, custY, { width: 200 });
            custY += 12;
          }

          if (invoice.customer.phone_e164) {
            doc.text(invoice.customer.phone_e164, rightCol, custY, { width: 200 });
            custY += 12;
          }

          if (invoice.customer.email) {
            doc.text(invoice.customer.email, rightCol, custY, { width: 200 });
            custY += 12;
          }

          if (invoice.customer.address) {
            doc.text(invoice.customer.address, rightCol, custY, { width: 200 });
            custY += 12;
          }
        } else {
          doc.text('—', rightCol, custY);
        }

        yPos = Math.max(yPos + 30, custY + 10);

        // ============== LINE ITEMS TABLE ==============
        doc.moveTo(leftCol, yPos).lineTo(leftCol + pageWidth, yPos).stroke('#cccccc');
        yPos += 10;

        // Table header
        const colWidths = {
          desc: 250,
          qty: 50,
          price: 90,
          total: 90
        };

        doc.fontSize(9).font('Helvetica-Bold').fillColor('#666666');
        doc.text('DESCRIPTION', leftCol, yPos);
        doc.text('QTY', leftCol + colWidths.desc, yPos, { width: colWidths.qty, align: 'center' });
        doc.text('UNIT PRICE', leftCol + colWidths.desc + colWidths.qty, yPos, { width: colWidths.price, align: 'right' });
        doc.text('TOTAL', leftCol + colWidths.desc + colWidths.qty + colWidths.price, yPos, { width: colWidths.total, align: 'right' });

        yPos += 16;
        doc.moveTo(leftCol, yPos).lineTo(leftCol + pageWidth, yPos).stroke('#eeeeee');
        yPos += 8;

        // Table rows
        doc.font('Helvetica').fillColor('#333333');

        const items = invoice.items || [];
        for (const item of items) {
          // Check if we need a new page
          if (yPos > doc.page.height - 200) {
            doc.addPage();
            yPos = 50;
          }

          // Description
          let desc = item.description || 'Item';
          if (item.asset) {
            const assetInfo = [];
            if (item.asset.make) assetInfo.push(item.asset.make);
            if (item.asset.model) assetInfo.push(item.asset.model);
            if (assetInfo.length > 0) desc = assetInfo.join(' ');

            // Add asset tag and serial on next line
            const subInfo = [];
            if (item.asset.asset_tag) subInfo.push(item.asset.asset_tag);
            if (item.asset.serial_number) subInfo.push(`S/N: ${item.asset.serial_number}`);

            doc.fontSize(10).text(desc, leftCol, yPos, { width: colWidths.desc - 10 });

            if (subInfo.length > 0) {
              yPos += 14;
              doc.fontSize(8).fillColor('#888888');
              doc.text(subInfo.join(' • '), leftCol, yPos, { width: colWidths.desc - 10 });
              doc.fillColor('#333333').fontSize(10);
            }
          } else {
            doc.fontSize(10).text(desc, leftCol, yPos, { width: colWidths.desc - 10 });
          }

          // Qty, Price, Total (at the same Y as first description line)
          const rowY = yPos - (item.asset && (item.asset.asset_tag || item.asset.serial_number) ? 14 : 0);
          doc.text(item.quantity?.toString() || '1', leftCol + colWidths.desc, rowY, { width: colWidths.qty, align: 'center' });
          doc.text(this.formatCurrency(item.unit_price_amount, invoice.currency), leftCol + colWidths.desc + colWidths.qty, rowY, { width: colWidths.price, align: 'right' });
          doc.text(this.formatCurrency(item.line_total_amount, invoice.currency), leftCol + colWidths.desc + colWidths.qty + colWidths.price, rowY, { width: colWidths.total, align: 'right' });

          yPos += 20;
          doc.moveTo(leftCol, yPos).lineTo(leftCol + pageWidth, yPos).stroke('#f5f5f5');
          yPos += 8;
        }

        // ============== TOTALS ==============
        yPos += 10;
        const totalsX = leftCol + colWidths.desc + colWidths.qty;
        const totalsWidth = colWidths.price + colWidths.total;

        // Subtotal
        doc.fontSize(10).font('Helvetica');
        doc.text('Subtotal:', totalsX, yPos, { width: colWidths.price, align: 'right' });
        doc.text(this.formatCurrency(invoice.total_amount, invoice.currency), totalsX + colWidths.price, yPos, { width: colWidths.total, align: 'right' });

        yPos += 18;

        // Amount Paid
        if (invoice.amount_paid > 0) {
          doc.fillColor('#10b981');
          doc.text('Amount Paid:', totalsX, yPos, { width: colWidths.price, align: 'right' });
          doc.text(`-${this.formatCurrency(invoice.amount_paid, invoice.currency)}`, totalsX + colWidths.price, yPos, { width: colWidths.total, align: 'right' });
          yPos += 18;
          doc.fillColor('#333333');
        }

        // Balance Due
        doc.font('Helvetica-Bold').fontSize(12);
        if (invoice.balance_due > 0) {
          doc.fillColor('#dc2626');
        }
        doc.text('Balance Due:', totalsX, yPos, { width: colWidths.price, align: 'right' });
        doc.text(this.formatCurrency(invoice.balance_due, invoice.currency), totalsX + colWidths.price, yPos, { width: colWidths.total, align: 'right' });
        doc.fillColor('#333333');

        // ============== PAYMENT HISTORY ==============
        if (invoice.payments && invoice.payments.length > 0) {
          yPos += 40;

          // Check if we need a new page
          if (yPos > doc.page.height - 150) {
            doc.addPage();
            yPos = 50;
          }

          doc.fontSize(12).font('Helvetica-Bold');
          doc.text('Payment History', leftCol, yPos);
          yPos += 20;

          doc.fontSize(9).font('Helvetica').fillColor('#666666');
          doc.text('DATE', leftCol, yPos);
          doc.text('METHOD', leftCol + 100, yPos);
          doc.text('AMOUNT', leftCol + 200, yPos, { width: 100, align: 'right' });

          yPos += 14;
          doc.moveTo(leftCol, yPos).lineTo(leftCol + 300, yPos).stroke('#eeeeee');
          yPos += 8;

          doc.fillColor('#333333');
          for (const payment of invoice.payments) {
            doc.text(this.formatDate(payment.payment_date), leftCol, yPos);

            const methodDisplay = payment.payment_method === 'Other' && payment.payment_method_other_text
              ? `Other – ${payment.payment_method_other_text}`
              : payment.payment_method || '—';
            doc.text(methodDisplay, leftCol + 100, yPos);

            doc.fillColor('#10b981');
            doc.text(this.formatCurrency(payment.amount, payment.currency), leftCol + 200, yPos, { width: 100, align: 'right' });
            doc.fillColor('#333333');

            yPos += 16;
          }
        }

        // ============== FOOTER ==============
        // Position footer at bottom of page
        const footerY = doc.page.height - 80;

        doc.moveTo(leftCol, footerY).lineTo(leftCol + pageWidth, footerY).stroke('#cccccc');

        if (companyProfile?.notes_footer) {
          doc.fontSize(9).font('Helvetica').fillColor('#666666');
          doc.text(companyProfile.notes_footer, leftCol, footerY + 15, {
            width: pageWidth,
            align: 'center'
          });
        }

        doc.fontSize(8).fillColor('#999999');
        doc.text(`Generated on ${new Date().toLocaleDateString('en-US')}`, leftCol, footerY + 40, {
          width: pageWidth,
          align: 'center'
        });

        // Finalize PDF
        doc.end();

        writeStream.on('finish', () => {
          resolve({
            filePath,
            fileName,
            accessToken
          });
        });

        writeStream.on('error', (err) => {
          reject(err);
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Get PDF file path by invoice and token
   */
  getPdfPath(invoiceNumber, token) {
    const files = fs.readdirSync(this.pdfDir);
    const matchingFile = files.find(f =>
      f.startsWith(`invoice-${invoiceNumber}-`) && f.includes(token.substring(0, 8))
    );

    if (matchingFile) {
      return path.join(this.pdfDir, matchingFile);
    }
    return null;
  }

  /**
   * Delete old PDFs for an invoice (cleanup)
   */
  cleanupOldPdfs(invoiceNumber) {
    try {
      const files = fs.readdirSync(this.pdfDir);
      const oldFiles = files.filter(f => f.startsWith(`invoice-${invoiceNumber}-`));

      for (const file of oldFiles) {
        fs.unlinkSync(path.join(this.pdfDir, file));
      }
    } catch (err) {
      console.error('Error cleaning up old PDFs:', err.message);
    }
  }
}

module.exports = new InvoicePdfService();
