import { jsPDF } from 'jspdf';

interface Job {
  id: number;
  date: string;
  client_name: string;
  field_name: string;
  machine_hectares: number;
  total_amount: number;
  operator_commission_rate?: number;
}

interface OperatorGroup {
  operator_name: string;
  operator_number?: number;
  jobs: Job[];
  total_commission: number;
  total_amount: number;
  total_hectares: number;
}

interface Expense {
  id: number;
  date: string;
  description: string;
  category: string;
  amount: number;
}

interface FinancialYearData {
  year: {
    id: number;
    name: string;
    end_date: string;
    created_at: string;
  };
  operators: OperatorGroup[];
  expenses: Expense[];
  summary: {
    totalIncome: number;
    totalExpenses: number;
    totalCommissions: number;
    balance: number;
    totalJobs: number;
    totalHectares: number;
  };
}

// Helper to safely get string value
const safeString = (value: any): string => {
  if (value === null || value === undefined) return '';
  return String(value);
};

// Helper to center text
const centerText = (doc: jsPDF, text: string, y: number): number => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const textWidth = doc.getTextWidth(text);
  return (pageWidth - textWidth) / 2;
};

export function generateFinancialYearPDF(data: FinancialYearData): void {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  let y = 20;

  // Helper functions
  const addPage = () => {
    doc.addPage();
    y = 20;
    addHeader();
  };

  const addHeader = () => {
    doc.setFontSize(10);
    doc.setTextColor(128, 128, 128);
    doc.text(safeString(`Ejercicio: ${data.year.name}`), margin, 10);
    const generatedText = `Generado: ${new Date().toLocaleDateString('es-AR')}`;
    const generatedX = pageWidth - margin - doc.getTextWidth(generatedText);
    doc.text(safeString(generatedText), generatedX, 10);
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, 12, pageWidth - margin, 12);
  };

  const checkPageBreak = (requiredSpace: number) => {
    if (y + requiredSpace > pageHeight - margin) {
      addPage();
    }
  };

  const formatCurrency = (amount: number): string => {
    if (typeof amount !== 'number' || isNaN(amount)) return '$0.00';
    return '$' + amount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatDate = (dateStr: string): string => {
    if (!dateStr) return '-';
    try {
      return new Date(dateStr).toLocaleDateString('es-AR');
    } catch {
      return dateStr;
    }
  };

  // ===== PRIMERA HOJA: RESUMEN DEL EJERCICIO =====
  addHeader();

  // Title
  doc.setFontSize(20);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  let x = centerText(doc, 'RESUMEN DE EJERCICIO', y);
  doc.text('RESUMEN DE EJERCICIO', x, y);
  y += 15;

  // Exercise Info
  doc.setFontSize(14);
  const yearName = safeString(data.year.name);
  x = centerText(doc, yearName, y);
  doc.text(yearName, x, y);
  y += 8;
  
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  const cierreText = `Cierre: ${formatDate(data.year.end_date)}`;
  x = centerText(doc, cierreText, y);
  doc.text(cierreText, x, y);
  y += 20;

  // Summary Cards
  const cardWidth = (pageWidth - 2 * margin - 10) / 2;
  const cardHeight = 35;

  // Card 1: Ingresos Totales
  doc.setFillColor(240, 253, 244);
  doc.roundedRect(margin, y, cardWidth, cardHeight, 3, 3, 'F');
  doc.setDrawColor(200, 230, 200);
  doc.roundedRect(margin, y, cardWidth, cardHeight, 3, 3, 'S');
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text('INGRESOS TOTALES', margin + 5, y + 10);
  doc.setFontSize(14);
  doc.setTextColor(22, 163, 74);
  doc.setFont('helvetica', 'bold');
  doc.text(formatCurrency(data.summary.totalIncome), margin + 5, y + 25);

  // Card 2: Egresos Totales
  doc.setFillColor(254, 242, 242);
  doc.roundedRect(margin + cardWidth + 10, y, cardWidth, cardHeight, 3, 3, 'F');
  doc.setDrawColor(230, 200, 200);
  doc.roundedRect(margin + cardWidth + 10, y, cardWidth, cardHeight, 3, 3, 'S');
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.setFont('helvetica', 'normal');
  doc.text('EGRESOS TOTALES', margin + cardWidth + 15, y + 10);
  doc.setFontSize(14);
  doc.setTextColor(220, 38, 38);
  doc.setFont('helvetica', 'bold');
  const totalExpensesWithComm = data.summary.totalExpenses + data.summary.totalCommissions;
  doc.text(formatCurrency(totalExpensesWithComm), margin + cardWidth + 15, y + 25);

  y += cardHeight + 10;

  // Card 3: Balance
  const isPositive = data.summary.balance >= 0;
  if (isPositive) {
    doc.setFillColor(240, 253, 244);
  } else {
    doc.setFillColor(254, 242, 242);
  }
  doc.roundedRect(margin, y, cardWidth, cardHeight, 3, 3, 'F');
  if (isPositive) {
    doc.setDrawColor(200, 230, 200);
  } else {
    doc.setDrawColor(230, 200, 200);
  }
  doc.roundedRect(margin, y, cardWidth, cardHeight, 3, 3, 'S');
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.setFont('helvetica', 'normal');
  doc.text('BALANCE', margin + 5, y + 10);
  doc.setFontSize(14);
  if (isPositive) {
    doc.setTextColor(22, 163, 74);
  } else {
    doc.setTextColor(220, 38, 38);
  }
  doc.setFont('helvetica', 'bold');
  doc.text(formatCurrency(data.summary.balance), margin + 5, y + 25);

  // Card 4: Total Trabajos
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin + cardWidth + 10, y, cardWidth, cardHeight, 3, 3, 'F');
  doc.setDrawColor(200, 200, 210);
  doc.roundedRect(margin + cardWidth + 10, y, cardWidth, cardHeight, 3, 3, 'S');
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.setFont('helvetica', 'normal');
  doc.text('TOTAL TRABAJOS', margin + cardWidth + 15, y + 10);
  doc.setFontSize(14);
  doc.setTextColor(68, 64, 60);
  doc.setFont('helvetica', 'bold');
  doc.text(data.summary.totalJobs.toString(), margin + cardWidth + 15, y + 25);

  y += cardHeight + 15;

  // Additional Stats
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(230, 230, 230);
  doc.roundedRect(margin, y, pageWidth - 2 * margin, 50, 3, 3, 'FD');
  
  doc.setFontSize(11);
  doc.setTextColor(68, 64, 60);
  doc.setFont('helvetica', 'bold');
  doc.text('Estadísticas Adicionales', margin + 5, y + 12);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  
  const statsY = y + 25;
  const colWidth = (pageWidth - 2 * margin - 10) / 3;
  
  doc.text('Hectáreas Totales:', margin + 5, statsY);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(68, 64, 60);
  doc.text(`${data.summary.totalHectares} ha`, margin + 5, statsY + 8);
  
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text('Gastos Operativos:', margin + colWidth + 5, statsY);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(220, 38, 38);
  doc.text(formatCurrency(data.summary.totalExpenses), margin + colWidth + 5, statsY + 8);
  
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text('Comisiones:', margin + 2 * colWidth + 5, statsY);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(234, 88, 12);
  doc.text(formatCurrency(data.summary.totalCommissions), margin + 2 * colWidth + 5, statsY + 8);

  y += 60;

  // Operators Summary Table
  if (data.operators.length > 0) {
    checkPageBreak(40);
    doc.setFontSize(12);
    doc.setTextColor(68, 64, 60);
    doc.setFont('helvetica', 'bold');
    doc.text('Resumen por Operario', margin, y);
    y += 10;

    // Table Header
    doc.setFillColor(245, 245, 244);
    doc.rect(margin, y, pageWidth - 2 * margin, 8, 'F');
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.setFont('helvetica', 'bold');
    doc.text('Operario', margin + 2, y + 5.5);
    doc.text('Trabajos', margin + 70, y + 5.5);
    doc.text('Hectáreas', margin + 100, y + 5.5);
    const montoHeader = 'Monto';
    doc.text(montoHeader, margin + 155 - doc.getTextWidth(montoHeader), y + 5.5);
    const comisionHeader = 'Comisión';
    doc.text(comisionHeader, margin + 185 - doc.getTextWidth(comisionHeader), y + 5.5);
    y += 8;

    // Table Rows
    doc.setFont('helvetica', 'normal');
    data.operators.forEach((op, index) => {
      checkPageBreak(12);
      if (index % 2 === 0) {
        doc.setFillColor(250, 250, 250);
        doc.rect(margin, y, pageWidth - 2 * margin, 8, 'F');
      }
      doc.setTextColor(68, 64, 60);
      doc.text(safeString(op.operator_name), margin + 2, y + 5.5);
      doc.text(safeString(op.jobs.length.toString()), margin + 75, y + 5.5);
      doc.text(safeString(`${op.total_hectares} ha`), margin + 102, y + 5.5);
      const montoVal = formatCurrency(op.total_amount);
      doc.text(montoVal, margin + 155 - doc.getTextWidth(montoVal), y + 5.5);
      doc.setTextColor(22, 163, 74);
      const comVal = formatCurrency(op.total_commission);
      doc.text(comVal, margin + 185 - doc.getTextWidth(comVal), y + 5.5);
      y += 8;
    });
  }

  // ===== HOJAS SIGUIENTES: DETALLE DE TRABAJOS POR OPERARIO =====
  data.operators.forEach((op) => {
    addPage();

    // Operator Header
    doc.setFontSize(16);
    doc.setTextColor(68, 64, 60);
    doc.setFont('helvetica', 'bold');
    doc.text(safeString(op.operator_name), margin, y);
    y += 8;

    if (op.operator_number) {
      doc.setFontSize(10);
      doc.setTextColor(128, 128, 128);
      doc.setFont('helvetica', 'normal');
      doc.text(safeString(`Legajo: ${op.operator_number}`), margin, y);
      y += 5;
    }

    // Operator Summary Box
    y += 5;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(220, 220, 230);
    doc.roundedRect(margin, y, pageWidth - 2 * margin, 30, 3, 3, 'FD');
    
    const boxY = y + 10;
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text('TRABAJOS', margin + 10, boxY);
    doc.text('HECTÁREAS', margin + 50, boxY);
    doc.text('MONTO TOTAL', margin + 90, boxY);
    if (op.total_commission > 0) {
      doc.text('COMISIÓN', margin + 140, boxY);
    }
    
    doc.setFontSize(11);
    doc.setTextColor(68, 64, 60);
    doc.setFont('helvetica', 'bold');
    doc.text(op.jobs.length.toString(), margin + 10, boxY + 12);
    doc.text(`${op.total_hectares} ha`, margin + 50, boxY + 12);
    doc.text(formatCurrency(op.total_amount), margin + 90, boxY + 12);
    if (op.total_commission > 0) {
      doc.setTextColor(22, 163, 74);
      doc.text(formatCurrency(op.total_commission), margin + 140, boxY + 12);
    }
    
    y += 40;

    // Jobs Table Header
    doc.setFillColor(245, 245, 244);
    doc.rect(margin, y, pageWidth - 2 * margin, 8, 'F');
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.setFont('helvetica', 'bold');
    doc.text('Fecha', margin + 2, y + 5);
    doc.text('Cliente', margin + 30, y + 5);
    doc.text('Lote', margin + 85, y + 5);
    const haHeader = 'Ha.';
    doc.text(haHeader, margin + 125 - doc.getTextWidth(haHeader), y + 5);
    const montoJobHeader = 'Monto';
    doc.text(montoJobHeader, margin + 155 - doc.getTextWidth(montoJobHeader), y + 5);
    if (op.total_commission > 0) {
      const comJobHeader = 'Comisión';
      doc.text(comJobHeader, margin + 185 - doc.getTextWidth(comJobHeader), y + 5);
    }
    y += 8;

    // Jobs Table Rows
    doc.setFont('helvetica', 'normal');
    op.jobs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).forEach((job, index) => {
      checkPageBreak(10);
      
      if (index % 2 === 0) {
        doc.setFillColor(250, 250, 250);
        doc.rect(margin, y, pageWidth - 2 * margin, 8, 'F');
      }
      
      doc.setTextColor(100, 100, 100);
      doc.text(safeString(formatDate(job.date)), margin + 2, y + 5);
      
      doc.setTextColor(68, 64, 60);
      const clientNameRaw = safeString(job.client_name);
      const clientName = clientNameRaw.length > 25 ? clientNameRaw.substring(0, 25) + '...' : clientNameRaw;
      doc.text(clientName, margin + 30, y + 5);
      
      const fieldNameRaw = safeString(job.field_name);
      const fieldName = fieldNameRaw.length > 18 ? fieldNameRaw.substring(0, 18) + '...' : fieldNameRaw;
      doc.setTextColor(100, 100, 100);
      doc.text(fieldName, margin + 85, y + 5);
      
      const haVal = safeString(job.machine_hectares.toString());
      doc.text(haVal, margin + 125 - doc.getTextWidth(haVal), y + 5);
      const montoJobVal = formatCurrency(job.total_amount);
      doc.text(montoJobVal, margin + 155 - doc.getTextWidth(montoJobVal), y + 5);
      
      if (op.total_commission > 0) {
        const rate = (job.operator_commission_rate ?? 8) / 100;
        const commission = job.total_amount * rate;
        doc.setTextColor(22, 163, 74);
        const comJobVal = formatCurrency(commission);
        doc.text(comJobVal, margin + 185 - doc.getTextWidth(comJobVal), y + 5);
      }
      
      y += 8;
    });
  });

  // ===== HOJA FINAL: GASTOS =====
  if (data.expenses.length > 0) {
    addPage();

    doc.setFontSize(16);
    doc.setTextColor(68, 64, 60);
    doc.setFont('helvetica', 'bold');
    doc.text('GASTOS DEL EJERCICIO', margin, y);
    y += 15;

    // Expenses Table Header
    doc.setFillColor(245, 245, 244);
    doc.rect(margin, y, pageWidth - 2 * margin, 8, 'F');
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.setFont('helvetica', 'bold');
    doc.text('Fecha', margin + 2, y + 5.5);
    doc.text('Descripción', margin + 35, y + 5.5);
    doc.text('Categoría', margin + 110, y + 5.5);
    const montoExpHeader = 'Monto';
    doc.text(montoExpHeader, pageWidth - margin - 5 - doc.getTextWidth(montoExpHeader), y + 5.5);
    y += 8;

    // Expenses Table Rows
    doc.setFont('helvetica', 'normal');
    data.expenses.forEach((exp, index) => {
      checkPageBreak(10);
      
      if (index % 2 === 0) {
        doc.setFillColor(250, 250, 250);
        doc.rect(margin, y, pageWidth - 2 * margin, 8, 'F');
      }
      
      doc.setTextColor(100, 100, 100);
      doc.text(safeString(formatDate(exp.date)), margin + 2, y + 5.5);
      
      doc.setTextColor(68, 64, 60);
      const descRaw = safeString(exp.description);
      const desc = descRaw.length > 40 ? descRaw.substring(0, 40) + '...' : descRaw;
      doc.text(desc, margin + 35, y + 5.5);
      
      doc.setFontSize(7);
      doc.setTextColor(100, 100, 100);
      doc.text(safeString(exp.category), margin + 110, y + 5.5);
      doc.setFontSize(9);
      
      doc.setTextColor(220, 38, 38);
      const montoExpVal = formatCurrency(exp.amount);
      doc.text(montoExpVal, pageWidth - margin - 5 - doc.getTextWidth(montoExpVal), y + 5.5);
      
      y += 8;
    });

    // Commissions as expenses
    const operatorsWithCommissions = data.operators.filter(op => op.total_commission > 0);
    operatorsWithCommissions.forEach((op) => {
      checkPageBreak(10);
      
      doc.setFillColor(255, 247, 237);
      doc.rect(margin, y, pageWidth - 2 * margin, 8, 'F');
      
      doc.setTextColor(100, 100, 100);
      doc.text('-', margin + 2, y + 5.5);
      
      doc.setTextColor(68, 64, 60);
      doc.text(safeString(`Comisión Operario: ${op.operator_name}`), margin + 35, y + 5.5);
      
      doc.setFontSize(7);
      doc.setTextColor(234, 88, 12);
      doc.text('Comisiones', margin + 110, y + 5.5);
      doc.setFontSize(9);
      
      doc.setTextColor(220, 38, 38);
      const commExpVal = formatCurrency(op.total_commission);
      doc.text(commExpVal, pageWidth - margin - 5 - doc.getTextWidth(commExpVal), y + 5.5);
      
      y += 8;
    });

    // Total Expenses
    y += 10;
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, y, pageWidth - margin, y);
    y += 8;
    
    doc.setFontSize(11);
    doc.setTextColor(68, 64, 60);
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL EGRESOS:', margin + 100, y);
    doc.setTextColor(220, 38, 38);
    const totalEgrVal = formatCurrency(totalExpensesWithComm);
    doc.text(totalEgrVal, pageWidth - margin - 5 - doc.getTextWidth(totalEgrVal), y);
  }

  // Save PDF
  const fileName = `Ejercicio_${data.year.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
}
