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
          margin: 40,
          info: {
            Title: `${invoice.status === 'PAID' ? 'Receipt' : 'Invoice'} ${invoice.invoice_number}`,
            Author: companyProfile?.company_name || 'BizHub',
            Subject: 'Invoice',
            Creator: 'BizHub Invoice System'
          }
        });

        const writeStream = fs.createWriteStream(filePath);
        doc.pipe(writeStream);

        // Page dimensions
        const pageWidth = doc.page.width - 80; // 40 margin each side
        const leftCol = 40;
        const rightCol = doc.page.width - 230;

        let yPos = 40;

        // ============== HEADER ==============
        // Company Logo (left side)
        let logoLoaded = false;
        if (companyProfile?.logo_url && companyProfile.logo_storage_key) {
          const logoDir = path.join(__dirname, '..', 'uploads', 'logos');
          const logoPath = path.join(logoDir, companyProfile.logo_storage_key);
          if (!fs.existsSync(logoPath) && companyProfile.logo_data) {
            if (!fs.existsSync(logoDir)) fs.mkdirSync(logoDir, { recursive: true });
            fs.writeFileSync(logoPath, Buffer.from(companyProfile.logo_data, 'base64'));
          }
          if (fs.existsSync(logoPath)) {
            try {
              doc.image(logoPath, leftCol, yPos, { width: 90 });
              logoLoaded = true;
            } catch (err) {
              console.error('Error loading logo:', err.message);
            }
          }
        }
        if (!logoLoaded) {
          const fallbackLogo = path.join(__dirname, '..', 'assets', 'company-logo.jpeg');
          if (fs.existsSync(fallbackLogo)) {
            try {
              doc.image(fallbackLogo, leftCol, yPos, { width: 90 });
            } catch (err) {
              console.error('Error loading fallback logo:', err.message);
            }
          }
        }

        // Company Info (right side)
        doc.fontSize(13).font('Helvetica-Bold');
        doc.text(companyProfile?.company_name || 'Company Name', rightCol, yPos, { width: 200, align: 'right' });

        yPos += 18;
        doc.fontSize(8).font('Helvetica').fillColor('#666666');

        const companyLines = [];
        if (companyProfile?.tagline) companyLines.push(companyProfile.tagline);
        if (companyProfile?.address_line_1) companyLines.push(companyProfile.address_line_1);
        if (companyProfile?.address_line_2) companyLines.push(companyProfile.address_line_2);
        const cityLine = [companyProfile?.city, companyProfile?.region_state, companyProfile?.country].filter(Boolean).join(', ');
        if (cityLine) companyLines.push(cityLine);
        if (companyProfile?.phone) companyLines.push(`Tel: ${companyProfile.phone}`);
        if (companyProfile?.email) companyLines.push(companyProfile.email);
        if (companyProfile?.website) companyLines.push(companyProfile.website);
        if (companyProfile?.tax_id_or_tin) companyLines.push(`TIN: ${companyProfile.tax_id_or_tin}`);

        for (const line of companyLines) {
          doc.text(line, rightCol, yPos, { width: 200, align: 'right' });
          yPos += 11;
        }

        yPos = Math.max(yPos, 120);

        // ============== INVOICE TITLE ==============
        doc.fillColor('#000000');
        doc.moveTo(leftCol, yPos).lineTo(leftCol + pageWidth, yPos).stroke('#cccccc');
        yPos += 12;

        const docTitle = invoice.status === 'PAID' ? 'RECEIPT' : 'INVOICE';
        doc.fontSize(18).font('Helvetica-Bold').fillColor('#333333');
        doc.text(docTitle, leftCol, yPos);

        // Status badge
        const statusColors = {
          'UNPAID': '#f59e0b',
          'PARTIALLY_PAID': '#3b82f6',
          'PAID': '#10b981',
          'CANCELLED': '#ef4444'
        };
        const statusColor = statusColors[invoice.status] || '#666666';
        const statusText = this.getStatusDisplay(invoice.status);

        doc.fontSize(9).font('Helvetica-Bold').fillColor(statusColor);
        doc.text(statusText.toUpperCase(), leftCol + 95, yPos + 5);

        yPos += 28;

        // ============== INVOICE DETAILS ==============
        const detailsYStart = yPos;
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#333333');
        doc.text('Invoice Number:', leftCol, yPos);
        doc.font('Helvetica').text(invoice.invoice_number, leftCol + 90, yPos);

        yPos += 13;
        doc.font('Helvetica-Bold').text('Date:', leftCol, yPos);
        doc.font('Helvetica').text(this.formatDate(invoice.invoice_date), leftCol + 90, yPos);

        yPos += 13;
        doc.font('Helvetica-Bold').text('Currency:', leftCol, yPos);
        doc.font('Helvetica').text(invoice.currency, leftCol + 90, yPos);

        // Right: Customer info
        let custY = detailsYStart;
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#333333');
        doc.text('Bill To:', rightCol, custY);
        custY += 13;
        doc.font('Helvetica');

        if (invoice.customer) {
          const customerName = invoice.customer.displayName ||
            (invoice.customer.first_name && invoice.customer.last_name
              ? `${invoice.customer.first_name} ${invoice.customer.last_name}`
              : invoice.customer.company_name || 'Customer');

          doc.font('Helvetica-Bold').text(customerName, rightCol, custY, { width: 200 });
          custY += 12;
          doc.font('Helvetica');

          if (invoice.customer.company_name && invoice.customer.first_name) {
            doc.text(invoice.customer.company_name, rightCol, custY, { width: 200 });
            custY += 11;
          }
          if (invoice.customer.phone_e164) {
            doc.text(invoice.customer.phone_e164, rightCol, custY, { width: 200 });
            custY += 11;
          }
          if (invoice.customer.email) {
            doc.text(invoice.customer.email, rightCol, custY, { width: 200 });
            custY += 11;
          }
          if (invoice.customer.address) {
            doc.text(invoice.customer.address, rightCol, custY, { width: 200 });
            custY += 11;
          }
        } else {
          doc.text('—', rightCol, custY);
        }

        yPos = Math.max(yPos + 20, custY + 8);

        // ============== LINE ITEMS TABLE ==============
        doc.moveTo(leftCol, yPos).lineTo(leftCol + pageWidth, yPos).stroke('#cccccc');
        yPos += 8;

        // Table header
        const colWidths = {
          desc: 260,
          qty: 45,
          price: 95,
          total: pageWidth - 260 - 45 - 95
        };

        doc.fontSize(8).font('Helvetica-Bold').fillColor('#666666');
        doc.text('DESCRIPTION', leftCol, yPos);
        doc.text('QTY', leftCol + colWidths.desc, yPos, { width: colWidths.qty, align: 'center' });
        doc.text('UNIT PRICE', leftCol + colWidths.desc + colWidths.qty, yPos, { width: colWidths.price, align: 'right' });
        doc.text('TOTAL', leftCol + colWidths.desc + colWidths.qty + colWidths.price, yPos, { width: colWidths.total, align: 'right' });

        yPos += 13;
        doc.moveTo(leftCol, yPos).lineTo(leftCol + pageWidth, yPos).stroke('#eeeeee');
        yPos += 5;

        // Table rows
        doc.font('Helvetica').fillColor('#333333');

        const items = (invoice.items || []).filter(item => !item.voided_at);
        for (const item of items) {
          if (yPos > doc.page.height - 100) {
            doc.addPage();
            yPos = 40;
          }

          const rowY = yPos;
          let desc = item.description || 'Item';
          if (item.asset) {
            const assetInfo = [];
            if (item.asset.make) assetInfo.push(item.asset.make);
            if (item.asset.model) assetInfo.push(item.asset.model);
            if (assetInfo.length > 0) desc = assetInfo.join(' ');

            const subInfo = [];
            if (item.asset.asset_tag) subInfo.push(item.asset.asset_tag);
            if (item.asset.serial_number) subInfo.push(`S/N: ${item.asset.serial_number}`);

            doc.fontSize(9).text(desc, leftCol, yPos, { width: colWidths.desc - 10 });

            if (subInfo.length > 0) {
              yPos += 11;
              doc.fontSize(7).fillColor('#888888');
              doc.text(subInfo.join(' · '), leftCol, yPos, { width: colWidths.desc - 10 });
              doc.fillColor('#333333').fontSize(9);
            }
          } else {
            doc.fontSize(9).text(desc, leftCol, yPos, { width: colWidths.desc - 10 });
          }

          doc.fontSize(9);
          doc.text(item.quantity?.toString() || '1', leftCol + colWidths.desc, rowY, { width: colWidths.qty, align: 'center' });
          doc.text(this.formatCurrency(item.unit_price_amount, invoice.currency), leftCol + colWidths.desc + colWidths.qty, rowY, { width: colWidths.price, align: 'right' });
          doc.text(this.formatCurrency(item.line_total_amount, invoice.currency), leftCol + colWidths.desc + colWidths.qty + colWidths.price, rowY, { width: colWidths.total, align: 'right' });

          yPos += 14;
          doc.moveTo(leftCol, yPos).lineTo(leftCol + pageWidth, yPos).stroke('#f5f5f5');
          yPos += 5;
        }

        // ============== TOTALS ==============
        yPos += 6;
        const totalsX = leftCol + colWidths.desc + colWidths.qty;

        doc.fontSize(9).font('Helvetica');
        doc.text('Subtotal:', totalsX, yPos, { width: colWidths.price, align: 'right' });
        doc.text(this.formatCurrency(invoice.total_amount, invoice.currency), totalsX + colWidths.price, yPos, { width: colWidths.total, align: 'right' });

        yPos += 14;

        if (invoice.amount_paid > 0) {
          doc.fillColor('#10b981');
          doc.text('Amount Paid:', totalsX, yPos, { width: colWidths.price, align: 'right' });
          doc.text(`-${this.formatCurrency(invoice.amount_paid, invoice.currency)}`, totalsX + colWidths.price, yPos, { width: colWidths.total, align: 'right' });
          yPos += 14;
          doc.fillColor('#333333');
        }

        doc.font('Helvetica-Bold').fontSize(10);
        if (invoice.balance_due > 0) {
          doc.fillColor('#dc2626');
        }
        doc.text('Balance Due:', totalsX, yPos, { width: colWidths.price, align: 'right' });
        doc.text(this.formatCurrency(invoice.balance_due, invoice.currency), totalsX + colWidths.price, yPos, { width: colWidths.total, align: 'right' });
        doc.fillColor('#333333');

        // ============== PAYMENT HISTORY ==============
        if (invoice.payments && invoice.payments.length > 0) {
          yPos += 24;

          if (yPos > doc.page.height - 80) {
            doc.addPage();
            yPos = 40;
          }

          doc.fontSize(10).font('Helvetica-Bold');
          doc.text('Payment History', leftCol, yPos);
          yPos += 15;

          doc.fontSize(8).font('Helvetica').fillColor('#666666');
          doc.text('DATE', leftCol, yPos);
          doc.text('METHOD', leftCol + 100, yPos);
          doc.text('AMOUNT', leftCol + 200, yPos, { width: 100, align: 'right' });

          yPos += 12;
          doc.moveTo(leftCol, yPos).lineTo(leftCol + 300, yPos).stroke('#eeeeee');
          yPos += 5;

          doc.fillColor('#333333');
          for (const payment of invoice.payments) {
            doc.fontSize(8);
            doc.text(this.formatDate(payment.payment_date), leftCol, yPos);

            const methodDisplay = payment.payment_method === 'Other' && payment.payment_method_other_text
              ? `Other – ${payment.payment_method_other_text}`
              : payment.payment_method || '—';
            doc.text(methodDisplay, leftCol + 100, yPos);

            doc.fillColor('#10b981');
            doc.text(this.formatCurrency(payment.amount, payment.currency), leftCol + 200, yPos, { width: 100, align: 'right' });
            doc.fillColor('#333333');

            yPos += 13;
          }
        }

        // ============== FOOTER ==============
        yPos += 20;
        if (yPos < doc.page.height - 60) {
          // Footer on same page
          doc.moveTo(leftCol, yPos).lineTo(leftCol + pageWidth, yPos).stroke('#cccccc');

          if (companyProfile?.notes_footer) {
            doc.fontSize(8).font('Helvetica').fillColor('#666666');
            doc.text(companyProfile.notes_footer, leftCol, yPos + 10, { width: pageWidth, align: 'center' });
          }

          doc.fontSize(7).fillColor('#999999');
          doc.text(`Generated on ${new Date().toLocaleDateString('en-US')}`, leftCol, yPos + 28, { width: pageWidth, align: 'center' });
        } else {
          // Footer at bottom of last page
          const footerY = doc.page.height - 55;
          doc.moveTo(leftCol, footerY).lineTo(leftCol + pageWidth, footerY).stroke('#cccccc');

          if (companyProfile?.notes_footer) {
            doc.fontSize(8).font('Helvetica').fillColor('#666666');
            doc.text(companyProfile.notes_footer, leftCol, footerY + 10, { width: pageWidth, align: 'center' });
          }

          doc.fontSize(7).fillColor('#999999');
          doc.text(`Generated on ${new Date().toLocaleDateString('en-US')}`, leftCol, footerY + 28, { width: pageWidth, align: 'center' });
        }

        // PAID stamp watermark on all pages
        if (invoice.status === 'PAID') {
          const pages = doc.bufferedPageRange();
          for (let i = pages.start; i < pages.start + pages.count; i++) {
            doc.switchToPage(i);
            doc.save();
            const cx = doc.page.width / 2;
            const cy = doc.page.height / 2;
            doc.translate(cx, cy);
            doc.rotate(-35, { origin: [0, 0] });
            doc.fontSize(120).font('Helvetica-Bold').fillColor('#10b981').opacity(0.12);
            doc.text('PAID', -150, -50, { width: 300, align: 'center' });
            doc.restore();
          }
        }

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
