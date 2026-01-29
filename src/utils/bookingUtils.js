const QRCode = require("qrcode");
const { jsPDF } = require("jspdf");

async function generateQRCode(text) {
  return await QRCode.toDataURL(text);
}

function generatePDF(booking) {
  const doc = new jsPDF();

  doc.text("SPORT COURT BOOKING RECEIPT", 20, 20);
  doc.text(`Booking ID: ${booking.id}`, 20, 35);
  doc.text(`Court ID: ${booking.court_id}`, 20, 45);
  doc.text(`Date: ${booking.date}`, 20, 55);
  doc.text(`Time: ${booking.start_time} - ${booking.end_time}`, 20, 65);
  doc.text(`Total Price: ${booking.total_price} THB`, 20, 75);
  doc.text(`Status: ${booking.status}`, 20, 85);

  return doc.output("datauristring");
}

module.exports = {
  generateQRCode,
  generatePDF
};
