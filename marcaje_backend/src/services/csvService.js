const { format } = require('fast-csv');
const dayjs = require('dayjs');
const db = require('../db');

const fmtDate = (d) => d ? dayjs(d).format('DD/MM/YYYY') : '';
const fmtTime = (d) => d ? dayjs(d).format('HH:mm:ss') : '';
const fmtDateTime = (d) => d ? dayjs(d).format('DD/MM/YYYY HH:mm:ss') : '';

const metodosLabel = { qr: 'Código QR', pin: 'PIN', biometrico: 'Biométrico' };
const tipoLabel    = { entrada: 'Entrada', salida: 'Salida' };

function streamCSV(res, filename, rows) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.write('\uFEFF');

  const csvStream = format({ headers: true, delimiter: ',' });
  csvStream.pipe(res);
  rows.forEach(row => csvStream.write(row));
  csvStream.end();
}

async function reporteDia(res, fecha) {
  const dia = fecha || dayjs().format('YYYY-MM-DD');
  const [rows] = await db.query(`
    SELECT
      e.id,
      CONCAT(e.nombre, ' ', e.apellido) AS empleado,
      e.cargo, e.departamento,
      MAX(CASE WHEN m.tipo = 'entrada' THEN m.timestamp END) AS entrada,
      MAX(CASE WHEN m.tipo = 'salida'  THEN m.timestamp END) AS salida,
      MAX(CASE WHEN m.tipo = 'entrada' THEN m.metodo END)    AS metodo_entrada,
      TIMESTAMPDIFF(MINUTE,
        MAX(CASE WHEN m.tipo = 'entrada' THEN m.timestamp END),
        MAX(CASE WHEN m.tipo = 'salida'  THEN m.timestamp END)
      ) AS minutos_trabajados
    FROM empleados e
    LEFT JOIN marcajes m ON m.empleado_id = e.id AND DATE(m.timestamp) = ?
    WHERE e.activo = TRUE
    GROUP BY e.id
    ORDER BY e.departamento, e.apellido
  `, [dia]);

  const csvRows = rows.map(r => ({
    'ID': r.id,
    'Empleado': r.empleado,
    'Cargo': r.cargo || '',
    'Departamento': r.departamento || '',
    'Fecha': fmtDate(dia),
    'Entrada': fmtTime(r.entrada),
    'Salida': fmtTime(r.salida),
    'Método': metodosLabel[r.metodo_entrada] || '',
    'Horas trabajadas': r.minutos_trabajados
      ? `${Math.floor(r.minutos_trabajados / 60)}h ${r.minutos_trabajados % 60}m` : '',
    'Estado': !r.entrada ? 'Ausente' : !r.salida ? 'Presente' : 'Completado',
  }));

  streamCSV(res, `asistencia_${dia}.csv`, csvRows);
}

async function reporteRango(res, fechaInicio, fechaFin) {
  const [rows] = await db.query(`
    SELECT DATE(m.timestamp) AS fecha,
      CONCAT(e.nombre, ' ', e.apellido) AS empleado,
      e.cargo, e.departamento, m.tipo, m.metodo, m.timestamp
    FROM marcajes m
    JOIN empleados e ON e.id = m.empleado_id
    WHERE DATE(m.timestamp) BETWEEN ? AND ? AND e.activo = TRUE
    ORDER BY m.timestamp ASC
  `, [fechaInicio, fechaFin]);

  const csvRows = rows.map(r => ({
    'Fecha': fmtDate(r.fecha),
    'Empleado': r.empleado,
    'Cargo': r.cargo || '',
    'Departamento': r.departamento || '',
    'Tipo': tipoLabel[r.tipo],
    'Hora': fmtTime(r.timestamp),
    'Método': metodosLabel[r.metodo],
    'Fecha y hora': fmtDateTime(r.timestamp),
  }));

  streamCSV(res, `reporte_${fechaInicio}_al_${fechaFin}.csv`, csvRows);
}

async function reporteEmpleado(res, empleadoId, fechaInicio, fechaFin) {
  const [[empleado]] = await db.query(
    'SELECT nombre, apellido, cargo, departamento FROM empleados WHERE id = ?',
    [empleadoId]
  );
  if (!empleado) return res.status(404).json({ success: false, message: 'Empleado no encontrado' });

  const [rows] = await db.query(`
    SELECT DATE(m.timestamp) AS fecha,
      MAX(CASE WHEN m.tipo = 'entrada' THEN m.timestamp END) AS entrada,
      MAX(CASE WHEN m.tipo = 'salida'  THEN m.timestamp END) AS salida,
      MAX(CASE WHEN m.tipo = 'entrada' THEN m.metodo END)    AS metodo,
      TIMESTAMPDIFF(MINUTE,
        MAX(CASE WHEN m.tipo = 'entrada' THEN m.timestamp END),
        MAX(CASE WHEN m.tipo = 'salida'  THEN m.timestamp END)
      ) AS minutos
    FROM marcajes m
    WHERE m.empleado_id = ? AND DATE(m.timestamp) BETWEEN ? AND ?
    GROUP BY DATE(m.timestamp)
    ORDER BY fecha ASC
  `, [empleadoId, fechaInicio, fechaFin]);

  const totalMinutos = rows.reduce((acc, r) => acc + (r.minutos || 0), 0);
  const csvRows = rows.map(r => ({
    'Empleado': `${empleado.nombre} ${empleado.apellido}`,
    'Cargo': empleado.cargo || '',
    'Departamento': empleado.departamento || '',
    'Fecha': fmtDate(r.fecha),
    'Entrada': fmtTime(r.entrada),
    'Salida': fmtTime(r.salida),
    'Método': metodosLabel[r.metodo] || '',
    'Horas trabajadas': r.minutos
      ? `${Math.floor(r.minutos / 60)}h ${r.minutos % 60}m` : '',
    'Estado': !r.entrada ? 'Ausente' : !r.salida ? 'Sin salida' : 'Completo',
  }));

  csvRows.push({
    'Empleado': '', 'Cargo': '', 'Departamento': '',
    'Fecha': 'TOTAL', 'Entrada': '', 'Salida': '', 'Método': '',
    'Horas trabajadas': `${Math.floor(totalMinutos / 60)}h ${totalMinutos % 60}m`,
    'Estado': `${rows.length} días`,
  });

  const nombre = `${empleado.nombre}_${empleado.apellido}`.replace(/\s/g, '_');
  streamCSV(res, `empleado_${nombre}_${fechaInicio}_al_${fechaFin}.csv`, csvRows);
}

async function reporteMensual(res, anio, mes) {
  const mesStr = String(mes).padStart(2, '0');
  const primerDia = `${anio}-${mesStr}-01`;
  const ultimoDia = dayjs(primerDia).endOf('month').format('YYYY-MM-DD');
  const diasHabiles = 22;

  const [rows] = await db.query(`
    SELECT CONCAT(e.nombre, ' ', e.apellido) AS empleado,
      e.cargo, e.departamento,
      COUNT(DISTINCT DATE(CASE WHEN m.tipo = 'entrada' THEN m.timestamp END)) AS dias_presentes,
      SUM(TIMESTAMPDIFF(MINUTE,
        (SELECT MIN(m2.timestamp) FROM marcajes m2
         WHERE m2.empleado_id = e.id AND m2.tipo = 'entrada' AND DATE(m2.timestamp) = DATE(m.timestamp)),
        (SELECT MAX(m3.timestamp) FROM marcajes m3
         WHERE m3.empleado_id = e.id AND m3.tipo = 'salida' AND DATE(m3.timestamp) = DATE(m.timestamp))
      )) AS total_minutos
    FROM empleados e
    LEFT JOIN marcajes m ON m.empleado_id = e.id AND DATE(m.timestamp) BETWEEN ? AND ?
    WHERE e.activo = TRUE
    GROUP BY e.id
    ORDER BY e.departamento, e.apellido
  `, [primerDia, ultimoDia]);

  const csvRows = rows.map(r => {
    const horas = Math.floor((r.total_minutos || 0) / 60);
    const minutos = (r.total_minutos || 0) % 60;
    const pct = r.dias_presentes ? Math.round((r.dias_presentes / diasHabiles) * 100) : 0;
    return {
      'Empleado': r.empleado,
      'Cargo': r.cargo || '',
      'Departamento': r.departamento || '',
      'Mes': `${mesStr}/${anio}`,
      'Días presentes': r.dias_presentes || 0,
      'Días hábiles': diasHabiles,
      '% Asistencia': `${pct}%`,
      'Total horas': `${horas}h ${minutos}m`,
    };
  });

  streamCSV(res, `resumen_mensual_${anio}_${mesStr}.csv`, csvRows);
}

module.exports = { reporteDia, reporteRango, reporteEmpleado, reporteMensual };