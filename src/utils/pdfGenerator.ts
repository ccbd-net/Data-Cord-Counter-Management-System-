import { jsPDF } from 'jspdf';
import type { Booking, Schedule, SystemSettings } from '../types/index.ts';

/**
 * Downloads high quality Bus Ticket PDF
 */
export function downloadTicketPDF(booking: Booking, settings?: SystemSettings) {
  const doc = new jsPDF({
    unit: 'mm',
    format: [80, 180], // 80mm thermal/slip receipt width
  });

  const company = settings?.companyName || 'Cloud Counter Management';
  const subTitle = settings?.subTitle || 'কাউন্টার বুকিং ও ট্রিপ ইনফরমেশন';
  const hotline = settings?.hotline || '';

  let y = 10;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(company, 40, y, { align: 'center' });

  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(subTitle, 40, y, { align: 'center' });

  if (hotline) {
    y += 4;
    doc.text(`Hotline: ${hotline}`, 40, y, { align: 'center' });
  }

  y += 4;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('*** PASSENGER TICKET COPY ***', 40, y, { align: 'center' });

  y += 3;
  doc.setLineWidth(0.3);
  doc.line(6, y, 74, y);

  // Ticket Meta
  y += 5;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('Ticket No:', 6, y);
  doc.setFont('helvetica', 'bold');
  doc.text(booking.ticketNo, 74, y, { align: 'right' });

  y += 4.5;
  doc.setFont('helvetica', 'normal');
  doc.text('Trip No:', 6, y);
  doc.text(booking.tripNo || '-', 74, y, { align: 'right' });

  y += 4.5;
  doc.text('Date:', 6, y);
  doc.text(booking.tripDate, 74, y, { align: 'right' });

  y += 4.5;
  doc.text('Departure Time:', 6, y);
  doc.setFont('helvetica', 'bold');
  doc.text(booking.tripTime, 74, y, { align: 'right' });

  y += 4.5;
  doc.setFont('helvetica', 'normal');
  doc.text('Bus Reg No:', 6, y);
  doc.setFont('helvetica', 'bold');
  doc.text(booking.vehicleRegNo, 74, y, { align: 'right' });

  y += 4.5;
  doc.setFont('helvetica', 'normal');
  doc.text('Route:', 6, y);
  doc.text(booking.routeName, 74, y, { align: 'right' });

  y += 3;
  doc.line(6, y, 74, y);

  // Passenger Details
  y += 5;
  doc.text('Passenger:', 6, y);
  doc.setFont('helvetica', 'bold');
  doc.text(booking.passengerName, 74, y, { align: 'right' });

  y += 4.5;
  doc.setFont('helvetica', 'normal');
  doc.text('Mobile Phone:', 6, y);
  doc.text(booking.passengerPhone || 'N/A', 74, y, { align: 'right' });

  y += 4.5;
  doc.text('Boarding Point:', 6, y);
  doc.text(booking.boardingPoint, 74, y, { align: 'right' });

  y += 4.5;
  doc.text('Destination:', 6, y);
  doc.text(booking.destination, 74, y, { align: 'right' });

  y += 3;
  doc.line(6, y, 74, y);

  // Seats & Fare
  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Seat(s):', 6, y);
  doc.text(booking.seatNumbers.join(', '), 74, y, { align: 'right' });

  y += 5;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(`Total Seats (${booking.totalSeats}):`, 6, y);
  doc.text(`Tk ${booking.farePerSeat} each`, 74, y, { align: 'right' });

  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('TOTAL PAID:', 6, y);
  doc.text(`Tk ${booking.totalFare}`, 74, y, { align: 'right' });

  y += 3;
  doc.setLineWidth(0.3);
  doc.line(6, y, 74, y);

  // Counter & Issue Info
  y += 4.5;
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.text(`Issued By Counter: ${booking.counterName} (${booking.counterCode})`, 40, y, { align: 'center' });

  y += 4;
  doc.text(`Operator: ${booking.bookedByUserName}`, 40, y, { align: 'center' });

  y += 4;
  doc.text(`Issue Time: ${new Date(booking.bookedAt).toLocaleString()}`, 40, y, { align: 'center' });

  y += 6;
  doc.setFontSize(6.5);
  doc.text('* Please arrive at boarding counter 15 mins prior to departure.', 40, y, { align: 'center' });
  y += 3.5;
  doc.text('* Keep ticket safely during travel. Have a safe journey!', 40, y, { align: 'center' });

  doc.save(`Ticket-${booking.ticketNo}.pdf`);
}

/**
 * Downloads Official Bus Trip Waybill / Passenger Manifest PDF
 */
export function downloadWaybillPDF(schedule: Schedule, bookings: Booking[], settings?: SystemSettings) {
  const doc = new jsPDF({
    unit: 'mm',
    format: 'a4',
    orientation: 'portrait',
  });

  const company = settings?.companyName || 'Cloud Counter Management';
  const subTitle = settings?.subTitle || 'কাউন্টার বুকিং ও ট্রিপ ইনফরমেশন';

  // Header Box
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(10, 10, 190, 22, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(company, 105, 18, { align: 'center' });

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`${subTitle} — TRIP WAYBILL & PASSENGER MANIFEST (ওয়েবিল)`, 105, 26, { align: 'center' });

  // Reset Text Color
  doc.setTextColor(15, 23, 42);

  // Trip Info Grid
  let y = 38;
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(10, y, 190, 26, 2, 2, 'FD');

  doc.setFontSize(8.5);
  // Column 1
  doc.setFont('helvetica', 'bold');
  doc.text('Trip No:', 14, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.text(schedule.tripNo || '-', 38, y + 6);

  doc.setFont('helvetica', 'bold');
  doc.text('Date & Time:', 14, y + 12);
  doc.setFont('helvetica', 'normal');
  doc.text(`${schedule.date} at ${schedule.departureTime}`, 38, y + 12);

  doc.setFont('helvetica', 'bold');
  doc.text('Route:', 14, y + 18);
  doc.setFont('helvetica', 'normal');
  doc.text(schedule.routeName, 38, y + 18);

  // Column 2
  doc.setFont('helvetica', 'bold');
  doc.text('Bus Reg No:', 105, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.text(schedule.vehicleRegNo, 135, y + 6);

  doc.setFont('helvetica', 'bold');
  doc.text('Owner Name:', 105, y + 12);
  doc.setFont('helvetica', 'normal');
  doc.text(schedule.vehicleOwnerName || 'N/A', 135, y + 12);

  doc.setFont('helvetica', 'bold');
  doc.text('Supervisor:', 105, y + 18);
  doc.setFont('helvetica', 'normal');
  doc.text(`${schedule.supervisor || 'N/A'} (${schedule.supervisorPhone || 'No Phone'})`, 135, y + 18);

  // Summary Badges
  y += 31;
  const totalBookedSeats = bookings.reduce((sum, b) => sum + (b.status === 'booked' ? b.seatNumbers.length : 0), 0);
  const totalRevenue = bookings.reduce((sum, b) => sum + (b.status === 'booked' ? b.totalFare : 0), 0);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(`Capacity: ${schedule.seatCapacity} Seats`, 14, y);
  doc.text(`Booked Seats: ${totalBookedSeats} / ${schedule.seatCapacity}`, 65, y);
  doc.text(`Available Seats: ${schedule.seatCapacity - totalBookedSeats}`, 120, y);
  doc.text(`Total Collection: Tk ${totalRevenue}`, 160, y);

  // Passenger Manifest Table Header
  y += 6;
  doc.setFillColor(30, 41, 59);
  doc.rect(10, y, 190, 7, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');

  doc.text('SL', 13, y + 5);
  doc.text('Seat(s)', 22, y + 5);
  doc.text('Ticket No', 42, y + 5);
  doc.text('Passenger Name', 70, y + 5);
  doc.text('Mobile Phone', 110, y + 5);
  doc.text('Boarding', 138, y + 5);
  doc.text('Counter', 168, y + 5);
  doc.text('Fare (Tk)', 188, y + 5, { align: 'right' });

  // Rows
  y += 7;
  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);

  let sl = 1;
  const activeBookings = bookings.filter((b) => b.status === 'booked');

  if (activeBookings.length === 0) {
    doc.text('No booked passengers recorded for this trip yet.', 105, y + 8, { align: 'center' });
    y += 16;
  } else {
    for (const b of activeBookings) {
      if (y > 260) {
        doc.addPage();
        y = 15;
      }

      // Alternating row background
      if (sl % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(10, y, 190, 6, 'F');
      }

      doc.text(String(sl), 13, y + 4.2);
      doc.setFont('helvetica', 'bold');
      doc.text(b.seatNumbers.join(','), 22, y + 4.2);
      doc.setFont('helvetica', 'normal');
      doc.text(b.ticketNo, 42, y + 4.2);
      doc.text(b.passengerName.slice(0, 20), 70, y + 4.2);
      doc.text(b.passengerPhone || 'N/A', 110, y + 4.2);
      doc.text(b.boardingPoint.slice(0, 15), 138, y + 4.2);
      doc.text(b.counterCode || b.counterName.slice(0, 8), 168, y + 4.2);
      doc.setFont('helvetica', 'bold');
      doc.text(String(b.totalFare), 188, y + 4.2, { align: 'right' });
      doc.setFont('helvetica', 'normal');

      y += 6;
      sl++;
    }
  }

  // Counter-wise Breakdown Box
  if (y > 235) {
    doc.addPage();
    y = 15;
  }

  y += 4;
  doc.setDrawColor(203, 213, 225);
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(10, y, 190, 20, 1, 1, 'FD');

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.text('Counter Collection Summary:', 14, y + 5);

  const counterTotals = new Map<string, { seats: number; amount: number }>();
  for (const b of activeBookings) {
    const key = b.counterName || 'Direct';
    if (!counterTotals.has(key)) counterTotals.set(key, { seats: 0, amount: 0 });
    const c = counterTotals.get(key)!;
    c.seats += b.seatNumbers.length;
    c.amount += b.totalFare;
  }

  let cx = 14;
  let cy = y + 10;
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');

  for (const [cName, data] of counterTotals.entries()) {
    doc.text(`* ${cName}: ${data.seats} Seats — Tk ${data.amount}`, cx, cy);
    cx += 60;
    if (cx > 140) {
      cx = 14;
      cy += 4.5;
    }
  }

  // Signatures Section
  y = Math.max(y + 28, 255);
  doc.setLineWidth(0.3);
  doc.setDrawColor(100, 116, 139);

  doc.line(16, y, 66, y);
  doc.line(78, y, 128, y);
  doc.line(140, y, 190, y);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('Supervisor Signature', 41, y + 4, { align: 'center' });
  doc.text('Driver Signature', 103, y + 4, { align: 'center' });
  doc.text('Counter In-charge / Auditor', 165, y + 4, { align: 'center' });

  doc.save(`Waybill-${schedule.tripNo || schedule.id}-${schedule.date}.pdf`);
}

/**
 * Downloads Daily Trip Schedule Summary PDF
 */
export function downloadDailyTripsPDF(schedules: Schedule[], date: string, settings?: SystemSettings) {
  const doc = new jsPDF({
    unit: 'mm',
    format: 'a4',
    orientation: 'landscape',
  });

  const company = settings?.companyName || 'Cloud Counter Management';

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(company, 148, 15, { align: 'center' });

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Daily Trips & Vehicle Schedule Report — Date: ${date}`, 148, 22, { align: 'center' });

  let y = 30;
  doc.setFillColor(30, 41, 59);
  doc.rect(10, y, 277, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');

  doc.text('Trip No', 14, y + 5.5);
  doc.text('Time', 38, y + 5.5);
  doc.text('Vehicle Reg', 62, y + 5.5);
  doc.text('Owner Name', 95, y + 5.5);
  doc.text('Route', 138, y + 5.5);
  doc.text('Supervisor', 188, y + 5.5);
  doc.text('Seats', 230, y + 5.5);
  doc.text('Fare', 250, y + 5.5);
  doc.text('Status', 270, y + 5.5);

  y += 8;
  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);

  let sl = 1;
  for (const s of schedules) {
    if (y > 185) {
      doc.addPage();
      y = 15;
    }

    if (sl % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(10, y, 277, 6.5, 'F');
    }

    doc.setFont('helvetica', 'bold');
    doc.text(s.tripNo, 14, y + 4.5);
    doc.setFont('helvetica', 'normal');
    doc.text(s.departureTime, 38, y + 4.5);
    doc.setFont('helvetica', 'bold');
    doc.text(s.vehicleRegNo, 62, y + 4.5);
    doc.setFont('helvetica', 'normal');
    doc.text((s.vehicleOwnerName || 'N/A').slice(0, 20), 95, y + 4.5);
    doc.text(s.routeName.slice(0, 28), 138, y + 4.5);
    doc.text((s.supervisor || 'N/A').slice(0, 18), 188, y + 4.5);
    doc.text(`${s.totalBookedSeats || 0} / ${s.seatCapacity}`, 230, y + 4.5);
    doc.text(`Tk ${s.fare}`, 250, y + 4.5);
    doc.text(s.status, 270, y + 4.5);

    y += 6.5;
    sl++;
  }

  doc.save(`DailyTrips-${date}.pdf`);
}
