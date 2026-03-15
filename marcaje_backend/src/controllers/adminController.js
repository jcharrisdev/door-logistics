const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const dayjs = require('dayjs');

// POST /api/admin/login-pin
exports.loginPin = async (req, res) => {
  try {
    const { pin } = req.body;
    const [[admin]] = await db.query(
      'SELECT * FROM usuarios_admin WHERE activo = TRUE LIMIT 1'
    );
    if (!admin) return res.status(404).json({ success: false, message: 'Admin no encontrado' });

    const pinOk = await bcrypt.compare(pin, admin.pin_hash);
    if (!pinOk) return res.status(401).json({ success: false, message: 'PIN incorrecto' });

    const token = jwt.sign(
      { id: admin.id, email: admin.email, rol: admin.rol, nombre: admin.nombre },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({ success: true, token, user: { nombre: admin.nombre, rol: admin.rol } });
  } catch (err) {
    console.error('loginPin error:', err);
    res.status(500).json({ success: false, message: 'Error en el servidor' });
  }
};

// GET /api/admin/dashboard
exports.dashboard = async (req, res) => {
  try {
    const hoy = dayjs().format('YYYY-MM-DD');
    const [[totales]] = await db.query(`
      SELECT
        COUNT(DISTINCT e.id) AS total_empleados,
        COUNT(DISTINCT CASE WHEN m.tipo = 'entrada' THEN m.empleado_id END) AS presentes,
        COUNT(DISTINCT CASE WHEN m.tipo = 'salida_dia' THEN m.empleado_id END) AS salieron,
        COUNT(DISTINCT CASE WHEN m.id IS NULL THEN e.id END) AS ausentes
      FROM empleados e
      LEFT JOIN marcajes m ON m.empleado_id = e.id AND DATE(m.timestamp) = ?
      WHERE e.activo = TRUE
    `, [hoy]);

    const [asistencia] = await db.query(`
      SELECT
        e.id, e.numero_id,
        CONCAT(e.nombre, ' ', e.apellido) AS nombre,
        e.cargo, e.departamento,
        MAX(CASE WHEN m.tipo = 'entrada'          THEN m.timestamp END) AS entrada,
        MAX(CASE WHEN m.tipo = 'salida_almuerzo'  THEN m.timestamp END) AS salida_almuerzo,
        MAX(CASE WHEN m.tipo = 'regreso_almuerzo' THEN m.timestamp END) AS regreso_almuerzo,
        MAX(CASE WHEN m.tipo = 'salida_dia'       THEN m.timestamp END) AS salida_dia,
        COUNT(m.id) AS total_marcajes
      FROM empleados e
      LEFT JOIN marcajes m ON m.empleado_id = e.id AND DATE(m.timestamp) = ?
      WHERE e.activo = TRUE
      GROUP BY e.id
      ORDER BY e.departamento, e.apellido
    `, [hoy]);

    res.json({ success: true, fecha: hoy, totales, asistencia });
  } catch (err) {
    console.error('dashboard error:', err);
    res.status(500).json({ success: false, message: 'Error obteniendo dashboard' });
  }
};

// GET /api/admin/empleados
exports.listarEmpleados = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT id, nombre, apellido, email, cargo, departamento,
             numero_id, tipo_id, activo, creado_en
      FROM empleados ORDER BY apellido, nombre
    `);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error listando empleados' });
  }
};

// POST /api/admin/empleados
exports.crearEmpleado = async (req, res) => {
  try {
    const { nombre, apellido, email, cargo, departamento, numeroId, tipoId, pin } = req.body;
    if (!nombre || !apellido || !numeroId || !pin) {
      return res.status(400).json({ success: false, message: 'Faltan campos requeridos' });
    }
    const pinHash = await bcrypt.hash(pin, 10);
    const qrToken = `QR-${numeroId}-${Date.now()}`;
    await db.query(`
      INSERT INTO empleados (nombre, apellido, email, cargo, departamento, numero_id, tipo_id, pin_hash, qr_token)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [nombre, apellido, email || null, cargo || null, departamento || null,
        numeroId, tipoId || 'cedula', pinHash, qrToken]);
    res.json({ success: true, message: 'Empleado creado exitosamente' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ success: false, message: 'El número de ID ya existe' });
    }
    res.status(500).json({ success: false, message: 'Error creando empleado' });
  }
};

// PUT /api/admin/empleados/:id
exports.editarEmpleado = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, apellido, email, cargo, departamento, pin } = req.body;
    if (pin) {
      const pinHash = await bcrypt.hash(pin, 10);
      await db.query(`
        UPDATE empleados SET nombre=?, apellido=?, email=?, cargo=?, departamento=?, pin_hash=?
        WHERE id=?
      `, [nombre, apellido, email || null, cargo || null, departamento || null, pinHash, id]);
    } else {
      await db.query(`
        UPDATE empleados SET nombre=?, apellido=?, email=?, cargo=?, departamento=?
        WHERE id=?
      `, [nombre, apellido, email || null, cargo || null, departamento || null, id]);
    }
    res.json({ success: true, message: 'Empleado actualizado' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error actualizando empleado' });
  }
};

// PUT /api/admin/empleados/:id/toggle
exports.toggleEmpleado = async (req, res) => {
  try {
    const { id } = req.params;
    await db.query('UPDATE empleados SET activo = !activo WHERE id = ?', [id]);
    res.json({ success: true, message: 'Estado actualizado' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error actualizando estado' });
  }
};

// GET /api/admin/historial
exports.historial = async (req, res) => {
  try {
    const { inicio, fin, empleadoId } = req.query;
    const fechaInicio = inicio || dayjs().startOf('month').format('YYYY-MM-DD');
    const fechaFin = fin || dayjs().format('YYYY-MM-DD');

    let query = `
      SELECT m.id, CONCAT(e.nombre, ' ', e.apellido) AS nombre,
             e.cargo, e.departamento, e.numero_id,
             m.tipo, m.metodo, m.timestamp
      FROM marcajes m
      JOIN empleados e ON e.id = m.empleado_id
      WHERE DATE(m.timestamp) BETWEEN ? AND ?
    `;
    const params = [fechaInicio, fechaFin];

    if (empleadoId) { query += ' AND m.empleado_id = ?'; params.push(empleadoId); }
    query += ' ORDER BY m.timestamp DESC LIMIT 500';

    const [rows] = await db.query(query, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error obteniendo historial' });
  }
};