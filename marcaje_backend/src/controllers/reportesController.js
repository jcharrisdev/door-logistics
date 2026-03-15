const dayjs = require('dayjs');
const { reporteDia, reporteRango, reporteEmpleado, reporteMensual } = require('../services/csvService');

exports.exportarDia = async (req, res) => {
  try {
    const fecha = req.query.fecha || dayjs().format('YYYY-MM-DD');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return res.status(400).json({ success: false, message: 'Fecha inválida. Usa formato YYYY-MM-DD' });
    }
    await reporteDia(res, fecha);
  } catch (err) {
    console.error('exportarDia error:', err);
    res.status(500).json({ success: false, message: 'Error generando reporte' });
  }
};

exports.exportarRango = async (req, res) => {
  try {
    const { inicio, fin } = req.query;
    if (!inicio || !fin) {
      return res.status(400).json({ success: false, message: 'Parámetros inicio y fin requeridos' });
    }
    await reporteRango(res, inicio, fin);
  } catch (err) {
    console.error('exportarRango error:', err);
    res.status(500).json({ success: false, message: 'Error generando reporte' });
  }
};

exports.exportarEmpleado = async (req, res) => {
  try {
    const { id } = req.params;
    const inicio = req.query.inicio || dayjs().startOf('month').format('YYYY-MM-DD');
    const fin    = req.query.fin    || dayjs().format('YYYY-MM-DD');
    await reporteEmpleado(res, id, inicio, fin);
  } catch (err) {
    console.error('exportarEmpleado error:', err);
    res.status(500).json({ success: false, message: 'Error generando reporte' });
  }
};

exports.exportarMensual = async (req, res) => {
  try {
    const anio = parseInt(req.query.anio) || dayjs().year();
    const mes  = parseInt(req.query.mes)  || dayjs().month() + 1;
    if (mes < 1 || mes > 12) {
      return res.status(400).json({ success: false, message: 'Mes debe ser entre 1 y 12' });
    }
    await reporteMensual(res, anio, mes);
  } catch (err) {
    console.error('exportarMensual error:', err);
    res.status(500).json({ success: false, message: 'Error generando reporte' });
  }
};